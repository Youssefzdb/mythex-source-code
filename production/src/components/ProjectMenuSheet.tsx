import { type ReactNode } from "react";
import { isPaidPlan } from "../lib/plan-tiers";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Code2,
  Database,
  Gauge,
  Download,
  ExternalLink,
  GitBranch,
  HardDrive,
  KeyRound,
  MessageSquarePlus,
  RefreshCw,
  Settings2,
  Share2,
  Upload,
  Zap,
  Smartphone,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { canBuyPlans } from "../lib/native";
import { CARD_BG, FG_SECONDARY, FG_TERTIARY, SHELL_BG } from "../lib/surfaces";
import { formatCredits } from "../lib/tokens";
import { CREDIT_BAR, useCreditMeter } from "../lib/credit-meter";
import { useUpgrade } from "../lib/upgrade";
import type { SettingsTab } from "./SettingsDialog";
import { ModalSurface, SurfaceScroll } from "./ui/Sheet";
import { fill, useT } from "../i18n/app";

/**
 * The project's menu on a phone: what the project name in the chat header
 * opens, as a bottom sheet — Lovable's, measured (its sheet at 32px corners on
 * the card colour, a credits card, Share and Publish as two tiles, then 44px
 * rows of 16px text with a 20px icon).
 *
 * Everything the phone's header no longer carries lives here: the chat's own
 * actions, the app's, and the project's settings.
 */
