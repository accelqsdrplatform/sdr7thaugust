import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import EmailMetricsPanel from './EmailMetricsPanel';

export default function POCDashboard() {
  const { user, profile } = useAuth();
  const [team, setTeam] = useState([]);
  const [teamStats, setTeamStats] = useState({ contacts: 0, emails: 0, replies: 0, meetings: 0, bounced: 0 });
  const [activity, setActivity] = useState([]);
  const [teamIds, setTeamIds] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: subs } = await supabase.rpc('get_subordinate_ids', { manager_user_id: user.id });
      const subIds = [user.id, ...(subs || []).map(s => s.user_id)];
      setTeamIds(subIds);

      const { data: hierarchy } = await supabase.from('org_hierarchy').select('*').in('user_id', subIds);
      const allContacts=[]; {let _o=0; for(;;){const{data:_d}=await supabase.from('contacts').select('*').in('owner_id',subIds).range(_o,_o+999); if(!_d?.length)break; allContacts.push(..._d); if(_d.length<1000)break; _o+=1000;}}
      const { data: acts } = await supabase.from('activity_log').select('*, contacts(full_name,company), org_hierarchy!actor_id(full_name)').in('actor_id', subIds).order('created_at', { ascending: false }).limit(10);

      const c = allContacts;
      setTeamStats({
        contacts: c.filter(x => !x.bounced).length,
        emails: c.filter(x => x.status !== 'fresh').length,
        replies: c.filter(x => ['replied','meeting','won'].includes(x.status)).length,
        meetings: c.filter(x => x.status === 'meeting').length,
        bounced: c.filter(x => x.bounced).length,
      });

      const members = (hierarchy || []).map(h => {
        const mc = c.filter(x => x.owner_id === h.user_id);
        return {
          ...h,
          contacts: mc.filter(x => !x.bounced).length,
          replies: mc.filter(x => ['replied','meeting','won'].includes(x.status)).length,
          bounced: mc.filter(x => x.bounced).length,
          rate: mc.length ? Math.round((mc.filter(x => ['replied','meeting','won'].includes(x.status)).length / Math.max(mc.filter(x => !x.bounced).length, 1)) * 100) : 0,
        };
      });
      setTeam(members);
      setActivity(acts || []);
    }
    load();
  }, [user.id]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Team dashboard</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{profile?.full_name} · {profile?.region}</p>
      </div>

      <EmailMetricsPanel ownIds={[user.id]} teamMembers={team.map(m => ({ id: m.user_id, name: m.full_name }))} showToggle defaultView="team" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active contacts', value: teamStats.contacts },
          { label: 'Replies', value: teamStats.replies, color: '#059669' },
          { label: 'Meetings booked', value: teamStats.meetings, color: '#7c3aed' },
          { label: 'Bounced (excluded)', value: teamStats.bounced, color: '#dc2626' },
        ].map(m => (
          <div key={m.label} style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: m.color || '#111' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Owner table */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4', fontSize: 13, fontWeight: 600, color: '#111' }}>My team</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid #f0f0ee' }}>
              {['Owner', 'Region', 'Active contacts', 'Replies', 'Reply rate', 'Bounced', 'Status'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No team members found. Add owners to org_hierarchy.</td></tr>
            ) : team.map(m => (
              <tr key={m.id} style={{ borderBottom: '0.5px solid #f5f5f3' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{m.full_name}</td>
                <td style={{ padding: '10px 14px', color: '#888' }}>{m.region || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{m.contacts}</td>
                <td style={{ padding: '10px 14px' }}>{m.replies}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, height: 5, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${m.rate}%`, background: m.rate >= 15 ? '#10b981' : m.rate >= 8 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#555' }}>{m.rate}%</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', color: '#dc2626', fontSize: 12 }}>{m.bounced}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '3px 9px', borderRadius: 10, fontSize: 11, background: m.rate >= 15 ? '#dcfce7' : m.rate >= 8 ? '#fef9c3' : '#fee2e2', color: m.rate >= 15 ? '#15803d' : m.rate >= 8 ? '#854d0e' : '#991b1b' }}>
                    {m.rate >= 15 ? 'On track' : m.rate >= 8 ? 'Average' : 'Needs focus'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activity */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>Team activity</div>
        {activity.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #f5f5f3' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: '#555' }}>
                <strong>{a.org_hierarchy?.full_name || 'Team member'}</strong> — {a.activity_type.replace(/_/g, ' ')}
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
