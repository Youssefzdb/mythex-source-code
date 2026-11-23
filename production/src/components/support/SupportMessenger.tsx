import { useEffect, useRef, useState } from "react";
import { Clock, Plus, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MythexMark } from "../mythex-mark";
import {
  SUPPORT_EMAIL,
  SUPPORT_MAX_CHARS,
  endSupportThread,
  fetchSupportThread,
  fetchSupportThreadById,
  fetchSupportThreads,
  isCustomSupportEnabled,
  markSupportSeen,
  onSupportChatOpen,
  sendSupportMessage,
  startSupportThread,
  subscribeSupportThread,
  type SupportMessage,
  type SupportThread,
  type SupportThreadSummary,
} from "../../lib/support";
import { appT, fill, formatDate, formatNumber, useT } from "../../i18n/app";
import { rich } from "../../i18n/app/rich";
import { useBackCloses } from "../../lib/native-back";
import { ModalSurface, useIsPhone } from "../ui/Sheet";
import { useAuth } from "../../lib/auth";
import { Turnstile, turnstileOn, type TurnstileHandle } from "../auth/Turnstile";

const PANEL_MS = 220;
/**
 * How often to re-ask while an answer is outstanding. Slow enough to be free
 * next to a model call, fast enough that nobody sits in front of a reply that
 * has already been written.
 */
const PENDING_POLL_MS = 4_000;
/**
 * How many times to re-ask before leaving it to the stream. An answer that has
 * not arrived within a minute is not one the poll can rescue, and a panel left
 * open on a stuck thread should not keep asking all day.
 */
const PENDING_POLL_MAX = 15;

function mailtoFallback() {
  window.location.href = `mailto:${SUPPORT_EMAIL}`;
}

/**
 * The AI answers in markdown (lists, bold, links to docs). Rendered as plain
 * text it showed raw `**` and `1.` markers, which read as broken.
 *
 * Deliberately small: no code highlighting or HTML, and every link opens in a
 * new tab so nobody loses the conversation by following one.
 */
