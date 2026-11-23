import type { ComponentType } from "react";
import { useParams, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { reportConnected, takeReturnedConnection } from "./lib/connectors";
import { canBuyPlans, canSell, isNative } from "./lib/native";
import { useRememberProject } from "./lib/native-resume";
import { prefetchGet } from "./lib/api";
import { initPush } from "./lib/push";
import { resumeWebPush } from "./lib/web-push";
import { pushDestination } from "./lib/push-destination";
import { DOCS_URL } from "./lib/docs-url";
import { peekSessionHint, useAuth } from "./lib/auth";
import { setIntercomLauncherHidden } from "./lib/intercom";
import { isCustomSupportEnabled } from "./lib/support";
import { SupportMessenger } from "./components/support/SupportMessenger";
import { ConnectorsDialog } from "./components/ConnectorsDialog";
import { FilePreviewHost } from "./components/FilePreviewLightbox";
import { PageSheetHost, usePageSheet } from "./components/shell/PageSheet";
import { peekPendingPrompt } from "./lib/pending-prompt";
import { MarketingHome } from "./pages/marketing/MarketingHome";
import { NotFoundPage } from "./pages/NotFoundPage";
import {
  BillingRouteSkeleton,
  AuthPageSkeleton,
  SettingsRouteSkeleton,
  DashboardShellSkeleton,
  PageBodySkeleton,
  WorkspaceShellSkeleton,
  ProjectsRouteSkeleton,
} from "./components/loading";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { lazyRoute, preloadableRoute } from "./lib/lazy-route";
import { registerSolutionsPreload } from "./pages/marketing/solutions/preload";
import { TwoFactorPrompt } from "./components/TwoFactor";
import { DEFAULT_LOCALE, isLocaleCode, splitLocale } from "./i18n/locales";
import { SOLUTION_PATHS } from "./pages/marketing/solutions/routes";
import { useT } from "./i18n/app";
// Small pages people reach from the sign-in screen: part of the main code,
// not split off — a few KB, and split off they showed a skeleton each time
// they were opened.
import { AuthPage } from "./pages/Auth";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { ResetPasswordPage } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import { AcceptableUsePage, PrivacyPage, TermsPage } from "./pages/Legal";
import { impactIdentify } from "./lib/analytics";




const InvitePage = lazyRoute(() => import("./pages/Invite").then((m) => ({ default: m.InvitePage })));
const Dashboard = preloadableRoute<object>(
  () => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard as ComponentType<object> })),
);
const BillingPage = lazyRoute(() => import("./pages/BillingPage").then((m) => ({ default: m.BillingPage })));
const BillingUsagePage = lazyRoute(() =>
  import("./pages/BillingUsagePage").then((m) => ({ default: m.BillingUsagePage })),
);
const AccountSettingsPage = lazyRoute(() =>
  import("./pages/AccountSettingsPage").then((m) => ({ default: m.AccountSettingsPage })),
);
const McpConsentPage = lazyRoute(() =>
  import("./pages/McpConsentPage").then((m) => ({ default: m.McpConsentPage })),
);
const DomainsSettingsPage = lazyRoute(() =>
  import("./pages/DomainsSettingsPage").then((m) => ({ default: m.DomainsSettingsPage })),
);
const JoinWorkspacePage = lazyRoute(() => import("./pages/JoinWorkspacePage").then((m) => ({ default: m.JoinWorkspacePage })));
const TeamSettingsPage = lazyRoute(() =>
  import("./pages/TeamSettingsPage").then((m) => ({ default: m.TeamSettingsPage })),
);
const AppAccessPage = lazyRoute(() =>
  import("./pages/AppAccessPage").then((m) => ({ default: m.AppAccessPage })),
);
const ReferralsSettingsPage = lazyRoute(() =>
  import("./pages/ReferralsSettingsPage").then((m) => ({ default: m.ReferralsSettingsPage })),
);
const PartnerSettingsPage = lazyRoute(() =>
  import("./pages/ReferralsSettingsPage").then((m) => ({ default: m.PartnerSettingsPage })),
);
const MemorySettingsPage = lazyRoute(() =>
  import("./pages/MemorySettingsPage").then((m) => ({ default: m.MemorySettingsPage })),
);
const ProjectsLibrary = lazyRoute(() =>
  import("./pages/ProjectsLibrary").then((m) => ({ default: m.ProjectsLibrary })),
);
// …and the pages that open as a sheet over them. Fetched on the first open,
// the sheet showed a placeholder and then swapped in the page, and the
// scrolling area under the finger was replaced mid-swipe: the first swipe in
// a sheet didn't scroll (Plans & credits, reproduced in the simulator; the
// second open, with the code already there, scrolled).
if (isNative()) {
  const sheetPages = [BillingPage, BillingUsagePage, AccountSettingsPage, DomainsSettingsPage, TeamSettingsPage, ReferralsSettingsPage, PartnerSettingsPage, MemorySettingsPage, ProjectsLibrary];
  const fetchAll = () => sheetPages.forEach((p) => void p.preload());
  if ("requestIdleCallback" in window) (window as Window).requestIdleCallback(fetchAll, { timeout: 3000 });
  else setTimeout(fetchAll, 1500);
}

