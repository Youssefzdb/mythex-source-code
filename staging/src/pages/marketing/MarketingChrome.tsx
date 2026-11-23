import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MythexMark } from "../../components/mythex-mark";
import { DrawerIcon } from "../../components/ui/DrawerIcon";
import { chooseLocale } from "../../i18n/choose-locale";
import { peekSessionHint } from "../../lib/session-hint";
import { useI18n } from "../../i18n/useI18n";
import { t } from "../../i18n";
import { LOCALES, localeInfo, localizePath, type LocaleCode } from "../../i18n/locales";
import { useAuth } from "../../lib/auth";
import { MobileSolutions, SolutionsMenu } from "./solutions/SolutionsMenu";
import { openSupport } from "../../lib/support";
import { platformToOffer } from "../../components/GetAppBanner";
import { STORE_URL } from "../../lib/force-update";
import { usePageT } from "../../i18n/usePageT";

/**
 * Marketing header CTAs:
 * - size: h-8 px-2.5 py-1.5 text-sm rounded-2 (8px — NOT pill)
 * - Log in: transparent + inset rim oklch(1 0 0 / 0.25)
 * - Get started: bg oklch(100% 0 0 / 0.96), fg oklch(23.85% …)
 */
const BTN =
  "relative isolate inline-flex h-8 items-center justify-center gap-1 rounded-[8px] px-2.5 py-1.5 text-sm font-normal whitespace-nowrap select-none";

/** Sticky nav height — keep in sync with header `h-16`. */
export const MARKETING_NAV_OFFSET = 64;

/** The bar's opaque color, shared with the mobile sheet so the two read as one surface. */
const NAV_SURFACE = { dark: "bg-[#1c1c1c]", light: "bg-[hsl(0_0%_98%)]" } as const;

export const SECTION_IDS = new Set(["hero", "meet", "stats", "pricing", "faq"]);

