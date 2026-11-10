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
    // A contact can only have one *current* response at a time (it mirrors
    // contacts.response_type, which is itself single-valued), so any prior
    // email_responses rows for this contact are now superseded. Without this,
    // changing a contact's response tag (e.g. not_interested -> prospect)
    // left the old row in place forever, and per-type breakdown stats
    // (Scorecard/Dashboard/EmailMetricsPanel) would double-count the same
    // contact under both the old and new response type.
    await supabase.from('email_responses').delete().eq('contact_id', contactId);
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


// Companion to logEmailResponse: call when a contact's response is being
// cleared (set back to null/none) rather than changed to a new value, so the
// email_responses table doesn't keep a stale row for a response that no
// longer applies.
export async function clearEmailResponse(contactId) {
  try {
    await supabase.from('email_responses').delete().eq('contact_id', contactId);
  } catch (e) {
    console.error('clearEmailResponse failed', e);
  }
}
