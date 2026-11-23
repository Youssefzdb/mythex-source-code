import { useEffect, useState, type DragEvent } from "react";
import { ExternalLink, FileJson, KeyRound } from "lucide-react";
import { api } from "../../lib/api";
import { btnClass, whiteBtnClass } from "../../lib/surfaces";
import { Spinner } from "../ui";
import { fill, useT } from "../../i18n/app";
import { apiMessage, type ProjectStores } from "./mobile-app";

/**
 * Connecting a project's App Store Connect account (apps/api
 * lib/mobile-stores.ts): above the message box while the AI waits on it — the
 * same place and shape as the secrets panel — or from the project's settings.
 * A key the owner already gave another project is one tap; otherwise drop the
 * .p8 key Apple gave them and paste the Issuer ID. The Key ID is in the
 * file's name (AuthKey_<KEYID>.p8), so it's only asked for when it isn't. A
 * new key is checked with Apple when it's sent and never comes back.
 */

const KEYS_URL = "https://appstoreconnect.apple.com/access/integrations/api";

/** "AuthKey_2X9R4HXF34.p8" → "2X9R4HXF34". */
export function keyIdFromFileName(name: string): string | null {
  return name.match(/AuthKey_([A-Z0-9]{10})\.p8$/i)?.[1]?.toUpperCase() ?? null;
}

