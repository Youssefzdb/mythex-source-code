/** English strings for the app's chat area. Keys are camelCase, grouped by screen. */
import { plural } from "../plural";

export default {
  /** The prompt composer (PromptBar, the chat's contenteditable, the home composer). */
  composer: {
    placeholder: "Ask Mythex to build…",
    placeholderDetails: "Add more optional details",
    placeholderFollowUp: "Add a follow-up…",
    placeholderRetry: "Refresh to retry the workspace…",
    placeholderStarting: "Starting workspace…",
    prompt: "Prompt",
    message: "Message",
    editingQueued: "Editing queued message",
    removeCommand: "Remove command",
    buildModeMenu: "Build mode",
    modeWithPro: "{mode}, Pro model",
    proModelLocked: "Pro model is available on the Pro plan. Click to upgrade.",
    plusMenu: "Add to this message",
    attach: "Attach",
    attachFiles: "Attach files or images",
    attachSoon: "Attach (coming soon)",
    attachNeedsCredits: "Add credits to attach files",
    createImage: "Create image",
    connectors: "Connectors",
    unlockTitle: "Unlock more features",
    unlockBody: "Attach files and images, apply themes, connect integrations, and more by logging in.",
    logIn: "Log in",
    voiceInput: "Voice input",
    voiceInputShortcut: "Voice input ({keys})",
    voiceNeedsCredits: "Add credits to use voice",
    voiceUnsupported: "Voice input isn’t supported in this browser",
    voiceUnsupportedTry: "Voice input isn’t supported in this browser. Try Chrome or Edge.",
    micDenied: "Microphone permission denied. Allow mic access and try again.",
    voiceCaptureFailed: "Couldn’t capture voice. Check your mic and try again.",
    voiceStartFailed: "Couldn’t start voice input. Try again.",
    discardRecording: "Discard recording",
    discard: "Discard",
    finishRecording: "Finish recording",
    stop: "Stop",
    stopping: "Stopping",
    stoppingEllipsis: "Stopping…",
    stopGenerating: "Stop generating",
  },
  /** Mode and model names in the composer's menu. Only the words; the ids stay. */
  modes: {
    build: { label: "Build", description: "Make changes directly" },
    plan: { label: "Plan", description: "Discuss before building" },
    ask: { label: "Ask", description: "Answer without editing code" },
    standard: { label: "Standard", description: "Everyday builds" },
    pro: { label: "Pro", description: "Complex coding" },
  },
  /** "Worked for 1m 30s", "Thought for 15s". */
  duration: {
    moment: "a moment",
    seconds: "{s}s",
    minutes: "{m}m",
    minutesSeconds: "{m}m {s}s",
    thinking: "Thinking",
    thoughtMoment: "Thought for a moment",
    thoughtFor: "Thought for {duration}",
  },
  attachments: {
    tooLarge: "{name} is over {mb} MB.",
    imageTooLarge: "{name} is over {mb} MB (the limit for images).",
    empty: "{name} is empty.",
    remove: "Remove {name}",
    preview: "Preview {name}",
    tooMany: plural({
      one: "You can attach up to {n} file per message.",
      other: "You can attach up to {n} files per message.",
    }),
  },
  /** The composer's shelf: credits, the trial, notifications. */
  shelf: {
    notice: "Notice",
    dismiss: "Dismiss",
  },
  credits: {
    out: "You're out of credits",
    monthUsed: "You've used this month's {cap} free credits",
    left: plural({ one: "{credits} credit left", other: "{credits} credits left" }),
    percentOff: "{percent}% off",
    seePlans: "See plans",
    buyCredits: "Buy credits",
    startTrial: "Start free trial",
  },
  /** Chat tabs and the history list. */
  tabs: {
    newChat: "New chat",
    subagent: "Subagent",
    plan: "Plan",
    closeTab: "Close tab",
    history: "Chat history",
    chats: "Chats",
    noChats: "No chats yet.",
    scrollForMore: "Scroll for more",
    openHint: "Open · double-click to open alongside",
    renameChat: "Rename chat",
    deleteChat: "Delete chat",
    deleteTitle: "Delete chat?",
    deleteBody: "“{title}” and its messages can’t be recovered.",
    emptyTitle: "No open chats",
    emptyBody: "Every chat in this project is closed. Start one, or reopen an old chat from history — nothing was deleted.",
    openHistory: "Open history",
  },
  /** The chat panel: transcript, empty chat, restore and edit dialogs. */
  panel: {
    emptyTitle: "What do you want to build?",
    emptyBody: "Type an idea below — Mythex codes it, runs it, and shows it live in the preview.",
    loadingEarlier: "Loading earlier messages…",
    scrollForEarlier: "Scroll up for earlier messages",
    jumpToLatest: "Scroll to latest",
    workspaceNeedsCredits: "This workspace needs credits before it can start.",
    workspaceStartFailed: "Couldn't start the workspace. Try again in a moment.",
    restored: "Project restored to this checkpoint.",
    restoreFailed: "Restore failed.",
    restoreTitle: "Restore this checkpoint?",
    restoreBody:
      "Project files will roll back to how they were after this reply. Your chat history stays the same unless you edit and resend an earlier message.",
    restore: "Restore",
    discardTitle: "Discard later messages?",
    discardBody:
      "Editing this message will delete every message and code change that came after it. This can't be undone.",
    discardResend: "Discard & resend",
    secretsConfirmFailed: "Couldn't confirm secrets with the agent.",
    secretsSaveFailed: "Couldn't save secrets.",
    answersFailed: "Couldn't send your answers.",
    skipFailed: "Couldn't skip.",
  },
  starterIdeas: "Starter ideas",
  /** Starter prompts: sent to the agent as written, and it answers in the language they are in. */
  starters: {
    store: {
      title: "Online store",
      hint: "cart, Stripe checkout and orders",
      prompt:
        "Build an online store for a small coffee roaster with a product grid, product pages, a cart, and checkout with Stripe. Keep products and orders in a database and add an admin page to see orders. Warm, modern e-commerce look.",
    },
    photos: {
      title: "Photo sharing app",
      hint: "sign-ups, uploads and a feed",
      prompt:
        "Build a photo sharing app where people sign up, upload photos with a caption, and see everyone's photos in a feed. Store the images in file storage and the posts in a database. Add likes and a profile page per user. Clean, image-first design that works well on a phone.",
    },
    booking: {
      title: "Booking site",
      hint: "services, time slots and a staff view",
      prompt:
        "Build a booking site for a hair salon. Show services with prices and durations, let customers pick a stylist and an open time slot, and save bookings to a database so a slot can't be taken twice. Include a staff page with today's appointments. Elegant, calm design.",
    },
    taskBoard: {
      title: "Team task board",
      hint: "accounts and drag-and-drop columns",
      prompt:
        "Build a task board for a small team with accounts, projects, and To do / Doing / Done columns you can drag cards between. Tasks have an assignee, due date, and comments, all saved in a database. Focused, fast UI.",
    },
    logo: {
      title: "Design a logo",
      hint: "then use it across a new site",
      prompt:
        "Design a logo for a plant shop called Fernly — a few directions, then pick the strongest. Build a one-page site around it with the logo in the header and a color palette taken from it.",
    },
    illustrated: {
      title: "Illustrated landing",
      hint: "original art instead of stock photos",
      prompt:
        "Create a landing page for a meditation app called Still. Generate an original hero illustration and a matching image for each feature, in one consistent soft, painterly style. Include pricing, testimonials, and a waitlist form that saves emails to a database.",
    },
    recipes: {
      title: "Recipe blog",
      hint: "a generated photo for every dish",
      prompt:
        "Build a recipe blog with six Mediterranean recipes, each with ingredients, steps, cooking time, and a generated photo of the finished dish. Add search and category filters. Warm, magazine-style design.",
    },
    pictureBook: {
      title: "Picture book",
      hint: "a short story, illustrated page by page",
      prompt:
        "Write a short children's story about a fox who is afraid of the dark, and turn it into a picture book website: one page per scene, each with its own generated illustration in the same gentle watercolor style, and big buttons to turn the page.",
    },
    sheetDashboard: {
      title: "Sheet dashboard",
      hint: "charts from a spreadsheet you pick",
      prompt:
        "Connect my Google Sheets, read the spreadsheet I choose, and build a dashboard from its data: KPI cards, a trend chart, a breakdown by category, and a searchable table. Modern, data-dense but clean, with light and dark mode.",
    },
    notionSite: {
      title: "Notion to website",
      hint: "turn your notes into a real site",
      prompt:
        "Connect my Notion, read the page I point you to, and turn it into a polished website with its own navigation, good typography, and a section for each heading. Keep my wording.",
    },
    repoPage: {
      title: "Page for my repo",
      hint: "a landing page from a GitHub README",
      prompt:
        "Connect my GitHub, read the README and recent releases of the repo I name, and build a landing page for the project: what it does, install steps with copyable code, features, and a changelog. Developer-friendly dark design.",
    },
    roadmap: {
      title: "Public roadmap",
      hint: "from your Linear issues",
      prompt:
        "Connect my Linear, read the open issues in the team I choose, and build a public roadmap page grouped into Now / Next / Later, with a short summary of each item. Friendly, clear design.",
    },
    screenshot: {
      title: "Recreate a screenshot",
      hint: "attach any design, get working code",
      prompt:
        "I'm attaching a screenshot of a design. Rebuild it as a working, responsive page that matches the layout, spacing, and colors as closely as you can, with real interactions where they make sense.",
    },
    redesign: {
      title: "Redesign a website",
      hint: "paste a link, get a fresh take",
      prompt:
        "Look at the website at [paste a link], keep its content, and redesign it as a modern, fast, mobile-friendly site. Tell me what you changed and why.",
    },
    research: {
      title: "Research, then build",
      hint: "a page backed by real sources",
      prompt:
        "Research the five most popular note-taking apps — pricing, key features, and who each is for — and build a comparison site with a feature table, a card per app, and links to your sources.",
    },
    clone: {
      title: "Clone an app I love",
      hint: "the core of it, your own version",
      prompt:
        "Build my own version of a Trello-style board: boards, lists, and cards I can drag around, with card details and labels. Accounts and everything saved in a database.",
    },
  },
};
