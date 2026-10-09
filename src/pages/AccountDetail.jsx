import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  prospecting:  { bg: '#e0f2fe', color: '#0369a1' },
  engaged:      { bg: '#fef9c3', color: '#854d0e' },
  demo_booked:  { bg: '#ede9fe', color: '#6d28d9' },
  closed_won:   { bg: '#dcfce7', color: '#15803d' },
  closed_lost:  { bg: '#f1f5f9', color: '#475569' },
};

const INTENT_TYPES = [
  { value: 'qa_hiring', label: '🧑‍💼 QA Hiring', desc: 'Hiring QA engineers / testers' },
  { value: 'competitor_tool', label: '⚔️ Competitor Tool', desc: 'Using Selenium, Cypress, etc.' },
  { value: 'recent_funding', label: '💰 Recent Funding', desc: 'Series A/B/C or IPO' },
  { value: 'recent_launch', label: '🚀 Recent Launch', desc: 'New product or major release' },
  { value: 'outage', label: '🔴 Outage', desc: 'Public outage or incident' },
  { value: 'cicd', label: '⚙️ CI/CD', desc: 'CI/CD pipeline activity' },
  { value: 'tech_stack', label: '🛠️ Tech Stack', desc: 'Relevant tech stack signal' },
  { value: 'website_traffic', label: '📈 Website Traffic', desc: 'Traffic spike detected' },
  { value: 'g2_review', label: '⭐ G2 Review', desc: 'Posted a G2 review' },
  { value: 'other', label: '📌 Other', desc: 'Custom signal' },
];

