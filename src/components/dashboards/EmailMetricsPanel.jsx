import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const STAGE_ORDER = ['Fresh', 'F1', 'F2', 'F3', 'F4', 'F5', 'bounced', 'unsubscribed'];
const STAGE_COLORS = { Fresh: '#3b82f6', F1: '#10b981', F2: '#059669', F3: '#f59e0b', F4: '#ef4444', F5: '#dc2626', bounced: '#991b1b', unsubscribed: '#92400e' };
const RESPONSE_ORDER = ['prospect', 'warm', 'cold', 'not_interested', 'negative'];
const RESPONSE_LABELS = { prospect: 'Prospect', warm: 'Warm', cold: 'Cold', not_interested: 'Not Interested', negative: 'Negative' };
const RESPONSE_COLORS = { prospect: '#059669', warm: '#d97706', cold: '#0369a1', not_interested: '#6b7280', negative: '#dc2626' };

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 7, label: '7d' },
  { key: 14, label: '14d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
];

function computeRange(range, customFrom, customTo) {
  const now = new Date();
  if (range === 'custom' && customFrom && customTo) {
    return { start: new Date(customFrom + 'T00:00:00.000Z'), end: new Date(customTo + 'T23:59:59.999Z') };
  }
  if (range === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (range === 'yesterday') {
    const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const days = Number(range) || 7;
  const start = new Date(now.getTime() - days * 86400000);
  return { start, end: now };
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// Reusable Dashboard panel: emails sent vs. responses received, contacts
// added, accounts added -- for a chosen date range (Today/Yesterday/7-90d/
// custom), scoped to either the viewer's own book or their whole team.
// Shared across SDR/POC/Manager/Director dashboards so the range picker and
// metric definitions stay identical everywhere they appear.
export default function EmailMetricsPanel({ ownIds, teamMembers, showToggle, defaultView }) {
  const teamIds = (teamMembers || []).map(m => m.id);
  const [range, setRange] = useState(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [viewMode, setViewMode] = useState(defaultView || 'my');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pipelineCounts, setPipelineCounts] = useState({});
  const [responseCounts, setResponseCounts] = useState({});
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [dailyEmails, setDailyEmails] = useState([]);

  const scopeIds = (showToggle && viewMode === 'team')
    ? (selectedMemberId ? [selectedMemberId] : (teamIds && teamIds.length ? teamIds : ownIds))
    : ownIds;

  useEffect(() => { load(); }, [range, customFrom, customTo, viewMode, selectedMemberId, JSON.stringify(ownIds), JSON.stringify(teamIds)]);

  async function load() {
    setLoading(true);
    const { start, end } = computeRange(range, customFrom, customTo);
    const startIso = start.toISOString(), endIso = end.toISOString();
    const ids = scopeIds && scopeIds.length ? scopeIds : ['00000000-0000-0000-0000-000000000000'];

    const [{ count: emailsSent }, { count: responses }, { count: contactsAdded }, { data: contactAccRows }] = await Promise.all([
      supabase.from('emails').select('id', { count: 'exact', head: true }).in('owner_id', ids).gte('sent_at', startIso).lte('sent_at', endIso),
      supabase.from('email_responses').select('id', { count: 'exact', head: true }).in('owner_id', ids).gte('responded_at', startIso).lte('responded_at', endIso),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).in('owner_id', ids).gte('created_at', startIso).lte('created_at', endIso),
      supabase.from('contacts').select('account_id').in('owner_id', ids).not('account_id', 'is', null),
    ]);

    const accIds = [...new Set((contactAccRows || []).map(c => c.account_id).filter(Boolean))];
    let accountsAdded = 0;
    if (accIds.length) {
      const { count } = await supabase.from('accounts').select('id', { count: 'exact', head: true }).in('id', accIds).gte('created_at', startIso).lte('created_at', endIso);
      accountsAdded = count || 0;
    }

    setStats({ emailsSent: emailsSent || 0, responses: responses || 0, contactsAdded: contactsAdded || 0, accountsAdded });

    // Snapshot distribution of the scoped book right now -- not date-ranged,
    // since stage/response_type are current-state fields, not dated events.
    const { data: bookContacts } = await supabase.from('contacts').select('status, response_type').in('owner_id', ids);
    const pc = {};
    STAGE_ORDER.forEach(s => { pc[s] = 0; });
    (bookContacts || []).forEach(c => { if (STAGE_ORDER.includes(c.status)) pc[c.status] = (pc[c.status] || 0) + 1; });
    setPipelineCounts(pc);
    const rc = {};
    RESPONSE_ORDER.forEach(r => { rc[r] = 0; });
    (bookContacts || []).forEach(c => { if (c.response_type && RESPONSE_ORDER.includes(c.response_type)) rc[c.response_type] = (rc[c.response_type] || 0) + 1; });
    setResponseCounts(rc);

    // Day-by-day breakdown of emails sent within the selected range.
    const { data: dailyRows } = await supabase.from('emails').select('sent_at').in('owner_id', ids).gte('sent_at', startIso).lte('sent_at', endIso);
    const dayMap = {};
    (dailyRows || []).forEach(r => {
      const d = new Date(r.sent_at);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      dayMap[key] = (dayMap[key] || 0) + 1;
    });
    setDailyEmails(Object.keys(dayMap).sort().map(k => ({ date: k, count: dayMap[k] })));

    setLoading(false);
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Email activity</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {showToggle && teamIds && teamIds.length > 0 && (
            <div style={{ display: 'flex', gap: 4, background: '#f5f5f3', borderRadius: 8, padding: 3 }}>
              {['my', 'team'].map(m => (
                <button key={m} onClick={() => { setViewMode(m); if (m === 'my') setSelectedMemberId(''); }}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: viewMode === m ? '#fff' : 'transparent', color: viewMode === m ? '#111' : '#888',
                    boxShadow: viewMode === m ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {m === 'my' ? 'My view' : 'Team view'}
                </button>
              ))}
            </div>
          )}
          {showToggle && viewMode === 'team' && teamMembers && teamMembers.length > 0 && (
            <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #e8e8e4', color: '#333', background: '#fff' }}>
              <option value="">All team members</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name || 'Unnamed'}</option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: 4, background: '#f5f5f3', borderRadius: 8, padding: 3 }}>
            {RANGE_OPTIONS.map(o => (
              <button key={o.key} onClick={() => { setRange(o.key); setShowCustom(false); }}
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: range === o.key ? '#fff' : 'transparent', color: range === o.key ? '#111' : '#888',
                  boxShadow: range === o.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                {o.label}
              </button>
            ))}
            <button onClick={() => setShowCustom(s => !s)}
              style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: range === 'custom' ? '#fff' : 'transparent', color: range === 'custom' ? '#111' : '#888',
                boxShadow: range === 'custom' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              Custom
            </button>
          </div>
        </div>
      </div>
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #e8e8e4' }} />
          <span style={{ fontSize: 12, color: '#888' }}>to</span>
          <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #e8e8e4' }} />
          <button onClick={() => { if (customFrom && customTo) setRange('custom'); }}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#2563eb', color: '#fff' }}>
            Apply
          </button>
        </div>
      )}
      {loading || !stats ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '10px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Emails sent" value={stats.emailsSent} color="#2563eb" />
          <StatCard label="Responses received" value={stats.responses}
            sub={stats.emailsSent ? `${Math.round((stats.responses / stats.emailsSent) * 1000) / 10}% reply rate` : null} color="#059669" />
          <StatCard label="Contacts added" value={stats.contactsAdded} color="#7c3aed" />
          <StatCard label="Accounts added" value={stats.accountsAdded} color="#d97706" />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16, paddingTop: 16, borderTop: '0.5px solid #f0f0ee' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pipeline by stage</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STAGE_ORDER.map(s => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: '#555' }}>{s}</span>
                <span style={{ fontWeight: 700, color: STAGE_COLORS[s] }}>{pipelineCounts[s] || 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responses by type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RESPONSE_ORDER.map(r => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: '#555' }}>{RESPONSE_LABELS[r]}</span>
                <span style={{ fontWeight: 700, color: RESPONSE_COLORS[r] }}>{responseCounts[r] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {dailyEmails.length > 0 && (() => {
        const maxDaily = Math.max(...dailyEmails.map(x => x.count), 1);
        return (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid #f0f0ee' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Emails sent by day</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {dailyEmails.map(d => (
                <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ width: 86, color: '#555', flexShrink: 0 }}>{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <div style={{ flex: 1, height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(d.count / maxDaily) * 100}%`, background: '#2563eb', borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 28, textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
