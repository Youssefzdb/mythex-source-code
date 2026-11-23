import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { lockDocumentTheme } from "../lib/theme";
import { MarketingFooter, MarketingNav } from "./marketing/MarketingChrome";
import { AuthModal } from "./marketing/AuthModal";
import { useInPageSheet } from "../components/shell/PageSheet";
import { SurfaceScroll } from "../components/ui/Sheet";
import { useEnglishBody } from "../i18n/useEnglishBody";

const LAST_UPDATED = "July 14, 2026";
const CONTACT = "support@mythex.ai";
const PAGE = "#1f1f1e";
const MUTED = "oklch(72.34% 0.002 107)";

/**
 * NOTE FOR COUNSEL: These are good-faith drafts for a Dubai (UAE) based entity
 * operating "Mythex", an AI app-building platform. Replace "Mythex" with the
 * exact registered entity (e.g. "Mythex FZ-LLC"), add the full registered
 * address, and have legal counsel review before running paid traffic.
 */

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  // In the phone's page sheet: only the text — the sheet is the chrome, with
  // its own close, and the website's header and footer have no place in it.
  if (useInPageSheet()) {
    return (
      <SurfaceScroll className="native-safe-bottom px-5 pt-2 pb-12 text-white">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1.5 text-sm" style={{ color: MUTED }}>
          Last updated: {LAST_UPDATED}
        </p>
        <div className="legal-body mt-6 space-y-5 text-[15px] leading-relaxed text-[#e8e8e6]">{children}</div>
      </SurfaceScroll>
    );
  }
  return <LegalPageLayout title={title}>{children}</LegalPageLayout>;
}