export function ProjectMenuSheet({
  open,
  onClose,
  hasApp,
  view,
  isPublishing,
  openPreviewUrl,
  onShare,
  onPublish,
  onNewChat,
  onHistory,
  onToggleCode,
  onRefresh,
  onSettings,
  paidByMe,
}: {
  /** False in a teammate's workspace: their plan pays, so no upgrade offer here. */
  paidByMe?: boolean;
  open: boolean;
  onClose: () => void;
  hasApp: boolean;
  view: "preview" | "code";
  isPublishing: boolean;
  openPreviewUrl: string | null;
  onShare: () => void;
  onPublish: () => void;
  onNewChat: () => void;
  onHistory: () => void;
  onToggleCode: () => void;
  onRefresh: () => void;
  onSettings: (tab: SettingsTab) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const openUpgrade = useUpgrade();
  const { balance, pct } = useCreditMeter(user);
  // Each row closes the sheet and then does its thing, so what it opens (a
  // sheet of its own, a dialog) is not stacked on this one.
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      label={t.shell.projectMenu.label}
      sheet
      // Its rows run longer than a phone: grown to the usual 85% it reached
      // the status bar. Capped lower, the rest scrolls.
      sheetHeight="70dvh"
      zIndex={70}
      testId="project-menu-sheet"
      className="rounded-t-[32px]!"
      style={{ background: CARD_BG }}
    >
      <SurfaceScroll className="native-safe-bottom px-5 pt-3 pb-4">
        {/* Credits, as the drawer's workspace card shows them: the balance,
            the month's bar and when the daily ones come back. Tapping it goes
            to the plans (billing's plans section on Pro, the plans dialog otherwise) where this build
            sells them. */}
        <button
          type="button"
          onClick={pick(() => {
            if (!canBuyPlans()) return;
            if (isPaidPlan(user?.plan)) navigate("/billing?highlight=plans");
            else openUpgrade("plans");
          })}
          data-testid="project-menu-credits"
          className="press block w-full rounded-[12px] p-4 text-start"
          style={{ background: "oklch(0.3 0.002 107)", boxShadow: "0 0 0 0.5px rgb(119 119 113 / 0.4)" }}
        >
          <span className="flex items-center justify-between">
            <span className="text-[16px] font-[480] text-fg">{t.shell.credits.title}</span>
            <span className="flex items-center gap-0.5 text-[16px]" style={{ color: FG_TERTIARY }}>
              {fill(t.shell.credits.left, { credits: formatCredits(balance) })}
              {canBuyPlans() && <ChevronRight className="size-4 rtl:-scale-x-100" />}
            </span>
          </span>
          <span className="mt-3 block h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: CREDIT_BAR }} />
          </span>
          <span className="mt-2.5 flex items-center gap-1.5 text-[12px]" style={{ color: FG_TERTIARY }}>
            <span className="inline-block size-1.5 shrink-0 rounded-full bg-white/35" />
            {t.shell.credits.dailyReset}
          </span>
        </button>

        {/* Free, where this build sells: the way up, under the balance it is about. */}
        {!isPaidPlan(user?.plan) && canBuyPlans() && paidByMe !== false && (
          <button
            type="button"
            onClick={pick(() => openUpgrade("plans"))}
            data-testid="project-menu-upgrade"
            className="btn-upgrade press mt-3 h-11! w-full rounded-[12px]! text-[16px]! font-[480]!"
          >
            <Zap className="size-4 shrink-0 fill-current" strokeWidth={1.5} aria-hidden />
            {t.common.upgradeToPro}
          </button>
        )}

        {hasApp && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Tile icon={<Share2 />} label={t.common.share} onClick={pick(onShare)} />
            <Tile
              icon={<Upload />}
              label={isPublishing ? t.shell.projectMenu.publishing : t.shell.projectMenu.publish}
              onClick={pick(onPublish)}
              testId="project-menu-publish"
            />
          </div>
        )}

        <div className="-mx-3 mt-3">
          <Row icon={<MessageSquarePlus />} onClick={pick(onNewChat)}>
            {t.shell.projectMenu.newChat}
          </Row>
          <Row icon={<Clock />} onClick={pick(onHistory)}>
            {t.shell.projectMenu.chatHistory}
          </Row>
          {hasApp && (
            <>
              <Row icon={<Code2 />} onClick={pick(onToggleCode)}>
                {view === "code" ? t.shell.projectMenu.viewApp : t.shell.projectMenu.viewCode}
              </Row>
              <Row icon={<RefreshCw />} onClick={pick(onRefresh)}>
                {t.shell.projectMenu.refreshApp}
              </Row>
              {openPreviewUrl && (
                <a
                  href={openPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onClose}
                  className="press flex h-11 w-full items-center gap-2 rounded-[12px] px-3 text-start text-[16px] text-fg"
                >
                  <RowIcon>
                    <ExternalLink />
                  </RowIcon>
                  {t.common.openInNewTab}
                </a>
              )}
            </>
          )}
        </div>

        <div className="my-3 border-t border-white/[0.08]" />

        <div className="-mx-3">
          <Row icon={<Settings2 />} onClick={pick(() => onSettings("general"))}>
            {t.common.settings}
          </Row>
          <Row icon={<Gauge />} onClick={pick(() => onSettings("usage"))}>
            {t.settings.project.usage}
          </Row>
          <Row icon={<BookOpen />} onClick={pick(() => onSettings("knowledge"))}>
            {t.shell.projectMenu.knowledge}
          </Row>
          <Row icon={<Database />} onClick={pick(() => onSettings("database"))}>
            {t.settings.project.database}
          </Row>
          <Row icon={<HardDrive />} onClick={pick(() => onSettings("storage"))}>
            {t.settings.project.fileStorage}
          </Row>
          <Row icon={<KeyRound />} onClick={pick(() => onSettings("secrets"))}>
            {t.shell.projectMenu.secrets}
          </Row>
          <Row icon={<GitBranch />} onClick={pick(() => onSettings("github"))}>
            GitHub
          </Row>
          <Row icon={<Download />} onClick={pick(() => onSettings("export"))}>
            {t.shell.projectMenu.export}
          </Row>
          <Row icon={<Smartphone />} onClick={pick(() => onSettings("mobile"))}>
            {t.publish.mobile.settingsTab}
          </Row>
        </div>
      </SurfaceScroll>
    </ModalSurface>
  );
}

function Tile({ icon, label, onClick, testId }: { icon: ReactNode; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="press flex h-20 flex-col items-center justify-center gap-2 rounded-[12px] p-3 text-[16px] font-[480] text-fg [&>svg]:size-5 [&>svg]:stroke-[1.5]"
      style={{ background: SHELL_BG }}
    >
      {icon}
      {label}
    </button>
  );
}

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center [&>svg]:size-5 [&>svg]:stroke-[1.5]" style={{ color: FG_SECONDARY }} aria-hidden>
      {children}
    </span>
  );
}

function Row({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex h-11 w-full items-center gap-2 rounded-[12px] px-3 text-start text-[16px] text-fg"
    >
      <RowIcon>{icon}</RowIcon>
      {children}
    </button>
  );
}
