import { useCallback, useEffect, useState } from "react";
import type { CdvPurchase } from "capacitor-plugin-cdv-purchase";
import { api, ApiError } from "./api";
import { inAppStore } from "./native";

/**
 * Buying plans and credits inside the iPhone and Android apps.
 *
 * The billing page is the website's; only what its buttons do changes here.
 * Each purchase goes through the phone's store (Apple's or Google's sheet),
 * then to our server, which checks it with the store and puts the plan or
 * credits on the account (apps/api/src/routes/store-billing.ts). Prices are
 * the store's, in the buyer's currency — never ours.
 *
 * The store library is capacitor-plugin-cdv-purchase (StoreKit 2 on iPhone,
 * Play Billing on Android). Every plan is in one group, so a change of plan
 * replaces the current subscription — on iPhone by Apple's subscription group,
 * on Android by the library naming the subscription it replaces — instead of
 * starting a second one. A purchase is finished (Apple) or acknowledged
 * (Google) only after our server has it: one the server never saw is refunded
 * by the store rather than kept.
 */

type Interval = "month" | "year";
type CatalogSub = { plan: "PRO" | "BUSINESS" | "ENTERPRISE"; tier: number; interval: Interval; productId: string; basePlanId?: string };
type CatalogPack = { packs: number; credits: number; productId: string };
type Catalog = {
  subscriptions: CatalogSub[];
  credits: CatalogPack[];
  accountToken: string;
  /** Where the current plan is paid: "website" blocks a second subscription in the app. */
  billedBy: "apple" | "google" | "website" | null;
  /** The plan bought in this store, if any: a change of plan is priced against it. */
  storeSubscription: { productId: string; plan: string; planCredits: number; interval: Interval; purchaseToken?: string } | null;
};

/** What our server made of a purchase (routes/store-billing.ts). */
type Reported =
  | { kind: "subscription"; change: "started" | "renewed" | "updated" | "ended" | "none"; grantedCredits: number }
  | { kind: "credits"; credits: number; granted: boolean };

export type PurchaseOutcome =
  | { status: "bought"; result: Reported }
  /** A smaller plan on Android: Google starts it at renewal, nothing changes now. */
  | { status: "scheduled" }
  /** The store took the payment, but our server hasn't confirmed it (yet): its notification or Restore brings it. */
  | { status: "unconfirmed" }
  /** This phone's Apple or Google account already pays for Mythex on another Mythex account. */
  | { status: "other_account" }
  | { status: "cancelled" | "pending" | "failed" };

const subKey = (plan: string, tier: number, interval: Interval) => `${plan}:${tier}:${interval}`;
const GROUP = "plans";
/** How long a purchase the store approved may take to reach our server before the app says it couldn't confirm it. */
const REPORT_TIMEOUT_MS = 45_000;

type Lib = typeof import("capacitor-plugin-cdv-purchase");

/**
 * One store per app run, set up on the first visit to the billing page. Its
 * handlers outlive the page: a purchase approved while the page is closed (a
 * renewal Apple re-delivers at launch, a slow Google payment) still reaches
 * the server.
 */
const session = {
  lib: null as Promise<Lib> | null,
  accountToken: "",
  packIds: new Set<string>(),
  /** Purchases the page is waiting on, by product id. */
  waiting: new Map<string, (r: Reported | Error | "pending") => void>(),
  /** Set while restoring: approved purchases are left to the restore, which sends them all. */
  restoring: false,
  /** The page's price refresh, for products the store loads after it's ready. */
  onProducts: null as (() => void) | null,
};

function setUp(store: "apple" | "google", catalog: Catalog): Promise<Lib> {
  session.accountToken = catalog.accountToken;
  if (session.lib) return session.lib;
  session.lib = (async () => {
    const lib = await import("capacitor-plugin-cdv-purchase");
    const { store: s, ProductType, Platform, LogLevel } = lib;
    const platform = store === "apple" ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
    s.verbosity = LogLevel.WARNING;
    // Our token is already a UUID, which both stores take as is: Apple's
    // appAccountToken, Google's obfuscatedAccountId. The server checks it.
    s.obfuscator = "disabled";
    s.applicationUsername = () => session.accountToken || undefined;
    for (const p of catalog.credits) session.packIds.add(p.productId);
    s.register([
      ...[...new Set(catalog.subscriptions.map((x) => x.productId))].map((id) => ({
        id,
        type: ProductType.PAID_SUBSCRIPTION,
        platform,
        group: GROUP,
      })),
      ...catalog.credits.map((p) => ({ id: p.productId, type: ProductType.CONSUMABLE, platform })),
    ]);
    s.when()
      .approved((tx) => void onApproved(store, tx))
      .pending((tx) => {
        for (const p of tx.products) session.waiting.get(p.id)?.("pending");
      })
      .productUpdated(() => session.onProducts?.());
    await s.initialize([platform]);
    // Anything bought but never confirmed (the app closed mid-purchase): now.
    void sendUnacknowledged(lib, store);
    return lib;
  })();
  session.lib.catch(() => {
    session.lib = null;
  });
  return session.lib;
}