const DevMarkdownPage = lazyRoute(() =>
  import("./pages/DevMarkdown").then((m) => ({ default: m.DevMarkdownPage })),
);
const loadWorkspace = () =>
  import("./pages/Workspace").then((m) => ({ default: m.Workspace as ComponentType<object> }));
const Workspace = preloadableRoute(loadWorkspace);

// In the app every screen's code is already on the phone: load the two big
// screens it opens on (home, a project) at start, so they render straight away.
if (isNative()) {
  void Dashboard.preload();
  void Workspace.preload();
}

/**
 * Opening a project (/p/:id, from a link or a refresh) used to be a relay:
 * the app's code, then the sign-in check, then the workspace's code — three
 * rounds of files — then the project and its chat list, then the chat's
 * messages. Start what does not depend on the sign-in check now, alongside it:
 * the workspace's code and the first requests the workspace makes (picked up
 * by api.get when it makes them; see prefetchGet). Measured on prod before:
 * the chat's messages were first asked for ~1.1 s in.
 */
(() => {
  if (typeof window === "undefined") return;
  const m = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!m) return;
  const projectId = decodeURIComponent(m[1]);
  void loadWorkspace().catch(() => {});
  prefetchGet(`/v1/projects/${projectId}`);
  prefetchGet(`/v1/projects/${projectId}/threads?limit=30`);
  const thread = new URLSearchParams(window.location.search).get("thread");
  if (thread) prefetchGet(`/v1/projects/${projectId}/threads/${thread}/messages?limit=30`);
})();
const AdminApp = lazyRoute(() => import("./pages/admin/AdminApp").then((m) => ({ default: m.AdminApp })));
// Cookie consent banner + /cookies page disabled for now (see main.tsx). Route kept
// commented out for a future re-enable.
// const CookiePage = lazyRoute(() => import("./pages/Legal").then((m) => ({ default: m.CookiePage })));
const DownloadPage = lazyRoute(() =>
  import("./pages/marketing/MarketingDocs").then((m) => ({ default: m.DownloadPage })),
);
const AboutPage = lazyRoute(() =>
  import("./pages/marketing/MarketingDocs").then((m) => ({ default: m.AboutPage })),
);
const FaqPage = lazyRoute(() => import("./pages/marketing/MarketingDocs").then((m) => ({ default: m.FaqPage })));
const EnterpriseDemo = lazyRoute(() => import("./pages/EnterpriseDemo"));
const PricingPage = lazyRoute(() => import("./pages/marketing/MarketingDocs").then((m) => ({ default: m.PricingPage })));
const SolutionPage = preloadableRoute(() => import("./pages/marketing/solutions/SolutionPage"));
// Experts and Agencies are off for now (2026-10-15): the partner program is for creators only; uncomment to bring them back.
const PartnersPage = preloadableRoute(() => import("./pages/marketing/solutions/PartnersPage"));
// The separate creator page (/partners/creators) is off while /partners is for creators only.
// const CreatorsPage = preloadableRoute(() => import("./pages/marketing/solutions/CreatorsPage"));
// Students is off for now (2026-10-15); uncomment to bring it back.
// const StudentsPage = preloadableRoute(() => import("./pages/marketing/solutions/StudentsPage"));

/** While a Solutions page's code loads during in-app navigation: its own cream page, not a skeleton. */
function SolutionsFallback() {
  return <div className="min-h-dvh" style={{ background: "#fcfbf8" }} />;
}

/**
 * Fetch the Solutions page code a path needs before the first render, so a
 * visitor landing on /for-work or /students sees the page, not a skeleton.
 * Also used on hover in the Solutions menu.
 */
