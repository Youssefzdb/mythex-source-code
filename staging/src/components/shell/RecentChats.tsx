import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Folder, List, MoreHorizontal } from "lucide-react";
import { prefetchGet, type WorkspaceThread, type WorkspaceThreadsPage } from "../../lib/api";
import { fetchWorkspaceThreads, peekWorkspaceThreads } from "../../lib/workspaceCatalog";
import { CARD_BG, floatingRing } from "../../lib/surfaces";
import { MenuPopover } from "../ui/Popover";
import { fill, useT } from "../../i18n/app";

/** Muted nav text (`--fg-tertiary` dark), as the drawer's other headings. */
const NAV_MUTED = "oklch(72.34% 0.002 107)";
const MODE_KEY = "mythex.recents.organize";
type Mode = "list" | "project";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "project" ? "project" : "list";
  } catch {
    return "list";
  }
}

/**
 * The drawer's Recents: every chat in the workspace, newest activity first,
 * whichever project it belongs to — the way a chat app lists its history. It
 * used to list projects, which the Projects page already does, and opening one
 * then dropped you into whichever chat came up.
 *
 * "Organize chats" switches between one list and chats grouped under their
 * project, and the choice is remembered on this device.
 *
 * It refreshes when the workspace says its chats changed (a new chat, a title,
 * a turn starting or ending — see `mythex:threads-changed`), and when the tab
 * comes back, rather than on a timer.
 */
