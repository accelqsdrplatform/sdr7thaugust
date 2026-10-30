import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const STAGE_ORDER = ['freshYetToContact', 'Fresh', 'F1', 'F2', 'F3', 'F4', 'F5', 'bounced'];
const STAGE_COLORS = { freshYetToContact: '#94a3b8', Fresh: '#3b82f6', F1: '#10b981', F2: '#059669', F3: '#f59e0b', F4: '#ef4444', F5: '#dc2626', bounced: '#991b1b', unsubscribed: '#92400e' };
const RESPONSE_ORDER = ['prospect', 'warm', 'not_interested', 'negative'];
const RESPONSE_LABELS = { prospect: 'Prospect', warm: 'Warm', not_interested: 'Not Interested', negative: 'Negative' };
const RESPONSE_COLORS = { prospect: '#059669', warm: '#d97706', not_interested: '#6b7280', negative: '#dc2626' };
const STAGE_LABELS = { unsubscribed: 'Negative', freshYetToContact: 'Yet to Contact' };

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 7, label: '7d' },
  { key: 14, label: '14d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
];

// Pipeline/response/accounts counts come from the email_metrics_breakdown
// Postgres function (counts computed in the DB, nothing shipped row-by-row)
// so this stays fast no matter how large the contacts table gets -- see
// add_email_metrics_breakdown_rpc.sql.
//
// The drill-down list still needs actual rows, but only for the one bucket
// the person clicked (not the whole book), and capped so a bucket with
// lakhs of contacts doesn't try to load them all into a dialog.
const DRILLDOWN_CAP = 500;
async function fetchDrillDownRows(ids, field, value, applyExtra) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from('contacts').select('id, first_name, last_name, company, title, owner_id').in('owner_id', ids).eq(field, value);
    if (applyExtra) q = applyExtra(q);
    const { data } = await q.range(from, from + 999);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (rows.length >= DRILLDOWN_CAP || data.length < 1000) break;
    from += 1000;
  }
  return rows.slice(0, DRILLDOWN_CAP);
}

// Response-type drill-down: sources from email_responses (the same table the
// top-line "Responses received" stat and the per-type counts come from) and
// is scoped to the panel's current date range, so the drill-down list always
// matches the number shown on the card -- unlike a plain contacts.response_type
// lookup, which only reflects a contact's *current* classification and ignores
// the date range entirely.
async function fetchResponseDrillDownRows(ids, responseType, startIso, endIso) {
  const responses = [];
  let from = 0;
  for (;;) {
    const { data } = await supabase
      .from('email_responses')
      .select('id, contact_id, owner_id, responded_at')
      .in('owner_id', ids)
      .eq('response_type', responseType)
      .gte('responded_at', startIso)
      .lte('responded_at', endIso)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    responses.push(...data);
    if (responses.length >= DRILLDOWN_CAP || data.length < 1000) break;
    from += 1000;
  }
  const capped = responses.slice(0, DRILLDOWN_CAP);
  const contactIds = [...new Set(capped.map(r => r.contact_id).filter(Boolean))];
  const contactById = {};
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const { data } = await supabase.from('contacts').select('id, first_name, last_name, company, title').in('id', chunk);
    (data || []).forEach(c => { contactById[c.id] = c; });
  }
  return capped.map(r => ({
    id: r.id,
    contact_id: r.contact_id,
    owner_id: r.owner_id,
    responded_at: r.responded_at,
    ...(contactById[r.contact_id] || {}),
  }));
}

