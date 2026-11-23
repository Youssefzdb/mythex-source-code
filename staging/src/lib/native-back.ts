import { useEffect, useRef } from "react";

/**
 * What Android's back (the button, or the swipe in from the edge) closes.
 *
 * It used to go straight to history: with the side menu or a sheet open it
 * left the screen underneath, and on the first screen it closed the app —
 * measured on the emulator, a back swipe with the menu open put you on the
 * home screen. Anything that opens over the page registers here while it is
 * open, and back closes the most recent of them first (see native-shell.ts),
 * as every native app does.
 */
type Handler = { close: () => void };
const stack: Handler[] = [];

/**
 * The most recently opened layer's close, or false when nothing is open.
 * Each handler decides for itself what closing means — a sheet that must not
 * be walked away from mid-save takes the back and stays open.
 */
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** While `open`, back closes this layer (and nothing behind it). */
export function useBackCloses(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const handler: Handler = { close: () => closeRef.current() };
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
