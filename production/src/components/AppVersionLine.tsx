import { useEffect, useState } from "react";
import { versionLine, webVersion, gitSha } from "../lib/app-version";

/**
 * The versions running, at the foot of Settings: "iOS 1.0.1 (7) · Web
 * 2026.1016.512 (abc1234)" in the app, "Web …" on the site. Selectable, so it
 * can be pasted into a support message.
 */
export function AppVersionLine() {
  const [line, setLine] = useState(() => `Web ${webVersion}${gitSha ? ` (${gitSha})` : ""}`);
  useEffect(() => {
    let live = true;
    void versionLine().then((l) => live && setLine(l));
    return () => {
      live = false;
    };
  }, []);
  return (
    <p className="mt-10 select-text text-center text-xs text-white/30" dir="ltr" data-testid="app-version">
      Mythex {line}
    </p>
  );
}
