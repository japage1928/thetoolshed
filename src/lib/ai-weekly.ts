import { query } from './supabase';

export type AiWeeklyItem = {
  title: string;
  what: string;
  why: string;
  action: string;
  avoid?: string;
  sources?: Array<{ label: string; url: string }>;
};

export type AiWeeklyFaq = {
  question: string;
  answer: string;
};

export type DbAiWeeklyFilter = {
  id: string;
  slug: string;
  title: string;
  published_date: string;
  one_sentence_week: string;
  keep_items: AiWeeklyItem[];
  skip_items: AiWeeklyItem[];
  dont_pay_items: AiWeeklyItem[];
  costs_limits: string | null;
  what_im_ignoring: string | null;
  faqs: AiWeeklyFaq[];
  cta_label: string | null;
  cta_href: string | null;
  author: string;
  seo_title: string | null;
  meta_description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export async function getAiWeeklyFilterBySlug(slug: string) {
  const rows = await query<DbAiWeeklyFilter>(
    'ai_weekly_filters',
    `slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&limit=1`,
  );
  return rows[0] ?? null;
}