function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  const englishBody = useEnglishBody();
  useEffect(() => {
    lockDocumentTheme("dark");
    return () => lockDocumentTheme(null);
  }, []);

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");

  return (
    <div className="relative min-h-screen w-full text-white" style={{ background: PAGE }}>
      <MarketingNav
        onGetStarted={() => {
          setAuthMode("signup");
          setAuthOpen(true);
        }}
        onLogin={() => {
          setAuthMode("login");
          setAuthOpen(true);
        }}
      />

      <main {...englishBody} className="relative mx-auto max-w-3xl px-6 pb-20 pt-28 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>
          Last updated: {LAST_UPDATED}
        </p>
        <div className="legal-body mt-8 space-y-5 text-[15px] leading-relaxed text-[#e8e8e6]">
          {children}
        </div>
        <div className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm" style={{ borderColor: "rgb(64, 64, 62)", color: MUTED }}>
          <Link to="/terms" className="hover:text-white">Terms</Link>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          {/* /cookies page disabled for now — see CookiePage below */}
          <Link to="/acceptable-use" className="hover:text-white">Acceptable Use</Link>
        </div>
      </main>

      <div className="pb-10 pt-4">
        <MarketingFooter />
      </div>

      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthOpen(false)}
          onSwitchMode={(next) => setAuthMode(next)}
        />
      )}
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-xl font-semibold text-white">{children}</h2>;
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service (“Terms”) govern your access to and use of Mythex (the “Service”), an
        AI-powered platform that helps you design, build, run, and publish software applications.
        Mythex is operated by Mythex L.L.C-FZ (Meydan Free Zone license 2651398.01), Meydan Grandstand, 6th floor, Meydan Road, Nad Al Sheba, Dubai, United Arab Emirates (“Mythex”, “we”, “us”). By
        creating an account or using the Service, you agree to these Terms.
      </p>

      <H>1. Eligibility &amp; accounts</H>
      <p>
        You must be at least 16 years old (or the age of digital consent in your country) to use the
        Service. You are responsible for your account, for keeping your credentials secure, and for all
        activity that occurs under your account. Provide accurate information and keep it up to date.
      </p>

      <H>2. The Service</H>
      <p>
        Mythex lets you describe an application in natural language; our AI agent generates code, runs it
        in a cloud development sandbox, and can publish it to a hosting environment. You retain ownership
        of the applications and content you create (“Your Content”), subject to the licenses below.
      </p>

      <H>3. Your Content &amp; ownership</H>
      <p>
        You own Your Content. You grant Mythex a worldwide, non-exclusive license to host, store, copy,
        process, and display Your Content solely to operate and improve the Service, provide support, and
        as needed to run and publish your applications. You are solely responsible for Your Content and
        for ensuring you have the rights to use it.
      </p>

      <H>4. AI-generated output</H>
      <p>
        Output generated by the AI agent may be inaccurate, incomplete, or insecure, and similar output
        may be generated for other users. You are responsible for reviewing, testing, and securing any
        generated code before relying on it or publishing it. Mythex makes no warranty that generated
        output is fit for any particular purpose.
      </p>

      <H>5. Acceptable use</H>
      <p>
        Your use of the Service is subject to our{" "}
        <Link to="/acceptable-use" className="text-fg hover:text-fg">Acceptable Use Policy</Link>. In
        particular, you may not use the Service or the sandboxes/hosting we provide to mine
        cryptocurrency, send spam, host malware or phishing, run denial-of-service or scanning tools, or
        conduct any illegal activity. We may suspend or remove any app, sandbox, or account that violates
        this policy, without notice where necessary to protect the Service or third parties.
      </p>

      <H>6. Plans, credits &amp; billing</H>
      <p>
        The Service offers free and paid plans and usage-based credits for AI (Build) and published-app
        hosting and databases (Run), from one credit balance. Paid plans and credit pack purchases are billed through our
        payment processor (Stripe). Credits are consumed as you use AI features and as your published apps
        consume hosting and database resources. Except where required by law,
        payments are non-refundable. We may change pricing prospectively with notice.
      </p>

      <H>7. Published apps &amp; hosting</H>
      <p>
        When you publish an app, you are responsible for its content and its compliance with law. Hosting
        and database usage is billed from the same credit balance as AI features; when that balance is
        exhausted, the app may be paused. We may suspend a published app that creates a security, legal, or cost risk.
      </p>

      <H>8. Third-party services</H>
      <p>
        The Service integrates third-party providers (including AI model providers, cloud sandbox and
        hosting providers, and database providers). Your use may be subject to their terms, and their
        availability is outside our control.
      </p>

      <H>9. Termination</H>
      <p>
        You may stop using the Service and delete your account at any time from your account settings. We
        may suspend or terminate your access if you breach these Terms or the Acceptable Use Policy, or to
        comply with law. On termination we may delete your data as described in our Privacy Policy.
      </p>

      <H>10. Disclaimers</H>
      <p>
        THE SERVICE AND ALL OUTPUT ARE PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT.
      </p>

      <H>11. Limitation of liability</H>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, MYTHEX WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR LOST PROFITS OR DATA. OUR TOTAL LIABILITY FOR
        ANY CLAIM WILL NOT EXCEED THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO
        THE CLAIM.
      </p>

      <H>12. Governing law</H>
      <p>
        These Terms are governed by the laws of the Emirate of Dubai and the applicable federal laws of the
        United Arab Emirates, and the courts of Dubai will have exclusive jurisdiction, without regard to
        conflict-of-laws rules.
      </p>

      <H>13. Changes &amp; contact</H>
      <p>
        We may update these Terms; material changes will be notified in-product or by email. Continued use
        after changes take effect constitutes acceptance. Questions? Contact us at{" "}
        <a href={`mailto:${CONTACT}`} className="text-fg hover:text-fg">{CONTACT}</a>.
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how Mythex (based in Dubai, UAE) collects, uses, and protects your
        personal data when you use the Service. We act as the data controller for account data and as a
        processor for the content you build.
      </p>

      <H>1. Data we collect</H>
      <p>
        <strong>Account data:</strong> name, email, password hash, and authentication identifiers (e.g.
        Google sign-in ID). <strong>Usage data:</strong> projects, chat prompts and AI interactions, logs,
        and product analytics events. <strong>Billing data:</strong> plan, credit balance,
        and payment metadata (card details are handled by Stripe, not stored by us).{" "}
        <strong>Your Content:</strong> the code, files, and data of the apps you build.
      </p>

      <H>2. How we use data</H>
      <p>
        To provide and secure the Service, operate the AI agent and sandboxes, process payments, provide
        support, detect and prevent abuse, comply with law, and measure marketing and product analytics.
      </p>

      <H>3. AI processing</H>
      <p>
        Your prompts and relevant project context are sent to our AI model provider(s) to generate output.
        We do not sell your data or your prompts. We instruct providers not to train foundation models on
        your data where such controls are available.
      </p>

      <H>4. Sharing &amp; sub-processors</H>
      <p>
        We share data with service providers that help us run Mythex, including: the AI model provider
        (Anthropic), cloud sandbox provider (E2B), hosting providers (Fly.io, Cloudflare), database
        provider (Neon), payments (Stripe), email delivery (Resend), analytics/error monitoring
        (PostHog, Sentry), and partner program tracking (impact.com), which records when a visitor
        arrives from a partner's link so the partner can be credited for a subscription. Each processes
        data only to provide their service to us.
      </p>

      <H>5. International transfers</H>
      <p>
        Our providers may process data in the EU, US, and other regions. Where required, we rely on
        appropriate safeguards for cross-border transfers.
      </p>

      <H>6. Retention</H>
      <p>
        We retain account and project data for as long as your account is active. When you delete your
        account, we delete or anonymize your personal data and destroy associated sandboxes, published
        apps, and databases, except where we must retain limited records to comply with law (e.g. tax,
        accounting) or resolve disputes.
      </p>

      <H>7. Your rights</H>
      <p>
        Subject to applicable law, you may access, correct, export, or delete your personal data. Account
        deletion is available in your account settings. You can also object to or restrict certain
        processing at any time. Contact{" "}
        <a href={`mailto:${CONTACT}`} className="text-fg hover:text-fg">{CONTACT}</a>.
      </p>

      <H>8. Security</H>
      <p>
        We use encryption in transit, encryption of secrets at rest, hashed credentials and tokens, access
        controls, and monitoring. No system is perfectly secure, but we work to protect your data.
      </p>

      <H>9. Children</H>
      <p>The Service is not directed to children under 16, and we do not knowingly collect their data.</p>

      <H>10. Contact</H>
      <p>
        For privacy questions or requests, contact{" "}
        <a href={`mailto:${CONTACT}`} className="text-fg hover:text-fg">{CONTACT}</a>.
      </p>
    </LegalLayout>
  );
}