export function preloadSolutionsRoute(path: string): Promise<void> {
  const p = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/, "").replace(/\/+$/, "");
  // The page's words in its language load with its code, so it draws in that
  // language at once instead of in English first.
  const { locale } = splitLocale(path);
  // if (p === "/students") return StudentsPage.preload(); — Students is off for now (2026-10-15); uncomment to bring it back.
  if (p === "/partners") {
    return Promise.all([PartnersPage.preload(), import("./i18n/solutions/creators").then((m) => m.loadCreators(locale))]).then(() => undefined);
  }
  if (p === "/for-work" || /^\/solutions\/[a-z-]+$/.test(p)) {
    return Promise.all([SolutionPage.preload(), import("./i18n/solutions").then((m) => m.loadSolutions(locale))]).then(() => undefined);
  }
  return Promise.resolve();
}
registerSolutionsPreload(preloadSolutionsRoute);

const UseCasesPage = lazyRoute(() =>
  import("./pages/marketing/MarketingDocs").then((m) => ({ default: m.UseCasesPage })),
);
const TemplatesHubPage = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({ default: m.TemplatesHubPage })),
);
const TemplatesCategoryPage = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({
    default: m.TemplatesCategoryPage,
  })),
);
const TemplateDetailPage = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({
    default: m.TemplateDetailPage,
  })),
);
const AiBuildersHubPage = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({
    default: m.AiBuildersHubPage,
  })),
);
const AiHubPage = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({
    default: m.AiHubPage,
  })),
);
const AiBuilderPageView = lazyRoute(() =>
  import("./pages/marketing/templates/TemplatesPages").then((m) => ({
    default: m.AiBuilderPageView,
  })),
);
const CompareHubPage = lazyRoute(() =>
  import("./pages/marketing/compare/ComparePages").then((m) => ({
    default: m.CompareHubPage,
  })),
);
const ComparePageView = lazyRoute(() =>
  import("./pages/marketing/compare/ComparePages").then((m) => ({
    default: m.ComparePageView,
  })),
);

const GlossaryHubPage = lazyRoute(() =>
  import("./pages/marketing/glossary/GlossaryPages").then((m) => ({ default: m.GlossaryHubPage })),
);
const GlossaryTermPage = lazyRoute(() =>
  import("./pages/marketing/glossary/GlossaryPages").then((m) => ({ default: m.GlossaryTermPage })),
);
const ToolsHubPage = lazyRoute(() =>
  import("./pages/marketing/tools/ToolsPages").then((m) => ({ default: m.ToolsHubPage })),
);
const ToolPageView = lazyRoute(() =>
  import("./pages/marketing/tools/ToolsPages").then((m) => ({ default: m.ToolPageView })),
);

const ContentHubPage = lazyRoute(() =>
  import("./pages/marketing/content/ContentPages").then((m) => ({ default: m.ContentHubPage })),
);
const ContentCategoryPage = lazyRoute(() =>
  import("./pages/marketing/content/ContentPages").then((m) => ({ default: m.ContentCategoryPage })),
);
const ContentArticlePage = lazyRoute(() =>
  import("./pages/marketing/content/ContentPages").then((m) => ({ default: m.ContentArticlePage })),
);

/** Full-page redirect to Mintlify (React Router Navigate is in-app only). */
function DocsRedirect() {
  const t = useT();
  useEffect(() => {
    window.location.replace(DOCS_URL);
  }, []);
  return <div className="grid h-full place-items-center text-muted">{t.shell.app.redirectingToDocs}</div>;
}

function loginRedirect(from: string): string {
  const path = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  return `/login?returnTo=${encodeURIComponent(path)}`;
}

