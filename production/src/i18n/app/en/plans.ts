/**
 * Plans and credit tiers: the Pro, Business and Enterprise cards, the tier picker, and
 * changing plan on /billing. The marketing landing page shows the same cards,
 * so its catalog (i18n/messages/*.ts `plans`) points at this file too — one
 * translation serves both.
 *
 * Every plan line is checked against the code (apps/api/src/lib/plans.ts,
 * permissions.ts, credits.ts, sandbox-billing.ts; priority support is the team
 * inbox putting Enterprise, then Business, then Pro, first — apps/comms/src/http/inbox.ts) —
 * change one only with the code behind it.
 */
export default {
  businessName: "Business",
  businessDescription: "For growing teams: SSO, private projects, members-only apps and joining by company email.",
  /** The sidebar's plan line, beside shell.sidebar.proPlan. */
  businessPlan: "Business plan",
  enterpriseName: "Enterprise",
  enterpriseDescription: "For large organisations: governance, audit and dedicated support.",
  enterprisePlan: "Enterprise plan",
  /** The tag beside Enterprise's name. */
  addOnsAvailable: "Add-ons available",
  bookDemo: "Book a demo",
  /** Book a demo: the form at /enterprise/demo. */
  demo: {
    title: "Book a personalized demo",
    subtitle: "Meet our team to see how companies use Mythex Enterprise to build and ship faster, with the controls IT needs.",
    required: "* Required field",
    firstName: "First name",
    lastName: "Last name",
    email: "Work email",
    emailPlaceholder: "you@company.com",
    phone: "Phone number",
    phonePlaceholder: "+1 555 000 0000",
    website: "Company website",
    websitePlaceholder: "company.com",
    message: "What are you trying to solve with Mythex?",
    messagePlaceholder: "Our teams need internal tools without waiting on engineering…",
    submit: "Submit",
    errors: {
      required: "Fill in the fields marked *.",
      workEmail: "Use your work email, not a personal one.",
      invalid: "Check this field.",
      tooMany: "Too many requests from here. Try again in an hour.",
      failed: "Couldn't send it. Try again, or email support@mythex.ai.",
    },
    /** {name}: their first name. */
    doneTitle: "Thanks, {name}",
    /** {email}: the work email they gave. */
    doneBody: "We got your request. We'll email {email} within one business day to find a time.",
    backHome: "Back to Mythex",
  },

  /** "⚡ Business" beside something the plan doesn't include; a tap opens the plans. */
  badgeTitle: "See the {plan} plan",
  badgeAria: "{plan} plan — see plans",

  /** The tier dropdown on a paid card. {credits} is formatted, e.g. "1,200". */
  tierLabel: "Credits a month",
  tierSaves: "Save {percent}%",
  tierTrigger: "{credits} monthly credits",
  tierRow: "{credits} credits",
  /** After a row's price: "$42 /mo". */
  tierPerMonth: "/mo",
  /** Beside the plan's name on /billing. */
  creditsPerMonth: "{credits} credits/mo",

  billedYearly: "{total} billed yearly",
  switchTo: "Switch to this plan",
  upgradeTo: "Upgrade to {plan}",
  changeConfirmTitle: "Switch to {plan} · {credits} credits?",
  /** {price} is pricePerMonth or pricePerYear. */
  changeUp:
    "You'll pay the difference for what's left of this billing period now, and get the extra credits for that part of it right away. Then {price}.",
  changeDown:
    "No refund: this period keeps the credits you have. From your next renewal you'll pay {price} and get the new tier's credits.",
  pricePerMonth: "{price}/month",
  pricePerYear: "{price}/year",
  changed: "Plan changed.",
  changeFailed: "The plan couldn't be changed. Try again.",
  /** The card after a plan change or a top-up: what happened, and the next step. */
  result: {
    switchedTitle: "You're on {plan}",
    scheduledTitle: "{plan} starts at your next renewal",
    tierCredits: "{credits} credits",
    /** A move up that brought credits: {credits} added now, {tier} a month after. */
    addedNow: "<b>+{credits} credits</b> are in your balance now, for the rest of this billing period. Then {tier} credits every month.",
    /** Same credits, another plan (Pro 100 → Business 100). */
    sameCredits: "Its features are on now. Your credits stay the same: {tier} a month.",
    movedDown: "From your next renewal you'll pay {price} and get {tier} credits a month. The credits you have now stay yours.",
    declinedTitle: "Your card was declined",
    noCardTitle: "No card on your subscription",
    failedTitle: "Your plan didn't change",
    declinedBody: "Nothing was charged, and you're still on {plan}. Update your card, then try again.",
    noCardBody: "Nothing was charged, and you're still on {plan}. Add a card, then try again.",
    failedBody: "Nothing was charged, and you're still on {plan}. Try again in a moment.",
    updateCard: "Update card",
    addCard: "Add a card",
    tryAgain: "Try again",
    notNow: "Not now",
    checkoutTitle: "Checkout didn't open",
    checkoutBody: "Nothing was charged. Try again in a moment.",
  },
  trialing: "Changing plans opens once your trial ends.",
  /** Under the plan cards when you're on a paid plan; the tag is a button. */
  backToFree: "Want to go back to Free? <cancel>Cancel your subscription</cancel> — you keep your plan until the end of the period.",
  /** Under the upgrade dialog's Pro card, then comparePlans as a link to /billing. */
  moreUsage: "Need more credits, or team controls?",
  comparePlans: "Compare all plans",

  /** The two icon lines above each card's checklist. */
  highlights: {
    noCard: "No credit card needed",
    freeGrants: "Free grants",
    freeBuild: "10 credits to build on day one, then 5 a day (up to 30 a month)",
    freeCloud: "10 credits for Cloud (monthly)",
    unlimitedMembers: "Unlimited members",
    /** Pro and Business. */
    paidBuild: "5 credits to build (daily, up to 50 a month)",
    /** Pro and Business: Cloud credits are a fifth of the tier (20 at 100). */
    paidCloud: "{cloud} credits for Cloud (monthly)",
    volumePricing: "Volume-based pricing",
    /** Business and Enterprise: what the plan adds on top of its credits. {fee} is e.g. "$25". */
    planFee: "Pro’s credit price + {fee}/mo",
  },

  /** The checklists. The `*Includes` line comes first, in the plan colour. */
  freeFeatures: [
    "Up to 3 published apps",
    "mythex.app addresses, with a Mythex badge",
    "Live preview and terminal",
    "View code (read-only)",
    "Unlimited projects",
    "One workspace, unlimited collaborators",
    "In-app and email support",
  ],
  proIncludes: "All Free features",
  /** {credits} is the tier, formatted. */
  proFeatures: [
    "{credits} credits a month",
    "On-demand credit top-ups",
    "Unlimited published apps",
    "iPhone and Android apps",
    "Custom domains",
    "Remove the Mythex badge",
    "50% off hosting, databases and storage",
    "Unlimited workspace time",
    "Edit code, export and GitHub",
    "Unlimited workspaces",
  ],
  businessIncludes: "All Pro features",
  businessFeatures: [
    "{credits} credits a month",
    "Roles: Admin, Editor, Viewer",
    "Per-member credit limits",
    "Private projects",
    "Members-only apps (internal tools)",
    "Join by company email domain",
    "SSO with Google Workspace (Okta and SAML soon)",
    "Require two-factor sign-in",
    "Bigger servers for published apps (up to 4 CPUs, 8 GB)",
    "Top-priority support",
  ],
  enterpriseIncludes: "All Business features",
  /** {credits} is the tier, formatted (from 800). */
  enterpriseFeatures: [
    "{credits} credits a month",
    "Audit log, with filters by person, action and date",
    "Restrict who publishes: admins only, or approval",
    "Restrict who can invite",
    "Sharing controls: preview links and code downloads",
    "Dedicated support and onboarding",
  ],

  /** Under the plan cards: what an Enterprise contract can add. */
  addOns: {
    title: "Enterprise add-ons",
    subtitle: "Available on Enterprise plans with a custom contract.",
    groups: [
      { title: "Security & IT", items: ["Security questionnaire support", "Okta, Microsoft Entra and SAML sign-in"] },
      { title: "Expert services", items: ["Onboarding and architecture review", "Custom connector development"] },
      { title: "Support & billing", items: ["Support response-time SLAs", "Invoice billing", "Credit volume discounts"] },
    ],
  },
};
