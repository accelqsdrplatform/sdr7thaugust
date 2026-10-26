import { supabase } from '../lib/supabase';

// Single source of truth for linking a response back to the specific email
// that most likely prompted it. Call this any place response_type /
// response_state gets set on a contact (ContactDetail response tags,
// bounce detection) so stage- and source-level reply rates (Scorecard,
// Dashboard) are attributed to the right email instead of approximated
// against whatever stage the contact happens to be in right now.
export async function logEmailResponse(contactId, ownerId, responseType, respondedAt) {
  try {
    const at = respondedAt || new Date().toISOString();
    const { data: email } = await supabase
      .from('emails')
      .select('id')
      .eq('contact_id', contactId)
      .lte('sent_at', at)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from('email_responses').insert({
      contact_id: contactId,
      email_id: email?.id || null,
      owner_id: ownerId,
      response_type: responseType,
      responded_at: at,
    });
  } catch (e) {
    console.error('logEmailResponse failed', e);
  }
}
