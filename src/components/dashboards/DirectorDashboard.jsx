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

      const [total, contacted, replies, meetings, won, bounced, { data: allHierarchy }, { data: acts }] = await Promise.all([
        countContacts(q => q.eq('bounced', false)),
        countContacts(q => q.eq('bounced', false).neq('status', 'fresh')),
        countContacts(q => q.in('status', ['replied', 'meeting', 'won'])),
        countContacts(q => q.eq('status', 'meeting')),
        countContacts(q => q.eq('status', 'won')),
        countContacts(q => q.eq('bounced', true)),
        supabase.from('org_hierarchy').select('*'),
        supabase.from('activity_log')
          .select('*, contacts(full_name,company), org_hierarchy!actor_id(full_name,role)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setStats({ total, contacted, replies, meetings, won, bounced });
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

      const ownerIds = sdrs.map(s => s.user_id);
      const { data: statsRows } = ownerIds.length
        ? await supabase.rpc('team_stats_by_owner', { ids: ownerIds })
        : { data: [] };
      const statsByOwner = Object.fromEntries((statsRows || []).map(r => [r.owner_id, r]));

      const board = sdrs.map(s => {
        const st = statsByOwner[s.user_id] || { active: 0, replies: 0, meetings: 0, won: 0, bounced: 0 };
        return {
          id: s.id,
          name: s.full_name,
          region: s.region,
          active: st.active,
          replied: st.replies,
          meetings: st.meetings,
          won: st.won,
          bounced: st.bounced,
          rate: st.active ? Math.round((st.replies / st.active) * 100) : 0,
        };
      }).sort((a, b) => b.replied - a.replied);
      setLeaderboard(board);
    }
    load();
  }, []);

  const replyRate = stats.total ? Math.round((stats.replies / stats.total) * 100) : 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Org overview</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{profile?.full_name} · Admin · All teams</p>
      </div>

      <EmailMetricsPanel ownIds={[user.id]} teamMembers={teamMembers} showToggle defaultView="team" />

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
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4', fontSize: 13, fontWeight: 600, color: '#111' }}>Owner leaderboard</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid #f0f0ee' }}>
              {['#', 'Owner', 'Region', 'Active', 'Replies', 'Meetings', 'Won', 'Bounced', 'Rate'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No owners found in org_hierarchy.</td></tr>
            ) : leaderboard.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: '0.5px solid #f5f5f3', background: i === 0 ? '#fffbeb' : 'transparent' }}>
                <td style={{ padding: '9px 12px', fontWeight: 600, color: i === 0 ? '#d97706' : '#999' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </td>
                <td style={{ padding: '9px 12px', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '9px 12px', color: '#888', fontSize: 12 }}>{s.region || '—'}</td>
                <td style={{ padding: '9px 12px' }}>{s.active}</td>
                <td style={{ padding: '9px 12px', color: '#059669', fontWeight: 500 }}>{s.replied}</td>
                <td style={{ padding: '9px 12px', color: '#7c3aed' }}>{s.meetings}</td>
                <td style={{ padding: '9px 12px', color: '#16a34a', fontWeight: 500 }}>{s.won}</td>
                <td style={{ padding: '9px 12px', color: '#dc2626' }}>{s.bounced}</td>
                <td style={{ padding: '9px 12px' }}>
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
