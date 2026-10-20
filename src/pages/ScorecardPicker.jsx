import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

const ROLE_LABELS = { owner: 'Owner', 'sub-admin': 'Sub-admin', admin: 'Admin' };

export default function ScorecardPicker() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    callFn({ action: 'list_users' })
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (users || [])
      .filter(u => u.has_profile)
      .filter(u => !s || (u.full_name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s))
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
  }, [users, search]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 4 }}>Scorecards</h1>
      <div style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>Pick a team member to view their scorecard.</div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '0.5px solid #e8e8e4', fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }} />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 14 }}>Loading...</div>
      ) : error ? (
        <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>No team members found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(u => (
            <div key={u.id}
              onClick={() => navigate('/scorecard/' + u.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '0.5px solid #e8e8e4' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9f9f7'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{u.full_name || u.email}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{u.email}{u.region ? (' · ' + u.region) : ''}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: '#f5f5f3', color: '#555' }}>
                {ROLE_LABELS[u.role] || u.role || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
