const STATUSES = ["感兴趣","准备联系导师","已联系导师","准备申请材料","已提交","等待结果","Offer","Rejected","放弃申请"];
const storageKey = "phdTrackerStateV1";
const profileKey = "phdTrackerProfileV1";
const migrationKey20260922 = "phdTrackerMigration20260922";
const contactedMigration20260922 = {
  "innsbruck-bernien-group":"已联系导师",
  "darmstadt-birkl-apq-group":"已联系导师",
  "strathclyde-pritchard-group":"已联系导师",
  "tuebingen-gross-muniqc":"已联系导师",
  "paris-lkb-sayrin-rydberg":"已联系导师",
  "lens-tanzi-yb-tweezers":"已联系导师",
  "bonn-hofferberth-group":"已联系导师"
};

let opportunities = structuredClone(window.SEED_OPPORTUNITIES || []);
let profile = structuredClone(window.SEED_PROFILE || {});
let searchLog = structuredClone(window.SEARCH_LOG || []);

function loadLocalState(){
  try{
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if(Array.isArray(saved.override)) {
      const seedIds = new Set(opportunities.map(o=>o.id));
      const overrideById = Object.fromEntries(saved.override.map(o=>[o.id,o]));
      opportunities = opportunities.map(o=>({...o,...(overrideById[o.id]||{})}));
      opportunities.push(...saved.override.filter(o=>!seedIds.has(o.id)));
    } else {
      const byId = saved.byId || {};
      opportunities = opportunities.map(o => ({...o, ...(byId[o.id] || {})}));
      if(Array.isArray(saved.manual)) opportunities.push(...saved.manual);
    }
    const p = JSON.parse(localStorage.getItem(profileKey) || "null");
    if(p) profile = p;
  }catch(e){ console.warn("Local state load failed", e); }
}
function applyMigration20260922(){
  if(localStorage.getItem(migrationKey20260922)) return;
  Object.entries(contactedMigration20260922).forEach(([id,status])=>{
    const o=opportunities.find(x=>x.id===id);
    if(o) o.application_status=status;
  });
  saveState();
  localStorage.setItem(migrationKey20260922,"1");
}
function saveState(){
  const seedIds = new Set((window.SEED_OPPORTUNITIES || []).map(o=>o.id));
  const byId = {};
  const manual = [];
  opportunities.forEach(o=>{
    if(seedIds.has(o.id)) byId[o.id] = {application_status:o.application_status,status_note:o.status_note,match_score:o.match_score};
    else manual.push(o);
  });
  localStorage.setItem(storageKey, JSON.stringify({byId,manual}));
}
function saveProfile(){localStorage.setItem(profileKey, JSON.stringify(profile));}
function esc(s){return String(s ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function sourceLabel(o){return o.source_verified ? "来源已核验" : "待再次核验";}
function statusOptions(current){return STATUSES.map(s=>`<option ${s===current?'selected':''}>${s}</option>`).join('');}
function formatDirections(arr){return (arr||[]).slice(0,4).map(x=>`<span class="tag">${esc(x)}</span>`).join('');}
function cardHTML(o, compact=false){
  return `<article class="opp-card" data-id="${esc(o.id)}">
    <div class="card-top"><div class="card-type">${esc(o.type)}</div><div class="verify ${o.source_verified?'ok':''}">${sourceLabel(o)}</div></div>
    <div>
      <div class="opp-title">${esc(o.title)}</div>
      <div class="inst">${esc(o.institution)} · ${esc(o.country)}${o.city?` · ${esc(o.city)}`:''}</div>
    </div>
    <div class="tag-row">${formatDirections(o.research_direction)}</div>
    <div class="card-meta">
      <div class="deadline"><span>截止日期</span>${esc(o.deadline || '来源未说明')}</div>
      <div class="match-badge">${Number(o.match_score||0)}%</div>
    </div>
    ${compact ? '' : `<select class="status-select" data-status-id="${esc(o.id)}">${statusOptions(o.application_status)}</select>
    <div class="card-actions"><button data-detail="${esc(o.id)}">查看详情</button><a class="source-btn" href="${esc(o.source_url)}" target="_blank" rel="noopener">原始来源 ↗</a></div>`}
  </article>`;
}
function renderDashboard(){
  const submitted = opportunities.filter(o=>["已提交","等待结果","Offer","Rejected"].includes(o.application_status)).length;
  const contacted = opportunities.filter(o=>["已联系导师","准备申请材料","已提交","等待结果","Offer","Rejected"].includes(o.application_status)).length;
  const high = opportunities.filter(o=>Number(o.match_score)>=90 && !["Rejected","放弃申请"].includes(o.application_status)).length;
  document.getElementById('submittedCount').textContent = submitted;
  document.getElementById('contactedCount').textContent = contacted;
  document.getElementById('highMatchCount').textContent = high;
  document.getElementById('heroTags').innerHTML = (profile.research_directions||[]).slice(0,4).map(x=>`<span class="mini-tag">${esc(x)}</span>`).join('');

  const priority = opportunities.filter(o=>!["已提交","等待结果","Offer","Rejected","放弃申请"].includes(o.application_status))
    .sort((a,b)=>Number(b.match_score)-Number(a.match_score)).slice(0,4);
  document.getElementById('priorityGrid').innerHTML = priority.length ? priority.map(o=>cardHTML(o,true)).join('') : '<div class="empty">暂无待处理机会</div>';
  document.querySelectorAll('#priorityGrid .opp-card').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id)));

  const counts = Object.fromEntries(STATUSES.map(s=>[s,0]));
  opportunities.forEach(o=>counts[o.application_status]=(counts[o.application_status]||0)+1);
  document.getElementById('pipeline').innerHTML = STATUSES.map(s=>`<div class="pipe-item"><div class="pipe-count">${counts[s]||0}</div><div class="pipe-label">${s}</div></div>`).join('');
}
function populateFilters(){
  document.getElementById('statusFilter').innerHTML = '<option value="">全部状态</option>'+STATUSES.map(s=>`<option>${s}</option>`).join('');
  const countries=[...new Set(opportunities.map(o=>o.country).filter(Boolean))].sort();
  document.getElementById('countryFilter').innerHTML='<option value="">全部国家</option>'+countries.map(s=>`<option>${esc(s)}</option>`).join('');
  const types=[...new Set(opportunities.map(o=>o.type).filter(Boolean))];
  document.getElementById('typeFilter').innerHTML='<option value="">全部类型</option>'+types.map(s=>`<option>${esc(s)}</option>`).join('');
}
function renderOpportunities(){
  const q=document.getElementById('searchInput').value.trim().toLowerCase();
  const st=document.getElementById('statusFilter').value;
  const co=document.getElementById('countryFilter').value;
  const ty=document.getElementById('typeFilter').value;
  const m=Number(document.getElementById('matchFilter').value||0);
  const list=opportunities.filter(o=>{
    const hay=[o.title,o.institution,o.country,o.city,o.supervisor_lab,...(o.research_direction||[])].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!st||o.application_status===st)&&(!co||o.country===co)&&(!ty||o.type===ty)&&(!m||Number(o.match_score)>=m);
  }).sort((a,b)=>Number(b.match_score)-Number(a.match_score));
  document.getElementById('resultCount').textContent=list.length;
  document.getElementById('opportunityGrid').innerHTML=list.length?list.map(o=>cardHTML(o)).join(''):'<div class="empty">没有符合当前筛选条件的机会</div>';
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
  document.querySelectorAll('[data-status-id]').forEach(sel=>sel.addEventListener('change',e=>{
    const o=opportunities.find(x=>x.id===e.target.dataset.statusId); if(o){o.application_status=e.target.value;saveState();renderDashboard();}
  }));
}
function openDetail(id){
  const o=opportunities.find(x=>x.id===id); if(!o)return;
  document.getElementById('detailContent').innerHTML=`
    <div class="section-kicker">${esc(o.type)} · ${esc(o.open_state)}</div>
    <div class="detail-title">${esc(o.title)}</div>
    <div class="detail-sub">${esc(o.institution)} · ${esc(o.supervisor_lab)}</div>
    <div class="detail-grid">
      <div class="detail-box"><div class="k">国家 / 城市</div><div class="v">${esc(o.country)} / ${esc(o.city||'来源未说明')}</div></div>
      <div class="detail-box"><div class="k">匹配程度</div><div class="v">${esc(o.match_score)}%</div></div>
      <div class="detail-box"><div class="k">截止日期</div><div class="v">${esc(o.deadline||'来源未说明')}</div></div>
      <div class="detail-box"><div class="k">系统首次检索</div><div class="v">${esc(o.first_found||'来源未说明')}</div></div>
      <div class="detail-box"><div class="k">申请状态</div><div class="v">${esc(o.application_status)}</div></div>
      <div class="detail-box"><div class="k">来源核验</div><div class="v">${esc(sourceLabel(o))} · ${esc(o.last_checked||'来源未说明')}</div></div>
    </div>
    <div class="detail-section"><h3>研究方向</h3><div class="tag-row">${formatDirections(o.research_direction)}</div></div>
    <div class="detail-section"><h3>项目内容</h3><p>${esc(o.description||'来源未说明')}</p></div>
    <div class="detail-section"><h3>申请要求</h3><p>${esc(o.requirements||'来源未说明')}</p></div>
    <div class="detail-section"><h3>个人进度备注</h3><p>${esc(o.status_note||'—')}</p></div>
    <div class="detail-section"><h3>原始来源</h3><p>${esc(o.source_name||'来源未说明')}</p><a class="source-link" href="${esc(o.source_url)}" target="_blank" rel="noopener">打开官方 / 原始来源 ↗</a></div>`;
  document.getElementById('detailModal').classList.remove('hidden');
}
function renderProfile(){
  const set=(id,val)=>document.getElementById(id).value=Array.isArray(val)?val.join('\n'):(val||'');
  set('applicationType',profile.application_type);set('researchDirections',profile.research_directions);set('keywords',profile.keywords);set('educationBackground',profile.education_background);set('researchExperience',profile.research_experience);set('targetRegions',profile.target_regions);set('targetGroups',profile.target_groups);set('referenceSites',profile.reference_sites);
}
function calcScore(o){
  const text=[o.title,o.institution,o.supervisor_lab,o.description,...(o.research_direction||[])].join(' ').toLowerCase();
  const kws=(profile.keywords||[]).map(x=>x.toLowerCase());
  let score=48;
  kws.forEach(k=>{if(text.includes(k))score+=3.2});
  ["rydberg","neutral atom","optical tweezer","quantum computing"].forEach(k=>{if(text.includes(k))score+=5});
  (profile.target_regions||[]).forEach(r=>{if((o.country||'').toLowerCase()===r.toLowerCase())score+=2});
  (profile.target_groups||[]).forEach(g=>{const parts=g.toLowerCase().split(/\s+|\/|-/).filter(x=>x.length>4);if(parts.some(p=>text.includes(p)))score+=2});
  return Math.max(50,Math.min(99,Math.round(score)));
}
function renderHistory(){
  document.getElementById('historyList').innerHTML=(searchLog||[]).slice().reverse().map(r=>`<div class="history-row">
    <div class="history-date">${esc(r.date)}</div><div class="history-stat"><strong>${esc(r.new_items||0)}</strong><br>新增</div><div class="history-stat"><strong>${esc(r.verified_links||0)}</strong><br>已验链</div><div class="history-stat"><strong>${esc(r.invalid_links||0)}</strong><br>失效</div><div class="history-note">${esc(r.note||'')}</div>
  </div>`).join('');
}
function switchView(name){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
  document.getElementById(name+'View').classList.add('active-view');
  const titles={dashboard:'博士申请总览',opportunities:'PhD 信息列表',profile:'个人申请背景',history:'每日检索记录'};
  document.getElementById('pageTitle').textContent=titles[name]||'博士申请机会追踪';
}
function slug(){return 'manual-'+Date.now().toString(36)}
function addOpportunity(fd){
  const now=new Date().toISOString().slice(0,10);
  const o={id:slug(),type:'手动添加',title:fd.get('title'),institution:fd.get('institution'),country:fd.get('country')||'来源未说明',city:fd.get('city')||'来源未说明',supervisor_lab:fd.get('supervisor_lab')||'来源未说明',research_direction:(fd.get('research_direction')||'').split(',').map(x=>x.trim()).filter(Boolean),deadline:fd.get('deadline')||'来源未说明',first_found:now,match_score:80,open_state:'待核验',application_status:'感兴趣',status_note:fd.get('status_note')||'',description:'手动添加条目；请通过原始来源核验项目内容。',requirements:'来源未说明',source_url:fd.get('source_url'),source_name:'用户手动添加',source_verified:false,last_checked:'尚未自动核验'};
  o.match_score=calcScore(o);opportunities.push(o);saveState();populateFilters();renderDashboard();renderOpportunities();
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({profile,opportunities,exported_at:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='phd-tracker-backup.json';a.click();URL.revokeObjectURL(a.href);
}
function importBackup(file){
  const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(d.profile)profile=d.profile;if(Array.isArray(d.opportunities))opportunities=d.opportunities;saveProfile();localStorage.setItem(storageKey,JSON.stringify({override:opportunities}));location.reload();}catch(e){alert('导入失败：JSON 格式不正确');}};reader.readAsText(file);
}

