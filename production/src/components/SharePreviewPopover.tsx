/**
 * Preview share links — the panel behind the header's Share button.
 *
 * Publish answers "is this finished"; this answers "can someone look at it
 * now". They are different questions, which is why this is its own panel rather
 * than a row inside the publish one: a link made here points at the workspace's
 * live sandbox, changes as the agent works, and stops existing the moment its
 * owner deletes it.
 *
 * More than one link because one link cannot be taken back from one person. A
 * link per audience — a client, a designer, a group chat — is what makes
 * deleting it a decision about that audience rather than about everybody.
 *
 * Two steps, one panel. Naming a link is a small form, and a small form that
 * opens inside a list pushes the list around and leaves you unsure whether you
 * are reading or writing. Sliding to it says plainly that you have gone
 * somewhere, and the back arrow says how to return — the gesture every phone
 * settings screen has already taught.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ChevronRight, Copy, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Spinner, useToast } from "./ui";
import { PANEL_MOTION_MS, PanelSteps } from "./ui/PanelSwap";
import { AnchoredPopover } from "./ui/Popover";
import { ModalSurface, SurfaceScroll, useIsPhone } from "./ui/Sheet";
import {
  btnClass,
  CARD_BG,
  FG_TERTIARY,
  floatingRing,
  PANEL_BG,
  surfaceRing,
} from "../lib/surfaces";
import { appT, fill, pl, useT, type AppMessages } from "../i18n/app";

export interface PreviewShare {
  id: string;
  name: string;
  /** Null when this deployment has no preview domain (local dev). */
  url: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  views: number;
}

interface ShareList {
  supported: boolean;
  shares: PreviewShare[];
}

/** The slide's own duration, so focus lands after it rather than during. */
const SLIDE_MS = PANEL_MOTION_MS;

