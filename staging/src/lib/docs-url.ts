/**
 * Where the documentation lives.
 *
 * Its own module because both the router (for the `/docs` redirect) and the
 * app's navigation need it, and importing a constant from `App` to reach it
 * would tie a leaf component to the routing entry point.
 *
 * The deep links scattered through the dialogs still spell the host out; this
 * is the base every new reference should use.
 */
export const DOCS_URL = "https://docs.mythex.ai";
