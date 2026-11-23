import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api } from "../../lib/api";
import { btnClass, CARD_BG, surfaceRing, whiteBtnClass } from "../../lib/surfaces";
import { fill, useT } from "../../i18n/app";
import { AppStoreConnectPanel, GooglePlayConnectPanel } from "./MobileStoresSection";
import { StoreTile } from "./MobileCardShell";
import { isActive, useMobileApp, type ProjectStores } from "./mobile-app";

/**
 * Project settings → Mobile app: the latest Android build to download, and
 * the store accounts this project's builds and store changes use (Google
 * Play for Android, App Store for iPhone). Only the owner connects or
 * disconnects them; the chat also asks for them when the AI needs one.
 * Builds themselves happen in the chat.
 */
export function MobileAppSettings({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectStores | null>(null);
  const load = useCallback(async () => {
    setState(await api.get<ProjectStores>(`/v1/projects/${projectId}/mobile/stores`).catch(() => null));
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <AndroidDownload projectId={projectId} />
      <StoreAccount projectId={projectId} store="google" state={state} reload={load} />
      <StoreAccount projectId={projectId} store="apple" state={state} reload={load} />
    </div>
  );
}

/** One store's account: connected with which key (never the key), and Connect / Disconnect for the owner. */
function StoreAccount({
  projectId,
  store,
  state,
  reload,
}: {
  projectId: string;
  store: "apple" | "google";
  state: ProjectStores | null;
  reload: () => Promise<void>;
}) {
  const m = useT().publish.mobile;
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const google = store === "google";
  const copy = google ? m.playAccount : m.account;
  const connected = state?.[store] ?? null;

  const disconnect = async () => {
    setBusy(true);
    await api.delete(`/v1/projects/${projectId}/mobile/stores/${store}`).catch(() => null);
    await reload();
    setBusy(false);
  };
  const Panel = google ? GooglePlayConnectPanel : AppStoreConnectPanel;

  return (
    <>
      <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
        <div className="flex items-center gap-3">
          <StoreTile platform={google ? "android" : "ios"} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg">{copy.title}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{copy.body}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3" data-testid={`mobile-${store}-status`}>
          <span className="min-w-0 truncate text-sm text-fg">
            {!state ? "\u00a0" : connected ? fill(m.account.connected, { label: connected.label }) : m.account.notConnected}
          </span>
          {/* Disconnecting always works (it's their key); connecting needs a paid plan. */}
          {state?.isOwner && (connected || state.allowed) && !connecting ? (
            connected ? (
              <button type="button" disabled={busy} onClick={() => void disconnect()} className={btnClass("lg", "ghost")}>
                {m.stores.disconnect}
              </button>
            ) : (
              <button type="button" onClick={() => setConnecting(true)} className={btnClass("lg")}>
                {m.stores.save}
              </button>
            )
          ) : null}
        </div>
        {state && !state.allowed ? (
          <p className="mt-2 text-[12px] text-muted">{m.account.proOnly}</p>
        ) : state && !state.isOwner ? (
          <p className="mt-2 text-[12px] text-muted">{m.account.ownerOnly}</p>
        ) : null}
      </div>
      {connecting && (
        <Panel
          projectId={projectId}
          onCancel={() => setConnecting(false)}
          onConnected={() => {
            setConnecting(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

/** The latest Android build: its file while it's kept, or where it stands. */
function AndroidDownload({ projectId }: { projectId: string }) {
  const m = useT().publish.mobile;
  const { builds, loaded } = useMobileApp(projectId);
  const b = builds.android ?? null;
  const statusFor: Record<string, string> = m.statusFor;
  const status = !loaded
    ? "\u00a0"
    : !b
      ? m.androidFile.none
      : isActive(b)
        ? m.androidFile.building
        : b.status === "ready"
          ? b.downloadUrl
            ? m.ready
            : m.androidFile.expired
          : (statusFor[b.errorCode ?? "our_side"] ?? statusFor.our_side);
  return (
    <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
      <div className="flex items-center gap-3">
        <StoreTile platform="android" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{m.titleAndroid}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{m.androidFile.body}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3" data-testid="mobile-android-download">
        <span className="min-w-0 truncate text-sm text-fg">{status}</span>
        {b?.status === "ready" && b.downloadUrl ? (
          <a href={b.downloadUrl} className={whiteBtnClass("lg")}>
            <Download className="size-[15px]" aria-hidden />
            {m.download}
          </a>
        ) : null}
      </div>
    </div>
  );
}