/** What a row says about itself, under its name. */
function subtitle(share: PreviewShare, t: AppMessages): string {
  const s = t.workspace.sharePreview;
  if (!share.url) return s.needsDomain;
  if (share.views === 0) return s.notOpened;
  return pl(s.opened, share.views);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SharePreviewPopover({
  projectId,
  onClose,
  anchorRef,
  open = true,
}: {
  projectId: string;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** When false, plays the exit animation then unmounts. */
  open?: boolean;
}) {
  const t = useT();
  const s = t.workspace.sharePreview;
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const phone = useIsPhone();
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [shares, setShares] = useState<PreviewShare[]>([]);
  const [view, setView] = useState<"list" | "create">("list");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ShareList>(`/v1/projects/${projectId}/preview-shares`);
      setShares(res.shares);
      setSupported(res.supported);
    } catch {
      setError(appT().workspace.sharePreview.loadFailed);
    } finally {
      setReady(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const backToList = useCallback(() => {
    setView("list");
    setName("");
    setError(null);
  }, []);

  // Escape walks back a step before it closes the panel, the same route the
  // arrow offers — so a half-typed name is never lost to one keystroke. Base UI
  // owns the key; this answers first.
  const onEscape = () => {
    if (view !== "create") return false;
    backToList();
    return true;
  };

  /**
   * Focus the field once the slide has landed — and never let focusing scroll.
   *
   * The two steps live in a box that clips a track twice its width, which makes
   * that box scrollable whether or not anyone wants it to be. Focusing a field
   * inside it makes the browser bring that field into view by *scrolling*,
   * which lands on top of the transform: 420px of transform plus 420px of
   * scrollLeft put both steps off-screen and left the panel showing an empty
   * card. `preventScroll` stops it at the source; `PanelSteps` pins the box's
   * scroll as the guard for everything else that scrolls a child into view.
   */
  useEffect(() => {
    if (view !== "create") return;
    const timer = setTimeout(() => nameRef.current?.focus({ preventScroll: true }), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [view]);

  // A copied link is worth saying, but not worth remembering — the row goes
  // back to what it was so the panel does not accumulate stale confirmations.
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 2400);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const createLink = async () => {
    setCreating(true);
    setError(null);
    try {
      const share = await api.post<PreviewShare>(`/v1/projects/${projectId}/preview-shares`, {
        name: name.trim() || undefined,
      });
      setShares((cur) => [share, ...cur]);
      setName("");
      // Back to the list, where the new link is: the form has nothing left to
      // say, and the thing worth looking at is the row that just appeared.
      setView("list");
      // The reason anyone opened this panel is to get the link, so put it on
      // the clipboard rather than making them press a second button for it.
      if (share.url && (await copy(share.url))) setCopiedId(share.id);
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string })?.error : null;
      setError(
        code === "share_limit"
          ? s.limitReached
          : code === "invalid_name"
            ? s.nameTooLong
            : s.createFailed,
      );
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (share: PreviewShare) => {
    if (!share.url) return;
    if (await copy(share.url)) setCopiedId(share.id);
    else toast("error", s.copyFailed);
  };

  const remove = async (share: PreviewShare) => {
    setBusyId(share.id);
    setError(null);
    const previous = shares;
    setShares((cur) => cur.filter((x) => x.id !== share.id));
    try {
      await api.delete(`/v1/projects/${projectId}/preview-shares/${share.id}`);
      toast("info", fill(s.deleted, { name: share.name }));
    } catch {
      // Put it back: a link that looks deleted but is not is the one mistake
      // this panel must never make.
      setShares(previous);
      setError(s.deleteFailed);
    } finally {
      setBusyId(null);
    }
  };

  const listView = (
    <div className="p-4 pt-3.5">
      <div className="pe-8">
        <h2 className="text-[18px] leading-[27px] font-medium text-white">{s.title}</h2>
        <p className="mt-0.5 text-[14px] leading-[21px] text-fg-2">
          {s.intro}
        </p>
      </div>

      {!supported && (
        <p className="mt-3 text-[14px] leading-[21px] text-amber-300">
          {s.unsupported}
        </p>
      )}

      <p className="mt-4 mb-1.5 text-[14px] leading-[21px] font-medium text-white">
        {s.activeLinks}
      </p>

      <div className="overflow-hidden rounded-[10px] border border-line">
        {!ready ? (
          <div className="flex items-center gap-2 px-3.5 py-3.5" aria-busy>
            <Spinner size={14} />
            <span className="text-[14px] text-fg-2">{s.loadingLinks}</span>
          </div>
        ) : (
          <>
            {shares.length === 0 && (
              <p className="px-3.5 py-3.5 text-[14px] leading-[21px] text-fg-2">
                {s.empty}
              </p>
            )}

            {shares.map((share) => (
              <div
                key={share.id}
                className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-start text-[14px] leading-[21px] font-medium text-white rtl:text-right">
                    {share.name}
                  </p>
                  {/* Plain white for the confirmation, not a colour: this
                      palette sends every piece of action text to the
                      foreground (see index.css), so `text-accent` here would
                      look deliberate and render identically. */}
                  <p
                    className="truncate text-[13px] leading-[20px]"
                    style={{ color: copiedId === share.id ? "#fff" : FG_TERTIARY }}
                  >
                    {copiedId === share.id ? s.copiedToClipboard : subtitle(share, t)}
                  </p>
                </div>
                {/* The icon does not change when a link is copied. The line
                    under the name already says it, and a button that turns
                    into a tick is a button you have to look at twice to press
                    again — which is exactly what someone does when the first
                    paste went to the wrong window. */}
                <button
                  type="button"
                  onClick={() => void copyLink(share)}
                  disabled={!share.url || busyId === share.id}
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-white/80 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  aria-label={fill(s.copyLinkFor, { name: share.name })}
                  title={t.common.copyLink}
                >
                  <Copy className="size-4" />
                </button>
                {/* No ring at rest: a bin that is always outlined reads as the
                    second half of a pair of buttons, when it is the one
                    irreversible thing on the row. The circle arrives on hover,
                    once the pointer has already chosen it. */}
                <button
                  type="button"
                  onClick={() => void remove(share)}
                  disabled={busyId === share.id}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-red-400 transition hover:bg-red-500/[0.12] hover:text-red-300 disabled:opacity-40"
                  aria-label={fill(s.deleteLinkNamed, { name: share.name })}
                  title={s.deleteLink}
                >
                  {busyId === share.id ? <Spinner size={14} /> : <Trash2 className="size-4" />}
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setView("create")}
              className="flex w-full items-center gap-3 border-t border-line px-3.5 py-3 text-start transition hover:bg-white/[0.04]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-white/80">
                <Plus className="size-4" />
              </span>
              <span className="flex-1 text-[14px] leading-[21px] font-medium text-white">
                {s.createNew}
              </span>
              <ChevronRight className="size-4 shrink-0 text-white/35 rtl:-scale-x-100" />
            </button>
          </>
        )}
      </div>

      {error && view === "list" && (
        <p className="mt-3 text-[13px] leading-5 text-red-400">{error}</p>
      )}
    </div>
  );

  const createView = (
    <div className="p-4 pt-3.5">
      {/* The arrow carries the title rather than sitting above it: one line
          that is both where you are and the way back. */}
      <div className="flex items-center gap-1.5 pe-8">
        <button
          type="button"
          onClick={backToList}
          className="-ms-1 grid size-7 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={s.backToLinks}
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
        </button>
        <h2 className="text-[18px] leading-[27px] font-medium text-white">
          {s.createNew}
        </h2>
      </div>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void createLink();
        }}
      >
        <label
          htmlFor="share-link-name"
          className="mb-1.5 block text-[14px] leading-[21px] font-medium text-white"
        >
          {s.linkName}
        </label>
        <input
          id="share-link-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={s.linkNamePlaceholder}
          className="h-10 w-full rounded-[10px] border border-line bg-input px-3 text-[14px] text-white outline-none placeholder:text-white/35"
        />
        <p className="mt-1.5 text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
          {s.linkNameHint}
        </p>

        {error && view === "create" && (
          <p className="mt-3 text-[13px] leading-5 text-red-400">{error}</p>
        )}

        <button type="submit" disabled={creating} className={`${btnClass("lg")} mt-4 w-full`}>
          {creating ? <Spinner size={14} /> : s.createLink}
        </button>
      </form>
    </div>
  );

  // Base UI: a popover out of the Share button on a desktop — growing from
  // it, and gone again on an outside press (the preview iframe included,
  // which is why the old version needed a full-screen backdrop) — and a
  // bottom sheet on a phone, where Share is opened from the ⋯ menu.
  const panel = (
    <>
        {/* A phone's sheet closes by its grab handle, a pull, or a tap outside. */}
        {!phone && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 end-3 z-10 grid size-7 place-items-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            aria-label={t.common.close}
          >
            <X className="size-4" />
          </button>
        )}

        {/* Content on the card surface, the note on the shell below it — the
            same two-tone the publish popover uses, so the two panels read as
            one family rather than two people's work. */}
        <div
          className="overflow-hidden rounded-[inherit]"
          // In a phone's sheet, the sheet's own colour: a lighter card inside
          // it split the sheet in two under its grab handle.
          style={phone ? undefined : { background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.14, "255,255,255") }}
        >
          <PanelSteps index={view === "create" ? 1 : 0} steps={[listView, createView]} />
        </div>

        <p className="px-4 py-3 text-[12px] leading-[18px] text-fg-2">
          {s.footnote}
        </p>
    </>
  );

  if (phone) {
    return (
      <ModalSurface
        open={open}
        onClose={onClose}
        label={s.title}
        sheet
        zIndex={80}
        testId="share-popover"
        className="relative"
        style={{ background: PANEL_BG }}
      >
        <SurfaceScroll className="native-safe-bottom">{panel}</SurfaceScroll>
      </ModalSurface>
    );
  }

  return (
    <AnchoredPopover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      onEscape={onEscape}
      align="end"
      sideOffset={8}
      label={s.title}
      testId="share-popover"
      className="relative w-[min(100vw-1.5rem,26.25rem)] overflow-hidden rounded-[20px]"
      style={{ background: PANEL_BG, boxShadow: floatingRing(PANEL_BG) }}
    >
      {panel}
    </AnchoredPopover>
  );
}
