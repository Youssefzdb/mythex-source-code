import { useT } from "../../i18n/app";

/**
 * A count on a tab or a row (join requests, approvals, invitations): a circle
 * for one digit, a pill for more, never past "99+", so a big number can't
 * stretch the tab it sits on. Amber when it's waiting on you.
 */
export function CountBadge({
  count,
  tone = "amber",
  label,
  className = "",
  testId,
}: {
  count: number;
  tone?: "amber" | "muted";
  /** Read out instead of the bare number ("3 join requests"). */
  label?: string;
  className?: string;
  testId?: string;
}) {
  const t = useT();
  const text = count > 99 ? "99+" : String(count);
  return (
    <span
      className={`inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-[5px] text-[11px] leading-none font-medium tabular-nums ${
        tone === "amber" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-fg-2"
      } ${className}`}
      aria-label={label ?? (count > 99 ? t.teams.pending.moreThan99 : undefined)}
      title={count > 99 ? (label ?? String(count)) : label}
      data-testid={testId}
    >
      {text}
    </span>
  );
}
