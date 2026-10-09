import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const LEGACY_TOOLS = ['selenium','uft','tosca','soapui','qtp','silktest','winrunner','loadrunner','jmeter','rational'];
const MODERN_TOOLS = ['cypress','playwright','webdriverio','testcafe','k6','appium','detox','jest','pytest','robot framework'];
const TOOL_STATUS_OPTIONS = ['Legacy','Modern','Evaluating','Pain Point','Active'];
const TOOL_STATUS_COLORS = {
  Legacy:       { bg: '#fee2e2', color: '#dc2626' },
  Modern:       { bg: '#e0f2fe', color: '#0369a1' },
  Evaluating:   { bg: '#fef3c7', color: '#d97706' },
  'Pain Point': { bg: '#fce7f3', color: '#9d174d' },
  Active:       { bg: '#dcfce7', color: '#16a34a' },
};
const SIGNAL_DEFS = [
  { key: 'funding',          icon: '💰', label: 'Recent Funding / IPO',      color: '#059669', bg: '#d1fae5' },
  { key: 'hiringQA',         icon: '👥', label: 'Hiring QA / SDET',          color: '#7c3aed', bg: '#ede9fe' },
  { key: 'recentLaunch',     icon: '🚀', label: 'Recent Product Launch',     color: '#0891b2', bg: '#e0f2fe' },
  { key: 'leadershipChange', icon: '👤', label: 'Leadership Change',         color: '#d97706', bg: '#fef3c7' },
  { key: 'outage',           icon: '⚠️',  label: 'Outage / Quality Incident', color: '#dc2626', bg: '#fee2e2' },
  { key: 'cicd',             icon: '⚙️',  label: 'Active CI/CD Pipeline',    color: '#475569', bg: '#f1f5f9' },
];
const RESEARCH_DEFAULTS = [
  { key: 'whyTarget',  label: 'Why Target',        icon: '🎯', hint: 'why this company is a good fit for ACCELQ test automation' },
  { key: 'techStack',  label: 'Tech Stack',        icon: '🔧', hint: 'known languages, frameworks, CI/CD, cloud, testing tools' },
  { key: 'qaHiring',   label: 'QA Hiring Signals', icon: '👥', hint: 'likelihood of hiring QA/automation engineers: Low/Med/High with reason' },
  { key: 'recentNews', label: 'Recent News',       icon: '📰', hint: 'one relevant news item, funding, or digital transformation initiative' },
  { key: 'painPoints', label: 'Pain Points',       icon: '🔥', hint: 'top 2 QA/testing pain points ACCELQ solves for this company' },
];

const RESEARCH_LOCK_DAYS = 90;

function normalizeDomain(website) {
  if (!website) return '';
  return website.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0];
}

function msUntilUnlock(ts) {
  if (!ts) return 0;
  const unlockAt = new Date(ts).getTime() + RESEARCH_LOCK_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, unlockAt - Date.now());
}

