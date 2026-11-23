import { useState, type ReactNode, type SVGProps } from "react";
import { Check } from "lucide-react";
import { CARD_BG, floatingRing } from "../../lib/surfaces";
import { Popover } from "./Popover";
import { MenuSheet, useIsPhone } from "./Sheet";

export type DescribedOption<T extends string> = {
  id: T;
  label: string;
  description?: string;
  /** Shown, but can't be picked (e.g. a role your plan doesn't include). */
  disabled?: boolean;
  /** What the closed field shows, when it differs from the menu row's label. */
  triggerLabel?: string;
  /** Right-aligned in the menu row (e.g. a price and a "Save 4%" pill). */
  trailing?: ReactNode;
};

/** Lovable dark select-field: translucent fill + inset rim light. */
export const SELECT_FIELD_STYLE = {
  background: "oklch(56.74% 0.009 106.68 / 0.16)",
  boxShadow:
    "inset 0 1px 0 0 rgba(255,255,255,0.14), inset 0 -1px 0 0 rgba(255,255,255,0.04), inset 0 0 0 1px rgba(255,255,255,0.14), 0 2px 2px -1px rgba(0,0,0,0.12), 0 4px 4px -2px rgba(0,0,0,0.12)",
} as const;

/** Dual up/down chevron — Lovable `select-chevron`. */
function SelectChevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="text-muted">
      <path
        fill="currentColor"
        d="M8.42 13.517a.666.666 0 0 1-.891-.046L5 10.943A.667.667 0 1 1 5.943 10L8 12.057 10.057 10a.667.667 0 1 1 .943.943L8.471 13.47l-.05.046Z"
        className={`transition-transform duration-200 ease-out ${open ? "-translate-y-[7.5px]" : ""}`}
      />
      <path
        fill="currentColor"
        d="M8.42 2.48a.666.666 0 0 0-.891.045L4.997 5.057A.667.667 0 1 0 5.939 6L8 3.94 10.06 6a.667.667 0 1 0 .944-.943L8.47 2.525l-.05-.045Z"
        className={`transition-transform duration-200 ease-out ${open ? "translate-y-[7.5px]" : ""}`}
      />
    </svg>
  );
}

/**
 * Select trigger + menu — Lovable select-field: h-8, rounded-2 (8px), dual chevron.
 * Menu is portaled so parent stacking / overflow can't clip it.
 */
export function DescribedSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  align = "left",
  placeholder,
  className = "",
  wide = false,
  emptyValue,
  fullWidth = false,
  disabled = false,
  size = "md",
  wideMenu = false,
}: {
  value: T | null;
  options: DescribedOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  align?: "left" | "right";
  placeholder?: string;
  className?: string;
  wide?: boolean;
  emptyValue?: T;
  /** Fill the container (forms, plan cards). */
  fullWidth?: boolean;
  disabled?: boolean;
  /** lg: 40px, to sit level with a plan card's 40px button. */
  size?: "md" | "lg";
  /** Menu at least 18rem: rows with a label and a right-hand price. */
  wideMenu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = value == null || (emptyValue !== undefined && value === emptyValue);
  const selected = !isEmpty && value != null ? options.find((o) => o.id === value) : undefined;

  const isPhone = useIsPhone();
  const trigger = (
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        data-popup-open={open || undefined}
        disabled={disabled}
        className={`group relative flex ${size === "lg" ? "h-10" : "h-8"} items-center overflow-hidden whitespace-nowrap rounded-[8px] text-sm transition focus:outline-none disabled:cursor-default disabled:opacity-60 ${
          fullWidth ? "w-full" : wide ? "w-48 min-w-[12rem]" : "w-auto"
        }`}
        style={SELECT_FIELD_STYLE}
      >
        {/* Soft top highlight — Lovable gradient-button-neutral */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)" }}
        />
        <span className={`relative truncate pe-7 text-white ${size === "lg" ? "ps-3" : "ps-2.5"}`}>
          {selected?.triggerLabel ?? selected?.label ?? placeholder}
        </span>
        <span className="pointer-events-none absolute top-1/2 end-2 z-[1] -translate-y-1/2">
          <SelectChevron open={open} />
        </span>
      </button>
  );
  // On a phone the options come up as a sheet, as the app's other menus do:
  // the anchored list ran up under the status bar and the Dynamic Island,
  // with its first option behind them (the language picker, seen in the
  // simulator), and its rows were desktop-sized.
  const rowClass = isPhone
    ? "flex w-full items-start gap-3 rounded-[10px] px-3 py-3 text-start transition active:bg-white/[0.06] disabled:cursor-default disabled:opacity-45"
    : "flex w-full items-start gap-2 rounded-[6px] px-2 py-1.5 text-start transition hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent";
  const listbox = (
          <div role="listbox" aria-label={ariaLabel}>
            {options.map((m) => {
              const isSelected = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={m.disabled || undefined}
                  disabled={m.disabled}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={rowClass}
                >
                  <span
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center text-[#f2f2f0]"
                    aria-hidden
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className={`block ${isPhone ? "text-[15px]" : "text-sm"} font-medium leading-snug text-white ${m.trailing ? "whitespace-nowrap" : ""}`}>{m.label}</span>
                      {m.trailing ? <span className="flex shrink-0 items-center gap-2">{m.trailing}</span> : null}
                    </span>
                    {m.description ? (
                      <span
                        className="mt-0.5 block text-[12px] leading-snug"
                        style={{ color: "oklch(72.34% 0.002 107)" }}
                      >
                        {m.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
  );

  if (isPhone) {
    return (
      <div className={`relative ${className}`}>
        {/* The field opens the sheet itself; there is no popover to own it. */}
        <span className="contents" onClick={() => !disabled && setOpen(true)}>
          {trigger}
        </span>
        <MenuSheet open={open} onClose={() => setOpen(false)} label={ariaLabel} surface={CARD_BG}>
          {listbox}
        </MenuSheet>
      </div>
    );
  }

  // Base UI popover: grows from the field, sizes to it (at least 240px), caps
  // its height to the room there is and flips above near the bottom — and,
  // being Base UI, it works inside the Base UI dialogs this sits in, where a
  // hand-portalled list would be outside the modal and could not be pressed.
  return (
    <div className={`relative ${className}`}>
      <Popover
        open={open}
        onOpenChange={(next) => setOpen(disabled ? false : next)}
        align={align === "right" ? "end" : "start"}
        label={ariaLabel}
        className={`${wideMenu ? "w-[max(var(--anchor-width),18rem)]" : "w-[max(var(--anchor-width),15rem)]"} max-h-[var(--available-height)] overflow-y-auto overscroll-contain rounded-[8px] p-1`}
        style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
        trigger={trigger}
      >
        {listbox}
      </Popover>
    </div>
  );
}

/** Filled arrow — Lovable ArrowLeftMediumIcon. */
export function ArrowLeftMediumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M10.7075 6.2935C10.317 5.90298 9.68398 5.90298 9.29346 6.2935L4.29346 11.2935C4.10592 11.481 4.00049 11.7353 4.00049 12.0005C4.00049 12.2658 4.10592 12.52 4.29346 12.7076L9.29346 17.7076C9.68398 18.0981 10.317 18.0981 10.7075 17.7076C11.098 17.317 11.098 16.684 10.7075 16.2935L7.41455 13.0005H19.0005C19.5528 13.0005 20.0005 12.5528 20.0005 12.0005C20.0005 11.4482 19.5528 11.0005 19.0005 11.0005H7.41455L10.7075 7.70757C11.098 7.31704 11.098 6.68403 10.7075 6.2935Z"
      />
    </svg>
  );
}
