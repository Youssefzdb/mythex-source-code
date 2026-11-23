/**
 * The creator program — the whole partner program for now, at /partners: YouTubers, X, TikTok and Instagram
 * creators, newsletters, podcasts and blogs who share Mythex with their
 * audience. Laid out as Lovable's affiliates page. English only until the
 * translations are approved; the Creators card on /partners and the creator
 * lines on the partner dashboard read from here too.
 *
 * The terms are the API's (apps/api/src/lib/referrals.ts): a flat $50 for
 * each person whose first paid plan is Pro, $100 for Business or Enterprise,
 * once per person (30% of that payment until 2026-10-28);
 * payable 30 days after each payment; paid out from $50 by PayPal or Wise;
 * a link holds for 60 days from the click.
 */
const creators = {
  metaTitle: "Mythex Creator Program — Earn $50 to $100 per New Subscriber",
  metaDescription:
    "Share Mythex with your audience and earn $50 for every person who subscribes to Pro and $100 for Business or Enterprise. Apply in a few minutes.",
  eyebrow: "Creator program",
  title: "Creator\npartners",
  lead: "Earn $50 to $100 for every new subscriber",
  body: "Share Mythex with your audience. When someone you send subscribes, you earn $50 for Pro and $100 for Business or Enterprise.",
  join: "Apply now",
  alreadyIn: "Already a partner? Open your dashboard",
  featuresTitle: "Everything you need to earn with Mythex",
  features: [
    {
      title: "$50 to $100 per subscriber",
      body: "$50 for every person you bring who subscribes to Pro, $100 for Business or Enterprise, once per person.",
    },
    {
      title: "A quick review",
      body: "Apply in a few minutes. We reply within 5 working days and email you your link.",
    },
    {
      title: "A live dashboard",
      body: "Clicks, sign-ups, paying referrals and what you've earned each month, in your Mythex settings.",
    },
    {
      title: "60 days to decide",
      body: "Anyone who opens your link and signs up within 60 days is yours, even if they don't sign up that day.",
    },
    {
      title: "Monthly payouts",
      body: "Paid by PayPal or Wise once you have $50 to collect. Each commission can be paid 30 days after the payment it comes from.",
    },
    {
      title: "A real person to talk to",
      body: "Planning a video or a post about Mythex? Email us and the team will help with walkthroughs and answers.",
    },
  ],
  whoTitle: "Made for people with an audience",
  who: ["YouTube", "X", "TikTok", "Instagram", "LinkedIn", "Newsletters", "Podcasts", "Blogs", "Courses and communities"],
  stepsTitle: "How it works",
  stepsBody: "Apply once, then share and earn.",
  steps: [
    { title: "Apply", body: "Tell us where you share and who follows you. It takes a few minutes." },
    { title: "Get approved", body: "We reply within 5 working days and email you your link. Your dashboard is in Settings." },
    { title: "Share", body: "Put it in your videos, posts, newsletter or bio, wherever your audience is." },
    { title: "Earn", body: "$50 for every new Pro subscriber, $100 for Business or Enterprise." },
  ],
  faqTitle: "Questions",
  faq: [
    {
      q: "Who can join?",
      a: "Anyone who shares things with an audience: YouTubers, creators on X, TikTok, Instagram and LinkedIn, newsletter writers, podcasters, bloggers and course or community owners. There's no minimum audience.",
    },
    {
      q: "What exactly do I earn?",
      a: "$50 for each person you bring who subscribes to Pro, and $100 for Business or Enterprise, monthly or yearly, once per person. It's a fixed amount, whatever the plan cost them, as long as their payment isn't refunded.",
    },
    {
      q: "Do I need a paid plan?",
      a: "No. A free Mythex account is all you need. Apply with the same email, so we can set you up when you're approved.",
    },
    {
      q: "When and how do I get paid?",
      a: "Each commission can be paid 30 days after the payment it comes from, in case of a refund. We pay out by PayPal or Wise once you have at least $50 to collect. Add your payout details in your dashboard.",
    },
    {
      q: "How is a sign-up tied to me?",
      a: "Anyone who opens your link and creates a Mythex account within 60 days is tied to you, once. You can't earn on your own account.",
    },
    // Experts and Agencies are off for now (2026-10-15); uncomment to bring them back.
    // {
    //   q: "I run an agency or build apps for clients.",
    //   a: "The partner program is made for that: a direct line to our team and commission on your clients' Business and Enterprise plans.",
    // },
  ],
  agencyLink: "See the partner program",
  readyTitle: "Start earning with Mythex",
  readyBody: "Apply now. It takes a few minutes, and we reply within 5 working days.",
  rules: "Share honestly: no spam and no misleading claims about Mythex. Commission stops on fraud.",
  terms: "Read the full terms",
  /** /partners, in the partner hub's design, while the program is for creators only. */
  hub: {
    title: "Become a Mythex partner",
    body: "For YouTubers, creators, newsletters and podcasts. Share Mythex with your audience and earn $50 to $100 for every new subscriber you bring.",
    apply: "Apply now",
    discoverLabel: "Creator program",
    discoverTitle: "Everything you need to earn with Mythex",
    note: "Commission-only: no plan of your own needed, and we reply to every application within 5 working days.",
  },
  /** The card on /partners (next to Experts and Agencies when they're open). */
  hubCard: {
    name: "Creators",
    who: "Any audience size",
    body: "YouTubers, creators, newsletters and podcasts who share Mythex with their audience.",
    points: ["$50 per new Pro subscriber, $100 per Business", "Your own dashboard: sign-ups, earnings, payouts"],
    cta: "Become a creator partner",
  },
  /** The short creator application on /partners (CreatorApplyForm); fields marked optional, the rest required. */
  shortForm: {
    title: "Apply to the creator program",
    name: "Name",
    note: "Anything else? (optional)",
    notePlaceholder: "Where else you share, what you'd make about Mythex…",
    consent: "By applying you agree we can contact you about the creator program.",
  },
  /** The application form, set to Creator (partner-apply-form.tsx). */
  form: {
    trackOption: "Creator — I share with an audience",
    email: "Email",
    emailPlaceholder: "you@example.com",
    jobTitlePlaceholder: "YouTuber, writer, podcaster…",
    company: "Channel or brand",
    companyPlaceholder: "Your channel, newsletter or podcast",
    website: "Your channel or main profile",
    websitePlaceholder: "youtube.com/@you",
    companySize: "Audience size",
    companySizePlaceholder: "Choose a size",
    sizes: { "<1k": "Under 1,000", "1k-10k": "1,000–10,000", "10k-100k": "10,000–100,000", "100k-1m": "100,000–1 million", "1m+": "Over 1 million" },
    description: "Where do you share, and what about?",
    descriptionPlaceholder: "Your platforms, your topics and who follows you.",
    goals: "How would you share Mythex?",
    goalsPlaceholder: "A video, a post, a newsletter issue…",
    doneNext: "If you're approved, we'll email you your partner link, and your dashboard will be in your account menu under Partner dashboard.",
  },
  /** The creator lines on the partner dashboard (Settings → Referrals). */
  dashboard: {
    linkDescription: "Creator partner: $50 for every person you bring who subscribes to Pro, $100 for Business or Enterprise.",
    /** A commission line's detail: a flat amount, not a percentage of the payment. */
    flatOf: "Flat amount · on a {amount} payment",
    noCommissions: "No commissions yet. When someone you sent pays for any plan, it shows here.",
    welcome: "You're a Mythex creator partner. Share your link below to start earning.",
  },
  /** Every partner's badge and deal, on their dashboard; the account menu's link to it. English for now. */
  partnerUi: {
    menuLink: "Partner dashboard",
    /** The dashboard lists' pager: "11–20 of 34". */
    pageOf: "{from}–{to} of {total}",
    previous: "Previous",
    /** Under the invite link (Settings → Referrals), pointing creators to the program. */
    referralCta: "Have an audience? <partners>Join the creator program</partners> and earn $50 to $100 for every new subscriber you bring.",
    /** /settings/partner for someone who isn't a partner. */
    notPartner: "You're not in the creator program yet.",
    apply: "Apply at mythex.ai/partners",
    /** The Solutions menu's line under "Partners" while the program is for creators only (English for every language until translated). */
    menuHint: "Creators: earn $50 to $100 per new subscriber",
    /** A commission held for a check before it can be paid (API lib/partner-checks.ts). */
    underReview: "Under review",
    badge: { expert: "Expert partner", agency: "Agency partner", creator: "Creator partner" },
    deal: {
      expert: "10% of your clients' Business and Enterprise payments · each client's first 12 months · keep your Pro plan",
      agency: "10% of Business and 20% of Enterprise payments · each client's first 12 months · keep your Business plan",
      creator: "$50 per new Pro subscriber, $100 per Business or Enterprise · once per person · no plan needed",
    },
  },
  chartTitle: "Last 12 months",
  chartSignups: "Sign-ups",
  chartEarned: "Earned",
};

export type CreatorsCopy = typeof creators;
export default creators;