function Protected({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  /** Shown while session resolves (default: dashboard chrome). */
  loadingFallback?: ReactNode;
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <>{loadingFallback ?? <DashboardShellSkeleton />}</>;
  if (!user) return <Navigate to={loginRedirect(`${loc.pathname}${loc.search}`)} replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  // Two-factor on and this session hasn't entered a code: that comes first.
  if (user.twoFactor?.required) return <TwoFactorPrompt />;
  return <>{children}</>;
}

function AdminProtected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <DashboardShellSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** `/` — marketing when logged out, dashboard when logged in. */
/**
 * The marketing site under a language prefix. The pages are the same
 * components; they read the language from the URL (useI18n). A first segment
 * that is not a language is a missing page, not a guess.
 */
function LocaleRoutes() {
  const { lang } = useParams();
  if (!isLocaleCode(lang) || lang === DEFAULT_LOCALE || !canSell()) return <NotFoundPage />;
  return (
    <Routes>
        <Route
          index
          element={
            <MarketingHome />
          }
        />
        <Route
          path="home"
          element={
            <MarketingHome />
          }
        />
        <Route
          path="pricing"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <PricingPage />
            </Lazy>
          }
        />
        <Route
          path="download"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <DownloadPage />
            </Lazy>
          }
        />
        <Route
          path="about"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AboutPage />
            </Lazy>
          }
        />
        <Route
          path="faq"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <FaqPage />
            </Lazy>
          }
        />
        <Route
          path="use-cases"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <UseCasesPage />
            </Lazy>
          }
        />
        {Object.values(SOLUTION_PATHS).map((path) => (
          <Route
            key={path}
            path={path.slice(1)}
            element={
              <Lazy fallback={<SolutionsFallback />}>
                <SolutionPage />
              </Lazy>
            }
          />
        ))}
        {/* The partner program, for creators only for now (English only). */}
        <Route
          path="partners"
          element={
            <Lazy fallback={<SolutionsFallback />}>
              <PartnersPage />
            </Lazy>
          }
        />
        {/* Students is off for now (2026-10-15); uncomment to bring it back.
        <Route
          path="students"
          element={
            <Lazy fallback={<SolutionsFallback />}>
              <StudentsPage />
            </Lazy>
          }
        /> */}
        <Route
          path="terms"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TermsPage />
            </Lazy>
          }
        />
        <Route
          path="privacy"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <PrivacyPage />
            </Lazy>
          }
        />
        <Route
          path="acceptable-use"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AcceptableUsePage />
            </Lazy>
          }
        />
        <Route
          path="templates"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplatesHubPage />
            </Lazy>
          }
        />
        <Route
          path="templates/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplatesCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="templates/:category/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplateDetailPage />
            </Lazy>
          }
        />
        <Route
          path="ai"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiBuildersHubPage />
            </Lazy>
          }
        />
        <Route
          path="ai/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiBuilderPageView />
            </Lazy>
          }
        />
        <Route
          path="ai/industry/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiHubPage />
            </Lazy>
          }
        />
        <Route
          path="ai/type/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiHubPage />
            </Lazy>
          }
        />
        <Route
          path="compare"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <CompareHubPage />
            </Lazy>
          }
        />
        <Route
          path="compare/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ComparePageView />
            </Lazy>
          }
        />
        <Route
          path="glossary"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <GlossaryHubPage />
            </Lazy>
          }
        />
        <Route
          path="glossary/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <GlossaryTermPage />
            </Lazy>
          }
        />
        <Route
          path="tools"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ToolsHubPage />
            </Lazy>
          }
        />
        <Route
          path="tools/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ToolPageView />
            </Lazy>
          }
        />
        <Route
          path="guides"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentHubPage />
            </Lazy>
          }
        />
        <Route
          path="guides/category/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="guides/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentArticlePage />
            </Lazy>
          }
        />
        <Route
          path="blog"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentHubPage />
            </Lazy>
          }
        />
        <Route
          path="blog/category/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="blog/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentArticlePage />
            </Lazy>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function RootGate() {
  const { user, loading } = useAuth();
  // The app opens on sign-in, never on the marketing site. Someone who
  // installed it does not need to be sold it, the landing page carries a
  // pricing section, and a purchase surface is the one thing the app must not
  // have (see `canSell`).
  if (!canSell()) {
    if (loading) return <DashboardShellSkeleton />;
    if (!user) return <Navigate to="/login" replace />;
  }
  if (loading) {
    // Cookie is httpOnly — use last-known session hint so reload doesn't flash marketing.
    return peekSessionHint() ? <DashboardShellSkeleton /> : <MarketingHome />;
  }
  if (!user) return <MarketingHome />;
  return (
    <Protected>
      <Suspense fallback={<DashboardShellSkeleton />}>
        <Dashboard />
      </Suspense>
    </Protected>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  // Only bounce if already signed in when auth finished loading — not when
  // signup/login sets the session on this page (would steal /verify-email).
  const arrivedAuthed = useRef<boolean | null>(null);
  if (!loading && arrivedAuthed.current === null) {
    arrivedAuthed.current = Boolean(user);
  }
  // Show the form immediately; redirect only after auth resolves.
  if (loading) return <>{children}</>;
  if (arrivedAuthed.current && user) {
    if (!user.emailVerified) {
      return <Navigate to="/verify-email" replace />;
    }
    const p = peekPendingPrompt();
    return <Navigate to="/" replace state={p ? { prompt: p } : undefined } />;
  }
  return <>{children}</>;
}

/** impact.com asks for its Identify call on every page (lib/analytics). */
function ImpactPageGate() {
  const { pathname } = useLocation();
  useEffect(() => {
    impactIdentify();
  }, [pathname]);
  return null;
}

/** Intercom-only: keep the default launcher off the project builder. */
function SupportRouteGate() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (isCustomSupportEnabled()) return;
    setIntercomLauncherHidden(/^\/p\//.test(pathname));
  }, [pathname]);
  return null;
}

