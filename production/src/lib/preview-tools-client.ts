import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Talking to `public/preview-tools.js` inside the app preview: hand it the code
 * (the preview bridge runs it only for a Mythex workspace), ask it questions,
 * and hear what it reports (an element picked, select mode ended).
 *
 * The code goes in the message rather than as a URL: a preview on a public
 * address may not load scripts from a private one (a local workspace).
 */

type Msg = Record<string, unknown> & { type: string };

/** Something from the preview for the composer: an annotated picture, or a picked element. */
export const COMPOSER_ATTACH_EVENT = "mythex:composer-attach";
export type ComposerAttachDetail = {
  file: File;
  /** For the agent only, never the bubble: the picked element's details. */
  context?: string;
  /** A picked element: shown as a chip with this label, like `<Hero /> Order now`. */
  elementLabel?: string;
};

/** The code run in the preview: the screenshot library, then our tools. Fetched once. */
let toolsCode: Promise<string | null> | null = null;
function previewToolsCode(): Promise<string | null> {
  toolsCode ??= Promise.all(
    ["/vendor/modern-screenshot.js", "/preview-tools.js"].map((p) =>
      fetch(p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p)))),
    ),
  ).then(
    (parts) => parts.join("\n;\n"),
    () => {
      toolsCode = null;
      return null;
    },
  );
  return toolsCode;
}

export type PreviewTools = {
  /** Load the tools into the page shown now; false when this preview cannot run them. */
  ensure: () => Promise<boolean>;
  /** Send a message and wait for its `:res` reply (null on timeout). */
  ask: (msg: Msg, timeoutMs?: number) => Promise<Record<string, unknown> | null>;
  post: (msg: Msg) => void;
  /** Hear messages the tools send on their own. Returns the unsubscribe. */
  on: (type: string, fn: (data: Record<string, unknown>) => void) => () => void;
};

export function usePreviewTools(iframeRef: RefObject<HTMLIFrameElement | null>, previewUrl: string | null): PreviewTools {
  const origin = (() => {
    try {
      return previewUrl ? new URL(previewUrl).origin : "";
    } catch {
      return "";
    }
  })();
  const pending = useRef(new Map<string, (d: Record<string, unknown>) => void>());
  const listeners = useRef(new Map<string, Set<(d: Record<string, unknown>) => void>>());

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!origin || e.origin !== origin || e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { type?: string; id?: string };
      if (!d || typeof d.type !== "string" || !d.type.startsWith("mythex:tools:")) return;
      if (d.id && pending.current.has(d.id)) {
        pending.current.get(d.id)!(d as Record<string, unknown>);
        pending.current.delete(d.id);
        return;
      }
      listeners.current.get(d.type)?.forEach((fn) => fn(d as Record<string, unknown>));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef, origin]);

  const post = useCallback(
    (msg: Msg) => {
      if (origin) iframeRef.current?.contentWindow?.postMessage(msg, origin);
    },
    [iframeRef, origin],
  );

  const on = useCallback((type: string, fn: (d: Record<string, unknown>) => void) => {
    const set = listeners.current.get(type) ?? new Set();
    set.add(fn);
    listeners.current.set(type, set);
    return () => set.delete(fn);
  }, []);

  const ensure = useCallback(async () => {
    const code = await previewToolsCode();
    const win = iframeRef.current?.contentWindow;
    if (!code || !win || !origin) return false;
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        offReady();
        offError();
        window.clearTimeout(timer);
        resolve(ok);
      };
      const offReady = on("mythex:tools:ready", () => finish(true));
      const offError = on("mythex:tools:error", () => finish(false));
      // An app without the preview bridge never answers.
      const timer = window.setTimeout(() => finish(false), 4000);
      win.postMessage({ type: "mythex:tools:load", code }, origin);
    });
  }, [iframeRef, on, origin]);

  const ask = useCallback(
    (msg: Msg, timeoutMs = 4000) =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const win = iframeRef.current?.contentWindow;
        if (!win || !origin) return resolve(null);
        const id = Math.random().toString(36).slice(2, 10);
        const timer = window.setTimeout(() => {
          pending.current.delete(id);
          resolve(null);
        }, timeoutMs);
        pending.current.set(id, (d) => {
          window.clearTimeout(timer);
          resolve(d);
        });
        win.postMessage({ ...msg, id }, origin);
      }),
    [iframeRef, origin],
  );

  return { ensure, ask, post, on };
}

/**
 * A data: URL as a File for the composer. Decoded here, not fetched: the app's
 * CSP (connect-src 'self' https: wss:) blocks fetch() of a data: URL on staging
 * and prod, so a picked element's picture never became a file there — the pick
 * closed the mode and nothing reached the chat. Local dev has no CSP.
 */
export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(5, comma); // after "data:"
  const type = head.split(";")[0] || "image/png";
  const body = dataUrl.slice(comma + 1);
  let bytes: Uint8Array<ArrayBuffer>;
  if (/;base64$/i.test(head)) {
    const bin = atob(body);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(new TextEncoder().encode(decodeURIComponent(body)));
  }
  return new File([bytes], name, { type });
}
