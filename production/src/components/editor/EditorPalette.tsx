import { useEffect, useMemo, useRef, useState } from "react";
import { FileTypeIcon } from "../FileTypeIcon";
import { MOD_LABEL, fuzzyScore, type EditorSettings } from "./editorSettings";
import { useT } from "../../i18n/app";

export type PaletteMode = "command" | "quickOpen" | "cheatsheet" | "settings";

export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

interface Props {
  mode: PaletteMode;
  onClose: () => void;
  commands: CommandItem[];
  fileIndex: string[];
  /** Recently opened paths (most recent first). */
  recentPaths?: string[];
  onOpenFile: (path: string, line?: number) => void;
  settings: EditorSettings;
  onSettingsChange: (next: EditorSettings) => void;
}

function parseQuickOpenQuery(raw: string): { query: string; line?: number } {
  const m = raw.match(/^(.*?):(\d+)\s*$/);
  if (!m) return { query: raw };
  const line = Number(m[2]);
  return { query: m[1], line: Number.isFinite(line) && line > 0 ? line : undefined };
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

function nameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

export function EditorPalette({
  mode,
  onClose,
  commands,
  fileIndex,
  recentPaths = [],
  onOpenFile,
  settings,
  onSettingsChange,
}: Props) {
  const t = useT();
  const e = t.workspace.editorPalette;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    setQuery("");
    setActive(0);
  }, [mode]);

  const { query: fileQuery, line: gotoLine } = useMemo(() => parseQuickOpenQuery(query), [query]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
  }, [commands, query]);

  const quickItems = useMemo(() => {
    if (mode !== "quickOpen") return [] as { path: string; recent: boolean }[];
    const q = fileQuery.trim();
    if (!q) {
      const recent = recentPaths.filter((p) => fileIndex.includes(p) || true).slice(0, 20);
      const rest = fileIndex.filter((p) => !recent.includes(p)).slice(0, 40);
      return [
        ...recent.map((path) => ({ path, recent: true })),
        ...rest.map((path) => ({ path, recent: false })),
      ].slice(0, 50);
    }
    return fileIndex
      .map((path) => ({ path, score: fuzzyScore(q, path), recent: recentPaths.includes(path) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 50)
      .map(({ path, recent }) => ({ path, recent }));
  }, [mode, fileQuery, fileIndex, recentPaths]);

  const listLen = mode === "command" ? filteredCommands.length : mode === "quickOpen" ? quickItems.length : 0;

  useEffect(() => {
    setActive((i) => (listLen === 0 ? 0 : Math.min(i, listLen - 1)));
  }, [listLen]);

  const title =
    mode === "command"
      ? e.commandPalette
      : mode === "quickOpen"
        ? e.goToFile
        : mode === "settings"
          ? e.editorSettings
          : e.keyboardShortcuts;

  const select = (index: number) => {
    if (mode === "command") {
      const item = filteredCommands[index];
      if (!item) return;
      onClose();
      item.run();
      return;
    }
    if (mode === "quickOpen") {
      const item = quickItems[index];
      if (!item) return;
      onClose();
      onOpenFile(item.path, gotoLine);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10%] backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="mx-popup-in w-[min(640px,94vw)] origin-top overflow-hidden rounded-lg border border-line bg-panel shadow-2xl shadow-black/60"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        {(mode === "command" || mode === "quickOpen") && (
          <div className="flex items-center border-b border-line">
            <input
              ref={inputRef}
              value={query}
              onChange={(ev) => {
                setQuery(ev.target.value);
                setActive(0);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  onClose();
                  return;
                }
                if (ev.key === "ArrowDown") {
                  ev.preventDefault();
                  setActive((i) => (listLen ? (i + 1) % listLen : 0));
                  return;
                }
                if (ev.key === "ArrowUp") {
                  ev.preventDefault();
                  setActive((i) => (listLen ? (i - 1 + listLen) % listLen : 0));
                  return;
                }
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  select(active);
                }
              }}
              placeholder={
                mode === "quickOpen"
                  ? e.searchFiles
                  : e.typeCommand
              }
              className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[13px] text-fg outline-none placeholder:text-disabled"
            />
            <button
              type="button"
              onClick={onClose}
              className="me-2 rounded px-2 py-1 text-[10px] text-disabled hover:bg-hover hover:text-fg"
            >
              Esc
            </button>
          </div>
        )}

        {mode !== "command" && mode !== "quickOpen" && (
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{title}</span>
            <button type="button" onClick={onClose} className="text-[10px] text-disabled hover:text-fg">
              Esc
            </button>
          </div>
        )}

        {mode === "command" && (
          <ul className="max-h-80 overflow-y-auto py-1">
            {filteredCommands.length === 0 ? (
              <li className="px-3.5 py-2 text-xs text-disabled">{e.noCommands}</li>
            ) : (
              filteredCommands.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(i)}
                    className={`flex w-full items-center justify-between px-3.5 py-1.5 text-start text-[13px] ${
                      i === active ? "bg-accent-subtle text-fg" : "text-fg-2 hover:bg-hover"
                    }`}
                  >
                    <span>{c.label}</span>
                    {c.shortcut ? <span dir="ltr" className="text-[10px] text-disabled">{c.shortcut}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {mode === "quickOpen" && (
          <ul className="max-h-[min(420px,55vh)] overflow-y-auto py-1">
            {quickItems.length === 0 ? (
              <li className="px-3.5 py-2 text-xs text-disabled">
                {fileIndex.length ? e.noMatchingFiles : e.indexingFiles}
              </li>
            ) : (
              quickItems.map((item, i) => {
                const name = nameOf(item.path);
                const dir = dirOf(item.path);
                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => select(i)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-1.5 text-start ${
                        i === active ? "bg-hover text-fg" : "text-fg-2 hover:bg-hover/60"
                      }`}
                    >
                      <FileTypeIcon name={name} className="size-4 shrink-0" />
                      <span dir="ltr" className="min-w-0 flex-1 truncate text-start">
                        <span className="text-[13px] text-fg">{name}</span>
                        {dir ? (
                          <span className="ms-2 text-[12px] text-disabled">{dir}</span>
                        ) : null}
                      </span>
                      {item.recent && !fileQuery.trim() ? (
                        <span className="shrink-0 text-[10px] text-disabled">{e.recentlyOpened}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}

        {mode === "settings" && (
          <div className="space-y-3 px-3 py-3 text-sm">
            <Toggle
              label={e.wordWrap}
              checked={settings.wordWrap}
              onChange={(wordWrap) => onSettingsChange({ ...settings, wordWrap })}
            />
            <Toggle
              label={e.minimap}
              checked={settings.minimap}
              onChange={(minimap) => onSettingsChange({ ...settings, minimap })}
            />
            <Toggle
              label={e.autoSave}
              checked={settings.autoSave}
              onChange={(autoSave) => onSettingsChange({ ...settings, autoSave })}
            />
            <label className="flex items-center justify-between gap-3 text-fg-2">
              <span>{e.fontSize}</span>
              <input
                type="number"
                min={10}
                max={24}
                value={settings.fontSize}
                onChange={(ev) =>
                  onSettingsChange({
                    ...settings,
                    fontSize: Math.min(24, Math.max(10, Number(ev.target.value) || 13)),
                  })
                }
                className="w-16 rounded-md border border-line bg-bg px-2 py-1 text-end text-fg"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-fg-2">
              <span>{e.tabSize}</span>
              <input
                type="number"
                min={1}
                max={8}
                value={settings.tabSize}
                onChange={(ev) =>
                  onSettingsChange({
                    ...settings,
                    tabSize: Math.min(8, Math.max(1, Number(ev.target.value) || 2)),
                  })
                }
                className="w-16 rounded-md border border-line bg-bg px-2 py-1 text-end text-fg"
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-fg"
            >
              {t.common.done}
            </button>
          </div>
        )}

        {mode === "cheatsheet" && (
          <div className="max-h-80 space-y-1 overflow-y-auto px-3 py-3 text-sm">
            {[
              [`${MOD_LABEL}+S`, e.shortcuts.saveFile],
              [`${MOD_LABEL}+W`, e.shortcuts.closeTab],
              [`⌥${MOD_LABEL}+T`, e.shortcuts.closeOtherTabs],
              [`${MOD_LABEL}+Shift+T`, e.shortcuts.reopenClosedTab],
              [`${MOD_LABEL}+P`, e.goToFile],
              [`${MOD_LABEL}+Shift+F`, e.shortcuts.searchSidebar],
              [`${MOD_LABEL}+Shift+P`, e.commandPalette],
              [`${MOD_LABEL}+\``, e.shortcuts.toggleTerminal],
              [`${MOD_LABEL}+F`, e.shortcuts.findInFile],
              [`${MOD_LABEL}+H`, e.shortcuts.replaceInFile],
              [`${MOD_LABEL}+G`, e.shortcuts.goToLine],
              ["?", e.shortcuts.cheatsheet],
            ].map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-3 py-0.5 text-fg-2">
                <span>{label}</span>
                <kbd dir="ltr" className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {keys}
                </kbd>
              </div>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-fg"
            >
              {t.common.close}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-fg-2">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
    </label>
  );
}