/** Send one of the store's transactions to our server, then finish it. */
async function send(store: "apple" | "google", tx: CdvPurchase.Transaction, productId: string): Promise<Reported> {
  const kind = session.packIds.has(productId) ? "inapp" : "subs";
  let reported: Reported;
  if (store === "apple") {
    const jws = (tx as CdvPurchase.AppleAppStore.SKTransaction).jwsRepresentation;
    if (!jws) throw new Error("no_jws");
    reported = await api.post<Reported>("/v1/billing/store/apple", { jws });
  } else {
    const purchaseToken = (tx as CdvPurchase.GooglePlay.Transaction).nativePurchase?.purchaseToken;
    if (!purchaseToken) throw new Error("no_token");
    reported = await api.post<Reported>("/v1/billing/store/google", { productId, purchaseToken, kind });
  }
  // Google: the server has acknowledged or consumed it already; this marks it
  // done in the library too. Apple: only the phone can finish a transaction.
  await tx.finish().catch(() => {});
  return reported;
}

/**
 * Purchases the store holds that our server hasn't confirmed yet. The library
 * doesn't announce all of them as approved — Google's new token for a move down
 * at renewal, one left from an app closed mid-purchase — and Google refunds a
 * purchase nobody acknowledges within three days.
 */
async function sendUnacknowledged(lib: Lib, store: "apple" | "google"): Promise<void> {
  const { TransactionState } = lib.CdvPurchase;
  for (const tx of lib.store.localTransactions) {
    const id = tx.products[0]?.id;
    if (!id || tx.isAcknowledged || tx.isConsumed || tx.state !== TransactionState.APPROVED || session.waiting.has(id)) continue;
    await send(store, tx, id).catch(() => {});
  }
}

/** Subscriptions the store says this phone's Apple or Google account has now. */
function ownedSubscriptions(lib: Lib): CdvPurchase.Transaction[] {
  const { TransactionState } = lib.CdvPurchase;
  return lib.store.localTransactions.filter((tx) => {
    const id = tx.products[0]?.id;
    if (!id || session.packIds.has(id)) return false;
    if (tx.state !== TransactionState.APPROVED && tx.state !== TransactionState.FINISHED) return false;
    return !tx.expirationDate || tx.expirationDate.getTime() > Date.now();
  });
}

const isOtherAccount = (err: unknown) =>
  err instanceof ApiError && err.status === 409 && (err.body as { error?: string } | null)?.error === "other_account";

/** A purchase the store approved: to our server, and to the page waiting for it. */
async function onApproved(store: "apple" | "google", tx: CdvPurchase.Transaction): Promise<void> {
  const productId = tx.products[0]?.id;
  if (!productId || session.restoring) return;
  const waiter = session.waiting.get(productId);
  // StoreKit 2 re-reports everything owned at each launch; one already
  // finished is on the server already (Restore sends those).
  if (tx.isAcknowledged && !waiter) return;
  try {
    waiter?.(await send(store, tx, productId));
  } catch (err) {
    // Not finished: the store delivers it again at the next launch, and its
    // notification to our server brings the plan meanwhile.
    waiter?.(err instanceof Error ? err : new Error(String(err)));
  }
}

/** Start a purchase and wait for our server to have it. */
async function order(
  lib: Lib,
  offer: CdvPurchase.Offer,
  additionalData: CdvPurchase.AdditionalData | undefined,
  opts: { scheduled?: boolean },
): Promise<PurchaseOutcome> {
  const productId = offer.productId;
  let settle: (r: Reported | Error | "pending") => void = () => {};
  const reported = new Promise<Reported | Error | "pending">((resolve) => {
    settle = resolve;
  });
  session.waiting.set(productId, settle);
  try {
    const err = await offer.order(additionalData);
    if (err) {
      // Closing the sheet: the library's PAYMENT_CANCELLED, or on Android Play's
      // own USER_CANCELED (code "1"), which its Capacitor bridge passes through.
      const cancelled = Number(err.code) === lib.ErrorCode.PAYMENT_CANCELLED || /USER_CANCEL/i.test(err.message ?? "");
      return { status: cancelled ? "cancelled" : "failed" };
    }
    // A smaller plan starts at renewal. Google's new token keeps the current
    // plan until then, and still has to reach our server (which acknowledges
    // it); Apple has nothing new to send yet.
    if (opts.scheduled) {
      session.waiting.delete(productId);
      await new Promise((r) => setTimeout(r, 1500));
      await sendUnacknowledged(lib, offer.platform === lib.Platform.APPLE_APPSTORE ? "apple" : "google");
      return { status: "scheduled" };
    }
    const r = await Promise.race([reported, new Promise<Error>((res) => setTimeout(() => res(new Error("timeout")), REPORT_TIMEOUT_MS))]);
    if (r === "pending") return { status: "pending" };
    return r instanceof Error ? { status: "unconfirmed" } : { status: "bought", result: r };
  } finally {
    session.waiting.delete(productId);
  }
}

