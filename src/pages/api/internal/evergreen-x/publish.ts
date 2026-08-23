import type { APIRoute } from 'astro';
import {
  getServerDb,
  json,
  publishToX,
  requireUuid,
  safeError,
  verifyInternalService,
} from '../../../../lib/evergreen-x/server';

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!verifyInternalService(request)) return json({ error: 'Unauthorized service request.' }, 401);
    const body = await request.json().catch(() => ({}));
    const userId = requireUuid(typeof body.user_id === 'string' ? body.user_id : undefined);
    const postId = requireUuid(typeof body.post_id === 'string' ? body.post_id : undefined);
    const reservationToken = requireUuid(typeof body.reservation_token === 'string' ? body.reservation_token : undefined);
    const attemptId = requireUuid(typeof body.attempt_id === 'string' ? body.attempt_id : undefined);

    const db = getServerDb();
    const { data: post, error: postError } = await db.from('posts')
      .select('id,user_id,content,status,reservation_token,reservation_expires_at')
      .eq('id', postId).eq('user_id', userId).eq('reservation_token', reservationToken).maybeSingle();
    if (postError) throw postError;
    if (!post || post.status !== 'RESERVED') return json({ error: 'Reservation is invalid or no longer active.' }, 409);
    if (post.reservation_expires_at && new Date(post.reservation_expires_at).getTime() <= Date.now()) return json({ error: 'Reservation has expired.' }, 409);

    const { data: attempt, error: attemptError } = await db.from('publish_attempts')
      .select('id,status,user_id,post_id,reservation_token')
      .eq('id', attemptId).eq('user_id', userId).eq('post_id', postId).eq('reservation_token', reservationToken).maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || attempt.status !== 'reserved') return json({ error: 'Publish attempt does not match this reservation.' }, 409);

    const result = await publishToX(userId, post.content);
    return json(result, result.ok ? 200 : (result.permanent ? 422 : 503));
  } catch (error) {
    return safeError(error);
  }
};
