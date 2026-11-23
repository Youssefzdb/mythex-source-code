import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** framer-motion `useInView` stand-in — fires once when enough of the node is visible. */
export function useInViewOnce<T extends Element>(
  amount = 0.55,
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    // amount === 1 = fully visible; avoid rootMargin shrink or it may never fully intersect.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // For threshold < 1, isIntersecting is enough; for 1, ratio must hit 1.
        if (amount >= 1 && entry.intersectionRatio < 1) return;
        setInView(true);
        io.disconnect();
      },
      {
        threshold: amount >= 1 ? [0, 1] : amount,
        rootMargin: amount >= 1 ? "0px" : "0px 0px -10% 0px",
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount, inView]);

  return [ref, inView];
}

/** Same sweep animation as before — Mythex rose / peach / crimson instead of rainbow. */
// The gradient and its start position live in index.css (.gradient-text), so
// right-to-left pages can mirror the sweep: it starts at the reading side.
const GRADIENT_BASE: CSSProperties = {
  backgroundSize: "300% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
};

/**
 * Animated gradient title text: clipped gradient always on (starts
 * off-screen / invisible at bg-position 100%); `gradient-text-animate` is
 * applied once when fully in view (threshold/amount default 1).
 */
export function AnimatedGradientText({
  children,
  className = "",
  duration = 1.2,
  delay = 0.1,
  /** Fraction of the element that must be visible (default: 1). */
  threshold = 1,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  threshold?: number;
}) {
  const [ref, inView] = useInViewOnce<HTMLSpanElement>(threshold);

  return (
    <span
      ref={ref}
      className={`gradient-text inline ${inView ? "gradient-text-animate" : ""} ${className}`.trim()}
      style={{
        ...GRADIENT_BASE,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
    >
      {children}
    </span>
  );
}

/** Fade + slight rise when first scrolled into view (section titles / blocks). */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  amount?: number;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(amount);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform 0.75s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