export type StoreBilling = {
  store: "apple" | "google";
  loading: boolean;
  billedBy: Catalog["billedBy"];
  /** The store's price for a plan, or null when it isn't sold in the app (a tier we don't offer there). */
  subPrice: (plan: string, tier: number, interval: Interval) => string | null;
  packPrice: (packs: number) => string | null;
  /** Tiers the app sells for a plan, monthly or yearly (no yearly above Apple's $1,000 ceiling). */
  tiers: (plan: string, interval?: Interval) => number[];
  buySubscription: (plan: "PRO" | "BUSINESS" | "ENTERPRISE", tier: number, interval: Interval) => Promise<PurchaseOutcome>;
  buyCredits: (packs: number) => Promise<PurchaseOutcome>;
  restore: () => Promise<{ sent: number; otherAccount: number; cancelled?: boolean }>;
  manage: () => Promise<void>;
};

/** The store, its products and prices, and what buying does — or null outside the app. */
export function useStoreBilling(): StoreBilling | null {
  const store = inAppStore();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lib, setLib] = useState<Lib | null>(null);
  const [prices, setPrices] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(Boolean(store));

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const c = await api.get<Catalog>(`/v1/billing/store/catalog?store=${store}`);
      setCatalog(c);
      const l = await setUp(store, c);
      setLib(l);
      session.onProducts = () => setPrices(storePrices(l, store, c));
      session.onProducts();
    } catch {
      // Left without prices: the buttons stay off rather than guess.
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!store) return null;
  const platform = () => (store === "apple" ? lib!.Platform.APPLE_APPSTORE : lib!.Platform.GOOGLE_PLAY);

  const finish = async (o: PurchaseOutcome): Promise<PurchaseOutcome> => {
    if (o.status === "bought" || o.status === "scheduled") await load();
    return o;
  };

  return {
    store,
    loading,
    billedBy: catalog?.billedBy ?? null,
    subPrice: (plan, tier, interval) => prices.get(subKey(plan, tier, interval)) ?? null,
    packPrice: (packs) => {
      const p = catalog?.credits.find((c) => c.packs === packs);
      return p ? (prices.get(p.productId) ?? null) : null;
    },
    tiers: (plan, interval) =>
      [...new Set(catalog?.subscriptions.filter((s) => s.plan === plan && (!interval || s.interval === interval)).map((s) => s.tier) ?? [])].sort(
        (a, b) => a - b,
      ),
    buySubscription: async (plan, tier, interval) => {
      const s = catalog?.subscriptions.find((x) => x.plan === plan && x.tier === tier && x.interval === interval);
      const offer = s && lib ? findOffer(lib, platform(), s) : undefined;
      if (!lib || !offer) return { status: "failed" };
      // A subscription this Apple/Google account already pays for belongs to one
      // Mythex account. Bought again from another, Apple would change that one
      // (and Google refuses): say so instead of opening the sheet.
      for (const tx of ownedSubscriptions(lib)) {
        try {
          await send(store, tx, tx.products[0].id);
        } catch (err) {
          if (isOtherAccount(err)) return { status: "other_account" };
        }
      }
      // Android, changing plan: priced against the current one, as Apple does
      // by itself. Dearer starts now, charged the difference; the same price
      // starts now at no charge; cheaper starts at renewal, as on the website.
      // (Google refuses "charge the difference" when there is none.)
      const cur = catalog?.storeSubscription;
      const curSub = cur && catalog?.subscriptions.find((x) => x.productId === cur.productId && x.interval === cur.interval);
      const curOffer = curSub ? findOffer(lib, platform(), curSub) : undefined;
      let additionalData: CdvPurchase.AdditionalData | undefined;
      let scheduled = false;
      if (curOffer) {
        const per = (o: CdvPurchase.Offer) => {
          const p = o.pricingPhases[0];
          return p ? p.priceMicros / (/P1Y/.test(p.billingPeriod ?? "") ? 12 : 1) : 0;
        };
        const diff = per(offer) - per(curOffer);
        // Cheaper starts at renewal. Apple does that by itself and makes no
        // transaction until then: waited for, the app sat 45s with the plans
        // locked and then said "Payment received" for a payment there wasn't
        // (seen on an iPhone).
        // Apple also waits for the renewal to move the same plan to another
        // billing period (yearly to monthly reads dearer by the month).
        const otherPeriod = store === "apple" && curSub && s && curSub.plan === s.plan && curSub.tier === s.tier && curSub.interval !== s.interval;
        scheduled = diff < 0 || Boolean(otherPeriod);
        if (store === "google") {
          const Mode = lib.CdvPurchase.GooglePlay.ReplacementMode;
          additionalData = {
            googlePlay: {
              replacementMode: diff > 0 ? Mode.CHARGE_PRORATED_PRICE : diff === 0 ? Mode.WITH_TIME_PRORATION : Mode.DEFERRED,
              // The subscription it replaces, as our server knows it. Left to the
              // library, which looks in the phone's own receipts, a plan that had
              // just moved down at renewal (a new token) wasn't found, and Google
              // started a second subscription beside it: two plans billed at once
              // (seen on Android, Pro 100 then Business 100).
              ...(cur?.purchaseToken ? { oldPurchaseToken: cur.purchaseToken } : {}),
            },
          };
        }
      }
      return finish(await order(lib, offer, additionalData, { scheduled }));
    },
    buyCredits: async (packs) => {
      const p = catalog?.credits.find((c) => c.packs === packs);
      const offer = p && lib ? lib.store.get(p.productId, platform())?.getOffer() : undefined;
      if (!lib || !offer) return { status: "failed" };
      return finish(await order(lib, offer, undefined, {}));
    },
    /** Send every purchase the store has for this phone's account to our server. Returns how many it took. */
    restore: async () => {
      if (!lib) return { sent: 0, otherAccount: 0 };
      session.restoring = true;
      try {
        // Turned down, it restored nothing: Apple's sign-in cancelled still said
        // "Restored 1 purchase." for the one the phone already knew about, and
        // then "Purchases aren't available" — the library reports a cancel and
        // a failure alike (code 0, "Restore purchases failed"; seen on an
        // iPhone), and the store says so itself when it really fails.
        const err = await lib.store.restorePurchases();
        if (err) return { sent: 0, otherAccount: 0, cancelled: true };
        // Everything the store says this account owns, sent again: the server
        // takes each once and refuses another account's.
        const { TransactionState } = lib.CdvPurchase;
        const owned = lib.store.localTransactions.filter(
          (tx) =>
            !tx.isConsumed && (tx.state === TransactionState.APPROVED || tx.state === TransactionState.FINISHED) && tx.products[0]?.id,
        );
        let sent = 0;
        let otherAccount = 0;
        for (const tx of owned) {
          try {
            await send(store, tx, tx.products[0].id);
            sent += 1;
          } catch (err) {
            // One the server refuses (another account's) doesn't stop the rest.
            if (isOtherAccount(err)) otherAccount += 1;
          }
        }
        return { sent, otherAccount };
      } finally {
        session.restoring = false;
        await load();
      }
    },
    manage: async () => {
      if (lib) await lib.store.manageSubscriptions(platform());
    },
  };
}

/** The offer for one of our plans: on Google a base plan of the product ("pro_100@monthly"). */
function findOffer(lib: Lib, platform: CdvPurchase.Platform, s: CatalogSub): CdvPurchase.Offer | undefined {
  const product = lib.store.get(s.productId, platform);
  if (!product) return undefined;
  return s.basePlanId ? product.getOffer(`${s.productId}@${s.basePlanId}`) : product.getOffer();
}

/** The store's own price strings ("$24.99", "AED 91.99"), keyed by plan:tier:interval and credit product id. */
function storePrices(lib: Lib, store: "apple" | "google", c: Catalog): Map<string, string> {
  const platform = store === "apple" ? lib.Platform.APPLE_APPSTORE : lib.Platform.GOOGLE_PLAY;
  const out = new Map<string, string>();
  for (const s of c.subscriptions) {
    const price = findOffer(lib, platform, s)?.pricingPhases[0]?.price;
    if (price) out.set(subKey(s.plan, s.tier, s.interval), price);
  }
  for (const p of c.credits) {
    const price = lib.store.get(p.productId, platform)?.getOffer()?.pricingPhases[0]?.price;
    if (price) out.set(p.productId, price);
  }
  return out;
}
