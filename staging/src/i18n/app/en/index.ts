/**
 * The app's English strings, one file per area. The source of truth: every
 * other language is typed against this, so a missing key fails the build.
 */
import common from "./common";
import shell from "./shell";
import auth from "./auth";
import settings from "./settings";
import domains from "./domains";
import billing from "./billing";
import chat from "./chat";
import tools from "./tools";
import workspace from "./workspace";
import publish from "./publish";
import thread from "./thread";
import plans from "./plans";
import teams from "./teams";
import referrals from "./referrals";
import security from "./security";

export const appEn = { common, shell, auth, settings, domains, billing, chat, thread, tools, workspace, publish, plans, teams, referrals, security };

export type AppMessages = typeof appEn;
export type AppArea = keyof AppMessages;
