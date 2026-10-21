/* ================= NAV ================= */
document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    if(el.dataset.page==='reports') reportView=null; // always land on the report list from the sidebar
    render(el.dataset.page);
  });
});
function setActiveNav(page){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.page===page));
}
let lastRenderedPage=null;
function render(page){
  if(!canOpenModule(page)){
    // No view permission for this module: bounce to the first module the user CAN open.
    const fallback=PERMISSION_MODULES.map(m=>m.key).find(k=>canOpenModule(k));
    if(fallback && fallback!==page){ render(fallback); return; }
  }
  setActiveNav(page);
  const titles={dashboard:'Dashboard',employees:'Employees',resigned:'Resigned Employees',departments:'Departments',attendance:'Attendance',timeentry:'Employee Time Entry',payroll:'Payroll',payrollprocess:'Payroll Process',increment:'Annual Increment',salaryadvance:'Salary Advance',contractorbill:'Contractors Bill',reports:'Reports',settings:'Admin',softwareadmin:'Software Admin'};
  const subtitles={dashboard:"Welcome back — here's today's snapshot",employees:'Search, add and manage your workforce',resigned:'Employees who have resigned — rejoin them to restore full access',departments:'Organize employees into departments',attendance:'Fast, full-screen monthly attendance entry',timeentry:'Daily In / Out times, leave and holiday booking — days entered here count in Attendance and Payroll',payroll:'Process salaries and generate payslips',payrollprocess:'Payroll processing rules — working days, paid holidays and other payroll constants',increment:'Record yearly salary increments by Financial Year and keep full history',salaryadvance:'Issue employee advances and auto-manage monthly recovery',contractorbill:'Service charge to contractors, and what the company pays each contractor (salary + service charge)',reports:'Open a report, then download it as PDF or print it',settings:'Change your password, manage normal user accounts, and go to Payroll Process for payroll constants',softwareadmin:'Company details, automatic backup scheduler and full user rights / admin management — Software Admin only'};
  document.getElementById('pageTitle').textContent=titles[page];
  const subEl=document.getElementById('pageSubtitle'); if(subEl) subEl.textContent=subtitles[page]||'';
  const mainPanel=document.getElementById('mainPanel');
  if(mainPanel) mainPanel.classList.toggle('fullScreenPage', page==='attendance');
  const body=document.getElementById('pageBody');
  if(!canOpenModule(page)){
    body.innerHTML=denyMsg('view this page',titles[page]||page);
    return;
  }
  if(page==='dashboard') body.innerHTML=renderDashboard();
  if(page==='employees') body.innerHTML=renderEmployees();
  if(page==='resigned') body.innerHTML=renderResigned();
  if(page==='departments') body.innerHTML=renderDepartments();
  if(page==='attendance') body.innerHTML=renderAttendance();
  if(page==='timeentry') body.innerHTML=renderTimeEntry();
  if(page==='payroll') body.innerHTML=renderPayroll();
  if(page==='payrollprocess') body.innerHTML=renderPayrollProcess();
  if(page==='increment') body.innerHTML=renderIncrement();
  if(page==='salaryadvance') body.innerHTML=renderSalaryAdvance();
  if(page==='contractorbill') body.innerHTML=renderContractorBill();
  if(page==='reports') body.innerHTML=renderReports();
  if(page==='settings') body.innerHTML=renderSettings();
  if(page==='softwareadmin') body.innerHTML=isSoftwareAdmin() ? renderSoftwareAdmin() : denyMsg('view this page','Software Admin');
  // Animate only when the page changes — render() also runs on every filter keystroke.
  if(page!==lastRenderedPage) animatePageEnter(body);
  lastRenderedPage=page;
}
/* ---- Page motion: a short fade/rise when a page opens; counters count up ([data-count]).
   Everything is skipped when the system asks for reduced motion. ---- */
