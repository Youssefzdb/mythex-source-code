import { type ReactNode } from "react";
import { X } from "lucide-react";
import { Reveal } from "./motion";
import { useT } from "../../i18n/app";

/** One thing the composer's shelf can say. */
export type ShelfNotice = {
  /** Which notice this is — the row is keyed by it. */
  key: string;
  icon: ReactNode;
  title: ReactNode;
  /** A short aside after the title (a discount, a balance). */
  detail?: ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** A quieter second action, before the main one. */
  secondary?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  dismissLabel?: string;
  testId?: string;
};

/**
 * What the composer has to tell you, on the composer — Lovable's shelf.
 *
 * Out of credits, the Pro trial, notifications: each used to be its own strip
 * floating above the composer, in a smaller type, and they stacked — out of
 * credits and the trial offer at once offered the same trial twice. The shelf
 * is the composer's own frame: a darker card with the hairline ring, a row
 * per notice across its top (credits, then the trial, then notifications,
 * divided by a hairline), and the composer sitting in it underneath. Each row
 * grows in and out on its own; without a notice the composer is just the
 * composer.
 */
export function ComposerShelf({ notices, children }: { notices: ShelfNotice[]; children: ReactNode }) {
  const open = notices.length > 0;
  // Every notice that could be on the shelf gets a slot, in order, so one
  // coming or going grows or shrinks in place rather than re-flowing the rest.
  const slots = SLOT_ORDER.map((key) => notices.find((n) => n.key.startsWith(key)) ?? null);
  const shown = slots.filter(Boolean).length;
  let seen = 0;
  return (
    <div className="notify-shelf" data-open={open ? "true" : "false"}>
      {slots.map((notice, i) => {
        const first = notice ? seen++ === 0 : false;
        return (
          <Reveal key={SLOT_ORDER[i]} show={Boolean(notice)}>
            {notice && <ShelfRow notice={notice} divided={!first && shown > 1} />}
          </Reveal>
        );
      })}
      {children}
    </div>
  );
}

/** The shelf's rows, top to bottom (a notice's key starts with its slot). */
const SLOT_ORDER = ["credits", "trial", "notify"];

function ShelfRow({ notice, divided }: { notice: ShelfNotice; divided: boolean }) {
  const t = useT();
  return (
    <div
      // A container, so the row can give up its extras when it is narrow (a
      // phone, a chat column beside the preview) and keep the title whole.
      className={`@container flex h-11 items-center gap-2 pe-2 ps-5 ${divided ? "border-t border-white/[0.06]" : ""}`}
      role="region"
      aria-label={typeof notice.title === "string" ? notice.title : t.chat.shelf.notice}
      data-testid={notice.testId}
    >
      <span className="grid size-[18px] shrink-0 place-items-center text-white/60 [&>svg]:size-[18px]" aria-hidden>
        {notice.icon}
      </span>
      {/* Lovable's size for it, measured: its "Get notified when Lovable
          finishes" is 212px wide, which in this font is 14px at 450 — their
          small control type, a touch heavier than regular. */}
      <p className="min-w-0 truncate text-[14px] leading-[21px] font-[450] text-fg">
        {notice.title}
        {/* The aside (a discount) goes first when there is no room. */}
        {notice.detail && <span className="hidden @[26rem]:inline">{notice.detail}</span>}
      </p>
      <span className="min-w-0 flex-1" />
      {notice.secondary && (
        <button
          type="button"
          onClick={notice.secondary.onClick}
          // Only with room for it: the main action and the title come first.
          className="hidden h-7 shrink-0 rounded-full px-3 text-[14px] font-[450] text-white/70 transition hover:bg-white/[0.06] hover:text-white @[30rem]:block"
        >
          {notice.secondary.label}
        </button>
      )}
      {notice.action && (
        <button
          type="button"
          onClick={notice.action.onClick}
          disabled={notice.action.disabled}
          className="h-7 shrink-0 rounded-full bg-white px-3 text-[14px] font-[450] text-[#141413] transition hover:bg-[#f0ebe3] disabled:opacity-60"
        >
          {notice.action.label}
        </button>
      )}
      {notice.onDismiss && (
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={notice.dismissLabel ?? t.chat.shelf.dismiss}
          onClick={notice.onDismiss}
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
