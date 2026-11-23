import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Mythex's background, behind the home hero, the footer prompt, the dashboard
 * and the loading screen: a lilac-to-flame sea filling the lower half, its
 * light rising above the horizon, two soft suns sitting on it, on the page's
 * own dark (#1c1c1c).
 *
 * Painted once, small, softened in code, onto a canvas that the browser
 * scales up smoothly. (A live CSS `filter: blur()` on a layer this size made
 * iOS Safari re-blur it on every repaint above it; typing in the dashboard
 * composer dropped to ~7fps.)
 *
 * It enters the way Lovable's background does (measured): rising from 50vh
 * lower while fading in over 1.6s (ease-out-cubic); then it drifts on a slow
 * 24s sway (transform only, so nothing repaints). The entrance plays once per
 * page load, shared across copies (see enterStartedAt), and again on
 * `restartBackgroundAnimation`.
 */
/**
 * One entrance per page load, shared by every copy of the background: when
 * it started (null until the first copy mounts). A copy that mounts while it
 * is still running (the dashboard taking over from the loading screen) picks
 * it up where it is; one that mounts after it finished shows the background
 * at rest, so moving around the app never replays it.
 */
const ENTER_MS = 1600;
let enterStartedAt: number | null = null;
const enterElapsed = () => (enterStartedAt === null ? 0 : performance.now() - enterStartedAt);

/** Lilac flame, from the horizon down: lilac, orchid, rose, flame. */
const COLORS = ["#8b7bff", "#d07bff", "#ff5a7a", "#ff7a2f"] as const;
/** The page's own dark. */
const GROUND = "#1c1c1c";
/** Canvas width the picture is painted at; the browser's upscale softens it into light. */
const PAINT_WIDTH = 160;
/** The canvas width (a 1440px box plus the 12% drift margin each side) where a blur of 3 is right. */
const BLUR_AT_WIDTH = 1440 * 1.24;

type Ctx = CanvasRenderingContext2D;

const rgba = (i: number, a = 1) => {
  const h = COLORS[i];
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
};

const ell = (x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string) => {
  x.fillStyle = c;
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  x.fill();
};

/**
 * The picture in a w × h frame: the glow above the horizon, the sea, the two
 * suns. On `ground` (the page's dark), or see-through above the light so the
 * page shows (a light page's cream, in the footer section).
 */
function paint(x: Ctx, w: number, h: number, horizonAt: number, ground: boolean) {
  if (ground) {
    x.fillStyle = GROUND;
    x.fillRect(-w, -h, w * 3, h * 3);
  }
  const horizon = h * horizonAt;
  // Glow above the horizon: 0.26 of the height (chosen in the background studio).
  const glow = 0.26;
  const haze = x.createLinearGradient(0, horizon - h * glow, 0, horizon + h * 0.02);
  haze.addColorStop(0, rgba(0, 0));
  haze.addColorStop(1, rgba(0, 0.75));
  x.fillStyle = haze;
  x.fillRect(-w * 0.2, horizon - h * glow, w * 1.4, h * (glow + 0.05));
  // The warm colours reach well up the sea (chosen in the background studio: "reach" 0.50).
  const sea = x.createLinearGradient(0, horizon, 0, h * 1.12);
  sea.addColorStop(0, rgba(0));
  sea.addColorStop(0.2, rgba(1));
  sea.addColorStop(0.35, rgba(2));
  sea.addColorStop(1, rgba(3));
  x.fillStyle = sea;
  x.fillRect(-w * 0.2, horizon, w * 1.4, h * 0.8);
  // Flat ovals on the horizon. Their height follows the box's height, so on a
  // tall phone screen they grew almost round and read as two blobs: never
  // taller than on a 16:10 desktop (about a quarter of their width).
  const sunH = Math.min(h * 0.05, w * 0.032);
  ell(x, w * 0.3, horizon, w * 0.13, sunH, rgba(0));
  ell(x, w * 0.7, horizon, w * 0.13, sunH, rgba(0));
}

/**
 * Soften the small painted picture in place: three passes of a box blur
 * across and down (close to a gaussian), so the browser's upscale is smooth
 * light with no steps. Runs once per size, on a few thousand pixels.
 */
function soften(x: Ctx, w: number, h: number, r: number) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  // Blur premultiplied colour, so see-through pixels don't pull the light toward black.
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] *= a;
    d[i + 1] *= a;
    d[i + 2] *= a;
  }
  const tmp = new Float32Array(d.length);
  const pass = (horizontal: boolean) => {
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        const at = (i: number) => {
          const k = Math.min(inner - 1, Math.max(0, i));
          return ((horizontal ? o * w + k : k * w + o) << 2) + c;
        };
        for (let i = -r; i <= r; i++) sum += d[at(i)];
        for (let i = 0; i < inner; i++) {
          tmp[at(i)] = sum / (2 * r + 1);
          sum += d[at(i + r + 1)] - d[at(i - r)];
        }
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = tmp[i];
  };
  for (let n = 0; n < 3; n++) {
    pass(true);
    pass(false);
  }
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a > 0) {
      d[i] = Math.min(255, d[i] / a);
      d[i + 1] = Math.min(255, d[i + 1] / a);
      d[i + 2] = Math.min(255, d[i + 2] / a);
    }
  }
  x.putImageData(img, 0, 0);
}

