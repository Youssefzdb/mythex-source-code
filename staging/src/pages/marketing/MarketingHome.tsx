import { useI18n } from "../../i18n/useI18n";
import { fill } from "../../i18n";
import { Suspense, useEffect, useRef, useState } from "react";
import { lazyRoute } from "../../lib/lazy-route";
import { useLocation, useNavigate } from "react-router-dom";
import { CHAT_PROMPT_MODES } from "../../lib/prompt-modes";
import { LocalAttachComposer } from "../../components/LocalAttachComposer";
import { revokeHeroAttachment, type HeroLocalAttachment } from "../../components/HeroAttachStrip";
import { PulseBackground } from "../../components/PulseBackground";
import { useToast } from "../../components/ui";
import { api, type WorkspaceSummary } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useUpgrade } from "../../lib/upgrade";
import { createProject } from "../../lib/create-project";
import { lockDocumentTheme } from "../../lib/theme";
import { setPendingPrompt } from "../../lib/pending-prompt";
import { setPendingAttachments, shouldRetainPendingAttachments } from "../../lib/pending-attachments";
import {
  MarketingFooter,
  MarketingNav,
  SECTION_IDS,
  scrollToMarketingSection,
} from "./MarketingChrome";
import { AuthModal } from "./AuthModal";
import { AnimatedGradientText, Reveal } from "./motion";
import { useHeroTypewriter } from "./hero-typewriter";

const MeetMythex = lazyRoute(() => import("./MeetMythex").then((m) => ({ default: m.MeetMythex })));
const CompareGrid = lazyRoute(() => import("./compare/CompareGrid").then((m) => ({ default: m.CompareGrid })));
const HeadToHeadChart = lazyRoute(() => import("./compare/HeadToHeadChart").then((m) => ({ default: m.HeadToHeadChart })));
const LandingPricing = lazyRoute(() => import("./LandingPricing").then((m) => ({ default: m.LandingPricing })));
const ExamplesGallery = lazyRoute(() =>
  import("./ExamplesGallery").then((m) => ({ default: m.ExamplesGallery })),
);

const WS_KEY = "mythex_ws";

/**
 * Dark marketing palette:
 * page/background ≈ #1c1c1c (hsl(0 0% 11%)), muted surfaces rgb(39,39,37)
 */
const PAGE = "#1c1c1c";
const SURFACE = "rgb(39, 39, 37)";


const CONTENT =
  "mx-auto w-full max-w-[80rem] px-4 sm:px-8 lg:px-16 xl:px-20 2xl:max-w-[96rem] 2xl:px-24";

/** Full-viewport marketing blocks (one section in view at a time). */
const VIEWPORT_SECTION =
  "flex min-h-dvh scroll-mt-16 flex-col justify-center py-16 md:py-20";

function useForceDark() {
  useEffect(() => {
    lockDocumentTheme("dark");
    return () => lockDocumentTheme(null);
  }, []);
}


