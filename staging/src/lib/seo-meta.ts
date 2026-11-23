/**
 * Pure route → meta (no DOM / React). Used by DocumentMeta and build prerender.
 */
import { messagesFor, type Messages } from "../i18n";
import { partnersView } from "../pages/marketing/solutions/impact-program";
import { enCreatorsUi } from "../i18n/solutions/en-creators-ui";
import { DEFAULT_LOCALE, LOCALES, isTranslatedPath, localizePath, splitLocale, type LocaleCode } from "../i18n/locales";
import {
  CATEGORY_LABELS,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "../pages/marketing/templates/types";
import { cachedL10nPage, l10nLangsFor, l10nPageMeta } from "../l10n/page";

/** Canonical production origin — used for absolute OG/canonical URLs. */
export const SITE_ORIGIN = "https://mythex.ai";
export const SITE_NAME = "Mythex";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og.png`;

export type PageMeta = {
  title: string;
  description: string;
  /** Absolute or path; defaults to current path under SITE_ORIGIN. */
  canonicalPath?: string;
  /** Indexable marketing pages only — app shells stay noindex. */
  robots?: string;
  ogType?: string;
  image?: string;
};

const DEFAULT: PageMeta = {
  title: "Mythex — AI App & Website Builder | Build Apps by Chatting",
  description:
    "Build web apps, websites, and Android & iPhone apps by chatting with AI. Live preview, real database, one-click publish — no coding needed.",
  robots: "index,follow",
  ogType: "website",
  image: DEFAULT_OG_IMAGE,
};

/** Route → meta. App / auth flows that shouldn't be indexed get noindex. */
const ROUTES: Array<{ test: (path: string) => boolean; meta: PageMeta }> = [
  {
    test: (p) => p === "/" || p === "/home",
    meta: {
      title: "Mythex — AI App & Website Builder | Build Apps by Chatting",
      description:
        "Build web apps, websites, and Android & iPhone apps by chatting with AI. Live preview, real database, one-click publish — no coding needed.",
      robots: "index,follow",
      // /home consolidates to apex
      canonicalPath: "/",
    },
  },
  {
    test: (p) => p === "/login",
    meta: {
      title: "Log in — Mythex",
      description: "Log in to Mythex to continue building apps by chatting with AI.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/signup",
    meta: {
      title: "Sign up — Mythex",
      description: "Create a free Mythex account and start building apps by chatting with AI.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/forgot-password",
    meta: {
      title: "Forgot password — Mythex",
      description: "Reset your Mythex account password.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/reset-password",
    meta: {
      title: "Reset password — Mythex",
      description: "Choose a new password for your Mythex account.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/verify-email",
    meta: {
      title: "Verify email — Mythex",
      description: "Verify your email to finish setting up your Mythex account.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/invite",
    meta: {
      title: "Accept invite — Mythex",
      description: "Accept your invitation to join a Mythex workspace.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/terms",
    meta: {
      title: "Terms of Service — Mythex",
      description: "The Mythex Terms of Service: the rules for using the AI app builder, your accounts and credits, what you own in the apps you build and publish, and our responsibilities.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/privacy",
    meta: {
      title: "Privacy Policy — Mythex",
      description: "How Mythex collects, uses and protects your personal data: what we store for your account and projects, who processes it, how long we keep it, and your rights.",
      robots: "index,follow",
    },
  },
  // /cookies page disabled for now — see App.tsx / pages/Legal.tsx.
  // {
  //   test: (p) => p === "/cookies",
  //   meta: {
  //     title: "Cookie Policy — Mythex",
  //     description: "Details on how Mythex uses cookies and similar technologies.",
  //     robots: "index,follow",
  //   },
  // },
  {
    test: (p) => p === "/acceptable-use",
    meta: {
      title: "Acceptable Use Policy — Mythex",
      description: "What you may and may not build or publish with Mythex and its AI agent: prohibited content, abuse of the platform and hosting, and what happens when rules are broken.",
      robots: "index,follow",
    },
  },
  {
    // The partner program is the creator program for now: its own words, so the head can't drift from the page.
    test: (p) => p === "/partners",
    meta: {
      title: partnersView(enCreatorsUi, "en").metaTitle,
      description: partnersView(enCreatorsUi, "en").metaDescription,
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/download",
    meta: {
      title: "Download the Mythex App for iPhone and Android",
      description:
        "Get the Mythex app on the App Store and Google Play. Build apps by chatting from your phone, get notified when they're ready, and publish without a computer.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/about",
    meta: {
      title: "About Mythex — AI App Builder",
      description:
        "Mythex is an AI app builder: describe an app and it writes the code, runs it with a live preview, attaches a database and publishes it to a public URL.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/pricing",
    meta: {
      title: "Pricing — Mythex",
      description:
        "Mythex pricing: start free with 5 credits a day, or go Pro for $25/mo ($20.83/mo billed yearly) with 100 credits a month plus 5 a day. One credit balance covers building and hosting.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/faq",
    meta: {
      title: "FAQ — Mythex",
      description:
        "Answers about Mythex: how credits and the free plan work, publishing and custom domains, who owns the code, databases and storage, and how it compares to other AI builders.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/use-cases",
    meta: {
      title: "Use cases — Mythex",
      description:
        "What people build with Mythex: MVPs for startups, internal tools for teams, client sites for agencies and booking or ordering apps for small businesses — with real examples.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p === "/templates",
    meta: {
      title: "Website and App Templates — Mythex",
      description:
        "Website and app templates — dashboards, stores, portfolios, booking sites and more. Open any one in Mythex, customize it by chatting with AI and publish it free.",
      robots: "index,follow",
    },
  },
  {
    test: (p) => p.startsWith("/dashboard"),
    meta: {
      title: "Projects — Mythex",
      description: "Your Mythex projects.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p.startsWith("/p/"),
    meta: {
      title: "Workspace — Mythex",
      description: "Mythex project workspace.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p === "/settings" || p.startsWith("/settings/"),
    meta: {
      title: "Settings — Mythex",
      description: "Your Mythex settings.",
      robots: "noindex,nofollow",
    },
  },
  {
    test: (p) => p.startsWith("/admin"),
    meta: {
      title: "Admin — Mythex",
      description: "Mythex admin.",
      robots: "noindex,nofollow",
    },
  },
];

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * Meta for any path, in any language. A page written out in the language gets
 * a translated title and its own canonical URL; any other page under a
 * language prefix is the English page with translated menus, so it points
 * search engines at the English original.
 */
export function metaForPath(pathname: string): PageMeta {
  const { locale, path } = splitLocale(normalizePath(pathname));
  const base = baseMetaForPath(path);
  if (locale === DEFAULT_LOCALE) return base;
  const canonicalBase = base.canonicalPath ?? path;
  // A page translated into this language (l10n/), not the English one.
  const translated = l10nMeta(localizePath(path, locale));
  if (translated) {
    return { ...base, ...translated, robots: "index,follow", canonicalPath: localizePath(path, locale) };
  }
  if (!isTranslatedPath(path)) return { ...base, canonicalPath: canonicalBase };
  const m = messagesFor(locale);
  const t = translatedMeta(path, m, locale);
  return {
    ...base,
    ...(t ?? {}),
    canonicalPath: localizePath(canonicalBase === "/home" ? "/" : canonicalBase, locale),
  };
}

function translatedMeta(path: string, m: Messages, locale: string): { title: string; description: string } | undefined {
  const p = path.replace(/\/+$/, "") || "/";
  const solution = solutionsMeta?.(p, locale);
  if (solution) return solution;
  if (p === "/" || p === "/home") return { title: m.meta.homeTitle, description: m.meta.homeDescription };
  if (p === "/pricing") return { title: m.meta.pricingTitle, description: m.meta.pricingDescription };
  if (p === "/faq") return { title: m.meta.faqTitle, description: m.meta.faqDescription };
  if (p === "/about") return { title: m.meta.aboutTitle, description: m.meta.aboutDescription };
  if (p === "/download") return { title: m.download.metaTitle, description: m.download.metaDescription };
  if (p === "/use-cases") return { title: m.meta.useCasesTitle, description: m.meta.useCasesDescription };
  if (p === "/guides") return { title: m.meta.guidesTitle, description: m.meta.guidesDescription };
  if (p === "/blog") return { title: m.meta.blogTitle, description: m.meta.blogDescription };
  const cat = p.match(/^\/(guides|blog)\/category\/([^/]+)$/);
  if (cat) {
    const key = `cat${cat[2]!.charAt(0).toUpperCase()}${cat[2]!.slice(1)}` as keyof Messages["content"];
    const label = m.content[key];
    const blurb = m.content[`${key}Blurb` as keyof Messages["content"]];
    if (typeof label === "string" && typeof blurb === "string") {
      return { title: `${label} | ${SITE_NAME}`, description: blurb };
    }
  }
  return undefined;
}

/**
 * hreflang alternates for a page that exists in every language: one per
 * language plus x-default (English). Empty for pages that are English-only.
 */
export function alternatesForPath(pathname: string): Array<{ hreflang: string; href: string }> {
  const { path } = splitLocale(normalizePath(pathname));
  const locales = isTranslatedPath(path) ? undefined : l10nLangs(path);
  if (locales) {
    // English plus the languages this page is translated into (l10n/).
    if (locales.length === 0) return [];
    return [
      { hreflang: "en", href: `${SITE_ORIGIN}${path}` },
      ...locales.map((code) => ({ hreflang: LOCALES.find((l) => l.code === code)!.tag, href: `${SITE_ORIGIN}${localizePath(path, code as LocaleCode)}` })),
      { hreflang: "x-default", href: `${SITE_ORIGIN}${path}` },
    ];
  }
  if (!isTranslatedPath(path)) return [];
  const base = path === "/home" ? "/" : path;
  const out = LOCALES.map((l) => ({ hreflang: l.tag, href: `${SITE_ORIGIN}${localizePath(base, l.code) === "/" ? "/" : localizePath(base, l.code)}` }));
  out.push({ hreflang: "x-default", href: `${SITE_ORIGIN}${base === "/" ? "/" : base}` });
  return out;
}

function baseMetaForPath(pathname: string): PageMeta {
  const path = normalizePath(pathname);

  const solution = solutionsMeta?.(path, "en");
  if (solution) return { ...DEFAULT, ...solution, robots: "index,follow", canonicalPath: path };

  const detail = path.match(/^\/templates\/([^/]+)\/([^/]+)$/);
  if (detail) {
    const resolved = marketingMeta?.(path);
    const noun = `${titleFromSlug(detail[2]!)} Template`;
    return {
      ...DEFAULT,
      title: resolved?.title ?? `${noun} — Build It with AI | ${SITE_NAME}`,
      description:
        resolved?.description ??
        `Build a ${noun.toLowerCase()} with AI in minutes. Start free, customize by chatting, and publish to a live URL.`,
      robots: "index,follow",
      canonicalPath: path,
    };
  }

  if (path === "/ai") {
    return {
      ...DEFAULT,
      title: "Build Anything with AI — App, Website & Tool Builders | Mythex",
      description:
        "AI app builder, website builder, booking app builder, CRM builder and more. Describe what you want, preview it live, and publish in one click.",
      robots: "index,follow",
      canonicalPath: path,
    };
  }

  // The /ai hubs by business and by app type (pages/marketing/templates/ai-hubs.ts).
  const aiHub = path.match(/^\/ai\/(industry|type)\/([^/]+)$/);
  if (aiHub) {
    const resolved = marketingMeta?.(path);
    return {
      ...DEFAULT,
      title: resolved?.title ?? `AI Builders: ${titleFromSlug(aiHub[2]!)} | ${SITE_NAME}`,
      description:
        resolved?.description ??
        "Every app Mythex builds for this, in one list. Describe what you want, preview it live, and publish in one click.",
      robots: resolved?.robots ?? "index,follow",
      canonicalPath: path,
    };
  }

  const ai = path.match(/^\/ai\/([^/]+)$/);
  if (ai) {
    const slug = ai[1]!;
    const resolved = marketingMeta?.(path);
    return {
      ...DEFAULT,
      title: resolved?.title ?? `${titleFromSlug(slug)} | ${SITE_NAME}`,
      description:
        resolved?.description ??
        "Describe what you want to build, watch it appear in a live preview, and publish it to a public URL. Start free.",
      robots: resolved?.robots ?? "index,follow",
      canonicalPath: path,
    };
  }

  if (path === "/compare" || path.startsWith("/compare/")) {
    const resolved = marketingMeta?.(path);
    const leaf = path.match(/^\/compare\/mythex-vs-([^/]+)$/);
    return {
      ...DEFAULT,
      title:
        resolved?.title ??
        (leaf
          ? `Mythex vs ${titleFromSlug(leaf[1]!)} | ${SITE_NAME}`
          : `Mythex Compared to Other AI Builders | ${SITE_NAME}`),
      description:
        resolved?.description ??
        "Honest comparisons between Mythex and the other AI app builders, including where each one is the better choice.",
      robots: "index,follow",
      canonicalPath: path,
    };
  }

  // /glossary and /tools (pages/marketing/glossary, pages/marketing/tools).
  // English only, like /compare. Once the resolver has loaded, a slug that is
  // not a term or a tool is a not-found page and says so.
  const section = path.match(/^\/(glossary|tools)(?:\/([^/]+))?$/);
  if (section) {
    const resolved = marketingMeta?.(path);
    if (resolved) return { ...DEFAULT, ...resolved, robots: resolved.robots ?? "index,follow", canonicalPath: path };
    if (!marketingMeta || !section[2]) {
      const hub = section[1] === "glossary" ? "AI App Building Glossary" : "Free AI App Building Tools";
      return {
        ...DEFAULT,
        title: section[2] ? `${titleFromSlug(section[2])} | ${SITE_NAME}` : `${hub} | ${SITE_NAME}`,
        robots: "index,follow",
        canonicalPath: path,
      };
    }
    return { ...DEFAULT, canonicalPath: path, robots: "noindex,nofollow" };
  }

  // The hub's title carries the template count, which only the catalogue knows.
  // Without the resolver the ROUTES entry below answers, minus the number.
  if (path === "/templates") {
    const resolved = marketingMeta?.(path);
    if (resolved) {
      return {
        ...DEFAULT,
        title: resolved.title,
        description: resolved.description,
        robots: "index,follow",
        canonicalPath: path,
      };
    }
  }

  const cat = path.match(/^\/templates\/([^/]+)$/);
  if (cat) {
    const category = cat[1]!;
    if ((TEMPLATE_CATEGORIES as readonly string[]).includes(category)) {
      const label = CATEGORY_LABELS[category as TemplateCategory];
      return {
        ...DEFAULT,
        title: `${label} Templates — Mythex`,
        description: `${label} templates you can open in Mythex and build on with AI: change anything by chatting, watch it in a live preview, and publish free to a public URL.`,
        robots: "index,follow",
        canonicalPath: path,
      };
    }
  }

  // /guides and /blog. Until the article list has loaded, a path is given an
  // indexable title from its slug; once it has, a slug that is not an article
  // is a not-found page and says so.
  if (/^\/(guides|blog)(\/|$)/.test(path)) {
    const resolved = contentMeta?.(path);
    if (resolved) {
      return {
        ...DEFAULT,
        title: resolved.title,
        description: resolved.description,
        ogType: resolved.ogType ?? "website",
        robots: "index,follow",
        canonicalPath: path,
      };
    }
    if (!contentMeta) {
      const leaf = path.split("/").pop()!;
      return {
        ...DEFAULT,
        title: `${titleFromSlug(leaf)} | ${SITE_NAME}`,
        robots: "index,follow",
        canonicalPath: path,
      };
    }
  }

  for (const route of ROUTES) {
    if (route.test(path)) {
      const canonicalPath = route.meta.canonicalPath ?? path;
      return { ...DEFAULT, ...route.meta, canonicalPath };
    }
  }
  return { ...DEFAULT, canonicalPath: path, robots: "noindex,nofollow" };
}

/**
 * Meta for the two big page sets — the 1,700 /ai pages and the template
 * catalogue — comes from a registered resolver rather than a static import.
 * Importing their copy here would put all of it in the entry bundle, which is
 * downloaded by everyone, including people who only ever open the workspace.
 * The marketing chunk registers the real resolver when it loads; prerender
 * registers it directly. Until then those paths still get an indexable title
 * built from the slug, which is close to the real one.
 */
export type MarketingMetaResolver = (
  path: string,
) => { title: string; description: string; robots?: string } | undefined;

let marketingMeta: MarketingMetaResolver | undefined;
const marketingMetaListeners = new Set<() => void>();

export function registerMarketingMeta(resolver: MarketingMetaResolver): void {
  marketingMeta = resolver;
  for (const listener of marketingMetaListeners) listener();
}

/**
 * Meta for /guides and /blog, from the article list. Its own slot: the
 * marketing resolver above belongs to the templates and /ai chunk, and a
 * visitor can land on either set first.
 */
export type ContentMetaResolver = (
  path: string,
) => { title: string; description: string; ogType?: string } | undefined;

let contentMeta: ContentMetaResolver | undefined;

/**
 * Meta for the Solutions pages, in a language, from their copy — which loads
 * with those pages (i18n/solutions), so it registers itself when it arrives.
 */
export type SolutionsMetaResolver = (path: string, locale: string) => { title: string; description: string } | undefined;

let solutionsMeta: SolutionsMetaResolver | undefined;

export function registerSolutionsMeta(resolver: SolutionsMetaResolver): void {
  solutionsMeta = resolver;
  for (const listener of marketingMetaListeners) listener();
}

/** Meta for /{lang}/ai/{slug}, from ai-local/{lang}.json once it has loaded. */
/**
 * Translated marketing pages (l10n/). In the browser the answers come from the
 * translation embedded in the page (src/l10n/page.ts); prerender registers
 * resolvers that know every translation on disk.
 */
export type L10nMetaResolver = (localizedPath: string) => { title: string; description: string } | undefined;
export type L10nLangsResolver = (englishPath: string) => string[] | undefined;

let l10nMetaResolver: L10nMetaResolver | undefined;
let l10nLangsResolver: L10nLangsResolver | undefined;

export function registerL10n(meta: L10nMetaResolver, langs: L10nLangsResolver): void {
  l10nMetaResolver = meta;
  l10nLangsResolver = langs;
}

function l10nMeta(localizedPath: string): { title: string; description: string } | undefined {
  if (l10nMetaResolver) return l10nMetaResolver(localizedPath);
  const page = cachedL10nPage(localizedPath);
  return page ? l10nPageMeta(page) : undefined;
}

function l10nLangs(englishPath: string): string[] | undefined {
  return l10nLangsResolver ? l10nLangsResolver(englishPath) : l10nLangsFor(englishPath);
}

export function registerContentMeta(resolver: ContentMetaResolver): void {
  contentMeta = resolver;
  for (const listener of marketingMetaListeners) listener();
}

/** Notifies when the resolver arrives, so a head rendered early can be redone. */
export function onMarketingMetaReady(listener: () => void): () => void {
  marketingMetaListeners.add(listener);
  return () => {
    marketingMetaListeners.delete(listener);
  };
}

/** "dental-clinic-booking-system-builder" → "Dental Clinic Booking System Builder". */
function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length <= 3 && w !== "app" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function canonicalUrlFor(meta: PageMeta, pathname: string): string {
  const path = meta.canonicalPath ?? normalizePath(pathname);
  return `${SITE_ORIGIN}${path === "/" ? "/" : path}`;
}
