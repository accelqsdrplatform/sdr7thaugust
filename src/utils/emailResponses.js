import { supabase } from '../lib/supabase';

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
    // A contact can only have one *current* response at a time. This is
    // enforced atomically via upsert on the contact_id unique constraint,
    // so two near-simultaneous calls (e.g. from Contacts.jsx and
    // ContactDetail.jsx) can no longer both succeed and leave duplicate rows.
    await supabase.from('email_responses').upsert({
      contact_id: contactId,
      email_id: email?.id || null,
      owner_id: ownerId,
      response_type: responseType,
      responded_at: at,
    }, { onConflict: 'contact_id' });
  } catch (e) {
    console.error('logEmailResponse failed', e);
  }
}

export async function clearEmailResponse(contactId) {
  try {
    await supabase.from('email_responses').delete().eq('contact_id', contactId);
  } catch (e) {
    console.error('clearEmailResponse failed', e);
  }
}
