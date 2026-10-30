import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: sdrs } = await supabase.from('org_hierarchy').select('*').eq('role', 'owner');
    const ownerIds = (sdrs || []).map(s => s.user_id);
    // Per-owner counts computed in Postgres via team_stats_by_owner() instead
    // of pulling every contact in the org into the browser -- the old
    // unbounded fetch silently truncated past Supabase's 1000-row cap and
    // would ship the entire contacts table to the browser at scale.
    const { data: statsRows } = ownerIds.length
      ? await supabase.rpc('team_stats_by_owner', { ids: ownerIds })
      : { data: [] };
    const statsByOwner = Object.fromEntries((statsRows || []).map(r => [r.owner_id, r]));

    const board = (sdrs || []).map(s => {
      const st = statsByOwner[s.user_id] || { active: 0, replies: 0, meetings: 0, won: 0, bounced: 0 };
      return {
        id: s.id,
        name: s.full_name,
        region: s.region,
        user_id: s.user_id,
        active: st.active,
        replied: st.replies,
        meetings: st.meetings,
        won: st.won,
        bounced: st.bounced,
        rate: st.active ? Math.round((st.replies / st.active) * 100) : 0,
      };
    }).sort((a, b) => b.replied - a.replied || b.won - a.won);

    setRows(board);
    setLoading(false);
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Leaderboard</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Owner performance rankings · all time</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>No owners found in the org hierarchy.</div>
      ) : (
        <>
          {/* Top 3 podium */}
          {rows.length >= 3 && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
              {[rows[1], rows[0], rows[2]].map((r, i) => {
                const rank = i === 1 ? 0 : i === 0 ? 1 : 2;
                const heights = { 0: 100, 1: 130, 2: 85 };
                return (
                  <div key={r?.id} style={{ textAlign: 'center', width: 140 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>{r?.name}</div>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{medals[rank]}</div>
                    <div style={{ height: heights[rank], background: rank === 0 ? '#fef9c3' : rank === 1 ? '#f1f5f9' : '#fef3c7',
                      border: `2px solid ${rank === 0 ? '#fde047' : rank === 1 ? '#cbd5e1' : '#fed7aa'}`,
                      borderRadius: '10px 10px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{r?.replied}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>replies</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full table */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e8e8e4' }}>
                  {['Rank', 'Owner', 'Region', 'Active', 'Replies', 'Meetings', 'Won', 'Bounced', 'Reply rate'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid #f5f5f3', background: r.user_id === user.id ? '#f0f9ff' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', fontSize: 16 }}>{medals[i] || `#${i + 1}`}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                      {r.name}
                      {r.user_id === user.id && <span style={{ marginLeft: 6, fontSize: 10, background: '#e0edff', color: '#2563eb', padding: '1px 6px', borderRadius: 8 }}>You</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#888' }}>{r.region || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{r.active}</td>
                    <td style={{ padding: '10px 14px', color: '#059669', fontWeight: 500 }}>{r.replied}</td>
                    <td style={{ padding: '10px 14px', color: '#7c3aed' }}>{r.meetings}</td>
                    <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 500 }}>{r.won}</td>
                    <td style={{ padding: '10px 14px', color: '#dc2626' }}>{r.bounced}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                        background: r.rate >= 15 ? '#dcfce7' : r.rate >= 8 ? '#fef9c3' : '#fee2e2',
                        color: r.rate >= 15 ? '#15803d' : r.rate >= 8 ? '#854d0e' : '#991b1b' }}>
                        {r.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
