import { getConsent, onConsentChange, type Consent } from "./consent";
import { isNative, nativePlatform } from "./native";
import { deferNonCritical } from "./idle";

// ── Product analytics (PostHog) + ad conversion pixels ──────────────────────
// Everything here is consent-gated and env-gated: with no keys, or without the
// matching consent, nothing loads. Adding a new ad network = one entry in
// AD_PIXELS below.
// PostHog is dynamically imported so marketing cold loads don't parse it upfront.

const env = import.meta.env;

type FunnelEvent =
  | "signup"
  | "login"
  | "email_verified"
  | "project_created"
  | "build_success"
  | "publish"
  | "view_content"
  | "checkout_started"
  | "paid"
  | "invite_accepted"
  | "auto_reload_toggled"
  | "auto_reload_manage_cards";

type PostHog = typeof import("posthog-js").default;

let posthog: PostHog | null = null;
let posthogReady = false;
let posthogInit: Promise<void> | null = null;
let pixelsLoaded = false;

function initPostHog() {
  if (posthogReady || !env.VITE_POSTHOG_KEY) return;
  if (posthogInit) return;

  posthogInit = import("posthog-js")
    .then((mod) => {
      const ph = mod.default;
      ph.init(env.VITE_POSTHOG_KEY as string, {
        api_host: (env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com",
        capture_pageview: true,
        autocapture: true,
        persistence: "localStorage+cookie",
        // PostHog's scroll-depth tracking reads `scrollHeight` on every scroll
        // event, anywhere on the page. In the chat that forced a style pass
        // over the whole document each time — 66–162ms per event on a
        // phone-speed CPU, the main cause of scroll jank on image-heavy chats.
        // All it bought was scroll depth on page-leave events, which nothing
        // here reads.
        disable_scroll_properties: true,
        // Prod/staging share *.mythex.ai — keep identity across apex hosts.
        ...(import.meta.env.PROD
          ? { cross_subdomain_cookie: true, cookie_domain: ".mythex.ai" }
          : {}),
      });
      // Every event from here on carries the shell it came from. Registered
      // rather than passed per-call because most of what PostHog collects is
      // autocapture and pageviews, which no call site of ours ever touches —
      // and an app session that looks identical to a browser session makes
      // retention, funnels and crash rates unsplittable after the fact.
      ph.register({
        platform: nativePlatform(),
        shell: isNative() ? "app" : "browser",
      });
      posthog = ph;
      posthogReady = true;
    })
    .catch(() => {
      posthogInit = null;
    });
}

// Each network loads its snippet once (marketing consent), then maps our funnel
// events onto its own conversion call. Missing env id → the network stays off.
interface AdPixel {
  id: string | undefined;
  load: (id: string) => void;
  track: (event: FunnelEvent, id: string, props?: Record<string, unknown>) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => window as any;

function inject(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function tiktokProductPayload(props?: Record<string, unknown>) {
  const isTopup = props?.kind === "topup";
  const packs = typeof props?.packs === "number" ? props.packs : 1;
  const contentId = isTopup ? `credit_topup_${packs}` : "pro_subscription";
  const value = isTopup ? packs * 15 : props?.interval === "year" ? 250 : 25;
  const eventId = typeof props?.eventId === "string" ? props.eventId : undefined;
  return {
    value,
    currency: "USD",
    contents: [{ content_id: contentId, content_type: "product" }],
    ...(eventId ? { event_id: eventId } : {}),
  };
}

const AD_PIXELS: Record<string, AdPixel> = {
  google: {
    id: env.VITE_GOOGLE_ADS_ID as string | undefined,
    load: (id) => {
      inject(`https://www.googletagmanager.com/gtag/js?id=${id}`);
      w().dataLayer = w().dataLayer || [];
      w().gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w().dataLayer.push(arguments);
      };
      w().gtag("js", new Date());
      w().gtag("config", id);
    },
    // Only fire labeled Google Ads conversions (e.g. Subscribe). Bare AW- id is not a conversion action.
    track: (event, id, props) => {
      const gtag = w().gtag;
      if (!gtag) return;
      if (event !== "paid" || props?.kind !== "subscription") return;
      const label = env.VITE_GOOGLE_ADS_SUBSCRIBE_LABEL as string | undefined;
      if (!label) return;
      const sendTo = label.includes("/") ? label : `${id}/${label}`;
      const value = props?.interval === "year" ? 250 : 25;
      gtag("event", "conversion", {
        send_to: sendTo,
        value,
        currency: "USD",
        ...(() => {
          const tid =
            typeof props?.eventId === "string"
              ? props.eventId
              : typeof props?.subscribeEventId === "string"
                ? props.subscribeEventId
                : typeof props?.purchaseEventId === "string"
                  ? props.purchaseEventId
                  : undefined;
          return tid ? { transaction_id: tid } : {};
        })(),
      });
    },
  },
  meta: {
    id: env.VITE_META_PIXEL_ID as string | undefined,
    load: (id) => {
      /* Meta Pixel bootstrap */
      const f = w();
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      inject("https://connect.facebook.net/en_US/fbevents.js");
      f.fbq("init", id);
      f.fbq("track", "PageView");
    },
    track: (event, _id, props) => {
      const fbq = w().fbq;
      if (!fbq) return;
      const eventID = typeof props?.eventId === "string" ? props.eventId : undefined;
      const eventOpts = eventID ? { eventID } : undefined;
      // Meta Sales campaigns need standard events (not trackCustom) in Events Manager.
      switch (event) {
        case "signup":
          fbq("track", "CompleteRegistration", {}, eventOpts);
          break;
        case "view_content":
          fbq(
            "track",
            "ViewContent",
            {
              content_ids: [props?.kind === "topup" ? `credit_topup_${typeof props?.packs === "number" ? props.packs : 1}` : "pro_subscription"],
              content_type: "product",
              content_category: props?.kind === "topup" ? "credit_topup" : "subscription",
            },
            eventOpts,
          );
          break;
        case "checkout_started":
          fbq(
            "track",
            "InitiateCheckout",
            {
              content_category: props?.kind === "topup" ? "credit_topup" : "subscription",
              value: props?.kind === "topup" ? (typeof props?.packs === "number" ? props.packs : 1) * 15 : props?.interval === "year" ? 250 : 25,
              currency: "USD",
            },
            eventOpts,
          );
          break;
        case "paid":
          // Server webhook always sends the CAPI copy of these events with a matching
          // eventID; without one here the browser event can't be deduplicated against it,
          // so skip firing rather than send an unpaired duplicate.
          if (props?.kind === "subscription") {
            const subscribeId =
              typeof props?.subscribeEventId === "string" ? props.subscribeEventId : eventID;
            const purchaseId =
              typeof props?.purchaseEventId === "string"
                ? props.purchaseEventId
                : subscribeId
                  ? String(subscribeId).replace(/^subscribe:/, "purchase:")
                  : undefined;
            if (subscribeId) fbq("track", "Subscribe", { value: 25, currency: "USD" }, { eventID: subscribeId });
            if (purchaseId) fbq("track", "Purchase", { value: 25, currency: "USD" }, { eventID: purchaseId });
          } else {
            const packs = typeof props?.packs === "number" ? props.packs : 1;
            const purchaseId =
              typeof props?.purchaseEventId === "string"
                ? props.purchaseEventId
                : typeof props?.completePaymentEventId === "string"
                  ? String(props.completePaymentEventId).replace(/^complete_payment:/, "purchase:")
                  : eventID;
            if (purchaseId) {
              fbq(
                "track",
                "Purchase",
                { value: packs * 15, currency: "USD" },
                { eventID: purchaseId },
              );
            }
          }
          break;
        default:
          fbq("trackCustom", event);
      }
    },
  },
  linkedin: {
    id: env.VITE_LINKEDIN_PARTNER_ID as string | undefined,
    load: (id) => {
      w()._linkedin_partner_id = id;
      w()._linkedin_data_partner_ids = w()._linkedin_data_partner_ids || [];
      w()._linkedin_data_partner_ids.push(id);
      inject("https://snap.licdn.com/li.lms-analytics/insight.min.js");
    },
    track: () => {
      /* LinkedIn conversions are configured server-side / in-platform */
    },
  },
  twitter: {
    id: env.VITE_TWITTER_PIXEL_ID as string | undefined,
    load: (id) => {
      const t: any = (w().twq = w().twq || function () {
        (w().twq.exe ? w().twq.exe.apply(w().twq, arguments) : w().twq.queue.push(arguments));
      });
      t.version = "1.1";
      t.queue = [];
      inject("https://static.ads-twitter.com/uwt.js");
      w().twq("config", id);
    },
    // Only fire labeled X conversion events (Purchase). Bare funnel names are not X Ads conversions.
    track: (event, _id, props) => {
      const twq = w().twq;
      if (!twq) return;
      if (event !== "paid" || props?.kind !== "subscription") return;
      const eventId = env.VITE_TWITTER_PURCHASE_EVENT_ID as string | undefined;
      if (!eventId) return;
      const value = props?.interval === "year" ? 250 : 25;
      const conversionId =
        typeof props?.purchaseEventId === "string"
          ? props.purchaseEventId
          : typeof props?.subscribeEventId === "string"
            ? props.subscribeEventId
            : typeof props?.eventId === "string"
              ? props.eventId
              : undefined;
      twq("event", eventId, {
        value,
        currency: "USD",
        ...(conversionId ? { conversion_id: conversionId } : {}),
      });
    },
  },
  tiktok: {
    id: env.VITE_TIKTOK_PIXEL_ID as string | undefined,
    load: (id) => {
      const f = w();
      if (f.__mythexTikTokLoaded) return;
      f.__mythexTikTokLoaded = true;
      const t = "ttq";
      f.TiktokAnalyticsObject = t;
      const ttq: any = (f[t] = f[t] || []);
      const methods = [
        "page",
        "track",
        "identify",
        "instances",
        "debug",
        "on",
        "off",
        "once",
        "ready",
        "alias",
        "group",
        "enableCookie",
        "disableCookie",
        "holdConsent",
        "revokeConsent",
        "grantConsent",
      ];
      ttq.setAndDefer = function setAndDefer(o: any, e: string) {
        o[e] = function ttqMethod() {
          o.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (let i = 0; i < methods.length; i++) ttq.setAndDefer(ttq, methods[i]);
      ttq.instance = function ttqInstance(i: string) {
        const e = ttq._i[i] || [];
        for (let n = 0; n < methods.length; n++) ttq.setAndDefer(e, methods[n]);
        return e;
      };
      ttq.load = function ttqLoad(e: string, n?: Record<string, unknown>) {
        const r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        const s = document.createElement("script");
        s.type = "text/javascript";
        s.async = true;
        s.src = `${r}?sdkid=${e}&lib=${t}`;
        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(s, first);
      };
      ttq.load(id);
      ttq.page();
    },
    track: (event, _id, props) => {
      const ttq = w().ttq;
      if (!ttq) return;
      switch (event) {
        case "signup":
          ttq.track("CompleteRegistration", {
            ...(typeof props?.eventId === "string" ? { event_id: props.eventId } : {}),
          });
          break;
        case "view_content":
          ttq.track("ViewContent", tiktokProductPayload(props));
          break;
        case "checkout_started":
          ttq.track("InitiateCheckout", tiktokProductPayload(props));
          break;
        case "paid": {
          if (props?.kind === "subscription") {
            const subscribeId =
              typeof props?.subscribeEventId === "string"
                ? props.subscribeEventId
                : typeof props?.eventId === "string"
                  ? props.eventId
                  : undefined;
            const purchaseId =
              typeof props?.purchaseEventId === "string"
                ? props.purchaseEventId
                : subscribeId
                  ? subscribeId.replace(/^subscribe:/, "purchase:")
                  : undefined;
            const base = tiktokProductPayload({ ...props, kind: "subscription" });
            ttq.track("Subscribe", { ...base, ...(subscribeId ? { event_id: subscribeId } : {}) });
            ttq.track("Purchase", { ...base, ...(purchaseId ? { event_id: purchaseId } : {}) });
          } else {
            const packs = typeof props?.packs === "number" ? props.packs : 1;
            const completeId =
              typeof props?.completePaymentEventId === "string"
                ? props.completePaymentEventId
                : typeof props?.eventId === "string"
                  ? props.eventId
                  : undefined;
            const purchaseId =
              typeof props?.purchaseEventId === "string"
                ? props.purchaseEventId
                : completeId
                  ? completeId.replace(/^complete_payment:/, "purchase:")
                  : undefined;
            const base = tiktokProductPayload({ ...props, packs });
            ttq.track("CompletePayment", { ...base, ...(completeId ? { event_id: completeId } : {}) });
            ttq.track("Purchase", { ...base, ...(purchaseId ? { event_id: purchaseId } : {}) });
          }
          break;
        }
        default:
          ttq.track(event);
      }
    },
  },
  // impact.com's Universal Tracking Tag. It gives a visitor who came from a
  // partner's link a click id, and Identify (impactIdentify, every page) records
  // the visit; the sale reaches impact.com from Stripe, which reads that id off
  // the subscription (see getImpactClickId), so no conversion is sent from here. VITE_IMPACT_UTT_URL is the script URL from impact.com
  // (Settings → Tracking → General).
  impact: {
    id: env.VITE_IMPACT_UTT_URL as string | undefined,
    load: (src) => {
      // impact.com's own loader: queue calls on `ire` until the script runs.
      const win = w();
      win.ire_o = "ire";
      win.ire =
        win.ire ||
        function ire() {
          // eslint-disable-next-line prefer-rest-params
          (win.ire.a = win.ire.a || []).push(arguments);
        };
      inject(src);
    },
    track: () => {},
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The impact.com click id of a visitor who came from a partner's link, for the
 * Stripe subscription's `impact_click_id` metadata — how impact.com credits the
 * partner when Stripe reports the payment. Undefined without the tag (not
 * configured, no marketing consent) or if it does not answer in time: checkout
 * never waits long for it.
 */
export function getImpactClickId(timeoutMs = 1500): Promise<string | undefined> {
  // The click id saved from the landing URL: the tag can't see it when the
  // visitor moved on before agreeing to marketing cookies (see captureImpactRef).
  const saved = getConsent()?.marketing ? readImpactRef() : undefined;
  const ire = w().ire as ((...args: unknown[]) => void) | undefined;
  if (typeof ire !== "function") return Promise.resolve(saved);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(saved), timeoutMs);
    try {
      ire("generateClickId", (clickId: unknown) => {
        clearTimeout(timer);
        resolve(typeof clickId === "string" && clickId.trim() ? clickId.trim() : saved);
      });
    } catch {
      clearTimeout(timer);
      resolve(saved);
    }
  });
}

// ── impact.com: click id from the landing URL, and Identify on every page ───
//
// A partner's link lands with `?im_ref=<click id>`. The tag only loads after
// marketing consent, and a visitor who browses first loses the parameter on the
// next page (impact.com's plan, Appendix 1: capture and store it). Before
// consent it waits in this tab's sessionStorage and goes nowhere; with consent
// it moves to a first-party cookie for the referral window; declined, it is
// dropped.
const IMPACT_REF = "mythex_im_ref";
const IMPACT_REF_DAYS = 30;

function impactCookieDomain(): string {
  return import.meta.env.PROD && location.hostname.endsWith("mythex.ai") ? "; domain=.mythex.ai" : "";
}

function readImpactRef(): string | undefined {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${IMPACT_REF}=([^;]*)`));
    if (m?.[1]) return decodeURIComponent(m[1]);
    return sessionStorage.getItem(IMPACT_REF) || undefined;
  } catch {
    return undefined;
  }
}

function saveImpactRefCookie(ref: string) {
  try {
    document.cookie = `${IMPACT_REF}=${encodeURIComponent(ref)}; max-age=${IMPACT_REF_DAYS * 86400}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}${impactCookieDomain()}`;
  } catch {
    // ignore
  }
}

function clearImpactRef() {
  try {
    sessionStorage.removeItem(IMPACT_REF);
    document.cookie = `${IMPACT_REF}=; max-age=0; path=/${impactCookieDomain()}`;
  } catch {
    // ignore
  }
}

/** Keep `im_ref` from the landing URL (exported for tests). */
export function captureImpactRef(search = window.location.search) {
  if (!AD_PIXELS.impact.id) return;
  let ref: string | null = null;
  try {
    ref = new URLSearchParams(search).get("im_ref");
  } catch {
    return;
  }
  ref = ref?.trim().slice(0, 512) || null;
  if (!ref) return;
  const consent = getConsent();
  if (consent && !consent.marketing) return;
  try {
    sessionStorage.setItem(IMPACT_REF, ref);
  } catch {
    // ignore
  }
  if (consent?.marketing) saveImpactRefCookie(ref);
}

function applyImpactConsent(consent: Consent | null) {
  if (!AD_PIXELS.impact.id || !consent) return;
  if (!consent.marketing) {
    clearImpactRef();
    return;
  }
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(IMPACT_REF);
  } catch {
    // ignore
  }
  if (pending) saveImpactRefCookie(pending);
}

let impactUser: { id: string; email: string } | null = null;
let impactEmailHash: { email: string; hash: Promise<string> } | null = null;

async function sha1Hex(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/** The signed-in account for impact.com's Identify call (null when signed out). */
export function setImpactIdentity(user: { id: string; email: string } | null) {
  const changed = user?.id !== impactUser?.id || user?.email !== impactUser?.email;
  impactUser = user ? { id: user.id, email: user.email } : null;
  if (changed) impactIdentify();
}

/**
 * impact.com's Identify function — their plan requires it on every page (it is
 * what records the referral visit). The account id and a SHA-1 of the
 * lowercased email when signed in; empty strings otherwise, as they ask.
 */
export function impactIdentify() {
  if (!AD_PIXELS.impact.id || !pixelsLoaded) return;
  const ire = w().ire as ((...args: unknown[]) => void) | undefined;
  if (typeof ire !== "function") return;
  const user = impactUser;
  const send = (customerId: string, customerEmail: string) => {
    try {
      ire("identify", { customerId, customerEmail });
    } catch {
      // a broken tag must never break the app
    }
  };
  if (!user) {
    send("", "");
    return;
  }
  const email = user.email.trim().toLowerCase();
  if (impactEmailHash?.email !== email) impactEmailHash = { email, hash: sha1Hex(email) };
  void impactEmailHash.hash.then((hash) => {
    if (impactUser?.id === user.id) send(user.id, hash);
  });
}

function loadPixels() {
  if (pixelsLoaded) return;
  for (const pixel of Object.values(AD_PIXELS)) {
    if (pixel.id) {
      try {
        pixel.load(pixel.id);
      } catch {
        // a broken pixel must never break the app
      }
    }
  }
  pixelsLoaded = true;
}

function applyConsent(consent: Consent | null) {
  if (consent?.analytics) initPostHog();
  applyImpactConsent(consent);
  if (consent?.marketing && !pixelsLoaded) {
    loadPixels();
    impactIdentify();
  }
  // Intercom is booted from auth (with identity hash) — not here.
  // Booting anonymously first causes ping 403 when Identity Verification is enforced.
}

/** Read Meta `_fbc` / `_fbp` (or build `fbc` from `fbclid`) for CAPI match quality. */
export function getMetaClickIds(): { fbc?: string; fbp?: string } {
  if (typeof document === "undefined") return {};
  const readCookie = (name: string) => {
    const parts = document.cookie.split(";");
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      if (part.slice(0, idx).trim() !== name) continue;
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return undefined;
  };

  let fbc = readCookie("_fbc");
  const fbp = readCookie("_fbp");
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (fbclid) sessionStorage.setItem("mythex_fbclid", fbclid);
    if (!fbc) {
      const stored = fbclid || sessionStorage.getItem("mythex_fbclid");
      if (stored) fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${stored}`;
    }
  } catch {
    // ignore storage / URL errors
  }
  return {
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
  };
}