/**
 * Embers rising from the light (from the background studio: "Embers rising from
 * the light"): small pink and orange sparks that leave the horizon and fade as
 * they climb. Drawn at screen resolution on their own layer, not blurred; still
 * for reduced motion, paused off screen.
 */
function EmberLayer({ horizon }: { horizon: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const size = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * d);
      cv.height = Math.round(r.height * d);
    };
    // Each ember rises from the light at its own speed, sways a little and fades out as it climbs.
    const draw = (t: number) => {
      const x = cv.getContext("2d");
      if (!x || !cv.width) return;
      const w = cv.width, h = cv.height, d = Math.min(2, window.devicePixelRatio || 1);
      x.clearRect(0, 0, w, h);
      // A fixed seed, so every ember keeps its path from frame to frame.
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const start = horizon + 0.05, end = 0.05;
      const count = Math.round(50 * Math.min(1.6, Math.max(0.6, w / d / 1280)));
      for (let i = 0; i < count; i++) {
        const bx = rnd(), speed = 0.03 + rnd() * 0.06, phase = rnd(), R = (rnd() * 1.3 + 0.5) * d;
        const life = (phase + t * speed) % 1;
        const X = (bx + Math.sin(t * 0.8 + i) * 0.01) * w;
        const Y = h * (start - life * (start - end));
        x.fillStyle = rgba(i % 2 ? 2 : 3, 0.6 * (1 - life));
        x.beginPath();
        x.arc(X, Y, R, 0, Math.PI * 2);
        x.fill();
      }
    };
    const loop = (now: number) => {
      draw(now / 1000);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const resume = () => {
      if (still) return draw(1.5);
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    size();
    resume();
    const ro = new ResizeObserver(() => {
      size();
      if (still) draw(1.5);
    });
    ro.observe(cv);
    // Only move while on screen and while the tab is in front.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      resume();
    });
    io.observe(cv);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [horizon]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