export function MarketingHome() {
  useForceDark();
  const { m, locale } = useI18n();
  const STATS = [
    { n: "1", label: m.home.stat1 },
    { n: m.home.stat2Value, label: m.home.stat2 },
    { n: m.home.stat3Value, label: m.home.stat3 },
  ];
  const heroTypewriter = useHeroTypewriter();
  const { user } = useAuth();
  const navigate = useNavigate();
  const openUpgrade = useUpgrade();
  const location = useLocation();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [heroAttachments, setHeroAttachments] = useState<HeroLocalAttachment[]>([]);
  const attachmentsHandedOff = useRef(false);
  const heroAttachmentsLive = useRef(heroAttachments);
  heroAttachmentsLive.current = heroAttachments;

  useEffect(() => {
    return () => {
      for (const a of heroAttachmentsLive.current) revokeHeroAttachment(a);
      if (!attachmentsHandedOff.current && !shouldRetainPendingAttachments()) {
        setPendingAttachments(null);
      }
    };
  }, []);

  // Arriving with #pricing (the footer's Pricing from another page): the
  // section may not exist yet (lazy) and what is above it may still be growing,
  // so one try at 80 ms sometimes stopped short. Try until it exists, then
  // correct once more after the page settles. (#pricing appears only once the
  // plans have loaded: ~4 s on staging, more on a slow phone.)
  useEffect(() => {
    const hash = (location.hash || window.location.hash).replace(/^#/, "");
    if (!hash || !SECTION_IDS.has(hash)) return;
    const started = Date.now();
    let settle: number | undefined;
    const timer = window.setInterval(() => {
      if (scrollToMarketingSection(hash, "smooth")) {
        window.clearInterval(timer);
        settle = window.setTimeout(() => scrollToMarketingSection(hash, "auto"), 600);
      } else if (Date.now() - started > 10_000) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(settle);
    };
  }, [location.hash, location.pathname]);

  /** Get started opens signup overlay on the landing page. */
  const openAuth = (mode: "login" | "signup") => {
    setPendingPrompt(prompt);
    // Signed in, "Get started" goes to the dashboard, not a sign-in modal.
    if (user) {
      navigate("/");
      return;
    }
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const goLogin = () => openAuth("login");

  const goBuild = async (text?: string) => {
    const p = (text ?? prompt).trim();
    const files = heroAttachments.map((a) => a.file);
    if (!p && files.length === 0) return;

    if (!user) {
      if (p) setPendingPrompt(p);
      openAuth("signup");
      return;
    }

    if (busy) return;
    setBusy(true);
    try {
      const workspaces = await api.get<WorkspaceSummary[]>("/v1/workspaces");
      const stored = localStorage.getItem(WS_KEY) ?? undefined;
      const ws =
        workspaces.find((w) => w.id === stored) ??
        workspaces.find((w) => w.isDefault) ??
        workspaces[0];
      if (!ws) throw new Error("no_workspace");
      localStorage.setItem(WS_KEY, ws.id);

      const { id, prompt: createdPrompt } = await createProject({
        workspaceId: ws.id,
        prompt: p || undefined,
      });
      if (files.length) {
        attachmentsHandedOff.current = true;
        setPendingAttachments(files);
      }
      setHeroAttachments((prev) => {
        for (const a of prev) revokeHeroAttachment(a);
        return [];
      });
      navigate(`/p/${id}`, {
        state: createdPrompt || p ? { prompt: createdPrompt ?? p } : undefined,
      });
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string; limit?: number } }).body;
      if (body?.error === "project_limit") {
        toast("error", fill(m.home.projectLimit, { limit: body.limit ?? "" }));
        openUpgrade("plans");
      } else {
        toast("error", m.home.createFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    // Marketing shell: bg-background relative min-h-screen w-full
    <div className="relative min-h-screen w-full overflow-x-clip text-white" style={{ background: PAGE }}>
      <MarketingNav onGetStarted={() => openAuth("signup")} onLogin={goLogin} />

      <main id="main-content" className="relative w-full">
        {/* Hero — Background absolute + parallax 0.3 (NormalLandingPage) */}
        <section
          id="hero"
          className="relative flex min-h-screen w-full scroll-mt-0 flex-col items-center justify-center overflow-hidden px-5 py-[20vh] pb-[24vh] 2xl:py-48 2xl:pb-52"
        >
          <PulseBackground position="absolute" parallax={0.3} />

          <div className="relative z-10 mb-4 flex w-full max-w-[38rem] flex-col items-center text-center md:mb-6">
            <h1
              className="mb-2 leading-none font-semibold text-white md:mb-2.5"
              style={{ fontSize: "clamp(1.875rem, 1.479rem + 1.69vw, 3rem)" }}
            >
              {m.home.heroTitle}
            </h1>

            <p className="mb-6 max-w-[25ch] text-center text-lg leading-tight text-[#c8c4bd] md:max-w-full md:text-xl">
              {m.home.heroSubtitle}
            </p>

            <div className="w-full">
              <LocalAttachComposer
                value={prompt}
                onChange={setPrompt}
                attachments={heroAttachments}
                onAttachmentsChange={setHeroAttachments}
                onSubmit={() => void goBuild()}
                typewriterPrefix={heroTypewriter.prefix}
                typewriterWords={heroTypewriter.words}
                autoFocus
                guest={!user}
                onLogin={goLogin}
                modes={CHAT_PROMPT_MODES}
                busy={busy}
                onError={(msg) => toast("error", msg)}
              />
            </div>
          </div>
        </section>

        <div className={CONTENT}>
          <div id="meet" className={VIEWPORT_SECTION}>
            <Suspense fallback={null}>
              <MeetMythex />
            </Suspense>
          </div>

          <Suspense fallback={null}>
            <ExamplesGallery />
          </Suspense>

          <section id="stats" className="scroll-mt-16 py-16 md:py-20">
            <h2 className="mb-2.5 text-4xl leading-[1.1] font-semibold tracking-tight md:text-5xl">
              {m.home.statsTitle} <AnimatedGradientText>{m.home.statsTitleAccent}</AnimatedGradientText>
            </h2>
            <Reveal>
              <p className="mb-10 max-w-xl text-lg leading-snug text-[#fcfbf8]">
                {m.home.statsSubtitle}
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              {STATS.map((s, i) => (
                <Reveal key={s.label} delayMs={120 + i * 90}>
                  <div
                    className="flex flex-col gap-36 rounded-3xl px-4 py-6 md:px-5"
                    style={{ background: SURFACE }}
                  >
                    <p className="text-6xl leading-none font-medium text-white">{s.n}</p>
                    <p className="mt-auto text-base text-balance text-white">{s.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {(
            // Full width: the white band runs edge to edge out of the centred column; its content keeps the page's width.
            <section id="measured" className="mx-[calc(50%-50vw)] my-16 scroll-mt-16 bg-white text-[#0b0b0c] md:my-20">
              <div className={`${CONTENT} py-16 md:py-24`}>
                <h2 className="mb-2.5 text-4xl leading-[1.1] font-semibold tracking-tight md:text-5xl">
                  {m.compareVisuals.heading}{" "}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{ backgroundImage: "linear-gradient(90deg, #f97316 0%, #e11d48 55%, #be123c 100%)" }}
                  >
                    {m.compareVisuals.headingAccent}
                  </span>
                </h2>
                <p className="mb-10 max-w-xl text-lg leading-snug text-[#3f3f46]">
                  {m.compareVisuals.subtitle}
                </p>
                <Suspense fallback={null}>
                  <CompareGrid />
                </Suspense>
                <div className="mt-10">
                  <Suspense fallback={null}>
                    <HeadToHeadChart />
                  </Suspense>
                </div>
              </div>
            </section>
          )}

          <Suspense fallback={null}>
            <LandingPricing onSignup={() => openAuth("signup")} />
          </Suspense>
        </div>

        {/* Footer CTA — pulse fades in from the top so it blends with the page (no hard seam). */}
        <div className="relative z-10 overflow-hidden pb-10 sm:pb-12 lg:pb-16">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, #000 32%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 32%)",
            }}
          >
            <PulseBackground position="absolute" parallax={0} />
          </div>

          <div className="relative mx-auto flex min-h-[70dvh] w-full scroll-mt-16 flex-col justify-center px-5 py-28 md:max-w-xl md:px-0 md:py-36">
            <Reveal>
              <h1 className="mb-2 block text-center text-xl font-normal text-[#d4d0c9]">
                {m.home.ctaEyebrow}
              </h1>
            </Reveal>
            <h2 className="mb-8 text-center text-4xl leading-[1.1] font-semibold tracking-tight md:text-6xl">
              <AnimatedGradientText>{m.home.ctaTitle}</AnimatedGradientText>
            </h2>
            <Reveal delayMs={100} className="w-full">
              <LocalAttachComposer
                value={prompt}
                onChange={setPrompt}
                attachments={heroAttachments}
                onAttachmentsChange={setHeroAttachments}
                onSubmit={() => void goBuild()}
                typewriterPrefix={heroTypewriter.prefix}
                typewriterWords={heroTypewriter.words}
                guest={!user}
                onLogin={goLogin}
                modes={CHAT_PROMPT_MODES}
                busy={busy}
                onError={(msg) => toast("error", msg)}
              />
            </Reveal>
          </div>

          <MarketingFooter />
        </div>
      </main>

      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthOpen(false)}
          prompt={prompt.trim() || undefined}
          onSwitchMode={(next) => setAuthMode(next)}
        />
      )}
    </div>
  );
}
