import { plural } from "../plural";

/** English strings for the app's billing area. Keys are camelCase, grouped by screen. */
export default {
  /** A credit amount as formatCredits prints it (can be a fraction, e.g. "12.5"). */
  creditsAmount: "{credits} credits",
  percentOff: "{n}% off",
  openDocs: "Open docs",
  checkoutFailed: "Couldn't open checkout. Try again.",

  /** The chip beside a plan's name. */
  status: {
    current: "Current",
    canceling: "Canceling",
    trial: "Trial",
    trialDaysLeft: plural({ one: "Trial · {n}d left", other: "Trial · {n}d left" }),
  },

  /** Plan cards and the pricing constants they share (PricingPlans). */
  plans: {
    billingPeriod: "Billing period",
    monthly: "Monthly",
    yearly: "Yearly",
    twoMonthsFree: "2 months free",
    perMonth: "/ month",
    /** Keep the comma: the card shows the part after it on its own line. */
    perMonthBilledAnnually: "/ month, billed annually",
    billedAnnually: "billed annually",
    claimOffer: "Claim offer",
    startTrial: plural({ one: "Start {n}-day free trial", other: "Start {n}-day free trial" }),
    startWithPro: "Start with Pro",
    thenPerMonth: "Then ${price}/mo. Cancel anytime.",
    insteadOf: "${price}/mo instead of ${compare}. Cancel anytime.",
    thenInsteadOf: "Then ${price}/mo instead of ${compare}. Cancel anytime.",
    freeFeatures: [
      "No credit card needed",
      "5 credits/day (up to 30/mo)",
      "10 Cloud credits/mo for published apps",
      "Live preview + terminal",
      "View code (read-only)",
      "Unlimited projects",
      "In-app + email support",
    ],
    proFeatures: [
      "100 credits/mo + 5/day (up to 50/mo extra)",
      "20 Cloud credits/mo for published apps",
      "50% off hosting, databases & storage",
      "Unlimited workspace time",
      "Edit code, export & GitHub",
      "Custom domain",
      "Unlimited projects & publishes",
      "On-demand credit top-ups",
      "Priority support",
    ],
    enterpriseFeatures: [
      "Everything in Pro",
      "Volume-based credits",
      "Dedicated support + onboarding",
      "Dedicated workspace controls",
      "SSO & audit logs (roadmap)",
    ],
  },

  /** /billing */
  page: {
    title: "Plans & credit usage",
    subtitle: "Manage your subscription plan and credit balance.",
    loadFailed: "Couldn't load billing.",
    noStripeSubscription:
      "No Stripe subscription on this account. Upgrade via checkout, or email support@mythex.ai if you were granted Pro.",
    noActiveSubscription: "No active Stripe subscription to manage. Complete Pro checkout first.",
    portalFailed: "Couldn't open billing settings. Try again.",
    trialEndsOn: "Your Pro trial ends {date}. Then you'll be charged your plan price — cancel anytime before then.",
    trialActive: "Your Pro trial is active. Then you'll be charged your plan price — cancel anytime before then.",
    cancelingThrough: "{plan} stays active through {date}. After that you return to Free.",
    cancelingThroughTrial:
      "{plan} stays active through {date}. After that you return to Free and unused trial credits are removed.",
    cancelingThroughPeriod:
      "{plan} stays active through the end of your billing period. After that you return to Free.",
    cancelingThroughPeriodTrial:
      "{plan} stays active through the end of your billing period. After that you return to Free and unused trial credits are removed.",
    changesOn: "Changes to {plan} on {date}.",
    includedUsage: "Usage included with your plan",
    dailyCredits: "Daily credits",
    dailyLeft: "{credits} left",
    resetsMidnight: "Resets at midnight UTC",
    dailyTipFree: "Free credits for building only (up to {cap}/month)",
    dailyTipPro: "Extra credits for building only (up to {cap}/month)",
    cloudCredits: "Cloud credits",
    cloudLeft: "{credits} left",
    cloudFor: "For your published apps' database, hosting and file storage. Resets on the 1st.",
    cloudThen: "After that, Cloud uses your other credits.",
    cloudOutFree: "Cloud credits used up — your published apps are paused until {date}.",
    cloudOutPro: "Out of credits — your published apps are paused. Buy credits to bring them back.",
    monthlyLeft: "{left} of {cap} left this month",
    creditBalance: "Credit balance <b>{credits} credits</b>",
    oneBalance: "Monthly and bought credits. Building uses them after the daily credits, Cloud after its monthly ones.",
    addCredits: "Add credits",
    upgradePlan: "Upgrade plan",
    manageResume: "Manage / resume",
    manageSubscription: "Manage subscription",
    usage: "Usage",
    moreUsageDetails: "More usage details",
    chartCredits: "Credits",
    last30Days: "Last 30 days: <b>{credits} credits</b>",
    noUsage30Days: "No usage in the last 30 days.",
    changePlan: "Change your plan",
    freeDescription: "Discover what Mythex can do for you — build and preview apps at no cost.",
    currentPlan: "Current plan",
    downgradeToFree: "Downgrade to Free",
    proDescription:
      "Designed for builders shipping real products — more credits, code edit/export, and a custom domain.",
    proTrialCanceled: "Trial canceled. Pro stays through {date}, then Free — unused trial credits are removed.",
    proTrialActive: "Free trial active through {date}. Then ${price}/mo (or your yearly plan).",
    proActiveThrough: "Active through {date}. Then you return to Free.",
    freeCustomDomain: "Free custom domain",
    until: "Until {date}",
    trialUntil: "Trial until {date}",
    onTrial: "On trial",
    enterpriseName: "Enterprise",
    enterpriseDescription: "Scale, governance, and dedicated support for large orgs.",
    enterprisePrice: "Custom",
    bookDemo: "Book a demo",
    enterpriseNote: "For additional or custom enterprise functionality, contact our team directly.",
    chargedInUsd: "Charged in USD at checkout.",
    cancelInStripe: "<cancel>Cancel anytime</cancel> in Stripe — {plan} stays active until period end.",
    cancelAfterUpgrade: "Cancel anytime after upgrading via Stripe checkout.",
    paymentsByStripe: "Payments handled securely by Stripe.",
    adminTitle: "Admin — simulate purchase",
    adminDescription:
      "Grants Pro or test credits with no Stripe charge, and fires Checkout + Purchase pixel events.",
    adminSimulating: "Simulating…",
    adminSimulatePro: "Simulate Pro purchase",
    adminSimulateTopUp: "Simulate credit top-up",
    adminSimulatedPro: "Simulated Pro purchase — Purchase pixel sent (no Stripe charge).",
    adminSimulatedTopUp: "Simulated top-up — Purchase pixel sent (no Stripe charge).",
    adminSimulateFailed: "Admin simulate purchase failed.",
  },

  /** /billing/usage */
  usage: {
    loadFailed: "Couldn't load usage.",
    backToPlans: "Back to plans",
    title: "Usage details",
    subtitle: "Detailed breakdown of credit usage across projects.",
    inLastDays: plural({ one: "in last {n} day", other: "in last {n} days" }),
    creditType: "Credit type",
    filterByProject: "Filter by project",
    projects: "Projects",
    dateRange: "Date range",
    allCredits: "All credits",
    allCreditsHint: "Build and run usage combined.",
    buildCredits: "Build credits",
    buildCreditsHint: "The agent and your workspace.",
    runCredits: "Cloud credits",
    runCreditsHint: "Your published apps' database, hosting and file storage.",
    last30Days: "Last 30 days",
    last30DaysHint: "Recent credit usage.",
    last90Days: "Last 90 days",
    last90DaysHint: "Longer usage window.",
    allProjects: "All projects",
    allProjectsHint: "Show every project.",
    build: "Build",
    run: "Cloud",
    searchProjects: "Search projects…",
    project: "Project",
    usageSorted: "Usage ↓",
    noMatches: "No projects match.",
    // Where credits went, by what used them.
    category: "Category",
    allCategories: "Everything",
    allCategoriesHint: "The agent and your apps, together.",
    catAgent: "Agent",
    catAgentHint: "Building and editing with the agent.",
    catWorkspace: "Workspace",
    catWorkspaceHint: "Your project's workspace while it's awake.",
    catDatabase: "Database",
    catDatabaseHint: "Your published app's database while it's awake.",
    catHosting: "Hosting",
    catHostingHint: "Your published app's server and the data it sends.",
    catStorage: "File storage",
    catStorageHint: "Files your app keeps, and their downloads.",
    unitsAgent: plural({ one: "{n} reply", other: "{n} replies" }),
    unitsWorkspace: "{hours} h awake",
    unitsDatabase: "{hours} compute-hours",
    unitsHosting: "{hours} server-hours · {mb} sent",
    unitsStorage: "{mb} stored · {downloaded} downloaded",
    openProjectUsage: "Open this project's usage",
  },

  autoReload: {
    title: "Auto-reload",
    description: "Buy credits automatically before you run out, so builds and published apps don't stop.",
    cardDeclined:
      "Your card was declined, so auto-reload is off. Update your payment method in Stripe, then switch it back on.",
    authenticationRequired:
      "Your bank wanted to confirm the payment, which we can't do while you're away. Try a different payment method, then switch auto-reload back on.",
    noCard: "There's no payment method to charge, so auto-reload is off.",
    addCardFirst: "Add a card first.",
    capBelowPack: "The monthly limit has to cover at least one pack.",
    saveFailed: "Couldn't save. Try again.",
    stripeFailed: "Couldn't open Stripe. Try again.",
    addPaymentMethodHint: "Add a payment method to turn this on.",
    addPaymentMethod: "Add payment method",
    whenBelow: "When my balance drops below",
    buy: "Buy",
    currently: "credits — currently {credits}",
    perReload: "credits — {price} per reload",
    neverSpendMore: "Never spend more than",
    perMonthAcross: "per month, across every automatic top-up",
    spentThisMonth: "{spent} of {cap} used this month",
    spentThisMonthPaused: "{spent} of {cap} used this month — auto-reload is paused until next month",
    paymentMethod: "Payment method",
    default: "Default",
    chargedWhenBelow: "Charged {price} for {credits} credits when you drop below {threshold}",
    usedForSubscription: "Used for your subscription and any automatic top-ups",
    manageInStripe: "Manage in Stripe",
  },

  topUp: {
    title: "Add credits",
    packPrice: "$15 per {credits} credits · valid 12 months",
    availableOnPro: "Available on Pro — buy packs anytime",
    balance: "Balance <b>{credits} credits</b>",
    claimToPurchase: "Claim 30% off Pro to purchase credit packs.",
    proRequired: "Claim the Pro offer to buy credits.",
    fewerPacks: "Fewer packs",
    morePacks: "More packs",
    buy: "Buy {credits} · ${price}",
  },

  trialOffer: {
    title: plural({ one: "Try Pro free for {n} day", other: "Try Pro free for {n} days" }),
    startTrial: "Start trial",
    dismiss: "Dismiss offer",
  },

  celebration: {
    welcomeToPro: "Welcome to Pro",
    creditsAdded: "Credits added",
    /** {credits}: the plan's monthly credits, formatted. */
    proReady: "{credits} credits/mo and 5/day are ready.",
    packAdded: "Your pack is in your account — keep building.",
    balance: "Balance <b>{credits} credits</b>",
    startBuilding: "Start building",
  },

  shell: {
    openMenu: "Open menu",
    openSidebar: "Open sidebar",
  },

  /**
   * The billing page inside the iPhone and Android apps, where plans and
   * credits are bought through the phone's store. {store} is appStore or
   * googlePlay; prices ({price}) come from the store, already formatted.
   */
  store: {
    appStore: "App Store",
    googlePlay: "Google Play",
    /** After a store price on a yearly plan card. */
    perYear: "/ year",
    /** Under the current plan, when it was bought in the app. */
    billedBy: "Billed by {store}",
    manage: "Manage in {store}",
    /** Apple and Google require this beside the plans. {account}: appleAccount or googleAccount. */
    renewsNotice:
      "Plans renew automatically each month or year at the price shown, charged to your {account}, unless you cancel at least 24 hours before the period ends. Manage or cancel any time in your {store} settings.",
    appleAccount: "Apple Account",
    googleAccount: "Google account",
    terms: "Terms of Use",
    privacy: "Privacy Policy",
    restore: "Restore purchases",
    restored: plural({ one: "Restored {n} purchase.", other: "Restored {n} purchases." }),
    nothingToRestore: "There were no purchases to restore.",
    /** The plan was bought with a card on the website: changing it happens there. */
    boughtElsewhere: "Your plan was bought outside the app, so it's changed or cancelled there.",
    /** The pack button with the store's price. */
    buy: "Buy {credits} · {price}",
    pending: "Your payment is pending. Your plan starts as soon as it goes through.",
    /** The store charged, but our server hasn't confirmed it yet. */
    notConfirmed: "Payment received — it's on its way to your account. If it isn't there in a few minutes, tap Restore purchases.",
    failed: "The purchase didn't go through. Try again.",
    unavailable: "Purchases aren't available right now. Try again later.",
    /** The phone's Apple/Google account already pays for Mythex, on another Mythex account. {account}: appleAccount or googleAccount. */
    otherAccountTitle: "Already subscribed on another account",
    otherAccount:
      "This {account} already pays for a Mythex plan on another Mythex account. Sign in to that account to change it, or use a different {account} on this phone.",
    /** On the website, for a plan bought in the app. */
    billedInApp: "Your plan is billed by {store}. Change or cancel it in the Mythex app on your phone.",
  },
};
