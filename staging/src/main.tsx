import { DEFAULT_LOCALE, isTranslatedPath, localeInfo, localizePath, splitLocale } from "./i18n/locales";
import { loadCatalog } from "./i18n";
import { loadAppCatalog, setAppLocale } from "./i18n/app";
import { pageLocale, startingLocale } from "./i18n/app-locale";
import { peekSessionHint } from "./lib/session-hint";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "streamdown/styles.css";
import "./index.css";
import { App, preloadSolutionsRoute } from "./App";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";

// Local development only: a check for the app in the simulator, if one is
// there (src/dev-check.local.ts, never committed). Lets a check run inside the
// live-reload app — no rebuild, no reinstall, the session kept. In a build
// import.meta.env.DEV is false and this is dropped, file and all.
if (import.meta.env.DEV) {
  for (const load of Object.values(import.meta.glob("./dev-check.local.ts"))) void load();
}
import { UpgradeProvider } from "./lib/upgrade";
import { ToastProvider } from "./components/ui";
import { BillingReturnHandler } from "./components/BillingReturnHandler";
// Cookie consent banner is disabled — no popup is shown to visitors. Instead we
// treat every visitor as if they clicked "Accept" so analytics/pixels behave
// normally. CookieBanner.tsx is kept (unmounted) in case we want the real prompt back.
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initAnalytics } from "./lib/analytics";
import { setConsent, getConsent } from "./lib/consent";
import { installCheckoutBackReset } from "./lib/external-checkout";
import { installTranslationResilience } from "./lib/dom-resilience";
import { isForeignScriptEvent } from "./lib/sentry-noise";
import { deferNonCritical } from "./lib/idle";
import { DocumentMeta } from "./lib/seo";
import { captureReferral } from "./lib/referral";
import { LocaleRedirect } from "./i18n/LocaleRedirect";
import { markNativeShell, isNative, nativePlatform } from "./lib/native";
import { resumeLastProject } from "./lib/native-resume";
import { initNativeShell } from "./lib/native-shell";
import { ForceUpdateScreen } from "./components/ForceUpdateScreen";
import { GetAppBanner } from "./components/GetAppBanner";
import { prefetchL10nOnIntent } from "./l10n/page";
import { ScrollToTop } from "./lib/ScrollToTop";
import { preloadTemplateCards } from "./l10n/cards";
import { preloadL10nTitles } from "./l10n/titles";

// Before first paint: the class this adds is what every native-only CSS
// rule is scoped to, so adding it later would show one frame of the
// browser layout under the notch.
markNativeShell();

// The prerendered page carries a hidden copy of itself for crawlers
// (#seo-static, scripts/prerender.ts) ahead of #root, with the same heading
// ids. getElementById and #hash links find that copy first, so a guide's
// "On this page" links scrolled to an invisible heading. The served HTML stays
// as it is; only this tab's copy loses its ids.
for (const el of document.querySelectorAll("#seo-static [id]")) el.removeAttribute("id");

installCheckoutBackReset();
// Before React renders: a page being machine-translated has its text nodes
// replaced under the app, and React's next update would throw on them. Only a
// translated page gets the lenient path — see dom-resilience.ts — and the first
// time it is used is reported, so this stays visible rather than silent.
installTranslationResilience((op) => {
  void import("@sentry/react").then((Sentry) => {
    Sentry.captureMessage(`DOM fallback on a translated page (${op})`, "info");
  });
});

// Error tracking — lazy-loaded so Sentry isn't on the marketing critical path.
//
// Off on a developer's machine, for the same reason the backend is: a DSN sits
// in the repo's own .env, so every laptop was reporting into the production
// project. Most of what the web project had collected were Vite's own
// hot-reload errors — `appExists is not defined`, from a module that had been
// swapped under a mounted component — filed against localhost:5173 and
// indistinguishable, at a glance, from a real one. VITE_SENTRY_ENABLE=1 turns
// it on anyway, for when you are deliberately testing this.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled =
  Boolean(sentryDsn) &&
  (import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLE === "1");