export function RecentChats({ workspaceId }: { workspaceId?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState<WorkspaceThreadsPage | null>(() =>
    workspaceId ? peekWorkspaceThreads(workspaceId) : null,
  );
  const [mode, setMode] = useState<Mode>(readMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setPage(peekWorkspaceThreads(workspaceId));
    let cancelled = false;
    let timer = 0;
    const load = () =>
      void fetchWorkspaceThreads(workspaceId)
        .then((next) => {
          if (cancelled) return;
          // A refresh brings back the first page. Anything "Show more" already
          // loaded past it stays, so the list does not snap shut under you.
          setPage((prev) => {
            if (!prev || prev.items.length <= next.items.length) return next;
            const ids = new Set(next.items.map((t) => t.id));
            return { items: [...next.items, ...prev.items.filter((t) => !ids.has(t.id))], nextCursor: prev.nextCursor };
          });
        })
        .catch(() => undefined);
    load();
    // Several changes land together (a new chat, then its title, then the
    // turn starting): one fetch for the lot.
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 500);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    const onRenamed = (e: Event) => {
      const { id, name } = (e as CustomEvent<{ id: string; name: string }>).detail;
      setPage((prev) =>
        prev && { ...prev, items: prev.items.map((t) => (t.projectId === id ? { ...t, projectName: name } : t)) },
      );
    };
    window.addEventListener("mythex:threads-changed", soon);
    window.addEventListener("mythex:project-renamed", onRenamed);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("mythex:threads-changed", soon);
      window.removeEventListener("mythex:project-renamed", onRenamed);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceId]);

  const pick = (next: Mode) => {
    setMode(next);
    setMenuOpen(false);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* a private window: this device just won't remember it */
    }
  };

  const showMore = async () => {
    if (!workspaceId || !page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchWorkspaceThreads(workspaceId, page.nextCursor);
      setPage((prev) => {
        if (!prev) return more;
        const ids = new Set(prev.items.map((t) => t.id));
        return { items: [...prev.items, ...more.items.filter((t) => !ids.has(t.id))], nextCursor: more.nextCursor };
      });
    } catch {
      /* leave the button to try again */
    } finally {
      setLoadingMore(false);
    }
  };

  // The chat on screen, when the screen is a project.
  const activeThread = location.pathname.startsWith("/p/")
    ? new URLSearchParams(location.search).get("thread")
    : null;

  const groups = useMemo(() => {
    const out: { projectId: string; projectName: string; items: WorkspaceThread[] }[] = [];
    const at = new Map<string, number>();
    for (const t of page?.items ?? []) {
      let i = at.get(t.projectId);
      if (i == null) {
        i = out.push({ projectId: t.projectId, projectName: t.projectName, items: [] }) - 1;
        at.set(t.projectId, i);
      }
      out[i].items.push(t);
    }
    return out;
  }, [page]);

  const open = (t: WorkspaceThread) => navigate(`/p/${t.projectId}?thread=${t.id}`);
  /**
   * Ask for the chat as the finger lands, not once its screen has mounted:
   * the project, its chats and the messages were requested one after another
   * after the tap, ~330ms of skeleton on a first open (recorded in the
   * simulator) against ~100ms for a chat already loaded. The screen's own
   * requests pick these up (prefetchGet).
   */
  const warm = (t: WorkspaceThread) => {
    prefetchGet(`/v1/projects/${t.projectId}`);
    prefetchGet(`/v1/projects/${t.projectId}/threads?limit=30`);
    prefetchGet(`/v1/projects/${t.projectId}/threads/${t.id}/messages?limit=30`);
  };
  // Just the title, as a chat app lists its history; the project is in the
  // tooltip here, and the heading when grouped by project.
  const row = (th: WorkspaceThread, grouped: boolean) => (
    <button
      key={th.id}
      type="button"
      onClick={() => open(th)}
      onPointerDown={() => warm(th)}
      data-testid="recent-chat"
      aria-current={th.id === activeThread ? "page" : undefined}
      title={grouped ? th.title : fill(t.shell.recents.titleWithProject, { title: th.title, project: th.projectName })}
      // Soft white (--mx-fg-2), full white on hover and for the chat on
      // screen; ChatGPT's 36px rows, 10px corners and 10% white. `h-8` stays
      // for the phone drawer, whose CSS sizes rows by it.
      className={`flex h-8 md:h-9 w-full min-w-0 items-center gap-2 rounded-[8px] md:rounded-[10px] px-2 text-start text-[14px] leading-[21px] transition hover:bg-white/[0.1] hover:text-fg ${
        th.id === activeThread ? "bg-white/[0.1] text-fg" : "text-fg-2"
      } ${grouped ? "ps-8" : ""}`}
    >
      {/* dir=auto: an Arabic title reads from the right, and fades out on
          its left. */}
      {/* text-start, not the row's text-left: an Arabic title starts at the
          right edge, so the fade at its far end only touches one too long. */}
      <span dir="auto" className="mx-fade-title min-w-0 flex-1 truncate text-start rtl:text-right">
        {th.title}
      </span>
    </button>
  );

  if (!workspaceId) return null;

  return (
    <div data-testid="recent-chats">
      {/* Lovable's drawer heading: the list's own size (14px, regular) in the
          muted grey, on a row as tall as the rows under it. */}
      <div className="flex h-8 items-center justify-between px-2">
        <p className="text-[14px] leading-[21px]" style={{ color: NAV_MUTED }}>
          {t.shell.recents.title}
        </p>
        <MenuPopover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          side="bottom"
          align="end"
          sideOffset={4}
          label={t.shell.recents.organize}
          className="w-52 rounded-[14px] p-1.5"
          style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
          trigger={
            <button
              type="button"
              aria-label={t.shell.recents.organize}
              data-testid="recents-organize"
              className="-me-1 grid size-6 place-items-center rounded-[6px] transition hover:bg-white/[0.06] hover:text-fg"
              style={{ color: NAV_MUTED }}
            >
              <MoreHorizontal className="size-4" />
            </button>
          }
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[13px]" style={{ color: NAV_MUTED }}>
            {t.shell.recents.organize}
          </p>
          {(
            [
              ["list", t.shell.recents.inOneList, List],
              ["project", t.shell.recents.byProject, Folder],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === value}
              onClick={() => pick(value)}
              className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.06] hover:text-fg"
            >
              <Icon className="size-4 shrink-0" style={{ color: NAV_MUTED }} />
              <span className="flex-1">{label}</span>
              {mode === value && <Check className="size-4 shrink-0" />}
            </button>
          ))}
        </MenuPopover>
      </div>

      {page && page.items.length === 0 ? (
        <p className="px-2 py-1 text-[14px]" style={{ color: NAV_MUTED }}>
          {t.shell.recents.empty}
        </p>
      ) : !page ? (
        // Still loading: the rows' shape, so the drawer is not an empty panel
        // under its heading until the list lands.
        <div aria-hidden data-testid="recents-skeleton">
          {[72, 56, 64, 48, 60, 52].map((w, i) => (
            <div key={i} className="flex h-8 items-center px-2">
              <div className="h-3 animate-pulse rounded-full bg-white/[0.07]" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : mode === "list" ? (
        <div>{page.items.map((t) => row(t, false))}</div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.projectId} data-testid="recent-project">
              {/* The project's name opens it on its last chat. */}
              <button
                type="button"
                onClick={() => navigate(`/p/${g.projectId}`)}
                className="flex h-8 md:h-9 w-full min-w-0 items-center gap-2 rounded-[8px] md:rounded-[10px] px-2 text-start text-[14px] leading-[21px] text-fg-2 transition hover:bg-white/[0.1] hover:text-fg"
              >
                <Folder className="size-4 shrink-0" style={{ color: NAV_MUTED }} />
                <span dir="auto" className="mx-fade-title min-w-0 flex-1 truncate text-start rtl:text-right">
                  {g.projectName}
                </span>
              </button>
              {g.items.map((t) => row(t, true))}
            </div>
          ))}
        </div>
      )}

      {page?.nextCursor && (
        <button
          type="button"
          onClick={() => void showMore()}
          disabled={loadingMore}
          className="flex h-8 w-full items-center rounded-[8px] px-2 text-start text-[14px] transition hover:bg-white/[0.06] disabled:opacity-60"
          style={{ color: NAV_MUTED }}
        >
          {loadingMore ? t.common.loading : t.common.showMore}
        </button>
      )}
    </div>
  );
}
