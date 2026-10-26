import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import EmailMetricsPanel from './EmailMetricsPanel';

export default function ManagerDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ contacts: 0, replies: 0, meetings: 0, bounced: 0 });
  const [teams, setTeams] = useState([]);
  const [activity, setActivity] = useState([]);
  const [topPerformer, setTopPerformer] = useState(null);
  const [teamIds, setTeamIds] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: subs } = await supabase.rpc('get_subordinate_ids', { manager_user_id: user.id });
      const subIds = [user.id, ...(subs || []).map(s => s.user_id)];
      setTeamIds(subIds);

      const [{ data: hierarchy }, { data: allContacts }, { data: acts }] = await Promise.all([
        supabase.from('org_hierarchy').select('*').in('user_id', subIds),
        (async()=>{const a=[];let o=0;for(;;){const{data:d}=await supabase.from('contacts').select('*').in('owner_id',subIds).range(o,o+999);if(!d?.length)break;a.push(...d);if(d.length<1000)break;o+=1000;}return{data:a};})(),
        supabase.from('activity_log')
          .select('*, contacts(full_name,company), org_hierarchy!actor_id(full_name,role)')
          .in('actor_id', subIds)
          .order('created_at', { ascending: false })
          .limit(15),
      ]);

      const c = allContacts || [];
      setStats({
        contacts: c.filter(x => !x.bounced).length,
        replies: c.filter(x => ['replied','meeting','won'].includes(x.status)).length,
        meetings: c.filter(x => x.status === 'meeting').length,
        bounced: c.filter(x => x.bounced).length,
      });
      setActivity(acts || []);

      // Group by sub-admin level (reports_to this manager)
      const pocs = (hierarchy || []).filter(h => h.role === 'sub-admin');
      const sdrs = (hierarchy || []).filter(h => h.role === 'owner');

      const teamMap = pocs.map(poc => {
        const pocSdrs = sdrs.filter(s => s.reports_to === poc.user_id);
        const allIds = [poc.user_id, ...pocSdrs.map(s => s.user_id)];
        const tc = c.filter(x => allIds.includes(x.owner_id));
        const replyCount = tc.filter(x => ['replied','meeting','won'].includes(x.status)).length;
        const activeCount = tc.filter(x => !x.bounced).length;
        return {
          ...poc,
          sdrs: pocSdrs.length,
          contacts: activeCount,
          replies: replyCount,
          meetings: tc.filter(x => x.status === 'meeting').length,
          bounced: tc.filter(x => x.bounced).length,
          rate: activeCount ? Math.round((replyCount / activeCount) * 100) : 0,
        };
      });
      setTeams(teamMap);

      // Best performer among SDRs
      const sdrStats = sdrs.map(s => {
        const sc = c.filter(x => x.owner_id === s.user_id);
        return { name: s.full_name, replies: sc.filter(x => ['replied','meeting','won'].includes(x.status)).length };
      }).sort((a, b) => b.replies - a.replies);
      setTopPerformer(sdrStats[0] || null);
    }
    load();
  }, [user.id]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Sub-Admin dashboard</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{profile?.full_name} · {profile?.region}</p>
      </div>

      <EmailMetricsPanel ownIds={[user.id]} teamIds={teamIds} showToggle defaultView="team" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active contacts', value: stats.contacts },
          { label: 'Total replies', value: stats.replies, color: '#059669' },
          { label: 'Meetings booked', value: stats.meetings, color: '#7c3aed' },
          { label: 'Bounced (excluded)', value: stats.bounced, color: '#dc2626' },
        ].map(m => (
          <div key={m.label} style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: m.color || '#111' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {topPerformer && (
        <div style={{ background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#713f12' }}>
          🏆 Top performer this period: <strong>{topPerformer.name}</strong> — {topPerformer.replies} replies
        </div>
      )}

      {/* Teams table */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4', fontSize: 13, fontWeight: 600, color: '#111' }}>Teams under me</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid #f0f0ee' }}>
              {['Sub-Admin', 'Owners', 'Active contacts', 'Replies', 'Meetings', 'Bounced', 'Reply rate'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No teams found.</td></tr>
            ) : teams.map(t => (
              <tr key={t.id} style={{ borderBottom: '0.5px solid #f5f5f3' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{t.full_name}</td>
                <td style={{ padding: '10px 14px', color: '#888' }}>{t.sdrs}</td>
                <td style={{ padding: '10px 14px' }}>{t.contacts}</td>
                <td style={{ padding: '10px 14px', color: '#059669', fontWeight: 500 }}>{t.replies}</td>
                <td style={{ padding: '10px 14px', color: '#7c3aed' }}>{t.meetings}</td>
                <td style={{ padding: '10px 14px', color: '#dc2626' }}>{t.bounced}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, height: 5, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.rate}%`, background: t.rate >= 15 ? '#10b981' : t.rate >= 8 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12 }}>{t.rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activity feed */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>All team activity</div>
        {activity.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #f5f5f3' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: '#555' }}>
                <strong>{a.org_hierarchy?.full_name}</strong> ({a.org_hierarchy?.role}) — {a.activity_type.replace(/_/g, ' ')}
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
