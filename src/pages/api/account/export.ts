import type { APIRoute } from 'astro';
import { getAuthenticatedUser, getUserDb, json, safeError } from '../../../lib/video-studio/server';

type ExportRow = Record<string, unknown>;
type PageResult<T> = { data: T[] | null; error: unknown };

async function collectPages<T>(load: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await load(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function byCreatedAt(left: ExportRow, right: ExportRow) {
  return String(left.created_at || '').localeCompare(String(right.created_at || ''));
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in to export your account data.' }, 401);
    const db = getUserDb(user.token);

    const [profile, projects, generations, subscriptions, ledger, brands, legalAcceptances] = await Promise.all([
      db.from('video_studio_profiles').select('display_name,plan_id,internal_beta,created_at,updated_at').maybeSingle(),
      collectPages<ExportRow>((from, to) => db.from('video_studio_projects').select('*').order('created_at', { ascending: true }).range(from, to)),
      collectPages<ExportRow>((from, to) => db.from('video_studio_generations').select('*').order('created_at', { ascending: true }).range(from, to)),
      collectPages<ExportRow>((from, to) => db.from('video_studio_subscriptions').select('plan,status,renewal_date,cancel_at_period_end,created_at,updated_at').order('created_at', { ascending: true }).range(from, to)),
      collectPages<ExportRow>((from, to) => db.from('video_studio_credit_ledger').select('amount,transaction_type,metadata,created_at').order('created_at', { ascending: true }).range(from, to)),
      collectPages<ExportRow>((from, to) => db.from('video_studio_brand_profiles').select('*').order('created_at', { ascending: true }).range(from, to)),
      collectPages<ExportRow>((from, to) => db.from('tool_shed_legal_acceptances').select('terms_version,privacy_version,acceptable_use_version,source,accepted_at').order('accepted_at', { ascending: true }).range(from, to)),
    ]);
    if (profile.error) throw profile.error;

    const generationIds = generations
      .map((item) => typeof item.id === 'string' ? item.id : null)
      .filter((id): id is string => Boolean(id));
    const scenes: ExportRow[] = [];
    for (let index = 0; index < generationIds.length; index += 100) {
      const ids = generationIds.slice(index, index + 100);
      scenes.push(...await collectPages<ExportRow>((from, to) => db
        .from('video_studio_generation_scenes')
        .select('*')
        .in('generation_id', ids)
        .order('created_at', { ascending: true })
        .range(from, to)));
    }
    scenes.sort(byCreatedAt);

    const date = new Date().toISOString().slice(0, 10);
    return json({
      exportedAt: new Date().toISOString(),
      account: { email: user.email, legalAcceptances },
      videoStudio: {
        profile: profile.data,
        projects,
        generations,
        generationScenes: scenes,
        subscriptions,
        creditLedger: ledger,
        brandProfiles: brands,
      },
      note: 'Payment card details are held by Stripe and are not included in this export.',
    }, 200, {
      'content-disposition': `attachment; filename="tool-shed-data-${date}.json"`,
      'x-content-type-options': 'nosniff',
    });
  } catch (error) {
    return safeError(error);
  }
};