function formatUnlockDate(ts) {
  const unlockAt = new Date(new Date(ts).getTime() + RESEARCH_LOCK_DAYS * 24 * 60 * 60 * 1000);
  return unlockAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const COMMON_ENTERPRISE_APPS = ['SAP','Oracle','Workday','ServiceNow','Salesforce','Microsoft Dynamics','SAP S/4HANA','Oracle EBS','PeopleSoft','Guidewire','Siebel','Veeva'];
const PITCH_TYPES = ['Salesforce','ServiceNow','SAP','Workday','Oracle','MS Dynamics','Pega','nCino','Coupa','Web','Mobile','API','Selenium','Playwright','Cypress','Testing of AI/Agents'];
const PERSONA_LIST = ['Executive / Economic Buyer','QA / Quality Leader','Engineering Leader','Automation / Technical Expert','DevOps / Transformation / Architecture','Practitioner / End User'];
const STAGE_COLORS = {
  Fresh: { bg: '#dbeafe', color: '#1d4ed8' },
  F1:    { bg: '#d1fae5', color: '#065f46' },
  F2:    { bg: '#a7f3d0', color: '#064e3b' },
  F3:    { bg: '#fef3c7', color: '#92400e' },
  F4:    { bg: '#fed7aa', color: '#92400e' },
  F5:    { bg: '#fee2e2', color: '#991b1b' },
  won:   { bg: '#dcfce7', color: '#15803d' },
  lost:  { bg: '#f1f5f9', color: '#475569' },
  bounced:      { bg: '#fce7f3', color: '#9d174d' },
  unsubscribed: { bg: '#f3f4f6', color: '#6b7280' }, cooling_off: { bg: '#f1f5f9', color: '#64748b' },
};
const AVATAR_PALETTE = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#9333ea','#16a34a','#c2410c','#0f766e'];
const SIGNAL_TYPE_COLORS = {
  'Layoffs':           { bg: '#fee2e2', color: '#dc2626' },
  'C-suite Addition':  { bg: '#d1fae5', color: '#059669' },
  'C-suite Departure': { bg: '#fef3c7', color: '#d97706' },
  'Product Launch':    { bg: '#dbeafe', color: '#1d4ed8' },
  'Funding':           { bg: '#d1fae5', color: '#059669' },
  'Acquisition':       { bg: '#ede9fe', color: '#7c3aed' },
  'Digital Transformation': { bg: '#e0f2fe', color: '#0891b2' },
  'Hiring Surge':      { bg: '#ede9fe', color: '#7c3aed' },
};

// ─── FUZZY ACCOUNT MATCH ────────────────────────────────────
function normalizeName(n) {
  return (n||'').toLowerCase()
    .replace(/\b(pvt|ltd|inc|corp|llc|limited|private|public|co|company|group|holdings|international|global)\b\.?/g,'')
    .replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
}
function fuzzyAccountMatch(a,b) {
  const na=normalizeName(a), nb=normalizeName(b);
  if(!na||!nb) return false;
  if(na===nb) return true;
  if(na.includes(nb)||nb.includes(na)) return true;
  const lo=na.length>nb.length?na:nb, sh=na.length>nb.length?nb:na;
  if(sh.length<3) return false;
  let m=0; for(let i=0;i<sh.length-1;i++) if(lo.includes(sh.substring(i,i+2))) m++;
  return m/(sh.length-1)>0.7;
}
// ─── CSV PARSER ─────────────────────────────────────────────
function parseCSVLine(line) {
  const r=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){inQ=!inQ;}
    else if(ch===','&&!inQ){r.push(cur.trim());cur='';}
    else{cur+=ch;}
  }
  r.push(cur.trim()); return r;
}
function parseCSV(text) {
  const lines=text.trim().split('\n').filter(l=>l.trim());
  if(!lines.length) return {headers:[],rows:[]};
  return {headers:parseCSVLine(lines[0]), rows:lines.slice(1).map(l=>parseCSVLine(l))};
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h = (name.charCodeAt(i) + ((h << 5) - h)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function scoreColor(s) {
  if (s >= 80) return { bg: '#dcfce7', color: '#15803d', bar: '#16a34a' };
  if (s >= 60) return { bg: '#d1fae5', color: '#065f46', bar: '#059669' };
  if (s >= 40) return { bg: '#fef3c7', color: '#92400e', bar: '#d97706' };
  return { bg: '#fee2e2', color: '#991b1b', bar: '#dc2626' };
}
function calcScore(account, contacts) {
  let score = 0;
  const sig = account.signals || {};
  const tools = account.testing_tools || [];
  if (tools.some(t => t.status === 'Legacy')) score += 30;
  else if (tools.some(t => t.status === 'Evaluating')) score += 20;
  else if (tools.length > 0) score += 15;
  if (sig.hiringQA) score += 10;
  if (sig.funding) score += 10;
  if (sig.outage) score += 8;
  if (sig.recentLaunch) score += 6;
  if (sig.leadershipChange) score += 6;
  if (sig.cicd) score += 5;
  const replied = (contacts || []).filter(c => c.response_type === 'warm' || c.response_type === 'prospect').length;
  score += Math.min(replied * 5, 15);
  const r = account.research || {};
  score += Math.min(Object.values(r).filter(v => v && typeof v === 'string' && v.length > 10).length * 2, 10);
  return Math.min(score, 100);
}
function getInitials(name) {
  return (name || '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}
function getSignalBadges(account) {
  const sig = account.signals || {};
  const tools = account.testing_tools || [];
  const badges = [];
  if (tools.some(t => t.status === 'Legacy')) badges.push({ label: '⚠️ Legacy Tool', color: '#dc2626', bg: '#fee2e2' });
  if (sig.hiringQA) badges.push({ label: '👥 Hiring QA', color: '#7c3aed', bg: '#ede9fe' });
  if (sig.funding) badges.push({ label: '💰 Funded', color: '#059669', bg: '#d1fae5' });
  if (sig.outage) badges.push({ label: '⚠️ Outage', color: '#dc2626', bg: '#fee2e2' });
  if (sig.leadershipChange) badges.push({ label: '👤 New Leader', color: '#d97706', bg: '#fef3c7' });
  return badges;
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
      background: active ? '#2563eb' : '#f0f0ee', color: active ? '#fff' : '#666', transition: 'all 0.15s',
      whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

export default function Accounts() {
  const { user, profile } = useAuth();
  const canViewAll = ['director', 'manager'].includes(profile?.role);
  const [viewAll, setViewAll] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState([]);
  const [contactsByAccount, setContactsByAccount] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [filterBy, setFilterBy] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [totalCount, setTotalCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAcct, setNewAcct] = useState({ name: '', industry: '', country: '', linkedin_url: '', revenue_millions: '' });
  const [adding, setAdding] = useState(false);
  const [acctDupCandidates, setAcctDupCandidates] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    let accountIdsScope = null;
    if (!canViewAll) {
      const { data: myContacts } = await supabase.from('contacts').select('account_id').eq('owner_id', user.id).not('account_id', 'is', null);
      accountIdsScope = [...new Set((myContacts || []).map(c => c.account_id))];
      if (accountIdsScope.length === 0) {
        setAccounts([]);
        setTotalCount(0);
        setContactsByAccount({});
        setLoading(false);
        return;
      }
    }

    // Filtering, search, sorting, and paging all happen server-side against the
    // accounts_with_stats view, which precomputes score/contact_count/signal flags
    // so we never pull the whole accounts or contacts table into the browser.
    let q = supabase.from('accounts_with_stats').select('*', { count: 'exact' });
    if (accountIdsScope) q = q.in('id', accountIdsScope);

    if (filterBy === 'legacy') q = q.eq('has_legacy_tool', true);
    if (filterBy === 'hiring') q = q.eq('is_hiring_qa', true);
    if (filterBy === 'funded') q = q.eq('is_funded', true);
    if (filterBy === 'signals') q = q.or('has_legacy_tool.eq.true,is_hiring_qa.eq.true,is_funded.eq.true,has_outage.eq.true,has_leadership_change.eq.true');
    if (filterBy === 'notes') q = q.eq('has_notes', true);

    if (search) {
      const s = `%${search}%`;
      q = q.or(`name.ilike.${s},industry.ilike.${s},country.ilike.${s}`);
    }

    if (sortBy === 'score') q = q.order('score', { ascending: false });
    else if (sortBy === 'contacts') q = q.order('contact_count', { ascending: false });
    else q = q.order('name', { ascending: true });

    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const { data, count } = await q;
    const accs = data || [];
    setAccounts(accs);
    setTotalCount(count || 0);

    // Only fetch contacts for the accounts actually shown on this page
    // (used for badges, reply counts, and the detail panel).
    const pageIds = accs.map(a => a.id);
    if (pageIds.length > 0) {
      let contactQuery = supabase.from('contacts').select('*').in('account_id', pageIds);
      if (!canViewAll) contactQuery = contactQuery.eq('owner_id', user.id);
      const { data: pageContacts } = await contactQuery;
      const byAcct = {};
      (pageContacts || []).forEach(c => {
        if (c.account_id) { if (!byAcct[c.account_id]) byAcct[c.account_id] = []; byAcct[c.account_id].push(c); }
      });
      setContactsByAccount(byAcct);
    } else {
      setContactsByAccount({});
    }
    setLoading(false);
  }, [user.id, canViewAll, filterBy, search, sortBy, page]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [filterBy, search, sortBy]);
  useEffect(() => {
    if (location.state?.selectId) { setSelectedId(location.state.selectId); window.history.replaceState({}, ''); }
  }, [location.state]);
  // If a selected account isn't on the current page (e.g. deep-linked or
  // selected before a filter/search change moved it off-page), fetch it
  // individually so the detail panel still opens.
  useEffect(() => {
    if (!selectedId) return;
    if (accounts.some(a => a.id === selectedId)) return;
    (async () => {
      const { data: acc } = await supabase.from('accounts_with_stats').select('*').eq('id', selectedId).maybeSingle();
      if (acc) {
        setAccounts(prev => prev.some(a => a.id === acc.id) ? prev : [acc, ...prev]);
        const { data: cts } = await supabase.from('contacts').select('*').eq('account_id', selectedId);
        setContactsByAccount(prev => ({ ...prev, [selectedId]: cts || [] }));
      }
    })();
  }, [selectedId, accounts]);

  async function addAccount(force=false) {
    if (!newAcct.name.trim()) return;
    if (!force) {
      const sim=accounts.filter(a=>fuzzyAccountMatch(a.name,newAcct.name.trim()));
      if(sim.length>0){setAcctDupCandidates(sim);return;}
    }
    setAdding(true);
    // Upsert on (owner_id, name) so this can't create a duplicate if the
    // fuzzy check above was bypassed with force=true on an exact-name match.
    const { data } = await supabase.from('accounts').upsert({
      name: newAcct.name.trim(), industry: newAcct.industry || null, country: newAcct.country || null,
      linkedin_url: newAcct.linkedin_url || null,
      revenue_millions: newAcct.revenue_millions ? parseFloat(newAcct.revenue_millions) : null,
      owner_id: user.id,
    }, { onConflict: 'owner_id,name' }).select().single();
    setAdding(false); setShowAddAccount(false);
    setNewAcct({ name: '', industry: '', country: '', linkedin_url: '', revenue_millions: '' });
    await fetchAll();
    if (data) setSelectedId(data.id);
  }

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'legacy', label: '⚠️ Legacy' },
    { key: 'hiring', label: '👥 Hiring QA' },
    { key: 'funded', label: '💰 Funded' },
    { key: 'signals', label: '📡 Signals' },
    { key: 'notes', label: '📝 Notes' },
  ];

  // Filtering, search, and sorting now happen server-side in fetchAll (see above)
  // against accounts_with_stats, so 'accounts' is already the correct page of results.
  const filtered = accounts;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const selected = accounts.find(a => a.id === selectedId) || null;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#f8f9fb' }}>

      {/* LEFT PANEL */}
      <div style={{ width: 300, minWidth: 260, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '16px 14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', letterSpacing: '-0.2px' }}>
                  {viewAll && canViewAll ? 'All Accounts' : 'Accounts'}
                </div>
                {canViewAll && (
                  <button onClick={() => setViewAll(v => !v)}
                    style={{ padding: '2px 8px', borderRadius: 20, border: '1px solid #e0e0e0',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      background: viewAll ? '#111' : '#fff', color: viewAll ? '#fff' : '#555' }}>
                    {viewAll ? 'Team' : 'All'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{filtered.length} of {accounts.length} companies</div>
            </div>
            <button onClick={() => setShowAddAccount(true)} style={{
              padding: '6px 14px', background: '#2563eb', color: '#fff', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', letterSpacing: '0.01em',
            }}>+ Add</button>
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', pointerEvents: 'none' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…"
              style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#f9fafb', color: '#111' }} />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb',
            background: '#f9fafb', cursor: 'pointer', color: '#555', marginBottom: 10,
          }}>
            <option value="score">↕ Sort by Score</option>
            <option value="contacts">↕ Sort by Contacts</option>
            <option value="name">↕ Sort A–Z</option>
          </select>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {FILTERS.map(f => <FilterPill key={f.key} label={f.label} active={filterBy === f.key} onClick={() => setFilterBy(f.key)} />)}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #f3f4f6' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No accounts found</div>
          ) : filtered.map(a => {
            const ctcs = contactsByAccount[a.id] || [];
            const score = calcScore(a, ctcs);
            const sc = scoreColor(score);
            const isSelected = a.id === selectedId;
            const ac = avatarColor(a.name);
            const signals = a.signals || {};
            const activeSignalCount = SIGNAL_DEFS.filter(s => signals[s.key]).length;
            return (
              <div key={a.id} onClick={() => setSelectedId(a.id)} style={{
                padding: '11px 14px', cursor: 'pointer',
                borderBottom: '1px solid #f3f4f6',
                background: isSelected ? '#eff6ff' : 'white',
                borderLeft: `3px solid ${isSelected ? '#2563eb' : 'transparent'}`,
                transition: 'background 0.1s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: ac, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, letterSpacing: '0.5px' }}>
                    {getInitials(a.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {ctcs.length} contact{ctcs.length !== 1 ? 's' : ''}
                      {a.industry ? ` · ${a.industry}` : ''}
                      {a.country ? ` · ${a.country}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sc.color }}>{score}</div>
                    <div style={{ width: 28, height: 3, borderRadius: 2, background: '#f0f0f0', marginTop: 2 }}>
                      <div style={{ width: `${score}%`, height: '100%', borderRadius: 2, background: sc.bar }} />
                    </div>
                  </div>
                </div>
                {(activeSignalCount > 0 || a.revenue_millions) && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 7, marginLeft: 46, flexWrap: 'wrap' }}>
                    {SIGNAL_DEFS.filter(s => signals[s.key]).slice(0, 3).map(s => (
                      <span key={s.key} style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: s.bg, color: s.color }}>{s.icon} {s.label.split('/')[0].trim()}</span>
                    ))}
                    {a.revenue_millions && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 8, background: '#f0f9ff', color: '#0369a1' }}>
                        ${Number(a.revenue_millions).toLocaleString()}M
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 11, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#ccc' : '#555' }}>‹ Prev</button>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Page {page} of {totalPages} · {totalCount} accounts</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 11, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#ccc' : '#555' }}>Next ›</button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8f9fb' }}>
        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>Select an account</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>or click + Add to create one</div>
          </div>
        ) : (
          <AccountDetail key={selected.id} account={selected} contacts={contactsByAccount[selected.id] || []} onUpdate={fetchAll} navigate={navigate} />
        )}
      </div>

      {/* ADD ACCOUNT MODAL */}
      {showAddAccount && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && setShowAddAccount(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: '#111' }}>Add Account</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'name', label: 'Company Name *', placeholder: 'e.g. Infosys' },
                { key: 'industry', label: 'Industry', placeholder: 'e.g. Banking, Insurance' },
                { key: 'country', label: 'Country', placeholder: 'e.g. India' },
                { key: 'linkedin_url', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/company/…' },
                { key: 'revenue_millions', label: 'Revenue (USD millions)', placeholder: 'e.g. 1500' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 5, fontWeight: 500 }}>{f.label}</label>
                  <input value={newAcct[f.key]} onChange={e => setNewAcct({ ...newAcct, [f.key]: e.target.value })} placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s' }}
                    onFocus={e => e.target.style.borderColor = '#2563eb'}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button onClick={addAccount} disabled={adding || !newAcct.name.trim()} style={{
                flex: 1, padding: '10px 0', background: '#2563eb', color: '#fff', borderRadius: 9, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', border: 'none', opacity: adding || !newAcct.name.trim() ? 0.6 : 1,
              }}>{adding ? 'Adding…' : 'Add Account'}</button>
              <button onClick={() => setShowAddAccount(false)} style={{
                padding: '10px 20px', background: '#f5f5f5', color: '#555', borderRadius: 9, fontSize: 13, cursor: 'pointer', border: 'none',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  ACCOUNT DETAIL                                            */
/* ─────────────────────────────────────────────────────────── */
function AccountDetail({ account, contacts, onUpdate, navigate }) {
  const { user, profile } = useAuth();
  const canViewAll = ['director', 'manager'].includes(profile?.role);
  const [data, setData] = useState(account);
  const [qualifying, setQualifying] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editingLinkedIn, setEditingLinkedIn] = useState(false);
  const [linkedInDraft, setLinkedInDraft] = useState(account.linkedin_url || '');
  const [researchGenerating, setResearchGenerating] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [aiResearching, setAiResearching] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolStatus, setNewToolStatus] = useState('Legacy');
  const [showAddTool, setShowAddTool] = useState(false);
  const [newEnterpriseApp, setNewEnterpriseApp] = useState('');
  const [showAddEnterprise, setShowAddEnterprise] = useState(false);
  const [newSaasApp, setNewSaasApp] = useState('');
  const [showAddSaas, setShowAddSaas] = useState(false);
  const [newCustomSection, setNewCustomSection] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [contactNotesMap, setContactNotesMap] = useState({});
  const [companyNotesList, setCompanyNotesList] = useState([]);
  const [newCompanyNoteText, setNewCompanyNoteText] = useState('');
  const [savingCompanyNote, setSavingCompanyNote] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [editingCompanyDetails, setEditingCompanyDetails] = useState(false);
  const [companyDetailsDraft, setCompanyDetailsDraft] = useState({
    founded_year: account.founded_year || '',
    ticker: account.ticker || '',
    parent_company: account.parent_company || '',
    industry: account.industry || '',
    country: account.country || '',
    revenue_millions: account.revenue_millions || '',
    employee_count: account.employee_count || '',
    website: account.website || '',
    headquarters: account.headquarters || '',
  });
  // ── Contact add / CSV import ──
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({first_name:'',last_name:'',title:'',email:'',linkedin_url:'',pitch:'',notes:''});
  const [addingContact, setAddingContact] = useState(false);
  const [contactDupWarning, setContactDupWarning] = useState(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvStep, setCsvStep] = useState(1);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [csvDuplicates, setCsvDuplicates] = useState([]);
  const [csvCleanRows, setCsvCleanRows] = useState([]);
  const [csvDupDecisions, setCsvDupDecisions] = useState({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState(null);
  // ── LinkedIn inline edit ──
  const [editLI4Contact, setEditLI4Contact] = useState(null);
  // ── Quick contact note popover ──
  const [notePopover, setNotePopover] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [enrichingContact, setEnrichingContact] = useState(null);
  const [selectedEnrich, setSelectedEnrich] = useState(new Set());
  const [bulkEnriching, setBulkEnriching] = useState(null);
  const [liDraft, setLiDraft] = useState('');
  const [savedLinkedInUrls, setSavedLinkedInUrls] = useState({});

  const score = calcScore(data, contacts);
  const sc = scoreColor(score);
  const ac = avatarColor(data.name);
  const linkedInGuess = data.linkedin_url || `https://linkedin.com/company/${(data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  const tools = data.testing_tools || [];
  const eApps = data.enterprise_apps || [];
  const saasApps = data.saas_apps || [];
  const signals = data.signals || {};
  const research = data.research || {};
  const customResearch = data.custom_research || [];

  const aiSignals = Array.isArray(research.ai_signals) ? research.ai_signals : [];
  const importantToKnow = Array.isArray(research.important_to_know) ? research.important_to_know : [];
  const industries = Array.isArray(research.industries) ? research.industries : [];
  const productServices = Array.isArray(research.products_services) ? research.products_services : [];

  const fullLockMs = msUntilUnlock(data.research_meta?.full);
  const fullLocked = fullLockMs > 0;
  const fullUnlockDate = fullLocked ? formatUnlockDate(data.research_meta.full) : null;
  const allResearchGenerated = RESEARCH_DEFAULTS.every(r => research[r.key] && String(research[r.key]).trim());

  async function findDomainSiblings() {
    const domain = normalizeDomain(data.website);
    if (!domain) return [];
    const { data: rows } = await supabase.from('accounts').select('id, website, research, research_meta').neq('id', data.id);
    return (rows || []).filter(r => normalizeDomain(r.website) === domain);
  }

  async function syncResearchAcrossDomain(metaKey, researchPatch, ts) {
    const siblings = await findDomainSiblings();
    for (const sib of siblings) {
      const mergedResearch = { ...(sib.research || {}), ...researchPatch };
      const mergedMeta = { ...(sib.research_meta || {}), [metaKey]: ts };
      await supabase.from('accounts').update({ research: mergedResearch, research_meta: mergedMeta, updated_at: new Date().toISOString() }).eq('id', sib.id);
    }
  }

  async function patch(updates) {
    setSaving(true);
    const merged = { ...data, ...updates };
    setData(merged);
   const { error: patchErr } =  await supabase.from('accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', data.id);
    if (patchErr) console.error('patch error:', patchErr);
setSaving(false);
    onUpdate();
  }
  async function addTool() {
    if (!newToolName.trim()) return;
    await patch({ testing_tools: [...tools, { tool: newToolName.trim(), status: newToolStatus, addedAt: new Date().toISOString().slice(0, 10) }] });
    setNewToolName(''); setShowAddTool(false);
  }
  async function removeTool(idx) { await patch({ testing_tools: tools.filter((_, i) => i !== idx) }); }
  async function updateToolStatus(idx, status) { await patch({ testing_tools: tools.map((t, i) => i === idx ? { ...t, status } : t) }); }
  async function addEnterpriseApp(name) {
    if (!name.trim() || eApps.find(a => a.app.toLowerCase() === name.toLowerCase())) return;
    await patch({ enterprise_apps: [...eApps, { app: name.trim(), addedAt: new Date().toISOString().slice(0, 10) }] });
    setNewEnterpriseApp(''); setShowAddEnterprise(false);
  }
  async function removeEnterpriseApp(idx) { await patch({ enterprise_apps: eApps.filter((_, i) => i !== idx) }); }
  async function addSaasApp() {
    if (!newSaasApp.trim() || saasApps.find(a => a.app.toLowerCase() === newSaasApp.toLowerCase())) return;
    await patch({ saas_apps: [...saasApps, { app: newSaasApp.trim(), addedAt: new Date().toISOString().slice(0, 10) }] });
    setNewSaasApp(''); setShowAddSaas(false);
  }
  async function removeSaasApp(idx) { await patch({ saas_apps: saasApps.filter((_, i) => i !== idx) }); }
  async function toggleSignal(key) { await patch({ signals: { ...signals, [key]: !signals[key] } }); }
  async function saveResearch(key, value) { await patch({ research: { ...research, [key]: value } }); }
  async function addCustomSection() {
    if (!newCustomSection.trim()) return;
    await patch({ custom_research: [...customResearch, { key: `custom_${Date.now()}`, label: newCustomSection.trim(), value: '' }] });
    setNewCustomSection(''); setShowAddCustom(false);
  }
  async function removeCustomSection(idx) { await patch({ custom_research: customResearch.filter((_, i) => i !== idx) }); }
  async function saveCustomResearch(idx, value) { await patch({ custom_research: customResearch.map((s, i) => i === idx ? { ...s, value } : s) }); }
  const fetchCompanyNotes = useCallback(async () => {
    const { data: cn } = await supabase.from('company_notes').select('*, profiles(full_name)').eq('company_name', data.name).order('created_at', { ascending: false });
    setCompanyNotesList(cn || []);
  }, [data.name]);
  useEffect(() => { fetchCompanyNotes(); }, [fetchCompanyNotes]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase.from('accounts').select('research_meta').eq('id', account.id).maybeSingle();
      if (!cancelled) setData(d => ({ ...d, research_meta: row?.research_meta || {} }));
    })();
    return () => { cancelled = true; };
  }, [account.id]);
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
  async function addCompanyNote() {
    if (!newCompanyNoteText.trim()) return;
    setSavingCompanyNote(true);
    await supabase.from('company_notes').insert({ company_name: data.name, author_id: user.id, body: newCompanyNoteText.trim() });
    setNewCompanyNoteText('');
    setSavingCompanyNote(false);
    fetchCompanyNotes();
  }
  async function saveLinkedIn() { await patch({ linkedin_url: linkedInDraft }); setEditingLinkedIn(false); }
  async function saveCompanyDetails() {
    const updates = {};
    if (companyDetailsDraft.founded_year) updates.founded_year = parseInt(companyDetailsDraft.founded_year) || null;
    else updates.founded_year = null;
    updates.ticker = companyDetailsDraft.ticker || null;
    updates.parent_company = companyDetailsDraft.parent_company || null;
    updates.industry = companyDetailsDraft.industry || null;
    updates.country = companyDetailsDraft.country || null;
    updates.revenue_millions = companyDetailsDraft.revenue_millions ? (parseFloat(companyDetailsDraft.revenue_millions) || null) : null;
    updates.employee_count = companyDetailsDraft.employee_count ? (parseInt(companyDetailsDraft.employee_count) || null) : null;
    updates.website = companyDetailsDraft.website || null;
    updates.headquarters = companyDetailsDraft.headquarters || null;
    await patch(updates);
    setEditingCompanyDetails(false);
  }

  async function updateContactPitchType(cId, pt) {
    const val = pt === '' ? null : pt;
    await supabase.from('contacts').update({ pitch_type: val }).eq('id', cId);
    onUpdate();
  }

  async function updateContactPersona(cId, ps) {
    const val = ps === '' ? null : ps;
    await supabase.from('contacts').update({ persona: val }).eq('id', cId);
    onUpdate();
  }

  async function saveContactNote(c) {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    await supabase.from('contact_notes').insert({
      contact_id: c.id,
      author_id: user.id,
      body: noteDraft.trim(),
    });
    setSavingNote(false);
    setNoteDraft('');
    setNotePopover(null);
    onUpdate();
  }
  async function deleteContact(contactId) {
    const { error } = await supabase.from('contacts').delete().eq('id', contactId).eq('owner_id', user.id);
    if (error) {
      alert('Could not delete contact: ' + error.message);
      return;
    }
    setDeleteConfirm(null);
    onUpdate();
  }

  async function startContact(c) {
    setQualifying(c.id);
    const now = new Date().toISOString();
    await supabase.from('contacts').update({
      status: 'Fresh',
      next_followup: now,
    }).eq('id', c.id);
    await supabase.from('activity_log').insert({
      actor_id: user.id, contact_id: c.id,
      activity_type: 'outreach_started', details: { started_from: 'accounts' }
    });
    setQualifying(null);
    onUpdate();
  }

  async function generateResearch(key, label) {
    if (msUntilUnlock(data.research_meta?.[key]) > 0) return;
    setResearchGenerating(g => ({ ...g, [key]: true }));
    try {
      // Domain-level cache: reuse a sibling account's fresh research instead of
      // burning another AI call when the same company already has it.
      const siblings = await findDomainSiblings();
      let freshSibling = null;
      for (const sib of siblings) {
        const ts = sib.research_meta?.[key];
        if (ts && msUntilUnlock(ts) > 0 && (!freshSibling || new Date(ts) > new Date(freshSibling.research_meta[key]))) freshSibling = sib;
      }
      if (freshSibling && freshSibling.research?.[key]) {
        const ts = freshSibling.research_meta[key];
        await patch({ research: { ...research, [key]: freshSibling.research[key] }, research_meta: { ...(data.research_meta || {}), [key]: ts } });
        setResearchGenerating(g => ({ ...g, [key]: false }));
        return;
      }
      const result = await supabase.functions.invoke('generate-research', {
        body: { account: { name: data.name, industry: data.industry, country: data.country, revenue_millions: data.revenue_millions, signals: data.signals, testing_tools: data.testing_tools }, sectionKey: key, sectionLabel: label }
      });
      if (!result.error && result.data?.text) {
        const ts = new Date().toISOString();
        await patch({ research: { ...research, [key]: result.data.text }, research_meta: { ...(data.research_meta || {}), [key]: ts } });
        await syncResearchAcrossDomain(key, { [key]: result.data.text }, ts);
      }
    } catch(e) { console.error(e); }
    setResearchGenerating(g => ({ ...g, [key]: false }));
  }

  async function generateAll() {
    for (const r of RESEARCH_DEFAULTS) {
      if (!research[r.key]) await generateResearch(r.key, r.label);
    }
  }

  async function runFullAIResearch() {
    if (msUntilUnlock(data.research_meta?.full) > 0) return;
    setAiResearching(true);
    try {
      // Domain-level cache: reuse a sibling account's fresh full research
      // instead of burning another AI call when the same company already has it.
      const siblings = await findDomainSiblings();
      let freshSibling = null;
      for (const sib of siblings) {
        const ts = sib.research_meta?.full;
        if (ts && msUntilUnlock(ts) > 0 && (!freshSibling || new Date(ts) > new Date(freshSibling.research_meta.full))) freshSibling = sib;
      }
      if (freshSibling) {
        const ts = freshSibling.research_meta.full;
        await patch({ research: { ...(freshSibling.research || {}) }, research_meta: { ...(data.research_meta || {}), full: ts } });
        setAiResearching(false);
        return;
      }

      const result = await supabase.functions.invoke('generate-research', {
        body: {
          mode: 'full',
          account: {
            name: data.name,
            industry: data.industry,
            country: data.country,
            headquarters: data.headquarters,
            website: data.website,
            annual_revenue: data.annual_revenue,
            revenue_millions: data.revenue_millions,
            employees: data.employees,
            employee_count: data.employee_count,
            notes: data.notes,
            testing_tools: data.testing_tools,
            contacts: contacts.slice(0, 5).map(c => ({ full_name: (c.first_name + ' ' + (c.last_name || '')).trim(), title: c.title })),
          }
        }
      });
      if (result.error || !result.data?.full) {
        console.error('AI Research error:', result.error || result.data?.error);
        setAiResearching(false);
        return;
      }
      const r = result.data.full;
      const updates = {};
      const newResearch = { ...research };

      // Research text sections
      if (r.why)      newResearch.whyTarget  = r.why;
      if (r.tech)     newResearch.techStack   = r.tech;
      if (r.qaHiring) newResearch.qaHiring    = r.qaHiring;
      if (r.news)     newResearch.recentNews  = r.news;
      if (r.pain)     newResearch.painPoints  = r.pain;

      // New company intel fields
      if (r.founded_year)           updates.founded_year   = r.founded_year;
      if (r.ticker)                 updates.ticker          = r.ticker;
      if (r.parent_company)         updates.parent_company  = r.parent_company;
      if (r.funding_total)          newResearch.funding_total          = r.funding_total;
      if (r.funding_last_round)     newResearch.funding_last_round     = r.funding_last_round;
      if (r.funding_last_round_date) newResearch.funding_last_round_date = r.funding_last_round_date;
      if (r.is_public !== undefined) newResearch.is_public = r.is_public;
      if (Array.isArray(r.industries) && r.industries.length > 0)          newResearch.industries        = r.industries;
      if (Array.isArray(r.products_services) && r.products_services.length > 0) newResearch.products_services = r.products_services;
      if (r.sic_code)               newResearch.sic_code   = r.sic_code;
      if (r.naics_code)             newResearch.naics_code = r.naics_code;
      if (Array.isArray(r.signals) && r.signals.length > 0)                newResearch.ai_signals        = r.signals;
      if (Array.isArray(r.important_to_know) && r.important_to_know.length > 0) newResearch.important_to_know = r.important_to_know;
      if (Array.isArray(r.similar_companies) && r.similar_companies.length > 0) newResearch.similar_companies = r.similar_companies;

      // Company Details auto-fill (only if currently empty)
if (r.detectedIndustry && !data.industry) updates.industry = r.detectedIndustry;
if (r.hq_country && !data.country) updates.country = r.hq_country;
if (r.website && !data.website) updates.website = r.website;
      if (r.headquarters && !data.headquarters) updates.headquarters = r.headquarters;
if (r.employee_count_range && !data.employee_count) updates.employee_count = r.employee_count_range;
      if (r.about)                newResearch.about                = r.about;
      if (r.businessModel)         newResearch.businessModel        = r.businessModel;
      if (r.strategicPriorities)   newResearch.strategicPriorities  = r.strategicPriorities;
      // Build important_to_know bullets as fallback only if Sonnet did not return them
      if (!Array.isArray(newResearch.important_to_know) || newResearch.important_to_know.length === 0) {
        const itk = [];
        if (r.why) itk.push({ title: 'Why Target', body: r.why });
        if (r.tech) itk.push({ title: 'Tech Stack', body: r.tech });
        if (r.qaHiring) itk.push({ title: 'QA Hiring', body: r.qaHiring });
        if (r.news) itk.push({ title: 'Recent News', body: r.news });
        if (r.pain) itk.push({ title: 'Pain Points', body: r.pain });
        if (itk.length > 0) newResearch.important_to_know = itk;
      }
      // Build ai_signals
      const today = new Date().toISOString().slice(0, 10);
      const sigs = [];
      if (r.funding) sigs.push({ type: 'Funding', text: 'Company recently raised funding or had IPO activity.', date: today });
      if (r.hiringQA) sigs.push({ type: 'Hiring Surge', text: 'Actively hiring QA and automation engineers.', date: today });
      if (r.launch) sigs.push({ type: 'Product Launch', text: 'Recently launched a major product or feature.', date: today });
      if (r.leadership) sigs.push({ type: 'C-suite Addition', text: 'Recent leadership change in engineering or technology.', date: today });
      if (r.cicd) sigs.push({ type: 'Digital Transformation', text: 'Active CI/CD pipeline culture and digital transformation.', date: today });
      if (sigs.length > 0) newResearch.ai_signals = sigs;
      // Map detectedIndustry to industry field for Company Details
      if (r.detectedIndustry && !data.industry) updates.industry = r.detectedIndustry;

      updates.research = newResearch;

      // Testing tools — merge
      if (Array.isArray(r.tools) && r.tools.length > 0) {
        const existingNames = (data.testing_tools || []).map(t => t.tool.toLowerCase());
        const newTools = r.tools
          .filter(t => !existingNames.includes(t.toLowerCase()))
          .map(t => ({ tool: t, status: MODERN_TOOLS.includes(t.toLowerCase()) ? 'Modern' : LEGACY_TOOLS.includes(t.toLowerCase()) ? 'Legacy' : 'Active', addedAt: new Date().toISOString().slice(0, 10), source: 'ai' }));
        if (newTools.length > 0) updates.testing_tools = [...(data.testing_tools || []), ...newTools];
      }
      // Enterprise apps — merge
      if (Array.isArray(r.enterpriseApps) && r.enterpriseApps.length > 0) {
        const existingApps = (data.enterprise_apps || []).map(a => a.app.toLowerCase());
        const newApps = r.enterpriseApps
          .filter(a => !existingApps.includes(a.toLowerCase()))
          .map(a => ({ app: a, addedAt: new Date().toISOString().slice(0, 10), source: 'ai' }));
        if (newApps.length > 0) updates.enterprise_apps = [...(data.enterprise_apps || []), ...newApps];
      }
      // SaaS apps — merge
      if (Array.isArray(r.saasApps) && r.saasApps.length > 0) {
        const existingSaas = (data.saas_apps || []).map(a => a.app.toLowerCase());
        const newSaas = r.saasApps
          .filter(a => !existingSaas.includes(a.toLowerCase()))
          .map(a => ({ app: a, addedAt: new Date().toISOString().slice(0, 10), source: 'ai' }));
        if (newSaas.length > 0) updates.saas_apps = [...(data.saas_apps || []), ...newSaas];
      }
      // Intent signals — merge (only set true)
      const sigMap = { funding: 'funding', hiringQA: 'hiringQA', launch: 'recentLaunch', leadership: 'leadershipChange', outage: 'outage', cicd: 'cicd' };
      const newSignals = { ...signals };
      let signalsChanged = false;
      for (const [aiKey, sigKey] of Object.entries(sigMap)) {
        if (r[aiKey] === true && !newSignals[sigKey]) { newSignals[sigKey] = true; signalsChanged = true; }
      }
      if (signalsChanged) updates.signals = newSignals;

      const ts = new Date().toISOString();
      const sectionMeta = {};
      RESEARCH_DEFAULTS.forEach(rd => { if (newResearch[rd.key]) sectionMeta[rd.key] = ts; });
      updates.research_meta = { ...(data.research_meta || {}), full: ts, ...sectionMeta };
      await patch(updates);
      await syncResearchAcrossDomain('full', newResearch, ts);
      for (const key of Object.keys(sectionMeta)) {
        await syncResearchAcrossDomain(key, { [key]: newResearch[key] }, ts);
      }
    } catch(e) { console.error('runFullAIResearch error:', e); }
    setAiResearching(false);
  }


  // ── Add contact manually ──
  async function saveNewContact(forceOverwrite=false) {
    if(!newContact.first_name.trim()) return;
    setAddingContact(true);
    if(newContact.email && !forceOverwrite) {
      const dup=contacts.find(ct=>ct.email&&ct.email.toLowerCase()===newContact.email.toLowerCase());
      if(dup){setContactDupWarning(dup);setAddingContact(false);return;}
    }
    const payload={first_name:newContact.first_name.trim(),last_name:newContact.last_name.trim()||null,
      title:newContact.title.trim()||null,email:newContact.email.trim()||null,
      linkedin_url:newContact.linkedin_url.trim()||null,pitch:newContact.pitch.trim()||null,
      account_id:data.id,owner_id:user.id,status:'Fresh'};
    const noteText=newContact.notes.trim();
    let targetContactId=null;
    if(forceOverwrite&&newContact.email){
      const dup=contacts.find(ct=>ct.email&&ct.email.toLowerCase()===newContact.email.toLowerCase());
      if(dup){ await supabase.from('contacts').update(payload).eq('id',dup.id); targetContactId=dup.id; }
      else { const{data:ins}=await supabase.from('contacts').insert(payload).select('id').single(); targetContactId=ins?.id; }
    } else { const{data:ins}=await supabase.from('contacts').insert(payload).select('id').single(); targetContactId=ins?.id; }
    // Notes go into contact_notes (the same note history shown in ContactDetail),
    // not a separate single field, so they show up wherever notes are read.
    if(noteText&&targetContactId) await supabase.from('contact_notes').insert({contact_id:targetContactId,author_id:user.id,body:noteText});
    setAddingContact(false);setShowAddContact(false);setContactDupWarning(null);
    setNewContact({first_name:'',last_name:'',title:'',email:'',linkedin_url:'',pitch:'',notes:''});
    onUpdate();
  }
  // ── CSV helpers ──
  function handleCsvFile(file) {
    const reader=new FileReader();
    reader.onload=(e)=>{
      const {headers,rows}=parseCSV(e.target.result);
      setCsvHeaders(headers);setCsvRows(rows);
      const auto={};
      const aliases={first_name:['first name','firstname','first','fname'],last_name:['last name','lastname','last','lname','surname'],
        title:['title','job title','position','role'],email:['email','email address','e-mail'],
        linkedin_url:['linkedin','linkedin url','linkedin profile'],phone:['phone','mobile'],
        pitch:['pitch','pitch type'],notes:['notes','note','comments']};
      headers.forEach((h,i)=>{const n=h.toLowerCase().trim();for(const[f,al]of Object.entries(aliases)){if(al.includes(n)){auto[i]=f;break;}}});
      setColumnMapping(auto);setCsvStep(2);
    };
    reader.readAsText(file);
  }
  async function runCsvImport() {
    setCsvImporting(true);
    const FIELDS=['first_name','last_name','title','email','linkedin_url','phone','pitch','notes'];
    const mapped=csvRows.map(row=>{
      const obj={};
      Object.entries(columnMapping).forEach(([ci,f])=>{if(f&&FIELDS.includes(f))obj[f]=(row[parseInt(ci)]||'').trim();});
      return obj;
    }).filter(r=>r.first_name);
    const exEmails=contacts.reduce((m,ct)=>{if(ct.email)m[ct.email.toLowerCase()]=ct;return m;},{});
    const dups=[],clean=[];
    mapped.forEach((r,idx)=>{
      if(r.email&&exEmails[r.email.toLowerCase()]) dups.push({idx,row:r,existing:exEmails[r.email.toLowerCase()]});
      else clean.push(r);
    });
    if(dups.length>0){setCsvDuplicates(dups);setCsvCleanRows(clean);setCsvDupDecisions({});setCsvImporting(false);setCsvStep(3);return;}
    await doImport(clean,{});
  }
  async function doImport(clean,decisions) {
    setCsvImporting(true);
    const ins=clean.map(r=>({first_name:r.first_name,last_name:r.last_name||null,title:r.title||null,
      email:r.email||null,linkedin_url:r.linkedin_url||null,pitch:r.pitch||null,
      account_id:data.id,owner_id:user.id,status:'Fresh'}));
    const contactNotesToInsert=[];
    let insertedRows=[];
    if(ins.length>0){
      const{data:rows}=await supabase.from('contacts').insert(ins).select('id');
      insertedRows=rows||[];
      insertedRows.forEach((row,idx)=>{ const note=clean[idx]&&clean[idx].notes; if(note) contactNotesToInsert.push({contact_id:row.id,author_id:user.id,body:note}); });
    }
    for(const{idx,row,existing}of csvDuplicates){
      if((decisions[idx]||'keep')==='overwrite'){
        await supabase.from('contacts').update({first_name:row.first_name,last_name:row.last_name||null,
          title:row.title||null,linkedin_url:row.linkedin_url||null,pitch:row.pitch||null}).eq('id',existing.id);
        if(row.notes) contactNotesToInsert.push({contact_id:existing.id,author_id:user.id,body:row.notes});
      }
    }
    // Notes go into contact_notes (note history), not a separate single field.
    if(contactNotesToInsert.length) await supabase.from('contact_notes').insert(contactNotesToInsert);
    setCsvImporting(false);
    setCsvImportResult({added:ins.length,overwritten:Object.values(decisions).filter(d=>d==='overwrite').length});
    setCsvStep(4);onUpdate();
  }
  async function saveContactLinkedIn(contactId, urlVal) {
    const url = (urlVal || liDraft).trim() || null;
    await supabase.from('contacts').update({linkedin_url:url}).eq('id',contactId);
    if (url) setSavedLinkedInUrls(prev => ({...prev, [contactId]: url}));
    setEditLI4Contact(null);setLiDraft('');onUpdate();
  }

  async function enrichContact(c) {
    setEnrichingContact(c.id);
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke('enrich-contact', {
        body: { contact_id: c.id, first_name: c.first_name, last_name: c.last_name, company: c.company || account?.name || '', account_id: account?.id }
      });
      if (fnErr) throw new Error(fnErr.message || 'Edge function error');
      if (result?.error) throw new Error(result.error);
      if (result.found) {
        const got = [result.email && 'email', result.linkedin_url && 'LinkedIn', result.company_linkedin_url && 'company LinkedIn'].filter(Boolean);
        alert(got.length ? 'Enriched: ' + got.join(', ') : 'No new data found in Apollo');
        onUpdate();
      } else { alert('No match found in Apollo for this contact.'); }
    } catch(err) { alert('Enrichment failed: ' + err.message); }
    finally { setEnrichingContact(null); }
  }

  function toggleEnrichSelect(id) {
    setSelectedEnrich(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkEnrichSelected() {
    const ids = [...selectedEnrich];
    if (ids.length === 0) return;
    let enrichedCount = 0, noMatchCount = 0, failedCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const c = contacts.find(x => x.id === ids[i]);
      if (!c) continue;
      setBulkEnriching(`${i + 1}/${ids.length}`);
      setEnrichingContact(c.id);
      try {
        const { data: result, error: fnErr } = await supabase.functions.invoke('enrich-contact', {
          body: { contact_id: c.id, first_name: c.first_name, last_name: c.last_name, company: c.company || account?.name || '', account_id: account?.id }
        });
        if (fnErr || result?.error) { failedCount++; }
        else if (result.found) { enrichedCount++; }
        else { noMatchCount++; }
      } catch { failedCount++; }
    }
    setEnrichingContact(null);
    setBulkEnriching(null);
    setSelectedEnrich(new Set());
    onUpdate();
    alert(`Bulk enrich done: ${enrichedCount} enriched, ${noMatchCount} no match, ${failedCount} failed`);
  }

  const TABS = [
    { key: 'overview',  label: 'Overview'  },
    { key: 'contacts',  label: `Contacts${contacts.length > 0 ? ` (${contacts.length})` : ''}` },
    { key: 'techstack', label: 'Tech Stack' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* STICKY HEADER */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '18px 24px 0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ac, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0, letterSpacing: '0.5px' }}>
            {getInitials(data.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.3px' }}>{data.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.industry && <span>🏭 {data.industry}</span>}
              {data.country && <span>📍 {data.country}</span>}
              {data.revenue_millions && <span>💰 ${Number(data.revenue_millions).toLocaleString()}M</span>}
              {data.ticker && <span style={{ color: '#059669', fontWeight: 600 }}>📈 {data.ticker}</span>}
              {data.founded_year && <span>📅 Est. {data.founded_year}</span>}
              {data.parent_company && <span>🏢 Sub. of {data.parent_company}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            <button onClick={() => setShowScoreBreakdown(true)} title="Score breakdown" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
              background: sc.bg, color: sc.color, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            }}>{score} <span style={{ fontSize: 10 }}>▾</span></button>
            {editingLinkedIn ? (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input value={linkedInDraft} onChange={e => setLinkedInDraft(e.target.value)}
                  style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid #2563eb', fontSize: 12, width: 200, outline: 'none' }}
                  placeholder="https://linkedin.com/company/…" />
                <button onClick={saveLinkedIn} style={{ padding: '6px 11px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 12, border: 'none', cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditingLinkedIn(false)} style={{ padding: '6px 9px', background: '#f0f0f0', borderRadius: 7, fontSize: 12, border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <a href={linkedInGuess} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 13px', background: '#0a66c2', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  🔗 LinkedIn
                </a>
                <button onClick={() => { setLinkedInDraft(data.linkedin_url || linkedInGuess); setEditingLinkedIn(true); }}
                  style={{ padding: '6px 9px', background: '#f5f5f5', borderRadius: 8, fontSize: 11, border: '1px solid #e5e7eb', cursor: 'pointer', color: '#555' }}>✏️</button>
              </div>
            )}
            <button onClick={() => {
              const csv = contacts.map(c => `"${(c.first_name + ' ' + (c.last_name || '')).trim()}","${c.title || ''}","${c.email || ''}","${c.status}"`).join('\n');
              const blob = new Blob([`Name,Title,Email,Stage\n${csv}`], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `${data.name.replace(/[^a-z0-9]/gi,'_')}.csv`; a.click();
            }} style={{ padding: '6px 13px', background: '#f5f5f5', borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb', cursor: 'pointer', color: '#555' }}>
              ⬇️ Export
            </button>
            <button onClick={runFullAIResearch} disabled={aiResearching || fullLocked} title={fullLocked ? `Available again on ${fullUnlockDate}` : 'AI populates tools, apps, signals & research in one shot'} style={{
              padding: '6px 14px', background: (aiResearching || fullLocked) ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
              color: (aiResearching || fullLocked) ? '#9ca3af' : '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: aiResearching ? 'wait' : (fullLocked ? 'not-allowed' : 'pointer'), whiteSpace: 'nowrap',
            }}>
              {aiResearching ? '⏳ Researching…' : fullLocked ? `🔒 Locked` : '🤖 AI Research'}
            </button>
            {saving && <span style={{ fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '9px 18px', fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? '#2563eb' : '#6b7280', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === t.key ? '#2563eb' : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* MAIN BODY: sidebar + tab content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <aside style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '20px 16px', background: '#fafafa' }}>

          {/* Company details panel */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Company details</div>
              {!editingCompanyDetails && (
                <button onClick={() => { setCompanyDetailsDraft({
                  founded_year: data.founded_year || '', ticker: data.ticker || '', parent_company: data.parent_company || '',
                  industry: data.industry || '', country: data.country || '', revenue_millions: data.revenue_millions || '',
                  employee_count: data.employee_count || '', website: data.website || '', headquarters: data.headquarters || '',
                }); setEditingCompanyDetails(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}>✏️</button>
              )}
            </div>
            {editingCompanyDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'industry', label: 'Industry' },
                  { key: 'country', label: 'Country' },
                  { key: 'revenue_millions', label: 'Revenue ($M)' },
                  { key: 'employee_count', label: 'Employees' },
                  { key: 'website', label: 'Website' },
                  { key: 'headquarters', label: 'Headquarters' },
                  { key: 'founded_year', label: 'Founded year' },
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'parent_company', label: 'Parent company' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{f.label}</div>
                    <input value={companyDetailsDraft[f.key]} onChange={e => setCompanyDetailsDraft(d => ({ ...d, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={saveCompanyDetails} style={{ flex: 1, padding: '7px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingCompanyDetails(false)} style={{ flex: 1, padding: '7px 0', background: '#f0f0f0', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#374151' }}>
                <div>🏭 {data.industry || <span style={{ color: '#bbb' }}>No industry</span>}</div>
                <div>📍 {data.country || <span style={{ color: '#bbb' }}>No country</span>}</div>
                <div>💰 {data.revenue_millions ? `$${Number(data.revenue_millions).toLocaleString()}M` : <span style={{ color: '#bbb' }}>No revenue</span>}</div>
                <div>👥 {data.employee_count ? (Number.isFinite(Number(data.employee_count)) ? Number(data.employee_count).toLocaleString() : data.employee_count) : <span style={{ color: '#bbb' }}>No employee count</span>}</div>
                <div>🌐 {data.website || <span style={{ color: '#bbb' }}>No website</span>}</div>
                <div>🏢 {data.headquarters || <span style={{ color: '#bbb' }}>No headquarters</span>}</div>
              </div>
            )}
          </div>

          {/* Record details panel */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Record details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#374151' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af' }}>Score</span>
                <button onClick={() => setShowScoreBreakdown(true)} style={{ padding: '3px 10px', borderRadius: 6, background: sc.bg, color: sc.color, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>{score} ▾</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>Created</span>
                <span>{data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>Last updated</span>
                <span>{data.updated_at ? new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Contacts panel */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Contacts</div>
              <button onClick={() => setActiveTab('contacts')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#2563eb', fontWeight: 600 }}>View all</button>
            </div>
            {contacts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#bbb' }}>No contacts linked</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contacts.slice(0, 5).map(c => {
                  const fullName = (c.first_name + ' ' + (c.last_name || '')).trim();
                  return (
                    <div key={c.id} onClick={() => setActiveTab('contacts')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(fullName), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {getInitials(fullName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || ''}</div>
                      </div>
                    </div>
                  );
                })}
                {contacts.length > 5 && (
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>+{contacts.length - 5} more</div>
                )}
              </div>
            )}
          </div>

          {/* Notes panel */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>📝 Notes</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>Shared across every rep working this account</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <textarea value={newCompanyNoteText} onChange={e => setNewCompanyNoteText(e.target.value)}
                placeholder="Add intel: tech stack, deal status, pain points, next steps, objections, key stakeholders…" rows={3}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              <button onClick={addCompanyNote} disabled={!newCompanyNoteText.trim() || savingCompanyNote}
                style={{ padding: '7px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: !newCompanyNoteText.trim() ? 0.5 : 1 }}>
                {savingCompanyNote ? 'Saving…' : 'Add'}
              </button>
            </div>
            {companyNotesList.length === 0 ? (
              <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: '12px 0' }}>No notes yet</p>
            ) : companyNotesList.map(n => (
              <div key={n.id} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, background: '#f8f8f6', borderLeft: '3px solid #e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{n.profiles?.full_name || 'Unknown'}</span>
                  <span style={{ fontSize: 10, color: '#bbb' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</span>
                </div>
                <p style={{ fontSize: 12, color: '#333', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.body}</p>
              </div>
            ))}
          </div>

        </aside>

        {/* TAB CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div style={{ maxWidth: 860 }}>
              {/* Company insights header */}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>📊 Company Insights</div>
              {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Contacts', value: contacts.length, color: '#111', bg: '#fff', border: '#e5e7eb', icon: '👤' },
                { label: 'Contacted', value: contacts.filter(c => c.status !== 'Fresh').length, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅' },
                { label: 'Remaining', value: contacts.filter(c => c.status === 'Fresh').length, color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '📋' },
                { label: 'Warm / Prospect', value: contacts.filter(c => c.response_type === 'warm' || c.response_type === 'prospect').length, color: '#7c3aed', bg: '#fdf4ff', border: '#e9d5ff', icon: '🔥' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{card.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: card.color, letterSpacing: '-0.5px' }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontWeight: 500 }}>{card.label}</div>
                </div>
              ))}
            </div>

            

            {/* Stage pipeline */}
            {contacts.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Stage Pipeline</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Fresh','F1','F2','F3','F4','F5','won','lost','bounced','unsubscribed'].map(s => {
                    const cnt = contacts.filter(c => c.status === s).length;
                    if (!cnt) return null;
                    const sc2 = STAGE_COLORS[s] || { bg: '#f1f5f9', color: '#475569' };
                    return (
                      <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: sc2.color }}>{cnt}</div>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10, background: sc2.bg, color: sc2.color }}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}{/* ── Company Profile ── */}
            {(research.about || research.businessModel || (research.strategicPriorities && research.strategicPriorities.length > 0)) && (
            <div style={{ marginTop: 24 }}>

              {research.about && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#111827' }}>About</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: '1.65' }}>{research.about}</div>
              </div>
              )}

              {research.businessModel && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#111827' }}>How {data.name} makes money</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: '1.65' }}>{research.businessModel}</div>
              </div>
              )}

              {research.strategicPriorities && research.strategicPriorities.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#111827' }}>Strategic priorities</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {research.strategicPriorities.map((p, i) => (
                  <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{p.title}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', lineHeight: '1.5' }}>{p.description}</div>
                  </div>
                  ))}
                </div>
              </div>
              )}

            </div>
            )}

                {/* ── Intel ── */}
            <div style={{ maxWidth: 860 }}>

            {/* Important to Know */}
            {importantToKnow.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 16 }}>💡 Important to Know</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                           {importantToKnow.map((item, i) => (
                    <div key={i} style={{
                      paddingBottom: i < importantToKnow.length - 1 ? 16 : 0,
                      marginBottom: i < importantToKnow.length - 1 ? 16 : 0,
                      borderBottom: i < importantToKnow.length - 1 ? '1px solid #fde68a' : 'none',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f', marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>{item.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signals Feed */}
            {aiSignals.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 14 }}>📡 Recent Signals</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aiSignals.map((sig, i) => {
                    const tc = SIGNAL_TYPE_COLORS[sig.type] || { bg: '#f1f5f9', color: '#475569' };
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f0f0ee' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: tc.bg, color: tc.color, flexShrink: 0, whiteSpace: 'nowrap', marginTop: 1 }}>{sig.type}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{sig.text}</div>
                          {sig.date && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sig.date}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Placeholder if no intel yet */}
            {importantToKnow.length === 0 && aiSignals.length === 0 && (
              <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #eff6ff)', border: '1px solid #ddd6fe', borderRadius: 12, padding: '28px 24px', marginBottom: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#5b21b6', marginBottom: 6 }}>No intel yet</div>
                <div style={{ fontSize: 13, color: '#7c3aed', marginBottom: 16 }}>Run AI Research to generate "Important to Know" pitch bullets and a recent signals feed for this account.</div>
                <button onClick={runFullAIResearch} disabled={aiResearching || fullLocked} title={fullLocked ? `Available again on ${fullUnlockDate}` : undefined} style={{
                  padding: '10px 24px', background: (aiResearching || fullLocked) ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
                  color: (aiResearching || fullLocked) ? '#9ca3af' : '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: aiResearching ? 'wait' : (fullLocked ? 'not-allowed' : 'pointer'),
                }}>
                  {aiResearching ? '⏳ Researching…' : fullLocked ? `🔒 Available ${fullUnlockDate}` : '🤖 Run AI Research'}
                </button>
              </div>
            )}

            {/* Research cards */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Research Notes</div>
              <button onClick={generateAll} disabled={allResearchGenerated} style={{ padding: '7px 18px', background: allResearchGenerated ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #2563eb)', color: allResearchGenerated ? '#9ca3af' : '#fff', borderRadius: 9, fontSize: 12, fontWeight: 600, border: 'none', cursor: allResearchGenerated ? 'not-allowed' : 'pointer' }}>
                {allResearchGenerated ? '✓ All Generated' : '✨ Generate All Missing'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {RESEARCH_DEFAULTS.map(r => {
                const lockMs = msUntilUnlock(data.research_meta?.[r.key]);
                return (
                  <ResearchCard key={r.key} icon={r.icon} label={r.label} value={research[r.key] || ''}
                    generating={!!researchGenerating[r.key]}
                    locked={lockMs > 0}
                    lockedUntil={lockMs > 0 ? formatUnlockDate(data.research_meta[r.key]) : null}
                    onGenerate={() => generateResearch(r.key, r.label)}
                    onSave={val => saveResearch(r.key, val)} />
                );
              })}
              {customResearch.map((s, idx) => (
                <ResearchCard key={s.key} icon="📌" label={s.label} value={s.value || ''}
                  generating={false} onGenerate={() => {}}
                  onSave={val => saveCustomResearch(idx, val)}
                  onRemove={() => removeCustomSection(idx)} />
              ))}
              <div style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 100, cursor: showAddCustom ? 'default' : 'pointer' }}
                onClick={() => !showAddCustom && setShowAddCustom(true)}>
                {showAddCustom ? (
                  <div style={{ width: '100%', display: 'flex', gap: 8 }}>
                    <input value={newCustomSection} onChange={e => setNewCustomSection(e.target.value)}
                      placeholder="Section name" autoFocus onKeyDown={e => e.key === 'Enter' && addCustomSection()}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #2563eb', fontSize: 13, outline: 'none' }} />
                    <button onClick={addCustomSection} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => setShowAddCustom(false)} style={{ padding: '7px 10px', background: '#f0f0f0', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 28, color: '#d1d5db' }}>+</span>
                    <span style={{ fontSize: 13, color: '#9ca3af' }}>Add custom section</span>
                  </>
                )}
              </div>
            </div>
            </div>
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
          <div style={{ maxWidth: 860 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
              {selectedEnrich.size > 0 && (
                <button onClick={bulkEnrichSelected} disabled={!!bulkEnriching} style={{ padding: '7px 14px', background: bulkEnriching ? '#ede9fe' : '#7c3aed', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: bulkEnriching ? 'not-allowed' : 'pointer', border: 'none' }}>
                  {bulkEnriching ? `Enriching… ${bulkEnriching}` : `✨ Enrich Selected (${selectedEnrich.size})`}
                </button>
              )}
              <button onClick={() => setShowCsvImport(true)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>⬆️ Import CSV</button>
              <button onClick={() => setShowAddContact(true)} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }}>+ Add Contact</button>
            </div>
            {contacts.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 48, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>No contacts linked to this account</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {contacts.map(c => {
                  const sc2 = STAGE_COLORS[c.status] || { bg: '#f1f5f9', color: '#475569' };
                  const initColor = avatarColor((c.first_name + ' ' + (c.last_name || '')).trim());
                  return (
                    <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
{(!c.email || !c.linkedin_url) && (
                        <input type="checkbox" checked={selectedEnrich.has(c.id)} onChange={() => toggleEnrichSelect(c.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} title="Select for bulk enrich" />
                      )}
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: initColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {getInitials((c.first_name + ' ' + (c.last_name || '')).trim())}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{(c.first_name + ' ' + (c.last_name || '')).trim()}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{c.title || ''}</div>
                        {contactNotesMap[c.id] && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>"{contactNotesMap[c.id]}"</div>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 8, background: sc2.bg, color: sc2.color, flexShrink: 0 }}>{c.status}</span>
                      <div style={{ display: 'flex', gap: 4, flexBasis: '100%', paddingLeft: 54, marginTop: -4 }}>
                <select value={c.pitch_type || ''} onChange={e => updateContactPitchType(c.id, e.target.value)}
                  style={{ fontSize: 10, padding: '2px 4px', borderRadius: 5, border: '1px solid #e0e0e0', background: c.pitch_type ? '#eff6ff' : '#fff', color: c.pitch_type ? '#1d4ed8' : '#999', maxWidth: 110, cursor: 'pointer' }}>
                  <option value=''>Pitch type...</option>
                  {PITCH_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={c.persona || ''} onChange={e => updateContactPersona(c.id, e.target.value)}
                  style={{ fontSize: 10, padding: '2px 4px', borderRadius: 5, border: '1px solid #e0e0e0', background: c.persona ? '#f0fdf4' : '#fff', color: c.persona ? '#166534' : '#999', maxWidth: 110, cursor: 'pointer' }}>
                  <option value=''>Persona...</option>
                  {PERSONA_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {c.email ? (
                        <span style={{ fontSize: 12, color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={c.email}>✉️ {c.email}</span>
                      ) : (
                        <button onClick={() => window.open(`https://app.apollo.io/#/people?name=${encodeURIComponent((c.first_name + ' ' + (c.last_name || '')).trim())}&organization_name=${encodeURIComponent(data.name)}`, '_blank')}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px dashed #d97706', background: 'none', color: '#d97706', cursor: 'pointer', flexShrink: 0 }}>
                          🔍 Find Email
                        </button>
                      )}
                      {editLI4Contact === c.id ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input autoFocus placeholder="Paste LinkedIn URL..."
                          value={liDraft} onChange={e => setLiDraft(e.target.value)}
                          style={{ fontSize: 12, border: '1px solid #0077b5', borderRadius: 4, padding: '2px 6px', width: 200 }}
                          onKeyDown={e => { if (e.key === 'Enter') saveContactLinkedIn(c.id, liDraft); if (e.key === 'Escape') setEditLI4Contact(null); }} />
                        <button onClick={() => saveContactLinkedIn(c.id, liDraft)}
                          style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #0077b5', background: '#0077b5', color: '#fff', cursor: 'pointer', fontSize: 11 }}>Save</button>
                        <button onClick={() => setEditLI4Contact(null)}
                          style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 11 }}>&#x2715;</button>
                      </span>
                    ) : (
                      <span title={c.linkedin_url ? 'Open LinkedIn profile' : 'Add LinkedIn URL'}
                        onClick={() => { if (c.linkedin_url || savedLinkedInUrls[c.id]) { window.open(c.linkedin_url || savedLinkedInUrls[c.id], '_blank'); } else { setLiDraft(''); setEditLI4Contact(c.id); } }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.linkedin_url ? '#0077b5' : '#9ca3af', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                      </span>
                    )}             {(!c.email || !c.linkedin_url) && (
                <button onClick={() => enrichContact(c)} disabled={enrichingContact === c.id}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #7c3aed', background: enrichingContact === c.id ? '#ede9fe' : '#f5f3ff', color: '#7c3aed', cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {enrichingContact === c.id ? 'Enriching...' : '✨ Enrich'}
                </button>
              )}
                    {(c.status === 'Fresh' && !c.next_followup || c.status === 'cooling_off') && (
                        <button onClick={() => startContact(c)} disabled={qualifying === c.id} style={{
                          fontSize: 12, padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: qualifying === c.id ? '#d1fae5' : 'linear-gradient(135deg, #2563eb, #7c3aed)',
                          color: '#fff', cursor: qualifying === c.id ? 'wait' : 'pointer', fontWeight: 600, flexShrink: 0,
                          boxShadow: '0 1px 4px rgba(37,99,235,0.3)',
                        }}>
                          {qualifying === c.id ? '⏳ Starting…' : c.status === 'cooling_off' ? '🔁 Restart' : '🚀 Start'}
                        </button>
                      )}
                      {c.status === 'cooling_off' && (<span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: '#f1f5f9', color: '#64748b', fontWeight: 600, flexShrink: 0, border: '1px solid #cbd5e1' }}>❄️ Last touch: {c.last_touchpoint_date ? new Date(c.last_touchpoint_date).toLocaleDateString() : '—'}</span>)}{c.status === 'Fresh' && c.next_followup && (
                        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: '#d1fae5', color: '#059669', fontWeight: 600, flexShrink: 0, border: '1px solid #6ee7b7' }}>
                          📬 In Queue
                        </span>
                      )}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => { setNotePopover(notePopover === c.id ? null : c.id); setNoteDraft(''); }}
                          title="Add a note"
                          style={{ fontSize: 14, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', background: contactNotesMap[c.id] ? '#fef9c3' : '#fff', color: '#92400e', cursor: 'pointer' }}>
                          📝
                        </button>
                        {notePopover === c.id && (
                          <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 12, width: 260 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                              Add note for {(c.first_name + ' ' + (c.last_name || '')).trim()}
                            </div>
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
                      <button onClick={() => navigate(`/contacts/${c.id}`, { state: { from: 'account', accountId: data.id, accountName: data.name } })}
                        style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#2563eb', cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}>
                        View →
                      </button>
                      <button onClick={() => setDeleteConfirm({ id: c.id, name: (c.first_name + ' ' + (c.last_name || '')).trim() || c.email })}
                        style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 500, flexShrink: 0 }}>
                        Delete
                      </button>
                    </div>
                  );
                })}
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

        {/* TECH STACK TAB */}
        {activeTab === 'techstack' && (
          <div style={{ maxWidth: 860 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: 'linear-gradient(135deg, #f5f3ff, #eff6ff)', borderRadius: 12, border: '1px solid #ddd6fe' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#5b21b6' }}>🤖 AI-Powered Tech Intelligence</div>
                <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>Auto-detect testing tools, enterprise apps & SaaS platforms.</div>
              </div>
              <button onClick={runFullAIResearch} disabled={aiResearching || fullLocked} title={fullLocked ? `Available again on ${fullUnlockDate}` : undefined} style={{
                padding: '8px 18px', background: (aiResearching || fullLocked) ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
                color: (aiResearching || fullLocked) ? '#9ca3af' : '#fff', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: aiResearching ? 'wait' : (fullLocked ? 'not-allowed' : 'pointer'), whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {aiResearching ? '⏳ Generating…' : fullLocked ? `🔒 Locked until ${fullUnlockDate}` : '✨ Generate with AI'}
              </button>
            </div>

            {/* Testing Tools */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1 }}>⚙️ Testing Tools</span>
                <button onClick={() => setShowAddTool(t => !t)} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: '1px dashed #2563eb', color: '#2563eb', background: 'none', cursor: 'pointer' }}>+ Add Manually</button>
              </div>
              {tools.length === 0 && !showAddTool && <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>No tools recorded yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tools.map((t, idx) => {
                  const tc = TOOL_STATUS_COLORS[t.status] || TOOL_STATUS_COLORS.Active;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: '#f9fafb', border: '1px solid #f0f0ee' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: '#374151' }}>{t.status === 'Legacy' ? '⚠️' : '🔵'} {t.tool}{t.source === 'ai' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed', marginLeft: 5 }}>AI</span>}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: tc.bg, color: tc.color }}>{t.status}</span>
                      <select value={t.status} onChange={e => updateToolStatus(idx, e.target.value)}
                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>
                        {TOOL_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                      </select>
                      <button onClick={() => removeTool(idx)} style={{ fontSize: 13, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                    </div>
                  );
                })}
              </div>
              {showAddTool && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '12px 14px', background: '#f0f7ff', borderRadius: 9, border: '1px solid #dbeafe' }}>
                  <input value={newToolName} onChange={e => setNewToolName(e.target.value)} placeholder="Tool name (e.g. Playwright)"
                    onKeyDown={e => e.key === 'Enter' && addTool()}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }} />
                  <select value={newToolStatus} onChange={e => setNewToolStatus(e.target.value)}
                    style={{ padding: '7px 8px', fontSize: 12, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>
                    {TOOL_STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  <button onClick={addTool} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setShowAddTool(false)} style={{ padding: '7px 10px', background: '#f0f0f0', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>

            {/* Enterprise Apps */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1 }}>🏢 Enterprise Apps</span>
                <button onClick={() => setShowAddEnterprise(t => !t)} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: '1px dashed #0891b2', color: '#0891b2', background: 'none', cursor: 'pointer' }}>+ Add Manually</button>
              </div>
              {eApps.length === 0 && !showAddEnterprise && <div style={{ fontSize: 13, color: '#9ca3af' }}>No enterprise apps recorded</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: eApps.length > 0 ? 10 : 0 }}>
                {eApps.map((a, idx) => (
                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: '#e0f2fe', color: '#0369a1', fontSize: 12, fontWeight: 600 }}>
                    {a.app}{a.source === 'ai' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#dbeafe', color: '#1d4ed8', marginLeft: 4 }}>AI</span>}
                    <button onClick={() => removeEnterpriseApp(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
              {showAddEnterprise && (
                <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 9, border: '1px solid #bae6fd' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input value={newEnterpriseApp} onChange={e => setNewEnterpriseApp(e.target.value)} placeholder="App name (e.g. Guidewire)"
                      onKeyDown={e => e.key === 'Enter' && addEnterpriseApp(newEnterpriseApp)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }} />
                    <button onClick={() => addEnterpriseApp(newEnterpriseApp)} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => setShowAddEnterprise(false)} style={{ padding: '7px 10px', background: '#f0f0f0', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Quick add:</span>
                    {COMMON_ENTERPRISE_APPS.filter(a => !eApps.find(x => x.app === a)).map(a => (
                      <button key={a} onClick={() => addEnterpriseApp(a)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: '1px dashed #0891b2', color: '#0891b2', background: 'none', cursor: 'pointer' }}>{a}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SaaS Apps */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111', flex: 1 }}>📦 SaaS & Industry Apps</span>
                <button onClick={() => setShowAddSaas(t => !t)} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: '1px dashed #7c3aed', color: '#7c3aed', background: 'none', cursor: 'pointer' }}>+ Add Manually</button>
              </div>
              {saasApps.length === 0 && !showAddSaas && <div style={{ fontSize: 13, color: '#9ca3af' }}>No SaaS apps recorded</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: saasApps.length > 0 ? 10 : 0 }}>
                {saasApps.map((a, idx) => (
                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed', fontSize: 12, fontWeight: 600 }}>
                    {a.app}{a.source === 'ai' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#f3e8ff', color: '#7c3aed', marginLeft: 4 }}>AI</span>}
                    <button onClick={() => removeSaasApp(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
              {showAddSaas && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newSaasApp} onChange={e => setNewSaasApp(e.target.value)} placeholder="e.g. Temenos, Finastra"
                    onKeyDown={e => e.key === 'Enter' && addSaasApp()}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }} />
                  <button onClick={addSaasApp} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setShowAddSaas(false)} style={{ padding: '7px 10px', background: '#f0f0f0', borderRadius: 7, fontSize: 13, border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>

      
      {/* ADD CONTACT MODAL */}
      {showAddContact && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Add Contact</h3>
              <button onClick={() => { setShowAddContact(false); setContactDupWarning(null); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>&#x2715;</button>
            </div>
            {contactDupWarning && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#92400e' }}>Duplicate Email Found</p>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#78350f' }}>Contact with this email exists: <strong>{contactDupWarning.first_name} {contactDupWarning.last_name}</strong></p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => saveNewContact(true)} style={{ padding: '6px 14px', background: '#d97706', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Overwrite</button>
                  <button onClick={() => setContactDupWarning(null)} style={{ padding: '6px 14px', background: '#f3f4f6', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Keep Both</button>
                </div>
              </div>
            )}
            {[['first_name','First Name *'],['last_name','Last Name'],['title','Title'],['email','Email'],['linkedin_url','LinkedIn URL'],['pitch','Pitch'],['notes','Notes']].map(([k,lbl]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{lbl}</label>
                {k === 'notes' || k === 'pitch' ? (
                  <textarea value={newContact[k]} onChange={e => setNewContact(p => ({...p,[k]:e.target.value}))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }} />
                ) : (
                  <input value={newContact[k]} onChange={e => setNewContact(p => ({...p,[k]:e.target.value}))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button onClick={() => { setShowAddContact(false); setContactDupWarning(null); }} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Cancel</button>
              <button onClick={() => saveNewContact(false)} disabled={!newContact.first_name.trim() || addingContact}
                style={{ padding: '9px 20px', borderRadius: 9, background: '#2563eb', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !newContact.first_name.trim() ? 0.5 : 1 }}>
                {addingContact ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showCsvImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {csvStep === 1 ? 'Import Contacts - Upload CSV' : csvStep === 2 ? 'Map Columns' : csvStep === 3 ? 'Resolve Duplicates' : 'Import Complete'}
              </h3>
              <button onClick={() => { setShowCsvImport(false); setCsvStep(1); setCsvDuplicates([]); setCsvImportResult(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>&#x2715;</button>
            </div>
            {csvStep === 1 && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>Upload a CSV. First Name required per row.</p>
                <label style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Choose File
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleCsvFile(e.target.files[0])} />
                </label>
              </div>
            )}
            {csvStep === 2 && (
              <div>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Match CSV columns to fields. Rows without First Name skipped.</p>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 16, maxHeight: 340, overflowY: 'auto' }}>
                  {csvHeaders.map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ width: 160, fontSize: 13, fontWeight: 500, color: '#374151', flexShrink: 0 }}>{h}</span>
                      <select value={columnMapping[i] || ''} onChange={e => setColumnMapping(p => ({...p,[i]:e.target.value}))}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 13 }}>
                        <option value="">Skip</option>
                        {[['first_name','First Name *'],['last_name','Last Name'],['title','Title'],['email','Email'],['linkedin_url','LinkedIn URL'],['phone','Phone'],['pitch','Pitch'],['notes','Notes']].map(([v,l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>{csvRows.length} rows found</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setCsvStep(1)} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Back</button>
                  <button onClick={runCsvImport} disabled={csvImporting}
                    style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {csvImporting ? 'Importing...' : 'Import Contacts'}
                  </button>
                </div>
              </div>
            )}
            {csvStep === 3 && (
              <div>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>These contacts already exist. Choose what to do:</p>
                <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
                  {csvDuplicates.map(({idx, row, existing}) => (
                    <div key={idx} style={{ background: '#fef3c7', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #f59e0b' }}>
                      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>{row.first_name} {row.last_name}</p>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>Existing: {existing.first_name} {existing.last_name}</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setCsvDupDecisions(p => ({...p,[idx]:'keep'}))}
                          style={{ padding: '5px 12px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: 12,
                            border: (csvDupDecisions[idx]||'keep') === 'keep' ? '2px solid #2563eb' : '2px solid #e5e7eb',
                            background: (csvDupDecisions[idx]||'keep') === 'keep' ? '#eff6ff' : '#fff' }}>
                          Keep Existing
                        </button>
                        <button onClick={() => setCsvDupDecisions(p => ({...p,[idx]:'overwrite'}))}
                          style={{ padding: '5px 12px', borderRadius: 7, fontWeight: 600, cursor: 'pointer', fontSize: 12,
                            border: csvDupDecisions[idx] === 'overwrite' ? '2px solid #d97706' : '2px solid #e5e7eb',
                            background: csvDupDecisions[idx] === 'overwrite' ? '#fffbeb' : '#fff' }}>
                          Overwrite
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setCsvStep(2)} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer', background: '#fff' }}>Back</button>
                  <button onClick={() => doImport(csvCleanRows, csvDupDecisions)} disabled={csvImporting}
                    style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {csvImporting ? 'Importing...' : 'Confirm Import'}
                  </button>
                </div>
              </div>
            )}
            {csvStep === 4 && csvImportResult && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Import Complete!</p>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
                  {csvImportResult.added} contact{csvImportResult.added !== 1 ? 's' : ''} added.
                  {csvImportResult.overwritten > 0 ? ' ' + csvImportResult.overwritten + ' updated.' : ''}
                </p>
                <button onClick={() => { setShowCsvImport(false); setCsvStep(1); setCsvImportResult(null); }}
                  style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
{/* SCORE BREAKDOWN POPUP */}
      {showScoreBreakdown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowScoreBreakdown(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, flex: 1, color: '#111' }}>Score Breakdown</div>
              <button onClick={() => setShowScoreBreakdown(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: sc.color, background: sc.bg, padding: '10px 28px', borderRadius: 14 }}>{score}</div>
            </div>
            {[
              { label: '🔧 Tool Fit', pts: tools.some(t => t.status === 'Legacy') ? 30 : tools.some(t => t.status === 'Evaluating') ? 20 : tools.length > 0 ? 15 : 0, max: 30,
                detail: tools.some(t => t.status === 'Legacy') ? `Legacy: ${tools.filter(t=>t.status==='Legacy').map(t=>t.tool).join(', ')}` : tools.some(t=>t.status==='Evaluating') ? 'Evaluating tools detected' : tools.length > 0 ? 'Modern tools' : 'No tools recorded' },
              { label: '📡 Intent Signals', pts: Math.min([signals.hiringQA&&10,signals.funding&&10,signals.outage&&8,signals.recentLaunch&&6,signals.leadershipChange&&6,signals.cicd&&5].filter(Boolean).reduce((a,b)=>a+b,0),45), max: 45,
                detail: SIGNAL_DEFS.filter(s=>signals[s.key]).map(s=>s.label).join(', ') || 'No signals active' },
              { label: '💬 Engagement', pts: Math.min(contacts.filter(c=>c.response_type==='warm'||c.response_type==='prospect').length*5,15), max: 15,
                detail: `${contacts.filter(c=>c.response_type==='warm'||c.response_type==='prospect').length} warm/prospect contacts` },
              { label: '🔬 Research', pts: Math.min(Object.values(data.research||{}).filter(v=>v&&typeof v==='string'&&v.length>10).length*2,10), max: 10,
                detail: `${Object.values(data.research||{}).filter(v=>v&&typeof v==='string'&&v.length>10).length} of ${RESEARCH_DEFAULTS.length} sections filled` },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: '#374151' }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: row.pts > 0 ? '#2563eb' : '#d1d5db' }}>{row.pts}<span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>/{row.max}</span></span>
                </div>
                <div style={{ height: 7, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ height: '100%', width: `${row.max > 0 ? (row.pts/row.max)*100 : 0}%`, background: row.pts > 0 ? '#2563eb' : '#f3f4f6', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{row.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* RESEARCH CARD */
function ResearchCard({ icon, label, value, generating, locked, lockedUntil, onGenerate, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const hasContent = !!(value && String(value).trim());

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: '#374151' }}>{label}</span>
        {onRemove && (
          <button onClick={onRemove} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✕</button>
        )}
        <button onClick={onGenerate} disabled={generating || locked || hasContent} title={locked ? `Available again on ${lockedUntil}` : hasContent ? 'Already generated — edit or remove to regenerate' : undefined} style={{
          padding: '4px 12px', background: (generating || locked || hasContent) ? '#e5e7eb' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: (generating || locked || hasContent) ? '#9ca3af' : '#fff', borderRadius: 7, fontSize: 11, fontWeight: 600, border: 'none',
          cursor: generating ? 'wait' : ((locked || hasContent) ? 'not-allowed' : 'pointer'),
        }}>{generating ? '⏳ Generating…' : locked ? `🔒 ${lockedUntil}` : hasContent ? '✓ Generated' : '✨ Generate'}</button>
      </div>
      <div style={{ padding: '12px 16px', minHeight: 70 }}>
        {editing ? (
          <div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2563eb', fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { onSave(draft); setEditing(false); }} style={{ padding: '5px 14px', background: '#2563eb', color: '#fff', borderRadius: 7, fontSize: 12, border: 'none', cursor: 'pointer' }}>Save</button>
              <button onClick={() => { setDraft(value); setEditing(false); }} style={{ padding: '5px 12px', background: '#f0f0f0', borderRadius: 7, fontSize: 12, border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} style={{ fontSize: 13, lineHeight: 1.65, color: value ? '#374151' : '#9ca3af', cursor: 'text', minHeight: 44, whiteSpace: 'pre-wrap' }}>
            {value || 'Click to write, or click ✨ Generate'}
          </div>
        )}
      </div>
    </div>
  );
}