/** A page in the phone's sheet: signed in (the sheet only opens from inside
 *  the app), and a quiet space while its code loads. */
function SheetPage({ children }: { children: ReactNode }) {
  return (
    <Protected loadingFallback={null}>
      <Lazy fallback={<div className="min-h-[50dvh]" />}>{children}</Lazy>
    </Protected>
  );
}

function Lazy({
  fallback,
  shell = false,
  children,
}: {
  fallback: ReactNode;
  /**
   * The fallback is the whole screen's layout (the chat's, home's): drawn on
   * a first load too. Left blank there, the session's skeleton (Protected)
   * went away and the screen stayed empty until the code arrived — the chat
   * read as two skeletons with a blank between them.
   */
  shell?: boolean;
  children: ReactNode;
}) {
  // On the very first load a content page has no screen to stand in for: like
  // any page, nothing is drawn until the page itself can be. A skeleton there
  // only flashed before the real page. Moving between screens inside the app,
  // the skeleton still holds the place.
  return (
    <Suspense fallback={firstLoadDone || shell ? fallback : null}>
      {children}
      <FirstLoadMark />
    </Suspense>
  );
}

/** Set once the first page has drawn: the mark sits in the page's own Suspense
 *  boundary, so it commits only together with the page. */
let firstLoadDone = false;
function FirstLoadMark() {
  useEffect(() => {
    firstLoadDone = true;
  }, []);
  return null;
}

/**
 * A connection coming back from a provider, reported once.
 *
 * The callback lands on whichever page the connect started from, so this sits
 * at the root rather than in the modal or the chat card — both of those are
 * valid places to come back to, and neither is guaranteed to be mounted.
 */
function ConnectReturnReporter() {
  useEffect(() => {
    const id = takeReturnedConnection();
    if (id) reportConnected(id);
  }, []);
  return null;
}

/**
 * Signed-in chrome, kept out of a logged-out page.
 *
 * The connectors modal was mounted at the root with no condition on it, so
 * `/?connectors=1` opened it for anyone — and because it fetches on mount, a
 * visit made while the session was still resolving painted a populated modal
 * over the marketing page, complete with a "Log in" button behind it. The API
 * refuses those calls without a cookie, so nothing was ever exposed to a real
 * stranger; it just looked exactly like it had been.
 *
 * `loading` counts as not-signed-in here on purpose: this is chrome nobody is
 * waiting on, and showing it a moment late costs nothing next to showing it to
 * someone who turns out to be logged out.
 */
function SignedInOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <>{children}</>;
}

/**
 * Push, once there is someone to notify.
 *
 * Registration is tied to being signed in, not to launch: the token is stored
 * against a user, and asking for notification permission on a sign-in screen
 * is a prompt about a thing the person has not started using yet — the surest
 * way to have it declined permanently.
 *
 * The app and the browser differ in who may prompt. A phone's permission sheet
 * belongs to the app and is expected there, so `initPush` asks. A browser's
 * does not: an unprompted permission bar is dismissed, and Chrome eventually
 * stops showing one for a site that keeps firing it. So the web only resumes a
 * subscription someone already agreed to — the asking lives behind a switch in
 * account settings.
 */
function PushRegistration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || startedFor.current === user.id) return;
    startedFor.current = user.id;
    // Not `navigate(path)` straight through: the path was written against the
    // website, and the app is not the website. See push-destination.ts.
    const open = (path: string) => navigate(pushDestination(path));
    void initPush(open);
    void resumeWebPush();
  }, [user?.id, navigate]);
  return null;
}

