// Intercom messenger (VITE_INTERCOM_APP_ID).
//
// Workspace currently has Messenger Security Off → boot as visitor only.
// Shutdown without removing the widget script leaves a zombie Intercom where
// show() is a no-op (no iframes). Always hard-destroy before re-boot.

const APP_ID = import.meta.env.VITE_INTERCOM_APP_ID as string | undefined;

let loaded = false;
/** Hide the floating bubble on project builder routes (`/p/:id`) — less noise while building. */
let launcherHidden = typeof window !== "undefined" && /^\/p\//.test(window.location.pathname);

/* eslint-disable @typescript-eslint/no-explicit-any */
function log(...args: unknown[]) {
  if (import.meta.env.DEV) console.info("[intercom]", ...args);
}

function intercomFn(): ((command: string, ...args: unknown[]) => void) | undefined {
  const ic = (window as any).Intercom;
  return typeof ic === "function" ? ic : undefined;
}

function clearIntercomStorage() {
  try {
    for (const raw of document.cookie.split(";")) {
      const name = raw.split("=")[0]?.trim();
      if (!name || !/^intercom/i.test(name)) continue;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${location.hostname}`;
    }
  } catch {
    // ignore
  }
  try {
    const remove = (store: Storage) => {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && /intercom/i.test(k)) keys.push(k);
      }
      for (const k of keys) store.removeItem(k);
    };
    remove(localStorage);
    remove(sessionStorage);
  } catch {
    // ignore
  }
}

/** Full teardown so the next boot injects a fresh widget script. */
function destroyWidget() {
  try {
    intercomFn()?.("shutdown");
  } catch {
    // ignore
  }
  clearIntercomStorage();
  loaded = false;

  try {
    document
      .querySelectorAll(
        'script[src*="widget.intercom.io"], .intercom-lightweight-app, #intercom-container, iframe[name^="intercom-"]',
      )
      .forEach((el) => el.remove());
  } catch {
    // ignore
  }

  try {
    delete (window as any).Intercom;
    delete (window as any).intercomSettings;
  } catch {
    // ignore
  }
}

function ensureSnippet(appId: string) {
  const w = window as any;
  if (typeof w.Intercom === "function" && Array.isArray(w.Intercom.q)) {
    // Stub already queued — fine.
  } else if (typeof w.Intercom !== "function") {
    const intercom = function (...args: unknown[]) {
      intercom.c(args);
    } as any;
    intercom.q = [];
    intercom.c = function (args: unknown[]) {
      intercom.q.push(args);
    };
    w.Intercom = intercom;
  }

  if (!document.querySelector(`script[src*="widget.intercom.io/widget/${appId}"]`)) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `https://widget.intercom.io/widget/${appId}`;
    document.head.appendChild(script);
  }
}

function boot(settingsExtra: Record<string, unknown> = {}) {
  if (!APP_ID?.trim()) return;
  const appId = APP_ID.trim();
  const settings = {
    api_base: "https://api-iam.intercom.io",
    app_id: appId,
    hide_default_launcher: launcherHidden,
    ...settingsExtra,
  };
  (window as any).intercomSettings = settings;
  ensureSnippet(appId);

  log("boot", {
    keys: Object.keys(settings),
    has_jwt: Boolean((settings as any).intercom_user_jwt),
    hide_default_launcher: Boolean((settings as any).hide_default_launcher),
  });

  const ic = (window as any).Intercom;
  if (typeof ic !== "function") return;
  ic("boot", settings);
  loaded = true;
}

function bootVisitorFresh() {
  destroyWidget();
  boot();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Anonymous visitor (logged out / Security Off). */
export function initIntercom() {
  if (!APP_ID?.trim()) return;
  bootVisitorFresh();
}

/**
 * Logged-in user.
 * Security Off → keep/ensure visitor messenger (identity fields blank the frame).
 * Security On → JWT-only boot (set enforceIdentity).
 */
export function identifyIntercom(user: {
  userId: string;
  email?: string;
  name?: string;
  userJwt?: string;
  enforceIdentity?: boolean;
}) {
  if (!APP_ID?.trim()) return;

  if (user.enforceIdentity && user.userJwt?.trim()) {
    log("identifyIntercom → JWT (Messenger Security On)");
    destroyWidget();
    boot({ intercom_user_jwt: user.userJwt.trim() });
    return;
  }

  if (!loaded) {
    log("identifyIntercom → visitor boot");
    boot();
  } else {
    log("identifyIntercom → keep visitor session");
  }
}

export function shutdownIntercom() {
  destroyWidget();
}

/** Toggle the floating Intercom bubble (sidebar Support still works via `openIntercom`). */
export function setIntercomLauncherHidden(hidden: boolean) {
  launcherHidden = hidden;
  if (!APP_ID?.trim()) return;
  const ic = intercomFn();
  if (!loaded || typeof ic !== "function") return;
  try {
    ic("update", { hide_default_launcher: hidden });
  } catch {
    // ignore
  }
}

function messengerAlive(): boolean {
  return Boolean(
    document.querySelector(
      'iframe[name="intercom-messenger-frame"], iframe[name="intercom-launcher-frame"], .intercom-lightweight-app, #intercom-container',
    ),
  );
}

export function openIntercom() {
  if (!APP_ID?.trim()) {
    window.location.href = "mailto:support@mythex.ai";
    return;
  }

  const show = () => {
    const ic = intercomFn();
    if (!ic) return false;
    ic("show");
    return true;
  };

  const ensureAndShow = () => {
    if (!loaded || typeof intercomFn() !== "function") {
      bootVisitorFresh();
    }
    show();
  };

  ensureAndShow();

  // If the widget is zombie (boot'd but no DOM), hard-reboot once and retry.
  window.setTimeout(() => {
    if (messengerAlive()) return;
    log("openIntercom → messenger missing, hard reboot");
    bootVisitorFresh();
    show();

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      show();
      if (messengerAlive() || attempts >= 12) {
        window.clearInterval(timer);
        if (!messengerAlive() && !intercomFn()) {
          window.location.href = "mailto:support@mythex.ai";
        }
      }
    }, 400);
  }, 800);
}

if (typeof window !== "undefined") {
  (window as unknown as { __intercomDebug?: () => unknown }).__intercomDebug = () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const s = (window as any).intercomSettings || {};
    return {
      loaded,
      appId: APP_ID,
      alive: messengerAlive(),
      settings: {
        keys: Object.keys(s),
        has_jwt: Boolean(s.intercom_user_jwt),
      },
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  };
}
