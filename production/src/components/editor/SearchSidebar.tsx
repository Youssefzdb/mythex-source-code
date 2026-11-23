import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ListCollapse,
  RotateCw,
  SearchX,
} from "lucide-react";
import { FileTypeIcon } from "../FileTypeIcon";
import type { SearchHit } from "./EditorPalette";
import { fill, pl, useT } from "../../i18n/app";

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
  exclude: string;
}

interface Props {
  onSearch: (query: string, opts: SearchOptions) => Promise<SearchHit[]>;
  onOpenFile: (path: string, line?: number) => void;
  focusToken?: number;
}

export function SearchSidebar({ onSearch, onOpenFile, focusToken }: Props) {
  const t = useT();
  const ss = t.workspace.searchSidebar;
  const [query, setQuery] = useState("");
  const [opts, setOpts] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    include: "",
    exclude: "",
  });
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusToken == null) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const run = (q = query) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    void onSearch(trimmed, opts)
      .then((rows) => setHits(rows))
      .catch(() => setHits([]))
      .finally(() => setSearching(false));
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(), 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, opts.caseSensitive, opts.wholeWord, opts.regex, opts.include, opts.exclude]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const list = map.get(h.path) ?? [];
      list.push(h);
      map.set(h.path, list);
    }
    return [...map.entries()];
  }, [hits]);

  const toggleOpt = (key: "caseSensitive" | "wholeWord" | "regex") => {
    setOpts((o) => ({ ...o, [key]: !o[key] }));
  };

  const clearResults = () => {
    setQuery("");
    setHits([]);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const [path] of grouped) next[path] = true;
    setCollapsed(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — compact like Cursor */}
      <div className="flex h-7 items-center justify-between px-2">
        <span className="text-[11px] font-semibold tracking-wide text-fg-2 uppercase">{t.common.search}</span>
        <div className="flex items-center">
          <IconBtn title={ss.refresh} onClick={() => run()}>
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title={ss.clearResults} onClick={clearResults}>
            <SearchX className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title={ss.collapseAll} onClick={collapseAll} disabled={grouped.length === 0}>
            <ListCollapse className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-1.5">
        {/* Query row: toggle filters + input with Aa / ab / .* inside */}
        <div className="flex items-stretch gap-0.5">
          <button
            type="button"
            title={filtersOpen ? ss.hideFilters : ss.showFilters}
            onClick={() => setFiltersOpen((v) => !v)}
            className="grid w-4 shrink-0 place-items-center text-disabled hover:text-fg-2"
          >
            {filtersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 rtl:-scale-x-100" />}
          </button>
          <div className="flex min-w-0 flex-1 items-center rounded border border-line bg-bg focus-within:border-line-subtle">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
                if (e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
              placeholder={t.common.search}
              dir="auto"
              className="min-w-0 flex-1 bg-transparent py-1 pe-0.5 ps-1.5 text-[12px] leading-none text-fg outline-none placeholder:text-disabled"
            />
            <div dir="ltr" className="flex shrink-0 items-center pe-0.5">
              <ToggleBtn
                active={opts.caseSensitive}
                title={ss.matchCase}
                onClick={() => toggleOpt("caseSensitive")}
              >
                Aa
              </ToggleBtn>
              <ToggleBtn
                active={opts.wholeWord}
                title={ss.matchWholeWord}
                onClick={() => toggleOpt("wholeWord")}
                underline
              >
                ab
              </ToggleBtn>
              <ToggleBtn active={opts.regex} title={ss.useRegex} onClick={() => toggleOpt("regex")}>
                .*
              </ToggleBtn>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <>
            <label className="block ps-[18px]">
              <span className="mb-0.5 block text-[10px] leading-none text-disabled">{ss.filesToInclude}</span>
              <input
                value={opts.include}
                onChange={(e) => setOpts((o) => ({ ...o, include: e.target.value }))}
                placeholder={ss.includePlaceholder}
                className="w-full rounded border border-line bg-bg px-1.5 py-1 text-[11px] leading-none text-fg outline-none placeholder:text-disabled focus:border-line-subtle"
              />
            </label>
            <label className="block ps-[18px]">
              <span className="mb-0.5 block text-[10px] leading-none text-disabled">{ss.filesToExclude}</span>
              <input
                value={opts.exclude}
                onChange={(e) => setOpts((o) => ({ ...o, exclude: e.target.value }))}
                placeholder={ss.excludePlaceholder}
                className="w-full rounded border border-line bg-bg px-1.5 py-1 text-[11px] leading-none text-fg outline-none placeholder:text-disabled focus:border-line-subtle"
              />
            </label>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {!query.trim() ? (
          <p className="px-2 py-2 text-[11px] text-disabled">{ss.typeToSearch}</p>
        ) : searching ? (
          <p className="px-2 py-2 text-[11px] text-disabled">{ss.searching}</p>
        ) : grouped.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-disabled">{ss.noResults}</p>
        ) : (
          <div className="py-0.5">
            <p className="px-2 py-1 text-[10px] leading-none text-disabled">
              {fill(ss.summary, { results: pl(ss.results, hits.length), files: pl(ss.files, grouped.length) })}
            </p>
            {grouped.map(([path, rows]) => {
              const isCollapsed = collapsed[path];
              const name = path.split("/").pop() ?? path;
              const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
              return (
                <div key={path} dir="ltr">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [path]: !c[path] }))}
                    className="flex w-full items-center gap-1 px-1.5 py-0.5 text-start text-[12px] leading-snug text-fg-2 hover:bg-hover"
                    title={path}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3 shrink-0 text-disabled" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 text-disabled" />
                    )}
                    <FileTypeIcon name={name} className="size-3.5 shrink-0" />
                    <span className="truncate text-fg">{name}</span>
                    {dir ? <span className="min-w-0 truncate text-[10px] text-disabled">{dir}</span> : null}
                    <span className="ms-auto shrink-0 ps-1 text-[10px] text-disabled">{rows.length}</span>
                  </button>
                  {!isCollapsed &&
                    rows.map((hit, i) => (
                      <button
                        key={`${hit.path}:${hit.line}:${i}`}
                        type="button"
                        onClick={() => onOpenFile(hit.path, hit.line)}
                        className="flex w-full items-baseline gap-1.5 px-1.5 py-0.5 ps-6 text-start hover:bg-hover"
                      >
                        <span className="w-6 shrink-0 text-end font-mono text-[10px] leading-snug text-disabled">
                          {hit.line}
                        </span>
                        <span className="min-w-0 truncate font-mono text-[11px] leading-snug text-fg-2">
                          {hit.text.trim() || " "}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ToggleBtn({
  active,
  title,
  onClick,
  children,
  underline,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  underline?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-sm px-0.5 font-mono text-[10px] leading-none ${
        underline ? "underline decoration-1 underline-offset-2" : ""
      } ${active ? "bg-accent-subtle text-fg" : "text-disabled hover:bg-hover hover:text-fg-2"}`}
    >
      {children}
    </button>
  );
}
