import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

async function callApollo(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('apollo-proxy', { body: { action, ...params } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function normalizeDomain(url) {
  if (!url) return '';
  return url.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0];
}

function extractCompanyInfo(c) {
  const org = c.organization || {};
  const name = org.name || c.organization_name || '';
  const domain = normalizeDomain(org.primary_domain || org.website_url || org.domain || '');
  return { name, domain };
}

const SENIORITY_OPTIONS = [
  { v: 'owner', l: 'Owner' }, { v: 'founder', l: 'Founder' }, { v: 'c_suite', l: 'C-Suite' },
  { v: 'partner', l: 'Partner' }, { v: 'vp', l: 'VP' }, { v: 'head', l: 'Head' },
  { v: 'director', l: 'Director' }, { v: 'manager', l: 'Manager' }, { v: 'senior', l: 'Senior' },
  { v: 'entry', l: 'Entry' }, { v: 'intern', l: 'Intern' },
];
const HEADCOUNT_OPTIONS = [
  { v: '1,10', l: '1-10' }, { v: '11,50', l: '11-50' }, { v: '51,200', l: '51-200' },
  { v: '201,500', l: '201-500' }, { v: '501,1000', l: '501-1,000' }, { v: '1001,5000', l: '1,001-5,000' },
  { v: '5001,10000', l: '5,001-10,000' }, { v: '10001,', l: '10,001+' },
];
const EMAIL_STATUS_OPTIONS = [
  { v: 'verified', l: 'Verified' }, { v: 'likely_to_engage', l: 'Likely to Engage' }, { v: 'unavailable', l: 'Unavailable' },
];

export default function ApolloImport() {
  const { profile, user } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [step, setStep] = useState('list');
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [sdrs, setSdrs] = useState([]);
  const [selectedSdr, setSelectedSdr] = useState('');
  const [enrichEmails, setEnrichEmails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState({});
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResults, setImportResults] = useState(null);
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [newCompanies, setNewCompanies] = useState([]);
  const [selectedNewCompanies, setSelectedNewCompanies] = useState(new Set());
  const [pendingAssignTo, setPendingAssignTo] = useState(null);
  const [mode, setMode] = useState('list');
  const [filters, setFilters] = useState({
    titles: '', seniorities: [], personLocations: '', orgLocations: '',
    headcounts: [], keywordTags: '', keywords: '', domains: '',
    technologies: '', revenueMin: '', revenueMax: '', emailStatus: [],
    foundedMin: '', foundedMax: '',
  });

  useEffect(() => {
    async function init() {
      setLoading(true); setError(null);
      try {
        const data = await callApollo('list_lists');
        setLists(data.labels || []);
        if (!isOwner) {
          const { data: h } = await supabase.from('org_hierarchy').select('*').eq('role', 'owner');
          setSdrs(h || []);
        }
      } catch (e) { setError(e.message); }
      setLoading(false);
    }
    init();
  }, []);

  async function loadContacts(listId, pageNum = 1) {
    setLoading(true); setError(null);
    try {
      const data = await callApollo('list_contacts', { list_id: listId, page: pageNum, per_page: 50 });
      const fetched = data.contacts || [];
      setContacts(fetched);
      setTotalContacts(data.pagination?.total_entries || fetched.length);
      setPage(pageNum);
      const emails = fetched.filter(c => c.email).map(c => c.email.toLowerCase());
      if (emails.length > 0) {
        const { data: existing } = await supabase.from('contacts').select('email').in('email', emails);
        const existingEmails = new Set((existing || []).map(c => c.email?.toLowerCase()));
        const dups = fetched.filter(c => c.email && existingEmails.has(c.email.toLowerCase()));
        setDuplicates(dups);
        const def = {}; dups.forEach(d => { def[d.email] = 'skip'; });
        setDuplicateAction(def);
      } else { setDuplicates([]); setDuplicateAction({}); }
      setStep('preview');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  function toggleMultiFilter(key, val) {
    setFilters(f => {
      const arr = f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val];
      return { ...f, [key]: arr };
    });
  }

  function buildSearchBody(pageNum) {
    const body = { page: pageNum, per_page: 50 };
    if (filters.titles.trim()) body.person_titles = filters.titles.split(',').map(s => s.trim()).filter(Boolean);
    if (filters.seniorities.length) body.person_seniorities = filters.seniorities;
    if (filters.personLocations.trim()) body.person_locations = filters.personLocations.split(',').map(s => s.trim()).filter(Boolean);
    if (filters.orgLocations.trim()) body.organization_locations = filters.orgLocations.split(',').map(s => s.trim()).filter(Boolean);
    if (filters.headcounts.length) body.organization_num_employees_ranges = filters.headcounts;
    if (filters.keywordTags.trim()) body.q_organization_keyword_tags = filters.keywordTags.split(',').map(s => s.trim()).filter(Boolean);
    if (filters.keywords.trim()) body.q_keywords = filters.keywords.trim();
    if (filters.domains.trim()) body.q_organization_domains_list = filters.domains.split(',').map(s => s.trim()).filter(Boolean);
    if (filters.technologies.trim()) body.currently_using_any_of_technology_uids = filters.technologies.split(',').map(s => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);
    if (filters.emailStatus.length) body.contact_email_status = filters.emailStatus;
    if (filters.revenueMin || filters.revenueMax) {
      body.revenue_range = {};
      if (filters.revenueMin) body.revenue_range.min = filters.revenueMin;
      if (filters.revenueMax) body.revenue_range.max = filters.revenueMax;
    }
    if (filters.foundedMin || filters.foundedMax) {
      body.organization_founded_year_range = {};
      if (filters.foundedMin) body.organization_founded_year_range.min = parseInt(filters.foundedMin);
      if (filters.foundedMax) body.organization_founded_year_range.max = parseInt(filters.foundedMax);
    }
    return body;
  }

  async function runSearch(pageNum = 1) {
    setLoading(true); setError(null);
    try {
      const data = await callApollo('people_search', buildSearchBody(pageNum));
      const fetched = data.people || [];
      setContacts(fetched);
      setTotalContacts(data.pagination?.total_entries || fetched.length);
      setPage(pageNum);
      const emails = fetched.filter(c => c.email).map(c => c.email.toLowerCase());
      if (emails.length > 0) {
        const { data: existing } = await supabase.from('contacts').select('email').in('email', emails);
        const existingEmails = new Set((existing || []).map(c => c.email?.toLowerCase()));
        const dups = fetched.filter(c => c.email && existingEmails.has(c.email.toLowerCase()));
        setDuplicates(dups);
        const def = {}; dups.forEach(d => { def[d.email] = 'skip'; });
        setDuplicateAction(def);
      } else { setDuplicates([]); setDuplicateAction({}); }
      setStep('preview');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function fetchAccountMaps(assignTo) {
    const { data: ownedAccounts } = await supabase.from('accounts').select('id, name, website').eq('owner_id', assignTo);
    const byDomain = {}, byName = {};
    (ownedAccounts || []).forEach(a => {
      if (a.website) { const d = normalizeDomain(a.website); if (d) byDomain[d] = a.id; }
      if (a.name) byName[a.name.toLowerCase()] = a.id;
    });
    return { byDomain, byName };
  }

  async function runImport() {
    setStep('checking-accounts');
    const assignTo = isOwner ? user?.id : selectedSdr;
    setPendingAssignTo(assignTo);
    const dupSet = new Set(duplicates.map(d => d.email));
    const toImport = contacts.filter(c => !dupSet.has(c.email) || duplicateAction[c.email] === 'overwrite');

    const { byDomain, byName } = await fetchAccountMaps(assignTo);

    // Find companies in this import that don't match an existing account
    // (by domain first, falling back to name) — same review-before-create
    // pattern as the CSV import flow.
    const seen = new Set();
    const toCreate = [];
    toImport.forEach(c => {
      const { name, domain } = extractCompanyInfo(c);
      if (!name) return;
      const key = domain || name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const matchedId = (domain && byDomain[domain]) || byName[name.toLowerCase()];
      if (!matchedId) toCreate.push({ name, domain, website: domain ? ('https://' + domain) : '' });
    });

    if (toCreate.length > 0) {
      setNewCompanies(toCreate);
      setSelectedNewCompanies(new Set(toCreate.map(c => c.name)));
      setStep('reviewing-accounts');
    } else {
      await doImport(assignTo, byDomain, byName);
    }
  }

  async function confirmAccountsAndImport() {
    const assignTo = pendingAssignTo;
    const toCreate = newCompanies.filter(c => selectedNewCompanies.has(c.name));
    let { byDomain, byName } = await fetchAccountMaps(assignTo);
    if (toCreate.length > 0) {
      if (!assignTo) {
        alert('Could not create accounts: no owner selected. Please select an owner and try again.');
        setStep('reviewing-accounts');
        return;
      }
      const { data: created, error } = await supabase.from('accounts').upsert(
        toCreate.map(c => ({ name: c.name, website: c.website || null, owner_id: assignTo })),
        { onConflict: 'owner_id,name' }
      ).select('id, name, website');
      if (error) {
        console.error('Account creation failed:', error);
        alert('Account creation failed: ' + error.message + '\n\nContacts were not imported. Please fix the issue and try again.');
        setStep('reviewing-accounts');
        return;
      }
      (created || []).forEach(a => {
        if (a.website) { const d = normalizeDomain(a.website); if (d) byDomain[d] = a.id; }
        if (a.name) byName[a.name.toLowerCase()] = a.id;
      });
    }
    await doImport(assignTo, byDomain, byName);
  }

  async function skipAccountsAndImport() {
    const assignTo = pendingAssignTo;
    const { byDomain, byName } = await fetchAccountMaps(assignTo);
    await doImport(assignTo, byDomain, byName);
  }

  async function doImport(assignTo, byDomain, byName) {
    setStep('importing');
    const dupSet = new Set(duplicates.map(d => d.email));
    const toImport = contacts.filter(c => !dupSet.has(c.email) || duplicateAction[c.email] === 'overwrite');
    setImportProgress({ done: 0, total: toImport.length });
    let imported = 0, failed = 0;
    for (let i = 0; i < toImport.length; i++) {
      const c = toImport[i];
      try {
        let email = c.email;
        if (!email && enrichEmails) {
          try {
            const en = await callApollo('enrich_email', { first_name: c.first_name, last_name: c.last_name, organization_name: c.organization?.name });
            email = en?.person?.email || null;
          } catch (_) {}
        }
        const { name: companyName, domain } = extractCompanyInfo(c);
        const accountId = (domain && byDomain[domain]) || (companyName && byName[companyName.toLowerCase()]) || null;
        const row = { first_name: c.first_name || '', last_name: c.last_name || '', email: email || null, title: c.title || null, company: c.organization?.name || null, linkedin_url: c.linkedin_url || null, owner_id: assignTo, status: 'Fresh', account_id: accountId, source: mode === 'search' ? 'apollo_search' : 'apollo_import' };
        if (c.email && duplicateAction[c.email] === 'overwrite') {
          await supabase.from('contacts').update(row).eq('email', c.email);
        } else {
          const { data: inserted } = await supabase.from('contacts').insert(row).select('id').single();
          if (inserted?.id) {
            await supabase.from('activity_log').insert({
              actor_id: profile?.id || null, contact_id: inserted.id, activity_type: 'contact_created',
              details: { source: mode === 'search' ? 'apollo_search' : 'apollo_import' },
            });
          }
        }
        imported++;
      } catch (_) { failed++; }
      setImportProgress({ done: i + 1, total: toImport.length });
    }
    setImportResults({ imported, skipped: contacts.length - toImport.length, failed });
    setStep('done');
  }

  const dupEmails = new Set(duplicates.map(d => d.email));
  const toImportCount = contacts.filter(c => !dupEmails.has(c.email) || duplicateAction[c.email] === 'overwrite').length;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111', margin: 0 }}>Apollo Import</h1>
        <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Import contacts from your Apollo.io people lists</p>
      </div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error.includes('API key not configured') ? (<>Apollo API key not configured. Go to <a href="/settings" style={{ color: '#2563eb' }}>Settings</a> to add it.</>) : error}
        </div>
      )}
      {(step === 'list' || step === 'preview') && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#f0f0ee', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          <button onClick={() => { setMode('list'); setStep('list'); setContacts([]); }} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === 'list' ? '#fff' : 'transparent', color: mode === 'list' ? '#111' : '#666', boxShadow: mode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>From Saved List</button>
          <button onClick={() => { setMode('search'); setStep('list'); setContacts([]); }} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === 'search' ? '#fff' : 'transparent', color: mode === 'search' ? '#111' : '#666', boxShadow: mode === 'search' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>Search Apollo (60+ filters)</button>
        </div>
      )}
      {mode === 'list' && (step === 'list' || step === 'preview') && (
        <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Select Apollo List</div>
          {loading && step === 'list' ? <div style={{ color: '#aaa', fontSize: 13 }}>Loading lists from Apollo…</div> : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={selectedList || ''} onChange={e => setSelectedList(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, flex: 1, minWidth: 200 }}>
                <option value="">Choose a list…</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.cached_count ?? '?'} contacts)</option>)}
              </select>
              <button onClick={() => selectedList && loadContacts(selectedList, 1)} disabled={!selectedList || loading}
                style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: selectedList ? 'pointer' : 'not-allowed', opacity: (!selectedList || loading) ? 0.6 : 1 }}>
                {loading ? 'Loading…' : 'Preview'}
              </button>
            </div>
          )}
        </div>
      )}
      {mode === 'search' && (step === 'list' || step === 'preview') && (
        <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 14 }}>Search Apollo's People Database</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Job Titles (comma-separated)</label>
              <input value={filters.titles} onChange={e => setFilters(f => ({ ...f, titles: e.target.value }))} placeholder="e.g. QA Director, VP Engineering"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Person Location (comma-separated)</label>
              <input value={filters.personLocations} onChange={e => setFilters(f => ({ ...f, personLocations: e.target.value }))} placeholder="e.g. United States, India"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Company Location (comma-separated)</label>
              <input value={filters.orgLocations} onChange={e => setFilters(f => ({ ...f, orgLocations: e.target.value }))} placeholder="e.g. California, UK"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Industry / Keyword Tags (comma-separated)</label>
              <input value={filters.keywordTags} onChange={e => setFilters(f => ({ ...f, keywordTags: e.target.value }))} placeholder="e.g. banking, insurance, fintech"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Keywords (company description)</label>
              <input value={filters.keywords} onChange={e => setFilters(f => ({ ...f, keywords: e.target.value }))} placeholder="e.g. test automation"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Company Domains (comma-separated)</label>
              <input value={filters.domains} onChange={e => setFilters(f => ({ ...f, domains: e.target.value }))} placeholder="e.g. salesforce.com"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Technologies Used (comma-separated)</label>
              <input value={filters.technologies} onChange={e => setFilters(f => ({ ...f, technologies: e.target.value }))} placeholder="e.g. Selenium, Salesforce"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Revenue Min ($)</label>
                <input value={filters.revenueMin} onChange={e => setFilters(f => ({ ...f, revenueMin: e.target.value }))} placeholder="0"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Revenue Max ($)</label>
                <input value={filters.revenueMax} onChange={e => setFilters(f => ({ ...f, revenueMax: e.target.value }))} placeholder="100000000"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Founded After</label>
                <input value={filters.foundedMin} onChange={e => setFilters(f => ({ ...f, foundedMin: e.target.value }))} placeholder="e.g. 2000"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>Founded Before</label>
                <input value={filters.foundedMax} onChange={e => setFilters(f => ({ ...f, foundedMax: e.target.value }))} placeholder="e.g. 2020"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 6 }}>Seniority</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SENIORITY_OPTIONS.map(o => (
                <button key={o.v} type="button" onClick={() => toggleMultiFilter('seniorities', o.v)}
                  style={{ padding: '4px 11px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: filters.seniorities.includes(o.v) ? '#2563eb' : '#f0f0ee', color: filters.seniorities.includes(o.v) ? '#fff' : '#666' }}>{o.l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 6 }}>Company Headcount</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {HEADCOUNT_OPTIONS.map(o => (
                <button key={o.v} type="button" onClick={() => toggleMultiFilter('headcounts', o.v)}
                  style={{ padding: '4px 11px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: filters.headcounts.includes(o.v) ? '#2563eb' : '#f0f0ee', color: filters.headcounts.includes(o.v) ? '#fff' : '#666' }}>{o.l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 6 }}>Email Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EMAIL_STATUS_OPTIONS.map(o => (
                <button key={o.v} type="button" onClick={() => toggleMultiFilter('emailStatus', o.v)}
                  style={{ padding: '4px 11px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: filters.emailStatus.includes(o.v) ? '#2563eb' : '#f0f0ee', color: filters.emailStatus.includes(o.v) ? '#fff' : '#666' }}>{o.l}</button>
              ))}
            </div>
          </div>
          <button onClick={() => runSearch(1)} disabled={loading}
            style={{ padding: '9px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Searching…' : '🔍 Search Apollo'}
          </button>
        </div>
      )}
      {step === 'preview' && contacts.length > 0 && (
        <>
          {duplicates.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                {duplicates.length} contact{duplicates.length > 1 ? 's' : ''} already exist — choose what to do:
              </div>
              {duplicates.map(d => (
                <div key={d.email} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, color: '#555' }}>{d.first_name} {d.last_name} ({d.email})</span>
                  <select value={duplicateAction[d.email] || 'skip'} onChange={e => setDuplicateAction(p => ({ ...p, [d.email]: e.target.value }))} style={{ padding: '5px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 12 }}>
                    <option value="skip">Skip</option>
                    <option value="overwrite">Overwrite</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4', fontSize: 13, fontWeight: 600, color: '#111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Preview — {contacts.length} of {totalContacts} contacts</span>
              {totalContacts > 50 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button disabled={page===1} onClick={()=>mode==='search'?runSearch(page-1):loadContacts(selectedList,page-1)} style={{ padding:'3px 10px',border:'1px solid #e0e0e0',borderRadius:6,fontSize:12,cursor:page===1?'not-allowed':'pointer',opacity:page===1?0.4:1 }}>Prev</button>
                  <span style={{ fontSize: 12, color: '#888' }}>Page {page}</span>
                  <button disabled={contacts.length<50} onClick={()=>mode==='search'?runSearch(page+1):loadContacts(selectedList,page+1)} style={{ padding:'3px 10px',border:'1px solid #e0e0e0',borderRadius:6,fontSize:12,cursor:contacts.length<50?'not-allowed':'pointer',opacity:contacts.length<50?0.4:1 }}>Next</button>
                </div>
              )}
            </div>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
              <thead><tr style={{ background:'#f9f9f7' }}>{['Name','Title','Company','Email','Status'].map(h=><th key={h} style={{ padding:'8px 12px',textAlign:'left',fontSize:11,color:'#999',fontWeight:500,borderBottom:'0.5px solid #e8e8e4' }}>{h}</th>)}</tr></thead>
              <tbody>
                {contacts.map((c,i)=>{
                  const isDup=c.email&&dupEmails.has(c.email);
                  const action=isDup?duplicateAction[c.email]:null;
                  return (<tr key={i} style={{ borderBottom:'0.5px solid #f5f5f3',opacity:action==='skip'?0.45:1 }}>
                    <td style={{ padding:'9px 12px',fontWeight:500 }}>{c.first_name} {c.last_name}</td>
                    <td style={{ padding:'9px 12px',color:'#666' }}>{c.title||'—'}</td>
                    <td style={{ padding:'9px 12px',color:'#666' }}>{c.organization?.name||'—'}</td>
                    <td style={{ padding:'9px 12px',color:c.email?'#111':'#ccc' }}>{c.email||'No email'}</td>
                    <td style={{ padding:'9px 12px' }}>
                      {isDup?<span style={{ fontSize:11,padding:'2px 8px',borderRadius:10,background:action==='skip'?'#f3f4f6':'#fef3c7',color:action==='skip'?'#888':'#92400e',fontWeight:500 }}>{action==='skip'?'Skip':'Overwrite'}</span>
                        :<span style={{ fontSize:11,padding:'2px 8px',borderRadius:10,background:'#dcfce7',color:'#15803d',fontWeight:500 }}>New</span>}
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{ background:'#fff',border:'0.5px solid #e8e8e4',borderRadius:12,padding:20,marginBottom:16 }}>
            <div style={{ fontSize:14,fontWeight:600,color:'#111',marginBottom:14 }}>Import Options</div>
            {!isOwner && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12,color:'#666',display:'block',marginBottom:6 }}>Assign to</label>
                <select value={selectedSdr} onChange={e=>setSelectedSdr(e.target.value)} style={{ padding:'9px 12px',border:'1px solid #e0e0e0',borderRadius:8,fontSize:13,width:280 }}>
                  <option value="">Select owner…</option>
                  {sdrs.map(s=><option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
                </select>
              </div>
            )}
            <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13 }}>
              <input type="checkbox" checked={enrichEmails} onChange={e=>setEnrichEmails(e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }} />
              <span><strong>Enrich missing emails</strong><span style={{ color:'#888',marginLeft:6 }}>— Uses Apollo credits ({contacts.filter(c=>!c.email).length} without email)</span></span>
            </label>
          </div>
          <button onClick={runImport} disabled={!isOwner&&!selectedSdr}
            style={{ padding:'10px 28px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:(!isOwner&&!selectedSdr)?'not-allowed':'pointer',opacity:(!isOwner&&!selectedSdr)?0.6:1 }}>
            Import {toImportCount} contacts
          </button>
        </>
      )}
      {step==='checking-accounts'&&(
        <div style={{ background:'#fff',border:'0.5px solid #e8e8e4',borderRadius:12,padding:32,textAlign:'center' }}>
          <div style={{ fontSize:14,color:'#888' }}>Checking accounts…</div>
        </div>
      )}
      {step==='reviewing-accounts'&&(
        <div style={{ background:'#fff',border:'0.5px solid #e8e8e4',borderRadius:12,padding:20,marginBottom:16 }}>
          <div style={{ fontSize:14,fontWeight:600,color:'#111',marginBottom:6 }}>New companies found</div>
          <div style={{ fontSize:12,color:'#888',marginBottom:14 }}>
            {newCompanies.length} compan{newCompanies.length===1?'y':'ies'} from this import don't have an account yet — matched automatically by domain where available. Select which ones to create:
          </div>
          <div style={{ maxHeight:260,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,marginBottom:16 }}>
            {newCompanies.map(nc=>(
              <label key={nc.name} style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderBottom:'1px solid #f3f4f6',cursor:'pointer',fontSize:13 }}>
                <input type="checkbox" checked={selectedNewCompanies.has(nc.name)}
                  onChange={()=>setSelectedNewCompanies(prev=>{const s=new Set(prev); s.has(nc.name)?s.delete(nc.name):s.add(nc.name); return s;})}
                  style={{ width:15,height:15,cursor:'pointer' }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500,color:'#111' }}>{nc.name}</div>
                  {nc.domain && <div style={{ fontSize:11,color:'#9ca3af' }}>{nc.domain}</div>}
                </div>
              </label>
            ))}
          </div>
          <div style={{ display:'flex',gap:10 }}>
            <button onClick={skipAccountsAndImport} style={{ padding:'9px 18px',background:'#f5f5f3',color:'#555',border:'0.5px solid #e8e8e4',borderRadius:8,fontSize:13,cursor:'pointer' }}>Skip — import contacts only</button>
            <button onClick={confirmAccountsAndImport} style={{ padding:'9px 18px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' }}>
              Create {selectedNewCompanies.size} account{selectedNewCompanies.size!==1?'s':''} & import
            </button>
          </div>
        </div>
      )}
      {step==='importing'&&(
        <div style={{ background:'#fff',border:'0.5px solid #e8e8e4',borderRadius:12,padding:32,textAlign:'center' }}>
          <div style={{ fontSize:15,fontWeight:600,color:'#111',marginBottom:12 }}>Importing contacts…</div>
          <div style={{ background:'#f0f0ee',borderRadius:99,height:8,width:'100%',maxWidth:400,margin:'0 auto 12px' }}>
            <div style={{ background:'#2563eb',borderRadius:99,height:8,width:importProgress.total?String(Math.round(importProgress.done/importProgress.total*100))+'%':'0%',transition:'width 0.2s' }} />
          </div>
          <div style={{ fontSize:13,color:'#888' }}>{importProgress.done} / {importProgress.total}</div>
        </div>
      )}
      {step==='done'&&importResults&&(
        <div style={{ background:'#fff',border:'0.5px solid #e8e8e4',borderRadius:12,padding:32,textAlign:'center' }}>
          <div style={{ fontSize:32,marginBottom:12 }}>✅</div>
          <div style={{ fontSize:16,fontWeight:600,color:'#111',marginBottom:16 }}>Import complete</div>
          <div style={{ display:'flex',gap:16,justifyContent:'center',marginBottom:24 }}>
            {[{label:'Imported',value:importResults.imported,color:'#059669'},{label:'Skipped',value:importResults.skipped,color:'#d97706'},{label:'Failed',value:importResults.failed,color:'#dc2626'}].map(m=>(
              <div key={m.label} style={{ background:'#f9f9f7',borderRadius:10,padding:'14px 24px' }}>
                <div style={{ fontSize:24,fontWeight:700,color:m.color }}>{m.value}</div>
                <div style={{ fontSize:12,color:'#888',marginTop:4 }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',gap:10,justifyContent:'center' }}>
            <button onClick={()=>{setStep('list');setContacts([]);setSelectedList(null);setImportResults(null);}}
              style={{ padding:'9px 20px',background:'#f5f5f3',color:'#555',border:'0.5px solid #e8e8e4',borderRadius:8,fontSize:13,cursor:'pointer' }}>Import another list</button>
            <a href="/contacts" style={{ padding:'9px 20px',background:'#2563eb',color:'#fff',borderRadius:8,fontSize:13,fontWeight:500,textDecoration:'none' }}>View contacts</a>
          </div>
        </div>
      )}
    </div>
  );
}