/** Call once at startup. Initializes trackers according to stored consent. */
export function initAnalytics() {
  // Now, not on idle: a redirect on the first route can drop the query string.
  captureImpactRef();
  deferNonCritical(() => {
    try {
      const fbclid = new URLSearchParams(window.location.search).get("fbclid");
      if (fbclid) sessionStorage.setItem("mythex_fbclid", fbclid);
    } catch {
      // ignore
    }
    applyConsent(getConsent());
    consumeAuthAnalyticsParams();
  });
  onConsentChange((consent) => applyConsent(consent));
}

/** Track a funnel event to PostHog and every enabled ad pixel. */
export function track(event: FunnelEvent, props?: Record<string, unknown>) {
  if (posthogReady && posthog) posthog.capture(event, props);
  const consent = getConsent();
  if (consent?.marketing) {
    for (const pixel of Object.values(AD_PIXELS)) {
      if (pixel.id) {
        try {
          pixel.track(event, pixel.id, props);
        } catch {
          // ignore pixel errors
        }
      }
    }
  }
}

/**
 * A product event that is ours alone — PostHog, never the ad pixels.
 *
 * `track` forwards everything to every enabled ad network, which is right for
 * a funnel step and wrong for everything else: app opens and backgrounds are
 * not conversions, and sending them would both pollute the networks'
 * optimisation and pay to report a foreground. Nothing here is consent-gated
 * beyond PostHog's own gate, because PostHog is the only place it goes.
 */
