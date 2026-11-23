/**
 * The creator program's words as the pages use them (CreatorsUi), and their
 * English: a plain module, so the prerender script (Node, no Vite) can read
 * it too. The languages load through creators/index.ts.
 */
import en from "./en-creators";
import type { ImpactWords } from "../../pages/marketing/solutions/impact-program";

type En = typeof en;

export type CreatorsUi = {
  metaTitle: string;
  metaDescription: string;
  /** Six, in this order; /partners shows the first ("$50 to $100 per subscriber") and the fifth ("Monthly payouts"). */
  features: { title: string; body: string }[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  readyTitle: string;
  hub: En["hub"];
  hubCard: En["hubCard"];
  shortForm: En["shortForm"];
  form: Pick<En["form"], "email" | "emailPlaceholder" | "website" | "websitePlaceholder" | "companySize" | "companySizePlaceholder" | "sizes" | "doneNext">;
  dashboard: En["dashboard"];
  partnerUi: En["partnerUi"];
  chartTitle: string;
  chartSignups: string;
  chartEarned: string;
  /** The impact.com program's words (impact-program.ts); English lives there. */
  impact?: ImpactWords;
};

export const enCreatorsUi: CreatorsUi = {
  metaTitle: en.metaTitle,
  metaDescription: en.metaDescription,
  features: en.features,
  faqTitle: en.faqTitle,
  faq: en.faq,
  readyTitle: en.readyTitle,
  hub: en.hub,
  hubCard: en.hubCard,
  shortForm: en.shortForm,
  form: {
    email: en.form.email,
    emailPlaceholder: en.form.emailPlaceholder,
    website: en.form.website,
    websitePlaceholder: en.form.websitePlaceholder,
    companySize: en.form.companySize,
    companySizePlaceholder: en.form.companySizePlaceholder,
    sizes: en.form.sizes,
    doneNext: en.form.doneNext,
  },
  dashboard: en.dashboard,
  partnerUi: en.partnerUi,
  chartTitle: en.chartTitle,
  chartSignups: en.chartSignups,
  chartEarned: en.chartEarned,
};
