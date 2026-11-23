import { isNative, nativePlatform } from "./native";
import { glideScrollTo } from "./glide-scroll";

/**
 * The page follows the keyboard instead of jumping after it (iOS).
 *
 * With the web view resized natively, iOS changed the page's height only once
 * the keyboard had finished sliding up: measured in the simulator, nothing
 * moved for half a second while the keyboard covered the composer, then the
 * whole layout snapped up 167px in a single frame. Every input in the app did
 * it.
 *
 * So the web view is no longer resized (`Keyboard.resize: "none"` in
 * capacitor.config.ts) and the page makes the room itself. The keyboard says
 * how tall it will be as it starts to move; that goes into `--kb`, which is a
 * registered, animatable length (index.css), so the layout eases into its new
 * height over the same time the keyboard takes — the composer rides up with
 * the keyboard rather than being uncovered by it.
 *
 * In the chat that per-frame resize was too heavy: a long transcript, its tool
 * groups open, got two layout passes in the whole rise (measured: 8,700px of
 * transcript, 200ms+ between them) and the composer sat under the keyboard for
 * half a second, then jumped. So when the composer has the focus the motion is
 * a transform instead, on just the transcript and the composer (a root custom
 * property restyled every element each frame and was still janky): they slide
 * up with the keyboard, and the layout takes the keyboard's room once, after it
 * has arrived — with the transcript's scroll moved by exactly what the swap
 * moved, so nothing on screen shifts. Closing is the reverse, except that the
 * room comes back as #root's own height and --kb follows once the keyboard is
 * gone (see keyboardWillHide), and it starts on the composer's focusout. Measured
 * in that worst case after: the composer rose in 13 frames (one 170px first
 * step, as the keyboard's own first frame, then ≤21px each) with the last
 * message a constant 62px above it.
 *
 * Android is left to the system: its window resizes with the keyboard
 * (adjustResize), and the resize option here is iOS-only anyway.
 */
/** How close to the end of the chat counts as being at it (as following a reply does, ChatPanel). */
const NEAR_END = 48;
const CURVE = "cubic-bezier(0.17, 0.59, 0.4, 0.77)";

