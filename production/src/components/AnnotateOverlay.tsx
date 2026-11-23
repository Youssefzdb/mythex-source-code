import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Check,
  ChevronDown,
  Circle,
  Loader2,
  MoveUpRight,
  Pencil,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useT, type AppMessages } from "../i18n/app";
import { orch, previewServerScreenshot, type OrchClient } from "../lib/orchestrator";
import { ConfirmDialog } from "./ui";
import { CursorIcon } from "./ui/CursorIcon";
import { Popover } from "./ui/Popover";
import { COMPOSER_ATTACH_EVENT, type ComposerAttachDetail, type PreviewTools } from "../lib/preview-tools-client";

/**
 * Select and annotate the preview, the way Claude's own preview does — one
 * mode, one bar:
 *   - the pointer picks elements on the live page, which keeps scrolling (the
 *     inspector itself runs in the page, public/preview-tools.js); each pick
 *     becomes a chip in the chat;
 *   - any drawing tool freezes the page into a picture first, then pen, line,
 *     arrow, box, circle and text go on it, and "Add to chat" sends it as one
 *     image. Back to the pointer (or Close) with marks on it asks first whether
 *     to discard them, then the page is live again.
 * Nothing here edits the app — the agent does, the usual way.
 *
 * In the person's language (workspace.annotate).
 */

type Tool = "select" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "text";
type Pt = { x: number; y: number };
type Shape =
  | { id: string; kind: "pen"; color: string; points: Pt[] }
  | { id: string; kind: "line" | "arrow" | "rect" | "ellipse"; color: string; a: Pt; b: Pt }
  | { id: string; kind: "text"; color: string; at: Pt; text: string; size: number };
type Rect = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
/** The text being typed: a new one (id null) or one being edited again. */
type Editing = { id: string | null; at: Pt; size: number; color: string; value: string };

const TEXT_SIZE = 24;
const textFont = (size: number) => `500 ${size}px Inter, system-ui, sans-serif`;
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * size * 0.55;
  measureCtx.font = textFont(size);
  return measureCtx.measureText(text).width;
}

type AnnotateText = AppMessages["workspace"]["annotate"];
const COLORS: Array<{ value: string; name: keyof AnnotateText }> = [
  { value: "#ef4444", name: "colorRed" },
  { value: "#3b82f6", name: "colorBlue" },
  { value: "#22c55e", name: "colorGreen" },
  { value: "#111111", name: "colorBlack" },
  { value: "#ffffff", name: "colorWhite" },
];
const STROKE = 3;
const TOOLS: Array<{ id: Tool; label: keyof AnnotateText; key: string; Icon: ComponentType<{ className?: string }> }> = [
  { id: "select", label: "toolSelect", key: "v", Icon: CursorIcon },
  { id: "pen", label: "toolPen", key: "p", Icon: Pencil },
  { id: "line", label: "toolLine", key: "l", Icon: Slash },
  { id: "arrow", label: "toolArrow", key: "a", Icon: MoveUpRight },
  { id: "rect", label: "toolRect", key: "r", Icon: Square },
  { id: "ellipse", label: "toolEllipse", key: "o", Icon: Circle },
  { id: "text", label: "toolText", key: "t", Icon: Type },
];

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Geometry ──────────────────────────────────────────────────────────────────