function groupDrillDownRowsByOwner(rows, ownerNameById) {
  const map = new Map();
  for (const r of rows) {
    const key = r.owner_id || 'unknown';
    if (!map.has(key)) map.set(key, { ownerId: key, ownerName: ownerNameById[key] || 'Unassigned', contacts: [] });
    map.get(key).contacts.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.contacts.length - a.contacts.length);
}

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
  const ownerNameById = Object.fromEntries((teamMembers || []).map(m => [m.id, m.name]));
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
  const [dailyStageCols, setDailyStageCols] = useState([]);
  const navigate = useNavigate();
  const [drillDown, setDrillDown] = useState(null); // { title, contacts, total, loading }

  const scopeIds = (showToggle && viewMode === 'team')
    ? (selectedMemberId ? [selectedMemberId] : (teamIds && teamIds.length ? teamIds : ownIds))
    : ownIds;

  useEffect(() => { load(); }, [range, customFrom, customTo, viewMode, selectedMemberId, JSON.stringify(ownIds), JSON.stringify(teamIds)]);

  async function openDrillDown(field, value, title) {
    const ids = scopeIds && scopeIds.length ? scopeIds : ['00000000-0000-0000-0000-000000000000'];
    if (field === 'response_type') {
      setDrillDown({ mode: 'response', title, groups: [], expandedOwnerId: null, loading: true });
      const { start, end } = computeRange(range, customFrom, customTo);
      const rows = await fetchResponseDrillDownRows(ids, value, start.toISOString(), end.toISOString());
      const groups = groupDrillDownRowsByOwner(rows, ownerNameById);
      setDrillDown({ mode: 'response', title, groups, expandedOwnerId: null, loading: false });
      return;
    }
    if (field === 'status' && (value === 'Fresh' || value === 'freshYetToContact')) {
      const queued = value === 'Fresh';
      const applyExtra = q => (queued ? q.not('next_followup', 'is', null) : q.is('next_followup', null));
      setDrillDown({ mode: 'status', title, contacts: [], total: null, loading: true });
      const [{ count: total }, rows] = await Promise.all([
        applyExtra(supabase.from('contacts').select('id', { count: 'exact', head: true }).in('owner_id', ids).eq('status', 'Fresh')),
        fetchDrillDownRows(ids, 'status', 'Fresh', applyExtra),
      ]);
      setDrillDown({ mode: 'status', title, contacts: rows, total: total || 0, loading: false });
      return;
    }
    setDrillDown({ mode: 'status', title, contacts: [], total: null, loading: true });
    const [{ count: total }, rows] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).in('owner_id', ids).eq(field, value),
      fetchDrillDownRows(ids, field, value),
    ]);
    setDrillDown({ mode: 'status', title, contacts: rows, total: total || 0, loading: false });
  }

  async function load() {
    setLoading(true);
    const { start, end } = computeRange(range, customFrom, customTo);
    const startIso = start.toISOString(), endIso = end.toISOString();
    const ids = scopeIds && scopeIds.length ? scopeIds : ['00000000-0000-0000-0000-000000000000'];

    const [{ count: emailsSent }, { count: responses }, { count: contactsAdded }, breakdownRes, dailyRowsRes, { count: freshYetToContact }] = await Promise.all([
      supabase.from('emails').select('id', { count: 'exact', head: true }).in('owner_id', ids).gte('sent_at', startIso).lte('sent_at', endIso),
      supabase.from('email_responses').select('id', { count: 'exact', head: true }).in('owner_id', ids).in('response_type', RESPONSE_ORDER).gte('responded_at', startIso).lte('responded_at', endIso),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).in('owner_id', ids).gte('created_at', startIso).lte('created_at', endIso),
      // Pipeline/response/accounts-added counts computed inside Postgres via
      // email_metrics_breakdown() -- see add_email_metrics_breakdown_rpc.sql.
      // Stays a single fast round trip no matter how large contacts gets.
      supabase.rpc('email_metrics_breakdown', { ids, start_ts: startIso, end_ts: endIso }).single(),
      supabase.from('emails').select('sent_at, stage').in('owner_id', ids).gte('sent_at', startIso).lte('sent_at', endIso),
      // Fresh splits into "Yet to Contact" (never enrolled -- no next_followup
      // set) vs. "Fresh" (enrolled and waiting in the Follow-up Queue), so the
      // pipeline card matches what the queue actually shows.
      supabase.from('contacts').select('id', { count: 'exact', head: true }).in('owner_id', ids).eq('status', 'Fresh').is('next_followup', null),
    ]);
    const breakdown = breakdownRes.data;
    const accountsAdded = breakdown?.accounts_added || 0;
    const dailyRows = dailyRowsRes.data;

    setStats({ emailsSent: emailsSent || 0, responses: responses || 0, contactsAdded: contactsAdded || 0, accountsAdded });

    const pc = {};
    STAGE_ORDER.forEach(s => { pc[s] = (breakdown?.stage_counts || {})[s] || 0; });
    pc.freshYetToContact = freshYetToContact || 0;
    pc.Fresh = Math.max(0, (pc.Fresh || 0) - pc.freshYetToContact);
    setPipelineCounts(pc);
    const rc = {};
    RESPONSE_ORDER.forEach(r => { rc[r] = (breakdown?.response_counts || {})[r] || 0; });
    setResponseCounts(rc);

    // Day-by-day breakdown of emails sent within the selected range, split
    // by the stage the contact was in when each email went out -- new stage
    // columns appear automatically as they show up in the data.
    const dayStageMap = {};
    const stagesSeen = new Set();
    (dailyRows || []).forEach(r => {
      const d = new Date(r.sent_at);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const stg = r.stage || 'Unknown';
      stagesSeen.add(stg);
      if (!dayStageMap[key]) dayStageMap[key] = {};
      dayStageMap[key][stg] = (dayStageMap[key][stg] || 0) + 1;
    });
    const stageCols = STAGE_ORDER.filter(s => stagesSeen.has(s)).concat([...stagesSeen].filter(s => !STAGE_ORDER.includes(s)));
    setDailyStageCols(stageCols);
    setDailyEmails(Object.keys(dayStageMap).sort().map(k => {
      const counts = dayStageMap[k];
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { date: k, counts, total };
    }));

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
              <div key={s} onClick={() => (pipelineCounts[s] || 0) > 0 && openDrillDown('status', s, (STAGE_LABELS[s] || s) + ' -- Pipeline by stage')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, cursor: (pipelineCounts[s] || 0) > 0 ? 'pointer' : 'default' }}>
                <span style={{ color: '#555' }}>{STAGE_LABELS[s] || s}</span>
                <span style={{ fontWeight: 700, color: STAGE_COLORS[s] }}>{pipelineCounts[s] || 0}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responses by type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RESPONSE_ORDER.map(r => (
              <div key={r} onClick={() => (responseCounts[r] || 0) > 0 && openDrillDown('response_type', r, RESPONSE_LABELS[r] + ' -- Responses by type')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, cursor: (responseCounts[r] || 0) > 0 ? 'pointer' : 'default' }}>
                <span style={{ color: '#555' }}>{RESPONSE_LABELS[r]}</span>
                <span style={{ fontWeight: 700, color: RESPONSE_COLORS[r] }}>{responseCounts[r] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {dailyEmails.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid #f0f0ee' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Emails sent by day</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #f0f0ee' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>Date</th>
                  {dailyStageCols.map(s => (
                    <th key={s} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#999', fontWeight: 500 }}>{s}</th>
                  ))}
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#999', fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyEmails.map(d => (
                  <tr key={d.date} style={{ borderBottom: '0.5px solid #f5f5f3' }}>
                    <td style={{ padding: '6px 10px', color: '#555', whiteSpace: 'nowrap' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                    {dailyStageCols.map(s => (
                      <td key={s} style={{ padding: '6px 10px', textAlign: 'right', color: STAGE_COLORS[s] || '#555' }}>{d.counts[s] || 0}</td>
                    ))}
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{d.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {drillDown && (
        <div onClick={() => setDrillDown(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 20, width: 420, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {drillDown.mode === 'response' && drillDown.expandedOwnerId
                  ? (drillDown.groups.find(g => g.ownerId === drillDown.expandedOwnerId)?.ownerName || 'Unassigned')
                  : drillDown.title}
              </div>
              <span onClick={() => setDrillDown(null)} style={{ cursor: 'pointer', color: '#888', fontSize: 18, lineHeight: 1 }}>&times;</span>
            </div>
            {drillDown.mode === 'response' && drillDown.expandedOwnerId && (
              <div onClick={() => setDrillDown({ ...drillDown, expandedOwnerId: null })} style={{ cursor: 'pointer', color: '#2563eb', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>&larr; Back to all reps</div>
            )}
            {drillDown.loading ? (
              <div style={{ color: '#888', fontSize: 13 }}>Loading...</div>
            ) : drillDown.mode === 'response' ? (
              drillDown.groups.length === 0 ? (
                <div style={{ color: '#888', fontSize: 13 }}>No responses found.</div>
              ) : drillDown.expandedOwnerId ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(drillDown.groups.find(g => g.ownerId === drillDown.expandedOwnerId)?.contacts || []).map(c => (
                    <div key={c.id} onClick={() => { setDrillDown(null); navigate('/contacts/' + c.contact_id); }} style={{ display: 'block', padding: '8px 10px', borderRadius: 7, border: '1px solid #f0f0ee', cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{[c.title, c.company].filter(Boolean).join(' at ')}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {drillDown.groups.map(g => (
                    <div key={g.ownerId} onClick={() => setDrillDown({ ...drillDown, expandedOwnerId: g.ownerId })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 7, border: '1px solid #f0f0ee', cursor: 'pointer' }}>
                      <span style={{ fontSize: 13, color: '#222' }}>{g.ownerName}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{g.contacts.length}</span>
                    </div>
                  ))}
                </div>
              )
            ) : drillDown.contacts.length === 0 ? (
              <div style={{ color: '#888', fontSize: 13 }}>No contacts found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drillDown.total != null && drillDown.total > drillDown.contacts.length && (
                  <div style={{ color: '#888', fontSize: 11.5 }}>Showing first {drillDown.contacts.length} of {drillDown.total}</div>
                )}
                {drillDown.contacts.map(c => (
                  <div key={c.id} onClick={() => { setDrillDown(null); navigate('/contacts/' + c.id); }} style={{ display: 'block', padding: '8px 10px', borderRadius: 7, border: '1px solid #f0f0ee', cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{[c.title, c.company].filter(Boolean).join(' at ')}</div>
                    {ownerNameById[c.owner_id] && (
                      <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>Owner: {ownerNameById[c.owner_id]}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: '#aaa' }}>This shows who is currently classified this way -- the platform doesn't store the actual reply text, only the classification a rep assigns.</div>
          </div>
        </div>
      )}
    </div>
  );
}