export async function initNativeKeyboard(): Promise<void> {
  if (!isNative()) return;
  if (nativePlatform() === "android") {
    initAndroidReveal();
    return;
  }
  if (nativePlatform() !== "ios") return;
  const root = document.documentElement;
  const setKb = (px: number) => root.style.setProperty("--kb", `${px}px`);
  const transcripts = () => [...document.querySelectorAll<HTMLElement>(".ws-transcript")];
  /** What slides in the chat: its transcript, its composer and the ↓ above it. */
  const movers = () => [...document.querySelectorAll<HTMLElement>(".ws-transcript, .ws-composer-dock, .ws-jump")];
  /**
   * The chat's own composer has the focus: the one field whose page is heavy
   * enough to slide instead of resizing. A field anywhere else — a sheet's
   * search, settings — rises with the layout, as before; sliding the chat
   * behind a sheet left the sheet itself to jump up at the end.
   */
  const composerFocused = () => !!document.activeElement?.closest(".ws-composer-dock");
  /** How the keyboard that is up (or rising) was given its room. */
  let mode: "slide" | "layout" = "layout";
  /**
   * The home-indicator room the composer gives up once --kb lands (its bottom
   * padding drops from the inset to its 0.75rem floor): the slide stops short
   * by this much, which is exactly where the layout puts it at the swap.
   */
  let giveBack = 0;
  const measureGiveBack = () => {
    const dock = document.querySelector<HTMLElement>(".ws-composer-dock");
    const pad = dock ? Number.parseFloat(getComputedStyle(dock).paddingBottom) || 0 : 0;
    giveBack = Math.max(0, pad - 12);
  };
  /**
   * How far a mover's content really moves on screen when the layout takes
   * `px` from the chat (`rise`, the keyboard opening) or gives it back
   * (`fall`). The composer always goes the whole way. A transcript's content
   * goes only as far as its scroll lets it — slid further, it overshot and the
   * swap snapped it back (measured in the simulator):
   *   - a long chat, scrolled to its end: the whole way;
   *   - a short one, sitting at its top ("hi" and a reply): only by however
   *     much it will then overflow, often nothing — rising it the whole way
   *     sent it up under the header and dropped it back as the keyboard landed;
   *     on the way down it jumped up first, then fell;
   *   - the empty chat ("What do you want to build?"), centred: half as far,
   *     and no further than the top of its space.
   */
  const emptyFirst = (t: HTMLElement) => t.querySelector<HTMLElement>("[data-chat-empty]")?.firstElementChild ?? null;
  /** Each transcript's scroll as the keyboard started down (see travel). */
  let fallScroll = new Map<HTMLElement, number>();
  /**
   * Transcripts whose fall only undoes what the rise raised: they end at their
   * own place, not held up with the composer by its home-indicator room —
   * held, they came back 22px off where they were, each time.
   */
  const undoingRise = new Map<HTMLElement, boolean>();
  /**
   * Transcripts at their end as the keyboard started up: they end there too
   * once it is up, whatever moved them in between. Measured right, the slide
   * and the swap already leave them there; on a phone, after the ↓ had brought
   * the chat down, opening the keyboard still left it 278px short of its end
   * with the ↓ showing (logged in the simulator, once in several tries).
   */
  let endAtRise = new Set<HTMLElement>();
  /**
   * The chats that are at their end, moved the last few pixels there, for the
   * keyboard to keep them at it. Only within NEAR_END, where the ↓ hides too
   * (ChatPanel): when the ↓ waited for 200px, "no ↓" also counted, and a chat
   * scrolled up a little (153px) jumped to its end as the keyboard opened
   * (logged on an iPhone). The ↓ goes straight to the end in the app, so it
   * never leaves the chat short.
   */
  const snapToEnd = () => {
    endAtRise = new Set();
    for (const t of transcripts()) {
      const gap = t.scrollHeight - t.clientHeight - t.scrollTop;
      if (gap > NEAR_END) continue;
      if (gap > 0) t.scrollTop = t.scrollHeight - t.clientHeight;
      endAtRise.add(t);
    }
  };
  const keepAtEnd = () => {
    for (const t of endAtRise) {
      const end = t.scrollHeight - t.clientHeight;
      if (t.isConnected && end - t.scrollTop > 1) t.scrollTop = end;
    }
  };
  /**
   * No caret while the composer slides (index.css): marked on the composer
   * itself — a class on <html> restyled the whole page in the slide's first
   * frame.
   */
  const setRising = (on: boolean) => {
    for (const dock of document.querySelectorAll<HTMLElement>(".ws-composer-dock")) dock.toggleAttribute("data-kb-rising", on);
  };
  /** Each transcript's scroll as the keyboard started up. */
  let riseScroll = new Map<HTMLElement, number>();
  /**
   * How far opening itself scrolled each transcript (taken as it lands) — not
   * whatever the reader scrolled after: counted from where opening began, a
   * chat scrolled to its end with the keyboard up was carried off it again
   * as the keyboard went.
   */
  let raisedBy = new Map<HTMLElement, number>();
  const travel = (el: HTMLElement, px: number, phase: "rise" | "fall") => {
    if (!px || !el.matches(".ws-transcript")) return px;
    const first = emptyFirst(el);
    if (first) {
      const room = first.getBoundingClientRect().top - first.parentElement!.getBoundingClientRect().top;
      return Math.max(0, Math.min(px / 2, room));
    }
    // Rising, scrolled up from the end: the chat stays where it is and the
    // keyboard covers its bottom, as the ↓ says there is more below. Raised
    // with the keyboard, a chat scrolled up a little was carried to its end
    // and the ↓ went away.
    if (phase === "rise" && el.scrollTop < el.scrollHeight - el.clientHeight - NEAR_END) return 0;
    // Rising: the scroll it will have once the transcript is `px` shorter. The
    // newest turn is held a screen tall (--turn-fill, so a sent prompt can sit
    // at the top) and that hold shrinks with the transcript right after the
    // swap, clamping the scroll back — so count only what will still be there.
    if (phase === "rise") {
      let scrollHeight = el.scrollHeight;
      const filled = el.querySelector<HTMLElement>('[style*="--turn-fill"]');
      const last = filled?.lastElementChild;
      if (filled && last) {
        const natural = last.getBoundingClientRect().bottom - filled.getBoundingClientRect().top;
        const now = filled.offsetHeight;
        scrollHeight -= now - Math.max(natural, now - px);
      }
      return Math.max(0, Math.min(px, scrollHeight - (el.clientHeight - px) - el.scrollTop));
    }
    // Falling: the transcript is already taller. The content comes back down
    // by what opening raised it — so open and shut is where you were — or by
    // more where the taller transcript can no longer keep its scroll (a last
    // turn longer than the screen, read at its end). Brought down by the whole
    // keyboard, a chat scrolled to its end (its newest prompt at the top, held
    // there by --turn-fill, which opening had not moved at all) came back a
    // keyboard short of its end with the ↓ showing; brought down by nothing, a
    // chat scrolled a little up was left at its end.
    const st = fallScroll.get(el) ?? el.scrollTop;
    const raised = raisedBy.get(el) ?? 0;
    const clamped = st - (el.scrollHeight - el.clientHeight);
    undoingRise.set(el, raised >= clamped);
    return Math.max(0, Math.min(px, st, Math.max(raised, clamped)));
  };
  /** Slides timed from a given moment (see `since`), to cancel with the next slide. */
  const timed = new Map<HTMLElement, Animation>();
  const stopTimed = (el: HTMLElement) => {
    timed.get(el)?.cancel();
    timed.delete(el);
  };
  /**
   * `hold`: for a fall, how far each empty chat's content has just been moved
   * down by the room coming back (measured, it is centred), so the slide can
   * hold it where it was and bring it down with the keyboard.
   *
   * `since`: the moment the keyboard started moving (performance.now()), for
   * a slide that should be where the keyboard is by its first frame. A CSS
   * transition starts on the frame it is first drawn, and the first frame after
   * the composer let go came 30–50ms late — the keyboard had fallen 80–115px
   * by then, the composer had not moved, and it spent the rest of the way
   * behind (recorded per frame in the simulator).
   */
  /**
   * Moves an element up or down by laying it out there — `top` on a
   * relatively placed element (and `top` with `bottom` on a sheet's fixed
   * layer, so its height stays), not a transform. iOS draws the caret where a
   * field is laid out and doesn't follow a transform: slid by a transform the
   * caret sat apart from its field for the whole movement. A position-only
   * move is cheap — nothing inside it lays out again.
   */
  const SHIFT = `top 0.25s ${CURVE}, bottom 0.25s ${CURVE}`;
  const shiftY = (el: HTMLElement, px: number) => {
    if (el.matches(".fixed.inset-0")) {
      el.style.top = `${px}px`;
      el.style.bottom = `calc(var(--kb) - ${px}px)`;
      return;
    }
    if (!el.dataset.kbPos && getComputedStyle(el).position === "static") {
      el.dataset.kbPos = "1";
      el.style.position = "relative";
    }
    el.style.top = `${px}px`;
  };
  /**
   * Where a slide starts: `top` that was never set is `auto`, and a
   * transition from `auto` doesn't run — the composer was at the end of its
   * rise in the first frame, ahead of the keyboard (logged on an iPhone).
   */
  const fromHere = (el: HTMLElement) => {
    if (el.style.top) return;
    el.style.transition = "none";
    shiftY(el, 0);
    void el.offsetHeight;
  };
  const clearShift = (el: HTMLElement) => {
    el.style.top = "";
    el.style.bottom = "";
    if (el.dataset.kbPos) {
      delete el.dataset.kbPos;
      el.style.position = "";
    }
  };
  const slide = (
    px: number,
    animate: boolean,
    phase: "rise" | "fall" = "rise",
    hold?: Map<HTMLElement, number>,
    since?: number,
  ) => {
    for (const el of movers()) {
      const d = hold?.has(el) ? hold.get(el)! : travel(el, px, phase);
      const to = `${-d}px`;
      stopTimed(el);
      if (animate && since != null && typeof el.animate === "function") {
        fromHere(el);
        const from = el.style.top;
        el.style.transition = "none";
        shiftY(el, -d);
        const a = el.animate([{ top: from }, { top: to }], { duration: 250, easing: CURVE });
        a.startTime = since;
        timed.set(el, a);
        a.onfinish = () => timed.get(el) === a && timed.delete(el);
        continue;
      }
      if (animate) fromHere(el);
      el.style.transition = animate ? SHIFT : "none";
      shiftY(el, -d);
    }
  };
  const clearSlide = () => {
    for (const el of movers()) {
      stopTimed(el);
      el.style.transition = "";
      clearShift(el);
    }
  };

  /**
   * Change the layout in one frame and keep each transcript's content where it
   * was on screen: its scroll moves by however far its top moved.
   */
  const swap = (change: () => void) => {
    // Scroll read before the change: growing the transcript (the keyboard
    // leaving) clamps its scrollTop to the new maximum at the flush, and a
    // correction applied to the clamped value moved the content by the
    // keyboard's height (measured: 8279 clamped to 7965, then 7651).
    const before = transcripts().map((t) => [t, t.getBoundingClientRect().top, t.scrollTop] as const);
    root.classList.add("kb-snap");
    change();
    // The newest turn holds a screen of chat (--turn-fill, ChatPanel), which
    // its ResizeObserver only catches up with a frame later. Until then the
    // transcript the keyboard just gave back was a keyboard short of its end,
    // the scroll was clamped there, and a chat scrolled to its end came back
    // 328px up from it with the ↓ showing (logged in the simulator: 654 of 654
    // before, 326 after). Sized here, in the same frame, the scroll fits.
    for (const [t] of before) {
      const cs = getComputedStyle(t);
      const pad = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
      t.style.setProperty("--turn-fill", `${Math.max(0, t.clientHeight - pad)}px`);
    }
    void root.offsetHeight;
    for (const [t, top, st] of before) {
      const want = st + (t.getBoundingClientRect().top - top);
      // Only when it has to move: setting the scroll ends a glide in progress
      // (a sent prompt rising to the top, ChatPanel), even to where it is.
      if (Math.abs(t.scrollTop - want) < 1) continue;
      t.scrollTop = want;
      // …and when it did, the glide carries on to where it was going.
      const to = t.dataset.glideTo;
      if (to) glideScrollTo(t, Number(to));
    }
    root.classList.remove("kb-snap");
  };

  /**
   * The sheet or dialog layer the focused field is in (.fixed.inset-0), which
   * then takes the keyboard's room by itself. --kb on the page's root restyled
   * every element of the page on every frame of the keyboard's movement — over
   * a project, the whole chat behind the sheet: the Publish sheet closed its
   * keyboard in four steps 33–92ms apart, Connectors in one 35px jump
   * (measured in the simulator). On the layer it restyles the sheet only; the
   * page behind stays where it is, under the keyboard.
   */
  let kbLayer: HTMLElement | null = null;
  const layerOf = (el: Element | null) => (el instanceof Element ? el.closest<HTMLElement>(".fixed.inset-0") : null);
  const setKbFor = (layer: HTMLElement | null, px: number) => {
    if (layer) layer.style.setProperty("--kb", `${px}px`);
    else setKb(px);
  };
  /**
   * Home's hero slides with the keyboard instead of the page resizing under
   * it: changing --kb on the page restyled every element on every frame of the
   * keyboard's movement. `pageSlide` while it slides, `pageLaid` once the page
   * has taken the room (the block to bring back down on close).
   */
  let pageSlide: { block: HTMLElement; field: HTMLElement; h: number; layer: HTMLElement | null } | null = null;
  let pageLaid: { block: HTMLElement; field: HTMLElement; layer: HTMLElement | null } | null = null;
  const slideBlockOf = (el: Element | null) =>
    el instanceof HTMLElement && !el.closest(".ws-composer-dock, .fixed.inset-0") ? el.closest<HTMLElement>("[data-kb-slide]") : null;
  /** --kb on a sheet's layer, or the page's; null removes the layer's own. */
  const kbOn = (layer: HTMLElement | null, px: number | null) => {
    if (!layer) setKb(px ?? 0);
    else if (px == null) layer.style.removeProperty("--kb");
    else layer.style.setProperty("--kb", `${px}px`);
  };
  /** The page (or sheet) takes the keyboard's room in one frame and the slide ends where that puts the block. */
  const landPage = () => {
    window.clearTimeout(riseTimer);
    if (!pageSlide) return;
    const { block, field, layer } = pageSlide;
    pageSlide = null;
    block.style.transition = "";
    clearShift(block);
    block.removeAttribute("data-kb-rising");
    pageLaid = { block, field, layer };
  };
  /** A sheet whose room waits for the keyboard to arrive (see keyboardWillShow). */
  let deferredLayer: { layer: HTMLElement; h: number } | null = null;
  /** Sheets that took their room at once, to give it back at once. */
  const snapLayers = new Set<HTMLElement>();
  /** The focused field ends above where the keyboard will reach. */
  const fieldClearOf = (h: number) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return false;
    return el.getBoundingClientRect().bottom + 24 <= window.innerHeight - h;
  };
  /** Height the layout currently makes room for (0 when closed). */
  let laid = 0;
  /** A rise being carried by the slide, waiting for the swap. */
  let rising = 0;
  let riseTimer = 0;
  let fallTimer = 0;
  /** The room is being (or has been) given back, until the keyboard shows again. */
  let closing = false;
  let undoTimer = 0;
  /** The keyboard's height when it was last up. */
  let lastHeight = 0;
  const editable = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
  const composerFocusedIn = (el: EventTarget | null) => el instanceof Element && !!el.closest(".ws-composer-dock");
  /** A fall carried by #root's height, waiting for --kb to follow. */
  let falling = false;
  const rootEl = document.getElementById("root");
  /** --kb catches up with a finished fall, in one frame that moves nothing. */
  const settleFall = () => {
    window.clearTimeout(fallTimer);
    if (!falling) return;
    falling = false;
    swap(() => {
      setKb(0);
      rootEl?.style.removeProperty("height");
      slide(0, false);
    });
    clearSlide();
  };

  const land = () => {
    window.clearTimeout(riseTimer);
    if (!rising) return;
    const h = rising;
    rising = 0;
    setRising(false);
    swap(() => {
      setKb(h);
      slide(0, false);
    });
    keepAtEnd();
    // …and again once the chat has laid out at its new height (the newest
    // turn's hold follows a frame later, ChatPanel).
    requestAnimationFrame(keepAtEnd);
    raisedBy = new Map(transcripts().map((t) => [t, Math.max(0, t.scrollTop - (riseScroll.get(t) ?? t.scrollTop))]));
    clearSlide();
    laid = h;
  };

  // The backing under the composer (index.css) takes the colour the chat is
  // painted in, set as the composer is touched — before the keyboard moves.
  document.addEventListener(
    "touchstart",
    (e) => {
      const dock = (e.target as Element | null)?.closest?.<HTMLElement>(".ws-composer-dock");
      if (dock && !dock.style.getPropertyValue("--kb-cover")) dock.style.setProperty("--kb-cover", backdropOf(dock));
    },
    { capture: true, passive: true },
  );
  // What belongs to a field can appear as it is typed into — sign-up's
  // password strength hint shows from the first letter — and then sat under
  // the keyboard. With the keyboard up, the field is checked again after each
  // change. Not in the chat, whose composer and transcript keep their own place.
  let recheck = 0;
  document.addEventListener(
    "input",
    () => {
      if (!root.classList.contains("kb-open") || composerFocused()) return;
      cancelAnimationFrame(recheck);
      recheck = requestAnimationFrame(() => requestAnimationFrame(revealFocused));
    },
    { capture: true, passive: true },
  );
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
      const h = Math.round(keyboardHeight);
      root.classList.add("kb-open");
      closing = false;
      window.clearTimeout(undoTimer);
      // Back before a fall settled: settle it first, from a consistent page.
      settleFall();
      window.clearTimeout(fallTimer);
      // A page with a block marked to move with the keyboard (home's hero):
      // the block slides there, and the page takes the room once it is up.
      // A sheet slides the same way, as a whole (its layer): shrunk with the
      // keyboard frame by frame it laid its list out every frame, and taking
      // the room in one go after the keyboard made the sheet jump up.
      const sheet = !laid && !composerFocused() ? layerOf(document.activeElement) : null;
      // Editing a message: the chat's own composer rides up with the keyboard
      // (left to the layout, it sat under the keyboard and popped up after).
      const editDock =
        !laid && !sheet && document.activeElement?.closest(".ws-transcript")
          ? document.querySelector<HTMLElement>(".ws-composer-dock")
          : null;
      const block = !laid ? (slideBlockOf(document.activeElement) ?? sheet ?? editDock) : null;
      if (block) {
        mode = "layout";
        kbLayer = sheet;
        // The field's move, not the block's: the block is the hero's box and
        // its content re-centres inside it; a sheet changes height too.
        // The room is taken now, in one layout, and the block is held where it
        // was and brought up with the keyboard (laid out once: measuring first
        // and taking the room after the keyboard made two more, 400ms+ in a
        // sheet's first frame).
        const field = editDock ?? (document.activeElement as HTMLElement);
        const from = field.getBoundingClientRect().top;
        let to = from;
        // swap: the chat's held turn (--turn-fill) follows in the same frame
        // and its scroll stays where it was on screen.
        swap(() => {
          kbOn(sheet, h);
          to = field.getBoundingClientRect().top;
          block.style.transition = "none";
          shiftY(block, from - to);
        });
        void block.offsetHeight;
        // Editing low in the chat: the message being edited comes up above the
        // composer in the same motion — scrolled there now, held where it
        // was, and slid up with the keyboard (scrolled into view after, it was
        // a second movement once the keyboard had stopped).
        if (editDock) {
          const t = document.activeElement?.closest<HTMLElement>(".ws-transcript");
          const box = (document.activeElement?.closest<HTMLElement>("[data-edit-composer]") ?? document.activeElement) as HTMLElement | null;
          if (t && box) {
            const need = box.getBoundingClientRect().bottom - (to - 12);
            const before = t.scrollTop;
            if (need > 0) t.scrollTop = before + need;
            const moved = t.scrollTop - before;
            if (moved > 0) {
              t.style.transition = "none";
              shiftY(t, moved);
              void t.offsetHeight;
              t.style.transition = SHIFT;
              shiftY(t, 0);
              window.setTimeout(() => {
                t.style.transition = "";
                clearShift(t);
              }, 300);
            }
          }
        }
        block.setAttribute("data-kb-rising", "");
        block.style.transition = SHIFT;
        shiftY(block, 0);
        pageSlide = { block, field, h, layer: sheet };
        laid = h;
        riseTimer = window.setTimeout(landPage, 450);
        return;
      }
      if (!composerFocused() || laid > 0) {
        // Anywhere else (and a size change while open, e.g. the suggestion
        // bar) the layout animates itself, as before.
        if (!laid) {
          mode = "layout";
          kbLayer = layerOf(document.activeElement);
          // A chat at its end stays at its end while the layout shrinks it,
          // frame by frame — this path, too, opened the keyboard over the
          // reply with the ↓ showing.
          // Not for a field inside the chat (a message being edited): held at
          // the end, the chat scrolled the edit box up under the header.
          if (!kbLayer && !document.activeElement?.closest(".ws-transcript")) {
            snapToEnd();
            const until = performance.now() + 450;
            const follow = () => {
              keepAtEnd();
              if (performance.now() < until) requestAnimationFrame(follow);
            };
            requestAnimationFrame(follow);
          }
        }
        clearSlide();
        // A field in a sheet that the keyboard won't cover (Connectors'
        // search, at the top): the sheet makes its room once the keyboard has
        // arrived, all at once and out of sight under it. Shrunk with the
        // keyboard, frame by frame, it laid out its whole list every frame —
        // Connectors' first frame took 225ms (measured in the simulator).
        // The same for a page (sign-in's fields, near the top): --kb on the
        // page's root restyled every element on every frame.
        if (!laid && !kbLayer && fieldClearOf(h)) {
          deferredLayer = { layer: root, h };
          laid = h;
          return;
        }
        setKbFor(kbLayer, h);
        laid = h;
        return;
      }
      mode = "slide";
      // Within reach of the end is the end: a chat left a few pixels short
      // (a send closing the keyboard rests it 22px up) read as scrolled up,
      // stayed where it was, and the keyboard covered the reply with the ↓
      // showing (reproduced in the simulator: 495 of 517).
      snapToEnd();
      riseScroll = new Map(transcripts().map((t) => [t, t.scrollTop]));
      raisedBy = new Map();
      measureGiveBack();
      rising = h;
      // iOS draws the caret itself, from where the composer will be laid out,
      // not where the slide has it: it rode up ~25pt low, on the + and Build
      // row, then jumped to the text as the swap landed (recorded per frame in
      // the simulator). Hidden while the composer slides; shown once it lands.
      setRising(true); // the fade over the composer (index.css)
      // Timed from now, as a Web Animation, like the fall. As a CSS transition
      // it ran only the first time: once the fall had moved the composer with
      // a Web Animation, WebKit never started the transition again, and every
      // later open put the composer at the top of its rise in the first frame
      // (logged in the simulator: 742→428 over 300ms the first time, 428 from
      // the first frame every time after).
      slide(Math.max(0, h - giveBack), true, "rise", undefined, performance.now());
      // keyboardDidShow normally lands it; this is the backstop.
      riseTimer = window.setTimeout(land, 450);
    });
    // iOS scrolled the focused field into view only because the web view
    // shrank; it no longer does. Once the layout has made room, bring the
    // field into view inside whatever scrolls around it — a sheet, a settings
    // page. A field near the bottom of a tall sheet was left under the keyboard
    // (measured in the simulator: the delete-account box at 673px with the
    // visible area ending at 538px).
    await Keyboard.addListener("keyboardDidShow", () => {
      landPage();
      if (deferredLayer) {
        const { layer, h } = deferredLayer;
        deferredLayer = null;
        if (layer === root) {
          root.classList.add("kb-snap");
          setKb(h);
          void root.offsetHeight;
          root.classList.remove("kb-snap");
        } else {
          layer.style.setProperty("transition", "none");
          layer.style.setProperty("--kb", `${h}px`);
          void layer.offsetHeight;
          layer.style.removeProperty("transition");
        }
        snapLayers.add(layer);
      }
      land();
      revealFocused();
    });
    const close = () => {
      if (closing) return;
      const startedAt = performance.now();
      closing = true;
      endAtRise = new Set();
      root.classList.remove("kb-open");
      removeKbRoom();
      setRising(false);
      window.clearTimeout(riseTimer);
      const wasLaid = laid;
      const h = laid || rising;
      lastHeight = h || lastHeight;
      rising = 0;
      laid = 0;
      if (pageSlide || pageLaid) {
        const { block, field, layer } = pageSlide ?? pageLaid!;
        window.clearTimeout(riseTimer);
        pageSlide = null;
        pageLaid = null;
        kbLayer = null;
        block.removeAttribute("data-kb-rising");
        // The room back at once (what it uncovers is under the keyboard still),
        // the block held where it was, then brought down with the keyboard.
        // Measured on the field, as on the way up.
        const from = field.getBoundingClientRect().top;
        // swap: given back with the chat's held turn (--turn-fill) in the same
        // frame — a frame later, the chat grew a keyboard taller under a
        // scroll clamped to the shorter one, and editing a message then
        // tapping away left it a keyboard short of its end, the ↓ showing.
        swap(() => {
          block.style.transition = "none";
          clearShift(block);
          kbOn(layer, layer ? null : 0);
          const to = field.getBoundingClientRect().top;
          shiftY(block, from - to);
        });
        void block.offsetHeight;
        block.style.transition = SHIFT;
        shiftY(block, 0);
        window.setTimeout(() => {
          block.style.transition = "";
          clearShift(block);
        }, 300);
        return;
      }
      if (mode !== "slide" || transcripts().length === 0) {
        clearSlide();
        const layer = kbLayer;
        kbLayer = null;
        // A page that took its room at once gives it back at once.
        if (!layer && (deferredLayer?.layer === root || snapLayers.has(root))) {
          deferredLayer = null;
          snapLayers.delete(root);
          root.classList.add("kb-snap");
          setKb(0);
          void root.offsetHeight;
          root.classList.remove("kb-snap");
          return;
        }
        // A sheet that took its room at once gives it back at once: what it
        // uncovers is still under the keyboard as it starts down.
        if (layer && (deferredLayer?.layer === layer || snapLayers.has(layer))) {
          deferredLayer = null;
          snapLayers.delete(layer);
          layer.style.setProperty("transition", "none");
          layer.style.removeProperty("--kb");
          void layer.offsetHeight;
          layer.style.removeProperty("transition");
          return;
        }
        setKbFor(layer, 0);
        // Once it has animated to 0, the layer reads the page's --kb again.
        if (layer) window.setTimeout(() => layer.style.removeProperty("--kb"), 320);
        return;
      }
      if (!wasLaid) {
        // Hidden before it landed: the layout never took the room; slide back.
        slide(0, true);
        fallTimer = window.setTimeout(clearSlide, 400);
        return;
      }
      // Give the room back at once, held up where the keyboard still is, then
      // slide down with it — the room as #root's own height, not --kb. --kb is
      // a custom property on the page's root, and changing one restyled every
      // element of the chat: ~45ms of a 50ms first frame (measured), so the
      // composer sat still while the keyboard fell from under it, then jumped
      // 151px. #root's height restyles #root. --kb follows once the keyboard
      // has gone and nothing is moving (settleFall); until then the composer
      // keeps its keyboard-up bottom padding, so the slide ends `giveBack`
      // short of 0, which is where that padding change puts it.
      const emptyBefore = new Map(
        transcripts().flatMap((t) => {
          const first = emptyFirst(t);
          return first ? [[t, first.getBoundingClientRect().top] as const] : [];
        }),
      );
      fallScroll = new Map(transcripts().map((t) => [t, t.scrollTop]));
      swap(() => {
        rootEl?.style.setProperty("height", "100%");
        // The transcript grows by the keyboard's room; the turn held a screen
        // tall grows with it now, before anything reads the layout — a layout
        // with the old hold clamped the scroll short of the end.
        for (const t of transcripts()) {
          const fill = Number.parseFloat(t.style.getPropertyValue("--turn-fill"));
          if (fill) t.style.setProperty("--turn-fill", `${fill + h}px`);
        }
        const hold = new Map<HTMLElement, number>();
        for (const [t, top] of emptyBefore) {
          const first = emptyFirst(t);
          if (first) hold.set(t, Math.max(0, first.getBoundingClientRect().top - top));
        }
        slide(h, false, "fall", hold);
      });
      // The swap has already worked out the held style, so the slide starts
      // from it in this same frame rather than waiting a frame for it.
      slide(
        giveBack,
        true,
        "fall",
        new Map(transcripts().flatMap((t) => (undoingRise.get(t) ? [[t, 0] as const] : []))),
        startedAt,
      );
      falling = true;
      fallTimer = window.setTimeout(settleFall, 320);
    };
    await Keyboard.addListener("keyboardWillHide", () => {
      window.clearTimeout(undoTimer);
      close();
    });
    // The keyboard starts down the moment the composer loses focus; iOS's
    // event saying so reached the page ~20ms later (measured), and the
    // composer, waiting for it, sat still while the keyboard fell from under
    // it. Its own focusout is the earlier signal.
    document.addEventListener("focusout", (e) => {
      if (mode !== "slide" || !(laid || rising) || !composerFocusedIn(e.target) || editable(e.relatedTarget)) return;
      close();
      // Focus that comes straight back never hides the keyboard, and no event
      // would say so: if it has not said it is going, give it its room back.
      window.clearTimeout(undoTimer);
      undoTimer = window.setTimeout(() => {
        if (!editable(document.activeElement)) return;
        settleFall();
        closing = false;
        mode = "layout";
        root.classList.add("kb-open");
        clearSlide();
        setKb(lastHeight);
        laid = lastHeight;
      }, 500);
    });
  } catch {
    // An older shell without the plugin keeps the page as it was.
  }
}

