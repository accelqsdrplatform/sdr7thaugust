import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function Settings() {
  const { user, profile } = useAuth();
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
        setApiKey(data.ai_api_key ? 'â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢' : '');
        setProvider(data.ai_provider || 'anthropic');
      }
      if (isDirector) {
        const { data: ap } = await supabase.from('org_settings').select('value').eq('key', 'apollo_api_key').single();
        if (ap?.value) setApolloKey('â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢');
      }
      setLoading(false);
    }
    load();
  }, [isDirector]);

  async function save() {
    if (!apiKey || apiKey.startsWith('â¢â¢')) { setSaved('No change â key not updated'); return; }
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
    else { setSaved('API key saved successfully!'); setApiKey('â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢'); }
    setTimeout(() => setSaved(''), 4000);
  }

  async function saveApollo() {
    if (!apolloKey || apolloKey.startsWith('â¢â¢')) { setApolloSaved('No change â key not updated'); return; }
    setApolloSaving(true);
    const { error } = await supabase.from('org_settings').upsert({ key: 'apollo_api_key', value: apolloKey }, { onConflict: 'key' });
    setApolloSaving(false);
    if (error) { setApolloSaved('Error: ' + error.message); }
    else { setApolloSaved('Apollo API key saved!'); setApolloKey('â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢'); }
    setTimeout(() => setApolloSaved(''), 4000);
  }

  // ---- My Writing Prompts ----
  const STAGES = ['Fresh', 'F1', 'F2', 'F3', 'F4', 'F5'];
  const STAGE_LABELS = { Fresh: 'Fresh (first touch)', F1: 'Follow-up 1', F2: 'Follow-up 2', F3: 'Follow-up 3', F4: 'Follow-up 4', F5: 'Follow-up 5 (final)' };
  const STAGE_WORD_DEFAULTS = { Fresh: 100, F1: 50, F2: 80, F3: 60, F4: 50, F5: 70 };
  const TONE_PRESETS = ['Direct', 'Consultative', 'Warm', 'Formal', 'Casual'];

  const [myPrompts, setMyPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [stageSpecByStage, setStageSpecByStage] = useState({});
  const [activeStageTab, setActiveStageTab] = useState('Fresh');

  useEffect(() => {
    async function loadPrompts() {
      const { data } = await supabase.from('email_prompts').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
      setMyPrompts(data || []);
      setLoadingPrompts(false);
    }
    loadPrompts();
  }, [user]);

  async function fetchDefaults() {
    const { data } = await supabase.functions.invoke('generate-email', { body: { action: 'get_default_writing_rules' } });
    return { writingRulesBlock: data?.writingRulesBlock || '', stageSpecByStage: data?.stageSpecByStage || {} };
  }

  function emptyStageConfig() {
    const cfg = {};
    STAGES.forEach(s => { cfg[s] = { mode: 'guided', word_count: null, tone: '', prompt_text: '', guided: { focus: '', message: '', cta: '' } }; });
    return cfg;
  }

  function assembleGuided(g) {
    const parts = [];
    if (g && g.focus && g.focus.trim()) parts.push('Open by focusing on: ' + g.focus.trim());
    if (g && g.message && g.message.trim()) parts.push('Main point to get across: ' + g.message.trim());
    if (g && g.cta && g.cta.trim()) parts.push('End with: ' + g.cta.trim());
    return parts.join(String.fromCharCode(10));
  }

  async function openNewPrompt() {
    const { stageSpecByStage: specs } = await fetchDefaults();
    setStageSpecByStage(specs);
    setActiveStageTab('Fresh');
    setEditingPrompt({ id: null, name: '', visibility: 'private', stage_config: emptyStageConfig() });
  }

  async function openEditPrompt(p) {
    const { stageSpecByStage: specs } = await fetchDefaults();
    setStageSpecByStage(specs);
    setActiveStageTab('Fresh');
    const cfg = {};
    STAGES.forEach(s => {
      const existing = p.stage_config?.[s];
      cfg[s] = existing
        ? { mode: existing.mode || 'freeform', word_count: existing.word_count ?? null, tone: existing.tone || '', prompt_text: existing.prompt_text || '', guided: existing.guided || { focus: '', message: '', cta: '' } }
        : { mode: 'freeform', word_count: null, tone: '', prompt_text: '', guided: { focus: '', message: '', cta: '' } };
    });
    setEditingPrompt({ id: p.id, name: p.name, visibility: p.visibility, stage_config: cfg });
  }

  function updateStage(stage, patch) {
    setEditingPrompt(ep => ep ? { ...ep, stage_config: { ...ep.stage_config, [stage]: { ...ep.stage_config[stage], ...patch } } } : ep);
  }

  function setStageMode(stage, mode) {
    setEditingPrompt(ep => {
      if (!ep) return ep;
      const cur = ep.stage_config[stage];
      let prompt_text = cur.prompt_text;
      if (mode === 'freeform' && cur.mode === 'guided') {
        prompt_text = assembleGuided(cur.guided) || cur.prompt_text;
      }
      return { ...ep, stage_config: { ...ep.stage_config, [stage]: { ...cur, mode, prompt_text } } };
    });
  }

  async function resetStageToDefault(stage) {
    let specs = stageSpecByStage;
    if (!specs[stage]) { const r = await fetchDefaults(); specs = r.stageSpecByStage; setStageSpecByStage(specs); }
    updateStage(stage, { mode: 'freeform', prompt_text: specs[stage] || '' });
  }

  async function savePromptRow() {
    if (!editingPrompt?.name?.trim()) { toast.error('Give the prompt a name before saving.'); return; }
    const finalConfig = {};
    STAGES.forEach(s => {
      const st = editingPrompt.stage_config[s];
      const text = st.mode === 'guided' ? assembleGuided(st.guided) : st.prompt_text;
      if (text && text.trim()) {
        finalConfig[s] = { word_count: st.word_count ? Number(st.word_count) : null, tone: st.tone || null, prompt_text: text.trim(), mode: st.mode, guided: st.mode === 'guided' ? st.guided : null };
      }
    });
    if (Object.keys(finalConfig).length === 0) { toast.error('Add rules for at least one stage before saving.'); return; }
    setSavingPrompt(true);
    const payload = { owner_id: user.id, name: editingPrompt.name.trim(), visibility: editingPrompt.visibility, stage_config: finalConfig, prompt_text: '' };
    let error;
    if (editingPrompt.id) {
      ({ error } = await supabase.from('email_prompts').update(payload).eq('id', editingPrompt.id));
    } else {
      ({ error } = await supabase.from('email_prompts').insert(payload));
    }
    setSavingPrompt(false);
    if (error) { toast.error('Could not save prompt: ' + error.message); return; }
    toast.success('Writing prompt saved.');
    setEditingPrompt(null);
    const { data } = await supabase.from('email_prompts').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
    setMyPrompts(data || []);
  }

  async function deletePromptRow(id) {
    const { error } = await supabase.from('email_prompts').delete().eq('id', id);
    if (error) { toast.error('Could not delete prompt: ' + error.message); return; }
    setMyPrompts(ps => ps.filter(p => p.id !== id));
    toast.success('Prompt deleted.');
  }

  async function togglePromptVisibility(p) {
    const nextVis = p.visibility === 'org' ? 'private' : 'org';
    const { error } = await supabase.from('email_prompts').update({ visibility: nextVis }).eq('id', p.id);
    if (error) { toast.error('Could not update sharing: ' + error.message); return; }
    setMyPrompts(ps => ps.map(x => x.id === p.id ? { ...x, visibility: nextVis } : x));
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
          <div style={{ color: '#aaa' }}>Loadingâ¦</div>
        ) : !isDirector ? (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0369a1' }}>
            â AI API key is configured by your Admin. Your outreach AI features are active.
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
              {saving ? 'Savingâ¦' : 'Save API key'}
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
            â Apollo API key is configured by your Director.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>API key</label>
              <input type="password" value={apolloKey} onChange={e => setApolloKey(e.target.value)} placeholder="Paste Apollo API keyâ¦"
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 5 }}>Paste a new key to update. Existing key is masked.</div>
            </div>
            <button onClick={saveApollo} disabled={apolloSaving}
              style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: apolloSaving ? 0.7 : 1 }}>
              {apolloSaving ? 'Savingâ¦' : 'Save Apollo key'}
            </button>
            {apolloSaved && <div style={{ marginTop: 12, fontSize: 13, color: apolloSaved.startsWith('Error') ? '#dc2626' : '#059669' }}>{apolloSaved}</div>}
          </>
        )}
      </div>

      {/* My Writing Prompts */}
      <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, maxWidth: 680, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>My Writing Prompts</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          Save your own word count, tone and content rules for each stage of the sequence (Fresh through
          Follow-up 5). Pick which one to use from the Follow-ups page -- selecting "Default" always uses
          the current house style, even if you've saved your own. The contact's name, company, notes,
          account research and prior emails are always included automatically whichever style is active --
          you're only describing how the email should read, not what facts to put in it.
        </p>

        {editingPrompt ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Name</label>
              <input value={editingPrompt.name} onChange={e => setEditingPrompt(ep => ({ ...ep, name: e.target.value }))}
                placeholder="e.g. Casual tone" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
              {STAGES.map(s => {
                const st = editingPrompt.stage_config[s];
                const filled = (st.mode === 'guided' ? assembleGuided(st.guided) : st.prompt_text || '').trim();
                return (
                  <button key={s} onClick={() => setActiveStageTab(s)}
                    style={{ padding: '7px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderBottom: activeStageTab === s ? '2px solid #2563eb' : '2px solid transparent', background: 'transparent', color: activeStageTab === s ? '#2563eb' : '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {s}
                    {filled && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
                  </button>
                );
              })}
            </div>

            {(() => {
              const stage = activeStageTab;
              const st = editingPrompt.stage_config[stage];
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>{STAGE_LABELS[stage]} -- house default: {STAGE_WORD_DEFAULTS[stage]} words</div>

                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                    <button onClick={() => setStageMode(stage, 'guided')}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: st.mode === 'guided' ? '1px solid #2563eb' : '1px solid #e0e0e0', background: st.mode === 'guided' ? '#eff6ff' : '#fff', color: st.mode === 'guided' ? '#2563eb' : '#666', cursor: 'pointer', fontWeight: 500 }}>
                      Guided
                    </button>
                    <button onClick={() => setStageMode(stage, 'freeform')}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: st.mode === 'freeform' ? '1px solid #2563eb' : '1px solid #e0e0e0', background: st.mode === 'freeform' ? '#eff6ff' : '#fff', color: st.mode === 'freeform' ? '#2563eb' : '#666', cursor: 'pointer', fontWeight: 500 }}>
                      Write my own
                    </button>
                    <button onClick={() => resetStageToDefault(stage)}
                      style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>
                      Reset to default text
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: '0 0 120px' }}>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Word count</label>
                      <input type="number" value={st.word_count || ''} onChange={e => updateStage(stage, { word_count: e.target.value })}
                        placeholder={String(STAGE_WORD_DEFAULTS[stage])}
                        style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Tone</label>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {TONE_PRESETS.map(t => (
                          <button key={t} onClick={() => updateStage(stage, { tone: st.tone === t ? '' : t })}
                            style={{ fontSize: 11, padding: '5px 10px', borderRadius: 20, border: st.tone === t ? '1px solid #2563eb' : '1px solid #e0e0e0', background: st.tone === t ? '#eff6ff' : '#fff', color: st.tone === t ? '#2563eb' : '#666', cursor: 'pointer' }}>
                            {t}
                          </button>
                        ))}
                        <input value={TONE_PRESETS.includes(st.tone) ? '' : (st.tone || '')} onChange={e => updateStage(stage, { tone: e.target.value })}
                          placeholder="or type your own"
                          style={{ fontSize: 11, padding: '5px 10px', borderRadius: 20, border: '1px solid #e0e0e0', outline: 'none', width: 120 }} />
                      </div>
                    </div>
                  </div>

                  {st.mode === 'guided' ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>What should this email focus on or lead with?</label>
                        <input value={st.guided.focus} onChange={e => updateStage(stage, { guided: { ...st.guided, focus: e.target.value } })}
                          placeholder="e.g. a specific observation about their tech stack or recent news"
                          style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>What's the main point to get across about ACCELQ at this stage?</label>
                        <input value={st.guided.message} onChange={e => updateStage(stage, { guided: { ...st.guided, message: e.target.value } })}
                          placeholder="e.g. how test maintenance drops when releases get frequent"
                          style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>How should it end / what's the ask?</label>
                        <input value={st.guided.cta} onChange={e => updateStage(stage, { guided: { ...st.guided, cta: e.target.value } })}
                          placeholder="e.g. a one-line question they can answer without a call"
                          style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>The contact's name, company, notes and account research are already included automatically -- you're only describing how this email should read.</div>
                    </div>
                  ) : (
                    <div>
                      <textarea value={st.prompt_text} onChange={e => updateStage(stage, { prompt_text: e.target.value })}
                        rows={10} placeholder="Write the full content/structure instructions for this stage..."
                        style={{ width: '100%', fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>The contact's name, company, notes and account research are already included automatically -- you're only describing how this email should read.</div>
                    </div>
                  )}
                </div>
              );
            })()}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={editingPrompt.visibility === 'org'}
                onChange={e => setEditingPrompt(ep => ({ ...ep, visibility: e.target.checked ? 'org' : 'private' }))} />
              Share with the team (visible to everyone, not just you)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={savePromptRow} disabled={savingPrompt}
                style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: savingPrompt ? 0.7 : 1 }}>
                {savingPrompt ? 'Saving...' : 'Save prompt'}
              </button>
              <button onClick={() => setEditingPrompt(null)}
                style={{ padding: '9px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {loadingPrompts ? (
              <div style={{ color: '#aaa' }}>Loading...</div>
            ) : myPrompts.length === 0 ? (
              <div style={{ fontSize: 13, color: '#999', marginBottom: 14 }}>You haven't saved any writing prompts yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {myPrompts.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, border: '1px solid #eee', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{p.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: p.visibility === 'org' ? '#dcfce7' : '#f1f5f9', color: p.visibility === 'org' ? '#166534' : '#64748b' }}>
                        {p.visibility === 'org' ? 'Shared' : 'Private'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => togglePromptVisibility(p)}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#555', cursor: 'pointer' }}>
                        {p.visibility === 'org' ? 'Unshare' : 'Share'}
                      </button>
                      <button onClick={() => openEditPrompt(p)}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#555', cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => deletePromptRow(p.id)}
                        style={{ fontSize: 11, padding: '4px 9px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={openNewPrompt}
              style={{ padding: '8px 18px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              + New writing prompt
            </button>
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
            ð Clear All Data
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
                {clearing ? 'Deletingâ¦' : 'Yes, delete everything'}
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
