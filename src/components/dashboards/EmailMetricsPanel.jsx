import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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
export default function EmailMetricsPanel({ ownIds, teamIds, showToggle, defaultView }) {
  const [range, setRange] = useState(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [viewMode, setViewMode] = useState(defaultView || 'my');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const scopeIds = (showToggle && viewMode === 'team' && teamIds && teamIds.length) ? teamIds : ownIds;

  useEffect(() => { load(); }, [range, customFrom, customTo, viewMode, JSON.stringify(ownIds), JSON.stringify(teamIds)]);

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
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: viewMode === m ? '#fff' : 'transparent', color: viewMode === m ? '#111' : '#888',
                    boxShadow: viewMode === m ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {m === 'my' ? 'My view' : 'Team view'}
                </button>
              ))}
            </div>
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
    </div>
  );
}
