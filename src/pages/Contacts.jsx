import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext'; import { markContactBounced } from '../utils/bounce';
import { toast } from 'sonner';
import { normalizeIndustry } from '../constants/industryAliases';

const STATUSES = ['Fresh', 'F1', 'F2', 'F3', 'F4', 'F5', 'won', 'lost', 'bounced', 'unsubscribed'];

const STATUS_STYLE = {
  Fresh:        { bg: '#e0f2fe', color: '#0369a1' },
  F1:           { bg: '#f0fdf4', color: '#166534' },
  F2:           { bg: '#dcfce7', color: '#15803d' },
  F3:           { bg: '#fef9c3', color: '#854d0e' },
  F4:           { bg: '#ffedd5', color: '#9a3412' },
  F5:           { bg: '#fce7f3', color: '#9d174d' },
  won:          { bg: '#d1fae5', color: '#065f46' },
  lost:         { bg: '#f1f5f9', color: '#475569' },
  bounced:      { bg: '#fee2e2', color: '#991b1b' },
  unsubscribed: { bg: '#fef3c7', color: '#92400e' },
};

const RESPONSE_STYLE = {
  cold:          { bg: '#f1f5f9', color: '#475569', label: 'Cold' },
  negative:      { bg: '#fee2e2', color: '#991b1b', label: 'Negative' },
  not_interested:{ bg: '#fef3c7', color: '#92400e', label: 'Not Interested' },
  warm:          { bg: '#fef9c3', color: '#854d0e', label: 'Warm' },
  prospect:      { bg: '#dcfce7', color: '#15803d', label: 'Prospect' },
};

function contactName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
}

