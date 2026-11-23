import { useEffect, useState } from "react";
import { BellPlus } from "lucide-react";
import { type ShelfNotice } from "./chat/ComposerShelf";
import { enableWebPush, webPushPermission } from "../lib/web-push";
import { recordDismissal, shouldOfferNotifications } from "../lib/notify-prompt";
import { useToast } from "./ui";
import { useT } from "../i18n/app";

/**
 * "Get notified when it's done" — the composer shelf's notice (ComposerShelf).
 *
 * Shown once something has been asked for, not before. On an empty chat it is
 * an offer about nothing — there is no build to be told about yet, and a
 * switch sitting above an empty composer is just another thing in the way.
 * The moment a turn starts it is the most useful thing on the screen, so that
 * is when it appears, and it stays until it is taken or dismissed.
 *
 * What it must not do is *ask* on its own: Chrome puts a site that calls
 * `requestPermission` on load into the quiet UI, where the prompt stops
 * appearing at all. So the browser is only asked from the click, and whether
 * the strip may appear again after a dismissal is notify-prompt.ts, which has
 * the rules and the tests.
 */
export function useNotifyNotice(running: boolean): ShelfNotice | null {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  /**
   * Latched, not mirrored: a turn ends, and a strip that vanished with it
   * would take the offer away exactly when the answer arrives. Once asked for,
   * it stays.
   */
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (running) setAsked(true);
  }, [running]);

  const eligible = shouldOfferNotifications(
    webPushPermission(),
    typeof localStorage === "undefined" ? { getItem: () => null, setItem: () => {} } : localStorage,
  );

  if (!eligible || !asked || gone) return null;

  const dismiss = () => {
    recordDismissal(localStorage);
    setGone(true);
  };

  const ask = async () => {
    setBusy(true);
    try {
      if (await enableWebPush()) {
        toast("success", t.shell.notify.enabled);
        setGone(true);
        return;
      }
      // Three different things land here — they said no, they closed the
      // prompt without answering, or the browser never showed one. Only the
      // first is distinguishable, and the response to all three is the same:
      // stop asking in this spot.
      dismiss();
      toast(
        "error",
        webPushPermission() === "denied"
          ? t.shell.notify.blocked
          : t.shell.notify.failed,
      );
    } finally {
      setBusy(false);
    }
  };

  return {
    key: "notify",
    testId: "notify-shelf",
    icon: <BellPlus className="size-4" />,
    title: t.shell.notify.title,
    action: { label: busy ? t.shell.notify.asking : t.common.enable, onClick: () => void ask(), disabled: busy },
    onDismiss: dismiss,
  };
}
