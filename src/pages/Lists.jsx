import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '—';
  const now = new Date();
  const date = new Date(d);
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const STAGE_META = {
  Fresh: { bg: '#dbeafe', color: '#1d4ed8' },
  F1:    { bg: '#d1fae5', color: '#065f46' },
  F2:    { bg: '#fef9c3', color: '#854d0e' },
  F3:    { bg: '#ffedd5', color: '#9a3412' },
  F4:    { bg: '#fee2e2', color: '#991b1b' },
  F5:    { bg: '#f1f5f9', color: '#475569' },
};

// Simple CSV parser (handles quoted fields)
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  function splitLine(line) {
    const cols = [];
    let inQ = false, cur = '';
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }
  const headers = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const cols = splitLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').replace(/^"|"$/g, ''); });
    return row;
  });
  return { headers, rows };
}

export default function Lists() {
  const { user, profile } = useAuth();
  const canViewAll = ['admin', 'sub-admin'].includes(profile?.role);
  const [viewAll, setViewAll] = useState(false);

  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [listContacts, setListContacts] = useState({});

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Apollo import state
  const [apolloTarget, setApolloTarget] = useState(null);
  const [apolloLists, setApolloLists] = useState([]);
  const [apolloLoading, setApolloLoading] = useState(false);
  const [apolloSelected, setApolloSelected] = useState('');
  const [apolloImporting, setApolloImporting] = useState(false);
  const [apolloResult, setApolloResult] = useState(null);
  const [apolloError, setApolloError] = useState('');

  // Add from platform state
  const [platformTarget, setPlatformTarget] = useState(null);
  const [platformAll, setPlatformAll] = useState([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformSearch, setPlatformSearch] = useState('');
  const [platformSelected, setPlatformSelected] = useState(new Set());
  const [platformAdding, setPlatformAdding] = useState(false);

  // CSV upload state
  const [csvTarget, setCsvTarget] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvParsed, setCsvParsed] = useState([]);
  const [csvMapping, setCsvMapping] = useState({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const csvInputRef = useRef(null);

  // Export CSV
  const [exporting, setExporting] = useState(null);

  // Bulk outreach
  const [outreachTarget, setOutreachTarget] = useState(null);
  const [outreachTrack, setOutreachTrack] = useState('ai');
  const [outreachTemplateId, setOutreachTemplateId] = useState('');
  const [outreachTemplates, setOutreachTemplates] = useState([]);
  const [outreachMailboxes, setOutreachMailboxes] = useState([]);
  const [outreachMailboxId, setOutreachMailboxId] = useState('');
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachRunning, setOutreachRunning] = useState(false);
  const [outreachResult, setOutreachResult] = useState(null);

  // Find & merge duplicates
  const [dupTarget, setDupTarget] = useState(null);
  const [dupGroups, setDupGroups] = useState([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupMerging, setDupMerging] = useState(null);

  useEffect(() => { fetchLists(); }, [viewAll]);

  async function fetchLists() {
    setLoading(true);
    let q = supabase.from('lists').select('*').order('created_at', { ascending: false });
    if (!viewAll || !canViewAll) q = q.eq('owner_id', user.id);
    const { data } = await q;
    setLists(data || []);
    setLoading(false);
  }

  async function fetchListContacts(listId) {
    const { data: cls } = await supabase
      .from('contact_lists')
      .select('*, contacts(*)')
      .eq('list_id', listId)
      .order('added_date', { ascending: false });
    setListContacts(prev => ({
      ...prev,
      [listId]: (cls || []).map(cl => ({ cl, contact: cl.contacts })),
    }));
  }

  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    fetchListContacts(id);
  }

  async function createList() {
    if (!newName.trim()) return;
    setCreating(true);
    await supabase.from('lists').insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      owner_id: user.id,
    });
    setNewName(''); setNewDesc(''); setShowCreate(false); setCreating(false);
    fetchLists();
  }

  async function renameList(id) {
    if (!renameVal.trim()) return;
    await supabase.from('lists').update({ name: renameVal.trim() }).eq('id', id);
    setRenaming(null); setRenameVal('');
    fetchLists();
  }

  async function deleteList(id) {
    await supabase.from('lists').delete().eq('id', id);
    setDeleteConfirm(null);
    if (expanded === id) setExpanded(null);
    fetchLists();
  }

  async function removeFromList(contactId, listId) {
    await supabase.from('contact_lists').delete()
      .eq('contact_id', contactId).eq('list_id', listId);
    fetchListContacts(listId);
  }

  async function toggleCampaign(cl, listId) {
    await supabase.from('contact_lists')
      .update({ is_active_campaign: !cl.is_active_campaign })
      .eq('id', cl.id);
    fetchListContacts(listId);
  }

  // ── Apollo import ─────────────────────────────────────────────────────────

  async function openApolloModal(list) {
    setApolloTarget(list);
    setApolloLists([]);
    setApolloSelected('');
    setApolloResult(null);
    setApolloError('');
    setApolloLoading(true);
    const { data, error } = await supabase.functions.invoke('apollo-proxy', {
      body: { action: 'list_lists' },
    });
    setApolloLoading(false);
    if (error || data?.error) {
      setApolloError(error?.message || data?.error || 'Failed to load Apollo lists');
      return;
    }
    setApolloLists(data?.labels || []);
  }

  async function importFromApollo() {
    if (!apolloSelected || !apolloTarget) return;
    setApolloImporting(true);
    setApolloError('');

    const allContacts = [];
    let page = 1;
    let totalPages = 1;
    do {
      const { data, error } = await supabase.functions.invoke('apollo-proxy', {
        body: { action: 'list_contacts', list_id: apolloSelected, page, per_page: 25 },
      });
      if (error || data?.error) { setApolloError(error?.message || data?.error || 'Import failed'); setApolloImporting(false); return; }
      allContacts.push(...(data?.contacts || []));
      totalPages = data?.pagination?.total_pages || 1;
      page++;
    } while (page <= totalPages && page <= 20);

    const withEmail = allContacts.filter(c => c.email);

    if (withEmail.length > 0) {
      // Preserve an existing contact's current owner on conflict; only new contacts
      // get owner_id set to the importing user. Without owner_id, newly-created rows
      // are invisible under owner-scoped views (the "My" filter elsewhere in this app).
      const apolloEmails = withEmail.map(c => c.email);
      const { data: existingApollo } = await supabase.from('contacts').select('email, owner_id').in('email', apolloEmails);
      const ownerByEmail = {};
      (existingApollo || []).forEach(e => { ownerByEmail[e.email] = e.owner_id; });
      await supabase.from('contacts').upsert(
        withEmail.map(c => ({
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email,
          company: c.organization_name || c.account?.name || '',
          title: c.title || '',
          linkedin_url: c.linkedin_url || null,
          status: 'Fresh',
          owner_id: ownerByEmail[c.email] || user.id,
        })),
        { onConflict: 'email', ignoreDuplicates: false }
      );

      const emails = withEmail.map(c => c.email);
      const { data: found } = await supabase.from('contacts').select('id').in('email', emails);

      if (found?.length) {
        await supabase.from('contact_lists').upsert(
          found.map(c => ({ contact_id: c.id, list_id: apolloTarget.id, added_date: new Date().toISOString() })),
          { onConflict: 'contact_id,list_id' }
        );
      }

      setApolloResult({ imported: withEmail.length, added: found?.length || 0, total: allContacts.length });
    } else {
      setApolloResult({ imported: 0, added: 0, total: allContacts.length });
    }

    setApolloImporting(false);
    fetchListContacts(apolloTarget.id);
  }

  function closeApollo() {
    if (apolloResult) fetchListContacts(apolloTarget?.id);
    setApolloTarget(null);
    setApolloResult(null);
    setApolloError('');
    setApolloSelected('');
  }

  // ── Add from platform ─────────────────────────────────────────────────────

  async function openPlatformModal(list) {
    setPlatformTarget(list);
    setPlatformSelected(new Set());
    setPlatformSearch('');
    setPlatformLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company, title, status')
      .order('first_name')
      .limit(500);
    setPlatformAll(data || []);
    setPlatformLoading(false);
  }

  function togglePlatformSelect(id) {
    setPlatformSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function addFromPlatform() {
    if (!platformSelected.size || !platformTarget) return;
    setPlatformAdding(true);
    await supabase.from('contact_lists').upsert(
      [...platformSelected].map(id => ({ contact_id: id, list_id: platformTarget.id, added_date: new Date().toISOString() })),
      { onConflict: 'contact_id,list_id' }
    );
    setPlatformAdding(false);
    fetchListContacts(platformTarget.id);
    setPlatformTarget(null);
  }

  const platformFiltered = platformAll.filter(c => {
    if (!platformSearch.trim()) return true;
    const q = platformSearch.toLowerCase();
    return (
      (c.first_name || '').toLowerCase().includes(q) ||
      (c.last_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    );
  });

  // ── CSV upload ────────────────────────────────────────────────────────────

  function openCsvModal(list) {
    setCsvTarget(list);
    setCsvHeaders([]);
    setCsvParsed([]);
    setCsvMapping({});
    setCsvResult(null);
  }

  function handleCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const { headers, rows } = parseCSV(e.target.result);
      setCsvHeaders(headers);
      setCsvParsed(rows);
      const findCol = (...names) => headers.find(h => names.some(n => h.toLowerCase().replace(/[\s_-]/g, '').includes(n.toLowerCase().replace(/[\s_-]/g, '')))) || '';
      const firstCol = findCol('firstname', 'first name', 'first_name');
      const lastCol = findCol('lastname', 'last name', 'last_name');
      // Some exports only have a single combined name column (e.g. Name, Full Name,
      // Contact Name) instead of separate first/last columns. When neither of those was
      // found, look for a standalone name column -- but never one that is really a company
      // or account name, so we avoid importing an organization name as a person name.
      const fullNameCol = (!firstCol && !lastCol) ? (headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, '');
        if (['company','account','organization','employer'].some(x => norm.includes(x))) return false;
        return norm === 'name' || norm === 'fullname' || norm === 'contactname' || norm === 'personname';
      }) || '') : '';
      setCsvMapping({
        first_name: firstCol,
        last_name: lastCol,
        full_name: fullNameCol,
        email: findCol('email', 'e-mail'),
        company: findCol('company', 'organization', 'account', 'employer'),
        title: findCol('title', 'jobtitle', 'position', 'role'),
      });
    };
    reader.readAsText(file);
  }

  async function importFromCsv() {
    if (!csvParsed.length || !csvTarget) return;
    setCsvImporting(true);

    const parsedRows = csvParsed.map(row => ({
      first_name: (csvMapping.first_name ? row[csvMapping.first_name] : '') || '',
      last_name: (csvMapping.last_name ? row[csvMapping.last_name] : '') || '',
      full_name: (csvMapping.full_name ? row[csvMapping.full_name] : '') || '',
      email: ((csvMapping.email ? row[csvMapping.email] : '') || '').trim(),
      company: (csvMapping.company ? row[csvMapping.company] : '') || '',
      title: (csvMapping.title ? row[csvMapping.title] : '') || '',
    })).filter(c => c.email);

    // When there is no dedicated first/last name for a row, fall back to splitting
    // the combined full-name column (first word = first name, rest = last name).
    parsedRows.forEach(c => {
      if (!c.first_name && !c.last_name && c.full_name) {
        const parts = c.full_name.trim().split(/\s+/);
        c.first_name = parts[0] || '';
        c.last_name = parts.slice(1).join(' ') || '';
      }
      delete c.full_name;
    });

    let added = 0;
    if (parsedRows.length > 0) {
      // Never blank out a name/company/title a contact already has in the CRM just
      // because this CSV row left that column empty -- only fill in what the row
      // actually supplies, and keep whatever was already on file otherwise.
      const emails = parsedRows.map(c => c.email);
      const { data: existing } = await supabase.from('contacts').select('email, first_name, last_name, company, title, owner_id').in('email', emails);
      const byEmail = {};
      (existing || []).forEach(e => { byEmail[e.email] = e; });
      const contacts = parsedRows.map(c => {
        const prior = byEmail[c.email];
        return {
          first_name: c.first_name || prior?.first_name || '',
          last_name: c.last_name || prior?.last_name || '',
          email: c.email,
          company: c.company || prior?.company || '',
          title: c.title || prior?.title || '',
          status: 'Fresh',
          // Keep an existing contact's current owner; only newly-created contacts are
          // owned by the user doing this import (owner_id is required for the row to
          // show up under owner-scoped views elsewhere in the app).
          owner_id: prior?.owner_id || user.id,
        };
      });
      await supabase.from('contacts').upsert(contacts, { onConflict: 'email', ignoreDuplicates: false });
      const { data: found } = await supabase.from('contacts').select('id').in('email', emails);
      if (found?.length) {
        await supabase.from('contact_lists').upsert(
          found.map(c => ({ contact_id: c.id, list_id: csvTarget.id, added_date: new Date().toISOString() })),
          { onConflict: 'contact_id,list_id' }
        );
        added = found.length;
      }
    }

    setCsvResult({ total: csvParsed.length, withEmail: parsedRows.length, added });
    setCsvImporting(false);
    fetchListContacts(csvTarget.id);
  }

  // ── Export list to CSV ──────────────────────────────────────────────────

  function csvField(v) {
    v = (v == null ? '' : String(v));
    const bad = /["\n,\r]/.test(v);
    if (!bad) return v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  async function ensureListContacts(listId) {
    const existing = listContacts[listId];
    if (existing) return existing;
    const { data: cls } = await supabase
      .from('contact_lists')
      .select('*, contacts(*)')
      .eq('list_id', listId)
      .order('added_date', { ascending: false });
    const rows = (cls || []).map(cl => ({ cl, contact: cl.contacts }));
    setListContacts(prev => ({ ...prev, [listId]: rows }));
    return rows;
  }

  async function exportListCSV(list) {
    setExporting(list.id);
    const rows = await ensureListContacts(list.id);
    const COLUMNS = ['First Name', 'Last Name', 'Email', 'Title', 'Company', 'Status', 'Track', 'LinkedIn', 'Added to List', 'Last Touchpoint', 'Active Campaign'];
    const lines = [COLUMNS.join(',')];
    rows.forEach(({ cl, contact: c }) => {
      if (!c) return;
      lines.push([
        csvField(c.first_name), csvField(c.last_name), csvField(c.email), csvField(c.title),
        csvField(c.company), csvField(c.status), csvField(c.track || 'ai'), csvField(c.linkedin_url),
        csvField(cl.added_date ? cl.added_date.slice(0, 10) : ''),
        csvField(c.last_touchpoint_date ? c.last_touchpoint_date.slice(0, 10) : ''),
        csvField(cl.is_active_campaign ? 'Yes' : 'No'),
      ].join(','));
    });
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (list.name || 'list').replace(/[^a-z0-9]+/gi, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  // ── Bulk-push a list into outreach (AI or Templated track) ────────────────

  async function openOutreachModal(list) {
    setOutreachTarget(list);
    setOutreachResult(null);
    setOutreachTrack('ai');
    setOutreachTemplateId('');
    setOutreachLoading(true);
    await ensureListContacts(list.id);
    const [{ data: tpls }, { data: mboxes }] = await Promise.all([
      supabase.from('templates').select('*').eq('status', 'approved').eq('visibility', 'org').order('name'),
      supabase.from('email_accounts').select('id, email_address').eq('user_id', user.id).eq('is_active', true).order('created_at'),
    ]);
    setOutreachTemplates(tpls || []);
    setOutreachMailboxes(mboxes || []);
    setOutreachMailboxId(mboxes && mboxes.length ? mboxes[0].id : '');
    setOutreachLoading(false);
  }

  function outreachEligibleContacts() {
    if (!outreachTarget) return [];
    const rows = listContacts[outreachTarget.id] || [];
    return rows.filter(r => r.contact && r.contact.owner_id === user.id);
  }

  async function runBulkOutreach() {
    if (outreachTrack === 'templated' && !outreachTemplateId) return;
    const eligible = outreachEligibleContacts();
    if (!eligible.length) return;
    setOutreachRunning(true);
    const now = new Date().toISOString();
    const mailbox = outreachMailboxes.find(m => m.id === outreachMailboxId);
    const tpl = outreachTemplates.find(t => t.id === outreachTemplateId);
    let steps = [];
    if (outreachTrack === 'templated') {
      const { data } = await supabase.from('template_steps').select('*').eq('template_id', outreachTemplateId).order('step_number');
      steps = data || [];
    }
    let started = 0;
    for (const row of eligible) {
      const c = row.contact;
      const updatePayload = { status: 'Fresh', next_followup: now, track: outreachTrack };
      if (!c.sender_account_id && mailbox) {
        updatePayload.sender_account_id = mailbox.id;
        updatePayload.sender_email = mailbox.email_address;
      }
      await supabase.from('contacts').update(updatePayload).eq('id', c.id);
      if (outreachTrack === 'templated') {
        await supabase.from('template_assignments').insert({
          contact_id: c.id, template_id: outreachTemplateId, template_name: tpl ? tpl.name : '',
          template_version: tpl ? tpl.version : 1, steps, current_step: 1, status: 'active', assigned_by: user.id,
        });
      }
      await supabase.from('activity_log').insert({
        actor_id: user.id, contact_id: c.id, activity_type: 'outreach_started',
        details: { started_from: 'list', list_name: outreachTarget.name },
      });
      started++;
    }
    setOutreachResult({ started, total: eligible.length, skipped: (listContacts[outreachTarget.id] || []).length - eligible.length });
    setOutreachRunning(false);
    fetchListContacts(outreachTarget.id);
  }

  function closeOutreach() {
    setOutreachTarget(null);
    setOutreachResult(null);
  }

  // ── Find & merge duplicate contacts within a list ──────────────────────────

  function normKey(s) { return (s || '').trim().toLowerCase(); }

  async function openDuplicatesModal(list) {
    setDupTarget(list);
    setDupLoading(true);
    const rows = await ensureListContacts(list.id);
    const byEmail = {};
    const byName = {};
    rows.forEach(r => {
      const c = r.contact;
      if (!c) return;
      const ek = normKey(c.email);
      if (ek) { (byEmail[ek] = byEmail[ek] || []).push(r); }
      const nk = normKey((c.first_name || '') + ' ' + (c.last_name || '')) + '|' + normKey(c.company);
      if (nk !== '|' && nk.trim() !== '|') { (byName[nk] = byName[nk] || []).push(r); }
    });
    const groupsMap = new Map();
    [...Object.values(byEmail), ...Object.values(byName)].forEach(g => {
      if (g.length < 2) return;
      const key = g.map(r => r.contact.id).sort().join(',');
      groupsMap.set(key, g);
    });
    setDupGroups([...groupsMap.values()]);
    setDupLoading(false);
  }

  async function mergeDuplicateGroup(group, keepId) {
    setDupMerging(keepId);
    const losers = group.filter(r => r.contact.id !== keepId);
    for (const r of losers) {
      await supabase.from('contact_lists').delete().eq('id', r.cl.id);
      const { data: activity } = await supabase.from('activity_log').select('id').eq('contact_id', r.contact.id).limit(1);
      if (!r.contact.last_contacted && (!activity || activity.length === 0)) {
        await supabase.from('contact_lists').delete().eq('contact_id', r.contact.id);
        await supabase.from('contacts').delete().eq('id', r.contact.id);
      }
    }
    setDupMerging(null);
    if (dupTarget) {
      await fetchListContacts(dupTarget.id);
      openDuplicatesModal(dupTarget);
    }
  }

  function closeDuplicates() {
    setDupTarget(null);
    setDupGroups([]);
  }

  // ─────────────────────────────────────────────────────────────────────────

  const btnStyle = (color = '#2563eb') => ({
    padding: '6px 12px', borderRadius: 7, border: `1px solid ${color}20`,
    background: color + '12', color, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>📋 Lists</h1>
            {canViewAll && (
              <button onClick={() => setViewAll(v => !v)}
                style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid #e0e0e0',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: viewAll ? '#111' : '#fff', color: viewAll ? '#fff' : '#555' }}>
                {viewAll ? '👥 Team view' : 'View all'}
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
            {lists.length} list{lists.length !== 1 ? 's' : ''} · Organize contacts into targeted campaign groups
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Create List
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 18 }}>Create New List</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>List Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Banking Q3, Workday Decision Makers"
                onKeyDown={e => e.key === 'Enter' && createList()}
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Description (optional)</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="What is this list for?"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={createList} disabled={creating || !newName.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: newName.trim() ? '#2563eb' : '#9ca3af',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>
                {creating ? 'Creating...' : 'Create List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', marginBottom: 10 }}>Delete List?</div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
              "<strong>{deleteConfirm.name}</strong>" will be deleted. Contacts won't be deleted — just removed from this list.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => deleteList(deleteConfirm.id)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apollo Import Modal */}
      {apolloTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>🚀 Import from Apollo</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Adding to: <strong>{apolloTarget.name}</strong></div>

            {apolloResult ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Import complete</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {apolloResult.total} contacts in list · {apolloResult.imported} had emails · {apolloResult.added} added to "{apolloTarget.name}"
                </div>
                <button onClick={closeApollo}
                  style={{ marginTop: 20, padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : apolloLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280', fontSize: 13 }}>Loading your Apollo lists...</div>
            ) : apolloError ? (
              <div>
                <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{apolloError}</div>
                <button onClick={closeApollo} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Close</button>
              </div>
            ) : (
              <>
                {apolloLists.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>No saved lists found in Apollo.</div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                      Select an Apollo list ({apolloLists.length} available)
                    </label>
                    <div style={{ maxHeight: 260, overflowY: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 8 }}>
                      {apolloLists.map(l => (
                        <div key={l.id} onClick={() => setApolloSelected(l.id)}
                          style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                            background: apolloSelected === l.id ? '#eff6ff' : '#fff' }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${apolloSelected === l.id ? '#2563eb' : '#d1d5db'}`,
                            background: apolloSelected === l.id ? '#2563eb' : '#fff', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{l.name}</div>
                            {l.contacts_count !== undefined && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.contacts_count} contacts</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={closeApollo} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={importFromApollo} disabled={!apolloSelected || apolloImporting}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
                      background: apolloSelected ? '#2563eb' : '#9ca3af',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: apolloSelected ? 'pointer' : 'not-allowed' }}>
                    {apolloImporting ? 'Importing...' : 'Import contacts'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add from Platform Modal */}
      {platformTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>👥 Add from Platform</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Adding to: <strong>{platformTarget.name}</strong></div>

            <input value={platformSearch} onChange={e => setPlatformSearch(e.target.value)}
              placeholder="Search by name, email, or company…"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', marginBottom: 10 }} />

            {platformLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af', fontSize: 13 }}>Loading contacts...</div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 14 }}>
                {platformFiltered.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No contacts found</div>
                ) : platformFiltered.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
                  const sel = platformSelected.has(c.id);
                  return (
                    <div key={c.id} onClick={() => togglePlatformSelect(c.id)}
                      style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                        background: sel ? '#eff6ff' : '#fff' }}>
                      <input type="checkbox" readOnly checked={sel} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.title || ''}{c.title && c.company ? ' · ' : ''}{c.company || ''}</div>
                      </div>
                      {c.status && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          background: (STAGE_META[c.status] || STACE_META.F5).bg,
                          color: (STAGE_META[c.status] || STAGE_META.F5).color }}>
                          {c.status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {platformSelected.size} selected
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPlatformTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={addFromPlatform} disabled={!platformSelected.size || platformAdding}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: platformSelected.size ? '#2563eb' : '#9ca3af',
                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: platformSelected.size ? 'pointer' : 'not-allowed' }}>
                  {platformAdding ? 'Adding...' : `Add ${platformSelected.size || ''} contacts`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {csvTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>📎 Upload CSV</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 18 }}>Adding to: <strong>{csvTarget.name}</strong></div>

            {csvResult ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Import complete</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {csvResult.total} rows · {csvResult.withEmail} had emails · {csvResult.added} added to list
                </div>
                <button onClick={() => setCsvTarget(null)}
                  style={{ marginTop: 20, padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : csvParsed.length > 0 ? (
              <>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 14 }}>
                  <strong>{csvParsed.length}</strong> rows detected. Map your columns:
                </div>
                {['first_name', 'last_name', 'full_name', 'email', 'company', 'title'].map(field => (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>
                      {field.replace('_', ' ')}{field === 'email' ? ' *' : ''}
                    </div>
                    <select value={csvMapping[field] || ''}
                      onChange={e => setCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 12, outline: 'none' }}>
                      <option value="">— skip —</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
                <div style={{ marginTop: 6, marginBottom: 16, fontSize: 11, color: '#9ca3af' }}>
                  Preview: {csvParsed[0]?.[csvMapping.first_name] || '—'} {csvParsed[0]?.[csvMapping.last_name] || ''} · {csvParsed[0]?.[csvMapping.email] || '—'} · {csvParsed[0]?.[csvMapping.company] || '—'}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setCsvParsed([]); setCsvHeaders([]); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Back</button>
                  <button onClick={importFromCsv} disabled={!csvMapping.email || csvImporting}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
                      background: csvMapping.email ? '#2563eb' : '#9ca3af',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: csvMapping.email ? 'pointer' : 'not-allowed' }}>
                    {csvImporting ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  onClick={() => csvInputRef.current?.click()}
                  style={{ border: '2px dashed #d1d5db', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 20,
                    background: '#fafafa' }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Click or drag a CSV file here</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Expected columns: first name, last name, email, company, title</div>
                </div>
                <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files[0]; if (f) handleCsvFile(f); }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setCsvTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Start Outreach Modal */}
      {outreachTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>🚀 Start Outreach</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 18 }}>From list: <strong>{outreachTarget.name}</strong></div>

            {outreachResult ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Outreach started</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Started {outreachResult.started} of your {outreachResult.total} contacts in this list.
                  {outreachResult.skipped > 0 && (' ' + outreachResult.skipped + ' other contact' + (outreachResult.skipped !== 1 ? 's' : '') + ' in this list belong to teammates and were skipped.')}
                </div>
                <button onClick={closeOutreach}
                  style={{ marginTop: 20, padding: '9px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : outreachLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280', fontSize: 13 }}>Loading…</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>
                  {outreachEligibleContacts().length} of your contacts in this list are eligible. Contacts owned by teammates are skipped.
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Track</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div onClick={() => setOutreachTrack('ai')}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                        border: '1.5px solid ' + (outreachTrack === 'ai' ? '#2563eb' : '#e5e7eb'),
                        background: outreachTrack === 'ai' ? '#eff6ff' : '#fff', fontSize: 13, fontWeight: 600,
                        color: outreachTrack === 'ai' ? '#1d4ed8' : '#374151' }}>
                      ✨ AI-personalized
                    </div>
                    <div onClick={() => setOutreachTrack('templated')}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                        border: '1.5px solid ' + (outreachTrack === 'templated' ? '#2563eb' : '#e5e7eb'),
                        background: outreachTrack === 'templated' ? '#eff6ff' : '#fff', fontSize: 13, fontWeight: 600,
                        color: outreachTrack === 'templated' ? '#1d4ed8' : '#374151' }}>
                      📄 Templated
                    </div>
                  </div>
                </div>
                {outreachTrack === 'templated' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Template</label>
                    <select value={outreachTemplateId} onChange={e => setOutreachTemplateId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                      <option value="">— choose a template —</option>
                      {outreachTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
                {outreachMailboxes.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Send from (used only for contacts without a mailbox already set)</label>
                    <select value={outreachMailboxId} onChange={e => setOutreachMailboxId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                      {outreachMailboxes.map(m => <option key={m.id} value={m.id}>{m.email_address}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={closeOutreach} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={runBulkOutreach} disabled={outreachRunning || !outreachEligibleContacts().length || (outreachTrack === 'templated' && !outreachTemplateId)}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
                      background: (!outreachEligibleContacts().length || (outreachTrack === 'templated' && !outreachTemplateId)) ? '#9ca3af' : '#dc2626',
                      color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: (!outreachEligibleContacts().length || (outreachTrack === 'templated' && !outreachTemplateId)) ? 'not-allowed' : 'pointer' }}>
                    {outreachRunning ? 'Starting…' : 'Start outreach for ' + outreachEligibleContacts().length + ' contacts'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Find Duplicates Modal */}
      {dupTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>🔀 Find Duplicates</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>In list: <strong>{dupTarget.name}</strong></div>

            {dupLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280', fontSize: 13 }}>Scanning for duplicates…</div>
            ) : dupGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>No duplicates found — same email or same name &amp; company.</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {dupGroups.map((group, gi) => (
                  <div key={gi} style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {group.length} possible duplicates — pick the one to keep
                    </div>
                    {group.map(r => {
                      const c = r.contact;
                      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.email} · {c.company || '—'} · {c.status || '—'}</div>
                          </div>
                          <button onClick={() => mergeDuplicateGroup(group, c.id)} disabled={dupMerging === c.id}
                            style={{ padding: '5px 12px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              background: dupMerging === c.id ? '#fde68a' : '#d97706', color: '#fff' }}>
                            {dupMerging === c.id ? 'Merging…' : 'Keep this one'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: dupGroups.length ? 4 : 16 }}>
              <button onClick={closeDuplicates} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Lists */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>Loading lists...</div>
      ) : lists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>No lists yet</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Create a list to organize your contacts into targeted campaigns
          </div>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '10px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Create your first list
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lists.map(list => {
            const isExpanded = expanded === list.id;
            const contacts = listContacts[list.id] || [];
            const activeCampaigns = contacts.filter(r => r.cl.is_active_campaign).length;

            return (
              <div key={list.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

                {/* List header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => toggleExpand(list.id)}>
                  <div style={{ fontSize: 18 }}>📋</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renaming === list.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameList(list.id); if (e.key === 'Escape') setRenaming(null); }}
                          autoFocus
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px solid #2563eb', fontSize: 14, fontWeight: 600, outline: 'none', width: 240 }} />
                        <button onClick={() => renameList(list.id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setRenaming(null)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{list.name}</div>
                    )}
                    {list.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{list.description}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    {activeCampaigns > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>
                        🟢 {activeCampaigns} active
                      </span>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Created {formatDate(list.created_at)}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setRenaming(list.id); setRenameVal(list.name); }}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                      Rename
                    </button>
                    <button onClick={() => setDeleteConfirm({ id: list.id, name: list.name })}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', fontSize: 11, color: '#dc2626', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>

                  <div style={{ fontSize: 13, color: '#9ca3af', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</div>
                </div>

                {/* Expanded contacts */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6' }}>

                    {/* Add contacts toolbar */}
                    <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>
                        {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                      </span>
                      <div style={{ flex: 1 }} />
                      <button onClick={e => { e.stopPropagation(); openApolloModal(list); }} style={btnStyle('#7c3aed')}>
                        🚀 Import from Apollo
                      </button>
                      <button onClick={e => { e.stopPropagation(); openPlatformModal(list); }} style={btnStyle('#2563eb')}>
                        👥 Add from platform
                      </button>
                      <button onClick={e => { e.stopPropagation(); openCsvModal(list); }} style={btnStyle('#059669')}>
                        📎 Upload CSV
                      </button>
                      <button onClick={e => { e.stopPropagation(); exportListCSV(list); }} disabled={exporting === list.id} style={btnStyle('#374151')}>
                        {exporting === list.id ? 'Exporting…' : '📤 Export CSV'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); openOutreachModal(list); }} style={btnStyle('#dc2626')}>
                        🚀 Start Outreach
                      </button>
                      <button onClick={e => { e.stopPropagation(); openDuplicatesModal(list); }} style={btnStyle('#d97706')}>
                        🔀 Find Duplicates
                      </button>
                    </div>

                    {contacts.length === 0 ? (
                      <div style={{ padding: '28px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                        No contacts yet — use the buttons above to add some.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                            {['Name', 'Company', 'Stage', 'Added to List', 'Last Touchpoint', 'Campaign', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.map(({ cl, contact: c }) => {
                            if (!c) return null;
                            const sm = STAGE_META[c.status] || { bg: '#f1f5f9', color: '#475569' };
                            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
                            return (
                              <tr key={cl.id} style={{ borderBottom: '1px solid #f9fafb' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ padding: '9px 14px' }}>
                                  <div style={{ fontWeight: 600, color: '#111' }}>{name}</div>
                                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.title || '—'}</div>
                                </td>
                                <td style={{ padding: '9px 14px', color: '#374151' }}>{c.company || '—'}</td>
                                <td style={{ padding: '9px 14px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: sm.bg, color: sm.color }}>
                                    {c.status || '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '9px 14px', color: '#6b7280' }}>{formatDate(cl.added_date)}</td>
                                <td style={{ padding: '9px 14px' }}>
                                  <span style={{ color: c.last_touchpoint_date ? '#374151' : '#d1d5db', fontWeight: c.last_touchpoint_date ? 500 : 400 }}>
                                    {c.last_touchpoint_date ? formatDateShort(c.last_touchpoint_date) : 'Never'}
                                  </span>
                                </td>
                                <td style={{ padding: '9px 14px' }}>
                                  <button onClick={() => toggleCampaign(cl, list.id)}
                                    style={{ padding: '3px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                      background: cl.is_active_campaign ? '#d1fae5' : '#f3f4f6',
                                      color: cl.is_active_campaign ? '#065f46' : '#9ca3af' }}>
                                    {cl.is_active_campaign ? '🟢 Active' : 'Inactive'}
                                  </button>
                                </td>
                                <td style={{ padding: '9px 14px' }}>
                                  <button onClick={() => removeFromList(c.id, list.id)}
                                    style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', fontSize: 11, color: '#dc2626', cursor: 'pointer' }}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
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