/** Scroll so the section top sits just under the sticky nav (hero = page top). */
export function scrollToMarketingSection(id: string, behavior: ScrollBehavior = "smooth") {
  if (id === "hero") {
    window.scrollTo({ top: 0, behavior });
    return true;
  }
  const el = document.getElementById(id);
  if (!el) return false;
  const top = el.getBoundingClientRect().top + window.scrollY - MARKETING_NAV_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

type TopLink =
  | { label: string; hash: string; href?: undefined; to?: undefined }
  | { label: string; href: string; hash?: undefined; to?: undefined }
  | { label: string; to: string; hash?: undefined; href?: undefined };

const TOP_LINKS: readonly TopLink[] = [
  { label: "nav.howItWorks", hash: "meet" },
  { label: "nav.templates", to: "/templates" },
  { label: "nav.pricing", hash: "pricing" },
  { label: "nav.docs", href: "https://docs.mythex.ai" },
];

type FooterLink = {
  label: string;
  /** Shown as-is instead of a translated label. */
  text?: string;
  to?: string;
  href?: string;
  hash?: string;
  action?: "intercom";
};

const FOOTER: Record<string, readonly FooterLink[]> = {
  "footer.product": [
    { label: "nav.howItWorks", hash: "meet" },
    { label: "nav.templates", to: "/templates" },
    { label: "nav.whyMythex", hash: "stats" },
    { label: "nav.pricing", hash: "pricing" },
    { label: "footer.useCases", to: "/use-cases" },
    { label: "solutionsMenu.items.forWork.label", to: "/for-work" },
    { label: "footer.buildWithAi", to: "/ai" },
    { label: "footer.compare", to: "/compare" },
  ],
  // Links to the builder pages from every marketing page, the way Lovable's
  // footer links its /build pages. Without them the pages that target
  // "AI app builder" and the rest had almost no internal links.
  "footer.buildWithAi": [
    { label: "footer.aiAppBuilder", to: "/ai/builder" },
    { label: "footer.aiWebsiteBuilder", to: "/ai/website-builder" },
    { label: "footer.noCodeAppBuilder", to: "/ai/no-code-app-builder" },
    { label: "footer.aiMobileAppBuilder", to: "/ai/mobile-app-builder" },
    { label: "footer.clientPortalBuilder", to: "/ai/client-portal-builder" },
    { label: "footer.internalToolBuilder", to: "/ai/internal-tool-builder" },
    { label: "footer.aiCrmBuilder", to: "/ai/crm-builder" },
    { label: "footer.arabicAppBuilder", to: "/ai/arabic-app-builder" },
  ],
  "footer.resources": [
    { label: "footer.guides", to: "/guides" },
    { label: "footer.blog", to: "/blog" },
    { label: "footer.glossary", to: "/glossary" },
    { label: "footer.freeTools", to: "/tools" },
    { label: "nav.docs", href: "https://docs.mythex.ai" },
    { label: "footer.quickstart", href: "https://docs.mythex.ai/getting-started/quickstart" },
    { label: "footer.promptingTips", href: "https://docs.mythex.ai/prompting/effective-prompts" },
  ],
  "footer.getStartedHeading": [
    { label: "footer.signUp", to: "/signup" },
    { label: "footer.signIn", to: "/login" },
    { label: "nav.faq", to: "/faq" },
    { label: "footer.about", to: "/about" },
    { label: "download.footer", to: "/download" },
    { label: "solutionsMenu.partners.label", to: "/partners" },
    // { label: "solutionsMenu.students.label", to: "/students" }, — Students is off for now (2026-10-15); uncomment to bring it back.
  ],
  "footer.company": [
    { label: "footer.support", action: "intercom" },
    { label: "footer.privacy", to: "/privacy" },
    { label: "footer.terms", to: "/terms" },
    // { label: "Cookies", to: "/cookies" }, — page disabled for now
    { label: "footer.acceptableUse", to: "/acceptable-use" },
  ],
};

/** Official Mythex socials (comms platforms + live handles). */
/** The Mythex app's own store pages (the footer's store links). */
const STORE_LINKS = [
  {
    name: "App Store",
    top: "Download on the",
    label: "Mythex on the App Store",
    href: "https://apps.apple.com/app/id6823479848",
    paths: [{ d: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701", fill: "#fff" }],
  },
  {
    name: "Google Play",
    top: "GET IT ON",
    label: "Mythex on Google Play",
    href: "https://play.google.com/store/apps/details?id=ai.mythex.app",
    // Google Play's four colours, one per segment of the triangle.
    paths: [
      { d: "M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z", fill: "#4285F4" },
      { d: "M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z", fill: "#34A853" },
      { d: "M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z", fill: "#FBBC04" },
      { d: "M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z", fill: "#EA4335" },
    ],
  },
];

const SOCIALS = [
  { label: "X", href: "https://x.com/mythexai", icon: "x" as const },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mythexai", icon: "linkedin" as const },
  { label: "Instagram", href: "https://www.instagram.com/mythexai/", icon: "instagram" as const },
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61591986882564", icon: "facebook" as const },
  { label: "TikTok", href: "https://www.tiktok.com/@mythex.ai", icon: "tiktok" as const },
  { label: "YouTube", href: "https://www.youtube.com/@mythex-ai", icon: "youtube" as const },
] as const;

function SocialIcon({ icon }: { icon: (typeof SOCIALS)[number]["icon"] }) {
  const cls = "block h-[18px] w-[18px] shrink-0";
  if (icon === "linkedin") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );
  }
  if (icon === "instagram") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    );
  }
  if (icon === "facebook") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (icon === "youtube") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  if (icon === "x") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .56.04.82.12V9.01a6.27 6.27 0 0 0-.82-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  );
}

/**
 * The landing page in this language: /home in English (/ is the dashboard
 * once signed in), /{lang} elsewhere — /{lang}/home is the same page twice.
 */