/** The focused field, scrolled just into view above the keyboard if it is hidden. */
function revealFocused(): void {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return;
  // The chat's composer is placed by the slide and the swap above, a set
  // distance over the keyboard; nothing here may move it again.
  if (el.closest(".ws-composer-dock")) return;
  // The field's own --kb: its sheet's, when the keyboard's room is the sheet's.
  const kb = Number.parseFloat(getComputedStyle(el).getPropertyValue("--kb")) || 0;
  // A message being edited is shown whole, its buttons with it.
  const r = (el.closest<HTMLElement>("[data-edit-composer]") ?? withItsButtons(el, window.innerHeight - kb)).getBoundingClientRect();
  // The room it keeps under it, as scrollIntoView will (index.css).
  // In the chat the composer sits over the transcript's bottom: a message
  // being edited there was "in view" under it, the composer covering the
  // field it was typing into (measured in the simulator: the field at
  // 365–387, the composer 370–546).
  const dock = el.closest(".ws-transcript") ? document.querySelector<HTMLElement>(".ws-composer-dock") : null;
  const visibleBottom = dock ? Math.min(window.innerHeight - kb, dock.getBoundingClientRect().top) : window.innerHeight - kb;
  const bottom = visibleBottom - (Number.parseFloat(getComputedStyle(el).scrollMarginBottom) || 12);
  if (r.bottom <= bottom && r.top >= 0) return;
  if (dock) {
    // scrollIntoView knows nothing of the composer: scroll the transcript by
    // what it hides.
    el.closest<HTMLElement>(".ws-transcript")?.scrollBy({ top: r.bottom - bottom, behavior: "smooth" });
    return;
  }
  // scrollIntoView knows nothing of the keyboard either: the web view is not
  // resized, so to it the whole screen is visible. On an iPhone SE the sign-in
  // email field sat at 403–435 of 667 — "in view" — under a 260pt keyboard,
  // and nothing moved. Scroll whatever scrolls around the field by what the
  // keyboard (or its scroller's own edge, in a sheet) hides.
  const scroller = scrollerOf(el);
  const edge = scroller ? Math.min(bottom, scroller.getBoundingClientRect().bottom - 12) : bottom;
  const by = r.top < 0 ? r.top - 12 : r.bottom - edge;
  if (by === 0) return;
  const target = scroller ?? document.scrollingElement ?? document.documentElement;
  // The page itself can scroll only by what it overflows — sign-in on an
  // iPhone SE by 92px, under a 260pt keyboard — so the password field stayed
  // covered however far it went. A marker at the depth the scroll needs gives
  // it that room while the keyboard is up (removed as it closes). Only the page
  // gets one: a scroller inside a sheet already ends above the keyboard.
  if (!scroller && by > 0) {
    const need = target.scrollTop + by + target.clientHeight;
    if (need > target.scrollHeight) {
      let room = document.getElementById(KB_ROOM);
      if (!room) {
        room = document.createElement("div");
        room.id = KB_ROOM;
        room.setAttribute("aria-hidden", "true");
        room.style.cssText = "position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden";
        document.body.appendChild(room);
      }
      room.style.top = `${need - 1}px`;
    }
  }
  target.scrollBy({ top: by, behavior: "smooth" });
}

