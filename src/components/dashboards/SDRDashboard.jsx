import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import EmailMetricsPanel from './EmailMetricsPanel';

const STAGES = ['Fresh','F1','F2','F3','F4','F5'];
const STAGE_COLORS = {
  Fresh: '#3b82f6', F1: '#10b981', F2: '#059669',
  F3: '#f59e0b', F4: '#ef4444', F5: '#dc2626',
};

function MetricCard({ label, value, sub, subColor, accent }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || '#888', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function SDRDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: acts }] = await Promise.all([
        (async()=>{const a=[];let o=0;for(;;){const{data:d}=await supabase.from('contacts').select('*').eq('owner_id',user.id).range(o,o+999);if(!d?.length)break;a.push(...d);if(d.length<1000)break;o+=1000;}return{data:a};})(),
        supabase.from('activity_log')
          .select('*, contacts(full_name,company)')
          .eq('actor_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      setContacts(c || []);
      setActivity(acts || []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  const active = contacts.filter(c => !c.bounced && c.status !== 'bounced' && c.status !== 'unsubscribed');
  const pipeline = {};
  STAGES.forEach(s => { pipeline[s] = active.filter(c => c.status === s).length; });

  const responded = active.filter(c => c.response_type).length;
  const won = active.filter(c => c.status === 'won').length;
  const bounced = contacts.filter(c => c.bounced).length;
  const overdue = active.filter(c => c.next_followup && new Date(c.next_followup) < new Date() && c.status !== 'won' && c.status !== 'lost');

  const maxPipe = Math.max(...Object.values(pipeline), 1);

  // Upcoming follow-ups (next 5)
  const upcoming = active
    .filter(c => c.next_followup && c.status !== 'won' && c.status !== 'lost')
    .sort((a, b) => new Date(a.next_followup) - new Date(b.next_followup))
    .slice(0, 5);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>
          Good day, {profile?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Your outreach summary</p>
      </div>

      <EmailMetricsPanel ownIds={[user.id]} />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Active contacts" value={active.length}
          sub={`${bounced} bounced (excluded)`} subColor="#dc2626" />
        <MetricCard label="Fresh leads" value={pipeline.Fresh || 0}
          sub="Ready to email" accent="#2563eb" />
        <MetricCard label="Responded" value={responded}
          sub={active.length ? `${(responded/active.length*100).toFixed(0)}% response rate` : '—'} subColor="#059669" />
        <MetricCard label="Overdue follow-ups" value={overdue.length}
          sub={overdue.length > 0 ? 'Need attention now' : 'All caught up!'} subColor={overdue.length > 0 ? '#dc2626' : '#059669'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Outreach funnel */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 14 }}>Outreach funnel</div>
          {STAGES.map(s => (
            <div key={s} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{s}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: STAGE_COLORS[s] }}>{pipeline[s] || 0}</span>
              </div>
              <div style={{ height: 5, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((pipeline[s] || 0) / maxPipe) * 100}%`,
                  background: STAGE_COLORS[s], borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #f0f0ee',
            display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>Won: {won}</span>
            <button onClick={() => navigate('/pipeline')}
              style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Full pipeline →
            </button>
          </div>
        </div>

        {/* Follow-up queue */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
              Due follow-ups
              {overdue.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>({overdue.length} overdue)</span>}
            </div>
            <button onClick={() => navigate('/followups')}
              style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              View all →
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 20 }}>All caught up! 🎉</div>
          ) : upcoming.map(c => {
            const isOverdue = new Date(c.next_followup) < new Date();
            const stageColor = { Fresh: '#3b82f6', F1: '#10b981', F2: '#059669', F3: '#f59e0b', F4: '#ef4444', F5: '#dc2626' };
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                borderBottom: '0.5px solid #f5f5f3', cursor: 'pointer' }}
                onClick={() => navigate(`/contacts/${c.id}`)}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f0fe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>
                  {(c.full_name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{c.company}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: stageColor[c.status] || '#aaa',
                  background: stageColor[c.status] + '15', padding: '2px 7px', borderRadius: 8 }}>
                  {c.status}
                </span>
                <span style={{ fontSize: 11, color: isOverdue ? '#dc2626' : '#888', flexShrink: 0 }}>
                  {isOverdue ? '⚠ Overdue' : new Date(c.next_followup).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>Recent activity</div>
        {activity.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13 }}>No activity yet.</div>
        ) : activity.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '0.5px solid #f5f5f3' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#555' }}>
                {a.activity_type.replace(/_/g, ' ')}
                {a.contacts?.full_name ? ` — ${a.contacts.full_name}` : ''}
                {a.contacts?.company ? ` @ ${a.contacts.company}` : ''}
                {a.details?.from && a.details?.to ? ` (${a.details.from} → ${a.details.to})` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 1 }}>{new Date(a.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