loadLocalState();
applyMigration20260922();
const last=(searchLog||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];document.getElementById('lastSync').textContent='最后检索：'+(last?.date||'—');
renderDashboard();populateFilters();renderOpportunities();renderProfile();renderHistory();
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
['searchInput','statusFilter','countryFilter','typeFilter','matchFilter'].forEach(id=>document.getElementById(id).addEventListener('input',renderOpportunities));
document.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',()=>document.getElementById('detailModal').classList.add('hidden')));
document.getElementById('addOpportunityBtn').addEventListener('click',()=>document.getElementById('addModal').classList.remove('hidden'));
document.querySelectorAll('[data-close-add]').forEach(x=>x.addEventListener('click',()=>document.getElementById('addModal').classList.add('hidden')));
document.getElementById('addForm').addEventListener('submit',e=>{e.preventDefault();addOpportunity(new FormData(e.target));e.target.reset();document.getElementById('addModal').classList.add('hidden');});
document.getElementById('profileForm').addEventListener('submit',e=>{e.preventDefault();const lines=id=>document.getElementById(id).value.split('\n').map(x=>x.trim()).filter(Boolean);profile={application_type:document.getElementById('applicationType').value.trim(),research_directions:lines('researchDirections'),keywords:lines('keywords'),education_background:document.getElementById('educationBackground').value.trim(),research_experience:document.getElementById('researchExperience').value.trim(),target_regions:lines('targetRegions'),target_groups:lines('targetGroups'),reference_sites:lines('referenceSites')};opportunities.forEach(o=>o.match_score=calcScore(o));saveProfile();saveState();renderDashboard();renderOpportunities();alert('已保存背景信息并重新计算匹配度。');});
document.getElementById('exportBtn').addEventListener('click',exportBackup);
document.getElementById('importInput').addEventListener('change',e=>e.target.files[0]&&importBackup(e.target.files[0]));