// Disabled for now along with the cookie consent banner (see main.tsx / App.tsx) — not
// needed right now. Kept for a future re-enable.
// export function CookiePage() {
//   return (
//     <LegalLayout title="Cookie Policy">
//       <p>
//         This Cookie Policy explains how Mythex uses cookies and similar technologies. You can manage
//         non-essential cookies via the consent banner and in your browser settings.
//       </p>
//
//       <H>1. Essential cookies</H>
//       <p>
//         Required for the Service to work — authentication/session cookies and security tokens. These cannot
//         be disabled as they are necessary to sign you in and keep you secure.
//       </p>
//
//       <H>2. Analytics cookies</H>
//       <p>
//         With your consent, we use product analytics (PostHog) to understand how the Service is used and to
//         improve it, including anonymous/pseudonymous usage events and optional session replay.
//       </p>
//
//       <H>3. Marketing / advertising cookies</H>
//       <p>
//         With your consent, we use advertising pixels (e.g. Google, Meta, LinkedIn, X, TikTok)
//         to measure the effectiveness of our advertising and reach relevant
//         audiences. These load only if you accept marketing cookies.
//       </p>
//
//       <H>4. Managing cookies</H>
//       <p>
//         You can accept or reject non-essential cookies at any time via the cookie banner or by clearing
//         cookies in your browser. Rejecting non-essential cookies will not affect core functionality.
//       </p>
//
//       <H>5. Contact</H>
//       <p>
//         Questions about cookies? Contact{" "}
//         <a href={`mailto:${CONTACT}`} className="text-fg hover:text-fg">{CONTACT}</a>.
//       </p>
//     </LegalLayout>
//   );
// }

export function AcceptableUsePage() {
  return (
    <LegalLayout title="Acceptable Use Policy">
      <p>
        This Acceptable Use Policy (“AUP”) applies to everyone who uses Mythex, including the code you
        generate, the sandboxes you run, and the apps you publish. Violations may result in immediate
        suspension or removal of content, apps, sandboxes, or accounts.
      </p>

      <H>You may not use Mythex to:</H>
      <ul className="list-disc space-y-2 pl-6">
        <li>Break the law or infringe others’ rights, including intellectual property or privacy rights.</li>
        <li>Mine cryptocurrency or run unauthorized resource-intensive workloads on our infrastructure.</li>
        <li>Send spam or unsolicited bulk messages, or facilitate phishing or fraud.</li>
        <li>Create, host, or distribute malware, ransomware, or malicious code.</li>
        <li>Launch denial-of-service attacks, port scanning, credential stuffing, or network intrusion.</li>
        <li>Host or distribute content that is illegal, sexually exploitative of minors, or promotes
          violence or terrorism.</li>
        <li>Attempt to bypass usage limits, quotas, security controls, or abuse-prevention measures.</li>
        <li>Collect or process personal data unlawfully, or resell access to the Service’s AI capacity.</li>
      </ul>

      <H>Outbound activity from sandboxes and apps</H>
      <p>
        Sandboxes and published apps run on shared infrastructure under our provider accounts. Abusive
        outbound traffic (spam, attacks, scraping at scale, mining) is prohibited and monitored. We operate
        a kill-switch to suspend any app or sandbox that threatens the platform or third parties.
      </p>

      <H>Reporting abuse</H>
      <p>
        To report an app or content that violates this policy, email{" "}
        <a href={`mailto:${CONTACT}`} className="text-fg hover:text-fg">{CONTACT}</a> with the
        app URL and a description. We review reports promptly and may suspend content pending review.
      </p>
    </LegalLayout>
  );
}
