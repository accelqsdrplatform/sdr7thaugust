import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { profile } = useAuth();
  const isDirector = profile?.role === 'admin';
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [apolloKey, setApolloKey] = useState('');
  const [apolloSaving, setApolloSaving] = useState(false);
  const [apolloSaved, setApolloSaved] = useState('');

  const [showClear, setShowClear] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState('');

  async function clearAllData() {
    if (!isDirector) return;
    if (clearInput !== 'DELETE') return;
    setClearing(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('contacts').delete().eq('owner_id', user.id);
    await supabase.from('accounts').delete().eq('owner_id', user.id);
    setClearing(false);
    setShowClear(false);
    setClearInput('');
    setClearMsg('All contacts and accounts deleted.');
    setTimeout(() => setClearMsg(''), 5000);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('org_config').select('ai_api_key, ai_provider').single();
      if (data) {
        setApiKey(data.ai_api_key ? '••••••••••••••••' : '');
        setProvider(data.ai_provider || 'anthropic');
      }
      if (isDirector) {
        const { data: ap } = await supabase.from('org_settings').select('value').eq('key', 'apollo_api_key').single();
        if (ap?.value) setApolloKey('••••••••••••••••');
      }
      setLoading(false);
    }
    load();
  }, [isDirector]);

  async function save() {
    if (!apiKey || apiKey.startsWith('••')) { setSaved('No change — key not updated'); return; }
    setSaving(true);
    const { data: existing } = await supabase.from('org_config').select('id').single();
    let err;
    if (existing) {
      const { error } = await supabase.from('org_config').update({ ai_api_key: apiKey, ai_provider: provider }).eq('id', existing.id);
      err = error;
    } else {
      const { error } = await supabase.from('org_config').insert({ ai_api_key: apiKey, ai_provider: provider });
      err = error;
    }
    setSaving(false);
    if (err) { setSaved('Error: ' + err.message); }
    else { setSaved('API key saved successfully!'); setApiKey('••••••••••••••••'); }
    setTimeout(() => setSaved(''), 4000);
  }

  async function saveApollo() {
    if (!apolloKey || apolloKey.startsWith('••')) { setApolloSaved('No change — key not updated'); return; }
    setApolloSaving(true);
    const { error } = await supabase.from('org_settings').upsert({ key: 'apollo_api_key', value: apolloKey }, { onConflict: 'key' });
    setApolloSaving(false);
    if (error) { setApolloSaved('Error: ' + error.message); }
    else { setApolloSaved('Apollo API key saved!'); setApolloKey('••••••••••••••••'); }
    setTimeout(() => setApolloSaved(''), 4000);
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Org-level configuration</p>
      </div>

      {/* AI API Key */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, maxWidth: 560 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>AI API Key</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          This key is shared across all users. Only an Admin can update it.
          It is stored securely in Supabase and never exposed to the browser.
        </p>
        {loading ? (
          <div style={{ color: '#aaa' }}>Loading…</div>
        ) : !isDirector ? (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0369a1' }}>
            ✓ AI API key is configured by your Admin. Your outreach AI features are active.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>AI provider</label>
              <select value={provider} onChange={e => setProvider(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', outline: 'none' }}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>API key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-api03-..."
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 5 }}>Paste a new key to update. Existing key is masked.</div>
            </div>
            <button onClick={save} disabled={saving}
              style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save API key'}
            </button>
            {saved && <div style={{ marginTop: 12, fontSize: 13, color: saved.startsWith('Error') ? '#dc2626' : '#059669' }}>{saved}</div>}
          </>
        )}
      </div>

      {/* Apollo API Key */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, maxWidth: 560, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>Apollo.io API Key</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          Used to import contacts from your Apollo people lists. Only the Director can set this key.
        </p>
        {!isDirector ? (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0369a1' }}>
            ✓ Apollo API key is configured by your Director.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>API key</label>
              <input type="password" value={apolloKey} onChange={e => setApolloKey(e.target.value)} placeholder="Paste Apollo API key…"
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 5 }}>Paste a new key to update. Existing key is masked.</div>
            </div>
            <button onClick={saveApollo} disabled={apolloSaving}
              style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: apolloSaving ? 0.7 : 1 }}>
              {apolloSaving ? 'Saving…' : 'Save Apollo key'}
            </button>
            {apolloSaved && <div style={{ marginTop: 12, fontSize: 13, color: apolloSaved.startsWith('Error') ? '#dc2626' : '#059669' }}>{apolloSaved}</div>}
          </>
        )}
      </div>

      {isDirector && (
      <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: 20, maxWidth: 560, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Danger Zone</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 14, lineHeight: 1.6 }}>
          Permanently delete all your contacts and accounts. This cannot be undone.
        </p>
        {clearMsg && (
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#854d0e', marginBottom: 12 }}>
            {clearMsg}
          </div>
        )}
        {!showClear ? (
          <button onClick={() => setShowClear(true)}
            style={{ padding: '8px 18px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            🗑 Clear All Data
          </button>
        ) : (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: 16 }}>
            <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 10 }}>
              Type DELETE to confirm. This will erase all your contacts, accounts, emails and activity.
            </p>
            <input value={clearInput} onChange={e => setClearInput(e.target.value)} placeholder='Type DELETE'
              style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #fca5a5', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', marginBottom: 12, letterSpacing: 1 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={clearAllData} disabled={clearInput !== 'DELETE' || clearing}
                style={{ padding: '8px 18px', background: clearInput === 'DELETE' ? '#dc2626' : '#e5e7eb', color: clearInput === 'DELETE' ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: clearInput === 'DELETE' ? 'pointer' : 'not-allowed' }}>
                {clearing ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button onClick={() => { setShowClear(false); setClearInput(''); }}
                style={{ padding: '8px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Org info */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, maxWidth: 560, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Your account</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            { label: 'Full name', value: profile?.full_name },
            { label: 'Role', value: profile?.role?.toUpperCase() },
            { label: 'Region', value: profile?.region || 'Not set' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <span style={{ color: '#888', width: 90 }}>{row.label}</span>
              <span style={{ color: '#111', fontWeight: 500 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