function homeHref(lp: (to: string) => string): string {
  const to = lp("/home");
  return to === "/home" ? to : to.replace(/\/home$/, "");
}

function useGoToSection() {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  const location = useLocation();
  const navigate = useNavigate();

  return (hash: string, e?: MouseEvent) => {
    e?.preventDefault();
    const onMarketing = path === "/home" || path === "/";
    if (onMarketing && (hash === "hero" || document.getElementById(hash))) {
      const url =
        hash === "hero" ? location.pathname : `${location.pathname}#${hash}`;
      window.history.pushState(null, "", url);
      scrollToMarketingSection(hash);
      return;
    }
    navigate(hash === "hero" ? homeHref(lp) : `${homeHref(lp)}#${hash}`);
  };
}

function FooterNavLink({ link }: { link: FooterLink }) {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  const go = useGoToSection();
  const className = "inline-flex min-h-6 items-center text-sm text-[#b8b5b0] transition hover:text-white";
  if (link.action === "intercom") {
    return (
      <button type="button" data-testid="support-footer" onClick={() => openSupport()} className={className}>
        {link.text ?? t(m, link.label)}
      </button>
    );
  }
  if (link.href) {
    return (
      <a href={link.href} className={className}>
        {link.text ?? t(m, link.label)}
      </a>
    );
  }
  if (link.hash) {
    return (
      <a href={`${homeHref(lp)}#${link.hash}`} className={className} onClick={(e) => go(link.hash!, e)}>
        {link.text ?? t(m, link.label)}
      </a>
    );
  }
  return (
    <Link to={link.to ? lp(link.to) : homeHref(lp)} className={className}>
      {link.text ?? t(m, link.label)}
    </Link>
  );
}

function LoginButton({ light, onClick }: { light?: boolean; onClick?: () => void }) {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  const className = `${BTN} bg-transparent ${light ? "text-zinc-900" : "text-white"}`;
  const inner = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow: light
            ? "inset 0 0 0 1px oklch(0 0 0 / 0.25)"
            : "inset 0 0 0 1px oklch(1 0 0 / 0.25)",
        }}
      />
      <span className="relative z-10 px-0.5">{m.nav.logIn}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" id="login-link" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to="/login" id="login-link" className={className}>
      {inner}
    </Link>
  );
}

/** The filled button: black on a light page, white on a dark one. */
const solidBtn = (light?: boolean) =>
  light ? "bg-[oklch(0%_0_0/0.88)] text-[oklch(98.51%_0_89.88)]" : "bg-[oklch(100%_0_0/0.96)] text-[oklch(23.85%_0.004_106.68)]";

function GetStartedButton({
  light,
  onClick,
}: {
  light?: boolean;
  onClick?: () => void;
}) {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  return (
    <button
      type="button"
      id="signup-link"
      onClick={onClick}
      className={`${BTN} ${solidBtn(light)}`}
    >
      <span className="relative z-10 px-0.5">{m.nav.getStarted}</span>
    </button>
  );
}

