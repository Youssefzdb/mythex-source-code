import { useEffect } from "react";
import { fill, useT } from "../i18n/app";
import { openStore, useForceUpdate } from "../lib/force-update";
import { FG, FG_TERTIARY, PANEL_BG } from "../lib/surfaces";
import { MythexMark } from "./mythex-mark";

/**
 * "Update required": the whole app, covered, when this store version is older
 * than the minimum set in the admin console (lib/force-update.ts). One way on:
 * the store page. Nothing behind it can be reached — not by a tap, not by
 * Android's back — until the updated app is opened.
 */
export function ForceUpdateScreen() {
  const need = useForceUpdate();
  const t = useT();
  // The keyboard of a field it covered would stay up over it.
  useEffect(() => {
    if (need && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [need]);
  if (!need) return null;
  const s = t.shell.forceUpdate;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="force-update-title"
      className="fixed inset-0 z-[2147483000] flex flex-col items-center justify-center px-6 text-center"
      style={{
        background: PANEL_BG,
        color: FG,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex w-full max-w-[22rem] flex-col items-center">
        <MythexMark size={64} className="rounded-[16px]" />
        <h1 id="force-update-title" className="mt-6 text-[22px] font-semibold tracking-tight text-balance">
          {s.title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-balance" style={{ color: FG_TERTIARY }}>
          {s.body}
        </p>
        <button type="button" className="btn-primary mt-8 h-11 w-full text-[15px]" onClick={() => openStore(need.platform)}>
          {need.platform === "ios" ? s.appStore : s.googlePlay}
        </button>
        <p className="mt-4 text-xs tabular-nums" style={{ color: FG_TERTIARY }}>
          {fill(s.version, { current: need.current, min: need.minVersion })}
        </p>
      </div>
    </div>
  );
}