function SupportMarkdown({ body }: { body: string }) {
  return (
    <div className="support-md break-words text-sm leading-relaxed" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="underline">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

/**
 * "2h ago" rather than "9/8/2026, 1:45:35 AM". A conversation list is scanned,
 * and an exact timestamp is both longer and harder to place.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const t = appT().publish.support;
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return t.justNow;
  if (mins < 60) return fill(t.minutesAgo, { n: formatNumber(mins) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return fill(t.hoursAgo, { n: formatNumber(hours) });
  const days = Math.round(hours / 24);
  if (days === 1) return t.yesterday;
  if (days < 7) return fill(t.daysAgo, { n: formatNumber(days) });
  return formatDate(then, { month: "short", day: "numeric" });
}

/** How a conversation stands, when that is worth saying at a glance. */
function threadChip(t: SupportThreadSummary): { label: string; className: string } | null {
  const m = appT().publish.support;
  if (t.status === "resolved") {
    return { label: m.ended, className: "border-line text-white/40" };
  }
  if (t.status === "escalated" || t.assignedTo === "human") {
    return { label: m.teammate, className: "border-rose-400/30 bg-rose-500/10 text-rose-200/90" };
  }
  return null;
}

function TypingDots() {
  return (
    <span className="support-typing" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

function isHumanHandoff(conversation: SupportThread["conversation"]): boolean {
  return Boolean(conversation && (conversation.status === "escalated" || conversation.assignedTo === "human"));
}

function applyThreadWaiting(
  messages: SupportMessage[],
  conversation: SupportThread["conversation"],
): boolean {
  if (isHumanHandoff(conversation)) return false;
  const last = messages[messages.length - 1];
  return Boolean(last && last.role === "customer");
}

export function SupportMessenger() {
  const tr = useT();
  const m = tr.publish.support;
  const [open, setOpen] = useState(false);
  const phone = useIsPhone();
  // On a phone the sheet registers Android's back itself.
  useBackCloses(open && !phone, () => setOpen(false));
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [conversation, setConversation] = useState<SupportThread["conversation"]>(null);
  const [stream, setStream] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Past conversations, and which one is on screen. */
  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  /**
   * The same value the live handler reads. The handler is created once per
   * open, so the state variable it closed over is whatever it was at that
   * moment — always null — and the "am I reading an older thread?" check below
   * would never have fired.
   */
  const activeThreadIdRef = useRef<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<number>(0);

  function show() {
    window.clearTimeout(closeTimer.current);
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
  }

  /** Set both, so the live handler and the render never disagree. */
  function selectThread(id: string | null) {
    activeThreadIdRef.current = id;
    setActiveThreadId(id);
  }

  function hide() {
    // Everything on screen has been read by the time they close the panel.
    markSupportSeen();
    setOpen(false);
    // The sheet unmounts once it has slid away (onExited below).
    if (!phone) closeTimer.current = window.setTimeout(() => setMounted(false), PANEL_MS);
  }

  useEffect(() => {
    if (!isCustomSupportEnabled()) return;
    return onSupportChatOpen(() => show());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Take a newer view of the conversation, from the live stream or from the
   * fallback poll below. Both go through here so the two can never disagree.
   */
  function applyLiveThread(thread: SupportThread) {
    // A live update always carries the newest page of the active thread.
    // Ignore it while reading a different one from the list.
    const active = activeThreadIdRef.current;
    if (active && thread.conversation && thread.conversation.id !== active) {
      void refreshThreads();
      return;
    }
    // An empty thread never clears a full one. The stream's first push can be
    // read before the message just sent has created the conversation, and
    // taking it would wipe what is on screen. Only New chat empties the panel.
    if (!thread.conversation && !thread.messages.length) {
      void refreshThreads();
      return;
    }
    setMessages(thread.messages);
    setConversation(thread.conversation);
    selectThread(thread.conversation?.id ?? active);
    setHasOlder(Boolean(thread.hasMore));
    void refreshThreads();
    const stillWaiting = applyThreadWaiting(thread.messages, thread.conversation);
    setWaiting(stillWaiting);
    if (!stillWaiting) setStream("");
    setError(null);
  }

  /**
   * Ask again while an answer is outstanding.
   *
   * The stream is what normally delivers a reply, and a dropped connection
   * re-pushes on reconnect — but a connection that stays up and simply misses
   * the event leaves someone watching typing dots in front of an answer that
   * already exists. Only runs while a reply is pending, so an idle panel costs
   * nothing.
   */
  useEffect(() => {
    if (!open || !waiting) return;
    let asked = 0;
    const timer = window.setInterval(() => {
      if (++asked > PENDING_POLL_MAX) {
        window.clearInterval(timer);
        return;
      }
      void fetchSupportThread()
        .then(applyLiveThread)
        .catch(() => {
          /* the stream is still the primary path */
        });
    }, PENDING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, waiting]);

  useEffect(() => {
    if (!open) return;
    markSupportSeen();
    let unsub = () => {};
    let cancelled = false;
    void (async () => {
      try {
        const thread = await fetchSupportThread();
        if (cancelled) return;
        setMessages(thread.messages);
        setConversation(thread.conversation);
        selectThread(thread.conversation?.id ?? null);
        setHasOlder(Boolean(thread.hasMore));
        setWaiting(applyThreadWaiting(thread.messages, thread.conversation));
        setStream("");
        setError(null);
        void refreshThreads();
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 503 || status === 502) setError("unavailable");
        // Too many new chats from this network: the panel would otherwise sit
        // there empty with nothing explaining why.
        else if (status === 429) setError("rate_limited");
      }
      if (cancelled) return;
      unsub = subscribeSupportThread({
        onThread: applyLiveThread,
        onToken: (text) => {
          setStream((prev) => prev + text);
          setWaiting(true);
        },
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open]);

  /**
   * The customer is done. Ending hands the thread back to the AI, so their next
   * question is answered immediately instead of queuing behind a person.
   */
  async function endChat() {
    const threadId = activeThreadId ?? conversation?.id;
    if (!threadId) return;
    try {
      await endSupportThread(threadId);
      setConversation((c) => (c ? { ...c, status: "resolved", assignedTo: "bot" } : c));
      setWaiting(false);
      setStream("");
      void refreshThreads();
    } catch {
      setError("support_error");
    }
  }

  async function refreshThreads() {
    try {
      setThreads(await fetchSupportThreads());
    } catch {
      /* the list is a convenience; the open thread still works */
    }
  }

  /**
   * Signed-out visitors prove they're a person once, on their first message
   * (Cloudflare Turnstile; the API checks: routes/support.ts humanGuest).
   * Signed-in people never load it.
   */
  const { user } = useAuth();
  const askHuman = !user && turnstileOn();
  const turnstile = useRef<TurnstileHandle>(null);
  const turnstileToken = useRef<string | null>(null);
  const humanToken = async (): Promise<string | undefined> => {
    if (!askHuman) return undefined;
    for (let i = 0; i < 40 && !turnstileToken.current; i++) await new Promise((r) => setTimeout(r, 250));
    const token = turnstileToken.current ?? undefined;
    // One token, one check: the next one starts fresh.
    if (token) turnstile.current?.reset();
    return token;
  };

  /** Leave this conversation readable and start a fresh one. */
  async function startNewChat() {
    setError(null);
    // Already on an empty one: pressing + again would only litter the history
    // with conversations nobody ever wrote in.
    if (messages.length === 0) {
      setShowHistory(false);
      inputRef.current?.focus();
      return;
    }
    try {
      const created = await startSupportThread(await humanToken());
      selectThread(created.id);
      setMessages([]);
      setConversation(null);
      setStream("");
      setWaiting(false);
      setHasOlder(false);
      setShowHistory(false);
      void refreshThreads();
      inputRef.current?.focus();
    } catch {
      setError("support_error");
    }
  }

  async function openThread(threadId: string) {
    setError(null);
    setShowHistory(false);
    try {
      const thread = await fetchSupportThreadById(threadId);
      selectThread(threadId);
      setConversation(thread.conversation);
      setMessages(thread.messages);
      setHasOlder(thread.hasMore);
      setStream("");
      setWaiting(false);
    } catch {
      setError("support_error");
    }
  }

  /** Scrolled to the top with more behind it: fetch the previous page. */
  async function loadOlder() {
    const threadId = activeThreadId ?? conversation?.id;
    const oldest = messages[0];
    if (!threadId || !oldest || loadingOlder || !hasOlder) return;
    const el = scroller.current;
    const before = el ? el.scrollHeight : 0;
    setLoadingOlder(true);
    try {
      const page = await fetchSupportThreadById(threadId, oldest.id);
      setMessages((prev) => [...page.messages, ...prev]);
      setHasOlder(page.hasMore);
      // Keep the reading position: without this, prepending jumps the view.
      requestAnimationFrame(() => {
        const node = scroller.current;
        if (node) node.scrollTop = node.scrollHeight - before;
      });
    } catch {
      /* leave the older page unloaded; scrolling again retries */
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    const el = scroller.current;
    // Only stick to the bottom for new activity — never while reading history,
    // which would yank the view back down after prepending a page.
    if (el && !loadingOlder) el.scrollTop = el.scrollHeight;
  }, [messages, stream, open, waiting, mounted, loadingOlder]);

  // Not on a phone: the keyboard would cover half the chat the moment it
  // opens, before there is anything to answer (the home screen doesn't either).
  useEffect(() => {
    if (!open || phone) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), PANEL_MS);
    return () => window.clearTimeout(t);
  }, [open, phone]);

  if (!isCustomSupportEnabled() || !mounted) return null;

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    const local: SupportMessage = {
      id: `local-${Date.now()}`,
      role: "customer",
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, local]);
    setWaiting(!isHumanHandoff(conversation));
    setStream("");
    try {
      const thread = await sendSupportMessage(body, await humanToken());
      setMessages(thread.messages);
      setConversation(thread.conversation);
      setWaiting(applyThreadWaiting(thread.messages, thread.conversation));
    } catch (err) {
      const status = (err as { status?: number }).status;
      setMessages((prev) => prev.filter((m) => m.id !== local.id));
      setWaiting(false);
      if (status === 503 || status === 502) {
        setError("unavailable");
        mailtoFallback();
      } else if (status === 429) {
        setError("rate_limited");
        setDraft(body);
      } else {
        setError("send_failed");
        setDraft(body);
      }
    } finally {
      setBusy(false);
    }
  }

  const showDots = waiting && !stream;
  const handoff = isHumanHandoff(conversation);
  const waitingForTeammate = handoff && !messages.some((m) => m.role === "human");
  const headerDetail = waitingForTeammate
    ? m.headerWaiting
    : handoff
      ? m.headerHuman
      : m.headerBot;
  const emailLink = (
    <a className="underline" href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
      {SUPPORT_EMAIL}
    </a>
  );

  const panel = (
    <>
    <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative shrink-0">
          <MythexMark size={22} />
          <span className="absolute -end-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#171717]" />
        </div>
        {/* Truncated, not wrapped: a second line pushes the header out of
            line with the icons on a narrow phone. */}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{m.title}</p>
          <p className="truncate text-[11px] text-white/50">{headerDetail}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={`rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white ${
            showHistory ? "bg-white/10 text-white" : "text-white/60"
          }`}
          aria-label={m.pastConversations}
          aria-pressed={showHistory}
          title={m.pastConversations}
          data-testid="support-history"
          onClick={() => {
            setShowHistory((v) => !v);
            void refreshThreads();
          }}
        >
          <Clock className="h-4 w-4" />
        </button>
        {conversation && conversation.status !== "resolved" && messages.length > 0 ? (
          <button
            type="button"
            className="rounded-full border border-line px-2 py-[3px] text-[11px] text-white/55 transition hover:[--mx-ring:rgb(255_255_255/0.2)] hover:bg-white/10 hover:text-white"
            aria-label={m.endConversation}
            title={m.endConversation}
            data-testid="support-end-chat"
            onClick={() => void endChat()}
          >
            {m.end}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label={m.newConversation}
          title={m.newConversation}
          data-testid="support-new-chat"
          onClick={() => void startNewChat()}
        >
          <Plus className="h-4 w-4" />
        </button>
        {/* A sheet closes with its handle, a pull down or a tap outside. */}
        {phone ? null : (
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label={m.closeSupport}
            onClick={hide}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>

    {showHistory ? (
      <div
        data-testid="support-thread-list"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2"
      >
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <p className="text-[11px] uppercase tracking-wide text-white/40">{m.yourConversations}</p>
          <button
            type="button"
            data-testid="support-history-back"
            className="rounded-full border border-line px-2 py-[3px] text-[11px] text-white/55 transition hover:[--mx-ring:rgb(255_255_255/0.2)] hover:bg-white/10 hover:text-white"
            onClick={() => setShowHistory(false)}
          >
            {m.backToChat}
          </button>
        </div>
        {threads.length === 0 ? (
          <p className="px-1.5 py-2 text-sm text-white/50">{m.noPast}</p>
        ) : (
          threads.map((t) => {
            const chip = threadChip(t);
            const last = t.lastMessage;
            const preview = last?.body?.trim().replace(/\s+/g, " ") ?? "";
            return (
              <button
                key={t.id}
                type="button"
                data-testid="support-thread-item"
                aria-current={t.id === activeThreadId ? "true" : undefined}
                onClick={() => void openThread(t.id)}
                className={`rounded-xl border px-3 py-2.5 text-start transition ${
                  t.id === activeThreadId
                    ? "border-white/15 bg-white/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.06]"
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-white/90" dir="auto">
                    {t.title?.trim() || preview || m.newConversation}
                  </span>
                  <span className="ms-auto shrink-0 text-[11px] tabular-nums text-white/35">
                    {relativeTime(last?.createdAt ?? t.createdAt)}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-white/45" dir="auto">
                    {last
                      ? last.role === "customer"
                        ? fill(m.youPrefix, { text: preview })
                        : preview
                      : m.noMessages}
                  </span>
                  {chip ? (
                    <span
                      data-testid="support-thread-chip"
                      className={`shrink-0 rounded-full border px-1.5 py-[1px] text-[10px] font-medium ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    ) : null}

    <div
      ref={scroller}
      hidden={showHistory}
      onScroll={(e) => {
        // Near the top with more behind it: pull the previous page.
        if (e.currentTarget.scrollTop <= 24) void loadOlder();
      }}
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3"
    >
      {hasOlder ? (
        <button
          type="button"
          data-testid="support-load-older"
          onClick={() => void loadOlder()}
          disabled={loadingOlder}
          className="mx-auto mb-1 rounded-full border border-line px-3 py-1 text-[11px] text-white/60 transition hover:bg-white/[0.07] disabled:opacity-50"
        >
          {loadingOlder ? tr.common.loading : m.earlierMessages}
        </button>
      ) : null}
      {messages.length === 0 && !waiting ? (
        <div className="flex justify-start">
          <p
            data-testid="support-empty"
            className="support-msg-in max-w-[80%] w-fit rounded-2xl rounded-es-md bg-white/[0.06] px-3 py-2 text-sm leading-relaxed text-white/70"
          >
            {m.greeting}
          </p>
        </div>
      ) : null}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}
        >
          <div
            data-testid="support-message"
            data-role={msg.role}
            className={`support-msg-in w-fit text-sm leading-relaxed ${
              msg.role === "system"
                ? "max-w-full px-1 py-0.5 text-[12px] text-white/45"
                : msg.role === "customer"
                  ? "max-w-[80%] rounded-2xl rounded-ee-md bg-rose-500/90 px-3 py-2 text-white"
                  : "max-w-[80%] rounded-2xl rounded-es-md bg-white/[0.07] px-3 py-2 text-white/90"
            }`}
          >
            {msg.role === "human" ? (
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-rose-200/80">{m.teammate}</p>
            ) : null}
            {msg.role === "customer" || msg.role === "system" ? (
              <p className="whitespace-pre-wrap break-words" dir="auto">{msg.body}</p>
            ) : (
              <SupportMarkdown body={msg.body} />
            )}
          </div>
        </div>
      ))}
      {showDots ? (
        <div className="flex justify-start">
          <div
            data-testid="support-waiting"
            className="support-msg-in inline-flex rounded-2xl rounded-es-md bg-white/[0.07] px-3 py-2.5"
          >
            <TypingDots />
            <span className="sr-only">{m.writing}</span>
          </div>
        </div>
      ) : null}
      {stream ? (
        <div className="flex justify-start">
          <div
            data-testid="support-stream"
            className="max-w-[80%] w-fit rounded-2xl rounded-es-md bg-white/[0.07] px-3 py-2 text-sm leading-relaxed text-white/90"
          >
            <SupportMarkdown body={stream} />
            <span className="support-caret" aria-hidden>
              |
            </span>
          </div>
        </div>
      ) : null}
      {waitingForTeammate ? (
        <p
          data-testid="support-handoff"
          className="support-msg-in px-1 pt-1 text-center text-[11px] leading-relaxed text-white/45"
        >
          {m.handoff}
        </p>
      ) : null}
      {error === "unavailable" ? (
        <p className="text-xs text-rose-200">{rich(m.unavailable, { email: emailLink })}</p>
      ) : null}
      {error === "rate_limited" ? (
        <p className="text-xs text-rose-200">{rich(m.rateLimited, { email: emailLink })}</p>
      ) : null}
      {error === "send_failed" ? (
        <p className="text-xs text-rose-200">{m.sendFailed}</p>
      ) : null}
    </div>

    {askHuman ? <Turnstile ref={turnstile} onToken={(t) => (turnstileToken.current = t)} /> : null}
    <form
      hidden={showHistory}
      className={`p-2.5 pt-1 ${phone ? "native-safe-bottom" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex h-11 items-center gap-1.5 rounded-full bg-white/[0.07] ps-3.5 pe-1.5">
        <div className="relative flex h-8 min-w-0 flex-1 items-center">
          {draft ? null : (
            <span className="pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 text-[13px] leading-none text-white/40">
              {m.placeholder}
            </span>
          )}
          <input
            ref={inputRef}
            data-testid="support-composer"
            type="text"
            maxLength={SUPPORT_MAX_CHARS}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, SUPPORT_MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
            aria-label={m.messageLabel}
            autoComplete="off"
            dir="auto"
            className="relative h-[13px] w-full bg-transparent text-[13px] leading-none text-white caret-white outline-none"
          />
        </div>
        <button
          type="submit"
          data-testid="support-send"
          disabled={busy || !draft.trim()}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white transition enabled:hover:bg-rose-400 disabled:opacity-40"
          aria-label={tr.common.send}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
    </>
  );

  // A phone gets the app's bottom sheet: it slides up, drags down and sits
  // above the keyboard like every other sheet.
  if (phone) {
    return (
      <ModalSurface
        open={open}
        onClose={hide}
        onExited={() => setMounted(false)}
        label={m.dialogLabel}
        sheet
        sheetFixedHeight
        zIndex={80}
        testId="support-messenger"
        style={{ background: "#171717" }}
      >
        {panel}
      </ModalSurface>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-80 flex items-end justify-end p-4 sm:p-5">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden={!open}
        className={`pointer-events-auto absolute inset-0 bg-black/25 transition-opacity duration-200 sm:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={hide}
      />
      <div
        data-testid="support-messenger"
        data-open={open ? "true" : "false"}
        className={`pointer-events-auto relative flex h-[min(40rem,calc(var(--app-content-h)-5.5rem))] w-[min(100%,26rem)] origin-bottom-right rtl:origin-bottom-left flex-col overflow-hidden rounded-2xl border border-line bg-[#171717] shadow-[0_24px_80px_rgba(0,0,0,0.55)] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.96] opacity-0"
        }`}
        role="dialog"
        aria-label={m.dialogLabel}
      >
        {panel}
      </div>
    </div>
  );
}
