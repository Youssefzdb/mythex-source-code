import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { orch, type OrchClient } from "../lib/orchestrator";
import { appT } from "../i18n/app";

const encoder = new TextEncoder();

/**
 * Thin xterm ↔ sandbox PTY bridge.
 * Keys go to the PTY; the screen only shows PTY output. No local-echo
 * prediction — that caused backspace/erase bugs. Input latency is handled
 * by StreamInput on the orchestrator.
 */
export function TerminalPane({ client }: { client: OrchClient }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "SF Mono, Menlo, monospace",
      theme: { background: "#0a0a0b", foreground: "#e4e4e7", cursor: "#fb7185" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const decoder = new TextDecoder();
    const socket = new WebSocket(orch.terminalUrl(client), orch.terminalProtocols(client));
    socket.binaryType = "arraybuffer";

    const sendResize = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    socket.onopen = () => sendResize();
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as { type?: string; message?: string };
          if (msg.type === "error" && msg.message) {
            term.writeln(`\r\n\x1b[90m[${msg.message}]\x1b[0m`);
            return;
          }
        } catch {
          // fall through — treat as terminal text
        }
        term.write(event.data);
        return;
      }
      term.write(decoder.decode(new Uint8Array(event.data as ArrayBuffer), { stream: true }));
    };
    socket.onclose = () => {
      term.writeln(`\r\n\x1b[90m[${appT().workspace.terminal.disconnected}]\x1b[0m`);
    };

    const dataSub = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(encoder.encode(data));
    });

    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fit.fit();
        } catch {
          return;
        }
        sendResize();
      }, 50);
    });
    resizeObserver.observe(el);

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      dataSub.dispose();
      resizeObserver.disconnect();
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      term.dispose();
    };
  }, [client]);

  return <div ref={containerRef} dir="ltr" className="h-full w-full bg-panel p-1" />;
}
