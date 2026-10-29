import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast as sonnerToast } from 'sonner';

const PITCH_TYPES = ['Salesforce','ServiceNow','SAP','Workday','Oracle','MS Dynamics','Pega','nCino','Coupa','Web','Mobile','API'];
const CAMPAIGNS = ['Generic','Selenium','Playwright','Cypress','Testing of AI/Agents'];
const PERSONA_LIST = ['Executive / Economic Buyer','QA / Quality Leader','Engineering Leader','Automation / Technical Expert','DevOps / Transformation / Architecture','Practitioner / End User'];
const INDUSTRIES = ['BFSI / Banking','Healthcare / Life Sciences','Retail / eCommerce','Manufacturing','Insurance','Telecom','Logistics / Supply Chain','Energy / Utilities','Government / Public Sector','Education','Media / Entertainment','Real Estate','Pharma / Biotech','Automotive','Aerospace & Defense'];
const MERGE_FIELDS = ['{{first_name}}','{{last_name}}','{{company}}','{{title}}','{{industry}}'];

function TagPills({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <span key={o} onClick={() => onToggle(o)} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
            border: '1.5px solid ' + (active ? '#3b82f6' : '#e2e8f0'),
            background: active ? '#eff6ff' : '#fff',
            color: active ? '#1d4ed8' : '#64748b', fontWeight: active ? 700 : 500,
          }}>{o}</span>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    draft: { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
    pending_approval: { bg: '#fef3c7', color: '#92400e', label: 'Pending Approval' },
    approved: { bg: '#dcfce7', color: '#166534', label: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  };
  const c = cfg[status] || cfg.draft;
  return <span style={{ background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>{c.label}</span>;
}

function emptyStep(n) { return { step_number: n, delay_days: n === 1 ? 0 : 3, variants: [{ label: 'A', subject: '', body: '', is_active: true }] }; }

function btnStyle(kind) {
  const map = {
    primary: { background: '#2563eb', color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: '#374151', border: '1.5px solid #e2e8f0' },
    danger: { background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca' },
  };
  return { padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', ...map[kind] };
}

export default function Templates() {
  const { user, profile } = useAuth();
  const role = profile?.role || 'owner';
  const canApprove = role === 'admin'; // Approval restricted to Admin only (owner/sub-admin no longer get the Approvals tab)

  const [tab, setTab] = useState('library');
  const [library, setLibrary] = useState([]);
  const [mine, setMine] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [ownerNames, setOwnerNames] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const [fPlatform, setFPlatform] = useState([]);
  const [fPersona, setFPersona] = useState([]);
  const [fCampaign, setFCampaign] = useState([]);
  const [fIndustry, setFIndustry] = useState([]);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null);
  const [editSteps, setEditSteps] = useState([]);
  const [activeVariantTab, setActiveVariantTab] = useState({});
  const [saving, setSaving] = useState(false);

  const [previewing, setPreviewing] = useState(null);
  const [previewSteps, setPreviewSteps] = useState([]);

  const showToast = (msg, type) => { (type === 'error' ? sonnerToast.error : sonnerToast.success)(msg); };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: lib }, { data: own }] = await Promise.all([
      supabase.from('templates').select('*').eq('status', 'approved').eq('visibility', 'org').order('created_at', { ascending: false }),
      supabase.from('templates').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
    ]);
    setLibrary(lib || []);
    setMine(own || []);

    if (canApprove) {
      const { data: pend } = await supabase.from('templates').select('*').eq('status', 'pending_approval').order('created_at', { ascending: true });
      setApprovals(pend || []);
    }

    const allRows = [...(lib || []), ...(own || [])];
    const ownerIds = [...new Set(allRows.map(r => r.owner_id))];
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase.from('org_hierarchy').select('user_id, full_name').in('user_id', ownerIds);
      const map = {};
      (owners || []).forEach(o => { map[o.user_id] = o.full_name; });
      setOwnerNames(map);
    }

    const ids = allRows.map(r => r.id);
    if (ids.length > 0) {
      const { data: assigns } = await supabase.from('template_assignments').select('template_id, status, contact_id').in('template_id', ids);
      const contactIds = [...new Set((assigns || []).map(a => a.contact_id))];
      let contactMap = {};
      if (contactIds.length > 0) {
        const { data: contactRows } = await supabase.from('contacts').select('id, response_state, response_type, status').in('id', contactIds);
        (contactRows || []).forEach(c => { contactMap[c.id] = c; });
      }
      const statMap = {};
      ids.forEach(id => {
        const rows = (assigns || []).filter(a => a.template_id === id);
        const total = rows.length;
        const completed = rows.filter(a => a.status === 'completed').length;
        const replied = rows.filter(a => contactMap[a.contact_id]?.response_state === 'replied').length;
        statMap[id] = { total, completed, replied };
      });
      setStats(statMap);
    }

    setLoading(false);
  }, [user, canApprove]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function matchesFilters(t) {
    const platformTags = t.platform_tags || [];
    const personaTags = t.persona_tags || [];
    const campaignTags = t.campaign_tags || [];
    const industryTags = t.industry_tags || [];
    if (fPlatform.length > 0 && !fPlatform.some(x => platformTags.includes(x))) return false;
    if (fPersona.length > 0 && !fPersona.some(x => personaTags.includes(x))) return false;
    if (fCampaign.length > 0 && !fCampaign.some(x => campaignTags.includes(x))) return false;
    if (fIndustry.length > 0 && !fIndustry.some(x => industryTags.includes(x))) return false;
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }

  function openCreate() {
    setEditing({ id: null, name: '', description: '', platform_tags: [], persona_tags: [], campaign_tags: [], industry_tags: [], status: 'draft', visibility: 'private', version: 1, parent_template_id: null });
    setEditSteps([emptyStep(1)]);
  }

  async function openEdit(t) {
    const { data: steps } = await supabase.from('template_steps').select('*').eq('template_id', t.id).order('step_number');
    const stepRows = steps || [];
    const stepIds = stepRows.map(s => s.id);
    let variantsByStep = {};
    if (stepIds.length > 0) {
      const { data: variants } = await supabase.from('template_step_variants').select('*').in('template_step_id', stepIds).order('label');
      (variants || []).forEach(v => { (variantsByStep[v.template_step_id] = variantsByStep[v.template_step_id] || []).push(v); });
    }
    const built = stepRows.length > 0 ? stepRows.map(s => {
      const vs = variantsByStep[s.id];
      return {
        step_number: s.step_number,
        delay_days: s.delay_days,
        variants: (vs && vs.length > 0)
          ? vs.map(v => ({ label: v.label, subject: v.subject, body: v.body, is_active: v.is_active }))
          : [{ label: 'A', subject: s.subject || '', body: s.body || '', is_active: true }],
      };
    }) : [emptyStep(1)];
    setEditing({ ...t });
    setEditSteps(built);
    setActiveVariantTab({});
  }

  function addStep() {
    setEditSteps(s => [...s, emptyStep(s.length + 1)]);
  }
  function removeStep(idx) {
    setEditSteps(s => s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step_number: i + 1 })));
  }
  function updateStep(idx, field, val) {
    setEditSteps(s => s.map((st, i) => i === idx ? { ...st, [field]: val } : st));
  }
  function insertMergeField(idx, field, target = 'body') {
    const label = activeVariantTab[idx] || editSteps[idx]?.variants?.[0]?.label;
    setEditSteps(s => s.map((st, i) => i !== idx ? st : {
      ...st,
      variants: st.variants.map(v => v.label === label ? { ...v, [target]: (v[target] || '') + ' ' + field } : v),
    }));
  }

  function addVariant(stepIdx) {
    const st = editSteps[stepIdx];
    const used = new Set(st.variants.map(v => v.label));
    let label = null;
    for (let c = 0; c < 26; c++) { const l = String.fromCharCode(65 + c); if (!used.has(l)) { label = l; break; } }
    if (!label) { showToast('Maximum of 26 tests (A-Z) reached', 'error'); return; }
    setEditSteps(s => s.map((stp, i) => i === stepIdx ? { ...stp, variants: [...stp.variants, { label, subject: '', body: '', is_active: true }] } : stp));
    setActiveVariantTab(t => ({ ...t, [stepIdx]: label }));
  }

  function removeVariant(stepIdx, label) {
    setEditSteps(s => s.map((stp, i) => {
      if (i !== stepIdx || stp.variants.length <= 1) return stp;
      return { ...stp, variants: stp.variants.filter(v => v.label !== label) };
    }));
  }

  function toggleVariantActive(stepIdx, label) {
    setEditSteps(s => s.map((stp, i) => i !== stepIdx ? stp : {
      ...stp, variants: stp.variants.map(v => v.label === label ? { ...v, is_active: !v.is_active } : v),
    }));
  }

  function updateVariant(stepIdx, label, field, val) {
    setEditSteps(s => s.map((stp, i) => i !== stepIdx ? stp : {
      ...stp, variants: stp.variants.map(v => v.label === label ? { ...v, [field]: val } : v),
    }));
  }

  async function saveTemplate(publish) {
    if (!editing.name.trim()) { showToast('Name is required', 'error'); return; }
    if (editSteps.some(s => !s.variants || s.variants.length === 0)) { showToast('Every step needs at least one test', 'error'); return; }
    if (editSteps.some(s => s.variants.some(v => !v.subject.trim() || !v.body.trim()))) { showToast('Every test needs a subject and body', 'error'); return; }
    if (editSteps.some(s => !s.variants.some(v => v.is_active))) { showToast('Every step needs at least one active test', 'error'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const wasApprovedOrg = !isNew && editing.status === 'approved' && editing.visibility === 'org';
      const payload = {
        owner_id: user.id,
        parent_template_id: editing.parent_template_id,
        name: editing.name.trim(),
        description: editing.description || '',
        platform_tags: editing.platform_tags,
        persona_tags: editing.persona_tags,
        campaign_tags: editing.campaign_tags,
        industry_tags: editing.industry_tags,
        step_count: editSteps.length,
        updated_at: new Date().toISOString(),
      };
      if (publish) payload.status = 'pending_approval';
      if (wasApprovedOrg) payload.version = (editing.version || 1) + 1;

      let templateId = editing.id;
      if (isNew) {
        const { data: inserted, error } = await supabase.from('templates').insert(payload).select().single();
        if (error) throw error;
        templateId = inserted.id;
      } else {
        const { error } = await supabase.from('templates').update(payload).eq('id', templateId);
        if (error) throw error;
      }

      await supabase.from('template_steps').delete().eq('template_id', templateId);
      // The step's own subject/body stay in sync with Test A (the primary
      // variant) so anything that still reads template_steps directly keeps working.
      const stepPayload = editSteps.map((s, i) => {
        const primary = s.variants.find(v => v.label === 'A') || s.variants[0];
        return { template_id: templateId, step_number: i + 1, subject: primary.subject, body: primary.body, delay_days: s.delay_days || 0 };
      });
      const { data: insertedSteps, error: stepErr } = await supabase.from('template_steps').insert(stepPayload).select();
      if (stepErr) throw stepErr;

      const stepByNumber = {};
      (insertedSteps || []).forEach(row => { stepByNumber[row.step_number] = row; });
      const allVariantRows = [];
      editSteps.forEach((s, i) => {
        const stepRow = stepByNumber[i + 1];
        if (!stepRow) return;
        s.variants.forEach(v => {
          allVariantRows.push({ template_step_id: stepRow.id, label: v.label, subject: v.subject, body: v.body, is_active: v.is_active });
        });
      });
      if (allVariantRows.length > 0) {
        const { error: varErr } = await supabase.from('template_step_variants').insert(allVariantRows);
        if (varErr) throw varErr;
      }

      setEditing(null);
      setEditSteps([]);
      await loadAll();
      showToast(publish ? 'Submitted for Admin approval' : 'Saved as draft');
    } catch (e) {
      showToast(e.message || 'Something went wrong', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function cloneTemplate(t) {
    const { data: steps } = await supabase.from('template_steps').select('*').eq('template_id', t.id).order('step_number');
    const stepIds = (steps || []).map(s => s.id);
    let variantsByStep = {};
    if (stepIds.length > 0) {
      const { data: variants } = await supabase.from('template_step_variants').select('*').in('template_step_id', stepIds);
      (variants || []).forEach(v => { (variantsByStep[v.template_step_id] = variantsByStep[v.template_step_id] || []).push(v); });
    }
    const { data: inserted, error } = await supabase.from('templates').insert({
      owner_id: user.id,
      parent_template_id: t.id,
      name: t.name + ' (My Copy)',
      description: t.description,
      platform_tags: t.platform_tags, persona_tags: t.persona_tags,
      campaign_tags: t.campaign_tags, industry_tags: t.industry_tags,
      step_count: (steps || []).length,
      status: 'approved', visibility: 'private', version: 1,
    }).select().single();
    if (error) { showToast(error.message, 'error'); return; }
    const stepPayload = (steps || []).map(s => ({ template_id: inserted.id, step_number: s.step_number, subject: s.subject, body: s.body, delay_days: s.delay_days }));
    if (stepPayload.length > 0) {
      const { data: newSteps } = await supabase.from('template_steps').insert(stepPayload).select();
      const oldToNew = {};
      (steps || []).forEach(old => { const match = (newSteps || []).find(ns => ns.step_number === old.step_number); if (match) oldToNew[old.id] = match.id; });
      const variantRows = [];
      (steps || []).forEach(old => {
        const vs = variantsByStep[old.id] || [];
        vs.forEach(v => { variantRows.push({ template_step_id: oldToNew[old.id], label: v.label, subject: v.subject, body: v.body, is_active: v.is_active }); });
      });
      if (variantRows.length > 0) await supabase.from('template_step_variants').insert(variantRows);
    }
    await loadAll();
    showToast('Added to My Templates - edit it freely, the original stays untouched');
  }

  async function submitForApproval(t) {
    await supabase.from('templates').update({ status: 'pending_approval' }).eq('id', t.id);
    await loadAll();
    showToast('Submitted for Admin approval');
  }

  async function approve(t) {
    await supabase.from('templates').update({ status: 'approved', visibility: 'org', approved_by: user.id, approved_at: new Date().toISOString() }).eq('id', t.id);
    await loadAll();
    showToast('Template approved and published org-wide');
  }
  async function reject(t) {
    await supabase.from('templates').update({ status: 'rejected' }).eq('id', t.id);
    await loadAll();
    showToast('Template rejected');
  }
  async function deleteTemplate(t) {
    if (!window.confirm('Delete this template?')) return;
    await supabase.from('templates').delete().eq('id', t.id);
    await loadAll();
    showToast('Template deleted');
  }

  async function openPreview(t) {
    const { data: steps } = await supabase.from('template_steps').select('*').eq('template_id', t.id).order('step_number');
    const stepIds = (steps || []).map(s => s.id);
    let variantsByStep = {};
    if (stepIds.length > 0) {
      const { data: variants } = await supabase.from('template_step_variants').select('*').in('template_step_id', stepIds).order('label');
      (variants || []).forEach(v => { (variantsByStep[v.template_step_id] = variantsByStep[v.template_step_id] || []).push(v); });
    }
    setPreviewing(t);
    setPreviewSteps((steps || []).map(s => ({ ...s, variants: variantsByStep[s.id] || [] })));
  }

  function TemplateCard({ t, context }) {
    const s = stats[t.id] || { total: 0, completed: 0, replied: 0 };
    const hasEnoughData = s.total >= 3;
    const replyRate = hasEnoughData ? Math.round((s.replied / s.total) * 100) : null;
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', flex: 1 }}>{t.name}</div>
          <StatusBadge status={t.status} />
        </div>
        {t.description && <div style={{ fontSize: 12, color: '#64748b' }}>{t.description}</div>}
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.step_count} step{t.step_count === 1 ? '' : 's'} - by {ownerNames[t.owner_id] || 'Unknown'} - v{t.version}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[...(t.platform_tags||[]), ...(t.persona_tags||[]), ...(t.campaign_tags||[]), ...(t.industry_tags||[])].map((tag, i) => (
            <span key={i} style={{ fontSize: 10, background: '#f8fafc', color: '#475569', padding: '2px 8px', borderRadius: 20, border: '1px solid #e2e8f0' }}>{tag}</span>
          ))}
        </div>
        {hasEnoughData ? (
          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 10 }}>
            <span><strong style={{ color: '#0f172a' }}>{s.total}</strong> assigned</span>
            <span><strong style={{ color: '#15803d' }}>{s.completed}</strong> completed</span>
            <span><strong style={{ color: '#1d4ed8' }}>{replyRate}%</strong> reply rate</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Not enough usage yet for performance stats</div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <button onClick={() => openPreview(t)} style={btnStyle('secondary')}>Preview</button>
          {context === 'library' && t.owner_id !== user.id && (
            <button onClick={() => cloneTemplate(t)} style={btnStyle('primary')}>+ Add to My Templates</button>
          )}
          {context === 'mine' && (
            <>
              <button onClick={() => openEdit(t)} style={btnStyle('secondary')}>Edit</button>
              {(t.status === 'draft' || t.status === 'rejected') && (
                <button onClick={() => submitForApproval(t)} style={btnStyle('primary')}>Submit for Approval</button>
              )}
              <button onClick={() => deleteTemplate(t)} style={btnStyle('danger')}>Delete</button>
            </>
          )}
          {context === 'approvals' && (
            <>
              <button onClick={() => approve(t)} style={btnStyle('primary')}>Approve</button>
              <button onClick={() => reject(t)} style={btnStyle('danger')}>Reject</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const visibleLibrary = library.filter(matchesFilters);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 28px' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Templates</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Build and share multi-step outreach sequences - an alternative to AI-personalized follow-ups</p>
        </div>
        <button onClick={openCreate} style={{ padding: '10px 18px', borderRadius: 9, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ New Template</button>
      </div>

      <div style={{ maxWidth: 1140, margin: '0 auto 16px', display: 'flex', gap: 8 }}>
        {[
          { v: 'library', label: 'Library (' + library.length + ')' },
          { v: 'mine', label: 'My Templates (' + mine.length + ')' },
          ...(canApprove ? [{ v: 'approvals', label: 'Pending Approval (' + approvals.length + ')' }] : []),
        ].map(tb => (
          <button key={tb.v} onClick={() => setTab(tb.v)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1.5px solid ' + (tab === tb.v ? '#3b82f6' : '#e2e8f0'),
            background: tab === tb.v ? '#eff6ff' : '#fff',
            color: tab === tb.v ? '#1d4ed8' : '#64748b',
          }}>{tb.label}</button>
        ))}
      </div>

      {tab === 'library' && (
        <div style={{ maxWidth: 1140, margin: '0 auto', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, height: 'fit-content' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 14 }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Platform</div>
            <TagPills options={PITCH_TYPES} selected={fPlatform} onToggle={v => setFPlatform(s => s.includes(v) ? s.filter(x=>x!==v) : [...s, v])} />
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Persona</div>
            <TagPills options={PERSONA_LIST} selected={fPersona} onToggle={v => setFPersona(s => s.includes(v) ? s.filter(x=>x!==v) : [...s, v])} />
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Campaign</div>
            <TagPills options={CAMPAIGNS} selected={fCampaign} onToggle={v => setFCampaign(s => s.includes(v) ? s.filter(x=>x!==v) : [...s, v])} />
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Industry</div>
            <TagPills options={INDUSTRIES} selected={fIndustry} onToggle={v => setFIndustry(s => s.includes(v) ? s.filter(x=>x!==v) : [...s, v])} />
          </div>
          <div>
            {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> :
             visibleLibrary.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>No approved templates match these filters yet</div> :
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
              {visibleLibrary.map(t => <TemplateCard key={t.id} t={t} context="library" />)}
            </div>}
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          {mine.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>No templates yet - create one or add one from the Library</div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
            {mine.map(t => <TemplateCard key={t.id} t={t} context="mine" />)}
          </div>}
        </div>
      )}

      {tab === 'approvals' && canApprove && (
        <div style={{ maxWidth: 1140, margin: '0 auto' }}>
          {approvals.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>Nothing waiting on approval</div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
            {approvals.map(t => <TemplateCard key={t.id} t={t} context="approvals" />)}
          </div>}
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{editing.id ? 'Edit Template' : 'New Template'}</div>
              <button onClick={() => setEditing(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>Close</button>
            </div>
            <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Name</label>
              <input value={editing.name} onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, marginBottom: 14 }} />

              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Description</label>
              <textarea value={editing.description} onChange={e => setEditing(ed => ({ ...ed, description: e.target.value }))} rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, marginBottom: 14, resize: 'vertical' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Platform tags</label>
                  <div style={{ marginTop: 6 }}><TagPills options={PITCH_TYPES} selected={editing.platform_tags} onToggle={v => setEditing(ed => ({ ...ed, platform_tags: ed.platform_tags.includes(v) ? ed.platform_tags.filter(x=>x!==v) : [...ed.platform_tags, v] }))} /></div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Persona tags</label>
                  <div style={{ marginTop: 6 }}><TagPills options={PERSONA_LIST} selected={editing.persona_tags} onToggle={v => setEditing(ed => ({ ...ed, persona_tags: ed.persona_tags.includes(v) ? ed.persona_tags.filter(x=>x!==v) : [...ed.persona_tags, v] }))} /></div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Campaign tags</label>
                  <div style={{ marginTop: 6 }}><TagPills options={CAMPAIGNS} selected={editing.campaign_tags} onToggle={v => setEditing(ed => ({ ...ed, campaign_tags: ed.campaign_tags.includes(v) ? ed.campaign_tags.filter(x=>x!==v) : [...ed.campaign_tags, v] }))} /></div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Industry tags</label>
                  <div style={{ marginTop: 6 }}><TagPills options={INDUSTRIES} selected={editing.industry_tags} onToggle={v => setEditing(ed => ({ ...ed, industry_tags: ed.industry_tags.includes(v) ? ed.industry_tags.filter(x=>x!==v) : [...ed.industry_tags, v] }))} /></div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '18px 0 10px', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>Steps ({editSteps.length})</div>
              {editSteps.map((s, i) => {
                const activeLabel = activeVariantTab[i] || s.variants[0]?.label;
                const activeVariant = s.variants.find(v => v.label === activeLabel) || s.variants[0];
                return (
                <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Step {i + 1}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 11, color: '#64748b' }}>Delay (days)</label>
                      <input type="number" min={0} value={s.delay_days} onChange={e => updateStep(i, 'delay_days', parseInt(e.target.value || '0', 10))} style={{ width: 54, border: '1.5px solid #e2e8f0', borderRadius: 6, padding: '4px 6px', fontSize: 12 }} />
                      {editSteps.length > 1 && <button onClick={() => removeStep(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>Remove</button>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    {s.variants.map(v => (
                      <div key={v.label} onClick={() => setActiveVariantTab(t => ({ ...t, [i]: v.label }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                          background: activeLabel === v.label ? '#eff6ff' : 'transparent',
                          border: '1.5px solid ' + (activeLabel === v.label ? '#3b82f6' : 'transparent') }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: activeLabel === v.label ? '#1d4ed8' : '#475569' }}>Test {v.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                          background: v.is_active ? '#dcfce7' : '#f1f5f9', color: v.is_active ? '#166534' : '#94a3b8' }}>
                          {v.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                    <button onClick={() => addVariant(i)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1.5px dashed #94a3b8', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}>+ Add test</button>
                  </div>

                  {activeVariant && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 6 }}>
                        <button onClick={() => toggleVariantActive(i, activeVariant.label)}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid ' + (activeVariant.is_active ? '#fecaca' : '#bbf7d0'),
                            background: '#fff', color: activeVariant.is_active ? '#dc2626' : '#16a34a', cursor: 'pointer' }}>
                          {activeVariant.is_active ? 'Mark Inactive' : 'Mark Active'}
                        </button>
                        {s.variants.length > 1 && (
                          <button onClick={() => removeVariant(i, activeVariant.label)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>Delete test</button>
                        )}
                      </div>
                      <input value={activeVariant.subject} onChange={e => updateVariant(i, activeVariant.label, 'subject', e.target.value)} placeholder="Subject line" style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '7px 10px', fontSize: 13, marginBottom: 6 }} />
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>Insert into subject:</span>
                        {MERGE_FIELDS.map(f => (
                          <span key={f} onClick={() => insertMergeField(i, f, 'subject')} style={{ fontSize: 10, background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: 12, cursor: 'pointer', border: '1px solid #bae6fd' }}>{f}</span>
                        ))}
                      </div>
                      <textarea value={activeVariant.body} onChange={e => updateVariant(i, activeVariant.label, 'body', e.target.value)} placeholder="Email body" rows={5} style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '7px 10px', fontSize: 13, resize: 'vertical' }} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>Insert:</span>
                        {MERGE_FIELDS.map(f => (
                          <span key={f} onClick={() => insertMergeField(i, f, 'body')} style={{ fontSize: 10, background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: 12, cursor: 'pointer', border: '1px solid #bae6fd' }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
              <button onClick={addStep} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px dashed #94a3b8', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%' }}>+ Add Step</button>
            </div>
            <div style={{ padding: '16px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={btnStyle('secondary')}>Cancel</button>
              <button disabled={saving} onClick={() => saveTemplate(false)} style={btnStyle('secondary')}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button disabled={saving} onClick={() => saveTemplate(true)} style={btnStyle('primary')}>{saving ? 'Submitting...' : 'Publish for Approval'}</button>
            </div>
          </div>
        </div>
      )}

      {previewing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => e.target === e.currentTarget && setPreviewing(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{previewing.name}</div>
              <button onClick={() => setPreviewing(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>Close</button>
            </div>
            <div style={{ padding: 22 }}>
              {previewSteps.map((s, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < previewSteps.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Step {s.step_number} {s.delay_days > 0 ? '(+' + s.delay_days + ' days)' : ''}</div>
                  {s.variants && s.variants.length > 1 ? s.variants.map(v => (
                    <div key={v.label} style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>Test {v.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: v.is_active ? '#dcfce7' : '#f1f5f9', color: v.is_active ? '#166534' : '#94a3b8' }}>{v.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>{v.subject}</div>
                      <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{v.body}</div>
                    </div>
                  )) : (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>{s.subject}</div>
                      <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{s.body}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
