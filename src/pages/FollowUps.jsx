import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const DEFAULT_CADENCE = { Fresh: 0, F1: 3, F2: 4, F3: 7, F4: 7 };
const STATUS_CADENCE_KEY = { F1: 'Fresh', F2: 'F1', F3: 'F2', F4: 'F3', F5: 'F4' };
const NEXT_STAGE = { Fresh: 'F1', F1: 'F2', F2: 'F3', F3: 'F4', F4: 'F5', F5: null };
const ALL_STAGES = ['Fresh', 'F1', 'F2', 'F3', 'F4', 'F5'];

const STAGE_META = {
  Fresh: { bg: '#dbeafe', color: '#1d4ed8', label: 'Fresh' },
  F1:    { bg: '#d1fae5', color: '#065f46', label: 'F1' },
  F2:    { bg: '#fef9c3', color: '#854d0e', label: 'F2' },
  F3:    { bg: '#ffedd5', color: '#9a3412', label: 'F3' },
  F4:    { bg: '#fee2e2', color: '#991b1b', label: 'F4' },
  F5:    { bg: '#f1f5f9', color: '#475569', label: 'F5' },
};
const RESPONSE_META = {
  warm:           { bg: '#fef3c7', color: '#d97706', label: 'Warm' },
  prospect:       { bg: '#d1fae5', color: '#059669', label: 'Prospect' },
  cold:           { bg: '#e0f2fe', color: '#0369a1', label: 'Cold' },
  negative:       { bg: '#fee2e2', color: '#dc2626', label: 'Negative' },
  not_interested: { bg: '#f1f5f9', color: '#475569', label: 'Not interested' },
};
const TIMING_GROUPS = [
  { key: 'overdue', label: 'Overdue',   color: '#dc2626' },
  { key: 'today',   label: 'Due Today', color: '#059669' },
  { key: 'week',    label: 'This Week', color: '#d97706' },
  { key: 'later',   label: 'Later',     color: '#6b7280' },
  { key: 'nodate',  label: 'No Date',   color: '#94a3b8' },
];
const AVATAR_PALETTE = ['#2563eb','#7c3aed','#059669','#d97706','#0891b2','#9333ea','#dc2626'];

