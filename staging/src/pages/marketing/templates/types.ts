export const TEMPLATE_CATEGORIES = [
  "websites",
  "apps",
  "portfolios",
  "stores",
  "dashboards",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Lovable-style top-level group shown on cards / sidebar. */
export type TemplateGroup = "websites" | "apps";

export type NicheSeed = {
  title: string;
  category: TemplateCategory;
  tagline: string;
  slug: string;
  featured?: boolean;
  /** Public path e.g. /img/templates/waitlist.webp */
  previewImage?: string;
};

export type Template = {
  slug: string;
  category: TemplateCategory;
  group: TemplateGroup;
  subcategory: string;
  title: string;
  /** Display title without trailing "Template". */
  displayTitle: string;
  tagline: string;
  prompt: string;
  featured: boolean;
  /** Optional screenshot — falls back to wireframe placeholder. */
  previewImage?: string;
  designedFor: string[];
  highlights: string[];
  about: string;
  useCases: string[];
  faqs: Array<{ q: string; a: string }>;
  /**
   * A section written for a search this page already gets impressions on,
   * rather than for the product. Present only on the few pages that have one.
   */
  answer?: { heading: string; body: string; bullets: string[] };
  /** Set where the generated meta does not use the words people search for. */
  metaTitle?: string;
  metaDescription?: string;
  path: string;
};

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  websites: "Websites",
  apps: "Apps",
  portfolios: "Portfolios",
  stores: "Stores",
  dashboards: "Dashboards",
};

export const GROUP_LABELS: Record<TemplateGroup, string> = {
  websites: "Websites",
  apps: "Apps",
};

export const SUBCATEGORIES = [
  "Portfolio",
  "SaaS",
  "Blog",
  "Ecommerce",
  "Dashboards",
  "Booking",
  "Landing",
  "Internal Tools",
  "Music",
  "Wedding",
  "News",
  "Education",
  "Health",
  "Finance",
  "Other",
] as const;
