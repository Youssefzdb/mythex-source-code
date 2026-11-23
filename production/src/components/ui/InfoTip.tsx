import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { CARD_BG, floatingRing } from "../../lib/surfaces";

/**
 * An ⓘ that explains the thing beside it — on hover with a mouse, and on tap
 * on a phone, where there is no hover (a tooltip alone left the Cloud credits
 * unreachable there).
 */
export function InfoTip({
  label,
  children,
  testId,
  width = "max-w-[280px]",
}: {
  /** Accessible name of the ⓘ. */
  label: string;
  children: ReactNode;
  testId?: string;
  width?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={100}
        render={
          <button
            type="button"
            aria-label={label}
            data-testid={testId ? `${testId}-button` : undefined}
            className="inline-grid size-5 shrink-0 place-items-center rounded-full text-current opacity-80 transition hover:bg-white/[0.08] hover:opacity-100"
          >
            <Info className="size-3.5" />
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={6} collisionPadding={8} className="z-[100]">
          <Popover.Popup
            data-testid={testId}
            className={`mx-popup ${width} rounded-[10px] px-3 py-2 text-[13px] font-normal leading-snug text-fg outline-none`}
            style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