export function PulseBackground({
  className = "",
  parallax = 0,
  position = "fixed",
  horizon = 0.5,
  ground = true,
  embers = true,
}: {
  /** Small embers rising from the light into the dark; off where the top is a light page. */
  embers?: boolean;
  /** Where the horizon sits, 0 (top) to 1 (bottom) of the box. */
  horizon?: number;
  /** Paint the page's dark behind the light; false leaves it see-through so the page shows above it. */
  ground?: boolean;
  className?: string;
  /** Scroll parallax factor (the landing hero uses 0.3). */
  parallax?: number;
  /** Default is fixed; in-page sections pass absolute. */
  position?: "fixed" | "absolute";
}) {
  const [tick, setTick] = useState(0);
  const enterRef = useRef<HTMLDivElement>(null);
  // Join the shared entrance at the moment this copy reaches the screen, not when it first
  // rendered: a page can render, wait (a lazy route, a suspended child) and only appear
  // later, and an offset taken at render would put it behind and replay part of the rise.
  useLayoutEffect(() => {
    const el = enterRef.current;
    if (!el) return;
    if (enterStartedAt === null) enterStartedAt = performance.now();
    const at = enterElapsed();
    el.style.animation = at >= ENTER_MS ? "none" : `mx-pulse-enter ${ENTER_MS}ms cubic-bezier(.33,1,.68,1) -${Math.round(at)}ms both`;
  }, [tick]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // Paint once per size: a small canvas, its aspect matching the box.
  useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const draw = () => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const w = PAINT_WIDTH;
      const h = Math.max(24, Math.round((PAINT_WIDTH * r.height) / r.width));
      // The blur is in painted pixels, and a painted pixel is as wide as the
      // screen over 160: on a phone the same 3 made a blur a quarter as wide,
      // and the glow's edges looked sharp. Keep it the same width on screen
      // as on a 1440px desktop (3 there), up to 12 on a phone.
      const blur = Math.round(Math.min(12, Math.max(3, (3 * BLUR_AT_WIDTH) / r.width)));
      const key = `${horizon}${ground}${blur}`;
      if (cv.width === w && cv.height === h && cv.dataset.key === key) return;
      cv.dataset.key = key;
      cv.width = w;
      cv.height = h;
      const x = cv.getContext("2d");
      if (!x) return;
      // The layer is 12% bigger each side (for the drift); paint the picture in the inner frame.
      x.save();
      x.translate((w * 0.12) / 1.24, (h * 0.12) / 1.24);
      if (!ground) x.clearRect(0, 0, w, h);
      paint(x, w / 1.24, h / 1.24, horizon, ground);
      x.restore();
      soften(x, w, h, blur);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [tick, horizon, ground]);

  useEffect(() => {
    const onRestart = () => {
      enterStartedAt = performance.now();
      setTick((n) => n + 1);
    };
    window.addEventListener("restartBackgroundAnimation", onRestart);
    return () => window.removeEventListener("restartBackgroundAnimation", onRestart);
  }, []);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || !parallax || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => (el.style.transform = `translate3d(0, ${(window.scrollY || 0) * parallax}px, 0)`));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [parallax]);

  const posClass = position === "absolute" || className.includes("absolute") ? "absolute" : "fixed";

  return (
    <div aria-hidden className={`pointer-events-none inset-0 w-full overflow-hidden ${posClass} ${className}`} style={{ background: ground ? GROUND : undefined }}>
      <style>{`
        @keyframes mx-pulse-enter{0%{opacity:0;transform:translateY(50vh)}100%{opacity:1;transform:none}}
        @keyframes mx-pulse-drift{0%,100%{transform:translate(0,0) scale(1)}25%{transform:translate(2.4%,-1.6%) scale(1.09)}50%{transform:translate(-1.2%,2%) scale(1.12)}75%{transform:translate(-2.8%,-.8%) scale(1.06)}}
        @media (prefers-reduced-motion: reduce){.mx-pulse-enter,.mx-pulse-drift{animation:none!important;opacity:1!important}}
      `}</style>
      <div ref={layerRef} className="absolute inset-0">
        <div
          key={tick}
          className="mx-pulse-enter absolute inset-0"
          ref={enterRef}
        >
          <div className="mx-pulse-drift absolute -inset-[12%]" style={{ animation: "mx-pulse-drift 24s ease-in-out infinite" }}>
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>
          {embers && <EmberLayer horizon={horizon} />}
        </div>
      </div>
    </div>
  );
}
