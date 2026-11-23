import { BookOpen, Rocket, CalendarCheck, Camera, Compass, MousePointerClick, Palette, ScanLine, ShoppingBag, SquareKanban, Sparkles, UtensilsCrossed } from "lucide-react";
import { connectorLogo } from "../../lib/connectors";
import { type StarterIdea } from "./types";
import { useMemo } from "react";
import { useT, type AppMessages } from "../../i18n/app";

type StarterKey = keyof AppMessages["chat"]["starters"];

/** The ideas by group; their words come from the catalog, in the app's language. */
const STARTER_GROUPS: Array<{ id: string; ideas: Array<{ key: StarterKey; icon: StarterIdea["icon"] }> }> = [
  {
    id: "apps",
    ideas: [
      { key: "store", icon: ShoppingBag },
      { key: "photos", icon: Camera },
      { key: "booking", icon: CalendarCheck },
      { key: "taskBoard", icon: SquareKanban },
    ],
  },
  {
    id: "images",
    ideas: [
      { key: "logo", icon: Palette },
      { key: "illustrated", icon: Sparkles },
      { key: "recipes", icon: UtensilsCrossed },
      { key: "pictureBook", icon: BookOpen },
    ],
  },
  {
    id: "tools",
    ideas: [
      { key: "sheetDashboard", icon: { app: "googlesheets" } },
      { key: "notionSite", icon: { app: "notion" } },
      { key: "repoPage", icon: { app: "github" } },
      { key: "roadmap", icon: { app: "linear" } },
    ],
  },
  {
    id: "start",
    ideas: [
      { key: "screenshot", icon: ScanLine },
      { key: "redesign", icon: MousePointerClick },
      { key: "research", icon: Compass },
      { key: "clone", icon: Rocket },
    ],
  },
];

// Two rows of idea pills drifting in opposite directions (see .starter-marquee
// in index.css). The groups are dealt round-robin into the rows so every row
// mixes apps, images, tools and remixes. Each track is rendered twice and
// slides by exactly one copy, so the loop has no seam; the second copy is
// hidden from assistive tech and the tab order. Hover or focus pauses a row;
// with reduced motion the rows sit still and scroll by hand.
function starterRows(t: AppMessages): StarterIdea[][] {
  const dealt: StarterIdea[] = [];
  const longest = Math.max(...STARTER_GROUPS.map((g) => g.ideas.length));
  for (let i = 0; i < longest; i++) {
    for (const g of STARTER_GROUPS) {
      const idea = g.ideas[i];
      if (idea) dealt.push({ ...t.chat.starters[idea.key], icon: idea.icon });
    }
  }
  return [dealt.filter((_, i) => i % 2 === 0), dealt.filter((_, i) => i % 2 === 1)];
}

function StarterPill({
  idea,
  onPick,
  disabled,
  hidden,
}: {
  idea: StarterIdea;
  onPick: (prompt: string) => void;
  disabled: boolean;
  hidden?: boolean;
}) {
  return (
    <button
      onClick={() => onPick(idea.prompt)}
      disabled={disabled}
      tabIndex={hidden ? -1 : undefined}
      title={idea.hint}
      dir="auto"
      className="btn-surface inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pe-3.5 ps-2.5 text-[12.5px] font-medium whitespace-nowrap text-fg-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {"app" in idea.icon ? (
        // White badge, as on the connectors pill: some marks (GitHub,
        // Notion) are black and vanish on the dark surface without it.
        <img
          src={connectorLogo(idea.icon.app)}
          alt=""
          referrerPolicy="no-referrer"
          className="size-4 shrink-0 rounded-full bg-white object-contain p-[2px]"
        />
      ) : (
        <idea.icon size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
      )}
      {idea.title}
    </button>
  );
}

export function StarterIdeas({ onPick, disabled }: { onPick: (prompt: string) => void; disabled: boolean }) {
  const t = useT();
  const rows = useMemo(() => starterRows(t), [t]);
  return (
    <div
      className="starter-marquee mt-8 flex w-[calc(100%+2.5rem)] flex-col gap-2"
      data-testid="starter-ideas"
      aria-label={t.chat.starterIdeas}
      role="group"
    >
      {rows.map((row, r) => (
        // The drift is a physical translateX(-50%), so the row is laid out
        // left to right in every language; each pill sets its own direction.
        <div key={r} className="starter-marquee-row" dir="ltr">
          <div className={`starter-marquee-track ${r % 2 ? "starter-marquee-track--reverse" : ""}`}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 gap-2 pe-2" aria-hidden={copy === 1 || undefined}>
                {row.map((idea) => (
                  <StarterPill
                    key={idea.title}
                    idea={idea}
                    onPick={onPick}
                    disabled={disabled}
                    hidden={copy === 1}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
