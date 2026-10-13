import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ACTIVE_STATUSES_EXCLUDE = ['won', 'lost', 'bounced', 'unsubscribed'];

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function Mailboxes() {
  const { user } = useAuth();
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // add form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newCap, setNewCap] = useState(50);
  const [saving, setSaving] = useState(false);

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCap, setEditCap] = useState(50);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, sender_account_id, status')
      .eq('owner_id', user.id)
      .not('sender_account_id', 'is', null);

    const contactIds = (contacts || []).map(c => c.id);
    let emailsToday = [];
    if (contactIds.length > 0) {
      const { data } = await supabase
        .from('emails')
        .select('contact_id')
        .eq('direction', 'outbound')
        .gte('sent_at', startOfTodayISO())
        .in('contact_id', contactIds);
      emailsToday = data || [];
    }

    const contactById = Object.fromEntries((contacts || []).map(c => [c.id, c]));

    const stats = {};
    (accounts || []).forEach(a => { stats[a.id] = { active: 0, sentToday: 0 }; });
    (contacts || []).forEach(c => {
      if (!stats[c.sender_account_id]) return;
      if (!ACTIVE_STATUSES_EXCLUDE.includes(c.status)) stats[c.sender_account_id].active += 1;
    });
    emailsToday.forEach(e => {
      const c = contactById[e.contact_id];
      if (c && stats[c.sender_account_id]) stats[c.sender_account_id].sentToday += 1;
    });

    setMailboxes((accounts || []).map(a => ({ ...a, ...stats[a.id] })));
    setLoading(false);
  }

  async function addMailbox() {
    const email = newEmail.trim().toLowerCase();
    if (!email) { setMsg('Enter an email address.'); return; }
    setSaving(true);
    setMsg('');
    const { error } = await supabase.from('email_accounts').insert({
      user_id: user.id,
      email_address: email,
      label: newLabel.trim() || null,
      daily_send_cap: Number(newCap) || 50,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      setMsg(error.code === '23505' ? 'That mailbox is already registered.' : `Error: ${error.message}`);
      return;
    }
    setNewEmail(''); setNewLabel(''); setNewCap(50); setShowAdd(false);
    load();
  }

  async function toggleActive(mb) {
    await supabase.from('email_accounts').update({ is_active: !mb.is_active }).eq('id', mb.id);
    load();
  }

  function startEdit(mb) {
    setEditingId(mb.id);
    setEditLabel(mb.label || '');
    setEditCap(mb.daily_send_cap);
  }

  async function saveEdit(id) {
    await supabase.from('email_accounts').update({ label: editLabel.trim() || null, daily_send_cap: Number(editCap) || 50 }).eq('id', id);
    setEditingId(null);
    load();
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Mailboxes</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
            Register the sending accounts you use for outreach. Once a contact is assigned to a mailbox, it stays locked to that mailbox for its whole thread.
          </p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}>
          + Add Mailbox
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#fff', border: '1px solid #e8e8e4', borderRadius: 10, padding: 18, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>Email address</label>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@accelq.com"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>Label</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Primary"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }} />
          </div>
          <div style={{ width: 110 }}>
            <label style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>Daily cap</label>
            <input type="number" value={newCap} onChange={e => setNewCap(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }} />
          </div>
          <button onClick={addMailbox} disabled={saving}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {msg && <span style={{ fontSize: 12, color: '#dc2626', width: '100%' }}>{msg}</span>}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>Loading…</div>
      ) : mailboxes.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4' }}>
          No mailboxes registered yet. Add the accounts you send outreach from so contacts can be assigned to them and load can be tracked.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
                {['Mailbox', 'Label', 'Active Contacts', 'Sent Today', 'Daily Cap', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mailboxes.map(mb => {
                const nearCap = mb.sentToday >= mb.daily_send_cap;
                return (
                  <tr key={mb.id} style={{ borderBottom: '1px solid #f4f4f4' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111' }}>{mb.email_address}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {editingId === mb.id
                        ? <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12, width: 100 }} />
                        : <span style={{ color: '#666' }}>{mb.label || '—'}</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#444' }}>{mb.active}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: nearCap ? '#dc2626' : '#444', fontWeight: nearCap ? 600 : 400 }}>{mb.sentToday}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {editingId === mb.id
                        ? <input type="number" value={editCap} onChange={e => setEditCap(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12, width: 70 }} />
                        : <span style={{ color: '#666' }}>{mb.daily_send_cap}</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: mb.is_active ? '#f0fdf4' : '#f1f5f9', color: mb.is_active ? '#166534' : '#64748b' }}>
                        {mb.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {editingId === mb.id ? (
                          <>
                            <button onClick={() => saveEdit(mb.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#888', cursor: 'pointer' }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(mb)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>Edit</button>
                            <button onClick={() => toggleActive(mb)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#888', cursor: 'pointer' }}>
                              {mb.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
