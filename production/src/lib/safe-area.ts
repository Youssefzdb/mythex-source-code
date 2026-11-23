import { nativePlatform } from "./native";

/**
 * The four insets, for a platform whose web view will not supply them.
 *
 * iOS fills `env(safe-area-inset-*)` in itself and index.css reads it straight
 * off, so nothing here runs there. Android's web view leaves all four at `0px`
 * whatever the device looks like — measured on the emulator with the status bar
 * sitting on top of the workspace header — so the numbers come from the
 * platform through the SafeArea plugin instead, onto the same four custom
 * properties. See SafeArea.java for what is being read and why.
 *
 * Native pushes an update on every inset change: rotation, a change of
 * navigation mode, the keyboard. This is only the first one, because a cold
 * start dispatches insets before there is a document to set them on.
 */
export async function initSafeArea(): Promise<void> {
  if (nativePlatform() !== "android") return;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{
      get(): Promise<{ top: number; right: number; bottom: number; left: number }>;
    }>("SafeArea");
    const insets = await plugin.get();
    const style = document.documentElement.style;
    style.setProperty("--safe-top", `${insets.top}px`);
    style.setProperty("--safe-right", `${insets.right}px`);
    style.setProperty("--safe-bottom", `${insets.bottom}px`);
    style.setProperty("--safe-left", `${insets.left}px`);
    // Full-screen layers (the drawer, sheets) work their own --safe-bottom out
    // from --safe-bottom-raw, which on Android must be the platform's value
    // too — env() is 0 there, and the drawer's footer sat on the system
    // buttons. Native updates --safe-bottom on every inset change (a switch
    // to three-button navigation, rotation); this follows it.
    const mirror = () => {
      const bottom = style.getPropertyValue("--safe-bottom");
      if (bottom && style.getPropertyValue("--safe-bottom-raw") !== bottom) style.setProperty("--safe-bottom-raw", bottom);
    };
    mirror();
    new MutationObserver(mirror).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  } catch {
    // An older shell without the plugin keeps the env() values, which on
    // Android means no inset at all — wrong, but not broken.
  }
}
