/**
 * English: the source catalog every other language translates.
 *
 * Keep values plain strings. `{name}` placeholders are filled with `fill()`;
 * translations must keep them. "Mythex" is never translated. Other catalogs
 * are typed as `Messages`, so a missing or extra key fails the build.
 */
import plans from "../app/en/plans";

export const en = {
  /** /download: the Mythex app for iPhone and Android (DownloadPage). English-only until settled. */
  download: {
    eyebrow: "Mythex for iPhone and Android",
    title: "Build from anywhere.",
    subtitle:
      "Describe an app on your phone, watch it come together, and get a notification the moment it's ready. Everything stays in sync with mythex.ai.",
    appStoreSmall: "Download on the",
    appStore: "App Store",
    playSmall: "Get it on",
    play: "Google Play",
    featuresTitle: "Everything you build, in your pocket",
    f1Title: "Build by chatting",
    f1Body: "Type or speak what you want. The agent writes the code and shows a live preview right on your phone.",
    f2Title: "Know when it's done",
    f2Body: "Leave the app while it builds. A notification tells you the moment your changes are ready to see.",
    f3Title: "Publish and share",
    f3Body: "Put your app online and share the link, or turn it into an iPhone and Android app, without a computer.",
    sameAccount: "Same account, same projects and credits on the web and in the app.",
    footer: "Download the app",
    metaTitle: "Download the Mythex App for iPhone and Android",
    metaDescription:
      "Get the Mythex app on the App Store and Google Play. Build apps by chatting from your phone, get notified when they're ready, and publish without a computer.",
  },
  /** The header's Solutions menu (pages: pages/marketing/solutions). */
  /** Sign-up through a friend's invite link (lib/referral.ts). */
  referral: {
    invited: "You were invited: you'll get {n} bonus credits when you sign up.",
  },
  solutionsMenu: {
    label: "Solutions",
    whoFor: "Who is it for?",
    useCases: "Use cases",
    back: "Back",
    closeMenu: "Close menu",
    items: {
      forWork: { label: "For work", hint: "Software your team runs on" },
      founders: { label: "Founders", hint: "Ship before you pitch" },
      productManagers: { label: "Product managers", hint: "Prototype, don't spec" },
      designers: { label: "Designers", hint: "Your designs, working" },
      marketers: { label: "Marketers", hint: "Launch pages in minutes" },
      sales: { label: "Sales", hint: "Build the demo live" },
      ops: { label: "Ops", hint: "Tools that fit your process" },
      people: { label: "People", hint: "HR tools your team uses" },
      websites: { label: "Websites", hint: "From idea to live site" },
      prototyping: { label: "Prototyping", hint: "A working version in an hour" },
      internalTools: { label: "Internal tools", hint: "Built for your team" },
    },
    partners: { label: "Partners", hint: "Agencies and experts: build for clients, earn" },
    students: { label: "Students", hint: "50% off Pro" },
  },
  meta: {
    homeTitle: "Mythex — AI App & Website Builder | Build Apps by Chatting",
    homeDescription:
      "Build web apps, websites, and Android & iPhone apps by chatting with AI. Live preview, real database, one-click publish — no coding needed.",
    pricingTitle: "Mythex Pricing — Free, Pro and Enterprise Plans",
    pricingDescription:
      "Mythex pricing: start free with daily credits, or go Pro for more credits, code editing, export, GitHub and a custom domain. One balance for building and hosting.",
    faqTitle: "Mythex FAQ — Credits, Publishing and Ownership",
    faqDescription: "Straight answers about Mythex: credits, plans, publishing, memory, connectors and who owns what you build.",
    aboutTitle: "About Mythex — Build Apps by Chatting with AI",
    aboutDescription:
      "Mythex helps you create apps and websites by chatting with AI: live preview, a real workspace with code and database, and one-click publish.",
    useCasesTitle: "Mythex Use Cases — Startups, Internal Tools, Agencies",
    useCasesDescription:
      "How founders, teams, agencies and small businesses use Mythex to go from an idea to a running app or website.",
    guidesTitle: "Guides — Build Apps and Websites with AI | Mythex",
    guidesDescription:
      "Practical guides to building apps and websites with AI: how to build them, what things cost, tool comparisons, and how to take a project to production.",
    blogTitle: "The Mythex Blog — Engineering and Product Notes",
    blogDescription:
      "How Mythex is built and run: engineering write-ups on what broke and how we fixed it, and notes on what's new in the product.",
  },
  nav: {
    menu: "Menu",
    howItWorks: "How it works",
    templates: "Templates",
    whyMythex: "Why Mythex",
    pricing: "Pricing",
    faq: "FAQ",
    docs: "Docs",
    logIn: "Log in",
    getStarted: "Get started",
    goHome: "Go to homepage",
    toggleMenu: "Toggle navigation menu",
    openMythex: "Open Mythex",
  },
  footer: {
    product: "Product",
    resources: "Resources",
    getStartedHeading: "Get started",
    company: "Company",
    useCases: "Use cases",
    buildWithAi: "Build with AI",
    compare: "Compare",
    guides: "Guides",
    blog: "Blog",
    quickstart: "Quickstart",
    promptingTips: "Prompting tips",
    signUp: "Sign up",
    signIn: "Sign in",
    about: "About",
    support: "Support",
    privacy: "Privacy",
    terms: "Terms",
    acceptableUse: "Acceptable use",
    language: "Language",
    home: "Mythex home",
    madeIn: "Made in Dubai, UAE · 60+ languages",
    aiAppBuilder: "AI App Builder",
    aiWebsiteBuilder: "AI Website Builder",
    noCodeAppBuilder: "No-Code App Builder",
    aiMobileAppBuilder: "AI Mobile App Builder",
    clientPortalBuilder: "Client Portal Builder",
    internalToolBuilder: "Internal Tool Builder",
    aiCrmBuilder: "AI CRM Builder",
    arabicAppBuilder: "Arabic AI App Builder",
    glossary: "Glossary",
    freeTools: "Free tools",
  },
  home: {
    heroTitle: "Build something Mythex",
    heroSubtitle: "Create apps and websites by chatting with AI",
    typewriterPrefix: "Ask Mythex to create ",
    typewriterWords: "a landing page for my…|a blog about…|a web app that…|a prototype…|an internal tool that…|a dashboard to…",
    typewriterWordsMobile: "a landing page…|a blog…|a web app…|a prototype…|an internal tool…|a dashboard…",
    statsTitle: "Mythex",
    statsTitleAccent: "at a glance",
    statsSubtitle: "A full workspace in the browser — describe an app, watch it run, ship it live",
    stat1: "private workspace for every project",
    stat2Value: "Live",
    stat2: "watch your app appear as AI builds it",
    stat3Value: "1-click",
    stat3: "publish to a public URL when you’re ready",
    ctaEyebrow: "AI App Builder",
    ctaTitle: "Ready to build?",
    projectLimit: "Your plan allows {limit} projects. Upgrade to Pro for more.",
    createFailed: "Couldn't create the project. Try again.",
  },
  meet: {
    sceneYourApp: "Your app",
    sceneReady: "Ready",
    scenePublish: "Publish",
    sceneLive: "Live",
    title: "How Mythex works",
    step1Title: "Just describe your idea",
    step1Body: "Say what you want in your own words — Mythex understands and starts building right away",
    step1Headline: "What do you want to build?",
    step2Title: "See it come together",
    step2Body: "Sit back while Mythex builds your app — you’ll see each step land as it happens",
    step2Headline: "Building your app",
    step3Title: "Publish with one click",
    step3Body: "When it looks right, hit Publish and share a public Mythex URL with anyone",
    step3Headline: "One click to go live",
    scenePrompt: "A customer dashboard with charts and auth…",
    scenePromptMobile: "A customer dashboard with charts…",
    stage1: "Understanding your idea",
    stage2: "Designing the screens",
    stage3: "Wiring the flows",
    stage4: "Your app is ready to try",
    composerPlaceholder: "Ask Mythex to build…",
    working: "Mythex is working",
    readyToPublish: "Ready to publish",
    getPublicLink: "Get a public link",
    liveOnWeb: "Live on the web",
    starting: "Starting your project…",
    previewUpdating: "Live preview updating…",
  },
  examples: {
    title: "Discover",
    titleAccent: "templates",
    subtitle: "Start your next project with a template",
    viewAll: "View all",
    viewAllTemplates: "View all templates →",
  },
  /** The featured template cards on the landing page (the template pages themselves are English for now). */
  templateCards: {
    "waitlist-landing-page": { title: "Waitlist Landing Page", tagline: "Countdown, live counter, lead admin" },
    "italian-restaurant-website": { title: "Italian Restaurant Website", tagline: "Filterable menu with dish detail pages" },
    "barbershop-booking-website": { title: "Barbershop Booking Website", tagline: "Multi-step booking with photo gallery" },
    "sales-pipeline-crm": { title: "Sales Pipeline CRM", tagline: "Drag-and-drop deals with forecasting" },
    "saas-landing-page": { title: "SaaS Landing Page", tagline: "Hero, features, pricing, FAQ, testimonials" },
    "analytics-dashboard": { title: "Analytics Dashboard", tagline: "KPI cards, charts, and activity table" },
    "ecommerce-store": { title: "Ecommerce Store", tagline: "Product grid, cart drawer, and checkout" },
    "portfolio-website": { title: "Portfolio Website", tagline: "Hero, projects, about, and contact" },
  },
  /** Template category labels, shown on every template card. */
  templateSubcategories: {
    Portfolio: "Portfolio",
    SaaS: "SaaS",
    Blog: "Blog",
    Ecommerce: "Ecommerce",
    Dashboards: "Dashboards",
    Booking: "Booking",
    Landing: "Landing",
    "Internal Tools": "Internal Tools",
    Music: "Music",
    Wedding: "Wedding",
    News: "News",
    Education: "Education",
    Health: "Health",
    Finance: "Finance",
    Other: "Other",
  },
  pricing: {
    title: "Pricing",
    subtitleTrial: "Start for free. Try Pro free for {days} days — then keep building at the sale price.",
    subtitleSale: "Start for free. Claim {percent}% off Pro.",
    billingPeriod: "Billing period",
    monthly: "Monthly",
    yearly: "Yearly",
    twoMonthsFree: "2 months free",
    /** Keep the comma: the card shows the part after it on a second line. */
    periodMonthAnnual: "/ month, billed annually",
    periodMonth: "/ month",
    percentOff: "{n}% off",
    thenPerMonth: "Then ${price}/mo. Cancel anytime.",
    insteadOf: "${price}/mo instead of ${compare}. Cancel anytime.",
    thenInsteadOf: "Then ${price}/mo instead of ${compare}. Cancel anytime.",
    freeName: "Free",
    freeDescription: "Discover what Mythex can do for you — build and preview apps at no cost.",
    getStarted: "Get started",
    proName: "Pro",
    proDescription: "Designed for builders shipping real products — more credits, code edit/export, and a custom domain.",
    freeCustomDomain: "Free custom domain",
    startTrial: "Start {days}-day free trial",
    startPro: "Start with Pro",
    claimOffer: "Claim offer",
    enterpriseName: "Enterprise",
    enterpriseDescription: "Scale, governance, and dedicated support for large orgs.",
    platformFee: "Platform fee",
    bookDemo: "Book a demo",
    enterpriseNote: "For additional or custom enterprise functionality, contact our team directly.",
    freeFeatures:
      "No credit card needed|5 credits/day (up to 30/mo)|10 Cloud credits/mo for published apps|Live preview + terminal|View code (read-only)|Unlimited projects|In-app + email support",
    proFeatures:
      "100 credits/mo + 5/day (up to 50/mo extra)|20 Cloud credits/mo for published apps|50% off hosting, databases & storage|Unlimited workspace time|Edit code, export & GitHub|Custom domain|Unlimited projects & publishes|On-demand credit top-ups|Priority support",
    enterpriseFeatures:
      "Everything in Pro|Volume-based credits|Dedicated support + onboarding|Dedicated workspace controls|SSO & audit logs (roadmap)",
  },
  faq: {
    title: "Frequently asked questions",
    subtitle: "Straight answers about Mythex, credits, publishing, and ownership.",
    items: [
      {
        q: "How is Mythex different from other AI builders?",
        a: "Mythex combines simple plain-language building with a real workspace — live preview, code, terminal, database, export, and one-click publish in one place. Side-by-side comparisons: https://docs.mythex.ai/introduction/compare",
      },
      {
        q: "What are credits?",
        a: "Credits power the AI builder, live sandboxes on Free (Pro includes sandbox time, including MCP from Claude/Cursor), and published apps — hosting, bandwidth, databases and file storage, which are paid first from monthly Cloud credits (10 on Free, 20 on Pro). Daily credits are for building: Free gets 10 credits on your first day, then 5/day (up to 30/mo). Pro includes 100 credits/mo plus 5/day (up to 50/mo extra), and can buy packs of 50 credits for $15. Unused daily credits expire at midnight UTC. If you used yesterday’s credits, we email you when today’s 5 are ready.",
      },
      {
        q: "Does Mythex remember my project and how I work?",
        a: "Yes. Mythex keeps short facts about you and how you like to work, and applies them in every project, so you are not re-explaining your business in each new chat. Projects and workspaces also carry standing knowledge notes (“prices are in JOD”, “never change the checkout”) that the agent follows. Ask “what do you know about me?” in any chat, and edit or switch it all off in Settings → Memory.",
      },
      {
        q: "Can Mythex make images for my app?",
        a: "Yes. Ask for a picture in chat — hero art, a background, an og:image, an illustration — and it is generated there, then placed in the app when you want it. Use /image or the + menu to start one directly.",
      },
      {
        q: "Can Mythex use my Gmail, Google Sheets or Slack?",
        a: "Yes, through Connectors. Link an account once in Connectors (no API key to copy) and then ask in plain language: build a dashboard from a sheet, email a form submission, post to a channel. You can also add any custom MCP server. Disconnecting revokes access immediately.",
      },
      {
        q: "Can I build from Claude or Cursor?",
        a: "Yes — Claude, Codex and Cursor. Connect Mythex MCP from Account settings (any plan can Connect). Sandbox tools need Pro, which includes sandbox time; Mythex credits pay for hosting, while the model is billed by that provider.",
      },
      {
        q: "What happens when I run out of credits?",
        a: "Chat pauses and a nudge appears above the input. Free Preview and terminal stay available. Free users can upgrade to Pro or wait for the next day’s credits; Pro users can buy more credits. Published apps pause when the balance hits zero (Free and Pro).",
      },
      {
        // Measured on prod: October 2026, 247 apps published on Free; median 0.17, 90th percentile ~2.1, 246 under 10 Cloud credits.
        q: "How long do the free Cloud credits keep my app online?",
        a: "For most small apps, the whole month. In October 2026, 9 in 10 apps published on Free used about 2 Cloud credits or less in the whole month, well under the 10 Free includes, and only 1 app in 247 used them all. A busy app uses more; on Pro, hosting, databases and storage cost half, and keep running on your plan credits once the Cloud credits are used.",
      },
      {
        q: "How much is Pro billed yearly?",
        a: "$20.83 a month, billed as $250 a year: 10 months' price, so 2 months are free. Billed monthly, Pro is $25 a month (30% off the regular $36). Both include 100 credits a month and no per-seat fees.",
      },
      {
        q: "What's included on Free vs Pro?",
        a: "Free: Preview, terminal, read-only code, capped daily credits, publish/hosting from the same credit balance (hard-pauses when empty), and database and file storage. Pro unlocks full code edit, project export, GitHub, credit top-ups, custom domains, and half-price hosting, databases & storage.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from billing settings. You keep Pro until the end of the billing period, then return to Free and are not charged again. Paid leftover credits stay.",
      },
      {
        q: "Do you charge per seat?",
        a: "No. Invite unlimited collaborators — pricing is based on credits, not seats.",
      },
    ],
  },
  about: {
    title: "About Mythex",
    subtitle: "Simple. Powerful. One place.",
    p1: "Mythex helps you create apps and websites by chatting with AI. Describe what you want; Mythex builds a working app you can try instantly — then publish with one click.",
    p2: "You do not have to choose between an easy AI builder and a real workspace. Mythex gives you both: live preview and publish for founders, plus code, terminal, database, export, and GitHub when you need control.",
    whoTitle: "Who it is for",
    whoBody:
      "Founders validating ideas, builders shipping internal tools, and teams that want a working product without wiring everything first. You do not need deep coding skills to start.",
    contactTitle: "Contact",
    support: "Support:",
    social: "Social:",
    createAccount: "Create a free account",
    orExplore: "or explore",
    howItWorks: "how Mythex works",
  },
  useCases: {
    title: "Use cases",
    subtitle: "Ways teams use Mythex to go from idea to running app.",
    items: [
      {
        title: "Startups & founders",
        body: "Turn a product idea into a working web app or landing page in hours. Iterate in chat, show investors a live URL, and keep ownership of the code.",
      },
      {
        title: "Internal tools",
        body: "Describe the dashboard or workflow your team needs. Mythex builds a working version you can try before wiring production systems.",
      },
      {
        title: "Agencies & freelancers",
        body: "Ship client prototypes faster: chat to build, preview live, then publish or hand off the project. Spend time on polish, not boilerplate.",
      },
      {
        title: "Small business websites",
        body: "Create a marketing site or simple storefront by describing your business. Publish when it looks right — no separate hosting setup required to start.",
      },
    ],
    readyToTry: "Ready to try?",
    signUpFree: "Sign up free",
    or: "or",
    comparePlans: "compare plans",
  },
  auth: {
    createAccount: "Create your account",
    welcomeBack: "Welcome back",
    continueGoogle: "Continue with Google",
    email: "Email",
    continue: "Continue",
    or: "or",
    haveAccount: "Already have an account?",
    noAccount: "Don't have an account?",
    logIn: "Log in",
    signUp: "Sign up",
    agreePrefix: "By continuing, you agree to the",
    termsOfService: "Terms of Service",
    and: "and",
    privacyPolicy: "Privacy Policy",
    dismiss: "Dismiss",
  },
  content: {
    breadcrumb: "Breadcrumb",
    guidesH1: "Guides",
    guidesIntro:
      "Practical, honest guides for people building software with AI — whether you're a founder, a small business, or a developer who wants to move faster.",
    blogH1: "Blog",
    blogIntro: "How we build and run Mythex — including the parts that went wrong — and what's new in the product.",
    all: "All",
    allCount: "All {n} →",
    minRead: "{n} min read",
    updated: "Updated {date}",
    questions: "Questions",
    keepReading: "Keep reading",
    onThisPage: "On this page",
    nothingYet: "Nothing here yet.",
    ctaTitle: "Build it with Mythex",
    ctaBody:
      "Describe what you want in plain words. Mythex writes the code, runs it in a live preview, adds a database when your app needs one, and publishes it to a real URL. You can start free.",
    ctaStart: "Start building free",
    ctaTemplates: "Browse templates",
    englishOnly: "This article is in English.",
    catBuild: "How to build",
    catBuildBlurb: "Step-by-step guides to building real apps and websites with AI, from the first prompt to a live URL.",
    catCompare: "Comparisons",
    catCompareBlurb:
      "AI app builders, coding tools and no-code platforms side by side — including when each one is the better pick.",
    catLearn: "Concepts explained",
    catLearnBlurb:
      "Plain-language explanations of the things you meet when you build software: databases, hosting, APIs, auth and more.",
    catBusiness: "Ideas and launching",
    catBusinessBlurb: "App ideas worth building, what software costs, and how to validate, price and launch it.",
    catCraft: "Prompting and shipping",
    catCraftBlurb: "Getting better results from an AI builder, and taking what it makes safely to production.",
    catEngineering: "Engineering",
    catEngineeringBlurb: "How Mythex is built and run, including what broke and how we fixed it.",
    catProduct: "Product",
    catProductBlurb: "What's new in Mythex and why we built it that way.",
    catCompany: "Company",
    catCompanyBlurb: "Notes from the team.",
  },
  /** The plan cards' copy: the app's own (i18n/app/<code>/plans.ts), so one translation serves the landing page and /billing. */
  plans,
  /**
   * The compare section on the landing page, /compare and each /compare page:
   * the feature grid (compare/compare-grid.ts, same order) and the measured
   * chart (compare/head-to-head.ts). Product names stay as they are.
   */
  compareVisuals: {
    heading: "Mythex vs the rest,",
    headingAccent: "side by side",
    subtitle:
      "What you get with Mythex that the most popular AI builders don't give you, and what we measured when we gave them all the same prompts.",
    rows: [
      "Your own app in both the App Store and Google Play",
      "Store page, screenshots and App Store review done for you",
      "Change your website and the phone app updates too",
      "Backends in any language: Python, Java, C#, Go and more",
      "1,700+ apps the AI can work with: Gmail, Slack, Notion, HubSpot…",
      "A database included in every project, nothing to connect",
      "Invite your whole team, no per-seat fees",
      "Help from the team, even on the free plan",
      "Use it in Arabic and 64 other languages",
    ],
    yes: "Yes",
    no: "No",
    checked: "Checked against each product's own site, docs and pricing in November 2026.",
    seeAll: "See every comparison",
    cheaperTitle: "More app for your money",
    fasterTitle: "Faster to a working app",
    than: "than {name}",
    upTo: "up to",
    onePageApp: "on a one-page app",
    method:
      "Our test on November 17, 2026: the same prompts, sent to each builder at the same moment. Cost is what each build actually used, at each builder's own credit price.",
    measuredAgainst: "Measured against {name}",
    stripCheaper: "cheaper to build the same app",
    stripFaster: "faster to a working app",
    stripMethod: "Our test on November 17, 2026: the same prompts, sent at the same moment.",
    seeComparison: "See the comparison",
    inShort: "In short",
    questions: "Questions",
    measuredHeading: "Measured: Mythex vs {name}",
    measuredIntro: "Same prompt, same moment, measured on each product's own usage page and build log.",
  },
  notFound: {
    title: "Page not found",
    body: "That URL is not a Mythex page. Try the home page or browse templates.",
    home: "Home",
    templates: "Templates",
  },
};

/** Every value widened to string, so translations type-check against English's keys. */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

/**
 * Keys still English-only while their feature is finished: a translation may
 * leave them out, and messagesFor fills them from English.
 */
type EnglishOnly = "solutionsMenu" | "referral";

/** A translation: every key but the English-only ones, which it may add. */
export type Messages = Widen<Omit<typeof en, EnglishOnly>> & Partial<Widen<Pick<typeof en, EnglishOnly>>>;
