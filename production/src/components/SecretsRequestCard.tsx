import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { Spinner } from "./ui";
import { btnClass, whiteBtnClass } from "../lib/surfaces";
import { useT } from "../i18n/app";

export function SecretsRequestCard({
  keys,
  reason,
  saving,
  onCancel,
  onSave,
}: {
  keys: string[];
  reason?: string | null;
  saving?: boolean;
  onCancel: () => void;
  onSave: (vars: Array<{ key: string; value: string }>) => void;
}) {
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, ""])),
  );

  const canSave = useMemo(
    () => keys.length > 0 && keys.every((k) => (values[k] ?? "").trim().length > 0),
    [keys, values],
  );

  return (
    <div
      data-testid="secrets-request-card"
      className="rounded-xl border border-line bg-elevated p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
        <KeyRound className="size-4 text-fg" strokeWidth={2.25} />
        {t.tools.secrets.title}
      </div>
      {reason ? <p dir="auto" className="mb-3 text-[13px] leading-snug text-muted">{reason}</p> : null}
      <div className="space-y-2">
        {keys.map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block font-mono text-[11px] font-medium text-muted">{key}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              value={values[key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-fg outline-none focus:[--mx-ring:var(--mx-accent)]"
              placeholder="••••••••"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="secrets-request-save"
          disabled={!canSave || saving}
          onClick={() =>
            onSave(keys.map((key) => ({ key, value: (values[key] ?? "").trim() })))
          }
          // Both buttons take the shared recipes so they are the same shape:
          // this one was a hand-rolled white pill with its own radius and
          // padding sitting next to a `.btn-secondary` with neither.
          className={`flex-1 ${whiteBtnClass("lg")}`}
        >
          {saving ? (
            <>
              <Spinner size={14} />
              {t.common.saving}
            </>
          ) : (
            t.common.save
          )}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className={`flex-1 ${btnClass("lg", "ghost")}`}
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
