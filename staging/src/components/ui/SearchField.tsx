import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { FIELD_CLASS } from "../../lib/surfaces";
import { useT } from "../../i18n/app";

/**
 * The app's search box.
 *
 * One component so every search behaves the same — in particular the clear
 * button, which people expect once they have seen it on the projects search
 * and miss everywhere it is absent. It only appears when there is something to
 * clear, so an empty field stays quiet.
 */
export const SearchField = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    "data-testid"?: string;
    "aria-label"?: string;
  }
>(function SearchField(
  { value, onChange, placeholder, className = "", ...rest },
  ref,
) {
  const t = useT();
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-white/35" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t.common.search}
        className={`${FIELD_CLASS} pe-9 !ps-9`}
        autoComplete="off"
        {...rest}
      />
      {value && (
        <button
          type="button"
          // Not a submit, and not focusable by tab: it is a shortcut, and the
          // field itself already clears with a keyboard.
          tabIndex={-1}
          onClick={() => onChange("")}
          className="absolute top-1/2 end-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-white/40 transition hover:text-white"
          aria-label={t.shell.dashboard.clearSearch}
          data-testid="search-clear"
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
});