if (sentryEnabled) {
  deferNonCritical(() => {
    // `@sentry/capacitor` wraps the React SDK rather than replacing it: on a
    // phone it also starts the iOS/Android SDK, which is the only thing that
    // sees a crash the WebView never hears about — a Swift or Kotlin crash in
    // a plugin, an OOM kill, an Android ANR, or anything thrown before the
    // WebView has booted. In a browser the wrapper is a thin pass-through, so
    // the web build behaves exactly as it did.
    void Promise.all([import("@sentry/capacitor"), import("@sentry/react")]).then(
      ([SentryCapacitor, SentryReact]) => {
        SentryCapacitor.init(
          {
            dsn: sentryDsn,
            // Staging builds are Vite `production` too, so MODE alone put every
            // staging error in with the real ones.
            environment:
              (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ||
              import.meta.env.MODE,
            integrations: [SentryReact.browserTracingIntegration()],
            tracesSampleRate: 0.1,
            // Which shell this is. Without it every phone error lands in the
            // same `production` environment as the website and is
            // indistinguishable from it, so "is the app worse than the web"
            // has no answer — and the shell ships on store cadence while the
            // web ships continuously, so the two are not even the same build.
            initialScope: {
              tags: {
                platform: nativePlatform(),
                shell: isNative() ? "app" : "browser",
              },
            },
            // Errors that are not ours and that nobody can act on. Kept short and
            // specific on purpose: a broad list here is how a real regression goes
            // unnoticed for a month.
            ignoreErrors: [
              // An Android WebView — the in-app browser inside other apps — whose
              // JS bridge was collected while the page was still running. Thirty of
              // these in three days, all from the same browser, none of them ours.
              "Java object is gone",
              // The browser telling itself it ran out of frames. Harmless by
              // specification, and there is nothing in our code to change.
              "ResizeObserver loop limit exceeded",
              "ResizeObserver loop completed with undelivered notifications",
              // Microsoft's email link scanner (Outlook Safe Links) opening our
              // links in a headless browser and calling its own bridge, which
              // our page doesn't have. No stack, no user, nothing of ours.
              "Object Not Found Matching Id",
              // Stopping a live event stream is how the workspace stops
              // listening — the run arrived, the page went away, the project
              // was deleted. The browser reports the half-read body as a
              // rejection; there is nothing to act on, and nothing broke.
              "BodyStreamBuffer was aborted",
              "The user aborted a request",
            ],
            // An in-app browser's own injected script, reported against our
            // origin because it runs in our page. Matched by where the code
            // came from — every frame the document URL, none a file of ours —
            // never by the error's text, which a real bug of ours could share.
            beforeSend: (event) => (isForeignScriptEvent(event) ? null : event),
          },
          // The wrapper hands the options to the React SDK itself when there is
          // no native layer to start, which is what keeps the web build on the
          // same code path it was on before.
          SentryReact.init,
        );
      },
    );
  });
}

// No banner, so nothing ever calls setConsent() from a user click — grant it
// up front so analytics/pixels load exactly as if "Accept" had been clicked.
if (!getConsent()) setConsent({ analytics: true, marketing: true });
initAnalytics();

/**
 * Overlay scrollbar: thumb only while the USER is scrolling.
 *
 * A `scroll` event cannot tell you who caused it — assigning `scrollTop` fires
 * one exactly like a wheel does. The chat pins itself to the tail as tokens
 * arrive, so listening to `scroll` alone flashed the scrollbar on every streamed
 * word, for the whole length of a turn, without anyone touching it.
 *
 * So the scroll event is not the signal; recent user input is. A wheel, a touch
 * drag, a scroll key, or a held pointer (dragging the thumb itself) opens a
 * short window during which scrolling counts as the user's. Anything outside
 * that window is the app moving itself, and stays invisible.
 */
{
  let hideTimer = 0;
  let lastIntent = 0;
  let pointerHeld = false;
  const root = document.documentElement;
  /** Long enough to cover momentum between wheel ticks, short enough to close. */
  const INTENT_MS = 500;
  const SCROLL_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
    "Spacebar",
  ]);

  const markIntent = () => {
    lastIntent = performance.now();
  };
  const opts = { passive: true, capture: true } as const;

  window.addEventListener("wheel", markIntent, opts);
  window.addEventListener("touchmove", markIntent, opts);
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      // Typing in the composer is not scrolling, even though it moves the view.
      if (SCROLL_KEYS.has(e.key)) markIntent();
    },
    opts,
  );
  // Held pointer covers dragging the thumb, where the gesture outlives any
  // single event and no wheel or touchmove ever fires.
  window.addEventListener(
    "pointerdown",
    () => {
      pointerHeld = true;
      markIntent();
    },
    opts,
  );
  const releasePointer = () => {
    pointerHeld = false;
  };
  window.addEventListener("pointerup", releasePointer, opts);
  window.addEventListener("pointercancel", releasePointer, opts);

  // The class goes on the element being scrolled, not on <html>. The
  // scrollbar's colour is an inherited property, so flipping it at the root
  // restyled every element on the page at the start and end of each scroll —
  // 3,600–3,900 elements, measured, in a long chat. See `.is-scrolling` in
  // index.css for how its reach is stopped at the scroller's children.
  let marked: Element | null = null;
  const unmark = () => {
    marked?.classList.remove("is-scrolling");
    marked = null;
  };
  const onScroll = (e: Event) => {
    if (!pointerHeld && performance.now() - lastIntent > INTENT_MS) return;
    const el = e.target instanceof Element ? e.target : root;
    if (marked !== el) {
      unmark();
      el.classList.add("is-scrolling");
      marked = el;
    }
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(unmark, 900);
  };
  window.addEventListener("scroll", onScroll, opts);
}

