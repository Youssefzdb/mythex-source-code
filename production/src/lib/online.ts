import { useEffect, useState } from "react";

/**
 * Whether the browser thinks it has a network.
 *
 * The app already listened for the `online` event to resume a dropped turn, but
 * nothing ever read the state, so an outage and a slow model looked the same on
 * screen: "Connecting…", shimmering, for as long as it took. The recovery was
 * working the whole time and had no way of saying so.
 *
 * `navigator.onLine` is only ever trustworthy in one direction — false means
 * there is definitely no connection, true means there is an interface up and
 * says nothing about whether anything is reachable. That is enough for what it
 * is used for here: turning a silent wait into an explained one, never gating
 * a request. Requests are still made and still fail on their own terms.
 */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Re-renders on the browser's own online/offline transitions. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => !isOffline());
  useEffect(() => {
    const update = () => setOnline(!isOffline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // The events can fire between first render and this effect attaching.
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