function prefersReducedMotion(){
  try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; }
}
function animatePageEnter(body){
  if(prefersReducedMotion()) return;
  body.classList.remove('pageEnter');
  void body.offsetWidth; // restart the CSS animation
  body.classList.add('pageEnter');
  body.addEventListener('animationend', function done(ev){ if(ev.target===body){ body.classList.remove('pageEnter'); body.removeEventListener('animationend', done); } });
  body.querySelectorAll('[data-count]').forEach(el=>{
    const target=+el.dataset.count||0, money=el.dataset.format==='money';
    if(!target) return;
    const start=performance.now(), dur=750;
    const step=t=>{
      const k=Math.min(1,(t-start)/dur), v=Math.round(target*(1-Math.pow(1-k,3)));
      el.textContent = money ? fmt(v) : String(v);
      if(k<1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
/* ---- Top-bar search: apps (modules the user may open) and employees (with Employees view
   rights). "/" or Ctrl+K focuses it; ↑/↓ + Enter or a click opens a result; Esc closes. ---- */
let gsItems=[], gsIndex=0;
function globalSearchResults(q){
  q=String(q||'').trim().toLowerCase();
  if(!q || !currentUser) return [];
  const titles={dashboard:'Dashboard',employees:'Employees',resigned:'Resigned Employees',departments:'Departments',attendance:'Attendance',timeentry:'Employee Time Entry',payroll:'Payroll',payrollprocess:'Payroll Process',increment:'Annual Increment',salaryadvance:'Salary Advance',contractorbill:'Contractors Bill',reports:'Reports',settings:'Admin',softwareadmin:'Software Admin'};
  const apps=Object.keys(titles)
    .filter(k=>(k==='softwareadmin' ? isSoftwareAdmin() : canOpenModule(k)) && titles[k].toLowerCase().includes(q))
    .map(k=>({kind:'app', page:k, label:titles[k], sub:'App'}));
  const emps=canOpenModule('employees') ? (db.employees||[])
    .filter(e=>`${e.name} ${e.code}`.toLowerCase().includes(q))
    .slice(0,8)
    .map(e=>({kind:'emp', code:e.code, resigned:e.status==='Resigned', label:e.name, sub:[e.code, unitLabel(e.unit), contractorName(e), e.status].filter(Boolean).join(' · ')})) : [];
  return [...apps.slice(0,6), ...emps];
}
function openGlobalSearchItem(it){
  closeGlobalSearch(true);
  if(!it) return;
  if(it.kind==='app'){ if(it.page==='reports') reportView=null; render(it.page); return; }
  const page = it.resigned ? 'resigned' : 'employees';
  if(page==='employees'){ empFilter.search=it.code; } else { resignedFilter.search=it.code; }
  render(page);
  if(hasPerm('employees','edit')) openEmployeeModal(it.code);
}
function drawGlobalSearch(){
  const box=document.getElementById('globalSearchResults');
  if(!box) return;
  if(!gsItems.length){
    const q=(document.getElementById('globalSearch')||{}).value||'';
    box.innerHTML = q.trim() ? '<div class="gsEmpty">No apps or employees match.</div>' : '';
    box.classList.toggle('show', !!q.trim());
    return;
  }
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  box.innerHTML=gsItems.map((it,i)=>`<button type="button" class="gsItem ${i===gsIndex?'active':''}" data-i="${i}">
      <span class="gsIcon">${it.kind==='app'?ico('folder'):`<span class="avatarChip">${esc(initials(it.label))}</span>`}</span>
      <span class="gsText"><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></span>
    </button>`).join('');
  box.classList.add('show');
}
function closeGlobalSearch(clear){
  const box=document.getElementById('globalSearchResults'); if(box){ box.classList.remove('show'); box.innerHTML=''; }
  const inp=document.getElementById('globalSearch'); if(inp && clear){ inp.value=''; inp.blur(); }
  gsItems=[]; gsIndex=0;
}
(function initGlobalSearch(){
  const inp=document.getElementById('globalSearch'), box=document.getElementById('globalSearchResults');
  if(!inp || !box) return;
  inp.addEventListener('input',()=>{ gsItems=globalSearchResults(inp.value); gsIndex=0; drawGlobalSearch(); });
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(gsItems.length){ gsIndex=(gsIndex+1)%gsItems.length; drawGlobalSearch(); } }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(gsItems.length){ gsIndex=(gsIndex-1+gsItems.length)%gsItems.length; drawGlobalSearch(); } }
    else if(e.key==='Enter'){ e.preventDefault(); openGlobalSearchItem(gsItems[gsIndex]); }
    else if(e.key==='Escape'){ closeGlobalSearch(true); }
  });
  box.addEventListener('mousedown',e=>{ const b=e.target.closest('.gsItem'); if(b){ e.preventDefault(); openGlobalSearchItem(gsItems[+b.dataset.i]); } });
  inp.addEventListener('blur',()=>setTimeout(()=>closeGlobalSearch(false),120));
  document.addEventListener('keydown',e=>{
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||'');
    const appOpen=document.getElementById('app') && document.getElementById('app').style.display!=='none';
    if(!appOpen) return;
    if((e.key==='/' && !typing) || ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k')){ e.preventDefault(); inp.focus(); inp.select(); }
  });
})();
function refreshNavVisibility(){
  document.querySelectorAll('.nav-item').forEach(el=>{
    const page=el.dataset.page;
    el.style.display = canOpenModule(page) ? '' : 'none';
  });
}