// After the tree is handed to React, not before: none of it blocks paint,
// and the status bar and splash only matter once there is something to show.
void initNativeShell();

// The language, settled before the first frame so nothing renders in one
// language and then flips. The app follows the person (their pick, else their
// browser); a public page follows its URL. Each needs at most one small chunk.
// Closed in a project, the app opens on it again (lib/native-resume.ts).
resumeLastProject();
const appCode = startingLocale();
const signedIn = peekSessionHint();
{
  // A visitor whose language we speak, landing on the English version of a
  // translated page, is sent to theirs — as ChatGPT and most sites do. Search
  // engines render in English with nothing stored, so they are never moved,
  // and choosing English in the footer stores "en", which stops this.
  const { pathname, search, hash } = window.location;
  const { locale: urlCode, path } = splitLocale(pathname);
  if (
    urlCode === DEFAULT_LOCALE &&
    appCode !== DEFAULT_LOCALE &&
    isTranslatedPath(path) &&
    !(path === "/" && signedIn)
  ) {
    window.location.replace(localizePath(path, appCode) + search + hash);
  }
}
// A partner's or a friend's ?ref= link: remember it until sign-up (lib/referral.ts).
captureReferral();
// Translated pages: fetch the next one on hover/focus, before the click.
prefetchL10nOnIntent((path) => preloadSolutionsRoute(path).catch(() => undefined));
const firstLocale = pageLocale(window.location.pathname, appCode, signedIn);
if (firstLocale !== DEFAULT_LOCALE) {
  document.documentElement.lang = localeInfo(firstLocale).tag;
  document.documentElement.dir = localeInfo(firstLocale).dir;
}
const catalogReady = Promise.all([
  // A Solutions page someone lands on draws whole, not as a skeleton first.
  preloadSolutionsRoute(window.location.pathname).catch(() => undefined),
  firstLocale === DEFAULT_LOCALE ? Promise.resolve() : loadCatalog(firstLocale),
  // A translated marketing page's cards and titles (templates, guides) come
  // from small per-language indexes: in hand before the first render, they
  // never show in English first.
  splitLocale(window.location.pathname).locale === DEFAULT_LOCALE ? Promise.resolve() : preloadTemplateCards(firstLocale),
  splitLocale(window.location.pathname).locale === DEFAULT_LOCALE ? Promise.resolve() : preloadL10nTitles(firstLocale),
  appCode === DEFAULT_LOCALE ? Promise.resolve() : setAppLocale(appCode),
  // The prompt box and other app widgets on a translated page speak the page's
  // language (usePageT): its app strings too, before the first render.
  firstLocale === DEFAULT_LOCALE || firstLocale === appCode ? Promise.resolve() : loadAppCatalog(firstLocale),
]);

void catalogReady.then(() => createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          {/* Inside AuthProvider: signing out on "/" swaps the dashboard for
              the landing page without a URL change, and both must re-run. */}
          <DocumentMeta />
          <ScrollToTop />
          <LocaleRedirect />
          <ToastProvider>
            <UpgradeProvider>
              <BillingReturnHandler />
              <App />
              {/* Over everything, in the iOS and Android apps only, when this
                  store version is older than the minimum (lib/force-update.ts). */}
              <ForceUpdateScreen />
              {/* "Get the app", in a phone's browser. */}
              <GetAppBanner />
              {/* <CookieBanner /> */}
            </UpgradeProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </ErrorBoundary>,
));
