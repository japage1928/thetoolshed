import type { APIRoute } from 'astro';
import { LEGAL_VERSIONS } from '../../../lib/legal-versions';
import {
  assertSameOrigin,
  getAuthenticatedUser,
  getUserDb,
  json,
  safeError,
} from '../../../lib/video-studio/server';

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return json({ error: 'Sign in before accepting the policies.' }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.accepted !== true) {
      return json({ error: 'Confirm that you agree to the current policies.' }, 400);
    }

    const { error } = await getUserDb(user.token)
      .from('tool_shed_legal_acceptances')
      .upsert({
        user_id: user.id,
        terms_version: LEGAL_VERSIONS.terms,
        privacy_version: LEGAL_VERSIONS.privacy,
        acceptable_use_version: LEGAL_VERSIONS.acceptableUse,
        source: 'account_prompt',
        accepted_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,terms_version,privacy_version,acceptable_use_version',
        ignoreDuplicates: true,
      });

    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    return safeError(error);
  }
};