/**
 * mythex.ai links the OS opens the app with (universal links, App Links —
 * deep-link.ts says which). Through the router, as a notification's tap is:
 * a push from the page on screen is what lets an account page (/settings/team)
 * come up as the phone's sheet over it, where setting the address by hand
 * read as a back/forward step and showed the page bare, with no way to close.
 */
function AppLinks() {
  const navigate = useNavigate();
  // The router hands out a new navigate on every move; the listener is added once.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    if (!isNative()) return;
    let removed = false;
    let remove: (() => void) | undefined;
    void (async () => {
      const { App: CapApp } = await import("@capacitor/app");
      const { appLinkPath } = await import("./lib/deep-link");
      const go = (url: string | undefined) => {
        const path = url ? appLinkPath(url) : null;
        if (!path || path === `${location.pathname}${location.search}${location.hash}`) return;
        navigateRef.current(pushDestination(path));
      };
      const handle = await CapApp.addListener("appUrlOpen", ({ url }) => go(url));
      if (removed) return void handle.remove();
      remove = () => void handle.remove();
      // A link that launched the app can arrive before the listener exists (on
      // iOS the scene gets it while the page is still loading), so ask for it
      // too. Once per launch: the native side keeps answering with it for the
      // life of the process, and a page reload (a live update) must not go
      // back to it.
      const launch = (await CapApp.getLaunchUrl())?.url;
      if (!launch) return;
      try {
        if (sessionStorage.getItem("mx-launch-url") === launch) return;
        sessionStorage.setItem("mx-launch-url", launch);
      } catch {
        // No storage: route it anyway.
      }
      go(launch);
    })();
    return () => {
      removed = true;
      remove?.();
    };
  }, []);
  return null;
}

