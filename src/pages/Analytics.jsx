import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const STAGES = ['fresh','contacted','replied','meeting','won','lost'];
const COLORS = { fresh:'#3b82f6', contacted:'#10b981', replied:'#f59e0b', meeting:'#8b5cf6', won:'#22c55e', lost:'#94a3b8' };

export default function Analytics() {
  const { user, profile } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Paginated up to an explicit cap instead of a single unbounded fetch --
  // these stats used to silently undercount past Supabase's 1000-row return
  // cap once a scope's contact count passed it.
  const ANALYTICS_LIMIT = 20000;
  useEffect(() => {
    async function load() {
      setLoading(true);
      let scopeIds = null;
      if (profile?.role !== 'owner') {
        const { data: subs } = await supabase.rpc('get_subordinate_ids', { manager_user_id: user.id });
        scopeIds = [user.id, ...(subs || []).map(s => s.user_id)];
      }
      const rows = [];
      let from = 0;
      for (;;) {
        let q = supabase.from('contacts').select('*');
        q = scopeIds ? q.in('owner_id', scopeIds) : q.eq('owner_id', user.id);
        const { data } = await q.range(from, from + 999);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (rows.length >= ANALYTICS_LIMIT || data.length < 1000) break;
        from += 1000;
      }
      setContacts(rows.slice(0, ANALYTICS_LIMIT));
      setLoading(false);
    }
    load();
  }, [user.id, profile?.role]);

  const total = contacts.length;
  const active = contacts.filter(c => !c.bounced).length;
  const bounced = contacts.filter(c => c.bounced).length;
  const byStage = {};
  STAGES.forEach(s => { byStage[s] = contacts.filter(c => c.status === s).length; });

  const replyRate = active ? Math.round(((byStage.replied + byStage.meeting + byStage.won) / active) * 100) : 0;
  const winRate = active ? Math.round((byStage.won / active) * 100) : 0;
  const bounceRate = total ? Math.round((bounced / total) * 100) : 0;
  const maxStage = Math.max(...Object.values(byStage), 1);

  // Industry breakdown
  const industries = {};
  contacts.filter(c => !c.bounced && c.industry).forEach(c => {
    industries[c.industry] = (industries[c.industry] || 0) + 1;
  });
  const topIndustries = Object.entries(industries).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Performance metrics for your scope</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>Loading…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Reply rate', value: `${replyRate}%`, desc: 'Replies / active contacts', color: replyRate >= 15 ? '#059669' : replyRate >= 8 ? '#d97706' : '#dc2626' },
              { label: 'Win rate', value: `${winRate}%`, desc: 'Won / active contacts', color: '#7c3aed' },
              { label: 'Bounce rate', value: `${bounceRate}%`, desc: 'Excluded from outreach', color: '#dc2626' },
              { label: 'Total contacts', value: total, desc: `${active} active · ${bounced} bounced` },
            ].map(m => (
              <div key={m.label} style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: m.color || '#111' }}>{m.value}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{m.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
            {/* Stage funnel */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 16 }}>Stage breakdown</div>
              {STAGES.map(s => (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>{s}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{byStage[s]}</span>
                  </div>
                  <div style={{ height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(byStage[s] / maxStage) * 100}%`, background: COLORS[s], borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Industry breakdown */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 16 }}>Top industries</div>
              {topIndustries.length === 0 ? (
                <div style={{ color: '#ccc', fontSize: 13 }}>No industry data available</div>
              ) : topIndustries.map(([ind, count], i) => (
                <div key={ind} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: '#888', width: 18 }}>#{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 13, color: '#111' }}>{ind}</div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{count}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid #f0f0ee', fontSize: 12, color: '#aaa' }}>
                {Object.keys(industries).length} industries total
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
