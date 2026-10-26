import { supabase } from '../lib/supabase';
import { logEmailResponse } from './emailResponses';

/**
 * Single source of truth for marking a contact as bounced.
 * Every place in the app that can mark a bounce (Contacts list status
 * dropdown, ContactDetail status dropdown, ContactDetail Bounce button,
 * ContactDetail response tag) should call this instead of writing the
 * fields directly, so status, bounced, bounced_at, and response_state
 * always stay in sync.
 */
export async function markContactBounced(contactId, actorId, reason) {
  const bounced_at = new Date().toISOString();
  const { error } = await supabase.from('contacts').update({
    status: 'bounced',
    bounced: true,
    bounced_at,
    response_state: 'Bounce',
    last_touchpoint_date: bounced_at,
  }).eq('id', contactId);
  if (error) throw error;
  await supabase.from('activity_log').insert({
    actor_id: actorId,
    contact_id: contactId,
    activity_type: 'bounce_detected',
    details: reason ? { reason } : {},
  });
  await logEmailResponse(contactId, actorId, 'bounce', bounced_at);
}