const CONTACT_STATUS_COLORS = {
  fresh: { bg: '#e0f2fe', color: '#0369a1' },
  contacted: { bg: '#f0fdf4', color: '#166534' },
  replied: { bg: '#fef9c3', color: '#854d0e' },
  meeting: { bg: '#ede9fe', color: '#6d28d9' },
  won: { bg: '#dcfce7', color: '#15803d' },
  lost: { bg: '#f1f5f9', color: '#475569' },
  bounced: { bg: '#fee2e2', color: '#991b1b' },
};

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [companyNotesList, setCompanyNotesList] = useState([]);
  const [newCompanyNoteText, setNewCompanyNoteText] = useState('');
  const [savingCompanyNote, setSavingCompanyNote] = useState(false);
  const [showAddIntent, setShowAddIntent] = useState(false);
  const [newIntent, setNewIntent] = useState({ intent_type: 'qa_hiring', notes: '' });
  const [addingIntent, setAddingIntent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [allAccountNames, setAllAccountNames] = useState([]);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { fetchAll(); }, [id]);

  async function deleteContact(contactId) {
    const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('owner_id', user.id);
    if (error) {
      alert('Could not delete contact: ' + error.message);
      return;
    }
    setDeleteConfirm(null);
    fetchAll();
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: acc }, { data: cts }, { data: ints }, { data: allAccs }] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('account_id', id).order('created_at', { ascending: false }),
      supabase.from('account_intents').select('*, profiles:created_by(full_name)').eq('account_id', id).order('detected_at', { ascending: false }),
      supabase.from('accounts').select('name'),
    ]);
    setAccount(acc);
    setEditData(acc || {});
    setContacts(cts || []);
    setIntents(ints || []);
    setAllAccountNames((allAccs || []).map(a => a.name.toLowerCase().trim()));
    if (acc?.name) {
      const { data: cn } = await supabase.from('company_notes').select('*, profiles(full_name)').eq('company_name', acc.name).order('created_at', { ascending: false });
      setCompanyNotesList(cn || []);
    }
    setLoading(false);
  }

  async function addCompanyNote() {
    if (!newCompanyNoteText.trim() || !account?.name) return;
    setSavingCompanyNote(true);
    await supabase.from('company_notes').insert({ company_name: account.name, author_id: user.id, body: newCompanyNoteText.trim() });
    const { data: cn } = await supabase.from('company_notes').select('*, profiles(full_name)').eq('company_name', account.name).order('created_at', { ascending: false });
    setCompanyNotesList(cn || []);
    setNewCompanyNoteText('');
    setSavingCompanyNote(false);
  }

  async function saveEdit() {
    await supabase.from('accounts').update({
      name: editData.name, domain: editData.domain, industry: editData.industry,
      size: editData.size, country: editData.country, website: editData.website, status: editData.status,
      linkedin_url: editData.linkedin_url || null,
      employees: editData.employees || null,
      revenue_millions: editData.revenue_millions ? parseFloat(editData.revenue_millions) : null,
    }).eq('id', id);
    setEditing(false);
    fetchAll();
  }

  async function addIntent() {
    if (!newIntent.intent_type) return;
    setAddingIntent(true);
    await supabase.from('account_intents').insert({ account_id: id, intent_type: newIntent.intent_type, notes: newIntent.notes, created_by: user.id });
    setNewIntent({ intent_type: 'qa_hiring', notes: '' });
    setShowAddIntent(false);
    setAddingIntent(false);
    fetchAll();
  }

  async function deleteIntent(intentId) {
    await supabase.from('account_intents').delete().eq('id', intentId);
    fetchAll();
  }

  if (loading) return <div style={{ padding: 32, color: '#aaa', textAlign: 'center' }}>Loading…</div>;
  if (!account) return <div style={{ padding: 32, color: '#aaa', textAlign: 'center' }}>Account not found</div>;

  const sc = STATUS_COLORS[account.status] || STATUS_COLORS.prospecting;
  const tabs = ['overview', 'contacts', 'intents', 'notes'];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Back */}
      <button onClick={() => navigate('/accounts')}
        style={{ fontSize: 13, color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← Back to Accounts
      </button>

      {/* Company Info Card */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e4', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          {/* Logo */}
          <div style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: '1px solid #e8e8e4', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {account.domain ? (
              <img
                src={`https://logo.clearbit.com/${account.domain}`}
                alt={account.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={e => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.parentElement.querySelector('.logo-fallback'); if (fb) fb.style.display = 'flex'; }}
              />
            ) : null}
            <div className="logo-fallback" style={{ display: account.domain ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#2563eb', color: '#fff', fontSize: 22, fontWeight: 700, borderRadius: 12 }}>
              {account.name?.[0]?.toUpperCase()}
            </div>
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>{account.name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, background: sc.bg, color: sc.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                {account.status?.replace('_', ' ')}
              </span>
              {intents.length > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, background: '#fef3c7', color: '#92400e', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  🎯 {intents.length} signal{intents.length > 1 ? 's' : ''}
                </span>
              )}
              {account.website && (
                <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer"
                  title="Website" style={{ color: '#6b7280', fontSize: 16, textDecoration: 'none', lineHeight: 1 }}>🌐</a>
              )}
              {account.linkedin_url && (
                <a href={account.linkedin_url} target="_blank" rel="noreferrer"
                  title="LinkedIn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, background: '#0077b5', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none', lineHeight: 1, flexShrink: 0 }}>in</a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {account.country && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#9ca3af' }}>Location </span>
                  <span style={{ color: '#111', fontWeight: 500 }}>{account.country}</span>
                </div>
              )}
              {account.industry && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#9ca3af' }}>Industry </span>
                  <span style={{ color: '#111', fontWeight: 500 }}>{account.industry}</span>
                </div>
              )}
              {account.employees && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#9ca3af' }}>Employees </span>
                  <span style={{ color: '#111', fontWeight: 500 }}>{account.employees}</span>
                </div>
              )}
              {account.revenue_millions && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#9ca3af' }}>Revenue </span>
                  <span style={{ color: '#111', fontWeight: 500 }}>${Number(account.revenue_millions).toLocaleString()}M</span>
                </div>
              )}
              {account.size && !account.employees && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#9ca3af' }}>Size </span>
                  <span style={{ color: '#111', fontWeight: 500 }}>{account.size}</span>
                </div>
              )}
            </div>
          </div>

          {/* Edit button */}
          <button onClick={() => setEditing(!editing)}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', color: '#555', cursor: 'pointer', flexShrink: 0 }}>
            {editing ? 'Cancel' : '✏️ Edit'}
          </button>
        </div>

        {/* Inline Edit Form */}
        {editing && (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              {[
                { key: 'name', label: 'Company Name' },
                { key: 'domain', label: 'Domain (for logo)' },
                { key: 'industry', label: 'Industry' },
                { key: 'country', label: 'Location / Country' },
                { key: 'employees', label: 'Employees' },
                { key: 'revenue_millions', label: 'Revenue (USD millions)' },
                { key: 'website', label: 'Website URL' },
                { key: 'linkedin_url', label: 'LinkedIn URL' },
                { key: 'size', label: 'Size (e.g. 1000-5000)' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input value={editData[f.key] || ''} onChange={e => setEditData({ ...editData, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={editData.status || 'prospecting'} onChange={e => setEditData({ ...editData, status: e.target.value })}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13 }}>
                <option value="prospecting">Prospecting</option>
                <option value="engaged">Engaged</option>
                <option value="demo_booked">Demo Booked</option>
                <option value="closed_won">Closed Won</option>
                <option value="closed_lost">Closed Lost</option>
              </select>
            </div>
            <button onClick={saveEdit}
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none' }}>
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e8e8e4', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
              color: tab === t ? '#2563eb' : '#888', fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>
            {t === 'overview' ? 'Overview' : t === 'contacts' ? `Contacts (${contacts.length})` : t === 'intents' ? `Intents (${intents.length})` : 'Notes'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', padding: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#888', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Company Info</h3>
            {[
              { label: 'Name', value: account.name },
              { label: 'Domain', value: account.domain },
              { label: 'Industry', value: account.industry },
              { label: 'Size', value: account.size },
              { label: 'Country', value: account.country },
              { label: 'Website', value: account.website },
            ].map(r => r.value ? (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontSize: 13, color: '#888' }}>{r.label}</span>
                <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{r.value}</span>
              </div>
            ) : null)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#888' }}>Contacts</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{contacts.length}</span>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#888' }}>Intent Signals</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{intents.length}</span>
            </div>
            {intents.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', padding: 18 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, color: '#888', margin: '0 0 10px' }}>Latest Signals</h4>
                {intents.slice(0, 3).map(i => {
                  const it = INTENT_TYPES.find(t => t.value === i.intent_type);
                  return (
                    <div key={i.id} style={{ fontSize: 12, color: '#555', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      {it?.label || i.intent_type}
                      {i.notes && <span style={{ color: '#aaa', marginLeft: 6 }}>— {i.notes}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Similar Companies */}
      {tab === 'overview' && (() => {
        const simList = account.research?.similar_companies;
        if (!Array.isArray(simList) || simList.length === 0) return null;
        const filtered = simList.filter(c => !allAccountNames.includes((c.name || '').toLowerCase().trim()));
        if (filtered.length === 0) return null;
        const visible = showAllSimilar ? filtered : filtered.slice(0, 3);
        return (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', padding: 20, marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 14px' }}>Similar Companies</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {visible.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < visible.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #e8e8e4', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {c.domain ? (
                      <img
                        src={'https://logo.clearbit.com/' + c.domain}
                        alt={c.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{(c.name || '?')[0]}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{c.name}</div>
                    {c.reason && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{c.reason}</div>}
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > 3 && (
              <button
                onClick={() => setShowAllSimilar(!showAllSimilar)}
                style={{ marginTop: 12, background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 500 }}
              >
                {showAllSimilar ? 'Show less' : 'Show more Companies'}
              </button>
            )}
          </div>
        );
      })()}
      {/* Contacts Tab */}
      {tab === 'contacts' && (
        <div>
          {contacts.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4' }}>
              No contacts linked to this account yet.<br />
              <span style={{ fontSize: 12 }}>Link contacts by editing them on the Contacts page.</span>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e8e8e4' }}>
                    {['Name', 'Title', 'Email', 'Status', 'Response', 'Date Added', 'Last Reached Out', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const sc = CONTACT_STATUS_COLORS[c.status] || { bg: '#f1f5f9', color: '#475569' };
                    const isOwner = c.owner_id === user.id;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f5f5f5', opacity: isOwner ? 1 : 0.85 }}>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                          {c.full_name}
                          {!isOwner && <span style={{ marginLeft: 6, fontSize: 10, color: '#aaa', fontWeight: 400 }}>view only</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#555' }}>{c.title || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#555' }}>{c.email}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>
                          {c.response_type ? c.response_type.replace(/_/g, ' ') : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>
                          {c.last_touchpoint_date ? new Date(c.last_touchpoint_date).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isOwner && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => navigate(`/contacts/${c.id}`)}
                                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>
                                View
                              </button>
                              <button onClick={() => setDeleteConfirm({ id: c.id, name: c.full_name })}
                                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 14, marginBottom: 16 }}>
              Delete <strong>{deleteConfirm.name}</strong>?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#333', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => deleteContact(deleteConfirm.id)}
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intents Tab */}
      {tab === 'intents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={() => setShowAddIntent(!showAddIntent)}
              style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none' }}>
              + Add Signal
            </button>
          </div>

          {showAddIntent && (
            <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Signal Type</label>
                  <select value={newIntent.intent_type} onChange={e => setNewIntent({ ...newIntent, intent_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13 }}>
                    {INTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                  <input value={newIntent.notes} onChange={e => setNewIntent({ ...newIntent, notes: e.target.value })}
                    placeholder="e.g. Posted 3 QA job openings on LinkedIn"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addIntent} disabled={addingIntent}
                  style={{ padding: '7px 18px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none' }}>
                  {addingIntent ? 'Adding…' : 'Add Signal'}
                </button>
                <button onClick={() => setShowAddIntent(false)}
                  style={{ padding: '7px 14px', background: '#f5f5f5', color: '#555', borderRadius: 7, fontSize: 13, cursor: 'pointer', border: 'none' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {intents.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: 10, border: '1px solid #e8e8e4' }}>
              No intent signals yet — add buying signals above
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {intents.map(i => {
                const it = INTENT_TYPES.find(t => t.value === i.intent_type);
                return (
                  <div key={i.id} style={{ background: '#fff', border: '1px solid #e8e8e4', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>{it?.label || i.intent_type}</div>
                      {i.notes && <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>{i.notes}</div>}
                      <div style={{ fontSize: 11, color: '#aaa' }}>
                        {new Date(i.detected_at).toLocaleDateString()}
                        {i.profiles?.full_name && ` · added by ${i.profiles.full_name}`}
                      </div>
                    </div>
                    {i.created_by === user.id && (
                      <button onClick={() => deleteIntent(i.id)}
                        style={{ fontSize: 12, color: '#dc2626', border: '1px solid #fecaca', background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {tab === 'notes' && (
        <div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Company-level notes — visible to all SDRs working this account, same notes shown on each contact's Company Notes tab.</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <textarea
              value={newCompanyNoteText}
              onChange={e => setNewCompanyNoteText(e.target.value)}
              placeholder="Add company intelligence here — budget cycles, key decision makers, known blockers, recent conversations…"
              rows={4}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e0e0e0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
            <button onClick={addCompanyNote} disabled={savingCompanyNote || !newCompanyNoteText.trim()}
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', alignSelf: 'flex-end', opacity: !newCompanyNoteText.trim() ? 0.5 : 1 }}>
              {savingCompanyNote ? 'Saving…' : 'Add'}
            </button>
          </div>
          {companyNotesList.length === 0 ? (
            <p style={{ fontSize: 13, color: '#bbb', textAlign: 'center', padding: '24px 0' }}>No notes yet</p>
          ) : companyNotesList.map(n => (
            <div key={n.id} style={{ padding: '12px 14px', borderRadius: 8, marginBottom: 8, background: '#f8f8f6', borderLeft: '3px solid #e0e0e0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{n.profiles?.full_name || 'Unknown'}</span>
                <span style={{ fontSize: 11, color: '#bbb' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</span>
              </div>
              <p style={{ fontSize: 13, color: '#333', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
