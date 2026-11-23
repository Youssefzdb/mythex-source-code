/**
 * Account settings → Recent sign-ins: where the account was signed in to, and
 * signing every other device out. Keys are camelCase, grouped by screen.
 */
export default {
  signIns: {
    title: "Recent sign-ins",
    description: "Where your account was signed in to lately. We email you when a device or browser signs in for the first time.",
    empty: "No sign-ins recorded yet. Your next sign-in will show here.",
    thisDevice: "This device",
    /** How someone signed in. */
    methods: { password: "Password", google: "Google", apple: "Apple", sso: "SSO" },
    /** {method} is one of the methods above. */
    withTwoFactor: "{method} + two-factor",
  },
  signOutOthers: {
    title: "Sign out of all other devices",
    hint: "Don't recognise a sign-in? Sign it out, then change your password.",
    confirm: "Every other browser and app signed in to your account is signed out. This one stays signed in.",
    button: "Sign out others",
    signingOut: "Signing out…",
    done: "Signed out of all other devices.",
    failed: "Couldn't sign out other devices. Try again.",
  },
};
