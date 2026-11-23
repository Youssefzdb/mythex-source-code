import { plural } from "../plural";

/**
 * Inviting friends and the partner program: the sidebar's Share card, the
 * "Share Mythex" dialog and its terms, Settings → Referrals (invite link and
 * the partner dashboard) and the Referrals row in Account settings. Keys are
 * camelCase, grouped by screen.
 */
export default {
  /** The sidebar card that opens the share dialog. */
  card: {
    title: "Share Mythex",
    subtitle: plural({ one: "{n} credit per paid referral", other: "{n} credits per paid referral" }),
  },

  /** The "Share Mythex" dialog. */
  share: {
    label: "Share Mythex",
    title: plural({ one: "Earn {n} credit per friend", other: "Earn {n} credits per friend" }),
    /** {invitee} and {referrer} are credit amounts. */
    body: "Give friends {invitee} extra credits. Get {referrer} when they first upgrade to Pro or Business.",
    loadFailed: "Couldn't load your link. Close this and try again.",
    copyFailed: "Couldn't copy the link. Select it and copy it instead.",
    linkLabel: "Your invite link",
    whatsapp: "Share on WhatsApp",
    x: "Share on X",
    linkedin: "Share on LinkedIn",
    email: "Send by email",
    showQr: "Show QR code",
    hideQr: "Hide QR code",
    qr: "QR code",
    terms: "Terms and conditions",
    /** The text sent with the link on WhatsApp, X and email. */
    message: plural({
      one: "Build apps with me on Mythex. Sign up with my link and get {n} extra credit.",
      other: "Build apps with me on Mythex. Sign up with my link and get {n} extra credits.",
    }),
    emailSubject: "Join me on Mythex",
    /** Who the invite is from when the account has no name. */
    aFriend: "a friend",
  },

  /** The invite card at the top of the dialog. */
  inviteCard: {
    credits: plural({ one: "+{n} credit", other: "+{n} credits" }),
    invited: "You're invited",
    by: "by {name}",
  },

  /** The dialog's terms view. */
  terms: {
    title: "How invites work",
    friendGets: plural({
      one: "Your friend gets {n} credit when they create a new Mythex account through your link within 60 days of opening it.",
      other: "Your friend gets {n} credits when they create a new Mythex account through your link within 60 days of opening it.",
    }),
    youGet: plural({
      one: "You get {n} credit the first time they pay for Pro or Business. We email you when it happens.",
      other: "You get {n} credits the first time they pay for Pro or Business. We email you when it happens.",
    }),
    newOnly: "Only new accounts count: an account that already exists can't be added to your invites, and you can't invite yourself.",
    once: "Each invited account rewards you once, on its first Pro or Business payment.",
    expiry: "Referral credits last 12 months, like top-ups.",
    noLimit:
      "There's no limit on how many people you invite. Please share with people who'd use Mythex, not in bulk or with made-up accounts: we may withhold rewards or turn off a link that's being misused.",
    changes: "We may change or end this program at any time.",
    partners: "Building for clients? The <partners>partner program</partners> pays a commission instead. Full rules: <docs>Invite friends</docs>.",
  },

  /** Settings → Referrals, for everyone. */
  page: {
    inviteTitle: "Invite friends",
    partnerTitle: "Partner",
    partnerSubtitle: "Your partner link, the clients who signed up through it, and what you've earned.",
    /** {invitee} and {referrer} are credit amounts. */
    inviteSubtitle: "Share your link. Friends get {invitee} credits when they sign up, and you get {referrer} when they first upgrade to Pro or Business.",
    loadingSubtitle: "Share your link and earn credits.",
    loadFailed: "Couldn't load this page.",
    yourLink: "Your invite link",
    yourInvites: "Your invites",
    signedUp: "Signed up",
    upgraded: "Upgraded",
    creditsEarned: "Credits earned",
    howItWorks: "How it works",
    stepShare: "Share your link",
    stepShareBody: "Send it to friends, or post it anywhere.",
    stepTheyGet: plural({ one: "They get {n} credit", other: "They get {n} credits" }),
    stepTheyGetBody: "When they create a Mythex account through your link.",
    stepYouGet: plural({ one: "You get {n} credit", other: "You get {n} credits" }),
    stepYouGetBody: "When they first pay for Pro or Business. Referral credits last 12 months.",
    partnerCta: "Build websites or apps for clients? <partners>Join the partner program</partners> and earn a commission instead.",
  },

  /** Settings → Referrals, the partner dashboard. */
  partner: {
    tracks: { agency: "Agency", expert: "Expert" },
    paused: "Your partnership is paused, so new payments from your clients don't earn a commission. Contact support@mythex.ai.",
    /** {track} is Agency or Expert; {needs} and {plan} are plan names. */
    planTooLow: "The {track} track needs your own {needs} plan (you're on {plan}). Until you upgrade, new payments from your clients don't earn a commission.",
    linkTitle: "Your partner link",
    linkDescription: "{track} partner: {businessPct}% of Business payments from your clients, for each client's first {months} months.",
    linkDescriptionEnterprise:
      "{track} partner: {businessPct}% of Business and {enterprisePct}% of Enterprise payments from your clients, for each client's first {months} months.",
    earnings: "Earnings",
    /** {n} is days; {amount} is money, already formatted ("$50.00"). */
    earningsDescription: plural({
      one: "A commission can be paid {n} day after the payment. We pay out by PayPal or Wise once you have at least {amount} to collect.",
      other: "A commission can be paid {n} days after the payment. We pay out by PayPal or Wise once you have at least {amount} to collect.",
    }),
    waiting: "Waiting",
    waitingHint: plural({ one: "Under {n} day old", other: "Under {n} days old" }),
    toBePaid: "To be paid",
    nextPayout: "In the next payout",
    fromAmount: "From {amount}",
    paid: "Paid",
    payingClients: "Paying clients",
    /** {clicks} is "12 clicks". */
    signupsAndClicks: "{signups} signed up · {clicks}",
    clicks: plural({ one: "{n} click", other: "{n} clicks" }),
    payoutTitle: "Payout details",
    payoutDescription: "Where we send your money.",
    paypalEmail: "PayPal email",
    wiseEmail: "Wise email",
    saved: "Payout details saved",
    invalidEmail: "Enter a valid email",
    saveFailed: "Couldn't save. Try again.",
    commissions: "Commissions",
    noCommissions: "Nothing yet. You earn when a client you referred pays for Business.",
    noCommissionsEnterprise: "Nothing yet. You earn when a client you referred pays for Business or Enterprise.",
    aClient: "A client",
    /** {amount} is money, already formatted. */
    rateOf: "{pct}% of {amount}",
    status: { pending: "Waiting", payable: "To be paid", paid: "Paid", void: "Not earned" },
    voidReasons: {
      partner_plan: "Your plan was below the one your track needs",
      partner_paused: "Your partnership was paused",
      refunded: "Refunded",
    },
    clients: "Clients",
    clientsDescription: "Accounts that signed up through your link.",
    noClients: "No sign-ups yet. Share your link with clients.",
    signedUpOn: "signed up {date}",
    payouts: "Payouts",
    otherMethod: "Other",
    terms: "Partner terms",
    questions: "Questions? {email}",
  },

  /** Account settings → Referrals. */
  account: {
    title: "Referrals",
    /** {invitee} and {referrer} are credit amounts. */
    description: "Friends get {invitee} credits when they sign up with your link; you get {referrer} when they first upgrade.",
    row: "Invite friends",
    rowValue: "Your link, and who signed up and upgraded",
  },
};