function MobileNav({
  light,
  onGetStarted,
  onLogin,
  onClose,
}: {
  light?: boolean;
  onGetStarted?: () => void;
  onLogin?: () => void;
  onClose: () => void;
}) {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  const { user } = useAuth();
  const go = useGoToSection();
  const [appStore] = useState(platformToOffer);
  const pageT = usePageT();

  // The sheet owns the screen while it is open: the page behind it must not
  // scroll under the links.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const rowClass = `marketing-nav-row flex min-h-14 items-center px-2 text-[17px] ${
    light ? "text-zinc-900" : "text-white/90"
  }`;

  return (
    <div
      id="marketing-mobile-nav"
      className={`marketing-nav-enter fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-hidden lg:hidden ${
        light ? `${NAV_SURFACE.light} text-zinc-900` : `${NAV_SURFACE.dark} text-white`
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4">
        <MobileSolutions light={light} rowClass={rowClass} onNavigate={onClose} />
        {TOP_LINKS.map((l, i) => {
          const rowStyle = { "--row": i } as CSSProperties;
          if (l.to) {
            return (
              <Link
                key={l.to}
                to={lp(l.to)}
                className={rowClass}
                style={rowStyle}
                onClick={onClose}
              >
                {t(m, l.label)}
              </Link>
            );
          }
          if (l.href) {
            return (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={rowClass}
                style={rowStyle}
                onClick={onClose}
              >
                {t(m, l.label)}
              </a>
            );
          }
          return (
            <a
              key={l.hash}
              href={`${homeHref(lp)}#${l.hash}`}
              className={rowClass}
              style={rowStyle}
              onClick={(e) => {
                go(l.hash!, e);
                onClose();
              }}
            >
              {t(m, l.label)}
            </a>
          );
        })}
        {/* The app, in a phone's browser: the way back to it after the bar
            at the bottom (GetAppBanner) was closed. */}
        {appStore && (
          <a
            href={STORE_URL[appStore]}
            className={`${rowClass} gap-3`}
            style={{ "--row": TOP_LINKS.length } as CSSProperties}
            onClick={onClose}
          >
            <MythexMark size={24} className="rounded-[6px]" />
            {pageT.shell.getApp.title}
          </a>
        )}
      </div>
      <div
        className="marketing-nav-row flex shrink-0 gap-2 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        style={{ "--row": TOP_LINKS.length + 1 } as CSSProperties}
      >
        {user ? (
          <Link
            to="/"
            onClick={onClose}
            className={`${BTN} h-9 flex-1 ${solidBtn(light)}`}
          >
            {m.nav.openMythex}
          </Link>
        ) : (
          <>
            {onLogin ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogin();
                }}
                className={`${BTN} h-9 flex-1 border ${
                  light ? "border-black/25 text-zinc-900" : "border-white/25 text-white"
                }`}
              >
                {m.nav.logIn}
              </button>
            ) : (
              <Link
                to="/login"
                onClick={onClose}
                className={`${BTN} h-9 flex-1 border ${
                  light ? "border-black/25 text-zinc-900" : "border-white/25 text-white"
                }`}
              >
                {m.nav.logIn}
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onGetStarted?.();
              }}
              className={`${BTN} h-9 flex-1 ${solidBtn(light)}`}
            >
              {m.nav.getStarted}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Marketing nav:
 * sticky 64px overlay; transparent at top; on scroll → bg/75 + blur + muted inset line.
 * Scroll detection uses a 1px sentinel + IntersectionObserver.
 */
