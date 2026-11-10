import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import EmailMetricsPanel from './EmailMetricsPanel';

export default function DirectorDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ total: 0, contacted: 0, replies: 0, meetings: 0, won: 0, bounced: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [activity, setActivity] = useState([]);
  const [teamIds, setTeamIds] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [sdrList, setSdrList] = useState([]);
  const [dateRange, setDateRange] = useState(() => ({ start: new Date(Date.now() - 7 * 86400000), end: new Date() }));

  useEffect(() => {
    async function load() {
      // Org-wide counts use Postgres head-counts instead of pulling every
      // contact row into the browser -- at 10 lakh+ contacts, downloading
      // and filtering the whole table client-side would be slow and
      // memory-heavy on every dashboard load.
      async function countContacts(build) {
        const { count } = await build(supabase.from('contacts').select('*', { count: 'exact', head: true }));
        return count || 0;
      }

      const [total, contacted, replies, meetings, won, bounced, yetToContact, { data: allHierarchy }, { data: acts }] = await Promise.all([
        countContacts(q => q.eq('bounced', false)),
        countContacts(q => q.eq('bounced', false).neq('status', 'Fresh')),
        countContacts(q => q.in('status', ['replied', 'meeting', 'won'])),
        countContacts(q => q.eq('status', 'meeting')),
        countContacts(q => q.eq('status', 'won')),
        countContacts(q => q.eq('bounced', true)),
        // Yet to Contact == Fresh with no follow-up ever scheduled (never
        // enrolled) -- same definition EmailMetricsPanel uses for its
        // pipeline-by-stage card, so "Active contacts" matches what the
        // org actually has in motion rather than counting untouched leads.
        countContacts(q => q.eq('bounced', false).eq('status', 'Fresh').is('next_followup', null)),
        supabase.from('org_hierarchy').select('*'),
        supabase.from('activity_log')
          .select('*, contacts(full_name,company), org_hierarchy!actor_id(full_name,role)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setStats({ total: total - yetToContact, contacted, replies, meetings, won, bounced });
      setActivity(acts || []);

      // Leaderboard: owners only, ranked by replies -- per-owner stats come
      // from the team_stats_by_owner RPC (server-side aggregation) rather
      // than filtering a full contacts pull, for the same scale reason.
      const sdrs = (allHierarchy || []).filter(h => h.role === 'owner');

      // Team view picker (Email activity panel): everyone, not just owners --
      // sub-admins also own and work contacts, and were previously missing
      // from this dropdown entirely since it reused the owners-only list.
      const everyone = allHierarchy || [];
      setTeamIds(everyone.map(s => s.user_id));
      setTeamMembers(everyone.map(s => ({ id: s.user_id, name: s.full_name })));

      setSdrList(sdrs);
    }
    load();
  }, []);

  async function loadLeaderboard(sdrs, ids, range) {
    if (!ids.length || !range) { setLeaderboard([]); return; }
    const { data: statsRows } = await supabase.rpc('team_stats_by_owner_scored', {
      ids,
      start_ts: range.start.toISOString(),
      end_ts: range.end.toISOString(),
    });
    const statsByOwner = Object.fromEntries((statsRows || []).map(r => [r.owner_id, r]));
    const blank = {
      active: 0, yet_to_contact: 0, replies: 0, meetings: 0, won: 0, bounced: 0,
      new_contacts: 0, emails_fresh: 0, emails_f1: 0, emails_f2: 0, emails_f3: 0, emails_f4: 0, emails_f5: 0,
      templated_step1: 0, templated_step2: 0, prospect_responses: 0, warm_responses: 0,
      not_interested_responses: 0, negative_responses: 0, total_responses: 0, activity_count: 0,
      contacts_ai: 0, contacts_templated: 0, total_accounts: 0, accounts_added: 0, active_accounts: 0, inactive_accounts: 0,
    };
    const rows = sdrs.map(s => ({ id: s.id, name: s.full_name, region: s.region, ...(statsByOwner[s.user_id] || blank) }));

    // Composite score, agreed weighting: Prospect responses 20%, any response
    // 10%, new contacts added 20%, active contacts (excl. Yet to Contact) 20%,
    // platform activity 10%, account coverage 20%. Count-based factors are
    // normalized against the best performer in the selected range (0..1)
    // before weighting, so one rep's larger book doesn't set the scale for
    // everyone; account coverage is already a 0..1 ratio.
    const maxOf = key => Math.max(1, ...rows.map(r => r[key] || 0));
    const maxProspect = maxOf('prospect_responses');
    const maxAnyResponse = maxOf('total_responses');
    const maxNewContacts = maxOf('new_contacts');
    const maxActive = maxOf('active');
    const maxActivity = maxOf('activity_count');

    const scored = rows.map(r => {
      const coverage = r.total_accounts > 0 ? r.active_accounts / r.total_accounts : 0;
      const score = Math.round(100 * (
        0.20 * (r.prospect_responses / maxProspect) +
        0.10 * (r.total_responses / maxAnyResponse) +
        0.20 * (r.new_contacts / maxNewContacts) +
        0.20 * (r.active / maxActive) +
        0.10 * (r.activity_count / maxActivity) +
        0.20 * coverage
      ));
      return { ...r, coveragePct: Math.round(coverage * 100), score,
        rate: r.active ? Math.round((r.replies / r.active) * 100) : 0 };
    }).sort((a, b) => b.score - a.score);

    setLeaderboard(scored);
  }

  useEffect(() => {
    const ids = sdrList.map(s => s.user_id);
    loadLeaderboard(sdrList, ids, dateRange);
  }, [sdrList, dateRange && dateRange.start && dateRange.start.getTime(), dateRange && dateRange.end && dateRange.end.getTime()]);

  const replyRate = stats.total ? Math.round((stats.replies / stats.total) * 100) : 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Org overview</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{profile?.full_name} · Admin · All teams</p>
      </div>

      <EmailMetricsPanel ownIds={[user.id]} teamMembers={teamMembers} showToggle defaultView="team" onRangeChange={setDateRange} />

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Active contacts', value: stats.total },
          { label: 'Contacted', value: stats.contacted },
          { label: 'Replies', value: stats.replies, color: '#059669' },
          { label: 'Meetings', value: stats.meetings, color: '#7c3aed' },
          { label: 'Won', value: stats.won, color: '#16a34a' },
          { label: 'Bounced', value: stats.bounced, color: '#dc2626' },
        ].map(m => (
          <div key={m.label} style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: m.color || '#111' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Org rate */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#0369a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Org-wide reply rate</span>
        <strong style={{ fontSize: 18 }}>{replyRate}%</strong>
      </div>

            {/* Leaderboard */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Owner leaderboard</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            Ranked by a combined score for the date range selected above: Prospect responses 20%, any response 10%, new contacts added 20%, active contacts (excl. Yet to Contact) 20%, platform activity 10%, account coverage 20%.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid #f0f0ee' }}>
              {['#', 'Owner', 'Region', 'Score', 'Active', 'Yet to Contact', 'New', 'Fresh', 'F1', 'F2', 'F3', 'F4', 'F5', 'Tmpl 1', 'Tmpl 2', 'Prospect', 'Warm', 'Not Int.', 'Negative', 'AI', 'Templated', 'Total Accts', 'Accts Added', 'Active Accts', 'Inactive Accts', 'Replies', 'Meetings', 'Won', 'Bounced', 'Rate'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr><td colSpan={30} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No owners found in org_hierarchy.</td></tr>
            ) : leaderboard.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: '0.5px solid #f5f5f3', background: i === 0 ? '#fffbeb' : 'transparent' }}>
                <td style={{ padding: '9px 10px', fontWeight: 600, color: i === 0 ? '#d97706' : '#999' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ('#' + (i + 1))}
                </td>
                <td style={{ padding: '9px 10px', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '9px 10px', color: '#888', fontSize: 12 }}>{s.region || '—'}</td>
                <td style={{ padding: '9px 10px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: s.score >= 60 ? '#dcfce7' : s.score >= 30 ? '#fef9c3' : '#fee2e2',
                    color: s.score >= 60 ? '#15803d' : s.score >= 30 ? '#854d0e' : '#991b1b' }}>
                    {s.score}
                  </span>
                </td>
                <td style={{ padding: '9px 10px' }}>{s.active}</td>
                <td style={{ padding: '9px 10px', color: '#888' }}>{s.yet_to_contact}</td>
                <td style={{ padding: '9px 10px', color: '#7c3aed', fontWeight: 500 }}>{s.new_contacts}</td>
                <td style={{ padding: '9px 10px', color: '#3b82f6' }}>{s.emails_fresh}</td>
                <td style={{ padding: '9px 10px', color: '#10b981' }}>{s.emails_f1}</td>
                <td style={{ padding: '9px 10px', color: '#059669' }}>{s.emails_f2}</td>
                <td style={{ padding: '9px 10px', color: '#f59e0b' }}>{s.emails_f3}</td>
                <td style={{ padding: '9px 10px', color: '#ef4444' }}>{s.emails_f4}</td>
                <td style={{ padding: '9px 10px', color: '#dc2626' }}>{s.emails_f5}</td>
                <td style={{ padding: '9px 10px', color: '#6366f1' }}>{s.templated_step1}</td>
                <td style={{ padding: '9px 10px', color: '#6366f1' }}>{s.templated_step2}</td>
                <td style={{ padding: '9px 10px', color: '#059669', fontWeight: 500 }}>{s.prospect_responses}</td>
                <td style={{ padding: '9px 10px', color: '#d97706' }}>{s.warm_responses}</td>
                <td style={{ padding: '9px 10px', color: '#6b7280' }}>{s.not_interested_responses}</td>
                <td style={{ padding: '9px 10px', color: '#dc2626' }}>{s.negative_responses}</td>
                <td style={{ padding: '9px 10px' }}>{s.contacts_ai}</td>
                <td style={{ padding: '9px 10px' }}>{s.contacts_templated}</td>
                <td style={{ padding: '9px 10px' }}>{s.total_accounts}</td>
                <td style={{ padding: '9px 10px', color: '#7c3aed' }}>{s.accounts_added}</td>
                <td style={{ padding: '9px 10px', color: '#059669' }}>{s.active_accounts}</td>
                <td style={{ padding: '9px 10px', color: '#9ca3af' }}>{s.inactive_accounts}</td>
                <td style={{ padding: '9px 10px', color: '#059669', fontWeight: 500 }}>{s.replies}</td>
                <td style={{ padding: '9px 10px', color: '#7c3aed' }}>{s.meetings}</td>
                <td style={{ padding: '9px 10px', color: '#16a34a', fontWeight: 500 }}>{s.won}</td>
                <td style={{ padding: '9px 10px', color: '#dc2626' }}>{s.bounced}</td>
                <td style={{ padding: '9px 10px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                    background: s.rate >= 15 ? '#dcfce7' : s.rate >= 8 ? '#fef9c3' : '#fee2e2',
                    color: s.rate >= 15 ? '#15803d' : s.rate >= 8 ? '#854d0e' : '#991b1b' }}>
                    {s.rate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Activity */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>Live org activity</div>
        {activity.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #f5f5f3' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: '#555' }}>
                <strong>{a.org_hierarchy?.full_name}</strong>
                {a.org_hierarchy?.role ? <span style={{ fontSize: 10, color: '#999', marginLeft: 5 }}>({a.org_hierarchy.role})</span> : ''}
                {' '}— {a.activity_type.replace(/_/g, ' ')}
                {a.contacts?.full_name ? ` · ${a.contacts.full_name}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
