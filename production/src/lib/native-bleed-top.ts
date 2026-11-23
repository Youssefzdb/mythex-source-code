import { useLayoutEffect } from "react";
import { isNative } from "./native";

/**
 * Let this screen paint its own background under the status bar.
 *
 * By default the shells inset the page by padding <body>, which is safe for
 * every screen at once — nothing can end up under the clock. The cost is that
 * the strip above the content is <body>'s background, and a screen whose own
 * surface is a different shade shows a seam across the top. Measured on the
 * simulator: body rgb(28,28,28) against a panel of oklch(0.2474 0.002 107),
 * with the join landing exactly on the inset.
 *
 * A screen that calls this takes the inset on itself instead — its surface
 * then runs edge to edge and the strip is the same colour as the content below
 * it. The element that should hold the padding gets `native-inset-top`; see
 * index.css. Screens that do not call this keep the body padding, so this can
 * be adopted one screen at a time without stranding the rest.
 */
/**
 * Counted, not toggled: two screens can hold it at once — a loading skeleton
 * and the screen replacing it — and the one leaving last used to take the
 * class off from under the one that stays, insetting it twice (the chat's
 * header dropped a status bar's height).
 */
let holders = 0;

export function useNativeBleedTop(): void {
  // Before paint, not after: with useEffect the screen's first frames were
  // drawn with <body> still inset as well — measured on a cold launch, home's
  // skeleton sat 62px low (a status bar) for ~300ms, then jumped up.
  useLayoutEffect(() => {
    if (!isNative()) return;
    const root = document.documentElement;
    holders += 1;
    root.classList.add("native-bleed-top");
    return () => {
      holders -= 1;
      if (holders === 0) root.classList.remove("native-bleed-top");
    };
  }, []);
}