export function MarketingNav({
  onGetStarted,
  onLogin,
  light,
}: {
  onGetStarted?: () => void;
  onLogin?: () => void;
  light?: boolean;
}) {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const go = useGoToSection();

  useEffect(() => {
    setScrolled(window.scrollY > 0);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      root: null,
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Open on a phone, the bar drops its blur and its bottom rule: it is the top
  // of the sheet, not a separate strip over it.
  const chrome = mobileOpen
    ? `${light ? NAV_SURFACE.light : NAV_SURFACE.dark} shadow-none`
    : scrolled
      ? light
        ? "bg-[hsl(0_0%_98%)/75] shadow-[inset_0_-1px_0_0_hsl(0_0%_0%/0.08)] backdrop-blur-xl"
        : "bg-[#1c1c1c]/75 shadow-[inset_0_-1px_0_0_rgb(39,39,37)] backdrop-blur-xl"
      : "bg-transparent shadow-none";

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden
        data-navbar-sentinel
        className="-mb-px h-px"
      />
      <header
        className={`sticky top-0 z-50 transition-[background,box-shadow] duration-300 ${chrome}`}
        style={{ marginBottom: "-64px" }}
      >
        <div className="relative mx-auto flex h-16 w-full max-w-[80rem] items-center justify-between px-4 sm:px-8 lg:px-16 xl:px-20 2xl:max-w-[96rem] 2xl:px-24">
          <div className="flex min-w-0 items-center gap-8 lg:gap-10">
            <Link
              to={homeHref(lp)}
              aria-label={m.nav.goHome}
              className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-75"
              onClick={(e) => go("hero", e)}
            >
              <MythexMark size={28} className="h-7 w-7" />
              <span
                className={`text-[20px] font-semibold leading-none tracking-tight ${
                  light ? "text-zinc-900" : "text-white"
                }`}
              >
                Mythex
              </span>
            </Link>

            <nav
              className={`hidden items-center gap-6 lg:flex lg:gap-8 ${
                light ? "text-zinc-900" : "text-white"
              }`}
            >
              <SolutionsMenu
                light={light}
                className={`px-1 py-1 text-[15px]/[24px] transition-colors ${
                  light ? "text-zinc-900 hover:text-zinc-900/80" : "text-white hover:text-white/80"
                }`}
              />
              {TOP_LINKS.map((l) => {
                const linkClass = `px-1 py-1 text-[15px]/[24px] transition-colors ${
                  light
                    ? "text-zinc-900 hover:text-zinc-900/80"
                    : "text-white hover:text-white/80"
                }`;
                if (l.to) {
                  return (
                    <Link key={l.to} to={lp(l.to)} className={linkClass}>
                      {t(m, l.label)}
                    </Link>
                  );
                }
                if (l.href) {
                  return (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {t(m, l.label)}
                    </a>
                  );
                }
                return (
                  <a
                    key={l.hash}
                    href={`${homeHref(lp)}#${l.hash}`}
                    onClick={(e) => go(l.hash!, e)}
                    className={linkClass}
                  >
                    {t(m, l.label)}
                  </a>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <Link
                to="/"
                className={`${BTN} ${solidBtn(light)}`}
              >
                <span className="px-0.5">{m.nav.openMythex}</span>
              </Link>
            ) : (
              <>
                {/* Below the desktop nav the bar carries Get started alone; the
                    sheet is where Log in lives. */}
                <div className="hidden lg:block">
                  <LoginButton light={light} onClick={onLogin} />
                </div>
                <GetStartedButton light={light} onClick={onGetStarted} />
              </>
            )}
            <button
              type="button"
              id="mobile-nav-trigger"
              aria-label={m.nav.toggleMenu}
              aria-expanded={mobileOpen}
              aria-controls="marketing-mobile-nav"
              className={`grid min-h-11 min-w-11 place-items-center rounded-[8px] lg:hidden ${
                light ? "text-zinc-800 hover:bg-black/5" : "text-white hover:bg-white/10"
              }`}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span className="sr-only">{m.nav.menu}</span>
              {mobileOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                /* The drawer mark the app uses, so the same gesture wears the
                   same glyph on the marketing site and inside. */
                <DrawerIcon className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>

        </div>
      </header>

      {mobileOpen && (
        <MobileNav
          light={light}
          onGetStarted={onGetStarted}
          onLogin={onLogin}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

export function MarketingFooter() {
  const { m, lp, path } = useI18n();
  void m; void lp; void path;
  return (
    <div className="relative mx-auto w-full max-w-[80rem] px-4 sm:px-8 lg:px-10 xl:px-0 2xl:max-w-[96rem]">
      <footer
        className="relative rounded-2xl border p-6 sm:p-8 md:p-10 lg:p-14"
        style={{
          background: "rgb(39, 39, 37)",
          borderColor: "rgb(64, 64, 63)",
        }}
      >
        <nav className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col items-start gap-6 sm:col-span-3 lg:col-span-1">
            <Link
              to={homeHref(lp)}
              aria-label={m.footer.home}
              className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
              onClick={(e) => {
                const onMarketing =
                  path === "/home" || path === "/";
                if (!onMarketing) return;
                e.preventDefault();
                window.history.pushState(null, "", window.location.pathname);
                scrollToMarketingSection("hero");
              }}
            >
              <MythexMark size={32} className="size-8 shrink-0" />
              <span className="text-[20px] font-semibold leading-none tracking-tight text-white">
                Mythex
              </span>
            </Link>

            <div className="flex flex-wrap items-center gap-3">
            {SOCIALS.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="inline-flex size-5 items-center justify-center text-muted transition hover:text-white"
                >
                  <SocialIcon icon={s.icon} />
                </a>
              ))}
            </div>

            <LanguageSwitcher />

          </div>

          {Object.entries(FOOTER).map(([title, links]) => (
            <div key={title} className="space-y-4">
              <p className="text-sm font-semibold text-white">{t(m, title)}</p>
              <ul className="space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    <FooterNavLink link={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {/* The Mythex app in the stores, as badges in their own row: the App
            Store page was only in the JSON-LD, Google had not indexed it two
            weeks after launch, and its AI answered "no iOS app" (2026-11-14).
            Every page carries the footer, so every page links to both stores.
            dir=ltr keeps each badge's inner order in right-to-left languages,
            as the stores' own badges do. */}
        <div
          className="mt-8 flex flex-col-reverse gap-4 border-t pt-5 text-sm text-muted md:flex-row md:items-center md:justify-between md:gap-6"
          style={{ borderColor: "rgb(64, 64, 63)" }}
        >
          {/* Said in words, not only in the JSON-LD address: assistants
              answering "AI app builder from the UAE / Arabic-first" read
              page text (2026-10-26, Mythex never surfaced for either). */}
          <p className="min-w-0">
            {m.footer.madeIn} · <span className="whitespace-nowrap">© {new Date().getFullYear()} Mythex</span>
          </p>
          <div dir="ltr" className="flex flex-wrap items-center gap-2.5 md:shrink-0 md:flex-nowrap">
            {STORE_LINKS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-10 items-center gap-2 rounded-[9px] border bg-black px-2.5 text-white transition hover:border-white/50"
                style={{ borderColor: "rgb(100, 100, 98)" }}
              >
                <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
                  {s.paths.map((p) => (
                    <path key={p.d} d={p.d} fill={p.fill} />
                  ))}
                </svg>
                <span className="flex flex-col items-start leading-none">
                  <span className="whitespace-nowrap text-[8.5px] font-medium tracking-wide opacity-80">{s.top}</span>
                  <span className="mt-[3px] whitespace-nowrap text-[14px] font-semibold tracking-tight">{s.name}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * The language picker. Switching is a full page load of the same page in the
 * other language, so the new language's catalog is loaded before anything
 * renders and no page is ever shown half in one language.
 */
function LanguageSwitcher() {
  const { m, locale, path } = useI18n();
  return (
    <label className="group relative inline-flex max-w-full items-center gap-2 text-sm text-[#b8b5b0] transition hover:text-white has-[:focus-visible]:text-white">
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" />
      </svg>
      {/* What shows is the current language only: a native <select> is as wide
          as its longest option, and with 65 languages that ran into the next
          column. The select sits invisibly on top, so the menu stays native. */}
      <span lang={localeInfo(locale).tag} className="truncate">{localeInfo(locale).label}</span>
      <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        value={locale}
        aria-label={m.footer.language}
        onChange={(e) => {
          const next = e.target.value as LocaleCode;
          // A pick here is a choice, not a visit: remember it (and on the
          // account, when signed in), so the app and later visits follow it.
          void chooseLocale(next, { signedIn: peekSessionHint() })
            .catch(() => undefined)
            .finally(() => window.location.assign(localizePath(path, next) + window.location.hash));
        }}
        className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.tag} style={{ background: "#272725", color: "#fff" }}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MarketingSection({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  );
}
