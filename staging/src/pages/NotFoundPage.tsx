import { Link } from "react-router-dom";
import { useNativeBleedTop } from "../lib/native-bleed-top";
import { useEffect } from "react";
import { useI18n } from "../i18n/useI18n";

/** Client-side unknown routes — noindex; Worker also 404s junk on staging. */
export function NotFoundPage() {
  // Paints its own background, a step off <body>'s — so it takes the status
  // bar inset itself rather than leaving a seam across the top.
  useNativeBleedTop();
  const { m, lp } = useI18n();
  useEffect(() => {
    document.title = `${m.notFound.title} — Mythex`;
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex,nofollow");
  }, [m]);

  return (
    <main
      className="native-inset-top min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "#1f1f1e", color: "#f5f5f4" }}
    >
      <h1 className="text-2xl font-semibold">{m.notFound.title}</h1>
      <p className="text-sm opacity-70 max-w-md">
        {m.notFound.body}
      </p>
      <p className="flex gap-4 text-sm">
        <Link to={lp("/")} className="underline underline-offset-2">
          {m.notFound.home}
        </Link>
        <Link to={lp("/templates")} className="underline underline-offset-2">
          {m.notFound.templates}
        </Link>
      </p>
    </main>
  );
}
