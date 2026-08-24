import { publicSiteUrl } from './server';

export type VideoEmailEventType =
  | 'welcome'
  | 'trial_started'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'subscription_canceling'
  | 'subscription_ended'
  | 'credit_pack_purchased'
  | 'video_ready'
  | 'video_failed';

export type VideoEmailEvent = {
  event_id: string;
  event_type: VideoEmailEventType;
  user_id?: string | null;
  email: string;
  name?: string | null;
  amount_cents?: number | null;
  renewal_amount_cents?: number | null;
  credits?: number | null;
  trial_ends_at?: string | null;
  access_ends_at?: string | null;
  project_title?: string | null;
  project_url?: string | null;
  occurred_at?: string | null;
};

export type VideoEmailDispatchResult = {
  configured: boolean;
  accepted: boolean;
  duplicate: boolean;
};

function emailGatewayUrl() {
  const value = process.env.VIDEO_EMAIL_WEBHOOK_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('The Video Studio email gateway must use HTTPS.');
    return parsed.toString();
  } catch {
    throw new Error('VIDEO_EMAIL_WEBHOOK_URL is invalid.');
  }
}

export async function dispatchVideoEmail(event: VideoEmailEvent): Promise<VideoEmailDispatchResult> {
  const webhookUrl = emailGatewayUrl();
  if (!webhookUrl) return { configured: false, accepted: false, duplicate: false };

  const siteUrl = publicSiteUrl();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tool-shed-source': 'video-studio',
    },
    body: JSON.stringify({
      ...event,
      occurred_at: event.occurred_at || new Date().toISOString(),
      app_url: `${siteUrl}/app/video-studio`,
      billing_url: `${siteUrl}/app/video-studio?tab=billing`,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : `Video Studio email gateway returned HTTP ${response.status}.`,
    );
  }

  return {
    configured: true,
    accepted: result?.status === 'accepted' || result?.status === 'sent',
    duplicate: result?.status === 'duplicate',
  };
}

export async function dispatchVideoEmailSafely(event: VideoEmailEvent) {
  try {
    const result = await dispatchVideoEmail(event);
    return result.accepted || result.duplicate || !result.configured;
  } catch (error) {
    console.error('Video Studio email dispatch failed.', {
      eventId: event.event_id,
      eventType: event.event_type,
      error: error instanceof Error ? error.message : 'Unknown email gateway error.',
    });
    return false;
  }
}
