import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast as sonnerToast } from 'sonner';

// ── Data ─────────────────────────────────────────────────────────────────────
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const COUNTRY_STATES = {
  'United States': ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'],
  'India': ['Andhra Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Odisha','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','Uttarakhand','West Bengal'],
  'Australia': ['New South Wales','Victoria','Queensland','South Australia','Western Australia','Tasmania','ACT','Northern Territory'],
  'Canada': ['Ontario','Quebec','British Columbia','Alberta','Manitoba','Saskatchewan','Nova Scotia','New Brunswick','Prince Edward Island','Newfoundland and Labrador'],
  'Germany': ['Bavaria','Baden-Württemberg','Berlin','Brandenburg','Bremen','Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia','Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia'],
  'Brazil': ['Sao Paulo','Rio de Janeiro','Minas Gerais','Bahia','Parana','Rio Grande do Sul','Pernambuco','Ceara','Amazonas','Goias','Para','Santa Catarina'],
  'United Kingdom': ['England','Scotland','Wales','Northern Ireland'],
  'France': ['Ile-de-France','Auvergne-Rhone-Alpes','Hauts-de-France','Nouvelle-Aquitaine','Occitanie','Grand Est','Provence-Alpes-Cote d Azur','Pays de la Loire','Normandy','Brittany','Bourgogne-Franche-Comte','Centre-Val de Loire'],
  'Mexico': ['Mexico City','Jalisco','Nuevo Leon','Puebla','Guanajuato','Veracruz','Estado de Mexico','Queretaro','Yucatan','Sonora','Chihuahua'],
  'Japan': ['Tokyo','Osaka','Kanagawa','Aichi','Saitama','Chiba','Hyogo','Hokkaido','Fukuoka','Kyoto','Shizuoka'],
  'South Korea': ['Seoul','Busan','Gyeonggi','Incheon','Daegu','Daejeon','Gwangju','Ulsan'],
  'Netherlands': ['North Holland','South Holland','Utrecht','North Brabant','Gelderland','Overijssel'],
  'Sweden': ['Stockholm','Vastra Gotaland','Skane','Uppsala','Ostergotland'],
  'Switzerland': ['Zurich','Bern','Vaud','Geneva','Aargau','Basel-Stadt','St. Gallen'],
};
const COUNTRIES = [
  'United States','United Kingdom','Canada','Australia','Germany','France',
  'Netherlands','India','Singapore','UAE','Brazil','Mexico','Japan',
  'South Korea','Sweden','Norway','Denmark','Finland','Switzerland','Ireland',
];
const INDUSTRIES = [
  'BFSI / Banking','Healthcare / Life Sciences','Retail / eCommerce',
  'Manufacturing','Insurance','Telecom','Logistics / Supply Chain',
  'Energy / Utilities','Government / Public Sector','Education',
  'Media / Entertainment','Real Estate','Pharma / Biotech',
  'Automotive','Aerospace & Defense',
];
const TECH_TOOLS = [
  'SAP','Oracle EBS','Salesforce','ServiceNow','Workday','PeopleSoft',
  'Selenium','UFT / QTP','Jira','Azure DevOps','Jenkins','GitHub Actions',
  'Microsoft Dynamics','Guidewire','Epic Systems','Veeva',
  'TestComplete','Rational Robot','SilkTest','Appium',
];
const COMPANY_SIZES = [
  { value: 'all', label: 'All sizes' },
  { value: 'smb', label: 'SMB — 50 to 500 employees' },
  { value: 'mid', label: 'Mid-market — 500 to 5,000' },
  { value: 'enterprise', label: 'Enterprise — 5,000 to 20,000' },
  { value: 'large', label: 'Large Enterprise — 20,000+' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  label: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: 6, display: 'block' },
  divider: { borderTop: '1px solid #f1f5f9', margin: '14px 0' },
};