export function App() {
  const location = useLocation();
  // On a phone the account's pages open in a sheet over the page they were
  // opened from; the routes keep rendering that page underneath.
  const sheet = usePageSheet();
  useRememberProject(sheet.background ?? location);
  return (
    <>
      <PushRegistration />
      <AppLinks />
      <ConnectReturnReporter />
      <SupportRouteGate />
      <ImpactPageGate />
      <SupportMessenger />
      <SignedInOnly>
        <ConnectorsDialog />
        <FilePreviewHost />
      </SignedInOnly>
      <Routes location={sheet.background ?? location}>
        <Route path="/" element={<RootGate />} />
        {/* Marketing lives on the web. In the app these are the front door to
            a pricing page, so they lead back inside instead. */}
        <Route
          path="/home"
          element={canSell() ? <MarketingHome /> : <Navigate to="/" replace />}
        />
        {/* A real page on the web; the native apps still may not show prices. */}
        <Route
          path="/pricing"
          element={
            canSell() ? (
              <Lazy fallback={<PageBodySkeleton />}>
                <PricingPage />
              </Lazy>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        {/* Book a demo (Enterprise): a sales form, no prices — open everywhere. */}
        <Route
          path="/enterprise/demo"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <EnterpriseDemo />
            </Lazy>
          }
        />
        <Route path="/security" element={<Navigate to="/home" replace />} />

        <Route
          path="/login"
          element={
            <GuestOnly>
              <Lazy fallback={<AuthPageSkeleton />}>
                <AuthPage mode="login" />
              </Lazy>
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <Lazy fallback={<AuthPageSkeleton />}>
                <AuthPage mode="signup" />
              </Lazy>
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Lazy fallback={<AuthPageSkeleton fields={1} social={false} subtitle />}>
              <ForgotPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Lazy fallback={<AuthPageSkeleton fields={1} social={false} subtitle />}>
              <ResetPasswordPage />
            </Lazy>
          }
        />
        <Route
          path="/verify-email"
          element={
            <Lazy fallback={<AuthPageSkeleton fields={0} social={false} subtitle />}>
              <VerifyEmail />
            </Lazy>
          }
        />
        <Route
          path="/invite"
          element={
            <Lazy fallback={<AuthPageSkeleton fields={0} social={false} subtitle />}>
              <InvitePage />
            </Lazy>
          }
        />
        <Route
          path="/terms"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TermsPage />
            </Lazy>
          }
        />
        <Route
          path="/privacy"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <PrivacyPage />
            </Lazy>
          }
        />
        {/* <Route
          path="/cookies"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <CookiePage />
            </Lazy>
          }
        /> */}
        <Route
          path="/acceptable-use"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AcceptableUsePage />
            </Lazy>
          }
        />
        {/* The phone apps' page: inside the app itself there is nothing to download. */}
        <Route
          path="/download"
          element={
            isNative() ? (
              <Navigate to="/" replace />
            ) : (
              <Lazy fallback={<PageBodySkeleton />}>
                <DownloadPage />
              </Lazy>
            )
          }
        />
        <Route
          path="/about"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AboutPage />
            </Lazy>
          }
        />
        <Route
          path="/faq"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <FaqPage />
            </Lazy>
          }
        />
        <Route
          path="/use-cases"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <UseCasesPage />
            </Lazy>
          }
        />
        {/* Solutions: who Mythex is for and what it's used for (Lovable's Solutions menu). */}
        {Object.values(SOLUTION_PATHS).map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <Lazy fallback={<SolutionsFallback />}>
                <SolutionPage />
              </Lazy>
            }
          />
        ))}
        {/* The partner program, for creators only for now (English only): PartnersPage
            in its own design with the creator program's words.
            Experts and Agencies are off for now (2026-10-15); uncomment to bring them back.
        <Route
          path="/partners/creators"
          element={
            <Lazy fallback={<SolutionsFallback />}>
              <CreatorsPage />
            </Lazy>
          }
        /> */}
        <Route
          path="/partners"
          element={
            <Lazy fallback={<SolutionsFallback />}>
              <PartnersPage />
            </Lazy>
          }
        />
        {/* Students: 50% off Pro for 12 months with a school email. Students is off for now (2026-10-15); uncomment to bring it back.
        <Route
          path="/students"
          element={
            <Lazy fallback={<SolutionsFallback />}>
              <StudentsPage />
            </Lazy>
          }
        /> */}
        <Route
          path="/templates"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplatesHubPage />
            </Lazy>
          }
        />
        <Route
          path="/templates/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplatesCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="/templates/:category/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <TemplateDetailPage />
            </Lazy>
          }
        />
        <Route
          path="/ai"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiBuildersHubPage />
            </Lazy>
          }
        />
        <Route
          path="/ai/industry/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiHubPage />
            </Lazy>
          }
        />
        <Route
          path="/ai/type/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiHubPage />
            </Lazy>
          }
        />
        <Route
          path="/ai/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <AiBuilderPageView />
            </Lazy>
          }
        />
        <Route
          path="/compare"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <CompareHubPage />
            </Lazy>
          }
        />
        <Route
          path="/compare/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ComparePageView />
            </Lazy>
          }
        />
        <Route
          path="/glossary"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <GlossaryHubPage />
            </Lazy>
          }
        />
        <Route
          path="/glossary/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <GlossaryTermPage />
            </Lazy>
          }
        />
        <Route
          path="/tools"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ToolsHubPage />
            </Lazy>
          }
        />
        <Route
          path="/tools/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ToolPageView />
            </Lazy>
          }
        />
        <Route
          path="/guides"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentHubPage />
            </Lazy>
          }
        />
        <Route
          path="/guides/category/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="/guides/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentArticlePage />
            </Lazy>
          }
        />
        <Route
          path="/blog"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentHubPage />
            </Lazy>
          }
        />
        <Route
          path="/blog/category/:category"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentCategoryPage />
            </Lazy>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <Lazy fallback={<PageBodySkeleton />}>
              <ContentArticlePage />
            </Lazy>
          }
        />
        <Route path="/docs" element={<DocsRedirect />} />
        <Route path="/docs/*" element={<DocsRedirect />} />

        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        {/* Absent in the app, not hidden: there is no billing screen to reach,
            by link, by deep link, or by typing the path. Credits are bought on
            the web and spent here. See `canSell`. */}
        {canBuyPlans() && (
          <Route
            path="/billing"
            element={
              <Protected loadingFallback={<BillingRouteSkeleton />}>
                <Lazy shell fallback={<BillingRouteSkeleton />}>
                  <BillingPage />
                </Lazy>
              </Protected>
            }
          />
        )}
        {canBuyPlans() && (
          <Route
            path="/billing/usage"
            element={
              <Protected loadingFallback={<BillingRouteSkeleton />}>
                <Lazy shell fallback={<BillingRouteSkeleton />}>
                  <BillingUsagePage />
                </Lazy>
              </Protected>
            }
          />
        )}
        <Route
          path="/settings"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={4} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={4} />}>
                <AccountSettingsPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/mcp/consent"
          element={
            <Protected loadingFallback={<div className="min-h-dvh" style={{ background: "#1f1f1e" }} />}>
              <Lazy fallback={<div className="min-h-dvh" style={{ background: "#1f1f1e" }} />}>
                <McpConsentPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/join/:token"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={4} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={4} />}>
                <JoinWorkspacePage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/settings/team"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={4} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={4} />}>
                <TeamSettingsPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/app-access"
          element={
            <Protected loadingFallback={<div className="min-h-dvh" style={{ background: "#1f1f1e" }} />}>
              <Lazy fallback={<div className="min-h-dvh" style={{ background: "#1f1f1e" }} />}>
                <AppAccessPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/settings/memory"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={3} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={3} />}>
                <MemorySettingsPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/settings/referrals"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={3} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={3} />}>
                <ReferralsSettingsPage />
              </Lazy>
            </Protected>
          }
        />
        {/* The partner dashboard, apart from the friend referral above. */}
        <Route
          path="/settings/partner"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={3} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={3} />}>
                <PartnerSettingsPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/settings/domains"
          element={
            <Protected loadingFallback={<SettingsRouteSkeleton rows={2} />}>
              <Lazy shell fallback={<SettingsRouteSkeleton rows={2} />}>
                <DomainsSettingsPage />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/dashboard/projects"
          element={
            <Protected loadingFallback={<ProjectsRouteSkeleton />}>
              <Lazy shell fallback={<ProjectsRouteSkeleton />}>
                <ProjectsLibrary />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/dashboard/starred"
          element={<Navigate to="/dashboard/projects" replace />}
        />
        <Route
          path="/dashboard/created"
          element={<Navigate to="/dashboard/projects" replace />}
        />
        <Route
          path="/dashboard/shared"
          element={<Navigate to="/dashboard/projects" replace />}
        />

        <Route
          path="/p/:projectId"
          element={
            // The workspace's own skeleton while the session resolves too, not
            // just while the chunk loads. Without it this fell back to the
            // dashboard shell — a sidebar and a grid of project cards — so
            // opening a project painted the home page's skeleton first and
            // swapped to this one a moment later, two different loading
            // screens for one navigation.
            <Protected loadingFallback={<WorkspaceShellSkeleton />}>
              <Lazy shell fallback={<WorkspaceShellSkeleton />}>
                <Workspace />
              </Lazy>
            </Protected>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminProtected>
              <Lazy shell fallback={<DashboardShellSkeleton />}>
                <AdminApp />
              </Lazy>
            </AdminProtected>
          }
        />
        {import.meta.env.DEV && (
          <Route
            path="/_dev/markdown"
            element={
              <Lazy fallback={null}>
                <DevMarkdownPage />
              </Lazy>
            }
          />
        )}
        {/* The marketing site in other languages: /de/pricing, /pt-br/guides… */}
        <Route path="/:lang/*" element={<LocaleRoutes />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <PageSheetHost sheet={sheet}>
        <Route path="/dashboard/projects" element={<SheetPage><ProjectsLibrary /></SheetPage>} />
        <Route path="/settings" element={<SheetPage><AccountSettingsPage /></SheetPage>} />
        <Route path="/settings/memory" element={<SheetPage><MemorySettingsPage /></SheetPage>} />
        <Route path="/settings/team" element={<SheetPage><TeamSettingsPage /></SheetPage>} />
        <Route path="/settings/domains" element={<SheetPage><DomainsSettingsPage /></SheetPage>} />
        <Route path="/settings/referrals" element={<SheetPage><ReferralsSettingsPage /></SheetPage>} />
        <Route path="/settings/partner" element={<SheetPage><PartnerSettingsPage /></SheetPage>} />
        {canBuyPlans() && <Route path="/billing" element={<SheetPage><BillingPage /></SheetPage>} />}
        {canBuyPlans() && <Route path="/billing/usage" element={<SheetPage><BillingUsagePage /></SheetPage>} />}
        {/* Open to anyone: the sign-in screen links to them. */}
        <Route path="/terms" element={<Lazy fallback={<div className="min-h-[50dvh]" />}><TermsPage /></Lazy>} />
        <Route path="/privacy" element={<Lazy fallback={<div className="min-h-[50dvh]" />}><PrivacyPage /></Lazy>} />
        <Route path="/acceptable-use" element={<Lazy fallback={<div className="min-h-[50dvh]" />}><AcceptableUsePage /></Lazy>} />
      </PageSheetHost>
    </>
  );
}
