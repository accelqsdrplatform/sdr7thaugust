import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const RESPONSE_STYLE = {
  cold:          { bg: '#f1f5f9', color: '#475569', label: 'Cold' },
  negative:      { bg: '#fee2e2', color: '#991b1b', label: 'Negative' },
  not_interested:{ bg: '#fef3c7', color: '#92400e', label: 'Not Interested' },
  warm:          { bg: '#fef9c3', color: '#854d0e', label: 'Warm' },
  prospect:      { bg: '#dcfce7', color: '#15803d', label: 'Prospect' },
};

const STATUS_STYLE = {
  Fresh:        { bg: '#e0f2fe', color: '#0369a1' },
  F1:           { bg: '#f0fdf4', color: '#166534' },
  F2:           { bg: '#dcfce7', color: '#15803d' },
  F3:           { bg: '#fef9c3', color: '#854d0e' },
  F4:           { bg: '#ffedd5', color: '#9a3412' },
  F5:           { bg: '#fce7f3', color: '#9d174d' },
  won:          { bg: '#d1fae5', color: '#065f46' },
  lost:         { bg: '#f1f5f9', color: '#475569' },
  bounced:      { bg: '#fee2e2', color: '#991b1b' },
  unsubscribed: { bg: '#fef3c7', color: '#92400e' },
};

const RESPONSE_ORDER = ['prospect', 'warm', 'cold', 'not_interested', 'negative'];