// ── Multi-select dropdown ─────────────────────────────────────────────────────
function MultiSelect({ label, icon, options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const allSel = selected.length === options.length;
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const summary = selected.length === 0 ? null
    : allSel ? `All ${label}`
    : selected.length <= 2 ? selected.join(', ')
    : `${selected[0]}, ${selected[1]} +${selected.length - 2} more`;

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 12 }}>
      <label style={S.label}>{icon} {label}</label>
      <div onClick={() => setOpen(o => !o)} style={{
        border: `1.5px solid ${open ? '#3b82f6' : '#e2e8f0'}`,
        borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'border-color 0.15s', boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.1)' : 'none',
        minHeight: 38,
      }}>
        <span style={{ fontSize: 13, color: selected.length ? '#0f172a' : '#94a3b8',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
          {summary || placeholder || `Any ${label.toLowerCase()}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selected.length > 0 && (
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 10, padding: '1px 7px',
              fontSize: 10, fontWeight: 700 }}>{selected.length}</span>
          )}
          <span style={{ color: '#94a3b8', fontSize: 9 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 4px' }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 7,
                padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box',
                background: '#f8fafc', color: '#0f172a' }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {search === '' && (
              <div onClick={() => onChange(allSel ? [] : [...options])} style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc',
                borderBottom: '1px solid #f1f5f9', color: '#374151',
              }}>
                <input type="checkbox" readOnly checked={allSel} style={{ cursor: 'pointer', accentColor: '#3b82f6' }} />
                Select all ({options.length})
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No matches</div>
            )}
            {filtered.map(o => {
              const active = selected.includes(o);
              return (
                <div key={o} onClick={() => toggle(o)} style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#1d4ed8' : '#374151',
                  transition: 'background 0.1s',
                }}>
                  <input type="checkbox" readOnly checked={active} style={{ cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }} />
                  {o}
                </div>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { onChange([]); }} style={{
                fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer',
                padding: '2px 6px', borderRadius: 4, textDecoration: 'underline',
              }}>Clear {selected.length} selected</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    suggested: { bg: '#dbeafe', color: '#1e40af', label: 'New' },
    added:     { bg: '#dcfce7', color: '#166534', label: 'Added' },
    skipped:   { bg: '#f1f5f9', color: '#64748b', label: 'Skipped' },
  };
  const c = cfg[status] || cfg.suggested;
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 10, fontWeight: 700,
      padding: '3px 9px', borderRadius: 20, letterSpacing: '0.04em' }}>{c.label}</span>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────
function AccountCard({ r, onAdd, onSkip, working }) {
  const borderColor = r.status === 'added' ? '#22c55e' : r.status === 'skipped' ? '#e2e8f0' : '#3b82f6';
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px',
      borderLeft: `4px solid ${borderColor}`,
      opacity: r.status === 'skipped' ? 0.5 : 1,
      transition: 'box-shadow 0.15s, opacity 0.2s',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3, flex: 1 }}>
          {r.company_name}
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {r.industry && (
          <span style={{ fontSize: 11, background: '#f8fafc', color: '#475569', padding: '3px 9px',
            borderRadius: 20, border: '1px solid #e2e8f0', fontWeight: 500 }}>
            {r.industry}
          </span>
        )}
        {r.size_estimate && (
          <span style={{ fontSize: 11, background: '#f0fdf4', color: '#15803d', padding: '3px 9px',
            borderRadius: 20, border: '1px solid #bbf7d0', fontWeight: 500 }}>
            👥 {r.size_estimate}
          </span>
        )}
      </div>

      {/* Why match */}
      {r.reason && (
        <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.6,
          background: '#f8fafc', padding: '8px 10px', borderRadius: 7, borderLeft: '3px solid #e2e8f0' }}>
          {r.reason}
        </p>
      )}

      {/* Actions */}
      {r.status === 'suggested' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button onClick={() => onAdd(r)} disabled={!!working} style={{
            flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
            background: working ? '#94a3b8' : '#2563eb', color: '#fff',
            fontWeight: 600, fontSize: 12, cursor: working ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!working) e.target.style.background = '#1d4ed8'; }}
          onMouseLeave={e => { if (!working) e.target.style.background = '#2563eb'; }}>
            {working === 'adding' ? '⏳ Adding…' : '➕ Add to Accounts'}
          </button>
          <button onClick={() => onSkip(r)} disabled={!!working} style={{
            padding: '8px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0',
            background: '#fff', color: '#64748b', fontSize: 12, cursor: working ? 'not-allowed' : 'pointer',
            fontWeight: 500, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!working) { e.target.style.background = '#f8fafc'; e.target.style.borderColor = '#94a3b8'; }}}
          onMouseLeave={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e2e8f0'; }}>
            Skip
          </button>
        </div>
      )}
      {r.status === 'added' && (
        <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 14 }}>✓</span> Added — AI research running
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProspectDiscovery() {
  const { user } = useAuth();

  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState(['United States']);

  // Dynamic states/provinces based on selected countries
  const availableStates = [...new Set(selectedCountries.flatMap(country => COUNTRY_STATES[country] || []))].sort();
  const [selectedIndustries, setSelectedIndustries] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [companySize, setCompanySize] = useState('all');
  const [itMode, setItMode] = useState('all'); // 'all' | 'include' | 'exclude'

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionWorking, setActionWorking] = useState({});

  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  const showToast = (msg, type = 'success') => {
    (type === 'error' ? sonnerToast.error : sonnerToast.success)(msg);
  };

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('prospect_suggestions').select('*')
      .eq('owner_id', user.id).order('created_at', { ascending: false });
    setHistory(data || []);
  }, [user]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  async function handleDiscover() {
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const seenCompanies = history.map(h => h.company_name);
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        'https://wfbfpidkwittvlhgwnnp.supabase.co/functions/v1/discover-prospects',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            states: selectedStates, countries: selectedCountries,
            industries: selectedIndustries, techTools: selectedTools,
            companySize: companySize === 'all' ? null : companySize,
            itServicesMode: itMode,
            alreadySeen: seenCompanies, count: 12,
          }),
        }
      );
      const json = await resp.json();
      if (json.error) throw new Error(json.error);
      const companies = json.companies || [];
      if (companies.length > 0) {
        const rows = companies.map(c => ({
          owner_id: user.id, company_name: c.company, industry: c.industry || null,
          size_estimate: c.size_estimate || null, reason: c.why_match || null,
          territory_snapshot: { states: selectedStates, countries: selectedCountries,
            industries: selectedIndustries, techTools: selectedTools, companySize, itMode },
          status: 'suggested',
        }));
        const { data: inserted } = await supabase.from('prospect_suggestions').insert(rows).select();
        setResults(inserted || companies.map((c, i) => ({ id: i, company_name: c.company,
          industry: c.industry, size_estimate: c.size_estimate, reason: c.why_match, status: 'suggested' })));
        await fetchHistory();
      } else {
        setError('No new prospects found. Try broadening your territory filters.');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(r) {
    setActionWorking(w => ({ ...w, [r.id]: 'adding' }));
    try {
      // Upsert on (owner_id, name) so re-adding a company you already have
      // reuses that account instead of creating a duplicate row.
      const { data: account, error: accErr } = await supabase.from('accounts').upsert({
        name: r.company_name, industry: r.industry || null, owner_id: user.id, status: 'active',
      }, { onConflict: 'owner_id,name' }).select().single();
      if (accErr) throw accErr;
      await supabase.from('prospect_suggestions').update({ status: 'added' }).eq('id', r.id);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch('https://wfbfpidkwittvlhgwnnp.supabase.co/functions/v1/generate-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ account_id: account.id }),
        });
      } catch (_) {}
      setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'added' } : x));
      await fetchHistory();
      showToast(`✅ ${r.company_name} added to Accounts`);
    } catch (e) {
      showToast(`❌ ${e.message}`, 'error');
    } finally {
      setActionWorking(w => ({ ...w, [r.id]: null }));
    }
  }

  async function handleSkip(r) {
    setActionWorking(w => ({ ...w, [r.id]: 'skipping' }));
    await supabase.from('prospect_suggestions').update({ status: 'skipped' }).eq('id', r.id);
    setResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'skipped' } : x));
    await fetchHistory();
    setActionWorking(w => ({ ...w, [r.id]: null }));
  }

  function downloadCSV() {
    const rows = (historyFilter === 'all' ? history : history.filter(h => h.status === historyFilter));
    const csv = ['Company,Industry,Size,Reason,Status,Date', ...rows.map(h =>
      [h.company_name, h.industry || '', h.size_estimate || '',
       `"${(h.reason || '').replace(/"/g, "'")}"`, h.status,
       new Date(h.created_at).toLocaleDateString()].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'account-discovery.csv'; a.click();
  }

  const addedCount = history.filter(h => h.status === 'added').length;
  const suggestedCount = history.filter(h => h.status === 'suggested').length;
  const filteredHistory = historyFilter === 'all' ? history : history.filter(h => h.status === historyFilter);

  const filtersApplied = selectedStates.length + selectedCountries.length +
    selectedIndustries.length + selectedTools.length +
    (companySize !== 'all' ? 1 : 0) + (itMode !== 'all' ? 1 : 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 28px', fontFamily: 'inherit' }}>
      {/* Page header */}
      <div style={{ maxWidth: 1140, margin: '0 auto 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              🔍 Account Discovery
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              AI generates fresh ACCELQ target accounts based on your territory — never repeats past suggestions
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {history.length > 0 && (
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b',
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px' }}>
                <span><strong style={{ color: '#0f172a' }}>{history.length}</strong> total</span>
                <span style={{ color: '#e2e8f0' }}>|</span>
                <span><strong style={{ color: '#15803d' }}>{addedCount}</strong> added</span>
                <span style={{ color: '#e2e8f0' }}>|</span>
                <span><strong style={{ color: '#d97706' }}>{suggestedCount}</strong> pending</span>
              </div>
            )}
            <button onClick={() => setHistoryOpen(true)} style={{
              padding: '8px 16px', borderRadius: 9, background: '#fff',
              border: '1.5px solid #e2e8f0', cursor: 'pointer', fontSize: 13,
              color: '#374151', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              📋 View History
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1140, margin: '0 auto', display: 'grid', gridTemplateColumns: '296px 1fr', gap: 20 }}>

        {/* ── Territory Panel ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden', height: 'fit-content' }}>
          {/* Panel header */}
          <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Territory Config</div>
            {filtersApplied > 0 && (
              <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2, fontWeight: 500 }}>
                {filtersApplied} filter{filtersApplied !== 1 ? 's' : ''} applied
              </div>
            )}
          </div>

          <div style={{ padding: '14px 14px 0' }}>
            {/* Geography */}
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 10 }}>🌍 Geography</div>

            <MultiSelect label="Countries" icon="" options={COUNTRIES}
              selected={selectedCountries} onChange={v => { setSelectedCountries(v); setSelectedStates([]); }} placeholder="Any country" />

            {availableStates.length > 0 && (<MultiSelect label="States / Provinces" icon="" options={availableStates}
              selected={selectedStates} onChange={setSelectedStates} placeholder="Any US state" />)}

            <div style={S.divider} />

            {/* Target */}
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 10 }}>🏭 Target Profile</div>

            <MultiSelect label="Industries" icon="" options={INDUSTRIES}
              selected={selectedIndustries} onChange={setSelectedIndustries} placeholder="Any industry" />

            <MultiSelect label="Tech / Tools in Use" icon="" options={TECH_TOOLS}
              selected={selectedTools} onChange={setSelectedTools} placeholder="Any tech stack" />

            {/* Company size */}
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Company Size</label>
              <select value={companySize} onChange={e => setCompanySize(e.target.value)} style={{
                width: '100%', border: `1.5px solid ${companySize !== 'all' ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff',
                color: companySize !== 'all' ? '#1d4ed8' : '#0f172a', cursor: 'pointer',
                outline: 'none', fontWeight: companySize !== 'all' ? 600 : 400,
              }}>
                {COMPANY_SIZES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* IT Services toggle */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>IT Services & Consulting</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                {[
                  { val: 'all',     label: 'All types',  emoji: '🔀' },
                  { val: 'include', label: 'Include',     emoji: '✅' },
                  { val: 'exclude', label: 'Exclude',     emoji: '🚫' },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setItMode(opt.val)} style={{
                    padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${itMode === opt.val
                      ? opt.val === 'include' ? '#22c55e' : opt.val === 'exclude' ? '#ef4444' : '#3b82f6'
                      : '#e2e8f0'}`,
                    background: itMode === opt.val
                      ? opt.val === 'include' ? '#f0fdf4' : opt.val === 'exclude' ? '#fef2f2' : '#eff6ff'
                      : '#f8fafc',
                    color: itMode === opt.val
                      ? opt.val === 'include' ? '#15803d' : opt.val === 'exclude' ? '#dc2626' : '#1d4ed8'
                      : '#94a3b8',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: 14 }}>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, minHeight: 16 }}>
                {itMode === 'include' && 'Includes IT services, consulting & SI firms'}
                {itMode === 'exclude' && 'End-user accounts only — no IT/SI firms'}
                {itMode === 'all' && 'No filter on company type'}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{ padding: '0 14px 14px' }}>
            <button onClick={handleDiscover} disabled={loading} style={{
              width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(37,99,235,0.3)',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Discovering…</>
                : '🚀 Discover Accounts'}
            </button>
          </div>
        </div>

        {/* ── Results area ── */}
        <div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠️ {error}
            </div>
          )}

          {loading && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              padding: '80px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                Finding your next accounts…
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                AI is analyzing your territory and generating target companies
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 6, justifyContent: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6',
                    animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              padding: '80px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Ready to discover accounts
              </div>
              <div style={{ fontSize: 13, color: '#64748b', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>
                Configure your territory on the left — geography, industry, tech stack — and hit{' '}
                <strong style={{ color: '#2563eb' }}>Discover Accounts</strong>.
                AI will generate fresh target companies that fit ACCELQ's ICP.
              </div>
            </div>
          )}

          {results.length > 0 && !loading && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  <strong style={{ color: '#0f172a' }}>{results.length} accounts</strong> found — add the ones worth pursuing
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {results.filter(r => r.status === 'suggested').length} pending ·{' '}
                  {results.filter(r => r.status === 'added').length} added
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
                {results.map(r => (
                  <AccountCard key={r.id} r={r}
                    onAdd={handleAdd} onSkip={handleSkip}
                    working={actionWorking[r.id]} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── History Modal ── */}
      {historyOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => e.target === e.currentTarget && setHistoryOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860,
            maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>Account Discovery History</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  {history.length} total · {addedCount} added · {suggestedCount} pending
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={downloadCSV} style={{ padding: '7px 14px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 12,
                  cursor: 'pointer', fontWeight: 500, color: '#374151' }}>
                  ⬇ Export CSV
                </button>
                <button onClick={() => setHistoryOpen(false)} style={{ padding: '7px 14px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 12,
                  cursor: 'pointer', fontWeight: 500, color: '#374151' }}>
                  ✕ Close
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 6 }}>
              {[
                { val: 'all', label: `All (${history.length})` },
                { val: 'suggested', label: `Pending (${suggestedCount})` },
                { val: 'added', label: `Added (${addedCount})` },
                { val: 'skipped', label: `Skipped (${history.filter(h=>h.status==='skipped').length})` },
              ].map(f => (
                <button key={f.val} onClick={() => setHistoryFilter(f.val)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1.5px solid ${historyFilter === f.val ? '#3b82f6' : '#e2e8f0'}`,
                  background: historyFilter === f.val ? '#eff6ff' : '#fff',
                  color: historyFilter === f.val ? '#1d4ed8' : '#64748b',
                  fontWeight: historyFilter === f.val ? 700 : 400,
                  transition: 'all 0.15s',
                }}>{f.label}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 13 }}>
                  No records in this filter
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Company','Industry','Size','Status','Discovered'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11,
                          fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((h, i) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a' }}>{h.company_name}</td>
                        <td style={{ padding: '10px 16px', color: '#64748b' }}>{h.industry || '—'}</td>
                        <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{h.size_estimate || '—'}</td>
                        <td style={{ padding: '10px 16px' }}><StatusBadge status={h.status} /></td>
                        <td style={{ padding: '10px 16px', color: '#94a3b8', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-8px); opacity: 1; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
