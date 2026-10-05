import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ROLES = ['owner', 'sub-admin', 'admin'];
const ROLE_LABELS = { owner: 'Owner', 'sub-admin': 'Sub-admin', admin: 'Admin' };
const ROLE_COLORS = {
  owner:      { bg: '#eff6ff', color: '#1d4ed8' },
  'sub-admin':{ bg: '#fdf4ff', color: '#7e22ce' },
  admin:      { bg: '#fff7ed', color: '#c2410c' },
};

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function PendingApprovals({ isAdmin, managerOptions, onChanged, showToast }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({}); // { userId: { role, region, reports_to } }
  const [busy, setBusy] = useState({});

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    callFn({ action: 'list_pending' })
      .then(d => { setPending(d.pending || []); setLoading(false); })
      .catch(e => { showToast(e.message, 'error'); setLoading(false); });
  }, [isAdmin]);

  function setEdit(uid, patch) {
    setEdits(prev => ({ ...prev, [uid]: { role: 'owner', region: '', reports_to: '', ...prev[uid], ...patch } }));
  }

  async function approve(u) {
    const ed = edits[u.id] || { role: 'owner', region: '', reports_to: '' };
    setBusy(prev => ({ ...prev, [u.id]: true }));
    try {
      await callFn({ action: 'approve_user', user_id: u.id, role: ed.role, region: ed.region, reports_to: ed.reports_to || null });
      setPending(prev => prev.filter(p => p.id !== u.id));
      showToast(`Approved ${u.full_name || u.email}`);
      onChanged();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(prev => ({ ...prev, [u.id]: false }));
    }
  }

  async function reject(u) {
    if (!window.confirm(`Reject and remove the signup for ${u.full_name || u.email}? They'll be able to sign up again later.`)) return;
    setBusy(prev => ({ ...prev, [u.id]: true }));
    try {
      await callFn({ action: 'reject_user', user_id: u.id });
      setPending(prev => prev.filter(p => p.id !== u.id));
      showToast('Signup rejected');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(prev => ({ ...prev, [u.id]: false }));
    }
  }

  if (!isAdmin || loading || pending.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: 0 }}>Pending Approvals</h2>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#fef9c3', color: '#854d0e' }}>{pending.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map(u => {
          const ed = edits[u.id] || { role: 'owner', region: '', reports_to: '' };
          const isBusy = busy[u.id];
          return (
            <div key={u.id} style={{ background: '#fffdf5', border: '0.5px solid #fde68a', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{u.full_name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>No name given</span>}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Role</label>
                  <select value={ed.role} onChange={e => setEdit(u.id, { role: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Region</label>
                  <input value={ed.region} onChange={e => setEdit(u.id, { region: e.target.value })}
                    placeholder="e.g. APAC, Banking"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Reports to</label>
                  <select value={ed.reports_to} onChange={e => setEdit(u.id, { reports_to: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
                    <option value="">— No manager —</option>
                    {managerOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name || m.id} ({ROLE_LABELS[m.role] || m.role})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => approve(u)} disabled={isBusy}
                  style={{ padding: '7px 18px', background: '#15803d', color: '#fff', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: isBusy ? 0.7 : 1 }}>
                  {isBusy ? 'Working…' : 'Approve'}
                </button>
                <button onClick={() => reject(u)} disabled={isBusy}
                  style={{ padding: '7px 14px', background: '#fef2f2', border: '0.5px solid #fecaca',
                    borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#dc2626' }}>
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function UsersAdmin() {
  const { profile, user, viewAsUser, viewingAs } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [switching, setSwitching] = useState({});
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState({}); // { userId: { role, full_name, region, reports_to } }
  const [refreshKey, setRefreshKey] = useState(0);

  const isAdmin = profile?.role === 'admin';
  const isSubAdmin = profile?.role === 'sub-admin';
  // While an admin is "viewing as" someone, this edge function call still
  // authenticates with the admin's own real session — pass view_as so the
  // backend recomputes the list exactly as that person would see it (their
  // downline only), instead of always returning the real admin's full org view.
  const viewAsParam = viewingAs?.id ? { view_as: viewingAs.id } : {};

  useEffect(() => {
    callFn({ action: 'list_users', ...viewAsParam })
      .then(d => {
        setUsers(d.users || []);
        setManagerOptions(d.manager_options || []);
        setLoading(false);
      })
      .catch(e => { setToast({ msg: e.message, type: 'error' }); setLoading(false); });
  }, [viewingAs?.id, refreshKey]);

  function startEdit(u) {
    setEditing(prev => ({
      ...prev,
      [u.id]: { role: u.role || 'owner', full_name: u.full_name || '', region: u.region || '', reports_to: u.reports_to || '' }
    }));
  }

  function cancelEdit(uid) {
    setEditing(prev => { const n = { ...prev }; delete n[uid]; return n; });
  }

  async function saveUser(u) {
    const edits = editing[u.id];
    if (!edits) return;
    setSaving(prev => ({ ...prev, [u.id]: true }));
    try {
      await callFn({ action: 'update_user', user_id: u.id, ...edits, reports_to: edits.reports_to || null, ...viewAsParam });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...edits, has_profile: true } : x));
      cancelEdit(u.id);
      showToast('Saved!');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(prev => ({ ...prev, [u.id]: false }));
    }
  }

  async function handleViewAs(u) {
    setSwitching(prev => ({ ...prev, [u.id]: true }));
    try {
      const res = await viewAsUser(u.id, u.email);
      if (res?.error) {
        showToast(res.error, 'error');
      } else {
        navigate('/');
      }
    } finally {
      setSwitching(prev => ({ ...prev, [u.id]: false }));
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  if (!['admin', 'sub-admin'].includes(profile?.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Access restricted to Admins and Sub-admins.
      </div>
    );
  }

  function managerName(id) {
    if (!id) return '—';
    const m = users.find(u => u.id === id) || managerOptions.find(m => m.id === id);
    return m?.full_name || m?.email || id;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`,
          color: toast.type === 'error' ? '#dc2626' : '#166534',
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 4 }}>Team Members</h1>
        <p style={{ fontSize: 13, color: '#888' }}>
          {isAdmin ? 'Assign roles, regions and reporting lines for your whole org. Use View as to see the platform through any team member’s eyes.' :
            'Manage your team — assign regions and reporting lines within your own downline.'} {users.length} users {isAdmin ? 'total' : 'in your team'}.
        </p>
      </div>

      <PendingApprovals
        isAdmin={isAdmin}
        managerOptions={managerOptions}
        onChanged={() => setRefreshKey(k => k + 1)}
        showToast={showToast}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#aaa' }}>Loading team…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {users.map(u => {
            const ed = editing[u.id];
            const isSaving = saving[u.id];
            const isSwitching = switching[u.id];
            const rc = u.role ? ROLE_COLORS[u.role] : { bg: '#f5f5f3', color: '#888' };
            // A sub-admin can edit anyone in their downline, but can never grant
            // admin/sub-admin — the edge function enforces this too, this just
            // keeps the UI honest about what will actually be accepted.
            const roleOptionsForCaller = isAdmin ? ROLES : ROLES.filter(r => r === 'owner');
            const canEdit = isAdmin || isSubAdmin;
            const isSelf = u.id === user?.id;

            return (
              <div key={u.id} style={{ background: '#fff', border: '0.5px solid #e8e8e4',
                borderRadius: 12, padding: '16px 20px' }}>
                {!ed ? (
                  /* VIEW MODE */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%',
                      background: '#f0f0ed', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#555', flexShrink: 0 }}>
                      {(u.full_name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                        {u.full_name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>No name set</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{u.email}</div>
                      {u.reports_to && (
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Reports to {managerName(u.reports_to)}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {u.region && (
                        <span style={{ fontSize: 11, color: '#888', background: '#f5f5f3',
                          padding: '3px 8px', borderRadius: 6 }}>{u.region}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px',
                        borderRadius: 20, background: rc.bg, color: rc.color }}>
                        {u.role ? ROLE_LABELS[u.role] : 'No role'}
                      </span>
                      {u.has_profile && (
                        <button onClick={() => navigate(`/scorecard/${u.id}`)}
                          title={`View ${u.full_name || u.email}'s scorecard`}
                          style={{ padding: '6px 14px', background: '#f5f3ff', border: '0.5px solid #ddd6fe',
                            borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#6d28d9', fontWeight: 500 }}>
                          📊 Scorecard
                        </button>
                      )}
                      {isAdmin && !isSelf && u.has_profile && !viewingAs && (
                        <button onClick={() => handleViewAs(u)} disabled={isSwitching}
                          title={`Browse the platform as ${u.full_name || u.email}`}
                          style={{ padding: '6px 14px', background: '#eff6ff', border: '0.5px solid #bfdbfe',
                            borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#1d4ed8', fontWeight: 500,
                            opacity: isSwitching ? 0.6 : 1 }}>
                          {isSwitching ? 'Switching…' : '👁 View as'}
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => startEdit(u)}
                          style={{ padding: '6px 14px', background: '#f5f5f3', border: '0.5px solid #e8e8e4',
                            borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#555' }}>
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* EDIT MODE */
                  <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Full Name</label>
                        <input value={ed.full_name} onChange={e => setEditing(p => ({ ...p, [u.id]: { ...p[u.id], full_name: e.target.value } }))}
                          placeholder="Full name"
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Role</label>
                        <select value={ed.role} onChange={e => setEditing(p => ({ ...p, [u.id]: { ...p[u.id], role: e.target.value } }))}
                          disabled={!isAdmin && ['admin', 'sub-admin'].includes(u.role)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
                          {ROLES.map(r => <option key={r} value={r} disabled={!isAdmin && r !== 'owner'}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Region</label>
                        <input value={ed.region} onChange={e => setEditing(p => ({ ...p, [u.id]: { ...p[u.id], region: e.target.value } }))}
                          placeholder="e.g. APAC, Banking"
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Reports to</label>
                        <select value={ed.reports_to} onChange={e => setEditing(p => ({ ...p, [u.id]: { ...p[u.id], reports_to: e.target.value } }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
                          <option value="">— No manager —</option>
                          {managerOptions.filter(m => m.id !== u.id).map(m => (
                            <option key={m.id} value={m.id}>{m.full_name || m.id} ({ROLE_LABELS[m.role] || m.role})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveUser(u)} disabled={isSaving}
                        style={{ padding: '7px 18px', background: '#111', color: '#fff', border: 'none',
                          borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => cancelEdit(u.id)}
                        style={{ padding: '7px 14px', background: '#f5f5f3', border: '0.5px solid #e8e8e4',
                          borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#555' }}>
                        Cancel
                      </button>
                      <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>{u.email}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
