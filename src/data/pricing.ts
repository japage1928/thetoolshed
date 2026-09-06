/**
 * Public plan-structure notes for flagship tools.
 * No dollar amounts. Unverified pages stay labeled. Always link the vendor.
 */

export type PricingPlan = {
  name: string;
  audience: string;
  notes: string;
};

export type PricingGuide = {
  slug: string;
  toolSlug: string;
  name: string;
  vendor: string;
  lastReviewed: string;
  verified: boolean;
  summary: string;
  plans: PricingPlan[];
  apiNotes: string;
  pricingUrl: string;
  websiteUrl: string;
  caveats: string[];
};

const REVIEWED = '2026-09-06';

export const PRICING_GUIDES: PricingGuide[] = [
  {
    slug: 'chatgpt',
    toolSlug: 'chatgpt',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'OpenAI publishes a free ChatGPT tier plus paid consumer, business, and API plans. Names, limits, and prices change. This page is the public plan shape — not a quote.',
    plans: [
      { name: 'Free', audience: 'Individuals trying the product', notes: 'A limited consumer tier. Caps, model access, and extras move; confirm on OpenAI’s page.' },
      { name: 'Plus / Pro', audience: 'Individuals who want a paid consumer seat', notes: 'Paid personal plans with higher limits and more model/feature access. Treat current names as marketing labels, not a frozen SKU list.' },
      { name: 'Business / Enterprise', audience: 'Teams and companies', notes: 'Workspace / org billing with admin controls. Seat math belongs on OpenAI’s business pricing, not here.' },
    ],
    apiNotes:
      'API usage is a separate meter from ChatGPT seats. Token rates, batch discounts, and model prices are on the OpenAI platform pricing page — enter them in the calculator only after you copy them from the vendor.',
    pricingUrl: 'https://openai.com/chatgpt/pricing',
    websiteUrl: 'https://chatgpt.com',
    caveats: [
      'We do not quote dollar amounts because they change by plan, region, and date.',
      'ChatGPT product features (browsing, images, voice, file analysis) vary by plan.',
      'API spend is easy to underestimate if you ignore output tokens and retries.',
    ],
  },
  {
    slug: 'claude',
    toolSlug: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'Anthropic publishes free and paid Claude plans plus API pricing. Limits, context, and model access depend on the plan you actually buy.',
    plans: [
      { name: 'Free', audience: 'Individuals trying Claude', notes: 'A limited consumer tier. Daily caps and model choice change — check Anthropic.' },
      { name: 'Pro / Team', audience: 'Individuals and small teams', notes: 'Paid seats with higher usage and workspace features. Confirm current names and included models on the pricing page.' },
      { name: 'Enterprise', audience: 'Larger orgs', notes: 'Contracted / admin-led access. Do not budget from a blog recap.' },
    ],
    apiNotes:
      'Claude API is billed separately from claude.ai seats. Copy input/output rates for the specific model from Anthropic’s pricing page before you run the calculator.',
    pricingUrl: 'https://www.anthropic.com/pricing',
    websiteUrl: 'https://claude.ai',
    caveats: [
      'Claude Code access and cost follow Claude / API plans, not a price we will invent here.',
      'Long-context work can consume more tokens than a short chat.',
      'We have not independently audited Anthropic’s current dollar table.',
    ],
  },
  {
    slug: 'grok',
    toolSlug: 'grok',
    name: 'Grok',
    vendor: 'xAI',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'Grok is offered through grok.com and X, with free and paid access that xAI and X change. Confirm current availability on those sites — not third-party recaps.',
    plans: [
      { name: 'Free access', audience: 'People trying Grok', notes: 'Limited access exists; the exact cap depends on the current Grok / X offer.' },
      { name: 'Paid consumer access', audience: 'Individuals who want more usage', notes: 'Paid tiers have appeared via grok.com and X subscriptions. Names and what they unlock move. Read the vendor page you would actually pay.' },
      { name: 'API', audience: 'Builders', notes: 'xAI publishes API access separately from the consumer chat product.' },
    ],
    apiNotes:
      'The Grok consumer pool and any API / on-demand meter are not the same thing. Enter only the rates you can see on xAI’s current pricing.',
    pricingUrl: 'https://x.ai',
    websiteUrl: 'https://grok.com',
    caveats: [
      'X-bundled access and grok.com access can differ. Check both if you already pay X.',
      'We are not quoting SuperGrok or X Premium prices here.',
      'Lived cost notes on the how-to pages are anecdotes, not a price list.',
    ],
  },
  {
    slug: 'perplexity',
    toolSlug: 'perplexity',
    name: 'Perplexity',
    vendor: 'Perplexity',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'Perplexity publishes a free product and paid Pro / enterprise options. Search limits and model choices depend on the plan.',
    plans: [
      { name: 'Free', audience: 'Casual research', notes: 'A limited search-and-answer product. Query caps change.' },
      { name: 'Pro', audience: 'People who research often', notes: 'Paid individual plan. Model choice and limits are on Perplexity’s Pro page.' },
      { name: 'Enterprise', audience: 'Teams', notes: 'Org / enterprise options exist. Get the quote from Perplexity, not from this page.' },
    ],
    apiNotes:
      'Perplexity also publishes API / Sonar-style access. Treat that as a separate meter from Pro seats.',
    pricingUrl: 'https://www.perplexity.ai/pro',
    websiteUrl: 'https://www.perplexity.ai',
    caveats: [
      'Pro is not the same as “unlimited research.” Confirm current query and model limits.',
      'Cited answers still need you to open the sources.',
    ],
  },
  {
    slug: 'gemini',
    toolSlug: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    lastReviewed: REVIEWED,
    verified: false,
    summary:
      'Google publishes a free Gemini app plus paid Google AI consumer tiers and separate developer/API billing. We have not independently verified the current dollar table.',
    plans: [
      { name: 'Free', audience: 'Individuals in the Google ecosystem', notes: 'A consumer assistant with usage limits. Confirm current model access in the Gemini app.' },
      { name: 'Google AI Plus / Pro / Ultra', audience: 'Individuals who want a paid Gemini upgrade', notes: 'Google currently names paid consumer tiers on its subscriptions page. What each tier includes (models, usage, extras) changes — read that page, not a recap.' },
      { name: 'Workspace / enterprise', audience: 'Organizations on Google Workspace', notes: 'Gemini features inside Workspace are billed as a Google product, not as “the Gemini app.”' },
    ],
    apiNotes:
      'Developer usage goes through Google AI Studio / Gemini API or Vertex AI. Those rates are not ChatGPT-style seat prices. Copy them from Google’s developer pricing before using the calculator.',
    pricingUrl: 'https://gemini.google/subscriptions/',
    websiteUrl: 'https://gemini.google.com',
    caveats: [
      'Unverified: we are describing public product families, not a reviewed price sheet.',
      'App, Workspace, AI Studio, and Vertex are different bills.',
      'Always open Google’s current page before you budget.',
    ],
  },
  {
    slug: 'cursor',
    toolSlug: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'Cursor publishes free and paid plans. Limits, model access, and agent usage are plan-specific and change.',
    plans: [
      { name: 'Free / Hobby', audience: 'Individuals trying the editor', notes: 'A limited starting plan. What is included (completions, slow requests, models) changes — read cursor.com.' },
      { name: 'Pro', audience: 'Individual developers', notes: 'Paid personal plan. Agent and model usage may have a pool plus on-demand overage. Confirm the current meter on Cursor’s pricing page.' },
      { name: 'Business', audience: 'Teams', notes: 'Seat-based team billing with admin controls. Do not hard-code a per-seat number from memory.' },
    ],
    apiNotes:
      'Cursor is usually a seat (and sometimes a usage pool), not a raw token API you invoice yourself. If you also call model APIs outside Cursor, that is a second bill.',
    pricingUrl: 'https://cursor.com/pricing',
    websiteUrl: 'https://www.cursor.com',
    caveats: [
      'Agent runs can burn a monthly usage pool faster than tab-complete.',
      'Model routing and included usage change; the vendor page wins.',
    ],
  },
  {
    slug: 'github-copilot',
    toolSlug: 'github-copilot',
    name: 'GitHub Copilot',
    vendor: 'GitHub',
    lastReviewed: REVIEWED,
    verified: true,
    summary:
      'GitHub publishes Copilot Free, Pro, and business / enterprise plans. Confirm current prices and included models on GitHub’s Copilot pages.',
    plans: [
      { name: 'Free', audience: 'Individuals trying Copilot', notes: 'A limited individual tier. Confirm current completion and chat caps on GitHub.' },
      { name: 'Pro', audience: 'Individual developers', notes: 'Paid personal plan. Features depend on the current Copilot individual offer.' },
      { name: 'Business / Enterprise', audience: 'Organizations', notes: 'Per-seat org plans with policy controls. Budget from GitHub’s pricing, including whether chat/agent features are enabled for the org.' },
    ],
    apiNotes:
      'Copilot is typically a seat inside an IDE / GitHub, not a token invoice you set yourself. If you also pay OpenAI or Anthropic APIs, that is separate.',
    pricingUrl: 'https://github.com/features/copilot',
    websiteUrl: 'https://github.com/features/copilot',
    caveats: [
      'What Copilot can do depends on plan, IDE, and org policy.',
      'We are not quoting GitHub’s current per-seat dollars.',
    ],
  },
  {
    slug: 'n8n',
    toolSlug: 'n8n',
    name: 'n8n',
    vendor: 'n8n',
    lastReviewed: REVIEWED,
    verified: false,
    summary:
      'n8n can be self-hosted or used as n8n Cloud. Cloud has published starter / pro / enterprise-style plans. We have not independently verified the current cloud dollar table.',
    plans: [
      { name: 'Self-hosted', audience: 'People who can run their own instance', notes: 'The core software is available to self-host. You still pay hosting, and any AI nodes call vendor APIs on their own meters.' },
      { name: 'n8n Cloud', audience: 'People who want hosted workflows', notes: 'Hosted plans with execution / workflow limits. Read n8n’s pricing page for the current names and caps.' },
      { name: 'Enterprise', audience: 'Larger teams', notes: 'Contracted / enterprise options exist. Get them from n8n.' },
    ],
    apiNotes:
      'n8n itself is workflow infrastructure. Every OpenAI / Anthropic / other node is a second bill. The calculator can hold an n8n seat assumption plus API token assumptions — you supply both numbers.',
    pricingUrl: 'https://n8n.io/pricing',
    websiteUrl: 'https://n8n.io',
    caveats: [
      'Unverified cloud prices. Do not treat a screenshot as current.',
      'Self-host is not free if you count VPS, maintenance, and the AI APIs the flows call.',
      'Autonomous workflows can spend while you sleep. Set caps.',
    ],
  },
];

export function getPricingGuide(slug: string): PricingGuide | undefined {
  return PRICING_GUIDES.find((item) => item.slug === slug || item.toolSlug === slug);
}

export function hasPricingGuide(slug: string): boolean {
  return Boolean(getPricingGuide(slug));
}