function getInitials(name) {
  return (name||'').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
}
function avatarColor(str) {
  let h=0; for(let i=0;i<(str||'').length;i++) h=((h<<5)-h)+str.charCodeAt(i);
  return AVATAR_PALETTE[Math.abs(h)%AVATAR_PALETTE.length];
}
function computeDue(c, cadence) {
  if (c.status==='Fresh') return c.next_followup ? new Date(c.next_followup) : null;
  const key = STATUS_CADENCE_KEY[c.status]; if (!key) return null;
  const days = (cadence||DEFAULT_CADENCE)[key]??3;
  if (c.last_contacted) { const d=new Date(c.last_contacted); d.setDate(d.getDate()+days); return d; }
  return c.next_followup ? new Date(c.next_followup) : null;
}
function getBucket(due) {
  if (!due) return 'nodate';
  const now=new Date(); if(due<now) return 'overdue';
  const todayEnd=new Date(); todayEnd.setHours(23,59,59,999); if(due<=todayEnd) return 'today';
  const weekEnd=new Date(); weekEnd.setDate(now.getDate()+7); if(due<=weekEnd) return 'week';
  return 'later';
}
function formatDue(due) {
  if (!due) return 'No date';
  const now=new Date();
  if (due<now) { const d=Math.floor((now-due)/86400000); return d===0?'Today':d===1?'1d ago':`${d}d ago`; }
  if (due.toDateString()===now.toDateString()) return 'Today';
  const tom=new Date(); tom.setDate(now.getDate()+1);
  if (due.toDateString()===tom.toDateString()) return 'Tomorrow';
  return due.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
function formatDateShort(d) {
  if (!d) return 'Never';
  const now=new Date(), date=new Date(d), diff=Math.floor((now-date)/86400000);
  if(diff===0) return 'Today'; if(diff===1) return '1d ago'; if(diff<7) return `${diff}d ago`;
  if(diff<30) return `${Math.floor(diff/7)}w ago`;
  return date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}

export default function FollowUps() {
  const { user, profile } = useAuth();
  const canViewAll = ['admin','sub-admin'].includes(profile?.role);
  const [viewAll, setViewAll] = useState(false);
  const navigate = useNavigate();

  const [cadence, setCadence] = useState(() => {
    try { return {...DEFAULT_CADENCE,...JSON.parse(localStorage.getItem('sdr_cadence')||'{}')}; }
    catch { return DEFAULT_CADENCE; }
  });
  const [autoGenerate, setAutoGenerate] = useState(
    () => localStorage.getItem('sdr_auto_generate') !== 'false'
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contacts,       setContacts]       = useState([]);
  const [accounts,       setAccounts]       = useState({});
  const [sentEmails,     setSentEmails]     = useState({});
  const [lists,          setLists]          = useState([]);
  const [contactListMap, setContactListMap] = useState({});
  const [contactNoteMap, setContactNoteMap] = useState({});
  const [companyNoteMap, setCompanyNoteMap] = useState({});
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [stageFilter,    setStageFilter]    = useState('all');
  const [timingFilter,   setTimingFilter]   = useState('all');
  const [responseFilter, setResponseFilter] = useState('all');
  const [companyFilter,  setCompanyFilter]  = useState('all');
  const [listFilter,     setListFilter]     = useState('all');
  const [senderFilter,   setSenderFilter]   = useState('all');
  const [lastSentFrom,   setLastSentFrom]   = useState('');
  const [lastSentTo,     setLastSentTo]     = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [drafts, setDraftsRaw] = useState(() => {
    try {
      const raw=JSON.parse(localStorage.getItem('sdr_drafts')||'{}');
      const cutoff=Date.now()-7*86400000; const pruned={};
      Object.entries(raw).forEach(([id,val])=>{ if(!val._savedAt||val._savedAt>cutoff) pruned[id]=val; });
      return pruned;
    } catch { return {}; }
  });
  function setDrafts(updater) {
    setDraftsRaw(prev => {
      const next=typeof updater==='function'?updater(prev):updater;
      const stamped={};
      Object.entries(next).forEach(([id,val])=>{ stamped[id]=val._savedAt?val:{...val,_savedAt:Date.now()}; });
      try { localStorage.setItem('sdr_drafts',JSON.stringify(stamped)); } catch {}
      return stamped;
    });
  }
  const [drafting,      setDrafting]      = useState(null);
  const [draftOpen,     setDraftOpen]     = useState(null);
  const [copied,        setCopied]        = useState(null);
  const [strategyOpen,  setStrategyOpen]  = useState({});
  const [historyOpen,   setHistoryOpen]   = useState({});
  const [markingSent,   setMarkingSent]   = useState(null);
  const [customPrompts, setCustomPrompts] = useState({});
  const autoGenRanRef = useRef(false);

  useEffect(() => { fetchData(); }, [viewAll]);

  async function fetchData() {
    setLoading(true);
    // Safety ceiling: this is a work queue (reps need to see the whole thing to
    // prioritize, not page through it), but an explicit cap stops it from ever
    // silently truncating past Supabase's default 1000-row return limit as the
    // org's contact volume grows. 2000 is far beyond any single queue today.
    const QUEUE_LIMIT = 2000;
    let cQuery = supabase.from('contacts').select('*');
    if (!viewAll||!canViewAll) cQuery=cQuery.eq('owner_id',user.id);
    cQuery=cQuery
      .or('status.in.(F1,F2,F3,F4,F5),and(status.eq.Fresh,next_followup.not.is.null)')
      .order('last_contacted',{ascending:false,nullsFirst:false})
      .limit(QUEUE_LIMIT);
    let aQuery = supabase.from('accounts').select('id,name,industry,research').limit(QUEUE_LIMIT);
    if (!viewAll||!canViewAll) aQuery=aQuery.eq('owner_id',user.id);
    const [cRes,aRes,lRes]=await Promise.all([
      cQuery, aQuery,
      supabase.from('activity_log').select('contact_id,details,created_at')
        .eq('actor_id',user.id).eq('activity_type','email_sent')
        .order('created_at',{ascending:false}),
    ]);
    let rows=cRes.data;
    if (cRes.error||!rows) {
      let fb=supabase.from('contacts').select('*');
      if (!viewAll||!canViewAll) fb=fb.eq('owner_id',user.id);
      const fbRes=await fb.in('status',ALL_STAGES).order('last_contacted',{ascending:false,nullsFirst:false}).limit(QUEUE_LIMIT);
      rows=(fbRes.data||[]).filter(c=>c.status!=='Fresh'||(c.status==='Fresh'&&c.next_followup));
    }
    setContacts(rows||[]);
    const accMap={};
    (aRes.data||[]).forEach(a=>{accMap[a.id]=a;});
    setAccounts(accMap);
    const emailMap={};
    (lRes.data||[]).forEach(row=>{
      if(!emailMap[row.contact_id]) emailMap[row.contact_id]=[];
      if(row.details?.body) emailMap[row.contact_id].push({subject:row.details.subject||'',body:row.details.body,stage:row.details.from_stage||'',date:row.created_at});
    });
    setSentEmails(emailMap);
    let lqQuery=supabase.from('lists').select('id,name');
    if (!viewAll||!canViewAll) lqQuery=lqQuery.eq('owner_id',user.id);
    // contact_lists used to be fetched with no scoping at all (every membership
    // row for every contact in the whole org, regardless of viewAll/role).
    // Scope it to just the contacts actually loaded above instead.
    const rowIds = (rows||[]).map(c=>c.id);
    const companyNames = [...new Set((rows||[]).map(c=>c.company).filter(Boolean))];
    const [listsRes,clRes,cnRes,conRes]=await Promise.all([
      lqQuery,
      rowIds.length > 0
        ? supabase.from('contact_lists').select('contact_id,list_id,is_active_campaign').in('contact_id', rowIds)
        : Promise.resolve({ data: [] }),
      rowIds.length > 0
        ? supabase.from('contact_notes').select('contact_id,body,created_at').in('contact_id', rowIds).order('created_at',{ascending:false})
        : Promise.resolve({ data: [] }),
      companyNames.length > 0
        ? supabase.from('company_notes').select('company_name,body,created_at').in('company_name', companyNames).order('created_at',{ascending:false})
        : Promise.resolve({ data: [] }),
    ]);
    setLists(listsRes.data||[]);
    const clMap={};
    (clRes.data||[]).forEach(cl=>{
      if(!clMap[cl.contact_id]) clMap[cl.contact_id]=[];
      clMap[cl.contact_id].push({list_id:cl.list_id,is_active_campaign:cl.is_active_campaign});
    });
    setContactListMap(clMap);
    // Rows are ordered newest-first, so the first entry per key is the most recent note.
    const cnMap={};
    (cnRes.data||[]).forEach(n=>{ if(!cnMap[n.contact_id]) cnMap[n.contact_id]=n.body; });
    setContactNoteMap(cnMap);
    const conMap={};
    (conRes.data||[]).forEach(n=>{ if(!conMap[n.company_name]) conMap[n.company_name]=n.body; });
    setCompanyNoteMap(conMap);
    setLoading(false);
    return rows||[];
  }

  useEffect(()=>{
    if(loading||autoGenRanRef.current||!autoGenerate) return;
    autoGenRanRef.current=true;
    const queue=contacts.filter(c=>{
      const due=computeDue(c,cadence); const b=getBucket(due);
      return (b==='overdue'||b==='today')&&!drafts[c.id];
    });
    if(!queue.length) return;
    let i=0;
    async function runNext() {
      if(i>=queue.length) return;
      await doGenerate(queue[i++],true);
      setTimeout(runNext,400);
    }
    runNext();
  },[loading]);

  function saveCadence(next){setCadence(next);localStorage.setItem('sdr_cadence',JSON.stringify(next));}
  function toggleAutoGen(){const n=!autoGenerate;setAutoGenerate(n);localStorage.setItem('sdr_auto_generate',String(n));}

  async function exportQueueCSV(){ const csvField=v=>{v=(v==null?'':String(v)); var Q=String.fromCharCode(34); var NL=String.fromCharCode(10); var CR=String.fromCharCode(13); var bad=v.indexOf(Q)>-1||v.indexOf(',')>-1||v.indexOf(NL)>-1||v.indexOf(CR)>-1; if(!bad) return v; var out=Q; for(var j=0;j<v.length;j++){var ch=v[j]; out+=ch; if(ch===Q) out+=Q;} out+=Q; return out;}; const allList=[...filteredFresh,...filteredActive]; const list=selectedIds&&selectedIds.size>0?allList.filter(c=>selectedIds.has(c.id)):allList; if(!list.length) return; const ids=list.map(c=>c.id); const { data:acts } = await supabase.from('activity_log').select('contact_id,activity_type,details,created_at').in('contact_id',ids).order('created_at',{ascending:true}); const stageDates={}; (acts||[]).forEach(a=>{ let stage=null; if(a.activity_type==='contact_created') stage='Fresh'; else if(a.activity_type==='status_changed') stage=a.details?.status; else if(a.activity_type==='stage_advanced') stage=a.details?.to; else if(a.activity_type==='email_sent') stage=a.details?.to_stage; if(!stage||!ALL_STAGES.includes(stage)) return; stageDates[a.contact_id]=stageDates[a.contact_id]||{}; if(!stageDates[a.contact_id][stage]) stageDates[a.contact_id][stage]=a.created_at; }); const RESPONSE_LABELS_EXPORT={cold:'Cold',warm:'Warm',prospect:'Prospect',negative:'Negative',not_interested:'Not Interested',bounce:'Bounce'}; const STAGE_COLS=[]; ALL_STAGES.forEach(s=>{STAGE_COLS.push(s+' Subject');STAGE_COLS.push(s+' Email');}); const COLUMNS=['id','first_name','last_name','email','phone','title','company','account_id','status','next_followup','notes','response_type','linkedin_url','owner_id','created_at','updated_at','last_contacted','sequence_step','response_state','sender_email','pitch','persona','pitch_type','last_touchpoint_date','response_notes','source','bounced','bounced_at','Contact Note','Company Note','Fresh','F1','F2','F3','F4','F5','Response',...STAGE_COLS]; const rows=list.map(c=>{ const sd=stageDates[c.id]||{}; const row={...c}; ALL_STAGES.forEach(s=>{row[s]=sd[s]?new Date(sd[s]).toLocaleDateString():'';}); row.Response=c.response_type?(RESPONSE_LABELS_EXPORT[c.response_type]||c.response_type):''; row['Contact Note']=contactNoteMap[c.id]||''; row['Company Note']=c.company?(companyNoteMap[c.company]||''):''; const emailsByStage={}; (sentEmails[c.id]||[]).forEach(e=>{ if(e.stage&&!emailsByStage[e.stage]) emailsByStage[e.stage]=e; }); const draft=drafts[c.id]; if(draft&&c.status&&!emailsByStage[c.status]) emailsByStage[c.status]={subject:draft.subject,body:draft.body}; ALL_STAGES.forEach(s=>{ row[s+' Subject']=emailsByStage[s]?.subject||''; row[s+' Email']=emailsByStage[s]?.body||''; }); return COLUMNS.map(k=>csvField(row[k])).join(','); }); const csv=[COLUMNS.join(','),...rows].join(String.fromCharCode(10)); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='followup_queue_export.csv';a.click(); URL.revokeObjectURL(url); } async function doGenerate(contact,silent=false,customPrompt=null){
    if(!silent){setDrafting(contact.id);setDraftOpen(contact.id);}
    const account=accounts[contact.account_id]||{};
    const senderName=profile?.full_name||user?.email?.split('@')[0]||'SDR';
    const priorBodies=(sentEmails[contact.id]||[]).slice(0,5).map(e=>e.subject?'Subject: '+e.subject+'\n\n'+e.body:e.body);
    const emailStage=contact.status==='Fresh'?'Fresh':contact.status;
    try {
      const res=await supabase.functions.invoke('generate-email',{body:{
        contact:{
          full_name:((contact.first_name||'')+' '+(contact.last_name||'')).trim(),
          title:contact.title,company:contact.company,email:contact.email,
          response:contact.response_type,industry:account.industry,
          persona:contact.persona,pitch_type:contact.pitch_type,pitch:contact.pitch,campaign:contact.campaign,
          contact_note:contactNoteMap[contact.id]||contact.notes||'',
        },
        stage:emailStage, customPrompt:customPrompt||null,
        accountResearch:account.research||{}, accountNote:companyNoteMap[contact.company]||account.notes||'',
        senderName, priorEmailBodies:priorBodies,
      }});
      if(!res.error&&res.data?.subject){
        setDrafts(d=>({...d,[contact.id]:{subject:res.data.subject,body:res.data.body,strategy:res.data.strategy||null}}));
        if(!silent) setDraftOpen(contact.id);
      }
    } catch(e){console.error(e);}
    if(!silent) setDrafting(null);
  }

  async function markSent(contact){
    const next=contact.status==='F5'?'cooling_off':NEXT_STAGE[contact.status]; if(!next) return;
    setMarkingSent(contact.id);
    const draft=drafts[contact.id];
    const now=new Date().toISOString();
    const daysToNext=(cadence[contact.status]??3);
    const nextDue=new Date(); nextDue.setDate(nextDue.getDate()+daysToNext);
    await supabase.from('contacts').update({
      status:next, sequence_step:ALL_STAGES.indexOf(next),
      last_contacted:now, last_touchpoint_date:now, next_followup:nextDue.toISOString(),
    }).eq('id',contact.id);
    // mark campaign active; if F5 sent mark complete
    const cls=contactListMap[contact.id]||[];
    for(const cl of cls){
      if(contact.status==='F5'){
        await supabase.from('contact_lists').update({is_active_campaign:false}).eq('contact_id',contact.id).eq('list_id',cl.list_id);
      } else if(!cl.is_active_campaign){
        await supabase.from('contact_lists').update({is_active_campaign:true}).eq('contact_id',contact.id).eq('list_id',cl.list_id);
      }
    }
    await supabase.from('activity_log').insert({
      actor_id:user.id, contact_id:contact.id, activity_type:'email_sent',
      details:{from_stage:contact.status,to_stage:next,subject:draft?.subject||'',body:draft?.body||''},
    });
    await supabase.from('emails').insert({
      contact_id:contact.id, owner_id:user.id, stage:contact.status,
      subject:draft?.subject||'', body:draft?.body||'', direction:'outbound', sent_at:now,
    });
    setDrafts(d=>{const nd={...d};delete nd[contact.id];return nd;});
    setDraftOpen(o=>o===contact.id?null:o);
    setMarkingSent(null);
    fetchData();
  }

  async function snooze(id,days){
    const d=new Date(); d.setDate(d.getDate()+days);
    await supabase.from('contacts').update({next_followup:d.toISOString(),last_contacted:d.toISOString()}).eq('id',id);
    fetchData();
  }
  function copyDraft(id){
    const draft=drafts[id]; if(!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(id); setTimeout(()=>setCopied(c=>c===id?null:c),2000);
  }

  const freshContacts=contacts.filter(c=>c.status==='Fresh');
  const activeContacts=contacts.filter(c=>c.status!=='Fresh');
  const enriched=activeContacts.map(c=>{const due=computeDue(c,cadence);return{...c,_due:due,_bucket:getBucket(due),_hasDraft:!!drafts[c.id]};});
  const enrichedFresh=freshContacts.map(c=>({...c,_due:computeDue(c,cadence),_bucket:getBucket(computeDue(c,cadence)),_hasDraft:!!drafts[c.id]}));
  const stageCounts={};
  ALL_STAGES.forEach(s=>{stageCounts[s]=contacts.filter(c=>c.status===s).length;});
  const overdueCt=[...enriched,...enrichedFresh].filter(c=>c._bucket==='overdue').length;
  const todayCt=[...enriched,...enrichedFresh].filter(c=>c._bucket==='today').length;
  const readyCt=[...enriched,...enrichedFresh].filter(c=>c._hasDraft).length;
  const uniqueCompanies=[...new Set(contacts.map(c=>c.company).filter(Boolean))].sort();
  const uniqueSenders=[...new Set(contacts.map(c=>c.sender_email).filter(Boolean))].sort();

  function applyFilters(list){
    return list.filter(c=>{
      if(stageFilter!=='all'&&c.status!==stageFilter) return false;
      if(timingFilter!=='all'&&c._bucket!==timingFilter) return false;
      if(responseFilter!=='all'&&c.response_type!==responseFilter) return false;
      if(companyFilter!=='all'&&c.company!==companyFilter) return false;
      if(senderFilter!=='all'&&c.sender_email!==senderFilter) return false;
      if(lastSentFrom||lastSentTo){
        const lt=c.last_touchpoint_date||c.last_contacted;
        if(!lt) return false;
        const ltDate=new Date(lt);
        if(lastSentFrom&&ltDate<new Date(lastSentFrom)) return false;
        if(lastSentTo&&ltDate>new Date(lastSentTo+'T23:59:59')) return false;
      }
      if(listFilter!=='all'){
        const cls=contactListMap[c.id]||[];
        if(!cls.some(cl=>cl.list_id===listFilter)) return false;
      }
      if(search){
        const q=search.toLowerCase();
        if(!((c.first_name||'')+' '+(c.last_name||'')).toLowerCase().includes(q)&&
           !c.company?.toLowerCase().includes(q)&&!c.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  const filteredFresh=applyFilters(enrichedFresh);
  const filteredActive=applyFilters(enriched);
  const groups=TIMING_GROUPS.map(g=>{
    const items=filteredActive.filter(c=>c._bucket===g.key);
    items.sort((a,b)=>{if(a._hasDraft!==b._hasDraft) return a._hasDraft?-1:1; if(a._due&&b._due) return a._due-b._due; return 0;});
    return{...g,items};
  }).filter(g=>g.items.length>0);
  const activeGroups=timingFilter==='all'?groups:groups.filter(g=>g.key===timingFilter);
  const showFresh=stageFilter==='all'||stageFilter==='Fresh';
  const anyFilter=search||stageFilter!=='all'||timingFilter!=='all'||responseFilter!=='all'||companyFilter!=='all'||listFilter!=='all'||senderFilter!=='all'||lastSentFrom||lastSentTo;
  function clearFilters(){setSearch('');setStageFilter('all');setTimingFilter('all');setResponseFilter('all');setCompanyFilter('all');setListFilter('all');setSenderFilter('all');setLastSentFrom('');setLastSentTo('');}
  function toggleSelect(id){
    setSelectedIds(prev=>{ const next=new Set(prev); if(next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function clearSelection(){ setSelectedIds(new Set()); }
  const totalInQueue=contacts.length;
  const sharedProps={
    accounts,drafts,drafting,draftOpen,copied,markingSent,contactListMap,lists,sentEmails,
    strategyOpen,setStrategyOpen,
    historyOpen,setHistoryOpen,
    onGenerate:(c,cp)=>doGenerate(c,false,cp),
    onToggleDraft:c=>setDraftOpen(d=>d===c.id?null:c.id),
    onRegenerate:(c,cp)=>doGenerate(c,false,cp),
    onMarkSent:c=>markSent(c), onSnooze:(id,days)=>snooze(id,days),
    onCopy:id=>copyDraft(id), onView:id=>navigate(`/contacts/${id}`),
    selectedIds, onToggleSelect:toggleSelect,
    customPrompts, onCustomPromptChange:(id,val)=>setCustomPrompts(p=>({...p,[id]:val})),
  };
  const noResults=filteredFresh.length===0&&filteredActive.length===0;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'#f8f9fb'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
        {/* Title row */}
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 24px 10px',flexWrap:'wrap'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <h1 style={{fontSize:18,fontWeight:700,color:'#111',margin:0}}>Follow-up Queue</h1>
              {canViewAll&&(
                <button onClick={()=>setViewAll(v=>!v)}
                  style={{padding:'3px 10px',borderRadius:20,border:'1.5px solid #e0e0e0',fontSize:11,fontWeight:600,cursor:'pointer',
                    background:viewAll?'#111':'#fff',color:viewAll?'#fff':'#555'}}>
                  {viewAll?'Team':'View all'}
                </button>
              )}
            </div>
            <p style={{fontSize:12,color:'#6b7280',margin:'2px 0 0'}}>Fresh to F5 — draft, review, mark sent</p>
          </div>
          <div style={{flex:1}}/>
          <div style={{display:'flex',gap:7,alignItems:'center'}}>
            {overdueCt>0&&<div onClick={()=>setTimingFilter(f=>f==='overdue'?'all':'overdue')}
              style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:'#dc2626',cursor:'pointer',
                background:timingFilter==='overdue'?'#fee2e2':'#fff5f5',border:`1.5px solid ${timingFilter==='overdue'?'#dc2626':'#fca5a5'}`}}>
              {overdueCt} overdue</div>}
            {todayCt>0&&<div onClick={()=>setTimingFilter(f=>f==='today'?'all':'today')}
              style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:'#059669',cursor:'pointer',
                background:timingFilter==='today'?'#d1fae5':'#f0fdf4',border:`1.5px solid ${timingFilter==='today'?'#059669':'#6ee7b7'}`}}>
              {todayCt} today</div>}
            {readyCt>0&&<div style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',border:'1.5px solid #c4b5fd'}}>
              {readyCt} ready</div>}
            {freshContacts.length>0&&<div onClick={()=>setStageFilter(f=>f==='Fresh'?'all':'Fresh')}
              style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:'#1d4ed8',cursor:'pointer',
                background:stageFilter==='Fresh'?'#dbeafe':'#eff6ff',border:`1.5px solid ${stageFilter==='Fresh'?'#2563eb':'#93c5fd'}`}}>
              {freshContacts.length} new</div>}
            <div style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:500,color:'#6b7280',background:'#f9fafb',border:'1px solid #e5e7eb'}}>
              {totalInQueue} in queue</div>
          </div>
          {selectedIds.size>0&&(
            <button onClick={clearSelection} style={{padding:'6px 10px',borderRadius:8,border:'1.5px solid #d1d5db',background:'#fff',color:'#6b7280',fontSize:12,fontWeight:600,cursor:'pointer',marginRight:6}}>{selectedIds.size} selected ✕</button>
          )}
          <button onClick={exportQueueCSV} style={{padding:'6px 14px',borderRadius:8,border:'1.5px solid #e5e7eb',background:'#fff',color:'#2563eb',fontSize:12,fontWeight:600,cursor:'pointer',marginRight:6}}>{'↓ CSV'+(selectedIds.size>0?' ('+selectedIds.size+')':'')}</button><button onClick={()=>setSettingsOpen(s=>!s)}
            style={{padding:'6px 14px',borderRadius:8,border:`1.5px solid ${settingsOpen?'#2563eb':'#e5e7eb'}`,
              background:settingsOpen?'#dbeafe':'#fff',color:settingsOpen?'#1d4ed8':'#374151',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            Settings {settingsOpen?'▲':'▼'}
          </button>
        </div>

        {/* Settings panel */}
        {settingsOpen&&(
          <div style={{borderTop:'1px solid #f3f4f6',background:'#f9fafb',padding:'16px 24px 18px'}}>
            <div style={{display:'flex',gap:28,alignItems:'flex-start',flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Cadence (days between emails)</div>
                <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                  {['Fresh','F1','F2','F3','F4'].map(key=>(
                    <div key={key} style={{textAlign:'center'}}>
                      <div style={{fontSize:10,color:'#6b7280',marginBottom:4,fontWeight:600}}>{key}</div>
                      <input type="number" min="0" max="60" value={cadence[key]??DEFAULT_CADENCE[key]}
                        onChange={e=>saveCadence({...cadence,[key]:Number(e.target.value)})}
                        style={{width:52,padding:'5px 4px',textAlign:'center',borderRadius:7,border:'1.5px solid #d1d5db',fontSize:14,fontWeight:700,color:'#1d4ed8',background:'#fff',outline:'none'}}/>
                    </div>
                  ))}
                  <button onClick={()=>saveCadence({...DEFAULT_CADENCE})}
                    style={{padding:'5px 11px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,color:'#6b7280',cursor:'pointer',marginBottom:1}}>Reset</button>
                </div>
              </div>
              <div style={{width:1,background:'#e5e7eb',alignSelf:'stretch',flexShrink:0}}/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Auto-generation</div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div onClick={toggleAutoGen}
                    style={{position:'relative',width:46,height:26,borderRadius:13,cursor:'pointer',background:autoGenerate?'#2563eb':'#d1d5db',transition:'background 0.2s',flexShrink:0}}>
                    <div style={{position:'absolute',top:3,left:autoGenerate?23:3,width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.25)',transition:'left 0.2s'}}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:autoGenerate?'#2563eb':'#6b7280'}}>{autoGenerate?'On':'Off'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter row */}
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'8px 24px 12px'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, company, email..."
            style={{paddingLeft:12,paddingRight:10,paddingTop:6,paddingBottom:6,borderRadius:8,border:'1px solid #e5e7eb',fontSize:12,width:190,outline:'none',background:'#f9fafb'}}/>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:10,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Stage:</span>
            {['all',...ALL_STAGES].map(s=>{
              const m=STAGE_META[s]; const active=stageFilter===s;
              return <button key={s} onClick={()=>setStageFilter(s)}
                style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',border:'none',
                  background:active?(m?.bg||'#dbeafe'):'#f3f4f6',color:active?(m?.color||'#1d4ed8'):'#6b7280'}}>
                {s==='all'?`All (${totalInQueue})`:`${s} (${stageCounts[s]||0})`}
              </button>;
            })}
          </div>
          <div style={{display:'flex',gap:4}}>
            {['overdue','today','week','later'].map(t=>(
              <button key={t} onClick={()=>setTimingFilter(f=>f===t?'all':t)}
                style={{padding:'4px 9px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',border:'none',
                  background:timingFilter===t?'#dbeafe':'#f3f4f6',color:timingFilter===t?'#1d4ed8':'#6b7280'}}>
                {t}
              </button>
            ))}
          </div>
          <select value={responseFilter} onChange={e=>setResponseFilter(e.target.value)}
            style={{padding:'5px 8px',borderRadius:8,border:'1px solid #e5e7eb',fontSize:12,background:'#f9fafb',color:'#374151',cursor:'pointer'}}>
            <option value="all">All responses</option>
            {Object.entries(RESPONSE_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          {uniqueCompanies.length>1&&(
            <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}
              style={{padding:'5px 8px',borderRadius:8,border:'1px solid #e5e7eb',fontSize:12,background:'#f9fafb',color:'#374151',cursor:'pointer',maxWidth:160}}>
              <option value="all">All companies</option>
              {uniqueCompanies.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {lists.length>0&&(
            <select value={listFilter} onChange={e=>setListFilter(e.target.value)}
              style={{padding:'5px 8px',borderRadius:8,border:`1px solid ${listFilter!=='all'?'#2563eb':'#e5e7eb'}`,
                fontSize:12,background:listFilter!=='all'?'#eff6ff':'#f9fafb',color:'#374151',cursor:'pointer',maxWidth:170}}>
              <option value="all">All lists</option>
              {lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
                              {uniqueSenders.length>1&&(
            <select value={senderFilter} onChange={e=>setSenderFilter(e.target.value)}
              style={{padding:'5px 8px',borderRadius:8,border:(senderFilter!=='all'?'1px solid #2563eb':'1px solid #e5e7eb'),
                fontSize:12,background:senderFilter!=='all'?'#eff6ff':'#f9fafb',color:'#374151',cursor:'pointer',maxWidth:170}}>
              <option value="all">All senders</option>
              {uniqueSenders.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:10,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Last sent:</span>
            <input type="date" value={lastSentFrom} onChange={e=>setLastSentFrom(e.target.value)}
              style={{padding:'4px 6px',borderRadius:6,border:(lastSentFrom?'1px solid #2563eb':'1px solid #e5e7eb'),fontSize:11,background:lastSentFrom?'#eff6ff':'#f9fafb',color:'#374151'}}/>
            <span style={{fontSize:11,color:'#9ca3af'}}>to</span>
            <input type="date" value={lastSentTo} onChange={e=>setLastSentTo(e.target.value)}
              style={{padding:'4px 6px',borderRadius:6,border:(lastSentTo?'1px solid #2563eb':'1px solid #e5e7eb'),fontSize:11,background:lastSentTo?'#eff6ff':'#f9fafb',color:'#374151'}}/>
          </div>
          {anyFilter&&<button onClick={clearFilters}
            style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:500,color:'#dc2626',background:'#fef2f2',border:'none',cursor:'pointer'}}>
            Clear filters
          </button>}
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
        {loading?(
          <div style={{textAlign:'center',padding:'80px 20px',color:'#9ca3af'}}>Loading queue...</div>
        ):totalInQueue===0?(
          <div style={{textAlign:'center',padding:'80px 20px'}}>
            <div style={{fontSize:44,marginBottom:14}}>🎉</div>
            <div style={{fontSize:16,fontWeight:700,color:'#374151'}}>Queue is empty!</div>
            <div style={{fontSize:13,color:'#6b7280',marginTop:6}}>Go to Accounts and click Start on a contact to begin outreach</div>
          </div>
        ):noResults?(
          <div style={{textAlign:'center',padding:'80px 20px'}}>
            <div style={{fontSize:32,marginBottom:10}}>🔍</div>
            <div style={{fontSize:14,fontWeight:600,color:'#374151'}}>No matches</div>
            <button onClick={clearFilters} style={{marginTop:14,padding:'8px 18px',background:'#2563eb',color:'#fff',borderRadius:8,border:'none',fontSize:13,cursor:'pointer',fontWeight:600}}>Clear filters</button>
          </div>
        ):(
          <>
            {showFresh&&filteredFresh.length>0&&<FreshSection contacts={filteredFresh} {...sharedProps}/>}
            {(stageFilter==='all'||stageFilter!=='Fresh')&&activeGroups.map(group=>(
              <TimingGroup key={group.key} group={group} {...sharedProps}/>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FreshSection({contacts,...props}){
  const readyItems=contacts.filter(c=>c._hasDraft);
  const needsItems=contacts.filter(c=>!c._hasDraft);
  const sorted=[...readyItems.sort((a,b)=>(a._due||0)-(b._due||0)),...needsItems.sort((a,b)=>(a._due||0)-(b._due||0))];
  return(
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:700,color:'#1d4ed8',padding:'3px 14px',background:'#dbeafe',borderRadius:20,flexShrink:0}}>
          New Contacts · {contacts.length}
        </span>
        <div style={{flex:1,height:1,background:'#e5e7eb'}}/>
        <span style={{fontSize:11,color:'#6b7280',flexShrink:0}}>Draft initial email → Mark Sent → moves to F1</span>
        {readyItems.length>0&&<span style={{fontSize:11,fontWeight:600,color:'#7c3aed',padding:'2px 9px',background:'#f5f3ff',borderRadius:12,border:'1px solid #ede9fe',flexShrink:0}}>{readyItems.length} ready</span>}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {sorted.map(c=><ContactRow key={c.id} contact={c} {...props} isFresh/>)}
      </div>
    </div>
  );
}

function TimingGroup({group,...props}){
  const readyItems=group.items.filter(c=>c._hasDraft);
  const needsItems=group.items.filter(c=>!c._hasDraft);
  return(
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:700,color:group.color,padding:'3px 14px',background:group.color+'18',borderRadius:20,flexShrink:0}}>
          {group.label} · {group.items.length}
        </span>
        <div style={{flex:1,height:1,background:'#e5e7eb'}}/>
        {readyItems.length>0&&<span style={{fontSize:11,fontWeight:600,color:'#7c3aed',padding:'2px 9px',background:'#f5f3ff',borderRadius:12,border:'1px solid #ede9fe',flexShrink:0}}>{readyItems.length} ready</span>}
      </div>
      {readyItems.length>0&&(
        <>
          <div style={{fontSize:10,fontWeight:700,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5,paddingLeft:4}}>Ready to Send</div>
          <div style={{display:'flex',flexDirection:'column',gap:7,marginBottom:needsItems.length?14:0}}>
            {readyItems.map(c=><ContactRow key={c.id} contact={c} {...props}/>)}
          </div>
        </>
      )}
      {needsItems.length>0&&(
        <>
          {readyItems.length>0&&<div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5,paddingLeft:4}}>Needs Email</div>}
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {needsItems.map(c=><ContactRow key={c.id} contact={c} {...props}/>)}
          </div>
        </>
      )}
    </div>
  );
}

function ContactRow({contact:c,accounts,drafts,drafting,draftOpen,copied,markingSent,
  contactListMap,lists,sentEmails,strategyOpen,setStrategyOpen,historyOpen,setHistoryOpen,
  onGenerate,onToggleDraft,onRegenerate,onMarkSent,onSnooze,onCopy,onView,isFresh,
  customPrompts,onCustomPromptChange,selectedIds,onToggleSelect}){
  const customPrompt=customPrompts?.[c.id]||'';
  const sm=STAGE_META[c.status]||{bg:'#f1f5f9',color:'#475569',label:c.status};
  const rm=c.response_type?RESPONSE_META[c.response_type]:null;
  const account=accounts[c.account_id];
  const draft=drafts[c.id]; const hasDraft=!!draft;
  const sentHistory=(sentEmails||{})[c.id]||[];
  const isOverdue=c._bucket==='overdue';
  const isDrafting=drafting===c.id; const isDraftOpen=draftOpen===c.id;
  const isMarking=markingSent===c.id; const isCopied=copied===c.id;
  const ac=avatarColor(((c.first_name||'')+' '+(c.last_name||'')).trim());
  const contactLists=contactListMap?.[c.id]||[];
  const hasActiveCampaign=contactLists.some(cl=>cl.is_active_campaign);
  const listNames=contactLists.map(cl=>(lists||[]).find(l=>l.id===cl.list_id)?.name).filter(Boolean);
  const lastTouch=c.last_touchpoint_date||c.last_contacted||(sentHistory&&sentHistory[0]&&sentHistory[0].date);
  const markSentLabel=c.status==='Fresh'?'Send → F1':c.status==='F5'?'Send → Cooling off':'Mark Sent';
  const draftBtnLabel=isDrafting?'Drafting...':hasDraft?(isDraftOpen?'Hide Draft':'Show Draft'):c.status==='Fresh'?'Draft Initial Email':'Draft Email';

  return(
    <div style={{background:'#fff',borderRadius:10,overflow:'hidden',
      border:`1px solid ${hasDraft?'#e9d5ff':isFresh?'#bfdbfe':'#e5e7eb'}`,
      borderLeft:`3px solid ${hasDraft?'#7c3aed':isFresh?'#2563eb':isOverdue?'#ef4444':'#e5e7eb'}`,
      boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      {/* Main row */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px'}}>
        <input type="checkbox" checked={selectedIds?selectedIds.has(c.id):false} onChange={()=>onToggleSelect&&onToggleSelect(c.id)}
          style={{width:15,height:15,flexShrink:0,cursor:'pointer'}}/>
        {c.linkedin_url&&(
          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="Open LinkedIn profile"
            style={{flexShrink:0,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:4,background:'#0A66C2',color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>
            in
          </a>
        )}
        <div onClick={()=>onView(c.id)} style={{width:36,height:36,borderRadius:'50%',background:ac,color:'#fff',
          display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,cursor:'pointer',userSelect:'none'}}>
          {getInitials(((c.first_name||'')+' '+(c.last_name||'')).trim())}
        </div>
        <div style={{flex:'0 0 200px',minWidth:0,cursor:'pointer'}} onClick={()=>onView(c.id)}>
          <div style={{fontSize:13,fontWeight:600,color:'#111',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {((c.first_name||'')+' '+(c.last_name||'')).trim()}
          </div>
          <div style={{fontSize:11,color:'#6b7280',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {c.title?`${c.title} · `:''}{c.company||'—'}
          </div>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:6,background:sm.bg,color:sm.color,flexShrink:0,whiteSpace:'nowrap'}}>{sm.label}</span>
        {rm&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:rm.bg,color:rm.color,fontWeight:500,flexShrink:0}}>{rm.label}</span>}
        {sentHistory.length>0&&(
          <button onClick={()=>setHistoryOpen(h=>({...h,[c.id]:!h[c.id]}))}
            style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:historyOpen[c.id]?'#f0fdf4':'#f9fafb',
              border:'1px solid #d1d5db',color:historyOpen[c.id]?'#059669':'#6b7280',
              cursor:'pointer',fontWeight:600,flexShrink:0}}>
            {sentHistory.length} sent
          </button>
        )}
        {listNames.length>0&&(
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:'#eff6ff',color:'#2563eb',
            fontWeight:600,flexShrink:0,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
            title={listNames.join(', ')}>
            {hasActiveCampaign?'🟢 ':''}{listNames[0]}{listNames.length>1?` +${listNames.length-1}`:''}
          </span>
        )}
        {account&&<span style={{fontSize:11,color:'#6b7280',flexShrink:0,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{account.name}</span>}
        <div style={{flex:1}}/>
        {lastTouch&&(
          <div style={{fontSize:10,color:'#9ca3af',flexShrink:0,textAlign:'right',lineHeight:1.4}}>
            <div>Last sent</div>
            <div style={{fontWeight:600,color:'#6b7280'}}>{new Date(lastTouch).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</div>
          </div>
        )}
        <div style={{fontSize:11,fontWeight:600,flexShrink:0,width:72,textAlign:'right',color:isOverdue?'#dc2626':c._due?'#374151':'#d1d5db'}}>
          {isOverdue&&'⚠ '}{formatDue(c._due)}
        </div>
        <div style={{display:'flex',gap:5,flexShrink:0,alignItems:'center'}}>
          <button onClick={hasDraft?()=>onToggleDraft(c):()=>onGenerate(c,customPrompt)} disabled={isDrafting}
            style={{padding:'5px 11px',borderRadius:7,fontSize:11,fontWeight:600,border:'none',cursor:isDrafting?'wait':'pointer',
              background:hasDraft?(isDraftOpen?'#ede9fe':'#f5f3ff'):'linear-gradient(135deg,#7c3aed,#2563eb)',
              color:hasDraft?'#7c3aed':'#fff',boxShadow:!hasDraft?'0 1px 4px rgba(37,99,235,0.3)':'none'}}>
            {draftBtnLabel}
          </button>
          {hasDraft&&<button onClick={()=>onMarkSent(c)} disabled={isMarking}
            style={{padding:'5px 11px',borderRadius:7,fontSize:11,fontWeight:700,border:'none',
              background:isMarking?'#d1fae5':'#059669',color:'#fff',cursor:isMarking?'wait':'pointer'}}>
            {isMarking?'Done!':markSentLabel}
          </button>}
          <select onChange={e=>{if(e.target.value){onSnooze(c.id,Number(e.target.value));e.target.value='';}}}
            style={{padding:'5px 6px',borderRadius:7,border:'1px solid #e5e7eb',fontSize:11,background:'#f9fafb',color:'#374151',cursor:'pointer'}}>
            <option value="">Snooze...</option>
            <option value="1">Tomorrow</option><option value="3">3 days</option>
            <option value="7">1 week</option><option value="14">2 weeks</option>
          </select>
          <button onClick={()=>onView(c.id)}
            style={{padding:'5px 9px',borderRadius:7,fontSize:11,fontWeight:600,border:'1px solid #e5e7eb',background:'#fff',color:'#6b7280',cursor:'pointer'}}>
            →
          </button>
        </div>
      </div>

      {/* Draft panel */}
      {isDraftOpen&&(
        <div style={{borderTop:`1px solid ${hasDraft?'#ede9fe':'#f3f4f6'}`,background:'#fdf8ff',padding:'14px 16px'}}>
          {isDrafting?(
            <div style={{textAlign:'center',padding:'28px 0',color:'#7c3aed'}}>
              <div style={{fontSize:13,fontWeight:700}}>Generating {sm.label} email...</div>
              <div style={{fontSize:11,color:'#9ca3af',marginTop:5}}>Using account research + prior email context</div>
            </div>
          ):draft?(
            <>
              <div style={{marginBottom:12}}>
                <textarea value={customPrompt} onChange={e=>onCustomPromptChange(c.id,e.target.value)}
                  placeholder="Add custom instructions... (e.g. 'mention their Selenium migration', 'keep under 80 words')"
                  rows={2} style={{width:'100%',fontSize:12,padding:'8px 10px',borderRadius:7,border:'1px solid #d8b4fe',
                    background:'#faf5ff',color:'#374151',resize:'vertical',fontFamily:'inherit',outline:'none',boxSizing:'border-box',lineHeight:1.5}}/>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:'#374151',flex:1}}>AI Draft — {c.status==='Fresh'?'Initial Email':sm.label}</div>
                {draft.strategy&&(
                  <button onClick={()=>setStrategyOpen(s=>({...s,[c.id]:!s[c.id]}))}
                    title="View email strategy"
                    style={{width:22,height:22,borderRadius:'50%',border:'1.5px solid #6d28d9',
                      background:strategyOpen[c.id]?'#6d28d9':'#fff',
                      color:strategyOpen[c.id]?'#fff':'#6d28d9',
                      fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0,
                      display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                    i
                  </button>
                )}
                <button onClick={()=>onRegenerate(c,customPrompt)} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #e5e7eb',background:'#fff',color:'#7c3aed',cursor:'pointer',fontWeight:500}}>Regenerate</button>
                <button onClick={()=>onCopy(c.id)} style={{fontSize:11,padding:'3px 12px',borderRadius:6,border:'none',background:isCopied?'#059669':'#6d28d9',color:'#fff',cursor:'pointer',fontWeight:600}}>{isCopied?'Copied!':'Copy'}</button>
                <button onClick={()=>onMarkSent(c)} disabled={isMarking} style={{fontSize:11,padding:'3px 12px',borderRadius:6,border:'none',background:isMarking?'#6ee7b7':'#059669',color:'#fff',cursor:isMarking?'wait':'pointer',fontWeight:700}}>{isMarking?'Done!':markSentLabel}</button>
                <a href={`mailto:${c.email||''}?subject=${encodeURIComponent(draft?.subject||'')}&body=${encodeURIComponent(draft?.body||'')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{fontSize:11,padding:'3px 12px',borderRadius:6,border:'1px solid #0078d4',background:'#fff',color:'#0078d4',cursor:'pointer',fontWeight:600,textDecoration:'none',display:'inline-block',whiteSpace:'nowrap'}}>
                  Draft in Outlook
                </a>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Subject</div>
                <div style={{fontSize:13,fontWeight:600,color:'#111',padding:'8px 11px',background:'#fff',borderRadius:7,border:'1px solid #e5e7eb'}}>{draft.subject}</div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Body</div>
                <div style={{fontSize:12,lineHeight:1.85,color:'#374151',padding:'10px 13px',background:'#fff',borderRadius:7,border:'1px solid #e5e7eb',whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{draft.body}</div>
              </div>
              {strategyOpen[c.id]&&draft.strategy&&(
                <div style={{marginTop:10,padding:'12px 14px',background:'#faf5ff',borderRadius:8,border:'1px solid #e9d5ff',fontSize:12}}>
                  <div style={{fontWeight:700,color:'#6d28d9',marginBottom:10,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:18,height:18,borderRadius:'50%',background:'#6d28d9',color:'#fff',fontSize:10,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>i</span>
                    Strategy Intelligence
                  </div>
                  {[
                    ['Subject Strategy',draft.strategy.subjectLineType,draft.strategy.subjectLineReason],
                    ['Opening',draft.strategy.openingStrategy,draft.strategy.openingReason],
                    ['Body Framework',draft.strategy.bodyFramework,draft.strategy.bodyReason],
                    ['CTA',draft.strategy.ctaType,draft.strategy.ctaReason],
                  ].map(([label,name,reason])=>name&&(
                    <div key={label} style={{marginBottom:8}}>
                      <span style={{fontWeight:700,color:'#374151'}}>{label}:</span>{' '}
                      <span style={{color:'#6d28d9',fontWeight:600}}>{name}</span>
                      {reason&&<span style={{color:'#6b7280'}}> — {reason}</span>}
                    </div>
                  ))}
                  {draft.strategy.psychTechniques?.length>0&&(
                    <div style={{marginBottom:8}}>
                      <span style={{fontWeight:700,color:'#374151'}}>Psych Techniques:</span>{' '}
                      <span style={{color:'#7c3aed'}}>{draft.strategy.psychTechniques.join(', ')}</span>
                    </div>
                  )}
                  {draft.strategy.competitorAngle&&draft.strategy.competitorAngle!=='null'&&(
                    <div style={{marginBottom:8}}>
                      <span style={{fontWeight:700,color:'#374151'}}>Competitor Angle:</span>{' '}
                      <span style={{color:'#dc2626'}}>{draft.strategy.competitorAngle}</span>
                    </div>
                  )}
                  {draft.strategy.stageLogic&&(
                    <div>
                      <span style={{fontWeight:700,color:'#374151'}}>Stage Logic:</span>{' '}
                      <span style={{color:'#6b7280'}}>{draft.strategy.stageLogic}</span>
                    </div>
                  )}
                </div>
              )}
              {historyOpen[c.id]&&sentHistory.length>0&&(
                <div style={{marginTop:10,padding:'12px 14px',background:'#f0fdf4',borderRadius:8,border:'1px solid #bbf7d0',fontSize:12}}>
                  <div style={{fontWeight:700,color:'#059669',marginBottom:10,fontSize:13}}>
                    Previously Sent ({sentHistory.length})
                  </div>
                  {sentHistory.map((e,i)=>(
                    <div key={i} style={{marginBottom:i<sentHistory.length-1?14:0,paddingBottom:i<sentHistory.length-1?14:0,borderBottom:i<sentHistory.length-1?'1px solid #d1fae5':'none'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                        {e.stage&&<span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:5,background:'#d1fae5',color:'#065f46'}}>{e.stage}</span>}
                        {e.date&&<span style={{fontSize:10,color:'#9ca3af'}}>{new Date(e.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</span>}
                      </div>
                      {e.subject&&<div style={{fontWeight:600,color:'#111',marginBottom:4,fontSize:12}}>Subject: {e.subject}</div>}
                      <div style={{color:'#374151',lineHeight:1.7,whiteSpace:'pre-wrap',fontSize:11}}>{e.body}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{marginTop:10,fontSize:11,color:'#9ca3af'}}>Review and personalise before sending · click <strong style={{color:'#059669'}}>{markSentLabel}</strong> after you send it</div>
            </>
          ):(
            <div style={{padding:'8px 0 4px'}}>
              <textarea value={customPrompt} onChange={e=>onCustomPromptChange(c.id,e.target.value)}
                placeholder="Optional: add instructions before generating..."
                rows={2} style={{width:'100%',fontSize:12,padding:'8px 10px',borderRadius:7,border:'1px solid #d8b4fe',
                  background:'#faf5ff',color:'#374151',resize:'vertical',fontFamily:'inherit',outline:'none',boxSizing:'border-box',lineHeight:1.5,marginBottom:10}}/>
              <button onClick={()=>onGenerate(c,customPrompt)}
                style={{padding:'7px 18px',borderRadius:8,fontSize:12,fontWeight:700,border:'none',
                  background:'linear-gradient(135deg,#7c3aed,#2563eb)',color:'#fff',cursor:'pointer'}}>
                Generate Email
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
