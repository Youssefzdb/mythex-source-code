/** English strings for the app's thread area. Keys are camelCase, grouped by screen. */
import { plural } from "../plural";
export default {
  userMessage: {
    previewImage: "Preview {name}",
    retryLoadImage: "Retry loading {name}",
    removeAttachment: "Remove {name}",
    copyMessage: "Copy message",
    editMessage: "Edit message",
  },
  helperBanner: {
    dismiss: "Dismiss",
  },
  queue: {
    queued: plural({ one: "{n} Queued", other: "{n} Queued" }),
    sendNow: "Send now",
    removeFromQueue: "Remove from queue",
  },
  questions: {
    title: "Questions",
    position: "{current} of {total}",
    previous: "Previous",
    customPlaceholder: "Type your own answer…",
    skip: "Skip",
  },
  switchToPlan: {
    title: "Plan Mode",
    defaultReason: "This looks like a planning request — switch to Plan mode to create a plan.",
    switch: "Switch",
  },
  toasts: {
    workspaceNotReady: "Give the workspace a moment to get ready, then attach files.",
    tooManyAttachments: "You can attach up to {max} files per message.",
    uploadFailed: "Couldn't upload {name}.",
    stopUnreachable: "Couldn't reach the agent to stop it. It may keep running — try again.",
    stopUnreachableRetrySoon: "Couldn't reach the agent to stop it. Try again in a moment.",
    stillFinishingBuild: "Still finishing the previous turn. Try Build again in a moment.",
    runStillStopping: "The current run is still stopping. Try again in a moment.",
    stillStoppingPrevious: "Still stopping the previous run. Try again in a moment.",
    chatStartFailed: "Couldn't start the chat. Try again.",
    requestRefused: "This request can't be processed.",
    offlineMessageRestored: "You're offline. Your message is back in the composer — send it when you're connected.",
    unreachableMessageRestored: "Couldn't reach Mythex. Your message is back in the composer — try again.",
    turnStartFailed: "Couldn't start the turn. Try again.",
    editPrepareFailed: "Couldn't prepare the edit. Try again.",
    switchToPlanFailed: "Couldn't switch to Plan mode.",
    skipModeSwitchFailed: "Couldn't skip mode switch.",
    planReadFailed: "Couldn't read the plan file.",
    outOfTokensTopUp: "Build stopped early — this turn used your available token budget. Top up to keep going.",
    outOfTokens: "Build stopped early — this turn used your available token budget.",
  },
  turnErrors: {
    unfinished: "That turn didn't finish. You can try again.",
    wallTimeout: "This build was stopped because it ran too long. Send another message to continue from where it left off.",
    outOfCredits: "This build was stopped early — you're out of credits for this turn. Upgrade or buy credits to keep going.",
  },
  buildTitle: "Build",
};