export default function Contacts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [marking, setMarking] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // ── Quick contact note popover ──
  const [contactNotesMap, setContactNotesMap] = useState({});
  const [notePopover, setNotePopover] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [myMailboxes, setMyMailboxes] = useState([]);
  const [showStartModal, setShowStartModal] = useState(false);
  const [startMailboxId, setStartMailboxId] = useState('');
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [startTrack, setStartTrack] = useState('ai');
  const [startTemplateId, setStartTemplateId] = useState('');
  const [templateOptions, setTemplateOptions] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [industries, setIndustries]   = useState([]);
  const [pitchTypes, setPitchTypes]   = useState([]);
  const [personas, setPersonas]       = useState([]);
  const [campaigns, setCampaigns]     = useState([]);
  const [companies, setCompanies]     = useState([]);
  const [sources, setSources]         = useState([]);
  const [countries, setCountries]     = useState([]);
  const [freshCount, setFreshCount]     = useState(0);
  const [activeCount, setActiveCount]   = useState(0);
  const [bouncedCount, setBouncedCount] = useState(0);
  // Advanced filters
  const [industryFilter, setIndustryFilter]   = useState('');
  const [pitchTypeFilter, setPitchTypeFilter] = useState('');
  const [personaFilter, setPersonaFilter]     = useState('');
  const [campaignFilter, setCampaignFilter]   = useState('');
  const [listFilter, setListFilter]           = useState('');
  const [hasEmailFilter, setHasEmailFilter]   = useState('');
  const [lists, setLists]                     = useState([]);
  const [listContactIds, setListContactIds]   = useState(new Set());
  const [dupeModal, setDupeModal]             = useState(false);
  const [dupeGroups, setDupeGroups]           = useState([]);
  const [dupeLoading, setDupeLoading]         = useState(false);
  const [dupeKeep, setDupeKeep]               = useState({}); // { email: contactId }
  const [dupeMerging, setDupeMerging]         = useState(false);
  const [companyFilter, setCompanyFilter]     = useState('');
  const [responseFilter, setResponseFilter]   = useState('');
  const [sourceFilter, setSourceFilter]       = useState('');
  const [jobChangeFilter, setJobChangeFilter] = useState('');
  const [headcountFilter, setHeadcountFilter] = useState('');
  const [acctLastTouchFrom, setAcctLastTouchFrom] = useState('');
  const [acctLastTouchTo, setAcctLastTouchTo] = useState('');
  const [acctNeverTouched, setAcctNeverTouched] = useState(false);
  const [freshCountFilter, setFreshCountFilter] = useState('');
  const [countryFilter, setCountryFilter]     = useState('');
  const [csvBatches, setCsvBatches]           = useState([]);
  const [batchFilter, setBatchFilter]         = useState('');
  const [dateAddedFilter, setDateAddedFilter] = useState('');
  const [lastReachedFilter, setLastReachedFilter] = useState('');
  const [dateAddedFrom, setDateAddedFrom]     = useState('');
  const [dateAddedTo, setDateAddedTo]         = useState('');
  const [lastReachedFrom, setLastReachedFrom] = useState('');
  const [lastReachedTo, setLastReachedTo]     = useState('');
  const [showFilters, setShowFilters]         = useState(false);
  const [filterSearch, setFilterSearch]       = useState('');
  function matchesFilterSearch(label) {
    return !filterSearch.trim() || label.toLowerCase().includes(filterSearch.trim().toLowerCase());
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { fetchLists(); }, []);

  useEffect(() => { loadMailboxes(); }, []);

  useEffect(() => {
    if (sourceFilter === 'csv_import') {
      supabase.from('import_batches').select('id, file_name, imported_at, contact_count').eq('owner_id', user.id).order('imported_at', { ascending: false })
        .then(({ data }) => setCsvBatches(data || []));
    } else {
      setBatchFilter('');
    }
  }, [sourceFilter, user.id]);

  useEffect(() => { setPage(1); }, [filter, debouncedSearch, industryFilter, pitchTypeFilter, personaFilter, listFilter, hasEmailFilter, companyFilter, responseFilter, sourceFilter, countryFilter, batchFilter, dateAddedFilter, lastReachedFilter, dateAddedFrom, dateAddedTo, lastReachedFrom, lastReachedTo, jobChangeFilter, headcountFilter, freshCountFilter, acctLastTouchFrom, acctLastTouchTo, acctNeverTouched]);

  useEffect(() => { fetchContacts(); }, [filter, debouncedSearch, industryFilter, pitchTypeFilter, personaFilter, campaignFilter, listFilter, hasEmailFilter, companyFilter, responseFilter, sourceFilter, countryFilter, batchFilter, dateAddedFilter, lastReachedFilter, dateAddedFrom, dateAddedTo, lastReachedFrom, lastReachedTo, jobChangeFilter, headcountFilter, freshCountFilter, acctLastTouchFrom, acctLastTouchTo, acctNeverTouched, page]);

  useEffect(() => {
    const ids = contacts.map(c => c.id);
    if (!ids.length) { setContactNotesMap({}); return; }
    supabase.from('contact_notes').select('contact_id,body,created_at').in('contact_id', ids).order('created_at', { ascending: false })
      .then(({ data: rows }) => {
        const m = {};
        (rows || []).forEach(r => { if (!m[r.contact_id]) m[r.contact_id] = r.body; });
        setContactNotesMap(m);
      });
  }, [contacts]);

  async function saveContactNote(c) {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    await supabase.from('contact_notes').insert({
      contact_id: c.id,
      author_id: user.id,
      body: noteDraft.trim(),
    });
    setSavingNote(false);
    setContactNotesMap(m => ({ ...m, [c.id]: noteDraft.trim() }));
    setNoteDraft('');
    setNotePopover(null);
  }

  async function fetchFilterOptions() {
    const { data } = await supabase
      .from('contacts')
      .select('account_id, pitch_type, persona, campaign, company, status, source, accounts(industry, country)')
      .eq('owner_id', user.id);
    const rows = data || [];
    setIndustries([...new Set(rows.map(c => c.accounts?.industry || '').filter(Boolean))].sort());
    setPitchTypes([...new Set(rows.map(c => c.pitch_type).filter(Boolean))].sort());
    setPersonas([...new Set(rows.map(c => c.persona).filter(Boolean))].sort());
    setCampaigns([...new Set(rows.map(c => c.campaign).filter(Boolean))].sort());
    setCompanies([...new Set(rows.map(c => c.company).filter(Boolean))].sort());
    setSources([...new Set(rows.map(c => c.source).filter(Boolean))].sort());
    setCountries([...new Set(rows.map(c => c.accounts?.country || '').filter(Boolean))].sort());
    setFreshCount(rows.filter(c => c.status === 'Fresh').length);
    setActiveCount(rows.filter(c => !['bounced','unsubscribed','lost'].includes(c.status)).length);
    setBouncedCount(rows.filter(c => c.status === 'bounced').length);
  }

  async function fetchContacts() {
    setLoading(true);

    let q = supabase
      .from('contacts')
      .select('*, accounts(id, name, industry)', { count: 'exact' })
      .eq('owner_id', user.id);

    if (filter !== 'all') q = q.eq('status', filter);

    if (debouncedSearch) {
      const s = `%${debouncedSearch}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},company.ilike.${s}`);
    }

    if (industryFilter || countryFilter || headcountFilter || acctNeverTouched || acctLastTouchFrom || acctLastTouchTo || freshCountFilter) {
      // These five filters live on the account, not the contact, so we resolve the
      // matching account ids first (via accounts_with_stats, which carries
      // fresh_contact_count + last_touch_date alongside the plain account columns)
      // and then scope the contacts query to those accounts.
      let accQ = supabase.from('accounts_with_stats').select('id');
      if (industryFilter) accQ = accQ.eq('industry', industryFilter);
      if (countryFilter) accQ = accQ.eq('country', countryFilter);
      if (headcountFilter === '1-50') accQ = accQ.gte('employee_count', 1).lte('employee_count', 50);
      else if (headcountFilter === '51-200') accQ = accQ.gte('employee_count', 51).lte('employee_count', 200);
      else if (headcountFilter === '201-1000') accQ = accQ.gte('employee_count', 201).lte('employee_count', 1000);
      else if (headcountFilter === '1000+') accQ = accQ.gte('employee_count', 1001);
      if (acctNeverTouched) accQ = accQ.is('last_touch_date', null);
      else {
        if (acctLastTouchFrom) accQ = accQ.gte('last_touch_date', acctLastTouchFrom);
        if (acctLastTouchTo) accQ = accQ.lte('last_touch_date', acctLastTouchTo);
      }
      if (freshCountFilter === '0') accQ = accQ.eq('fresh_contact_count', 0);
      else if (freshCountFilter === '1-5') accQ = accQ.gte('fresh_contact_count', 1).lte('fresh_contact_count', 5);
      else if (freshCountFilter === '6-15') accQ = accQ.gte('fresh_contact_count', 6).lte('fresh_contact_count', 15);
      else if (freshCountFilter === '16+') accQ = accQ.gte('fresh_contact_count', 16);
      const { data: accRows } = await accQ;
      const accIds = (accRows || []).map(a => a.id);
      if (accIds.length > 0) {
        q = q.in('account_id', accIds);
      } else {
        setContacts([]);
        setTotalCount(0);
        setLoading(false);
        setSelected(new Set());
        fetchFilterOptions();
        return;
      }
    }
    if (pitchTypeFilter) q = q.eq('pitch_type', pitchTypeFilter);
    if (personaFilter)   q = q.eq('persona', personaFilter);
    if (campaignFilter)  q = q.eq('campaign', campaignFilter);
    if (companyFilter)   q = q.eq('company', companyFilter);
    if (responseFilter)  q = q.eq('response_type', responseFilter);
    if (sourceFilter)    q = q.eq('source', sourceFilter);
    if (sourceFilter === 'csv_import' && batchFilter) q = q.eq('import_batch_id', batchFilter);
    if (hasEmailFilter === 'yes') q = q.not('email', 'is', null);
    if (hasEmailFilter === 'no')  q = q.is('email', null);
    if (jobChangeFilter === 'yes') q = q.eq('job_change_detected', true);

    if (listFilter) {
      const { data: lc } = await supabase.from('contact_lists').select('contact_id').eq('list_id', listFilter);
      const ids = (lc || []).map(r => r.contact_id);
      if (ids.length === 0) {
        setContacts([]);
        setTotalCount(0);
        setLoading(false);
        setSelected(new Set());
        fetchFilterOptions();
        return;
      }
      q = q.in('id', ids);
    }

    if (dateAddedFilter) {
      if (dateAddedFilter === '7d')     q = q.gte('created_at', dayStart(7).toISOString());
      if (dateAddedFilter === '30d')    q = q.gte('created_at', dayStart(30).toISOString());
      if (dateAddedFilter === '90d')    q = q.gte('created_at', dayStart(90).toISOString());
      if (dateAddedFilter === 'old')    q = q.lt('created_at', dayStart(30).toISOString());
      if (dateAddedFilter === 'custom') {
        if (dateAddedFrom) q = q.gte('created_at', new Date(dateAddedFrom).toISOString());
        if (dateAddedTo)   q = q.lte('created_at', new Date(dateAddedTo + 'T23:59:59').toISOString());
      }
    }

    if (lastReachedFilter) {
      if (lastReachedFilter === 'never') {
        q = q.is('last_touchpoint_date', null);
      } else {
        q = q.not('last_touchpoint_date', 'is', null);
        if (lastReachedFilter === '7d')     q = q.gte('last_touchpoint_date', dayStart(7).toISOString());
        if (lastReachedFilter === '30d')    q = q.gte('last_touchpoint_date', dayStart(30).toISOString());
        if (lastReachedFilter === 'old')    q = q.lt('last_touchpoint_date', dayStart(30).toISOString());
        if (lastReachedFilter === 'custom') {
          if (lastReachedFrom) q = q.gte('last_touchpoint_date', new Date(lastReachedFrom).toISOString());
          if (lastReachedTo)   q = q.lte('last_touchpoint_date', new Date(lastReachedTo + 'T23:59:59').toISOString());
        }
      }
    }

    q = q.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, count } = await q;
    setContacts(data || []);
    setTotalCount(count || 0);
    setLoading(false);
    setSelected(new Set());
    fetchFilterOptions();
  }

  async function fetchLists() {
    const { data } = await supabase.from('lists').select('id, name').eq('owner_id', user.id).order('name');
    setLists(data || []);
  }

  async function findDuplicates() {
    setDupeLoading(true);
    setDupeModal(true);
    setDupeGroups([]);
    // Load all of this user's contacts — grouped by email where present,
    // and by a normalized name+company fallback for contacts with no email
    // on file (those were invisible to the old email-only dupe scan).
    const { data } = await supabase.from('contacts').select('*').eq('owner_id', user.id).order('created_at', { ascending: true });
    const grouped = {};
    (data || []).forEach(c => {
      const email = (c.email || '').trim().toLowerCase();
      let key, label, matchType;
      if (email) {
        key = 'email:' + email;
        label = email;
        matchType = 'email';
      } else {
        const fn = (c.first_name || '').trim().toLowerCase();
        const ln = (c.last_name || '').trim().toLowerCase();
        const co = (c.company || '').trim().toLowerCase();
        if (!co || (!fn && !ln)) return; // not enough signal to dedupe confidently
        key = 'nc:' + fn + '|' + ln + '|' + co;
        label = ([c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed') + ' at ' + c.company + ' (no email)';
        matchType = 'name_company';
      }
      if (!grouped[key]) grouped[key] = { label, matchType, contacts: [] };
      grouped[key].contacts.push(c);
    });
    const dups = Object.entries(grouped).filter(([, g]) => g.contacts.length > 1).map(([key, g]) => ({ key, label: g.label, matchType: g.matchType, contacts: g.contacts }));
    // Default: keep the first (oldest) contact in each group
    const keep = {};
    dups.forEach(({ key, contacts }) => { keep[key] = contacts[0].id; });
    setDupeGroups(dups);
    setDupeKeep(keep);
    setDupeLoading(false);
  }

  async function mergeDuplicates() {
    setDupeMerging(true);
    let deleted = 0;
    for (const { key, contacts } of dupeGroups) {
      const keepId = dupeKeep[key];
      const toDelete = contacts.filter(c => c.id !== keepId).map(c => c.id);
      if (toDelete.length > 0) {
        await supabase.from('contacts').delete().in('id', toDelete);
        deleted += toDelete.length;
      }
    }
    setDupeMerging(false);
    setDupeModal(false);
    setDupeGroups([]);
    fetchContacts();
    toast.success(`Done — deleted ${deleted} duplicate contact${deleted !== 1 ? 's' : ''}.`);
  }

  async function applyListFilter(listId) {
    setListFilter(listId);
    if (!listId) { setListContactIds(new Set()); return; }
    const { data } = await supabase.from('contact_lists').select('contact_id').eq('list_id', listId);
    setListContactIds(new Set((data || []).map(r => r.contact_id)));
  }

  async function updateStatus(id, status) { if (status === 'bounced') { await markContactBounced(id, user.id); fetchContacts(); return; }
    await supabase.from('contacts').update({ status, last_touchpoint_date: new Date().toISOString() }).eq('id', id);
    await supabase.from('activity_log').insert({ actor_id: user.id, contact_id: id, activity_type: 'status_changed', details: { status } });
    fetchContacts();
  }

  async function updateResponseType(id, response_type) {
    const val = response_type === '' ? null : response_type;
    await supabase.from('contacts').update({ response_type: val }).eq('id', id);
    await supabase.from('activity_log').insert({ actor_id: user.id, contact_id: id, activity_type: 'response_set', details: { response_type: val } });
    fetchContacts();
  }

  async function deleteContact(id) {
    await supabase.from('contacts').delete().eq('id', id).eq('owner_id', user.id);
    setDeleteConfirm(null);
    fetchContacts();
  }

  async function bulkDeleteContacts() {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    await supabase.from('contacts').delete().in('id', ids).eq('owner_id', user.id);
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    setSelected(new Set());
    fetchContacts();
  }

  async function clearAllContacts() {
    await supabase.from('contacts').delete().eq('owner_id', user.id);
    setShowClearConfirm(false);
    fetchContacts();
  }

  async function loadMailboxes() {
    const { data: accounts } = await supabase.from('email_accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true });
    const { data: myContacts } = await supabase.from('contacts').select('id, sender_account_id, status').eq('owner_id', user.id).not('sender_account_id', 'is', null);
    const ids = (myContacts || []).map(c => c.id);
    let sentTodayRows = [];
    if (ids.length) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('emails').select('contact_id').eq('direction', 'outbound').gte('sent_at', start.toISOString()).in('contact_id', ids);
      sentTodayRows = data || [];
    }
    const byId = Object.fromEntries((myContacts || []).map(c => [c.id, c]));
    const stats = {};
    (accounts || []).forEach(a => { stats[a.id] = { active: 0, sentToday: 0 }; });
    (myContacts || []).forEach(c => {
      if (stats[c.sender_account_id] && !['won', 'lost', 'bounced', 'unsubscribed'].includes(c.status)) stats[c.sender_account_id].active += 1;
    });
    sentTodayRows.forEach(e => {
      const c = byId[e.contact_id];
      if (c && stats[c.sender_account_id]) stats[c.sender_account_id].sentToday += 1;
    });
    const withStats = (accounts || []).map(a => ({ ...a, ...stats[a.id] }));
    setMyMailboxes(withStats);
    if (withStats.length && !startMailboxId) setStartMailboxId(withStats[0].id);
  }

  async function openStartFlow() {
    if (myMailboxes.length === 0) {
      setBatchMsg('Register a mailbox under Mailboxes before starting outreach.');
      setTimeout(() => setBatchMsg(''), 4000);
      return;
    }
    if (!startMailboxId) setStartMailboxId(myMailboxes[0].id);
    const { data: tpls } = await supabase.from('templates').select('*').eq('status', 'approved').eq('visibility', 'org').order('name');
    setTemplateOptions(tpls || []);
    setStartTrack('ai');
    setStartTemplateId('');
    setShowTrackModal(true);
  }

  function confirmTrackChoice() {
    if (startTrack === 'templated' && !startTemplateId) return;
    setShowTrackModal(false);
    setShowStartModal(true);
  }

  async function confirmBatchStart() {
    setShowStartModal(false);
    await batchStart();
  }

  async function batchStart() {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchStarting(true);
    setBatchMsg('');

    const now = new Date().toISOString();
    const mailbox = myMailboxes.find(m => m.id === startMailboxId);

    // Templated track: snapshot the chosen template's steps once here, so
    // later edits to the template never retroactively change a contact
    // already assigned to it - only future assignments pick up changes.
    let templateSteps = [];
    let templateRow = null;
    if (startTrack === 'templated' && startTemplateId) {
      templateRow = templateOptions.find(t => t.id === startTemplateId);
      const { data: steps } = await supabase.from('template_steps').select('*').eq('template_id', startTemplateId).order('step_number');
      templateSteps = (steps || []).map(s => ({ step_number: s.step_number, subject: s.subject, body: s.body, delay_days: s.delay_days }));
    }

    let done = 0;
    for (const id of ids) {
      // Keep status as Fresh — matches Accounts page Start behavior; contact appears in Follow-up Queue New Contacts section
      const contact = contacts.find(x => x.id === id);
      const updatePayload = { status: 'Fresh', next_followup: now, track: startTrack };
      // Lock the sending mailbox on first start — never overwrite one that's already set
      if (!contact?.sender_account_id && mailbox) {
        updatePayload.sender_account_id = mailbox.id;
        updatePayload.sender_email = mailbox.email_address;
      }
      await supabase.from('contacts').update(updatePayload).eq('id', id);
      if (startTrack === 'templated' && templateRow) {
        await supabase.from('template_assignments').insert({
          contact_id: id, template_id: templateRow.id, template_name: templateRow.name,
          template_version: templateRow.version, steps: templateSteps, current_step: 1, status: 'active', assigned_by: user.id,
        });
      }
      await supabase.from('activity_log').insert({ actor_id: user.id, contact_id: id, activity_type: 'outreach_started', details: { started_from: 'contacts', note: 'Batch start', track: startTrack, template_id: startTrack === 'templated' ? startTemplateId : null } });
      done++;
      setBatchMsg(`Starting… ${done}/${ids.length}`);
    }

    setBatchStarting(false);
    setBatchMsg(`✓ ${done} contacts started`);
    setTimeout(() => setBatchMsg(''), 3000);
    fetchContacts();
    loadMailboxes();
  }

  // Effective industry: contact's own industry OR inherited from account
  function effectiveIndustry(c) { return c.accounts?.industry || ''; }

  const activeFilters = [industryFilter, pitchTypeFilter, personaFilter, campaignFilter, listFilter, hasEmailFilter, companyFilter, responseFilter, sourceFilter, countryFilter, batchFilter, dateAddedFilter, lastReachedFilter, dateAddedFrom, dateAddedTo, lastReachedFrom, lastReachedTo, jobChangeFilter, headcountFilter, freshCountFilter, acctLastTouchFrom, acctLastTouchTo, acctNeverTouched].filter(Boolean).length;

  const freshSelected = [...selected].filter(id => {
    const c = contacts.find(x => x.id === id);
    return c?.status === 'Fresh';
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginated = contacts;

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = paginated.map(c => c.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) { pageIds.forEach(id => next.delete(id)); }
      else { pageIds.forEach(id => next.add(id)); }
      return next;
    });
  }

  return (
    <>
    <div style={{ padding: '24px 28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>My Contacts</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
            {activeCount} active · {freshCount} fresh · {bouncedCount} bounced
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {batchMsg && (
            <span style={{ fontSize: 12, color: batchMsg.startsWith('✓') ? '#059669' : '#555' }}>{batchMsg}</span>
          )}
          {selected.size > 0 && (
            <button
              onClick={openStartFlow}
              disabled={batchStarting || freshSelected.length === 0}
              style={{ padding: '8px 16px', background: freshSelected.length > 0 ? '#2563eb' : '#e5e7eb', color: freshSelected.length > 0 ? '#fff' : '#aaa', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: freshSelected.length > 0 ? 'pointer' : 'not-allowed', border: 'none' }}>
              {batchStarting ? 'Starting…' : `▶ Start ${freshSelected.length} Fresh`}
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
              style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: bulkDeleting ? 'not-allowed' : 'pointer', border: '1px solid #fecaca' }}>
              {bulkDeleting ? 'Deleting…' : `🗑 Delete ${selected.size}`}
            </button>
          )}
          <button onClick={findDuplicates}
            style={{ padding: '8px 14px', background: '#fff', color: '#7c3aed', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid #ddd8fe' }}>
            Find Duplicates
          </button>
          <UploadCSV userId={user.id} onDone={fetchContacts} />
        </div>
      </div>

      {showTrackModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#111' }}>How should these contacts be reached out to?</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>This choice applies for the contact's entire outreach journey.</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: 14, borderRadius: 10, border: `1.5px solid ${startTrack === 'ai' ? '#2563eb' : '#e0e0e0'}`, cursor: 'pointer', background: startTrack === 'ai' ? '#eff6ff' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="startTrack" checked={startTrack === 'ai'} onChange={() => setStartTrack('ai')} />
                  <strong style={{ fontSize: 13, color: '#111' }}>AI-personalized</strong>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>Each email is written fresh per contact from account research, platform facts and persona.</div>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: 14, borderRadius: 10, border: `1.5px solid ${startTrack === 'templated' ? '#2563eb' : '#e0e0e0'}`, cursor: 'pointer', background: startTrack === 'templated' ? '#eff6ff' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="startTrack" checked={startTrack === 'templated'} onChange={() => setStartTrack('templated')} />
                  <strong style={{ fontSize: 13, color: '#111' }}>Templated</strong>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>Runs a fixed multi-step sequence from the Templates library, same copy every time.</div>
              </label>
            </div>
            {startTrack === 'templated' && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Choose a template</label>
                {templateOptions.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#999', padding: '10px 0' }}>No approved templates yet — publish one from the Templates page first.</div>
                ) : (
                  <select value={startTemplateId} onChange={e => setStartTemplateId(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                    <option value="">Select a template…</option>
                    {templateOptions.map(t => <option key={t.id} value={t.id}>{t.name} ({t.step_count} steps)</option>)}
                  </select>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTrackModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmTrackChoice} disabled={startTrack === 'templated' && !startTemplateId}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: (startTrack === 'templated' && !startTemplateId) ? '#c7d2fe' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (startTrack === 'templated' && !startTemplateId) ? 'not-allowed' : 'pointer' }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showStartModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#111' }}>Choose a sending mailbox</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
              This mailbox will be locked to these contacts for their entire outreach thread. Contacts that already have a mailbox assigned keep it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 260, overflowY: 'auto' }}>
              {myMailboxes.map(mb => {
                const nearCap = mb.sentToday >= mb.daily_send_cap;
                return (
                  <label key={mb.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${startMailboxId === mb.id ? '#2563eb' : '#e0e0e0'}`, cursor: 'pointer', background: startMailboxId === mb.id ? '#eff6ff' : '#fff' }}>
                    <input type="radio" name="startMailbox" checked={startMailboxId === mb.id} onChange={() => setStartMailboxId(mb.id)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{mb.label ? `${mb.label} — ` : ''}{mb.email_address}</div>
                      <div style={{ fontSize: 11, color: nearCap ? '#dc2626' : '#888' }}>
                        {mb.active} active · {mb.sentToday} sent today / cap {mb.daily_send_cap}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowStartModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmBatchStart}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Start {freshSelected.length} Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmations */}
      {deleteConfirm && (
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#991b1b' }}>Delete <strong>{deleteConfirm.name}</strong>?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDeleteConfirm(null)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => deleteContact(deleteConfirm.id)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Delete</button>
          </div>
        </div>
      )}

      {bulkDeleteConfirm && (
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#991b1b' }}>Delete <strong>{selected.size}</strong> selected contact{selected.size !== 1 ? 's' : ''}? This can't be undone.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={bulkDeleteContacts} disabled={bulkDeleting} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 500, cursor: bulkDeleting ? 'not-allowed' : 'pointer' }}>{bulkDeleting ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      )}

      {/* Stage filter tabs */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, company…"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, width: 240, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 2, background: '#f0f0ee', padding: 4, borderRadius: 8, flexWrap: 'wrap' }}>
          {['all', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '5px 11px', borderRadius: 6, border: 'none', fontSize: 12, cursor: 'pointer',
                background: filter === s ? '#fff' : 'transparent',
                color: filter === s ? '#111' : '#666',
                fontWeight: filter === s ? 600 : 400,
                boxShadow: filter === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Filters toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setShowFilters(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid ' + (showFilters ? '#2563eb' : '#e0e0e0'), background: showFilters ? '#eff6ff' : '#fff', color: showFilters ? '#1d4ed8' : '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <span>⚙ Filters</span>
          {activeFilters > 0 && (
            <span style={{ background: '#2563eb', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>{activeFilters}</span>
          )}
        </button>
        {activeFilters > 0 && (
          <button onClick={() => { setIndustryFilter(''); setPitchTypeFilter(''); setPersonaFilter(''); setListFilter(''); setHasEmailFilter(''); setCompanyFilter(''); setResponseFilter(''); setDateAddedFilter(''); setLastReachedFilter(''); setDateAddedFrom(''); setDateAddedTo(''); setLastReachedFrom(''); setLastReachedTo(''); setJobChangeFilter(''); setHeadcountFilter(''); setFreshCountFilter(''); setAcctLastTouchFrom(''); setAcctLastTouchTo(''); setAcctNeverTouched(false); setListContactIds(new Set()); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
            Clear filters ({activeFilters})
          </button>
        )}
        <span style={{ fontSize: 12, color: '#aaa' }}>{totalCount} contacts</span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {showFilters && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.75)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && setShowFilters(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, boxShadow: '0 24px 70px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid #eee' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Filters</div>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>🔍</span>
                <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search filters…"
                  style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }} />
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{totalCount} contacts found</div>
              <button onClick={() => setShowFilters(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ columnCount: 3, columnGap: 28, padding: '20px 22px', maxHeight: '60vh', overflowY: 'auto' }}>
            {matchesFilterSearch('Industry') && industries.length > 0 && (
          <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (industryFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: industryFilter ? '#eff6ff' : '#fff', color: industryFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Industries</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Persona &amp; Pitch</div>
        {matchesFilterSearch('Pitch Type') && pitchTypes.length > 0 && (
          <select value={pitchTypeFilter} onChange={e => setPitchTypeFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (pitchTypeFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: pitchTypeFilter ? '#eff6ff' : '#fff', color: pitchTypeFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Pitch Types</option>
            {pitchTypes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {matchesFilterSearch('Persona') && personas.length > 0 && (
          <select value={personaFilter} onChange={e => setPersonaFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (personaFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: personaFilter ? '#eff6ff' : '#fff', color: personaFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Personas</option>
            {personas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {matchesFilterSearch('Campaign') && campaigns.length > 0 && (
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (campaignFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: campaignFilter ? '#eff6ff' : '#fff', color: campaignFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Lists</div>
        {matchesFilterSearch('List') && lists.length > 0 && (
          <select value={listFilter} onChange={e => applyListFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (listFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: listFilter ? '#eff6ff' : '#fff', color: listFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Lists</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Engagement</div>
        {matchesFilterSearch('Has Email') && (
        <select value={hasEmailFilter} onChange={e => setHasEmailFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (hasEmailFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: hasEmailFilter ? '#eff6ff' : '#fff', color: hasEmailFilter ? '#1d4ed8' : '#555' }}>
          <option value="">Has Email: All</option>
          <option value="yes">Has Email</option>
          <option value="no">No Email</option>
        </select>
        )}
        {matchesFilterSearch('Recently Changed Jobs') && (
        <select value={jobChangeFilter} onChange={e => setJobChangeFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (jobChangeFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: jobChangeFilter ? '#eff6ff' : '#fff', color: jobChangeFilter ? '#1d4ed8' : '#555' }}>
          <option value="">Recently Changed Jobs: All</option>
          <option value="yes">🔄 Changed Jobs</option>
        </select>
        )}
        {matchesFilterSearch('Headcount') && (
        <select value={headcountFilter} onChange={e => setHeadcountFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (headcountFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: headcountFilter ? '#eff6ff' : '#fff', color: headcountFilter ? '#1d4ed8' : '#555' }}>
          <option value="">Headcount: All</option>
          <option value="1-50">1 – 50</option>
          <option value="51-200">51 – 200</option>
          <option value="201-1000">201 – 1,000</option>
          <option value="1000+">1,000+</option>
        </select>
        )}
        {matchesFilterSearch('Contacts Yet To Start') && (
        <select value={freshCountFilter} onChange={e => setFreshCountFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (freshCountFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: freshCountFilter ? '#eff6ff' : '#fff', color: freshCountFilter ? '#1d4ed8' : '#555' }}>
          <option value="">Account's Contacts Yet To Start: All</option>
          <option value="0">0 (fully worked)</option>
          <option value="1-5">1 – 5</option>
          <option value="6-15">6 – 15</option>
          <option value="16+">16+</option>
        </select>
        )}
        {matchesFilterSearch('Account Last Touched') && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: acctNeverTouched || acctLastTouchFrom || acctLastTouchTo ? '#1d4ed8' : '#555', marginBottom: 6 }}>Account Last Touched</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input type="date" value={acctLastTouchFrom} disabled={acctNeverTouched} onChange={e => setAcctLastTouchFrom(e.target.value)}
              style={{ width: '50%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12 }} />
            <input type="date" value={acctLastTouchTo} disabled={acctNeverTouched} onChange={e => setAcctLastTouchTo(e.target.value)}
              style={{ width: '50%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={acctNeverTouched} onChange={e => { setAcctNeverTouched(e.target.checked); if (e.target.checked) { setAcctLastTouchFrom(''); setAcctLastTouchTo(''); } }} />
            Never touched (account-wide)
          </label>
        </div>
        )}
        {matchesFilterSearch('Company') && companies.length > 0 && (
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (companyFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: companyFilter ? '#eff6ff' : '#fff', color: companyFilter ? '#1d4ed8' : '#555', maxWidth: 180 }}>
            <option value="">All Companies</option>
            {companies.map(co => <option key={co} value={co}>{co}</option>)}
          </select>
        )}
        {matchesFilterSearch('Response') && (
        <select value={responseFilter} onChange={e => setResponseFilter(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (responseFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: responseFilter ? '#eff6ff' : '#fff', color: responseFilter ? '#1d4ed8' : '#555' }}>
          <option value="">All Responses</option>
          <option value="warm">Warm</option>
          <option value="prospect">Prospect</option>
          <option value="cold">Cold</option>
          <option value="negative">Negative</option>
          <option value="not_interested">Not Interested</option>
        </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Source</div>
        {matchesFilterSearch('Source') && sources.length > 0 && (
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (sourceFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: sourceFilter ? '#eff6ff' : '#fff', color: sourceFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {matchesFilterSearch('Import Batch') && sourceFilter === 'csv_import' && csvBatches.length > 0 && (
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (batchFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: batchFilter ? '#eff6ff' : '#fff', color: batchFilter ? '#1d4ed8' : '#555', maxWidth: 220 }}>
            <option value="">All Imports</option>
            {csvBatches.map(b => <option key={b.id} value={b.id}>{b.file_name || 'Untitled'} — {new Date(b.imported_at).toLocaleDateString()} ({b.contact_count})</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Location</div>
        {matchesFilterSearch('Country') && countries.length > 0 && (
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (countryFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: countryFilter ? '#eff6ff' : '#fff', color: countryFilter ? '#1d4ed8' : '#555' }}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 6px' }}>Dates</div>
        {matchesFilterSearch('Date Added') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          <select value={dateAddedFilter} onChange={e => setDateAddedFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (dateAddedFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: dateAddedFilter ? '#eff6ff' : '#fff', color: dateAddedFilter ? '#1d4ed8' : '#555' }}>
            <option value="">Date Added: All</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="old">Older than 30 days</option>
            <option value="custom">Custom range…</option>
          </select>
          {dateAddedFilter === 'custom' && (
            <>
              <input type="date" value={dateAddedFrom} onChange={e => setDateAddedFrom(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #2563eb', fontSize: 12, background: '#eff6ff', color: '#1d4ed8' }} />
              <span style={{ fontSize: 12, color: '#888' }}>to</span>
              <input type="date" value={dateAddedTo} onChange={e => setDateAddedTo(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #2563eb', fontSize: 12, background: '#eff6ff', color: '#1d4ed8' }} />
            </>
          )}
        </div>
        )}
        {matchesFilterSearch('Last Reached') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select value={lastReachedFilter} onChange={e => setLastReachedFilter(e.target.value)}
            style={{ width: '100%', marginBottom: 10, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + (lastReachedFilter ? '#2563eb' : '#e0e0e0'), fontSize: 12, cursor: 'pointer', background: lastReachedFilter ? '#eff6ff' : '#fff', color: lastReachedFilter ? '#1d4ed8' : '#555' }}>
            <option value="">Last Reached: All</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="old">Over 30 days ago</option>
            <option value="never">Never reached</option>
            <option value="custom">Custom range…</option>
          </select>
          {lastReachedFilter === 'custom' && (
            <>
              <input type="date" value={lastReachedFrom} onChange={e => setLastReachedFrom(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #2563eb', fontSize: 12, background: '#eff6ff', color: '#1d4ed8' }} />
              <span style={{ fontSize: 12, color: '#888' }}>to</span>
              <input type="date" value={lastReachedTo} onChange={e => setLastReachedTo(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #2563eb', fontSize: 12, background: '#eff6ff', color: '#1d4ed8' }} />
            </>
          )}
        </div>
        )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #eee' }}>
              {activeFilters > 0 && (
                <button onClick={() => { setIndustryFilter(''); setPitchTypeFilter(''); setPersonaFilter(''); setListFilter(''); setHasEmailFilter(''); setCompanyFilter(''); setResponseFilter(''); setDateAddedFilter(''); setLastReachedFilter(''); setDateAddedFrom(''); setDateAddedTo(''); setLastReachedFrom(''); setLastReachedTo(''); setJobChangeFilter(''); setHeadcountFilter(''); setFreshCountFilter(''); setAcctLastTouchFrom(''); setAcctLastTouchTo(''); setAcctNeverTouched(false); setListContactIds(new Set()); }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  Clear filters ({activeFilters})
                </button>
              )}
              <button onClick={() => setShowFilters(false)} style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Apply Filters</button>
            </div>
          </div>
        </div>
      )}
        <div style={{ flex: 1, minWidth: 0 }}>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '10px 14px', width: 36 }}>
                <input type="checkbox"
                  checked={paginated.length > 0 && paginated.every(c => selected.has(c.id))}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }} />
              </th>
              {['Name', 'Company', 'Email', 'Title', 'Status', 'Response', 'Date Added', 'Last Reached Out', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Loading…</td></tr>
            ) : totalCount === 0 ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
                {contacts.length === 0 ? 'No contacts yet — import a CSV to get started' : 'No contacts match your filter'}
              </td></tr>
            ) : paginated.map(c => {
              const ss = STATUS_STYLE[c.status] || { bg: '#f1f5f9', color: '#475569' };
              const rs = c.response_type ? RESPONSE_STYLE[c.response_type] : null;
              const isSel = selected.has(c.id);
              const isBounced = c.status === 'bounced';
              return (
                <tr key={c.id}
                  style={{ borderBottom: '1px solid #f4f4f4', background: isSel ? '#eff6ff' : 'transparent', opacity: isBounced ? 0.6 : 1, transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#fafafa'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                  <td style={{ padding: '10px 14px' }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => navigate(`/contacts/${c.id}`)}
                      style={{ fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textAlign: 'left' }}>
                      {contactName(c)}
                    </button>
                    {isBounced && <span style={{ marginLeft: 6, fontSize: 10, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 10 }}>BOUNCED</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#444' }}>{c.company || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{c.email || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#666' }}>{c.title || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: ss.bg, color: ss.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {rs ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, background: rs.bg, color: rs.color, fontWeight: 500 }}>{rs.label}</span>
                          <button onClick={() => updateResponseType(c.id, '')}
                            style={{ fontSize: 10, color: '#bbb', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px' }} title="Clear response">✕</button>
                        </div>
                        {c.response_notes && (
                          <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={c.response_notes}>
                            {c.response_notes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <select value="" onChange={e => updateResponseType(c.id, e.target.value)}
                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e0e0e0', cursor: 'pointer', color: '#aaa', background: '#fff' }}>
                        <option value="">Set response…</option>
                        <option value="cold">Cold</option>
                        <option value="negative">Negative</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="warm">Warm</option>
                        <option value="prospect">Prospect</option>
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>
                    {c.last_touchpoint_date ? new Date(c.last_touchpoint_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <select value={c.status} onChange={e => updateStatus(c.id, e.target.value)}
                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e0e0e0', cursor: 'pointer', background: '#fff' }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => { setNotePopover(notePopover === c.id ? null : c.id); setNoteDraft(''); }}
                          title={contactNotesMap[c.id] ? contactNotesMap[c.id] : 'Add a note'}
                          style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, border: '1px solid #e5e7eb', background: contactNotesMap[c.id] ? '#fef9c3' : '#fff', color: '#92400e', cursor: 'pointer' }}>
                          📝
                        </button>
                        {notePopover === c.id && (
                          <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 12, width: 260 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                              Add note for {contactName(c)}
                            </div>
                            {contactNotesMap[c.id] && (
                              <div style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic', marginBottom: 8, background: '#faf5ff', padding: 6, borderRadius: 6 }}>
                                "{contactNotesMap[c.id]}"
                              </div>
                            )}
                            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Type a note…" rows={3} autoFocus
                              style={{ width: '100%', fontSize: 12, padding: 8, borderRadius: 6, border: '1px solid #ddd', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                              <button onClick={() => { setNotePopover(null); setNoteDraft(''); }}
                                style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#666', cursor: 'pointer' }}>
                                Cancel
                              </button>
                              <button onClick={() => saveContactNote(c)} disabled={savingNote || !noteDraft.trim()}
                                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: savingNote || !noteDraft.trim() ? 'not-allowed' : 'pointer', opacity: savingNote || !noteDraft.trim() ? 0.6 : 1, fontWeight: 600 }}>
                                {savingNote ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setDeleteConfirm({ id: c.id, name: contactName(c) })}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 12, color: '#bbb' }}>
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} contacts
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={() => setPage(1)} disabled={page === 1}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#ccc' : '#555' }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#ccc' : '#555' }}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => p === '…' ? (
                <span key={'ellipsis-' + i} style={{ padding: '5px 4px', fontSize: 12, color: '#bbb' }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid ' + (p === page ? '#2563eb' : '#e0e0e0'), background: p === page ? '#2563eb' : '#fff', color: p === page ? '#fff' : '#555', fontSize: 12, fontWeight: p === page ? 600 : 400, cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#ccc' : '#555' }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#ccc' : '#555' }}>»</button>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>

      {/* Duplicate review modal */}
      {dupeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Duplicate Contacts</h2>
                {!dupeLoading && <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>{dupeGroups.length} duplicate group{dupeGroups.length !== 1 ? 's' : ''} found — select which contact to keep in each group</p>}
              </div>
              <button onClick={() => setDupeModal(false)} style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {dupeLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Scanning for duplicates…</div>
              ) : dupeGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#059669', fontSize: 14, fontWeight: 500 }}>No duplicates found!</div>
              ) : (
                dupeGroups.map(({ key, label, contacts }) => (
                  <div key={key} style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fafafa' }}>
                    <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {label} · {contacts.length} duplicates
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {contacts.map(c => {
                        const isKeep = dupeKeep[key] === c.id;
                        const fields = [c.title, c.company, c.phone, c.linkedin_url ? 'LinkedIn' : null, c.persona, c.pitch_type].filter(Boolean).length;
                        return (
                          <div key={c.id} onClick={() => setDupeKeep(prev => ({ ...prev, [key]: c.id }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '2px solid ' + (isKeep ? '#2563eb' : '#e5e7eb'), background: isKeep ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                            <input type="radio" checked={isKeep} onChange={() => setDupeKeep(prev => ({ ...prev, [key]: c.id }))} style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</div>
                              <div style={{ fontSize: 12, color: '#555', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                {c.title && <span>{c.title}</span>}
                                {c.company && <span>{c.company}</span>}
                                {c.phone && <span>{c.phone}</span>}
                                {c.persona && <span style={{ color: '#7c3aed' }}>{c.persona}</span>}
                                {(Array.isArray(c.pitch_types) && c.pitch_types.length > 0 ? c.pitch_types : (c.pitch_type ? [c.pitch_type] : [])).length > 0 && <span style={{ color: '#2563eb' }}>{(Array.isArray(c.pitch_types) && c.pitch_types.length > 0 ? c.pitch_types : [c.pitch_type]).join(' + ')}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>
                              <div>{fields} fields filled</div>
                              <div>Added {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
                              <div style={{ color: c.status === 'Fresh' ? '#0369a1' : '#166534', fontWeight: 500 }}>{c.status}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {dupeGroups.length > 0 && !dupeLoading && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                <button onClick={() => setDupeModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#666' }}>
                  Cancel
                </button>
                <button onClick={mergeDuplicates} disabled={dupeMerging}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, cursor: dupeMerging ? 'not-allowed' : 'pointer', opacity: dupeMerging ? 0.7 : 1 }}>
                  {dupeMerging ? 'Deleting…' : `Delete duplicates (keep ${dupeGroups.length} selected)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}


const CONTACT_FIELDS = [
  { key: '',              label: "Don't import" },
  { key: 'full_name',     label: 'Full Name' },
  { key: 'first_name',    label: 'First Name' },
  { key: 'last_name',     label: 'Last Name' },
  { key: 'email',         label: 'Email' },
  { key: 'title',         label: 'Job Title' },
  { key: 'company',       label: 'Company' },
  { key: 'phone',         label: 'Phone' },
  { key: 'location',      label: 'Location' },
  { key: 'linkedin_url',  label: 'LinkedIn URL' },
  { key: 'pitch',         label: 'Pitch' },
  { key: 'pitch_type',    label: 'Pitch Type' },
  { key: 'persona',       label: 'Persona' },
  { key: 'campaign',      label: 'Campaign' },
  { key: 'response_type', label: 'Response Type' },
  { key: 'sender_email',  label: 'Sender Email' },
  { key: '_contact_note', label: 'Contact Note' }, { key: '_company_note', label: 'Company Note' }, { key: 'status', label: 'Status' }, { key: 'response_notes', label: 'Response Notes' }, { key: 'source', label: 'Source' }, { key: 'next_followup', label: 'Next Follow-up' }, { key: 'last_contacted', label: 'Last Contacted' },
  { key: '_industry',     label: 'Account: Industry' },
  { key: '_country',      label: 'Account: Country' },
  { key: '_website',      label: 'Account: Website' },
  { key: '_revenue',      label: 'Account: Revenue ($M)' },
  { key: '_employees',    label: 'Account: Employees' },
];

const PITCH_TYPE_VALUES = new Set([
  'oracle','sap','salesforce','servicenow','workday','ms dynamics','pega','ncino','coupa',
  'web','mobile','api',
].map(s => s.toLowerCase()));

const FIELD_GUESS = [
  { field: 'full_name',     keys: ['name','full_name','fullname','contact_name','contact'] },
  { field: 'first_name',    keys: ['first_name','firstname','first'] },
  { field: 'last_name',     keys: ['last_name','lastname','last','surname'] },
  { field: 'email',         keys: ['email','email_address','work_email','contact_email'] },
  { field: 'title',         keys: ['title','job_title','designation','role','position'] },
  { field: 'company',       keys: ['company','company_name','organization','organisation','account','employer'] },
  { field: 'phone',         keys: ['phone','phone_number','mobile','contact_number','telephone'] },
  { field: 'location',      keys: ['location','city','contact_location','address','geo','region'] },
  { field: 'linkedin_url',  keys: ['linkedin','linkedin_url','linkedin_profile','li_url'] },
  { field: 'pitch',         keys: ['pitch','pitch_notes','pitch_content'] },
  { field: 'pitch_type',    keys: ['pitch_type','pitchtype','pitch_category'] },
  { field: 'persona',       keys: ['persona','buyer_persona','persona_type'] },
  { field: 'campaign',      keys: ['campaign','campaign_type'] },
  { field: 'response_type', keys: ['response_type','responsetype','response'] },
  { field: 'sender_email',  keys: ['sender_email','sender','from_email','sent_from'] }, { field: 'status', keys: ['status','stage'] }, { field: 'response_notes', keys: ['response_notes','responsenotes','response_note'] }, { field: 'source', keys: ['source','lead_source'] }, { field: 'next_followup', keys: ['next_followup','nextfollowup','next_follow_up'] }, { field: 'last_contacted', keys: ['last_contacted','lastcontacted'] },
  { field: '_contact_note', keys: ['notes','note','comments','remarks','contact_note','contact_notes'] }, { field: '_company_note', keys: ['company_note','company_notes'] },
  { field: '_industry',     keys: ['industry','sector'] },
  { field: '_country',      keys: ['country','account_country','company_country'] },
  { field: '_website',      keys: ['website','company_website','url','domain'] },
  { field: '_revenue',      keys: ['revenue','revenue_millions','annual_revenue'] },
  { field: '_employees',    keys: ['employees','employee_count','company_size','headcount'] },
];

function UploadCSV({ userId, onDone }) {
  const [step, setStep]          = useState('idle'); // idle | mapping | reviewing | importing | done
  const [msg, setMsg]            = useState('');
  const [csvHeaders, setCsvHeaders]   = useState([]); // raw header strings
  const [csvFileName, setCsvFileName] = useState('');
  const [csvDataRows, setCsvDataRows] = useState([]); // array of arrays (raw string values)
  const [mapping, setMapping]         = useState({}); // { headerIndex: fieldKey }
  const [parsedRows, setParsedRows]    = useState([]);
  const [newCompanies, setNewCompanies]  = useState([]); // [{name, industry, country, website, revenue_millions, employees, possibleMatch}]
  const [selectedNew, setSelectedNew]   = useState(new Set()); // company names to create
  const [resolvedLinks, setResolvedLinks] = useState({}); // companyName -> { id, name } — confident domain/name matches, linked automatically
  const [companyChoice, setCompanyChoice] = useState({}); // companyName -> 'link' | 'new', for items with a possibleMatch
  const [dupeMatches, setDupeMatches]   = useState([]); // [{email, existingName, ownerName, isOwn}]
  const [dupeSkip, setDupeSkip]         = useState(new Set()); // emails (lowercase) to skip on import
  const [myMailboxOptions, setMyMailboxOptions] = useState([]); // this rep's registered email_accounts
  const [unmatchedSenders, setUnmatchedSenders] = useState([]); // [{ value, count }]
  const [senderResolutions, setSenderResolutions] = useState({}); // { value: { action: 'existing'|'new', accountId } }
  const [pendingRows, setPendingRows] = useState([]);
  const [resolvingSenders, setResolvingSenders] = useState(false);

  function splitCSVLine(line) {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += line[i]; }
    }
    vals.push(cur.trim());
    return vals;
  }

  // Splits raw CSV text into logical records (rows), respecting quoted
  // fields that themselves contain a newline — e.g. a company name exported
  // across two physical lines inside quotes. A naive text.split('\n') would
  // break such a field into two garbled rows.
  function splitCSVRecords(text) {
    const records = [];
    let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { inQ = !inQ; cur += ch; }
      else if (ch === '\n' && !inQ) { records.push(cur); cur = ''; }
      else if (ch === '\r') { /* ignore, newline handled by \n */ }
      else { cur += ch; }
    }
    if (cur.trim()) records.push(cur);
    return records;
  }

  // Normalizes a website/domain string for comparison: strips protocol, "www.",
  // path/query, lowercases. Mirrors the same helper on the Accounts page so
  // CSV-import matching and AI-research domain-sharing agree on what counts
  // as "the same company".
  function normalizeDomain(website) {
    if (!website) return '';
    return String(website).trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0];
  }

  const LEGAL_SUFFIX_RE = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|group|plc|gmbh|pty|holdings|international|intl)\b\.?/g;
  // Normalizes a company name for comparison: lowercases, strips punctuation
  // and common legal suffixes (Inc/Ltd/Group/Corp/...), collapses whitespace.
  function normalizeCompanyName(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .replace(/[.,&]/g, ' ')
      .replace(LEGAL_SUFFIX_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function guessField(header) {
    const h = header.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    for (const g of FIELD_GUESS) {
      if (g.keys.includes(h)) return g.field;
    }
    return '';
  }

  function parseCSV(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result.trim();
        const lines = splitCSVRecords(text);
        if (lines.length < 2) { setMsg('CSV has no data rows'); return; }

        const headers = splitCSVLine(lines[0]);
        const dataRows = lines.slice(1).filter(l => l.trim()).map(splitCSVLine);

        const initialMapping = {};
        headers.forEach((h, i) => {
          let guess = guessField(h);
          // Disambiguate "pitch" vs "pitch_type": if the free-text pitch field was guessed
          // but every sample value in this column matches a known pitch-type option
          // (e.g. "Workday", "SAP"), it's almost certainly meant as the categorical Pitch Type.
          if (guess === 'pitch') {
            const samples = dataRows.map(r => (r[i] || '').trim()).filter(Boolean);
            if (samples.length > 0 && samples.every(v => PITCH_TYPE_VALUES.has(v.toLowerCase()))) {
              guess = 'pitch_type';
            }
          }
          initialMapping[i] = guess;
        });

        setCsvHeaders(headers);
        setCsvDataRows(dataRows);
        setMapping(initialMapping);
        setMsg('');
        setStep('mapping');
      } catch (err) {
        setMsg('Error: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function updateMapping(headerIndex, field) {
    setMapping(prev => ({ ...prev, [headerIndex]: field }));
  }

  async function applyMappingAndContinue() {
    const rows = csvDataRows.map(vals => {
      const obj = { owner_id: userId, status: 'Fresh' };
      let firstName = '', lastName = '';
      Object.entries(mapping).forEach(([idxStr, field]) => {
        if (!field) return;
        const idx = Number(idxStr);
        const val = (vals[idx] || '').trim();
        if (!val) return;
        if (field === 'full_name') {
          const parts = val.split(/\s+/);
          firstName = firstName || parts[0] || '';
          lastName = lastName || parts.slice(1).join(' ') || '';
        } else if (field === 'first_name') {
          firstName = val;
        } else if (field === 'last_name') {
          lastName = val;
        } else if (field === 'status') {
          // ignore — new contacts always start as Fresh regardless of any status/stage column in the source file
        } else {
          obj[field] = val;
        }
      });
      obj.first_name = firstName;
      obj.last_name = lastName;
      return obj;
    }).filter(r => r.first_name || r.last_name || r.email);

    if (rows.length === 0) { setMsg('No valid rows found — check your column mapping'); setStep('idle'); return; }

    const sendersResolved = await resolveSenderMailboxes(rows);
    if (!sendersResolved) return; // paused on the 'senders' step — confirmSenderResolutions() continues from here

    await continueAfterSenderResolution(rows);
  }

  // Checks the CSV's sender_email values against this rep's registered mailboxes.
  // Returns true and mutates rows in place if every value matched (or no sender
  // column was mapped). Returns false and opens the resolution step otherwise.
  async function resolveSenderMailboxes(rows) {
    const hasSenderColumn = Object.values(mapping).includes('sender_email');
    if (!hasSenderColumn) return true;

    const { data: accounts } = await supabase.from('email_accounts').select('*').eq('user_id', userId);
    const byEmail = {};
    (accounts || []).forEach(a => { byEmail[a.email_address.toLowerCase()] = a; });

    const distinctValues = [...new Set(rows.map(r => (r.sender_email || '').trim().toLowerCase()).filter(Boolean))];
    const unmatched = distinctValues.filter(v => !byEmail[v]);

    if (unmatched.length === 0) {
      rows.forEach(r => {
        const v = (r.sender_email || '').trim().toLowerCase();
        if (v && byEmail[v]) { r.sender_account_id = byEmail[v].id; r.sender_email = byEmail[v].email_address; }
      });
      return true;
    }

    setMyMailboxOptions(accounts || []);
    setUnmatchedSenders(unmatched.map(v => ({
      value: v,
      count: rows.filter(r => (r.sender_email || '').trim().toLowerCase() === v).length,
    })));
    setSenderResolutions(Object.fromEntries(unmatched.map(v => [v, { action: '', accountId: '' }])));
    setPendingRows(rows);
    setMsg('');
    setStep('senders');
    return false;
  }

  function updateSenderResolution(value, patch) {
    setSenderResolutions(prev => ({ ...prev, [value]: { ...prev[value], ...patch } }));
  }

  async function confirmSenderResolutions() {
    const unresolved = unmatchedSenders.some(u => {
      const r = senderResolutions[u.value];
      return !r || !r.action || (r.action === 'existing' && !r.accountId);
    });
    if (unresolved) { setMsg('Resolve every mailbox before continuing.'); return; }

    setResolvingSenders(true);

    const { data: accounts } = await supabase.from('email_accounts').select('*').eq('user_id', userId);
    const byEmail = {};
    (accounts || []).forEach(a => { byEmail[a.email_address.toLowerCase()] = a; });

    const valueToAccountId = {};
    pendingRows.forEach(r => {
      const v = (r.sender_email || '').trim().toLowerCase();
      if (v && byEmail[v]) valueToAccountId[v] = byEmail[v].id;
    });

    for (const u of unmatchedSenders) {
      const res = senderResolutions[u.value];
      if (res.action === 'existing') {
        valueToAccountId[u.value] = res.accountId;
      } else if (res.action === 'new') {
        if (byEmail[u.value]) { valueToAccountId[u.value] = byEmail[u.value].id; continue; }
        const { data: created, error } = await supabase.from('email_accounts')
          .insert({ user_id: userId, email_address: u.value, daily_send_cap: 50, is_active: true })
          .select('id').single();
        if (!error && created) valueToAccountId[u.value] = created.id;
      }
    }

    const resolvedRows = pendingRows.map(r => {
      const v = (r.sender_email || '').trim().toLowerCase();
      if (v && valueToAccountId[v]) return { ...r, sender_account_id: valueToAccountId[v], sender_email: v };
      return r;
    });

    setResolvingSenders(false);
    await continueAfterSenderResolution(resolvedRows);
  }

  // Normalized "no email" fallback match key: first+last name and company,
  // lowercased/trimmed. Returns null when there isn't enough signal to match
  // confidently (needs a name AND a company).
  function nameCompanyKey(r) {
    const fn = (r.first_name || '').trim().toLowerCase();
    const ln = (r.last_name || '').trim().toLowerCase();
    const co = (r.company || '').trim().toLowerCase();
    if (!co || (!fn && !ln)) return null;
    return `${fn}|${ln}|${co}`;
  }

  async function continueAfterSenderResolution(rows) {
    setParsedRows(rows);
    setStep('importing');
    setMsg('Checking for duplicate contacts…');

    // Tag every row with the key we'll use to detect it as a duplicate —
    // email when present, otherwise a normalized name+company fallback so
    // contacts with no email address don't silently re-import every time.
    rows.forEach(r => {
      const e = (r.email || '').trim().toLowerCase();
      if (e) { r._dupeKey = 'email:' + e; return; }
      const k = nameCompanyKey(r);
      r._dupeKey = k ? 'nc:' + k : null;
    });

    const emails = [...new Set(rows.map(r => (r.email || '').trim().toLowerCase()).filter(Boolean))];
    const matches = [];

    if (emails.length > 0) {
      const { data: existingContacts } = await supabase.from('contacts').select('id, email, first_name, last_name, owner_id').in('email', emails);
      (existingContacts || []).forEach(ec => {
        matches.push({
          key: 'email:' + ec.email.toLowerCase(),
          id: ec.id,
          email: ec.email,
          existingName: [ec.first_name, ec.last_name].filter(Boolean).join(' ') || ec.email,
          ownerId: ec.owner_id,
          matchType: 'email',
        });
      });
    }

    // Fallback pass for rows that have no email: match on name + company
    // against existing contacts at the same companies (regardless of
    // whether those existing contacts have an email on file either).
    const noEmailCompanies = [...new Set(
      rows.filter(r => !((r.email || '').trim())).map(r => (r.company || '').trim()).filter(Boolean)
    )];
    if (noEmailCompanies.length > 0) {
      const { data: candidateContacts } = await supabase.from('contacts')
        .select('id, email, first_name, last_name, company, owner_id')
        .in('company', noEmailCompanies);
      const wantedKeys = new Set(rows.map(r => r._dupeKey).filter(k => k && k.startsWith('nc:')));
      (candidateContacts || []).forEach(ec => {
        const k = nameCompanyKey(ec);
        if (!k) return;
        const fullKey = 'nc:' + k;
        if (!wantedKeys.has(fullKey)) return;
        matches.push({
          key: fullKey,
          id: ec.id,
          email: '',
          existingName: [ec.first_name, ec.last_name].filter(Boolean).join(' ') || ec.company,
          ownerId: ec.owner_id,
          matchType: 'name_company',
        });
      });
    }

    if (matches.length > 0) {
      const ownerIds = [...new Set(matches.map(m => m.ownerId))];
      const { data: owners } = await supabase.from('org_hierarchy').select('user_id, full_name').in('user_id', ownerIds);
      const ownerNameMap = {};
      (owners || []).forEach(o => { ownerNameMap[o.user_id] = o.full_name; });
      const fullMatches = matches.map(m => ({
        ...m,
        ownerName: m.ownerId === userId ? 'you' : (ownerNameMap[m.ownerId] || 'another rep'),
        isOwn: m.ownerId === userId,
      }));
      setDupeMatches(fullMatches);
      setDupeSkip(new Set(fullMatches.map(m => m.key)));
      setStep('dupes');
      return;
    }

    await checkNewCompaniesAndProceed(rows);
  }

  async function checkNewCompaniesAndProceed(rows) {
    setStep('importing');
    setMsg('Checking accounts…');

    const uniqueCompanies = [...new Set(rows.map(r => r.company).filter(c => c && c.trim()))];
    // Scope to this owner only — otherwise another rep's account for the
    // same company name hides the fact that YOU don't have one yet. Pull the
    // full set (not just literal name matches) so we can also match by
    // domain or a normalized name — "Westpac Group" vs "Westpac Banking
    // Corporation" won't match as literal strings, but can match on website
    // domain or on the suffix-stripped name.
    const { data: allAccounts } = await supabase.from('accounts').select('id, name, website').eq('owner_id', userId);
    const existing = allAccounts || [];

    const links = {};      // companyName -> { id, name } — confident match, linked automatically
    const newCoList = [];  // genuinely new, or an uncertain fuzzy match that needs a human call

    uniqueCompanies.forEach(name => {
      const sample = rows.find(r => r.company === name) || {};
      const csvDomain = normalizeDomain(sample._website);
      const csvNameNorm = normalizeCompanyName(name);

      // 1. Exact literal name match (fast path, same as before).
      let match = existing.find(a => a.name === name);
      // 2. Domain match — the most reliable signal when a website is present.
      if (!match && csvDomain) match = existing.find(a => normalizeDomain(a.website) === csvDomain);
      // 3. Exact normalized-name match (legal-suffix-stripped).
      if (!match && csvNameNorm) match = existing.find(a => normalizeCompanyName(a.name) === csvNameNorm);

      if (match) {
        links[name] = { id: match.id, name: match.name };
        return;
      }

      // 4. Fuzzy match — one normalized name contains the other. Not
      // confident enough to auto-link; flagged for the reviewer to decide.
      const fuzzy = csvNameNorm ? existing.find(a => {
        const an = normalizeCompanyName(a.name);
        return an && (an.includes(csvNameNorm) || csvNameNorm.includes(an));
      }) : null;

      newCoList.push({
        name,
        industry:            normalizeIndustry(sample._industry) || '',
        country:             sample._country || '',
        website:             sample._website || '',
        revenue_millions:    sample._revenue || '',
        employees:           sample._employees || '',
        possibleMatch:       fuzzy ? { id: fuzzy.id, name: fuzzy.name } : null,
      });
    });

    setResolvedLinks(links);
    setNewCompanies(newCoList);
    if (newCoList.length > 0) {
      setSelectedNew(new Set(newCoList.filter(c => !c.possibleMatch).map(c => c.name)));
      setCompanyChoice(Object.fromEntries(newCoList.filter(c => c.possibleMatch).map(c => [c.name, 'link'])));
      setStep('reviewing');
    } else {
      const linkedAccounts = Object.entries(links).map(([name, v]) => ({ id: v.id, name }));
      await runImport(rows, linkedAccounts, []);
    }
  }

  function toggleDupeSkip(key) {
    setDupeSkip(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function confirmDupesAndContinue() {
    // Checking a duplicate's box means "update that existing contact with
    // this row's data" rather than creating a second contact — look up the
    // matched contact's id so runImport can upsert instead of insert for it.
    const idByDupeKey = Object.fromEntries(dupeMatches.filter(m => m.id).map(m => [m.key, m.id]));
    const rows = parsedRows.filter(r => {
      if (!r._dupeKey) return true;
      return !dupeSkip.has(r._dupeKey);
    }).map(r => (r._dupeKey && idByDupeKey[r._dupeKey]) ? { ...r, _updateContactId: idByDupeKey[r._dupeKey] } : r);
    if (rows.length === 0) {
      setMsg('All contacts skipped — nothing to import');
      setStep('idle');
      return;
    }
    setParsedRows(rows);
    await checkNewCompaniesAndProceed(rows);
  }

  async function runImport(rows, existingAccounts, createdAccounts) {
    setStep('importing');
    setMsg('Importing contacts…');

    // One batch row per CSV upload, so the Contacts page can filter down to
    // exactly the contacts that came from this particular import.
    const { data: batch } = await supabase.from('import_batches').insert({
      owner_id: userId, file_name: csvFileName || null, contact_count: rows.length,
    }).select('id').single();
    const batchId = batch?.id || null;

    const accountMap = {};
    [...existingAccounts, ...createdAccounts].forEach(a => { accountMap[a.name] = a.id; });

    // Strip internal _fields before inserting/updating contacts. Rows the
    // rep chose to reconcile against an existing contact (in the duplicate
    // review step) carry _updateContactId — those become an upsert keyed on
    // id, which updates the existing row instead of creating a new one.
    const contactRows = rows.map(({ _industry, _country, _website, _revenue, _employees, _contact_note, _company_note, _dupeKey, _updateContactId, ...rest }) => ({
      ...rest,
      account_id: accountMap[rest.company] || null,
      source: 'csv_import',
      import_batch_id: batchId,
      ...(_updateContactId ? { id: _updateContactId } : {}),
    }));

    const contactNotesToInsert = [];
    const companyNotesToInsert = [];
    const companyNotesSeen = new Set();
    let insertedCount = 0;
    let updatedCount = 0;

    function collectNotes(id, src) {
      if (src && src._contact_note) {
        contactNotesToInsert.push({ contact_id: id, author_id: userId, body: src._contact_note });
      }
      if (src && src._company_note && src.company && !companyNotesSeen.has(src.company)) {
        companyNotesSeen.add(src.company);
        companyNotesToInsert.push({ company_name: src.company, author_id: userId, body: src._company_note });
      }
    }

    const BATCH = 50;
    let total = 0;
    for (let i = 0; i < contactRows.length; i += BATCH) {
      const batchRows = rows.slice(i, i + BATCH);
      const batchContactRows = contactRows.slice(i, i + BATCH);
      const toInsert = [], toInsertSrc = [], toUpdate = [], toUpdateSrc = [];
      batchContactRows.forEach((cr, idx) => {
        if (cr.id) { toUpdate.push(cr); toUpdateSrc.push(batchRows[idx]); }
        else { toInsert.push(cr); toInsertSrc.push(batchRows[idx]); }
      });

      if (toInsert.length) {
        const { data: inserted, error } = await supabase.from('contacts').insert(toInsert).select('id');
        if (error) { setMsg('Upload failed: ' + error.message); setStep('idle'); return; }
        if (inserted && inserted.length) {
          insertedCount += inserted.length;
          await supabase.from('activity_log').insert(inserted.map(row => ({
            actor_id: userId, contact_id: row.id, activity_type: 'contact_created',
            details: { source: 'csv_import' },
          })));
          inserted.forEach((row, idx) => collectNotes(row.id, toInsertSrc[idx]));
        }
      }

      if (toUpdate.length) {
        const { data: updated, error } = await supabase.from('contacts').upsert(toUpdate, { onConflict: 'id' }).select('id');
        if (error) { setMsg('Upload failed: ' + error.message); setStep('idle'); return; }
        updatedCount += toUpdate.length;
        await supabase.from('activity_log').insert(toUpdate.map(row => ({
          actor_id: userId, contact_id: row.id, activity_type: 'contact_updated',
          details: { source: 'csv_import' },
        })));
        toUpdate.forEach((row, idx) => collectNotes(row.id, toUpdateSrc[idx]));
      }

      total += Math.min(BATCH, contactRows.length - i);
      setMsg(`Uploading… ${total}/${contactRows.length}`);
    }

    // Notes live in separate tables (contact_notes / company_notes) — each
    // imported note is added as a new entry, matching how notes work
    // everywhere else in the app, rather than overwriting anything.
    if (contactNotesToInsert.length) await supabase.from('contact_notes').insert(contactNotesToInsert);
    if (companyNotesToInsert.length) await supabase.from('company_notes').insert(companyNotesToInsert);

    setStep('done');
    setMsg(`✓ ${insertedCount} added${updatedCount ? `, ${updatedCount} updated` : ''}`);
    onDone();
    setTimeout(() => { setMsg(''); setStep('idle'); }, 4000);
  }

  async function confirmAndImport() {
    setStep('importing');
    setMsg('Creating accounts…');

    // Start from the confident matches already resolved (exact name, domain,
    // or exact normalized-name) in checkNewCompaniesAndProceed.
    const existingAccounts = Object.entries(resolvedLinks).map(([name, v]) => ({ id: v.id, name }));

    const toCreate = [];
    newCompanies.forEach(c => {
      if (c.possibleMatch) {
        // Flagged as a likely-same company — link to it unless the reviewer
        // explicitly chose to create it as a separate account.
        if ((companyChoice[c.name] || 'link') === 'link') {
          existingAccounts.push({ id: c.possibleMatch.id, name: c.name });
        } else {
          toCreate.push({ name: c.name, owner_id: userId, industry: c.industry || null, country: c.country || null, website: c.website || null, revenue_millions: c.revenue_millions || null, employees: c.employees || null });
        }
        return;
      }
      if (selectedNew.has(c.name)) {
        toCreate.push({ name: c.name, owner_id: userId, industry: c.industry || null, country: c.country || null, website: c.website || null, revenue_millions: c.revenue_millions || null, employees: c.employees || null });
      }
    });

    let createdAccounts = [];
    if (toCreate.length > 0) {
      // Upsert on (owner_id, name): safe against races and against the
      // now-enforced unique constraint if this owner already has the account.
      const { data: created } = await supabase.from('accounts').upsert(toCreate, { onConflict: 'owner_id,name' }).select('id, name');
      createdAccounts = created || [];
    }

    await runImport(parsedRows, existingAccounts, createdAccounts);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setMsg('');
    setStep('idle');
    setCsvFileName(file.name || '');
    parseCSV(file);
  }

  function downloadSampleCSV() {
    const headers = ['full_name','email','title','company','phone','location','linkedin_url','pitch','pitch_type','persona','campaign','response_type','sender_email','notes','company_note','source','industry','country','website','revenue','employees'];
    const rows = [
      ['Jane Doe','jane.doe@testco.com','QA Manager','TestCo Inc','+1-555-201-4488','New York, NY','https://linkedin.com/in/janedoe','ACCELQ eliminates Selenium maintenance overhead','Salesforce','QA / Quality Leader','Selenium','cold','sdr1@accelq.com','Met briefly at a QA conference in September','Running a large legacy Selenium suite on Salesforce','Trade Show','Financial Services','United States','https://testco.com','750','1200'],
      ['Raj Mehta','raj.mehta@acmecorp.com','Director of Engineering','Acme Corp','+1-555-884-2291','San Francisco, CA','https://linkedin.com/in/rajmehta','Faster release cycles with AI-driven test automation','ServiceNow','Engineering Leader','Generic','warm','sdr2@accelq.com','Replied positively to LinkedIn InMail','Recently expanded ServiceNow footprint','LinkedIn Outreach','Technology','United States','https://acmecorp.com','310','540'],
      ['Priya Nair','priya.nair@globalbank.com','VP of Quality Engineering','Global Bank Ltd','+44-20-7946-0958','London, UK','https://linkedin.com/in/priyanair','Reduce regression risk across core banking workflows','SAP','Executive / Economic Buyer','Testing of AI/Agents','prospect','sdr1@accelq.com','','Multiple SAP modules in production across regions','Apollo Import','Banking','United Kingdom','https://globalbank.com','5200','18000'],
    ];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_import_sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const toggleCompany = (name) => {
    setSelectedNew(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const mappedFieldCount = Object.values(mapping).filter(Boolean).length;
  const hasNameOrEmail = Object.values(mapping).some(f => ['first_name','last_name','full_name','email'].includes(f));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {msg && (
        <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#059669' : msg.startsWith('Upload') || msg.startsWith('Error') ? '#dc2626' : '#555' }}>
          {msg}
        </span>
      )}
      <label style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: step === 'importing' ? 'not-allowed' : 'pointer', opacity: step === 'importing' ? 0.7 : 1, whiteSpace: 'nowrap' }}>
        {step === 'importing' ? 'Importing…' : '+ Import CSV'}
        <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} disabled={step === 'importing'} />
      </label>
      <a href="#" onClick={(e) => { e.preventDefault(); downloadSampleCSV(); }} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
        Download sample CSV
      </a>

      {step === 'mapping' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 680, maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Map your CSV columns</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>
              We found {csvHeaders.length} column{csvHeaders.length !== 1 ? 's' : ''} and {csvDataRows.length} row{csvDataRows.length !== 1 ? 's' : ''}. Tell us what each column means so nothing gets lost or mismatched.
            </p>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 16px' }}>
              Columns left as "Don't import" are ignored.
            </p>

            {!hasNameOrEmail && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                ⚠ Map at least a name or email column so contacts can be identified.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {csvHeaders.map((h, i) => {
                const sample = csvDataRows.find(r => (r[i] || '').trim())?.[i] || '';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, border: '1px solid #eee' }}>
                    <div style={{ flex: '0 0 160px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h || `Column ${i + 1}`}</div>
                      <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sample ? `e.g. "${sample}"` : 'no sample data'}</div>
                    </div>
                    <span style={{ color: '#bbb', fontSize: 14 }}>→</span>
                    <select value={mapping[i] || ''} onChange={e => updateMapping(i, e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: mapping[i] ? '#111' : '#999' }}>
                      {CONTACT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#999' }}>{mappedFieldCount} of {csvHeaders.length} columns mapped</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setStep('idle'); setCsvHeaders([]); setCsvDataRows([]); setMapping({}); }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#666' }}>
                  Cancel
                </button>
                <button onClick={applyMappingAndContinue} disabled={!hasNameOrEmail}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: hasNameOrEmail ? '#2563eb' : '#c7d2fe', color: '#fff', fontSize: 13, fontWeight: 600, cursor: hasNameOrEmail ? 'pointer' : 'not-allowed' }}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sender mailbox resolution modal */}
      {step === 'senders' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 580, maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Unrecognized sender mailboxes</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
              {unmatchedSenders.length} sender address{unmatchedSenders.length === 1 ? '' : 'es'} in this file aren't registered to you yet. Resolve each one before importing.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {unmatchedSenders.map(u => {
                const res = senderResolutions[u.value] || {};
                return (
                  <div key={u.value} style={{ padding: 12, borderRadius: 8, border: '1px solid #eee', background: '#f9fafb' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{u.value}</div>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>{u.count} contact{u.count !== 1 ? 's' : ''} in this file</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name={`sender-${u.value}`} checked={res.action === 'existing'} onChange={() => updateSenderResolution(u.value, { action: 'existing' })} />
                        Map to one of my mailboxes:
                        <select value={res.action === 'existing' ? (res.accountId || '') : ''} disabled={res.action !== 'existing'}
                          onChange={e => updateSenderResolution(u.value, { action: 'existing', accountId: e.target.value })}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
                          <option value="">Choose…</option>
                          {myMailboxOptions.map(mb => <option key={mb.id} value={mb.id}>{mb.label ? `${mb.label} — ` : ''}{mb.email_address}</option>)}
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name={`sender-${u.value}`} checked={res.action === 'new'} onChange={() => updateSenderResolution(u.value, { action: 'new' })} />
                        Register "{u.value}" as a new mailbox of mine
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {msg && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{msg}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setStep('idle'); setCsvHeaders([]); setCsvDataRows([]); setMapping({}); setMsg(''); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#666' }}>
                Cancel
              </button>
              <button onClick={confirmSenderResolutions} disabled={resolvingSenders}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: resolvingSenders ? 'not-allowed' : 'pointer', opacity: resolvingSenders ? 0.7 : 1 }}>
                {resolvingSenders ? 'Resolving…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-rep duplicate contacts review modal */}
      {step === 'dupes' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Possible duplicate contacts</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
              {dupeMatches.length} contact{dupeMatches.length === 1 ? '' : 's'} in this file may already exist in the platform — matched by email where available, or by name + company when no email was given. They're skipped by default — check a box to update that contact with this file's data instead (pitch type, persona, etc.) rather than creating a duplicate.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {dupeMatches.map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 8, border: '1px solid #eee', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!dupeSkip.has(m.key)} onChange={() => toggleDupeSkip(m.key)} style={{ marginTop: 3, cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{m.existingName}</div>
                    {m.email
                      ? <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{m.email}</div>
                      : <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Matched by name + company (no email on file)</div>}
                    <div style={{ fontSize: 12, color: m.isOwn ? '#b45309' : '#991b1b', marginTop: 2 }}>
                      {m.isOwn ? 'You already have this contact' : `Already owned by ${m.ownerName}`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setStep('idle'); setDupeMatches([]); setDupeSkip(new Set()); }}
                style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#666', cursor: 'pointer' }}>
                Cancel import
              </button>
              <button onClick={confirmDupesAndContinue}
                style={{ fontSize: 13, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New companies review modal */}
      {step === 'reviewing' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>New companies found</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
              {newCompanies.length} compan{newCompanies.length === 1 ? 'y' : 'ies'} not confidently matched to an existing account. Some look like they might already exist under a different name — choose to link or create those separately below.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setSelectedNew(new Set(newCompanies.filter(c => !c.possibleMatch).map(c => c.name)))}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#f9f9f9', cursor: 'pointer' }}>Select all</button>
              <button onClick={() => setSelectedNew(new Set())}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#f9f9f9', cursor: 'pointer' }}>Deselect all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {newCompanies.map(c => c.possibleMatch ? (
                <div key={c.name} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#92400e', margin: '4px 0 8px' }}>
                    Might be the same company as your existing <strong>{c.possibleMatch.name}</strong> account.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setCompanyChoice(p => ({ ...p, [c.name]: 'link' }))}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + ((companyChoice[c.name] || 'link') === 'link' ? '#2563eb' : '#e0e0e0'), background: (companyChoice[c.name] || 'link') === 'link' ? '#2563eb' : '#fff', color: (companyChoice[c.name] || 'link') === 'link' ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>
                      Link to {c.possibleMatch.name}
                    </button>
                    <button onClick={() => setCompanyChoice(p => ({ ...p, [c.name]: 'new' }))}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (companyChoice[c.name] === 'new' ? '#2563eb' : '#e0e0e0'), background: companyChoice[c.name] === 'new' ? '#2563eb' : '#fff', color: companyChoice[c.name] === 'new' ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>
                      Create as new company
                    </button>
                  </div>
                </div>
              ) : (
                <div key={c.name} onClick={() => toggleCompany(c.name)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + (selectedNew.has(c.name) ? '#bfdbfe' : '#e5e7eb'), background: selectedNew.has(c.name) ? '#eff6ff' : '#fafafa', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedNew.has(c.name)} onChange={() => toggleCompany(c.name)} style={{ marginTop: 2, cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {c.industry && <span>Industry: {c.industry}</span>}
                      {c.country && <span>Country: {c.country}</span>}
                      {c.employees && <span>Employees: {c.employees}</span>}
                      {c.revenue_millions && <span>Revenue: ${c.revenue_millions}M</span>}
                      {c.website && <span>Website: {c.website}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => runImport(parsedRows, Object.entries(resolvedLinks).map(([name, v]) => ({ id: v.id, name })), [])}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#666' }}>
                Skip — import contacts only
              </button>
              <button onClick={confirmAndImport}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {(() => {
                  const createCount = selectedNew.size + newCompanies.filter(c => c.possibleMatch && companyChoice[c.name] === 'new').length;
                  const linkCount = newCompanies.filter(c => c.possibleMatch && (companyChoice[c.name] || 'link') === 'link').length;
                  const parts = [];
                  if (createCount > 0) parts.push(`create ${createCount}`);
                  if (linkCount > 0) parts.push(`link ${linkCount}`);
                  return parts.length ? `${parts.join(', ')} & import` : 'Import';
                })()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
