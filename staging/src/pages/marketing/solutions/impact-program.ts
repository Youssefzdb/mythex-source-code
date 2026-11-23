/**
 * /partners runs on impact.com since 2026-11-17: partners join, get their link
 * and are paid there. The in-house creator program (en-creators.ts, the apply
 * form, Settings → Partner) is kept as code but no longer shown.
 *
 * Terms are impact's "Public Terms" template (Engage → Contracts → Template
 * Terms), checked 2026-11-17:
 * - $50 per Subscription action, +$50 when the item category contains
 *   "Business" ($100). Enterprise is not in the template.
 * - Last click, clicks within 30 days.
 * - Locked 27 days after the end of the month tracked; paid 20 days after the
 *   end of the month it locks (a November sale → about January 20).
 * Change this file when that template changes.
 *
 * English gets the impact words below; each other language has them as
 * `impact` in i18n/solutions/creators/<code>.ts. A language without them shows
 * only the lines of its old copy that are still true under impact.
 */
import type { CreatorsUi } from "../../../i18n/solutions/en-creators-ui";

export const IMPACT_SIGNUP_URL = "https://app.impact.com/campaign-campaign-info-v2/Mythex.brand";
export const IMPACT_SIGNIN_URL = "https://app.impact.com";

type Card = { title: string; body: string };
type Faq = { q: string; a: string };

/** The partner page's words in English; other languages carry theirs as `impact` (i18n/solutions/creators/<code>.ts). */
export const IMPACT_WORDS_EN: ImpactWords = {
  metaDescription:
    "Share Mythex with your audience and earn $50 for every person who subscribes to Pro and $100 for Business. Join free through impact.com.",
  cards: [
    {
      title: "$50 to $100 per subscriber",
      body: "$50 for every person you bring who subscribes to Pro, and $100 for Business, once per person.",
    },
    {
      title: "Paid through impact.com",
      body: "Your link, clicks, sales and payouts are all in your impact.com account, and impact.com pays you every month.",
    },
  ],
  note: "You join through impact.com, the partner platform we use. It's free, and you don't need a Mythex plan.",
  signIn: "Already a partner? Sign in to impact.com",
  cardPoints: ["$50 per new Pro subscriber, $100 per Business", "Clicks, sales and payouts in your impact.com account"],
  faq: [
    {
      q: "Who can join?",
      a: "Anyone who shares things with an audience: YouTubers, creators on X, TikTok, Instagram and LinkedIn, newsletter writers, podcasters, bloggers and course or community owners. There's no minimum audience.",
    },
    {
      q: "How do I join?",
      a: "Sign up on impact.com with the Apply button on this page. It's free. Once you're accepted into the Mythex program, your partner link is in your impact.com account.",
    },
    {
      q: "What exactly do I earn?",
      a: "$50 for each person you bring whose first subscription is Pro, and $100 when it's Business. It's paid once per person, on their first payment, and a refunded payment is taken back.",
    },
    {
      q: "How is a sale tied to me?",
      a: "Anyone who clicks your link and subscribes within 30 days counts as yours. If they click another partner's link after yours, the last click counts.",
    },
    {
      q: "When and how do I get paid?",
      a: "impact.com pays you, by the payment method you choose in your impact.com account. Each sale is confirmed by the 27th of the next month and paid around the 20th of the month after that, so a sale in November is paid around January 20.",
    },
    {
      q: "Do I need a paid Mythex plan?",
      a: "No. You don't need a Mythex plan, or even a Mythex account, to be a partner.",
    },
  ],
};

/** What each language says about the impact.com program: English here, the others in i18n/solutions/creators/<code>.ts as `impact`. */
export type ImpactWords = {
  metaDescription: string;
  cards: Card[];
  note: string;
  signIn: string;
  cardPoints: string[];
  faq: Faq[];
};

export type PartnersView = {
  metaTitle: string;
  metaDescription: string;
  /** The program card's two ticks. */
  cardPoints: string[];
  /** The cards after the program card. */
  cards: Card[];
  /** The line under the cards, or none. */
  note: string | null;
  /** The sign-in link under the hero buttons, or none. */
  signIn: string | null;
  faq: Faq[];
};

/** What /partners shows in this language now that it runs on impact.com. */
export function partnersView(c: CreatorsUi, locale: string): PartnersView {
  const w = locale === "en" ? IMPACT_WORDS_EN : c.impact;
  if (w) {
    return { metaTitle: c.metaTitle, metaDescription: w.metaDescription, cardPoints: w.cardPoints, cards: w.cards, note: w.note, signIn: w.signIn, faq: w.faq };
  }
  // Translated copy: only what's still true under impact. features[5] is "A real
  // person to talk to"; faq[0] is "Who can join?". The rest name the in-house
  // terms (60 days, PayPal or Wise, our dashboard, Enterprise).
  return {
    metaTitle: c.metaTitle,
    metaDescription: c.hub.body,
    cardPoints: c.hubCard.points.slice(0, 1),
    cards: c.features[5] ? [c.features[5]] : [],
    note: null,
    signIn: null,
    faq: c.faq.slice(0, 1),
  };
}
