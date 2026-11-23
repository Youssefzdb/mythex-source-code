import { plural } from "../plural";

/**
 * Workspaces as a team: Settings → Team (workspace, people, usage, approvals,
 * privacy & security, identity, audit log), a member's details, invites and
 * join requests, two-factor sign-in, SSO, members-only apps and private
 * projects. Keys are camelCase, grouped by screen.
 */
export default {
  /** A workspace role. */
  roles: { OWNER: "Owner", ADMIN: "Admin", EDITOR: "Editor", VIEWER: "Viewer" },
  /** Under a role in the role pickers. */
  roleHelp: {
    OWNER: "Billing and everything else.",
    ADMIN: "Members, limits, rules and domains.",
    EDITOR: "Builds and publishes.",
    VIEWER: "Opens projects and previews; can't change them.",
  },
  /** "you'll join as {role}" on an invite link's page. */
  roleWithArticle: { ADMIN: "an Admin", EDITOR: "an Editor", VIEWER: "a Viewer", other: "a member" },

  /** A credit amount, already formatted ("12.5"). */
  credits: "{credits} credits",
  saved: "Saved.",
  copied: "Copied.",
  linkCopied: "Link copied.",
  notSaved: "That couldn't be saved.",
  didntWork: "That didn't work.",
  didntWorkTryAgain: "That didn't work. Try again.",
  /** Sending a message past the monthly limit an admin set for you here. */
  memberLimitReached: plural({
    one: "You've used your {n} credit for this month in this workspace. Ask a workspace admin to raise your limit.",
    other: "You've used your {n} credits for this month in this workspace. Ask a workspace admin to raise your limit.",
  }),
  /** Sending a message in a teammate's workspace that has run out of credits. */
  workspaceOutOfCredits: "This workspace is out of credits. Ask the workspace owner to add credits or upgrade.",
  noOneMatches: "No one matches.",
  noLimit: "No limit",
  viewPlans: "View plans",
  turnOn: "Turn on",
  turnOff: "Turn off",
  adminOnly: "Only workspace admins can see this page.",

  /** Settings → Team, the page around the tabs. */
  page: {
    title: "Team",
    subtitle: "Members, roles, spending limits and workspace rules.",
    backToSettings: "Back to settings",
    workspace: "Workspace",
    loadFailed: "Couldn't load this workspace.",
    owner: "Owner: {name}",
    you: "· You: {role}",
    tabs: {
      workspace: "Workspace",
      people: "People",
      usage: "Usage",
      approvals: "Approvals",
      privacy: "Privacy & security",
      identity: "Identity",
      audit: "Audit log",
    },
    /** A tab the plan doesn't include. */
    lockedApprovals: "Approve publishes before they go live",
    lockedApprovalsBody: "Let Editors ask before publishing, and approve or decline here — or keep publishing to admins only.",
    lockedIdentity: "Manage identity and SSO",
    lockedIdentityBody:
      "Claim your company's email domain, let your team join with it, and sign in with Google Workspace. Okta, Microsoft Entra and other SAML providers are coming soon.",
    lockedAudit: "Track every change in your workspace",
    lockedAuditBody: "Review membership changes, publishes, settings and security events in one audit trail — who did what, and when.",
  },

  /** Team → Usage: who spent it. */
  usage: {
    billedTo: "Billed to {name}, the workspace owner.",
    person: "Person",
    creditsLastDays: plural({ one: "Credits, last {n} day", other: "Credits, last {n} days" }),
    lastActive: "last active {date}",
    unassigned: "Not tied to a person",
    unassignedHint: "Published apps (database, hosting, storage)",
    nothingYet: "Nothing spent yet this month.",
    /** Billing → Usage's switch between the two lists. */
    showBy: "Show usage by",
    peopleTab: "People · {n}",
    projectsTab: "Projects · {n}",
    searchPeople: "Search people...",
  },

  /** Team → Approvals: publishes waiting on an admin. */
  approvals: {
    hintOn: "Editors ask before publishing; an admin approves here or from the email.",
    hintOff: "In Privacy & security, set Who can publish to “Editors ask, an admin approves”, and Editors ask before publishing.",
    empty: "No publishes waiting.",
    /** {project} is a link to it. */
    wantsToPublish: "{name} wants to publish {project}",
    approve: "Approve and publish",
    decline: "Decline",
    approved: "Approved. It's publishing now.",
    declined: "Declined. They've been told by email.",
    publishFailed: "Approved, but publishing failed. Open the project to publish it.",
  },

  /** Team → Identity: single sign-on. */
  sso: {
    title: "Single sign-on (SSO)",
    help: "Members sign in through your company's identity provider: Google Workspace today, Okta, Microsoft Entra and other SAML providers soon. Needs the company domain set above.",
    upsell: "SSO comes with Business.",
    unavailable: "SSO isn't available yet. Contact support to turn it on.",
    needsDomain: "Set your company's email domain above first.",
    needsVerified: "Verify your company domain above first.",
    onFor: "On for people at @{domain}. They sign in with their company account.",
    on: "On",
    googleHint: "People at your domain sign in with their Google Workspace account. Nothing to set up in Google.",
    samlLabel: "Okta, Microsoft Entra, any SAML",
    samlHint: "Connect your identity provider in a guided setup.",
    samlSoon: "Coming soon — contact us to set it up.",
    setup: "Set up SSO",
    manage: "Open SSO settings",
    require: "Require SSO for this workspace",
    requireHint: "Members who signed in another way are asked to sign in with SSO to open this workspace.",
    remove: "Turn off SSO",
    removeTitle: "Turn off SSO?",
    removeBody: "Members sign in with email or Google again, and SSO is no longer required.",
    setupFailed: "SSO setup couldn't start.",
    removeFailed: "SSO couldn't be turned off.",
    googleOn: "Google Workspace sign-in is on.",
    googleFailed: "Google Workspace sign-in couldn't be turned on.",
  },

  /** Team → Audit log. */
  audit: {
    hint: "Who did what in this workspace.",
    empty: "Nothing recorded yet.",
    upsell: "The audit log comes with Enterprise.",
    loadMore: "Load more",
    /** Matching events, top right: "128 events". */
    results: plural({ one: "{n} event", other: "{n} events" }),
    filterAction: "Filter by action",
    filterActor: "Filter by person",
    filterRange: "Time range",
    allActions: "All actions",
    allPeople: "All people",
    range: {
      last7: "Last 7 days",
      last30: "Last 30 days",
      last90: "Last 90 days",
      thisMonth: "This month",
      lastMonth: "Last month",
      all: "All time",
    },
    searchResources: "Search projects and people…",
    clearFilters: "Clear filters",
    noMatches: "No events match these filters.",
    /** An expanded event's rows. */
    when: "When",
    who: "Who",
    resource: "Affected",
    /** Beside the person in an expanded event: filter the log to them. */
    onlyThem: "Only this person",
    /** An invitation's detail: "ana@acme.com as Editor". */
    emailAsRole: "{email} as {role}",
    /** A limit or role that wasn't set: "none → Admin". */
    none: "none",
    /** After the person's name, by the API's action code. */
    actions: {
      "workspace.created": "created the workspace",
      "workspace.settings_changed": "changed workspace rules",
      "workspace.transferred": "transferred ownership",
      "workspace.deleted": "deleted the workspace",
      "workspace.restored": "restored the workspace",
      "member.invite_link_created": "created an invite link",
      "member.invite_link_revoked": "revoked an invite link",
      "member.join_requested": "asked to join",
      "member.join_approved": "approved a join request",
      "member.join_denied": "declined a join request",
      "member.invited": "invited a member",
      "member.invite_revoked": "revoked an invitation",
      "member.joined": "joined",
      "member.left": "left",
      "member.removed": "removed a member",
      "member.role_changed": "changed a role",
      "member.limit_changed": "changed a spending limit",
      "project.published": "published a project",
      "project.unpublished": "unpublished a project",
      "project.deleted": "deleted a project",
      "project.visibility_changed": "changed who can see a project",
      "project.shared": "shared a project",
      "project.unshared": "stopped sharing a project",
      "publish.requested": "asked to publish",
      "publish.approved": "approved a publish",
      "publish.rejected": "declined a publish",
      "secrets.updated": "changed secrets",
      "database.connection_viewed": "viewed a database login",
      "domain.added": "added a domain",
      "domain.removed": "removed a domain",
      "sso.setup_started": "started SSO setup",
      "sso.removed": "turned off SSO",
      "sso.signed_in": "signed in with SSO",
    } as Record<string, string>,
  },

  /** Team → Workspace. */
  workspace: {
    avatarTooBig: "Max image size is 2MB.",
    avatarFailed: "The image couldn't be uploaded.",
    transferred: "Ownership transferred.",
    deleted: "{name} was deleted. You can restore it for 60 days from Team → Workspace.",
    restored: "Workspace restored.",
    restoreFailed: "It couldn't be restored.",
    profileTitle: "Workspace profile",
    profileDescription: "How this workspace appears on Mythex.",
    avatar: "Avatar",
    avatarHint: "Set a picture for your workspace.",
    changePictureAria: "Change workspace picture",
    uploadPictureAria: "Upload workspace picture",
    changePicture: "Change picture",
    uploadPicture: "Upload a picture",
    removePicture: "Remove picture",
    name: "Name",
    nameHint: "Your workspace's name, as members see it.",
    nameAria: "Workspace name",
    nameCount: "{count} / {max} characters",
    id: "Workspace ID",
    idHint: "Unique workspace identifier.",
    copyId: "Copy workspace ID",
    defaultsTitle: "Member defaults",
    defaultsDescription: "Defaults for people who join this workspace.",
    defaultLimit: "Default monthly member credit limit",
    defaultLimitHint: "The monthly credit limit new members start with. Empty means no limit.",
    accessTitle: "Workspace access",
    transfer: "Transfer ownership",
    transferHint: "Hand this workspace to an Admin. Its projects then bill to them; you stay as an Admin.",
    makeAdminFirst: "Make someone an Admin first.",
    newOwner: "New owner",
    chooseAdmin: "Choose an Admin",
    transferButton: "Transfer",
    leave: "Leave workspace",
    leaveHint: "You lose access to its projects. An admin can invite you back.",
    leaveButton: "Leave",
    personal: "Your personal workspace",
    personalHint: "It can't be transferred, left or deleted.",
    dangerZone: "Danger zone",
    delete: "Delete workspace",
    deleteHint: "Delete this workspace and all its projects. Members lose access right away. You can restore it for 60 days from this tab.",
    recentlyDeleted: "Recently deleted",
    recentlyDeletedDescription: "Workspaces you deleted. Restore one within 60 days.",
    /** A deleted workspace's line: "3 projects · restorable until Oct 3, 2026". */
    deletedLine: plural({ one: "{n} project · restorable until {date}", other: "{n} projects · restorable until {date}" }),
    restore: "Restore",
    transferTitle: "Make {name} the owner?",
    /** When the new owner's name isn't known: "Make them the owner?". */
    them: "them",
    transferBody: "Its projects will bill to them and follow their plan. You stay as an Admin. Only they can undo this.",
    /** Handing the workspace to someone on a smaller plan: what it loses. */
    downgrade: {
      /** "They're on Free. This workspace uses Business." */
      intro: "They're on {to}. This workspace uses {from}, so after the transfer:",
      sso_required: "Require SSO stops applying — members can sign in without it.",
      sso: "SSO sign-in turns off.",
      require2fa: "Two-factor sign-in stops being required.",
      publish_policy: "The publishing rule stops applying — every Editor can publish without approval.",
      members_only_apps: plural({ one: "{n} members-only app stays members-only, but no new app can be made members-only.", other: "{n} members-only apps stay members-only, but no new app can be made members-only." }),
      private_projects: plural({ one: "{n} private project stays private (it can still be opened to everyone), but no new project can be made private.", other: "{n} private projects stay private (they can still be opened to everyone), but no new project can be made private." }),
      member_limits: "Members' monthly credit limits stop applying.",
      invite_policy: "Only admins can invite again — Editors can't.",
      sharing_controls: "Preview links and code downloads turn back on for everyone.",
      /** {limit} is the plan's cap. */
      publishedApps: "{to} allows {limit} published apps at once; they'd have {n}. Their apps stay up, but they can't publish a new one until they're under it.",
      features: "The audit log, approvals and the other {from} settings lock until they upgrade.",
      /** Billing: your own move to a smaller plan. */
      publishedAppsYou: "{to} allows {limit} published apps at once; you have {n}. They stay up, but you can't publish a new one until you're under it.",
      featuresYou: "The other {from} settings lock until you upgrade again; what you set comes back then.",
      /** Billing confirm, above each workspace's list. {name}: the workspace. */
      billingIntro: "In {name}, on {to}:",
      /** Billing confirm, when cancelling. */
      cancelTitle: "Cancel your subscription?",
      cancelBody: "You'll go back to Free at the end of this billing period. Cancelling happens on Stripe's page.",
      cancelGo: "Continue to cancel",
      upgradeFirst: "To keep all of it, ask them to upgrade to {from} first.",
      transferAnyway: "Transfer anyway",
    },
    leaveTitle: "Leave {name}?",
    deleteTitle: "Delete {name}?",
    deleteBody: "Members lose access right away. Published apps keep running until it's deleted for good after 60 days; you can restore it until then.",
    /** {name} is shown in bold. */
    typeToConfirm: "Type {name} to confirm.",
  },

  /** Team → Privacy & security. */
  privacy: {
    accessTitle: "Access & membership",
    accessDescription: "Who can join the workspace and see its projects.",
    projectAccess: "Default project access",
    projectAccessHint: "Whether new projects are open to every member, or private to their creator and admins.",
    projectWorkspace: "Workspace",
    projectWorkspaceHint: "Every member sees new projects.",
    projectPrivate: "Private",
    projectPrivateHint: "Their creator and admins; shared on request.",
    whoCanInvite: "Who can invite",
    whoCanInviteHint: "Who can invite people and create invite links.",
    adminsOnly: "Admins only",
    editorsAndUp: "Editors and up",
    editorsAndUpHint: "Editors invite Editors and Viewers.",
    inviteLinks: "Invite links",
    inviteLinksHint: "Let those who can invite create links anyone with a Mythex account can join through.",
    require2fa: "Require two-factor sign-in",
    require2faHint: "Everyone opening this workspace needs two-factor sign-in on. You need it on yourself first (Settings → Account).",
    discovery: "Workspace discovery",
    discoveryOn: "People who sign in with an @{domain} email can find this workspace.",
    /** The tag is a link to the Identity tab. */
    discoveryNeedsDomain: "Set your company's email domain in <link>Identity</link> first.",
    askToJoin: "Ask to join",
    askToJoinHint: "They request; an admin approves in People.",
    joinAutomatically: "Join automatically",
    joinAutomaticallyHint: "They join as Editors.",
    publishingTitle: "Publishing",
    publishingDescription: "How projects go live. Approval requests land in Approvals.",
    appAccess: "Default website access",
    appAccessHint: "Who can open newly published apps. Publishers can choose per app.",
    appAnyone: "Anyone",
    appAnyoneHint: "Anyone with the link.",
    appMembers: "Workspace members",
    appMembersHint: "Signed in to Mythex, in this workspace.",
    whoCanPublish: "Who can publish",
    whoCanPublishHint: "Who can put projects on the web.",
    editorsAndAbove: "Editors and above",
    editorsAsk: "Editors ask, an admin approves",
    sharingTitle: "Sharing",
    sharingDescription: "How members share previews and code.",
    previewLinks: "Preview link sharing",
    previewLinksHint: "Members can create public links to a project's preview. Off: nobody can create new ones.",
    codeDownloads: "Code downloads",
    codeDownloadsHint: "Members can download a project's code and data. Off: only admins can.",
  },

  /** Team → Identity: the company domain. */
  identity: {
    domainTitle: "Company domain",
    domainDescription:
      "People who sign in with a verified email at this domain can find and join this workspace (see Privacy & security). Your own email must be at it.",
    emailDomain: "Email domain",
    verifyLabel: "Domain ownership",
    /** {domain}: the company domain. */
    verifyHint:
      "Add this TXT record where you manage {domain}'s DNS (Cloudflare, GoDaddy, Namecheap…), then click Verify. It can take a few minutes to show. SSO needs a verified domain.",
    verifiedHint: "Proven with a DNS record. Changing the domain turns SSO off until the new one is verified.",
    verified: "Verified",
    verify: "Verify",
    recordType: "Type",
    recordName: "Name",
    recordValue: "Value",
    copyValue: "Copy the record value",
    verifiedToast: "Domain verified.",
    verifyErrors: {
      txtNotFound: "We can't see the TXT record yet. DNS changes can take a few minutes, sometimes up to an hour.",
      dnsFailed: "We couldn't reach DNS. Try again in a minute.",
      /** {domain}: the company domain. */
      domainTaken: "{domain} is already verified by another workspace.",
      failed: "Couldn't verify the domain.",
    },
  },

  /** Team → People. */
  people: {
    /** {name} (the workspace) is shown in bold. */
    count: plural({ one: "{n} person in {name}.", other: "{n} people in {name}." }),
    tabsAria: "People",
    all: "All",
    invitations: "Invitations",
    requests: "Requests",
    searchAria: "Search people",
    role: "Role",
    allRoles: "All roles",
    inviteLink: "Invite link",
    invite: "Invite",
    colName: "Name",
    colRole: "Role",
    colJoined: "Joined",
    /** {month} is the short month name: "Oct usage". */
    colMonthUsage: "{month} usage",
    colTotalUsage: "Total usage",
    colCreditLimit: "Credit limit",
    colActions: "Actions",
    removeAria: "Remove {name}",
    /** Under the table: "4 of 6 people". */
    shown: plural({ one: "{shown} of {n} person", other: "{shown} of {n} people" }),
    joinedOn: "Joined {date}",
    /** After joinedOn on a phone. */
    usageLine: "{credits} credits in {month} · {total} total",
    limitsUpsell: "Credit limits per member come with Business.",
    noInvitations: "No pending invitations.",
    invitedOn: "{role} · invited {date}",
    invitedOnBy: "{role} · invited {date} by {name}",
    noRequests: 'No requests. People at @{domain} can ask to join when Workspace discovery is set to "Ask to join".',
    /** {domain} above, before the company domain is set. */
    yourDomain: "your domain",
    askedOn: "Asked {date}",
    approve: "Approve",
    decline: "Decline",
    joined: "{name} joined.",
    requestDeclined: "Request declined.",
    you: "(you)",
    roleFor: "Role for {name}",
    setLimit: "Set limit",
    revoke: "Revoke",
    removeTitle: "Remove {name}?",
    removeBody: "They lose access to this workspace's projects right away. What they built stays.",
    removeFailed: "They couldn't be removed.",
    revokeTitle: "Revoke this invitation?",
    revokeBody: "The link sent to {email} stops working.",
  },

  /** People → Invite: by email. */
  invite: {
    title: "Invite people to {name}",
    subtitle: "They get an email with a link to join.",
    emails: "Emails",
    placeholder: "name@company.com, another@company.com",
    upgradeForRoles: "Admins, Viewers and spending limits come with Business.",
    failed: "The invitations couldn't be sent.",
    alreadyMember: "{email} is already a member.",
    sent: plural({ one: "Invitation sent.", other: "{n} invitations sent." }),
    send: plural({ one: "Send invitation", other: "Send {n} invitations" }),
  },

  /** People → Invite link. */
  inviteLink: {
    title: "Invite link",
    subtitle: "Anyone with a Mythex account who opens it joins this workspace. Links last 30 days.",
    roleAria: "Role for the link",
    joinAs: "Join as {role}",
    create: "Create link",
    createFailed: "The link couldn't be created.",
    active: "Active links",
    none: "None yet.",
    /** {n} is how many joined through it. */
    meta: plural({ one: "{n} joined · by {name} · until {date}", other: "{n} joined · by {name} · until {date}" }),
  },

  /** People → a member's monthly credit limit. */
  limit: {
    title: "Monthly credit limit for {name}",
    subtitle: "The most they can spend in this workspace each calendar month.",
    aria: "Credits a month",
    remove: "Remove limit",
  },

  /** A member's details (People, or a name under Usage). */
  member: {
    fallbackName: "Member",
    loadFailed: "Couldn't load this member.",
    thisMonth: "This month",
    ofLimit: "credits of their limit",
    creditsUnit: "credits",
    last30Days: "Last 30 days",
    projectsMade: "Projects made",
    inWorkspace: "in this workspace",
    lastActive: "Last active",
    spentCredits: "spent credits",
    showAria: "Show",
    usageTab: "Usage",
    projectsTab: "Projects made · {n}",
    byDay: "Credits by day, last 30 days",
    dayBar: "{date}: {credits} credits",
    today: "Today",
    byProject: "Spent on, by project",
    nothingLast30: "Nothing in the last 30 days.",
    noProjects: "None in this workspace.",
    private: "Private",
    madeLine: "Made {date} · active {active}",
    live: "Live",
  },

  /** /join/:token — an invite link. */
  join: {
    invalidTitle: "This invite link doesn't work",
    invalidBody: "It expired or was turned off. Ask the person who sent it for a new one.",
    title: "Join {name}",
    /** {role} is a roleWithArticle. */
    members: plural({ one: "{n} member · you'll join as {role}.", other: "{n} members · you'll join as {role}." }),
  },

  /** People at a company's email domain, on the dashboard. */
  banner: {
    /** {name} (the workspace) is shown in bold. */
    onMythex: plural({ one: "{name} is on Mythex · {n} member", other: "{name} is on Mythex · {n} members" }),
    requested: "Requested",
    askToJoin: "Ask to join",
    asked: "Asked to join {name}. An admin there will approve it.",
  },

  /** Admin work waiting in a workspace: the sidebar, the account menu and Account settings. */
  pending: {
    joinRequests: plural({ one: "{n} join request", other: "{n} join requests" }),
    approvals: plural({ one: "{n} publish to approve", other: "{n} publishes to approve" }),
    /** Read out for the count badge. */
    waiting: plural({ one: "{n} waiting for you", other: "{n} waiting for you" }),
    review: "Review",
    /** A count badge past 99 ("99+"), read out. */
    moreThan99: "More than 99",
    workspaceSettings: "Workspace settings",
  },

  /** Settings → Account → Team. */
  account: {
    title: "Team",
    description: "Your workspace's members, roles, limits, rules and security.",
    workspace: "Workspace",
    members: plural({ one: "{n} member", other: "{n} members" }),
    you: "You: {role}",
    moreWorkspaces: plural({ one: "{n} more workspace", other: "{n} more workspaces" }),
    twoFactor: "Two-factor sign-in",
    twoFactorOn: "On — an authenticator app code when you sign in",
  },

  /** The members dialog's link to Team. */
  membersDialog: {
    manageTeam: "Roles, spending limits and workspace rules →",
    teamSettings: "Team settings →",
  },

  /** Settings → General: who can see this project (Business). */
  projectPrivacy: {
    title: "Who can see this project",
    /** The tag is a link to the plans. */
    locked: "Everyone in the workspace. Private projects come with Business. <link>View plans</link>",
    everyone: "Everyone in the workspace.",
    privateLine: "Private: you, workspace admins, and the people below.",
    workspace: "Workspace",
    private: "Private",
    privateHint: "You, admins, and people you share it with.",
    stopSharing: "Stop sharing with {name}",
    shareWith: "Share with",
    sharePlaceholder: "Share with a member…",
  },

  /** Members-only apps: /app-access, on the way back to the app. */
  appAccess: {
    incompleteTitle: "This link isn't complete",
    incompleteBody: "Open the app's address again.",
    opening: "Opening {host}…",
    checking: "Checking you're a member of its workspace.",
    noAccessTitle: "You don't have access",
    /** {host} and {email} are kept left-to-right. */
    noAccessBody:
      "{host} is only for members of the workspace that made it. You're signed in as {email}. Ask its admin to invite you, or sign in with another account.",
    otherAccount: "Use another account",
    publicTitle: "This app is open to everyone",
    publicBody: "No sign-in needed.",
    openApp: "Open the app",
    errorTitle: "Something went wrong",
    errorBody: "We couldn't check your access just now.",
  },

  /** The publish dialog under workspace rules. */
  publish: {
    approvalSent: "Sent to your workspace admins. It goes live when one approves.",
    onlyAdmins: "In this workspace, only admins can publish.",
    waitingTitle: "Waiting for an admin",
    waitingBody: "In this workspace, admins approve publishes. We've emailed them; it goes live when one approves.",
    whoCanOpen: "Who can open it",
    anyoneWithLink: "Anyone with the link",
    membersOnly: "Only workspace members",
    membersOnlyHint: "They sign in to Mythex to open it.",
    pendingSince: "Waiting for an admin to approve (asked {date}).",
    askAdmin: "Ask an admin to publish",
  },

  /** A Viewer in a project's chat. */
  viewer: {
    nothingBuilt: "Nothing has been built here yet.",
    readOnly:
      "You're a Viewer in this workspace: you can look around and open the preview, but not change this project. Ask an admin to make you an Editor.",
  },

  /** Two-factor sign-in (authenticator app). */
  twoFactor: {
    title: "Two-factor sign-in",
    enterRecovery: "Enter one of your recovery codes.",
    enterCode: "Enter the 6-digit code from your authenticator app.",
    recoveryAria: "Recovery code",
    codeAria: "Code",
    useApp: "Use your app instead",
    useRecovery: "Use a recovery code",
    signOut: "Sign out",
    signedInAs: "Signed in as {email}",
    codeFailed: "That code didn't work.",
    setupFailed: "Setup couldn't start.",
    turnedOff: "Two-factor sign-in is off.",
    codeOrRecovery: "Code or recovery code",
    newCodes: "New recovery codes",
    setUp: "Set up",
    saveCodesTitle: "Save your recovery codes",
    setupTitle: "Set up two-factor sign-in",
    offTitle: "Turn off two-factor sign-in?",
    codesBody: "Each works once if you lose your phone. Keep them somewhere safe — they won't be shown again.",
    setupRequired:
      "A workspace you're in requires it. Scan the code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.",
    setupBody: "Scan the code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.",
    enterAnyCode: "Enter a code from your authenticator app, or a recovery code.",
    qrAlt: "QR code for your authenticator app",
    /** {key} is the secret, shown as code. */
    cantScan: "Can't scan it? Enter this key: {key}",
    makeCodes: "Make new codes",
  },

  /** Signing in with single sign-on (the sign-in page). */
  ssoSignIn: {
    continue: "Continue with SSO",
    /** Why SSO sent the person back, by the API's code (apps/api/src/routes/sso.ts). */
    errors: {
      not_found: "No SSO is set up for that email. Sign in another way, or ask your admin.",
      unavailable: "SSO isn't available yet. Sign in another way.",
      wrong_domain: "That account isn't at your company's email domain.",
      wrong_organization: "That sign-in came from a different company.",
      account_banned: "This account can't sign in.",
    } as Record<string, string>,
    failed: "Signing in with SSO didn't work. Try again, or ask your admin.",
  },
};