export function AppStoreConnectPanel({
  projectId,
  closing = false,
  onCancel,
  onConnected,
}: {
  projectId: string;
  /** The answer is on its way to the AI: nothing more to press. */
  closing?: boolean;
  onCancel: () => void;
  onConnected: () => void;
}) {
  const s = useT().publish.mobile.stores;
  const [file, setFile] = useState<File | null>(null);
  const [issuerId, setIssuerId] = useState("");
  const [typedKeyId, setTypedKeyId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keys the owner gave their other projects: one tap to use here. */
  const [reusable, setReusable] = useState<ProjectStores["reusable"]>([]);
  useEffect(() => {
    void api
      .get<ProjectStores>(`/v1/projects/${projectId}/mobile/stores`)
      .then((out) => setReusable(out.reusable ?? []))
      .catch(() => null);
  }, [projectId]);

  const fileKeyId = file ? keyIdFromFileName(file.name) : null;
  const keyId = fileKeyId ?? typedKeyId.trim();
  const canSubmit = Boolean(file && keyId && issuerId.trim());
  const locked = busy || closing;

  const pick = (f: File | undefined | null) => {
    if (f) setFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const send = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/v1/projects/${projectId}/mobile/stores/apple`, body);
      onConnected();
    } catch (err) {
      setError(apiMessage(err) ?? s.connectFailed);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!file) return;
    await send({ issuerId: issuerId.trim(), keyId, privateKey: await file.text() });
  };

  const field = "w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[12px] text-fg outline-none focus:[--mx-ring:var(--mx-accent)]";

  return (
    <div data-testid="app-store-panel" className="flex flex-col gap-2.5 rounded-xl border border-line bg-elevated p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <KeyRound className="size-4 text-fg" strokeWidth={2.25} />
        {s.title}
      </div>
      <p className="text-[13px] leading-snug text-muted">{s.why}</p>
      {reusable.map((r) => (
        <button
          key={r.projectId}
          type="button"
          disabled={locked}
          onClick={() => void send({ fromProjectId: r.projectId })}
          className={`w-full !justify-start ${btnClass("lg")}`}
        >
          <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{fill(s.reuse, { label: r.label, project: r.projectName })}</span>
        </button>
      ))}
      {reusable.length > 0 && <p className="text-[12px] text-muted">{s.orNewKey}</p>}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] transition ${
          dragging ? "bg-white/[0.06]" : "bg-panel hover:bg-white/[0.03]"
        }`}
      >
        <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
        <span className={`truncate ${file ? "text-fg" : "text-muted"}`}>{file ? file.name : s.dropKey}</span>
        <input type="file" accept=".p8" className="sr-only" disabled={locked} onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {file && !fileKeyId && (
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          {s.keyId}
          <input value={typedKeyId} onChange={(e) => setTypedKeyId(e.target.value)} disabled={locked} className={field} autoComplete="off" spellCheck={false} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-muted">
        {s.issuerId}
        <input value={issuerId} onChange={(e) => setIssuerId(e.target.value)} disabled={locked} className={field} autoComplete="off" spellCheck={false} />
      </label>
      {error && <p className="text-[13px] text-red-400">{error}</p>}
      <a href={KEYS_URL} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-[12px] text-muted hover:text-fg hover:underline">
        {s.howTo}
        <ExternalLink className="size-3" aria-hidden />
      </a>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="app-store-connect"
          disabled={!canSubmit || locked}
          onClick={() => void submit()}
          className={`flex-1 ${whiteBtnClass("lg")}`}
        >
          {busy ? (
            <>
              <Spinner size={14} />
              {s.checkingKey}
            </>
          ) : (
            s.save
          )}
        </button>
        <button type="button" disabled={locked} onClick={onCancel} className={`flex-1 ${btnClass("lg", "ghost")}`}>
          {s.cancel}
        </button>
      </div>
    </div>
  );
}

const PLAY_GUIDE_URL = "https://developers.google.com/android-publisher/getting_started";

/**
 * Connecting a project's Google Play account the same way: the owner's own
 * service account, invited in their Play Console, as the JSON key Google
 * Cloud gives. Mythex checks it on the project's app (once there is one)
 * before keeping it.
 */
export function GooglePlayConnectPanel({
  projectId,
  closing = false,
  onCancel,
  onConnected,
}: {
  projectId: string;
  closing?: boolean;
  onCancel: () => void;
  onConnected: () => void;
}) {
  const t = useT().publish.mobile;
  const p = t.play;
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ProjectStores | null>(null);
  useEffect(() => {
    void api
      .get<ProjectStores>(`/v1/projects/${projectId}/mobile/stores`)
      .then(setState)
      .catch(() => null);
  }, [projectId]);
  const reusable = state?.reusableGoogle ?? [];
  const locked = busy || closing;

  const send = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/v1/projects/${projectId}/mobile/stores/google`, body);
      onConnected();
    } catch (err) {
      setError(apiMessage(err) ?? t.stores.connectFailed);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (file) await send({ serviceAccount: await file.text() });
  };

  return (
    <div data-testid="google-play-panel" className="flex flex-col gap-2.5 rounded-xl border border-line bg-elevated p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <KeyRound className="size-4 text-fg" strokeWidth={2.25} />
        {p.title}
      </div>
      <p className="text-[13px] leading-snug text-muted">{p.why}</p>
      {state && !state.isOwner ? (
        <p className="text-[13px] text-muted">{t.account.ownerOnly}</p>
      ) : (
        <>
          {reusable.map((r) => (
            <button
              key={r.projectId}
              type="button"
              disabled={locked}
              onClick={() => void send({ fromProjectId: r.projectId })}
              className={`w-full !justify-start ${btnClass("lg")}`}
            >
              <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{fill(t.stores.reuse, { label: r.label, project: r.projectName })}</span>
            </button>
          ))}
          {reusable.length > 0 && <p className="text-[12px] text-muted">{t.stores.orNewKey}</p>}
          <ol className="list-decimal space-y-0.5 ps-5 text-[13px] leading-snug text-muted">
            <li>{p.step1}</li>
            <li>{p.step2}</li>
            <li>{p.step3}</li>
          </ol>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] transition ${
              dragging ? "bg-white/[0.06]" : "bg-panel hover:bg-white/[0.03]"
            }`}
          >
            <FileJson className="size-4 shrink-0 text-muted" aria-hidden />
            <span className={`truncate ${file ? "text-fg" : "text-muted"}`}>{file ? file.name : p.dropKey}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              disabled={locked}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
          </label>
          {error && <p className="text-[13px] text-red-400">{error}</p>}
          <a href={PLAY_GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-[12px] text-muted hover:text-fg hover:underline">
            {p.howTo}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </>
      )}
      <div className="flex gap-2">
        {(!state || state.isOwner) && (
          <button
            type="button"
            data-testid="google-play-connect"
            disabled={!file || locked}
            onClick={() => void submit()}
            className={`flex-1 ${whiteBtnClass("lg")}`}
          >
            {busy ? (
              <>
                <Spinner size={14} />
                {t.stores.checkingKey}
              </>
            ) : (
              t.stores.save
            )}
          </button>
        )}
        <button type="button" disabled={locked} onClick={onCancel} className={`flex-1 ${btnClass("lg", "ghost")}`}>
          {t.stores.cancel}
        </button>
      </div>
    </div>
  );
}
