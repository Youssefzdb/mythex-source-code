import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, MessageSquarePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Session } from "../lib/api";
import type { OpenTab } from "../lib/chatTabs";
import { ConfirmDialog, Spinner } from "./ui";
import { ListRowsSkeleton } from "./loading";
import { PANEL_BG } from "../lib/surfaces";
import { ModalSurface, useIsPhone } from "./ui/Sheet";
import { AnchoredPopover } from "./ui/Popover";
import { fill, useT } from "../i18n/app";

/** The workspace header, which the popover falls back to hanging under. */
import {
  btnClass,
  CARD_BG,
  FG_SECONDARY,
  FG_TERTIARY,
  floatingRing,
  surfaceRing,
  whiteBtnClass,
} from "../lib/surfaces";

export function ChatTabs({
  openTabs,
  activeTabId,
  sessions,
  sessionsHasMore,
  sessionsLoadingMore,
  onLoadMoreSessions,
  busyThreadId,
  busySubagentIds,
  onSelectTab,
  onCloseTab,
  onNewAgent,
  onOpenThread,
  onRenameSession,
  onDeleteSession,
  historyOpenRequest,
  historyAnchorRef,
  variant = "strip",
  allowMultiple = false,
}: {
  openTabs: OpenTab[];
  activeTabId: string | null;
  sessions: Session[] | null;
  sessionsHasMore?: boolean;
  sessionsLoadingMore?: boolean;
  onLoadMoreSessions?: () => void;
  busyThreadId: string | null;
  busySubagentIds: Set<string>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewAgent: () => void;
  onOpenThread: (threadId: string, opts?: { additional?: boolean }) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  /** Increment to force-open the history popover (empty-state CTA). */
  historyOpenRequest?: number;
  /**
   * What the panel should hang from when the clock is not on screen.
   *
   * On a phone the clock is `display:none` and history is opened from the
   * workspace's ⋯ menu, so this is that button. Without it the panel fell back
   * to the header and appeared in the corner, nowhere near the control that
   * had just been tapped.
   */
  historyAnchorRef?: { current: HTMLElement | null };
  /**
   * `strip` is the row of tabs. `inline` is the two controls on their own, for
   * the header — a tab bar listing one tab is a row of chrome that says
   * nothing, so with a single chat the strip goes away and New chat / history
   * move up beside the project name.
   */
  variant?: "strip" | "inline";
  /**
   * Whether a chat can be opened alongside the one already open.
   *
   * Desktop only. There is no tab strip on mobile and no room for one, and
   * double-click is not a gesture a touch screen has — so there a chat from
   * history simply takes the place of the current one.
   */
  allowMultiple?: boolean;
}) {
  const t = useT();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const phone = useIsPhone();

  /**
   * What the history popover hangs from: whichever control is on screen. The
   * clock is `display:none` on a phone — history is opened from the
   * workspace's ⋯ menu there — and a hidden element measures 0×0. (On a phone
   * it is a sheet anyway; this is for a narrow desktop window.) Base UI places
   * it, keeps it on screen, and — being a portal — no `overflow-hidden` header
   * can clip it, which is what the hand-measured version was working around.
   */
  const historyAnchor = useCallback(() => {
    const visible = (el: HTMLElement | null | undefined) => {
      const rect = el?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0 ? el! : null;
    };
    return visible(historyBtnRef.current) ?? visible(historyAnchorRef?.current) ?? null;
  }, [historyAnchorRef]);

  /**
   * "Open history", asked for from outside.
   *
   * The counter is a one-shot signal, not a standing state, and it has to be
   * read that way: this component is mounted twice over — `inline` while there
   * is one chat, `strip` once there are several — so opening a chat from
   * history swapped one for the other, and closing it swapped back. Each of
   * those is a fresh mount, and an effect that only checked "is the counter
   * above zero" fired on every one of them, reopening the popover over and
   * over from a request the user made once and already acted on.
   *
   * Seeding the ref from the current value is the fix: a remount starts level
   * with whatever has already been handled and does nothing.
   */
  const handledHistoryRequest = useRef(historyOpenRequest ?? 0);
  useEffect(() => {
    const n = historyOpenRequest ?? 0;
    if (n <= 0 || n === handledHistoryRequest.current) return;
    handledHistoryRequest.current = n;
    setHistoryOpen(true);
  }, [historyOpenRequest]);

  const titleFor = (tab: OpenTab) => {
    if (tab.kind === "subagent") return tab.title || t.chat.tabs.subagent;
    if (tab.kind === "plan") return tab.title || t.chat.tabs.plan;
    if (tab.kind === "draft") return t.chat.tabs.newChat;
    const s = sessions?.find((x) => x.id === tab.threadId);
    return s?.title?.trim() || t.chat.tabs.newChat;
  };

  const tabBusy = (tab: OpenTab) => {
    if (tab.kind === "thread") return busyThreadId === tab.threadId;
    if (tab.kind === "plan" || tab.kind === "draft") return false;
    return busySubagentIds.has(`${tab.parentThreadId}:${tab.toolId}`);
  };

  const tabList = (
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {openTabs.map((tab) => {
          const active = tab.id === activeTabId;
          const busy = tabBusy(tab);
          return (
            <div
              key={tab.id}
              className={`group relative flex h-6 max-w-[10rem] shrink-0 items-center gap-1 rounded-sm px-1.5 text-[12px] leading-snug ${
                active
                  ? "bg-elevated text-fg"
                  : "text-muted hover:bg-hover hover:text-fg-2"
              }`}
              data-testid={
                tab.kind === "subagent"
                  ? "chat-tab-subagent"
                  : tab.kind === "plan"
                    ? "chat-tab-plan"
                    : "chat-tab-thread"
              }
              data-tab-id={tab.id}
              data-active={active ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className="flex min-w-0 flex-1 items-center gap-1 text-start"
                title={titleFor(tab)}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    busy ? "bg-accent" : active ? "bg-fg-2/70" : "bg-disabled"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 truncate font-medium rtl:text-right" dir="auto">{titleFor(tab)}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`rounded-sm p-0.5 text-muted transition hover:bg-active hover:text-fg ${
                  active ? "opacity-100" : "md:opacity-0 md:group-hover:opacity-100"
                }`}
                title={t.chat.tabs.closeTab}
                aria-label={t.chat.tabs.closeTab}
                data-testid="chat-tab-close"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
  );

  /**
   * New chat and history.
   *
   * Hidden on mobile, where they live in the workspace's ⋯ menu instead: the
   * header there has a project name and the pane switch to fit, and two more
   * icon buttons beside them left nothing readable.
   */
  const controls = (
      <div className="flex shrink-0 items-center gap-0.5 max-md:hidden">
        <button
          type="button"
          onClick={onNewAgent}
          className="grid size-6 place-items-center rounded-sm text-muted transition hover:bg-hover hover:text-fg"
          title={t.chat.tabs.newChat}
          aria-label={t.chat.tabs.newChat}
          data-testid="chat-tab-plus"
        >
          <Plus className="size-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            ref={historyBtnRef}
            onClick={() => setHistoryOpen((o) => !o)}
            className={`grid size-6 place-items-center rounded-sm transition hover:bg-hover hover:text-fg ${
              historyOpen ? "bg-elevated text-fg" : "text-muted"
            }`}
            title={t.chat.tabs.history}
            aria-label={t.chat.tabs.history}
            aria-expanded={historyOpen}
            data-testid="chat-history-button"
          >
            <Clock className="size-3.5" />
          </button>
        </div>
      </div>
  );

  // Base UI: a popover out of the clock (or the ⋯ that asked for it) on a
  // desktop; a bottom sheet on a phone, where history is opened from the ⋯
  // menu and a 288px panel under a 32px button is not what a phone does.
  const historyList = (sheet: boolean) => (
                <HistoryPopover
              sheet={sheet}
              sessions={sessions}
              busyThreadId={busyThreadId}
              openThreadIds={new Set(openTabs.filter((tab) => tab.kind === "thread").map((tab) => tab.threadId))}
              hasMore={sessionsHasMore}
              loadingMore={sessionsLoadingMore}
              onLoadMore={onLoadMoreSessions}
              allowMultiple={allowMultiple}
              onOpen={(id, additional) => {
                onOpenThread(id, { additional });
                setHistoryOpen(false);
              }}
                  onRename={onRenameSession}
                  onDelete={(s) => {
                    // The list closes with the same gesture that opens the
                    // confirm. Leaving it up put a popover of chats behind a
                    // modal about one of them, both asking to be read.
                    setHistoryOpen(false);
                    setPendingDelete(s);
                  }}
                />
  );
  const history = phone ? (
    <ModalSurface
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      label={t.chat.tabs.history}
      sheet
      zIndex={60}
      testId="chat-history-popover"
      // At least half the screen: grown only to fit, one chat made a sliver
      // of a sheet at the bottom. Many chats still grow it to the usual cap.
      style={{ background: PANEL_BG, minHeight: "calc(50dvh + var(--bleed))" }}
    >
      {historyList(true)}
    </ModalSurface>
  ) : (
    <AnchoredPopover
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      anchorRef={historyAnchor}
      align="end"
      sideOffset={4}
      label={t.chat.tabs.history}
      testId="chat-history-popover"
      // Our menus' panel (the workspace menu's, Recents'): the card colour,
      // 12px corners and the hairline ring. `rounded-xl` is this theme's
      // large radius, which is why this one used to look like a sheet.
      className="w-72 overflow-hidden rounded-[12px] p-1.5"
      style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
    >
      {historyList(false)}
    </AnchoredPopover>
  );

  const confirm = pendingDelete && (
        <ConfirmDialog
          title={t.chat.tabs.deleteTitle}
          subtitle={fill(t.chat.tabs.deleteBody, { title: pendingDelete.title })}
          confirmLabel={t.common.delete}
          danger
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            onDeleteSession(id);
          }}
        />
  );

  // Inline: the two controls, nothing else. The caller places them.
  if (variant === "inline") {
    return (
      <>
        {controls}
        {history}
        {confirm}
      </>
    );
  }

  return (
    <div className="flex h-8 shrink-0 items-center bg-bg px-4" data-testid="chat-tabs">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-0.5">
        {tabList}
        <span className="ps-0.5">{controls}</span>
      </div>
      {history}
      {confirm}
    </div>
  );
}

function HistoryPopover({
  sessions,
  busyThreadId,
  openThreadIds,
  allowMultiple,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onRename,
  onDelete,
  sheet = false,
}: {
  /** Inside a phone sheet: the list takes the sheet's height and scroll. */
  sheet?: boolean;
  sessions: Session[] | null;
  busyThreadId: string | null;
  openThreadIds: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  allowMultiple: boolean;
  onOpen: (id: string, additional: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (session: Session) => void;
}) {
  const t = useT();
  const listRef = useRef<HTMLUListElement>(null);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || !hasMore || loadingMore || !onLoadMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) onLoadMore();
  };

  return (
    <>
      <p
        className={`shrink-0 leading-6 font-[480] ${sheet ? "px-4.5 pt-2 pb-1 text-[14px]" : "px-2 text-[12px]"}`}
        style={{ color: FG_TERTIARY }}
      >
        {t.chat.tabs.chats}
      </p>
      <ul
        ref={listRef}
        onScroll={onScroll}
        className={
          sheet
            ? "native-safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2"
            : "max-h-72 overflow-y-auto"
        }
      >
        {sessions === null ? (
          <li className="px-1 py-2">
            <ListRowsSkeleton rows={5} />
          </li>
        ) : sessions.length === 0 ? (
          <li className="px-2 py-2 text-[14px]" style={{ color: FG_TERTIARY }}>
            {t.chat.tabs.noChats}
          </li>
        ) : (
          <>
            {[...sessions]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((s) => (
                <HistoryRow
                  key={s.id}
                  session={s}
                  busy={busyThreadId === s.id}
                  open={openThreadIds.has(s.id)}
                  canDelete={sessions.length > 1}
                  allowMultiple={allowMultiple}
                  onOpen={(additional) => onOpen(s.id, additional)}
                  onRename={(title) => onRename(s.id, title)}
                  onDelete={() => onDelete(s)}
                  sheet={sheet}
                />
              ))}
            {(hasMore || loadingMore) && (
              <li className="flex items-center justify-center gap-1.5 px-2 py-2 text-[11px] text-muted">
                {loadingMore ? <Spinner size={12} /> : t.chat.tabs.scrollForMore}
              </li>
            )}
          </>
        )}
      </ul>
    </>
  );
}

function HistoryRow({
  session,
  busy,
  open,
  canDelete,
  allowMultiple,
  onOpen,
  onRename,
  onDelete,
  sheet,
}: {
  session: Session;
  busy: boolean;
  open: boolean;
  canDelete: boolean;
  /** Desktop only — see ChatTabs. */
  allowMultiple: boolean;
  onOpen: (additional: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** In a phone sheet: the project menu sheet's rows, sized for a finger. */
  sheet: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  // Not while renaming: the automatic title arrives mid-turn and used to
  // replace what was being typed.
  useEffect(() => {
    if (!editing) setTitle(session.title);
  }, [session.title, editing]);

  /**
   * A second click has to be allowed to arrive before the first one acts, or
   * the chat would already be open by the time we learn a second tab was
   * wanted. 250ms is the usual double-click threshold — the browser does not
   * expose the one the operating system is set to — and a history click is not
   * a keystroke, so the wait is not felt.
   */
  const DOUBLE_CLICK_MS = 250;
  const clickTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    },
    [],
  );
  const openHere = () => {
    if (!allowMultiple) {
      onOpen(false);
      return;
    }
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      onOpen(false);
    }, DOUBLE_CLICK_MS);
  };
  const openAlongside = () => {
    if (!allowMultiple) return;
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    onOpen(true);
  };

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          dir="auto"
          onBlur={() => {
            setEditing(false);
            if (title.trim() && title.trim() !== session.title) onRename(title.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitle(session.title);
              setEditing(false);
            }
          }}
          className={`w-full border border-line bg-elevated text-fg outline-none focus:[--mx-ring:color-mix(in_srgb,var(--mx-fg-2)_40%,transparent)] ${
            sheet ? "h-11 rounded-[12px] px-3 text-[16px]" : "rounded-md px-2 py-1.5 text-xs"
          }`}
        />
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={openHere}
        onDoubleClick={openAlongside}
        title={allowMultiple ? t.chat.tabs.openHint : undefined}
        // Recents' rows: 32px, 14px, soft white, and the chat on screen lifted
        // rather than marked with a dot.
        className={`flex w-full items-center gap-2 text-start transition hover:bg-white/[0.04] hover:text-fg ${
          sheet ? "press h-11 rounded-[12px] pe-20 ps-3 text-[16px]" : "h-8 rounded-[6px] pe-14 ps-2 text-[14px]"
        } ${
          open ? "bg-white/[0.06] text-fg" : "text-fg-2"
        }`}
      >
        {busy && (
          <span className="shrink-0 text-fg">
            <Spinner size={12} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate rtl:text-right" dir="auto">{session.title}</span>
      </button>
      <div className="absolute top-1/2 end-1 flex -translate-y-1/2 items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`rounded text-muted transition hover:bg-hover hover:text-fg ${sheet ? "p-2" : "p-1"}`}
          title={t.common.rename}
          aria-label={t.chat.tabs.renameChat}
        >
          <Pencil className={sheet ? "size-4" : "size-3"} />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className={`rounded text-muted transition hover:bg-hover hover:text-danger ${sheet ? "p-2" : "p-1"}`}
            title={t.common.delete}
            aria-label={t.chat.tabs.deleteChat}
          >
            <Trash2 className={sheet ? "size-4" : "size-3"} />
          </button>
        )}
      </div>
    </li>
  );
}

export function ChatEmptyState({
  onNewAgent,
  onOpenHistory,
}: {
  onNewAgent: () => void;
  onOpenHistory: () => void;
}) {
  const t = useT();
  return (
    <div className="grid flex-1 place-items-center px-6 text-center" data-testid="chat-tabs-empty">
      <div className="w-full max-w-[20rem]">
        <span
          className="mx-auto grid size-11 place-items-center rounded-[14px]"
          style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.4) }}
        >
          <MessageSquarePlus className="size-5" style={{ color: FG_SECONDARY }} />
        </span>
        <p className="mt-3.5 text-[14px] leading-5 font-medium text-white">{t.chat.tabs.emptyTitle}</p>
        <p className="mt-1 text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
          {t.chat.tabs.emptyBody}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onNewAgent}
            className={whiteBtnClass("lg")}
            data-testid="chat-empty-new"
          >
            {t.chat.tabs.newChat}
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className={btnClass("lg", "ghost")}
            data-testid="chat-empty-history"
          >
            {t.chat.tabs.openHistory}
          </button>
        </div>
      </div>
    </div>
  );
}