export function trackAppEvent(event: string, props?: Record<string, unknown>) {
  if (posthogReady && posthog) {
    posthog.capture(event, props);
    return;
  }
  // The first app_opened of a cold start is emitted by the native shell, which
  // boots well before PostHog finishes loading on an idle callback — dropping
  // it here would lose precisely the event that cold starts are counted from.
  // Same shape as identify(): ensure PostHog, then replay once it is up.
  if (getConsent()?.analytics && env.VITE_POSTHOG_KEY) {
    initPostHog();
    void posthogInit?.then(() => {
      posthog?.capture(event, props);
    });
  }
}

/** Associate subsequent events with a signed-in user (PostHog only). */
export function identify(userId: string, props?: Record<string, unknown>) {
  if (posthogReady && posthog) {
    posthog.identify(userId, props);
    return;
  }
  // Identity can arrive before idle init finishes — ensure PostHog then identify.
  if (getConsent()?.analytics && env.VITE_POSTHOG_KEY) {
    initPostHog();
    void posthogInit?.then(() => {
      posthog?.identify(userId, props);
    });
  }
}

/**
 * Consume one-shot auth query flags from OAuth redirects (e.g. ?auth=google&signup=1)
 * and fire the matching funnel events, then strip them from the URL.
 */
export function consumeAuthAnalyticsParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const auth = url.searchParams.get("auth");
  const signup = url.searchParams.get("signup");
  const login = url.searchParams.get("login");
  if (!auth && !signup && !login) return;

  if (signup === "1") track("signup", { method: auth === "google" ? "google" : "oauth" });
  else if (login === "1") track("login", { method: auth === "google" ? "google" : "oauth" });

  url.searchParams.delete("auth");
  url.searchParams.delete("signup");
  url.searchParams.delete("login");
  const qs = url.searchParams.toString();
  window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
}