function bounds(s: Shape): Rect {
  if (s.kind === "pen") {
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (s.kind === "text") return { x: s.at.x, y: s.at.y, w: Math.max(8, textWidth(s.text, s.size)), h: s.size * 1.25 };
  const x = Math.min(s.a.x, s.b.x);
  const y = Math.min(s.a.y, s.b.y);
  return { x, y, w: Math.abs(s.b.x - s.a.x), h: Math.abs(s.b.y - s.a.y) };
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Is the point on the shape's stroke (or inside its box, for text)? */
function hitShape(s: Shape, p: Pt): boolean {
  const tol = 8;
  if (s.kind === "pen") {
    for (let i = 1; i < s.points.length; i++) if (distToSegment(p, s.points[i - 1], s.points[i]) < tol) return true;
    return false;
  }
  if (s.kind === "line" || s.kind === "arrow") return distToSegment(p, s.a, s.b) < tol;
  const r = bounds(s);
  if (s.kind === "text") return p.x >= r.x - 4 && p.x <= r.x + r.w + 4 && p.y >= r.y - 4 && p.y <= r.y + r.h + 4;
  if (s.kind === "rect") {
    const inside = p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
    const deep = p.x > r.x + tol && p.x < r.x + r.w - tol && p.y > r.y + tol && p.y < r.y + r.h - tol;
    return inside && !deep;
  }
  // ellipse: near the outline
  const rx = r.w / 2 || 1;
  const ry = r.h / 2 || 1;
  const nx = (p.x - (r.x + rx)) / rx;
  const ny = (p.y - (r.y + ry)) / ry;
  const d = Math.sqrt(nx * nx + ny * ny);
  return Math.abs(d - 1) * Math.min(rx, ry) < tol;
}

function moveShape(s: Shape, dx: number, dy: number): Shape {
  const m = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  if (s.kind === "pen") return { ...s, points: s.points.map(m) };
  if (s.kind === "text") return { ...s, at: m(s.at) };
  return { ...s, a: m(s.a), b: m(s.b) };
}

/** The shape stretched from one box to another — corner handles; text scales its size. */
function scaleShape(s: Shape, from: Rect, to: Rect): Shape {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const m = (p: Pt) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  if (s.kind === "pen") return { ...s, points: s.points.map(m) };
  if (s.kind === "text") return { ...s, at: { x: to.x, y: to.y }, size: Math.max(8, Math.min(240, s.size * sy)) };
  return { ...s, a: m(s.a), b: m(s.b) };
}

/**
 * A text resized to a box: its width does not grow quite in step with its size,
 * so pick the size whose measured width fills the box, then pin the corner that
 * is not being dragged.
 */
function fitText(s: Extract<Shape, { kind: "text" }>, from: Rect, corner: Corner, to: Rect): Shape {
  let size = s.size * (from.h ? to.h / from.h : 1);
  for (let i = 0; i < 3; i++) size *= to.w / Math.max(1, textWidth(s.text, size));
  size = Math.max(8, Math.min(240, size));
  const w = Math.max(8, textWidth(s.text, size));
  const h = size * 1.25;
  const fixed = corners(from)[({ nw: "se", ne: "sw", sw: "ne", se: "nw" } as const)[corner]];
  return {
    ...s,
    size,
    at: { x: corner === "nw" || corner === "sw" ? fixed.x - w : fixed.x, y: corner === "nw" || corner === "ne" ? fixed.y - h : fixed.y },
  };
}

function corners(r: Rect): Record<Corner, Pt> {
  return {
    nw: { x: r.x, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    sw: { x: r.x, y: r.y + r.h },
    se: { x: r.x + r.w, y: r.y + r.h },
  };
}

/** The box with one corner dragged to p, the opposite corner fixed; text keeps its shape. */
function resized(start: Rect, corner: Corner, p: Pt, keepRatio: boolean): Rect {
  const fixed = corners(start)[({ nw: "se", ne: "sw", sw: "ne", se: "nw" } as const)[corner]];
  let w = Math.max(8, Math.abs(p.x - fixed.x));
  let h = Math.max(8, Math.abs(p.y - fixed.y));
  if (keepRatio && start.w && start.h) {
    // Same shape: the corner goes to the point on its diagonal nearest the
    // pointer — exactly under it when dragged along the diagonal, and as close
    // as the shape allows otherwise (what design tools do).
    const k = Math.max(0.05, (Math.abs(p.x - fixed.x) * start.w + Math.abs(p.y - fixed.y) * start.h) / (start.w * start.w + start.h * start.h));
    w = start.w * k;
    h = start.h * k;
  }
  const x = corner === "nw" || corner === "sw" ? fixed.x - w : fixed.x;
  const y = corner === "nw" || corner === "ne" ? fixed.y - h : fixed.y;
  return { x, y, w, h };
}

function arrowHead(a: Pt, b: Pt, size = 14): [Pt, Pt] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return [
    { x: b.x - size * Math.cos(ang - Math.PI / 7), y: b.y - size * Math.sin(ang - Math.PI / 7) },
    { x: b.x - size * Math.cos(ang + Math.PI / 7), y: b.y - size * Math.sin(ang + Math.PI / 7) },
  ];
}

function penPath(points: Pt[]): string {
  if (!points.length) return "";
  if (points.length < 3) return `M${points[0].x},${points[0].y} ${points.map((p) => `L${p.x},${p.y}`).join(" ")}`;
  // Smooth through midpoints.
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${points[i].x},${points[i].y} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

// ── Export ────────────────────────────────────────────────────────────────────

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.kind === "pen") {
    ctx.stroke(new Path2D(penPath(s.points)));
    return;
  }
  if (s.kind === "text") {
    ctx.font = textFont(s.size);
    ctx.textBaseline = "middle";
    ctx.fillText(s.text, s.at.x, s.at.y + (s.size * 1.25) / 2);
    return;
  }
  ctx.beginPath();
  if (s.kind === "line" || s.kind === "arrow") {
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();
    if (s.kind === "arrow") {
      const [l, r] = arrowHead(s.a, s.b);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
    return;
  }
  const r = bounds(s);
  if (s.kind === "rect") ctx.strokeRect(r.x, r.y, r.w, r.h);
  else {
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}


function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnotateOverlay({
  tools,
  previewPath,
  client,
  onClose,
  toolbarDock,
  pageLoads = 0,
}: {
  tools: PreviewTools;
  /** Where the toolbar goes: a strip below the preview, so it never sits over the page. */
  toolbarDock?: HTMLElement | null;
  /** Bumped on each load of the preview page; a reload wipes the tools, so they go back in. */
  pageLoads?: number;
  /** The page shown, for the server screenshot fallback. */
  previewPath: string;
  client: OrchClient | null;
  onClose: () => void;
}) {
  const at = useT().workspace.annotate;
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0].value);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  /** What the pointer is over when not dragging: a corner of the selection, or a mark. */
  const [hover, setHover] = useState<{ corner?: Corner; id?: string } | null>(null);
  /** The frozen page: what is drawn on, and what is sent. */
  const [base, setBase] = useState<string | null>(null);
  /** live: picking elements on the page itself; then frozen for drawing. */
  /** live: picking on the page itself; frozen: drawing (the picture arrives underneath). */
  const [phase, setPhase] = useState<"live" | "frozen">("live");
  /** The picture being taken, so "Add to chat" can wait for it if it is not in yet. */
  const shotRef = useRef<Promise<string | null> | null>(null);
  const [canPick, setCanPick] = useState<boolean | null>(null);
  /** Leaving the picture with marks on it: what to do once they are discarded. */
  const [confirm, setConfirm] = useState<null | "select" | "close">(null);
  // Where the full bar does not fit (a phone, a narrow pane) it turns into Claude's
  // compact one: the tools and the colours each behind a menu. The full bar's width
  // is kept from when it was last shown, to know when there is room for it again.
  const barRef = useRef<HTMLDivElement>(null);
  const fullBarWidth = useRef(0);
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState<null | "tool" | "color">(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const room = bar?.parentElement;
    if (!bar || !room) return;
    const check = () => {
      const pad = parseFloat(getComputedStyle(room).paddingLeft) + parseFloat(getComputedStyle(room).paddingRight);
      const avail = room.clientWidth - pad;
      if (!compact) {
        fullBarWidth.current = bar.offsetWidth;
        if (bar.offsetWidth > avail) setCompact(true);
      } else if (fullBarWidth.current && fullBarWidth.current <= avail) {
        setCompact(false);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(room);
    return () => ro.disconnect();
  }, [toolbarDock, compact]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const past = useRef<Shape[][]>([]);
  const future = useRef<Shape[][]>([]);
  const [, setHistoryTick] = useState(0);
  const drag = useRef<
    | { kind: "draw"; start: Pt; last: Pt; id: string }
    | { kind: "move"; start: Pt; last: Pt; id: string; before: Shape[] }
    | { kind: "resize"; id: string; corner: Corner; from: Rect; shape: Shape; before: Shape[]; grab: Pt }
    | null
  >(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Open on the live page with the pointer: the page's own inspector picks.
  useEffect(() => {
    let cancelled = false;
    void tools.ensure().then((ok) => {
      if (cancelled) return;
      setCanPick(ok);
      if (!ok) return;
      tools.post({ type: "mythex:tools:select", on: true });
      // Fonts prepared now, so freezing to draw is quick.
      tools.post({ type: "mythex:tools:warm" });
    });
    // Esc inside the page ends the whole mode.
    const off = tools.on("mythex:tools:select-ended", () => onClose());
    return () => {
      cancelled = true;
      off();
      tools.post({ type: "mythex:tools:select", on: false });
    };
    // Once, when the mode opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page reloaded under the open mode (the agent's edit, Refresh, a full
  // navigation): the tools went with the old page. Put them back and, if
  // picking, pick again — it used to go dead until the mode was reopened.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const firstLoads = useRef(pageLoads);
  useEffect(() => {
    if (pageLoads === firstLoads.current) return;
    let cancelled = false;
    void tools.ensure().then((ok) => {
      if (cancelled) return;
      setCanPick(ok);
      if (!ok) return;
      if (phaseRef.current === "live") tools.post({ type: "mythex:tools:select", on: true });
      tools.post({ type: "mythex:tools:warm" });
    });
    return () => {
      cancelled = true;
    };
  }, [pageLoads, tools]);

  /**
   * Freeze the page to draw on. Drawing starts at once: this layer now takes the
   * pointer and the wheel, so the page under it cannot move, and the picture of
   * it (taken in the page as scrolled, else by the sandbox's browser) slips in
   * underneath when ready — the same pixels, so nothing visibly changes.
   */
  const freeze = useCallback(() => {
    tools.post({ type: "mythex:tools:select", on: false });
    setPhase("frozen");
    const el = rootRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const shot = (async () => {
      if (canPick) {
        const res = await tools.ask({ type: "mythex:tools:shot" }, 20_000);
        if (typeof res?.dataUrl === "string") return res.dataUrl;
      }
      return client ? previewServerScreenshot(client, previewPath, w, h).catch(() => null) : null;
    })();
    shotRef.current = shot;
    void shot.then((url) => {
      if (shotRef.current === shot && url) setBase(url);
    });
  }, [tools, canPick, client, previewPath]);

  /** Back to the live page, picking elements again; the picture and its marks go. */
  const unfreeze = useCallback(() => {
    setShapes([]);
    setDraft(null);
    setSelectedId(null);
    setEditing(null);
    past.current = [];
    future.current = [];
    shotRef.current = null;
    setBase(null);
    setPhase("live");
    setTool("select");
    if (canPick) tools.post({ type: "mythex:tools:select", on: true });
  }, [canPick, tools]);

  const chooseTool = useCallback(
    (t: Tool) => {
      if (t === "select") {
        if (phase === "live") return;
        if (shapes.length) setConfirm("select");
        else unfreeze();
        return;
      }
      setTool(t);
      if (phase === "live") void freeze();
    },
    [phase, freeze, shapes.length, unfreeze],
  );

  const requestClose = useCallback(() => {
    if (phase !== "live" && shapes.length) setConfirm("close");
    else onClose();
  }, [phase, shapes.length, onClose]);

  // Drawing never reaches the sandbox, so tell it someone is here: an idle
  // sandbox pauses, and the dev server's live reload then reloads the page.
  useEffect(() => {
    if (!client) return;
    void orch.touch(client).catch(() => {});
    const t = window.setInterval(() => void orch.touch(client).catch(() => {}), 30_000);
    return () => window.clearInterval(t);
  }, [client]);

  // ── History ──
  const commit = useCallback(
    (next: Shape[]) => {
      past.current.push(shapes);
      future.current = [];
      setShapes(next);
      setHistoryTick((n) => n + 1);
    },
    [shapes],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(shapes);
    setShapes(prev);
    setSelectedId(null);
    setHistoryTick((n) => n + 1);
  }, [shapes]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(shapes);
    setShapes(next);
    setHistoryTick((n) => n + 1);
  }, [shapes]);
  const remove = useCallback(() => {
    if (!selectedId) return;
    commit(shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, shapes, commit]);

  // ── Pointer ──
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The text being typed, once: the click that ends it and the box's blur must not both save it. */
  const editingDone = useRef<Editing | null>(null);
  /** Finish the text being typed: add it, change it, or drop it when emptied. */
  const commitText = useCallback(
    (ed: Editing) => {
      if (editingDone.current === ed) return;
      editingDone.current = ed;
      const text = ed.value.trim();
      if (ed.id) {
        const prev = shapes.find((x) => x.id === ed.id);
        if (prev && prev.kind === "text" && prev.text === text) return;
        commit(text ? shapes.map((x) => (x.id === ed.id && x.kind === "text" ? { ...x, text } : x)) : shapes.filter((x) => x.id !== ed.id));
      } else if (text) {
        const id = uid();
        commit([...shapes, { id, kind: "text", color: ed.color, at: ed.at, text, size: ed.size }]);
        setSelectedId(id);
      }
    },
    [shapes, commit],
  );

  /** The selected mark's corner handle under p, if any. */
  const cornerAt = (p: Pt): Corner | null => {
    const selected = shapes.find((x) => x.id === selectedId);
    if (!selected) return null;
    const r = bounds(selected);
    const box = { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 };
    const hit = (Object.entries(corners(box)) as Array<[Corner, Pt]>).find(([, c]) => Math.hypot(p.x - c.x, p.y - c.y) <= 9);
    return hit ? hit[0] : null;
  };
  /** The topmost mark under p: on its stroke, or inside a text's box (or the selected mark's box). */
  const shapeAt = (p: Pt): Shape | null => {
    const selected = shapes.find((x) => x.id === selectedId);
    if (selected) {
      const r = bounds(selected);
      if (p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6) return selected;
    }
    return [...shapes].reverse().find((x) => hitShape(x, p)) ?? null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || phase !== "frozen" || e.button !== 0) return;
    const p = local(e);
    if (editing) {
      // A click away from the text being typed finishes it.
      commitText(editing);
      setEditing(null);
      e.preventDefault();
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // A corner of the selected mark: resize it.
    const corner = cornerAt(p);
    const selected = shapes.find((x) => x.id === selectedId);
    if (corner && selected) {
      const from = bounds(selected);
      const c = corners(from)[corner];
      drag.current = { kind: "resize", id: selected.id, corner, from, shape: selected, before: shapes, grab: { x: c.x - p.x, y: c.y - p.y } };
      return;
    }
    // A mark already drawn (anywhere in the selected one's box): select it and move it.
    const onShape = shapeAt(p);
    if (onShape) {
      setSelectedId(onShape.id);
      drag.current = { kind: "move", start: p, last: p, id: onShape.id, before: shapes };
      return;
    }
    setSelectedId(null);
    if (tool === "text") {
      // Just a caret where the click was; the text is typed straight onto the page.
      e.preventDefault();
      setEditing({ id: null, at: { x: p.x, y: p.y - (TEXT_SIZE * 1.25) / 2 }, size: TEXT_SIZE, color, value: "" });
      return;
    }
    const id = uid();
    const shape: Shape =
      tool === "pen"
        ? { id, kind: "pen", color, points: [p] }
        : { id, kind: tool as "line" | "arrow" | "rect" | "ellipse", color, a: p, b: p };
    setDraft(shape);
    drag.current = { kind: "draw", start: p, last: p, id };
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== "frozen") return;
    const p = local(e);
    const t = [...shapes].reverse().find((x) => x.kind === "text" && hitShape(x, p));
    if (t && t.kind === "text") {
      setSelectedId(t.id);
      setEditing({ id: t.id, at: t.at, size: t.size, color: t.color, value: t.text });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const p = local(e);
    if (!d) {
      if (phase !== "frozen" || editing) return;
      const corner = cornerAt(p);
      const over = corner ? null : shapeAt(p);
      const next: { corner?: Corner; id?: string } | null = corner ? { corner } : over ? { id: over.id } : null;
      if (next?.corner !== hover?.corner || next?.id !== hover?.id) setHover(next);
      return;
    }
    if (d.kind === "draw" && draft) {
      setDraft(draft.kind === "pen" ? { ...draft, points: [...draft.points, p] } : draft.kind === "text" ? draft : { ...draft, b: p });
      d.last = p;
    } else if (d.kind === "move") {
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      setShapes((all) => all.map((x) => (x.id === d.id ? moveShape(x, dx, dy) : x)));
      d.last = p;
    } else if (d.kind === "resize") {
      // Where the mark's corner was relative to the grab point stays fixed, so the corner rides under the pointer.
      const at = { x: p.x + d.grab.x, y: p.y + d.grab.y };
      const to = resized(d.from, d.corner, at, d.shape.kind === "text" || e.shiftKey);
      setShapes((all) => all.map((x) => (x.id === d.id ? (d.shape.kind === "text" ? fitText(d.shape, d.from, d.corner, to) : scaleShape(d.shape, d.from, to)) : x)));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "draw" && draft) {
      const r = bounds(draft);
      const tiny = draft.kind === "pen" ? draft.points.length < 3 : Math.max(r.w, r.h) < 6;
      setDraft(null);
      if (!tiny) commit([...shapes, draft]);
      return;
    }
    if (d.kind === "move" || d.kind === "resize") {
      // One history step for the whole drag, if anything moved.
      if (d.before !== shapes) {
        past.current.push(d.before);
        future.current = [];
        setHistoryTick((n) => n + 1);
      }
    }
  };

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || confirm) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        e.preventDefault();
        if (selectedId) setSelectedId(null);
        else requestClose();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        remove();
      } else if (!mod && !e.altKey) {
        const found = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (found) chooseTool(found.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, undo, redo, remove, selectedId, editing, chooseTool, confirm]);

  // ── Add to chat ──
  const addToChat = async () => {
    if (busy || phase !== "frozen") return;
    setBusy(true);
    setError(null);
    try {
      const shot = base ?? (await shotRef.current);
      if (!shot) throw new Error(at.shotFailed);
      const img = await loadImage(shot);
      const scale = img.naturalWidth / size.w;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = Math.round(size.h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      shapes.forEach((s) => drawShape(ctx, s));
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("could not make the picture");
      const file = new File([blob], `annotation-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.png`, {
        type: "image/png",
      });
      window.dispatchEvent(new CustomEvent<ComposerAttachDetail>(COMPOSER_ATTACH_EVENT, { detail: { file } }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : at.addFailed);
    } finally {
      setBusy(false);
    }
  };

  const all = draft ? [...shapes, draft] : shapes;
  const sel = shapes.find((s) => s.id === selectedId) ?? null;
  const dragging = drag.current;
  const activeCorner = dragging?.kind === "resize" ? dragging.corner : hover?.corner;
  const cursor = activeCorner
    ? activeCorner === "nw" || activeCorner === "se"
      ? "nwse-resize"
      : "nesw-resize"
    : dragging?.kind === "move"
      ? "grabbing"
      : hover?.id
        ? "move"
        : tool === "select"
          ? "default"
          : tool === "text"
            ? "text"
            : "crosshair";
  const hovered = !dragging && hover?.id && hover.id !== selectedId ? shapes.find((x) => x.id === hover.id) : null;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 select-none overflow-hidden"
      // Live: the page underneath takes the pointer and the wheel; only the bar is ours.
      // Frozen, this layer takes the pointer and the wheel, so the page under the drawing stays put.
      // touch-action none: on a touch screen a finger draws rather than scrolling the page.
      style={phase === "live" ? { pointerEvents: "none" } : { cursor, touchAction: "none" }}
      data-testid="annotate-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      {base && <img src={base} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />}
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
        {all.map((s) => (s.id === editing?.id ? null : <ShapeSvg key={s.id} shape={s} />))}
        {hovered && !editing && (
          <rect
            x={bounds(hovered).x - 6}
            y={bounds(hovered).y - 6}
            width={bounds(hovered).w + 12}
            height={bounds(hovered).h + 12}
            fill="none"
            stroke="#3b82f6"
            strokeOpacity={0.6}
            strokeWidth={1}
            strokeDasharray="5 4"
          />
        )}
        {sel && !editing && <SelectionBox r={bounds(sel)} />}
      </svg>

      {editing && (
        <input
          autoFocus
          value={editing.value}
          spellCheck={false}
          aria-label={at.toolText}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              commitText(editing);
              setEditing(null);
            }
          }}
          onBlur={() => {
            commitText(editing);
            setEditing(null);
          }}
          // No box: a caret where the text goes, in the text's own size and colour.
          className="absolute border-0 bg-transparent p-0 outline-none"
          style={{
            left: editing.at.x,
            top: editing.at.y,
            height: editing.size * 1.25,
            width: Math.max(4, textWidth(editing.value, editing.size)) + editing.size,
            font: textFont(editing.size),
            color: editing.color,
            caretColor: editing.color,
          }}
        />
      )}

      {/* Toolbar: in the strip under the preview when there is one (so it covers none of the page),
          else floating at its foot. In a narrow preview its groups wrap onto more rows. */}
      {(() => {
        const bar = (
        <div
          ref={barRef}
          className={`pointer-events-auto flex shrink-0 items-center ${compact ? "gap-0.5" : "gap-1"} rounded-xl border border-white/10 bg-[#1c1c1c]/95 p-1.5 whitespace-nowrap shadow-2xl shadow-black/50`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          data-testid="annotate-toolbar"
          data-compact={compact || undefined}
        >
          {compact ? (
            <>
              <Popover
                open={menu === "tool"}
                onOpenChange={(o) => setMenu(o ? "tool" : null)}
                side="top"
                sideOffset={8}
                label={at.tools}
                className="w-48 rounded-xl border border-white/10 bg-[#1c1c1c] p-1 shadow-2xl shadow-black/50"
                trigger={
                  <button type="button" aria-label={at.tools} className={menuTrigger(menu === "tool")} data-testid="annotate-tool-menu">
                    {(() => {
                      const Icon = TOOLS.find((t) => t.id === tool)!.Icon;
                      return <Icon className="size-4" />;
                    })()}
                    <ChevronDown className="size-3.5 text-white/60" />
                  </button>
                }
              >
                {TOOLS.map(({ id, label, Icon }) => (
                  <MenuRow
                    key={id}
                    checked={tool === id}
                    onClick={() => {
                      setMenu(null);
                      chooseTool(id);
                    }}
                  >
                    <Icon className="size-4 shrink-0" />
                    {at[label]}
                  </MenuRow>
                ))}
              </Popover>
              <Popover
                open={menu === "color"}
                onOpenChange={(o) => setMenu(o ? "color" : null)}
                side="top"
                sideOffset={8}
                label={at.colors}
                className="w-40 rounded-xl border border-white/10 bg-[#1c1c1c] p-1 shadow-2xl shadow-black/50"
                trigger={
                  <button type="button" aria-label={at.color} className={menuTrigger(menu === "color")} data-testid="annotate-color-menu">
                    <Swatch color={color} />
                    <ChevronDown className="size-3.5 text-white/60" />
                  </button>
                }
              >
                {COLORS.map((c) => (
                  <MenuRow
                    key={c.value}
                    checked={color === c.value}
                    onClick={() => {
                      setMenu(null);
                      setColor(c.value);
                    }}
                  >
                    <Swatch color={c.value} />
                    {at[c.name]}
                  </MenuRow>
                ))}
              </Popover>
            </>
          ) : (
            <>
              {TOOLS.map(({ id, label, key, Icon }) => (
                <ToolButton key={id} label={`${at[label]} (${key.toUpperCase()})`} active={tool === id} onClick={() => chooseTool(id)}>
                  <Icon className="size-4" />
                </ToolButton>
              ))}
              <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={at[c.name]}
                  title={at[c.name]}
                  onClick={() => setColor(c.value)}
                  className={`grid size-7 shrink-0 place-items-center rounded-full transition ${color === c.value ? "ring-2 ring-white/70" : "hover:bg-white/10"}`}
                >
                  <span className="size-4 rounded-full border border-white/30" style={{ background: c.value }} />
                </button>
              ))}
            </>
          )}
          <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
          <ToolButton label={at.undo} disabled={!past.current.length} onClick={undo}>
            <Undo2 className="size-4" />
          </ToolButton>
          <ToolButton label={at.redo} disabled={!future.current.length} onClick={redo}>
            <Redo2 className="size-4" />
          </ToolButton>
          <ToolButton label={at.discard} disabled={phase !== "frozen"} onClick={() => (shapes.length ? setConfirm("select") : unfreeze())}>
            <Trash2 className="size-4" />
          </ToolButton>
          {compact ? (
            <ToolButton label={at.close} onClick={requestClose}>
              <X className="size-4" />
            </ToolButton>
          ) : (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
              <button
                type="button"
                onClick={requestClose}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void addToChat()}
            disabled={busy || phase !== "frozen"}
            data-testid="annotate-add-to-chat"
            className="ms-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-900 transition hover:bg-white/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {at.addToChat}
          </button>
        </div>
        );
        return toolbarDock ? (
          createPortal(bar, toolbarDock)
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-2">{bar}</div>
        );
      })()}

      {phase === "live" && canPick === false && (
        <div className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-center text-xs text-white">
          {at.pickUnavailable}
        </div>
      )}
      {confirm && (
        // The app's own dialog, centred over the whole workspace.
        <ConfirmDialog
          title={at.discardTitle}
          subtitle={at.discardBody}
          cancelLabel={at.keepEditing}
          confirmLabel={at.discard}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const next = confirm;
            setConfirm(null);
            if (next === "close") onClose();
            else unfreeze();
          }}
        />
      )}
      {error && (
        <div
          className="absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-center text-xs text-white"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function ShapeSvg({ shape: s }: { shape: Shape }) {
  const common = { stroke: s.color, strokeWidth: STROKE, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (s.kind === "pen") return <path d={penPath(s.points)} {...common} />;
  if (s.kind === "text")
    return (
      <text x={s.at.x} y={s.at.y + (s.size * 1.25) / 2} dominantBaseline="central" fill={s.color} style={{ font: textFont(s.size) }}>
        {s.text}
      </text>
    );
  if (s.kind === "line") return <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} {...common} />;
  if (s.kind === "arrow") {
    const [l, r] = arrowHead(s.a, s.b);
    return (
      <g {...common}>
        <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} />
        <polyline points={`${l.x},${l.y} ${s.b.x},${s.b.y} ${r.x},${r.y}`} />
      </g>
    );
  }
  const r = bounds(s);
  if (s.kind === "rect") return <rect x={r.x} y={r.y} width={r.w} height={r.h} {...common} />;
  return <ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} {...common} />;
}

/** The selected mark: a dashed box with a handle on each corner, like Claude's. */
function SelectionBox({ r }: { r: Rect }) {
  const box = { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 };
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 4" />
      {Object.values(corners(box)).map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
      ))}
    </g>
  );
}

/** The compact bar's menu buttons: the current tool or colour, and a chevron. */
function menuTrigger(open: boolean): string {
  return `flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-white/85 transition hover:bg-white/10 hover:text-white ${open ? "bg-white/10" : ""}`;
}

function Swatch({ color }: { color: string }) {
  return <span className="size-4 shrink-0 rounded-full border border-white/40" style={{ background: color }} />;
}

/** A row in the compact bar's menus: icon, name, and a check on the one in use. */
function MenuRow({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-[14px] text-white/90 transition hover:bg-white/10"
    >
      {children}
      {checked && <Check className="ms-auto size-4 shrink-0 text-blue-400" />}
    </button>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 shrink-0 place-items-center rounded-lg transition disabled:opacity-35 ${
        active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
