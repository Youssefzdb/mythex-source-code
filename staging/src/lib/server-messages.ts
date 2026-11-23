/**
 * The API answers some errors with a sentence in English ("Current password is
 * incorrect."), and the app shows it. This maps each of those exact sentences
 * to a key in the app's catalog, so the person reads it in their language.
 * A sentence not listed here is shown as the API wrote it.
 *
 * Source: the `message:` strings in apps/api/src/routes and lib. Add a line
 * here (and a key under common.server) when the API gains a new one.
 */
import { appT, type AppMessages } from "../i18n/app";

type ServerKey = keyof AppMessages["common"]["server"];

const BY_TEXT: Record<string, ServerKey> = {
  "Account unavailable.": "accountUnavailable",
  "App storage is available on the Pro plan.": "storagePro",
  "Connected apps are not enabled on this Mythex deployment.": "connectedAppsDisabled",
  "Could not reach that MCP server.": "mcpUnreachable",
  "Credit balance is empty.": "creditsEmpty",
  "Credit balance is empty. Buy credits or upgrade to wake a sandbox.": "creditsEmptySandbox",
  "Current password is incorrect.": "wrongPassword",
  "Databases are available on the Pro plan.": "databasePro",
  "Enable storage first (storage: true).": "enableStorageFirst",
  "Enter your current password to delete this account.": "passwordToDelete",
  "Exporting code is available on the Pro plan.": "exportPro",
  "Free Preview storage is limited to 1 GB. Upgrade to Pro for more.": "previewStorageLimit",
  "GitHub rejected that token.": "githubTokenRejected",
  "GitHub sync is available on the Pro plan.": "githubPro",
  "Max photo size is 2MB.": "photoTooLarge",
  "Max upload size is 25MB.": "uploadTooLarge",
  "Mythex is at capacity right now — try again in a moment.": "atCapacity",
  "Mythex site records can’t be deleted.": "recordNoDelete",
  "Mythex site records can’t be edited.": "recordNoEdit",
  "No memory with that id.": "memoryNotFound",
  "Object storage is not configured on this Mythex instance.": "storageNotConfigured",
  "Only the project owner can link GitHub.": "ownerGithubOnly",
  "Only the workspace owner can change this.": "ownerOnly",
  "Photo upload isn't available right now.": "photoUnavailable",
  "Please verify your email to start building.": "verifyEmail",
  "Project not found.": "projectNotFound",
  "This app's database is paused at its monthly limit. Raise the limit to publish.": "dbPausedLimit",
  "This app's database is paused because Cloud credits ran out. Add credits to publish.": "dbPausedCredits",
  "Your app's live database couldn't be updated to match development, so nothing was published. Your live app and its data are unchanged.": "dbSyncFailed",
  "Your database changes are different from the ones you confirmed, so nothing was published. Publish again to review them.": "dbChangesDiffer",
  "Publishing is available on the Pro plan.": "publishPro",
  "Session belongs to another user.": "sessionOtherUser",
  "Slug must be 2–40 chars: lowercase letters, numbers, dashes.": "slugRules",
  "Still publishing — this build is taking longer than usual.": "stillPublishing",
  "That looks like a password or key. Memories are not for secrets — keep those in project Secrets.": "memoryLooksSecret",
  "That server is already added.": "mcpAlreadyAdded",
  "This account has been suspended.": "accountSuspended",
  "This domain isn’t registered through Mythex. Transfer it at your current registrar.": "domainNotRegistered",
  "This project is suspended.": "projectSuspended",
  "This project is unavailable. Contact support.": "projectUnavailable",
  "This request violates our Acceptable Use Policy.": "policyBlocked",
  "Use a JPEG, PNG, WebP, or GIF image.": "photoType",
  "Your account signs in with Google.": "googleOnly",
  "Your workspace is still waking up — try again in a moment.": "workspaceWaking",
  "A memory can't be empty.": "memoryEmpty",
};

/** The API's message in the current language, or unchanged if we don't know it. */
export function localizeServerMessage(text: string): string {
  const key = BY_TEXT[text.trim()];
  return key ? appT().common.server[key] : text;
}
