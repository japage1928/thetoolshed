import type { APIRoute } from 'astro';
import { recordLegalAcceptance } from '../../../lib/legal';
import {
  assertSameOrigin,
  getAuthenticatedUser,
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
    await recordLegalAcceptance(user.id, 'account_prompt');
    return json({ ok: true });
  } catch (error) {
    return safeError(error);
  }
};
