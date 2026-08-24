import { getServiceDb } from './video-studio/server';
import { LEGAL_VERSIONS } from './legal-versions';

export { LEGAL_VERSIONS } from './legal-versions';

export type LegalAcceptanceSource = 'email_signup' | 'google_oauth' | 'account_prompt';

export async function recordLegalAcceptance(userId: string, source: LegalAcceptanceSource) {
  const { error } = await getServiceDb()
    .from('tool_shed_legal_acceptances')
    .upsert({
      user_id: userId,
      terms_version: LEGAL_VERSIONS.terms,
      privacy_version: LEGAL_VERSIONS.privacy,
      acceptable_use_version: LEGAL_VERSIONS.acceptableUse,
      source,
      accepted_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,terms_version,privacy_version,acceptable_use_version',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}