function fmt(d) { return d ? new Date(d).toLocaleDateString() : '—'; }
function contactName(c) { return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—'; }

export default function Responses() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [responseFilter, setResponseFilter] = useState('all');
  const [viewAll, setViewAll] = useState(false);
  const [editingNotes, setEditingNotes] = useState(null); // contact id being edited
  const [notesDraft, setNotesDraft] = useState('');
  const canViewAll = profile?.role === 'director' || profile?.role === 'manager' || profile?.role === 'poc';

  useEffect(() => { load(); }, [viewAll]);

  // Paginated up to an explicit cap instead of a single unbounded fetch --
  // avoids Supabase's silent 1000-row return cap as response volume grows,
  // while still bounding how much ever lands in one browser tab.
  const RESPONSES_LIMIT = 5000;
  async function fetchResponseRows(scopedToMe) {
    const rows = [];
    let from = 0;
    for (;;) {
      let q = supabase.from('contacts').select('*').not('response_type', 'is', null).order('last_touchpoint_date', { ascending: false, nullsFirst: false });
      if (scopedToMe) q = q.eq('owner_id', user.id);
      const { data } = await q.range(from, from + 999);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (rows.length >= RESPONSES_LIMIT || data.length < 1000) break;
      from += 1000;
    }
    return rows.slice(0, RESPONSES_LIMIT);
  }

  async function load() {
    setLoading(true);
    const rows = await fetchResponseRows(!viewAll || !canViewAll);
    setContacts(rows);
    setLoading(false);
  }

  async function saveNotes(id) {
    await supabase.from('contacts').update({ response_notes: notesDraft }).eq('id', id);
    setContacts(prev => prev.map(ct => ct.id === id ? { ...ct, response_notes: notesDraft } : ct));
    setEditingNotes(null);
  }

  function startEditNotes(c) {
    setNotesDraft(c.response_notes || '');
    setEditingNotes(c.id);
  }

  async function clearResponse(id) {
    await supabase.from('contacts').update({ response_type: null }).eq('id', id);
    setContacts(prev => prev.filter(c => c.id !== id));
  }

  const filtered = contacts.filter(c => {
    if (responseFilter !== 'all' && c.response_type !== responseFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return contactName(c).toLowerCase().includes(s) || (c.company || '').toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s);
    }
    return true;
  });

  const grouped = RESPONSE_ORDER.map(rt => ({
    rt,
    items: filtered.filter(c => c.response_type === rt),
  })).filter(g => g.items.length > 0);

  const counts = {};
  RESPONSE_ORDER.forEach(rt => { counts[rt] = contacts.filter(c => c.response_type === rt).length; });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Responses</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>Contacts who have replied or been marked with a response</p>
        </div>
        {canViewAll && (
          <button onClick={() => setViewAll(!viewAll)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: viewAll ? '#2563eb' : '#fff', color: viewAll ? '#fff' : '#555', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
            {viewAll ? 'My team' : 'My contacts'}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {RESPONSE_ORDER.map(rt => {
          const rs = RESPONSE_STYLE[rt];
          return (
            <div key={rt} onClick={() => setResponseFilter(responseFilter === rt ? 'all' : rt)}
              style={{ padding: '12px 18px', borderRadius: 10, border: `2px solid ${responseFilter === rt ? rs.color : '#e8e8e4'}`, background: responseFilter === rt ? rs.bg : '#fff', cursor: 'pointer', minWidth: 110 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: rs.color }}>{counts[rt] || 0}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{rs.label}</div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, email…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, outline: 'none' }} />
        {(search || responseFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setResponseFilter('all'); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4' }}>
          {contacts.length === 0 ? 'No responses recorded yet. Mark a contact\'s response from the Contacts page.' : 'No contacts match your filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(responseFilter === 'all' ? grouped : grouped).map(({ rt, items }) => {
            const rs = RESPONSE_STYLE[rt];
            return (
              <div key={rt}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: rs.bg, color: rs.color }}>{rs.label}</span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{items.length} contact{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
                        {['Name', 'Company', 'Email', 'Title', 'Stage', 'Date Added', 'Last Reached Out', 'Response Received', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(c => {
                        const ss = STATUS_STYLE[c.status] || { bg: '#f1f5f9', color: '#475569' };
                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f4f4f4' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '10px 14px' }}>
                              <button onClick={() => navigate(`/contacts/${c.id}`)}
                                style={{ fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                                {contactName(c)}
                              </button>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#444' }}>{c.company || '—'}</td>
                            <td style={{ padding: '10px 14px', color: '#666' }}>{c.email || '—'}</td>
                            <td style={{ padding: '10px 14px', color: '#666' }}>{c.title || '—'}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: ss.bg, color: ss.color, fontWeight: 600 }}>{c.status}</span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>{fmt(c.created_at)}</td>
                            <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>{fmt(c.last_touchpoint_date)}</td>
                            <td style={{ padding: '10px 14px', maxWidth: 220 }}>
                              {editingNotes === c.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <textarea
                                    value={notesDraft}
                                    onChange={e => setNotesDraft(e.target.value)}
                                    placeholder="What did the contact say?"
                                    rows={3}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2563eb', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                                    autoFocus
                                  />
                                  <div style={{ display: 'flex', gap: 5 }}>
                                    <button onClick={() => saveNotes(c.id)}
                                      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                                      Save
                                    </button>
                                    <button onClick={() => setEditingNotes(null)}
                                      style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#888', fontSize: 11, cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div onClick={() => startEditNotes(c)}
                                  style={{ cursor: 'pointer', minHeight: 28, padding: '4px 6px', borderRadius: 6, border: '1px solid transparent' }}
                                  onMouseEnter={e => e.currentTarget.style.border = '1px solid #e0e0e0'}
                                  onMouseLeave={e => e.currentTarget.style.border = '1px solid transparent'}
                                  title="Click to add/edit response notes">
                                  {c.response_notes
                                    ? <span style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>{c.response_notes}</span>
                                    : <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>Click to add notes…</span>
                                  }
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => navigate(`/contacts/${c.id}`)}
                                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>
                                  View
                                </button>
                                <button onClick={() => clearResponse(c.id)}
                                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#888', cursor: 'pointer' }}
                                  title="Clear response — moves contact back to queue">
                                  Clear
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
