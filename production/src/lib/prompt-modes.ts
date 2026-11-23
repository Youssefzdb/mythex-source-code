/** Shared prompt composer modes / model tiers (kept out of PromptBar for lighter imports). */
import { appT } from "../i18n/app";

export type PromptBuildMode = "build" | "plan" | "ask";

/** Branded Mythex agent tiers (vendor names stay hidden). */
export type MythexModelTier = "mythex-lite" | "mythex-max";

type ModeOption<Id extends string> = { id: Id; label: string; description: string };

/**
 * An option whose words are looked up when read, not when this module loads,
 * so the lists below follow the app's language (a constant would freeze the
 * English). The ids never change.
 */
function option<Id extends string>(id: Id, key: keyof ReturnType<typeof appT>["chat"]["modes"]): ModeOption<Id> {
  return {
    id,
    get label() {
      return appT().chat.modes[key].label;
    },
    get description() {
      return appT().chat.modes[key].description;
    },
  };
}

export const MYTHEX_MODEL_TIERS: Array<ModeOption<MythexModelTier>> = [
  option("mythex-lite", "standard"),
  option("mythex-max", "pro"),
];

export const DEFAULT_MYTHEX_MODEL_TIER: MythexModelTier = "mythex-lite";
export const MYTHEX_MODEL_STORAGE_KEY = "mythex.agentModel";

export function parseMythexModelTier(_raw?: string | null): MythexModelTier {
  return DEFAULT_MYTHEX_MODEL_TIER;
}

const BUILD_MODES: Array<ModeOption<PromptBuildMode>> = [option("build", "build"), option("plan", "plan")];

/** Build / Plan only (dashboard / marketing default). */
export const BUILD_PROMPT_MODES = BUILD_MODES;

/** Workspace chat — Build / Plan / Ask. */
export const CHAT_PROMPT_MODES: Array<ModeOption<PromptBuildMode>> = [...BUILD_MODES, option("ask", "ask")];