const KB_ROOM = "kb-room";
/** Takes back the room revealFocused added under the page for the keyboard. */
function removeKbRoom(): void {
  document.getElementById(KB_ROOM)?.remove();
}

/**
 * The field with what belongs to it — its label, the hint under it, its own
 * Save / Cancel — so they come up above the keyboard together. On an iPhone SE
 * Account settings' name editor came up with its buttons left under the
 * keyboard, sign-up's password with its strength hint under it, and on a small
 * Android phone home's prompt with its + / Build row (six levels up from the
 * text). The largest box within six levels that stays under 40% of the room
 * above the keyboard: a whole form (sign-in) is never one.
 */
function withItsButtons(el: HTMLElement, room: number): HTMLElement {
  let box = el;
  let e: HTMLElement | null = el.parentElement;
  for (let i = 0; e && e !== document.body && i < 6; i++, e = e.parentElement) {
    if (e.getBoundingClientRect().height > room * 0.4) break;
    box = e;
  }
  return box;
}

/**
 * Android resizes the window for the keyboard and Chrome scrolls the focused
 * field in — but only as far as its caret: on a 360×640dp phone sign-in's
 * password box ended at 348 of a 341px view, its bottom under the keyboard,
 * and what belongs to a field (a hint, its buttons) stayed there too. Once the
 * view has shrunk, and as a field's box grows while it is typed into, the box
 * is brought wholly into view with the same room under it as on iOS.
 */
