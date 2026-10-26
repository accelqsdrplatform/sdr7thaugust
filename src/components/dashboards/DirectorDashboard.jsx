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

  useEffect(() => {
    async function load() {
      const [allContacts, { data: allHierarchy }, { data: acts }] = await Promise.all([
        (async()=>{const a=[];let o=0;for(;;){const{data:d}=await supabase.from('contacts').select('*').range(o,o+999);if(!d?.length)break;a.push(...d);if(d.length<1000)break;o+=1000;}return a;})(),
        supabase.from('org_hierarchy').select('*'),
        supabase.from('activity_log')
          .select('*, contacts(full_name,company), org_hierarchy!actor_id(full_name,role)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const c = allContacts;
      setStats({
        total: c.filter(x => !x.bounced).length,
        contacted: c.filter(x => x.status !== 'fresh' && !x.bounced).length,
        replies: c.filter(x => ['replied','meeting','won'].includes(x.status)).length,
        meetings: c.filter(x => x.status === 'meeting').length,
        won: c.filter(x => x.status === 'won').length,
        bounced: c.filter(x => x.bounced).length,
      });
      setActivity(acts || []);

      // Leaderboard: owners only, ranked by replies
      const sdrs = (allHierarchy || []).filter(h => h.role === 'owner');
      setTeamIds(sdrs.map(s => s.user_id));
      const board = sdrs.map(s => {
        const sc = c.filter(x => x.owner_id === s.user_id);
        const active = sc.filter(x => !x.bounced).length;
        const replied = sc.filter(x => ['replied','meeting','won'].includes(x.status)).length;
        return {
          id: s.id,
          name: s.full_name,
          region: s.region,
          active,
          replied,
          meetings: sc.filter(x => x.status === 'meeting').length,
          won: sc.filter(x => x.status === 'won').length,
          bounced: sc.filter(x => x.bounced).length,
          rate: active ? Math.round((replied / active) * 100) : 0,
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

      <EmailMetricsPanel ownIds={[user.id]} teamIds={teamIds} showToggle defaultView="team" />

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