function initAndroidReveal(): void {
  let frame = 0;
  const check = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !el.matches("input, textarea, [contenteditable='true']")) return;
      if (el.closest(".ws-composer-dock")) return;
      const view = window.visualViewport?.height ?? window.innerHeight;
      const box = withItsButtons(el, view);
      const r = box.getBoundingClientRect();
      const bottom = view - 24;
      if (r.bottom <= bottom && r.top >= 0) return;
      const scroller = scrollerOf(el);
      const edge = scroller ? Math.min(bottom, scroller.getBoundingClientRect().bottom - 12) : bottom;
      const by = r.top < 0 ? r.top - 12 : r.bottom - edge;
      if (by !== 0) (scroller ?? document.scrollingElement ?? document.documentElement).scrollBy({ top: by, behavior: "smooth" });
    });
  };
  // The keyboard's resize arrives after the focus; Chrome's own scroll after that.
  window.visualViewport?.addEventListener("resize", () => window.setTimeout(check, 50));
  document.addEventListener("input", check, { capture: true, passive: true });
  // From one field to the next with the keyboard already up: no resize comes.
  document.addEventListener("focusin", () => window.setTimeout(check, 300), { capture: true, passive: true });
}

/** The nearest ancestor that scrolls vertically, or null for the page itself. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight) return e;
  }
  return null;
}

/**
 * Takes the focus from a field, which hides the keyboard if one is up — for
 * leaving the chat (the drawer, the preview) with the composer focused, where
 * the keyboard otherwise stayed up over the next screen.
 */
export function dismissKeyboard(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"))) el.blur();
}

/** The first solid background behind an element: the colour its page is painted in. */
function backdropOf(el: HTMLElement): string {
  for (let e: HTMLElement | null = el.parentElement; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
  }
  return getComputedStyle(document.body).backgroundColor;
}
