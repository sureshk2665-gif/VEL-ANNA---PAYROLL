/* ================================================================================
   EMPLOYEE-WISE TIME ENTRY — second view onto the SAME time-entry store.
   ---------------------------------------------------------------------------------
   Shared backend: this view reads and writes exactly the same records the Date-wise
   view uses — db.timeEntries[date][empCode] for In/Out time, db.timeLeaves for
   attendance (Loss of Pay / Half Day) and db.timeHolidays for holiday OT —
   and all Shift / Working / Late / OT figures come from the same teCompute(). There
   is no copy or cache: an edit here is visible in the Date-wise grid, Day list,
   Employee Leave tab and Attendance & OT Summary the moment you switch to them,
   and vice versa.

   Built for fast keyboard entry: one employee, one month, one row per date.
   Times are typed (930, 0930, 9:30, 5:30p, 17:30) instead of picked from three
   dropdowns, the grid never fully re-renders while typing (only the edited row and
   the totals update in place), and saves are queued so rapid entry stays ordered.
   ================================================================================ */
let teEwEmp='';                        // employee code currently loaded in the Employee-wise view
let teEwMonth=monthKey(todayStr());    // month shown (YYYY-MM)
let teEwEditMode=false;                // same lock/unlock behaviour as the Date-wise grid
let teEwFocus=null;                    // {r,c} to re-focus after a full render (employee/month switch)
let teEwSaveBusy=false, teEwSavePending=false, teEwSaveState='idle';

function teEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function teEwDateStr(y,m,d){ const dt=new Date(y,m-1,d); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
function teEwShiftDate(dt,k){ const [y,m,d]=dt.split('-').map(Number); return teEwDateStr(y,m,d+k); }
function teEwMonthDates(ym){ const [y,m]=ym.split('-').map(Number); return Array.from({length:daysInMonth(ym)},(_,i)=>teEwDateStr(y,m,i+1)); }
function teEwCanEdit(){ return hasPerm('timeentry','add')||hasPerm('timeentry','edit'); }
function teEwFmtTime(h,m,ap){ if(h===''||h===undefined||h===null) return ''; return String(h).padStart(2,'0')+':'+String(m===''||m===undefined?0:m).padStart(2,'0')+' '+(ap||'AM'); }
function teEwBlankEntry(){ return {inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'}; }

// Ordered, coalesced save: saveDB() upserts the whole store, so rapid keystrokes are
// funnelled into one in-flight write at a time; the latest state is always written last.
async function teEwQueueSave(){
  teEwSetSaveState('saving');
  if(teEwSaveBusy){ teEwSavePending=true; return; }
  teEwSaveBusy=true;
  let ok=true;
  do{ teEwSavePending=false; ok=await saveDB(db); }while(teEwSavePending);
  teEwSaveBusy=false;
  teEwSetSaveState(ok?'saved':'error');
}
function teEwSetSaveState(s){
  teEwSaveState=s;
  const el=document.getElementById('teEwSaveState'); if(!el) return;
  el.className='teEwSave '+s;
  el.innerHTML = s==='saving'?'Saving…' : s==='saved'?ico('check')+' All changes saved' : s==='error'?ico('alert')+' Not saved — check connection':'';
}
window.addEventListener('beforeunload',e=>{ if(teEwSaveBusy){ e.preventDefault(); e.returnValue=''; } });

/* ---- Typed time parsing -------------------------------------------------------
   Accepts 9, 930, 0930, 9:30, 9.30, 1730, 17:30, 9:30a, 5:30 pm, 12a …
   An explicit a/p (or 24-hour value) always wins. Otherwise AM/PM is inferred:
   In Time  → nearest to this employee's most recent In Time (else 6–11 = AM, rest PM)
   Out Time → the reading that gives a sensible shift length after the In Time.   */
function teEwParseTime(raw){
  const s=String(raw).toLowerCase().replace(/\s+/g,'');
  const mt=s.match(/^(\d{1,4})(?:[:.](\d{1,2}))?(a|am|p|pm)?$/);
  if(!mt) return null;
  let h,m;
  if(mt[2]!==undefined){ if(mt[1].length>2) return null; h=+mt[1]; m=+mt[2]; }
  else{ const d=mt[1];
    if(d.length<=2){ h=+d; m=0; } else if(d.length===3){ h=+d[0]; m=+d.slice(1); } else { h=+d.slice(0,2); m=+d.slice(2); } }
  if(m>59||h>24) return null;
  if(h===24) h=0;
  const suf=mt[3]?mt[3][0]:'';
  if(suf){ if(h===0) h=12; if(h>12) return null; return {h,m,ap:suf==='a'?'AM':'PM'}; }
  if(h===0) return {h:12,m,ap:'AM'};
  if(h>12) return {h:h-12,m,ap:'PM'};
  return {h,m,ap:null};
}
function teEwResolveAP(p, kind, refMin, halfDay){
  const cands=['AM','PM'].map(ap=>({ap,min:teTimeToMinutes(p.h,p.m,ap)}));
  if(kind==='in'){
    if(refMin===null||refMin===undefined) return (p.h>=6&&p.h<=11)?'AM':'PM';
    const dist=x=>{ const d=Math.abs(x-refMin); return Math.min(d,1440-d); };
    return dist(cands[0].min)<=dist(cands[1].min)?'AM':'PM';
  }
  if(refMin===null||refMin===undefined) return 'PM';
  const target=halfDay?270:510, lo=halfDay?60:270, hi=1260;
  const scored=cands.map(c=>{ let d=(c.min-refMin+1440)%1440; return {ap:c.ap,d}; });
  let pool=scored.filter(c=>c.d>=lo&&c.d<=hi); if(!pool.length) pool=scored;
  pool.sort((a,b)=>Math.abs(a.d-target)-Math.abs(b.d-target));
  return pool[0].ap;
}
// Most recent In Time for this employee before the given date (looks back up to 14 days).
function teEwRecentInMin(code, dt){
  for(let k=1;k<=14;k++){
    const d=teEwShiftDate(dt,-k); const e=db.timeEntries[d]&&db.timeEntries[d][code];
    if(e && e.inH!=='' && e.inH!==undefined){ const v=teTimeToMinutes(e.inH,e.inM,e.inAP); if(v!==null) return v; }
  }
  return null;
}

/* ---- Row model: everything a row shows, derived from the shared store ---- */
function teEwRowModel(code, dt){
  const entry=(db.timeEntries[dt]&&db.timeEntries[dt][code])||teEwBlankEntry();
  const leave=teGetLeave(dt, code);
  const onLeave=!!(leave && leave.type!=='Half Day');
  const c=teCompute(entry, dt);
  const [y,m,d]=dt.split('-').map(Number);
  const dow=new Date(y,m-1,d).getDay();
  const hol=db.timeHolidays.find(h=>h.date===dt)||null;
  const hasIn=entry.inH!==''&&entry.inH!==undefined, hasOut=entry.outH!==''&&entry.outH!==undefined;
  const isFuture=dt>todayStr();
  let status;
  if(onLeave) status=`<span class="tag LossOfPay">${ico('palm')} ${teEsc(leave.type)}</span>`;
  else if(hasIn&&hasOut) status = teIsHolidayDate(dt) ? `<span class="tag NOPH">Holiday OT</span>` : leave ? `<span class="tag HalfDay">${ico('contrast')} Half Day</span>` : `<span class="tag Present">Present</span>`;
  else if(hasIn) status=`<span class="tag HalfDay">Out time missing</span>`;
  else if(leave) status=`<span class="tag HalfDay">${ico('contrast')} Half Day</span>`;
  else if(dow===0) status=`<span class="teEwMuted">Sunday</span>`;
  else if(hol) status=`<span class="teEwMuted">Holiday</span>`;
  else if(isFuture) status=`<span class="teEwMuted">–</span>`;
  else status=`<span class="teEwMissing">No entry</span>`;
  return {entry,leave,onLeave,c,dow,hol,hasIn,hasOut,status,
    inTxt:teEwFmtTime(entry.inH,entry.inM,entry.inAP), outTxt:teEwFmtTime(entry.outH,entry.outM,entry.outAP),
    total:(c.working||0)+(c.ot||0)};
}
function teEwComputedCells(md){
  const blank=!md.hasIn||md.onLeave;
  return {
    shift: blank?'–':(md.c.shift?md.c.shift.name.replace(' Shift',''):'–'),
    working: blank?'–':teFmtHM(md.c.working),
    late: blank?'–':(md.c.late>0?teFmtHM(md.c.late):'On time'),
    lateCls: (!blank&&md.c.late>0)?'teEwWarn':'',
    ot: blank?'–':teFmtHM(md.c.ot),
    otCls: (!blank&&md.c.ot>0)?'teEwDanger':'',
    total: blank?'–':teFmtHM(md.total)
  };
}
function teEwRowClass(md, dt){
  return ['teEwRow', md.dow===0?'sun':'', md.hol?'hol':'', md.onLeave?'onLeave':'', dt===todayStr()?'today':''].filter(Boolean).join(' ');
}

/* ---- Month totals ---- */
function teEwTotals(code, ym){
  const t={present:0,leave:0,missing:0,working:0,late:0,ot:0,total:0};
  const today=todayStr();
  teEwMonthDates(ym).forEach(dt=>{
    const md=teEwRowModel(code, dt);
    if(md.leave) t.leave++;
    if(md.onLeave) return;
    if(md.hasIn){ t.present++; t.working+=md.c.working; t.late+=md.c.late; t.ot+=md.c.ot; t.total+=md.total; if(!md.hasOut) t.missing++; }
    else if(!md.leave && md.dow!==0 && !md.hol && dt<=today) t.missing++;
  });
  return t;
}
function teEwStatsHtml(t){
  return `<div class="teStatBox"><b>${t.present}</b><span>Present days</span></div>
    <div class="teStatBox"><b>${t.leave}</b><span>Leave days</span></div>
    <div class="teStatBox ${t.missing?'warn':''}"><b>${t.missing}</b><span>Needs entry</span></div>
    <div class="teStatBox"><b>${teFmtHM(t.working)}</b><span>Working hours</span></div>
    <div class="teStatBox ${t.late?'warn':''}"><b>${teFmtHM(t.late)}</b><span>Late</span></div>
    <div class="teStatBox ${t.ot?'danger':''}"><b>${teFmtHM(t.ot)}</b><span>OT hours</span></div>
    <div class="teStatBox"><b>${teFmtHM(t.total)}</b><span>Total hours</span></div>`;
}
function teEwFootHtml(t){
  return `<td colspan="5" style="text-align:right;">Month total</td>
    <td>${teFmtHM(t.working)}</td><td class="${t.late?'teEwWarn':''}">${teFmtHM(t.late)}</td><td class="${t.ot?'teEwDanger':''}">${teFmtHM(t.ot)}</td><td>${teFmtHM(t.total)}</td>
    <td colspan="3" style="text-align:left;">${t.present} present · ${t.leave} leave</td>`;
}
function teEwRefreshTotals(){
  if(!teEwEmp) return;
  const t=teEwTotals(teEwEmp, teEwMonth);
  const s=document.getElementById('teEwStats'); if(s) s.innerHTML=teEwStatsHtml(t);
  const f=document.getElementById('teEwFoot'); if(f) f.innerHTML=teEwFootHtml(t);
}

/* ---- In-place row update (no full render → focus and caret are never lost) ---- */
function teEwUpdateRow(r){
  const tr=document.querySelector(`tr.teEwRow[data-r="${r}"]`); if(!tr) return;
  const dt=tr.dataset.dt, md=teEwRowModel(teEwEmp, dt), cc=teEwComputedCells(md);
  const unlocked=teEwCanEdit()&&teEwEditMode;
  tr.className=teEwRowClass(md, dt);
  const inI=tr.querySelector('input[data-c="0"]'), outI=tr.querySelector('input[data-c="1"]'), sel=tr.querySelector('select[data-c="2"]');
  const ph=(unlocked&&!md.onLeave)?'hh:mm':'';
  if(inI){ inI.value=md.inTxt; inI.disabled=!unlocked||md.onLeave; inI.placeholder=ph; inI.classList.remove('bad'); }
  if(outI){ outI.value=md.outTxt; outI.disabled=!unlocked||md.onLeave; outI.placeholder=ph; outI.classList.remove('bad'); }
  if(sel){ sel.value=md.leave?md.leave.type:''; }
  const set=(k,v,cls)=>{ const el=tr.querySelector(`[data-k="${k}"]`); if(el){ el.innerHTML=v; if(cls!==undefined) el.className=cls; } };
  set('shift',cc.shift); set('working',cc.working); set('late',cc.late,cc.lateCls); set('ot',cc.ot,cc.otCls); set('total',cc.total); set('status',md.status);
}

/* ---- Writes (all go to the shared db.timeEntries / db.timeLeaves) — used by both the
   Employee-wise and the Date-wise grid ---- */
function teWriteTimeFor(dt, code, kind, val){ // val = {h,m,ap} or null to clear
  if(!db.timeEntries[dt]) db.timeEntries[dt]={};
  if(!db.timeEntries[dt][code]) db.timeEntries[dt][code]=teEwBlankEntry();
  const e=db.timeEntries[dt][code];
  if(val){ e[kind+'H']=String(val.h); e[kind+'M']=String(val.m); e[kind+'AP']=val.ap; }
  else { e[kind+'H']=''; e[kind+'M']=''; e[kind+'AP']=kind==='in'?'AM':'PM'; }
}
function teEwWriteTime(dt, kind, val){ teWriteTimeFor(dt, teEwEmp, kind, val); }
// Sets (val = 'Loss of Pay' | 'Half Day') or removes (val = '') an Employee Leave for a
// date. Returns false if not allowed (removing needs Delete rights).
function teSetLeaveFor(dt, code, val){
  if(!Array.isArray(db.timeLeaves)) db.timeLeaves=[];
  const existing=teGetLeave(dt, code);
  if(!val){
    if(existing){
      if(!hasPerm('timeentry','delete')){ alert('You do not have permission to remove a leave record.'); return false; }
      db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===dt&&l.empCode===code));
    }
  } else {
    if(existing && existing.type===val) return true;
    const remarks=existing?existing.remarks:'';
    db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===dt&&l.empCode===code));
    db.timeLeaves.push({date:dt, empCode:code, type:val, remarks:remarks||''});
  }
  // Make sure the date has a row for this employee so the Attendance & OT Summary counts it.
  if(!db.timeEntries[dt]) db.timeEntries[dt]={};
  if(!db.timeEntries[dt][code]) db.timeEntries[dt][code]=teEwBlankEntry();
  return true;
}
// Commits one typed time cell. Returns false if the text couldn't be read (cell stays put).
function teEwCommitTime(inp){
  if(!inp || inp.disabled || !teEwEmp || !inp.isConnected) return true;
  const grid=inp.closest('#teEwGrid'); if(!grid || grid.dataset.emp!==teEwEmp) return true;
  const tr=inp.closest('tr'); const dt=tr.dataset.dt; const r=+tr.dataset.r;
  const kind=inp.dataset.c==='0'?'in':'out';
  const md=teEwRowModel(teEwEmp, dt);
  const storedTxt=kind==='in'?md.inTxt:md.outTxt;
  let raw=inp.value.trim();
  if(raw===storedTxt){ inp.classList.remove('bad'); return true; }
  let val=null;
  if(raw==='='||raw==='"'){ // ditto: copy from the nearest row above that has this time filled
    for(let k=r-1;k>=0;k--){
      const pdt=document.querySelector(`tr.teEwRow[data-r="${k}"]`).dataset.dt;
      const pe=db.timeEntries[pdt]&&db.timeEntries[pdt][teEwEmp];
      if(pe && pe[kind+'H']!=='' && pe[kind+'H']!==undefined){ val={h:+pe[kind+'H'],m:+pe[kind+'M']||0,ap:pe[kind+'AP']}; break; }
    }
    if(!val){ inp.classList.add('bad'); inp.title='Nothing above to copy.'; return false; }
  } else if(raw!==''){
    const p=teEwParseTime(raw);
    if(!p){ inp.classList.add('bad'); inp.title='Could not read this time. Try 930, 9:30, 5:30p or 17:30.'; return false; }
    if(!p.ap){
      const ref = kind==='in' ? teEwRecentInMin(teEwEmp, dt)
                              : (md.hasIn ? teTimeToMinutes(md.entry.inH,md.entry.inM,md.entry.inAP) : null);
      p.ap=teEwResolveAP(p, kind, ref, !!(md.leave&&md.leave.type==='Half Day'));
    }
    val=p;
  }
  if(!val && storedTxt===''){ inp.value=''; inp.classList.remove('bad'); return true; }
  if(val && teEwFmtTime(val.h,val.m,val.ap)===storedTxt){ inp.value=storedTxt; inp.classList.remove('bad'); return true; }
  teEwWriteTime(dt, kind, val);
  inp.title='';
  teEwUpdateRow(r); teEwRefreshTotals(); teEwQueueSave();
  return true;
}
function teEwSetAttendance(sel){
  const tr=sel.closest('tr'); const dt=tr.dataset.dt; const r=+tr.dataset.r;
  const existing=teGetLeave(dt, teEwEmp);
  if(!teSetLeaveFor(dt, teEwEmp, sel.value)){ sel.value=existing?existing.type:''; return; }
  teEwUpdateRow(r); teEwRefreshTotals(); teEwQueueSave();
}
function teEwClearRow(r){
  if(!teEwCanEdit()||!teEwEditMode) return;
  const tr=document.querySelector(`tr.teEwRow[data-r="${r}"]`); if(!tr) return;
  const dt=tr.dataset.dt;
  const e=db.timeEntries[dt]&&db.timeEntries[dt][teEwEmp];
  if(!e || (e.inH===''&&e.outH==='')) return;
  teEwWriteTime(dt,'in',null); teEwWriteTime(dt,'out',null);
  teEwUpdateRow(r); teEwRefreshTotals(); teEwQueueSave();
}

/* ---- Keyboard navigation ---- */
function teEwCell(r,c){ return document.querySelector(`#teEwGrid [data-r="${r}"][data-c="${c}"]`); }
function teEwRowCount(){ return document.querySelectorAll('#teEwGrid tr.teEwRow').length; }
function teEwMove(r,c,dr,dc){
  const n=teEwRowCount();
  if(dc){ let cc=c+dc; while(cc>=0&&cc<=2){ const el=teEwCell(r,cc); if(el&&!el.disabled){ el.focus(); return; } cc+=dc; } return; }
  let rr=r+dr;
  while(rr>=0&&rr<n){ const el=teEwCell(rr,c); if(el&&!el.disabled){ el.focus(); el.closest('tr').scrollIntoView({block:'nearest'}); return; } rr+=dr; }
}
function teEwKey(ev, el){
  const r=+el.dataset.r, c=+el.dataset.c, isSel=el.tagName==='SELECT';
  // Alt+↑/↓ = previous/next employee, Alt+PageUp/PageDown = previous/next month
  if(ev.altKey && (ev.key==='ArrowUp'||ev.key==='ArrowDown'||ev.key==='PageUp'||ev.key==='PageDown')){
    ev.preventDefault();
    if(!isSel && !teEwCommitTime(el)) return;
    teEwFocus={r:ev.key.startsWith('Page')?0:r,c};
    if(ev.key==='ArrowUp') teEwStepEmp(-1); else if(ev.key==='ArrowDown') teEwStepEmp(1);
    else if(ev.key==='PageUp') teEwStepMonth(-1); else teEwStepMonth(1);
    return;
  }
  if(!isSel && (ev.ctrlKey||ev.metaKey) && (ev.key==='d'||ev.key==='D')){ ev.preventDefault(); el.value='='; if(teEwCommitTime(el)) teEwMove(r,c,1,0); return; }
  if(!isSel && ev.key==='Escape'){ const md=teEwRowModel(teEwEmp, el.closest('tr').dataset.dt); el.value=c===0?md.inTxt:md.outTxt; el.classList.remove('bad'); el.select(); return; }
  let dr=0, dc=0;
  if(ev.key==='Enter') dr=ev.shiftKey?-1:1;
  else if(ev.key==='ArrowDown') dr=1;
  else if(ev.key==='ArrowUp') dr=-1;
  else if(ev.key==='F2' && !isSel){ ev.preventDefault(); el.dataset.edit='1'; const n=el.value.length; el.setSelectionRange(n,n); return; }
  // Left/Right jump between cells (spreadsheet style). After a mouse click or F2 the cell is in
  // edit mode, where Left/Right move the caret and only jump once it reaches the edge.
  else if(ev.key==='ArrowRight' && (isSel || el.dataset.edit!=='1' || el.selectionEnd===el.value.length)) dc=1;
  else if(ev.key==='ArrowLeft' && (isSel || el.dataset.edit!=='1' || el.selectionStart===0)) dc=-1;
  else return;
  ev.preventDefault();
  if(!isSel && !teEwCommitTime(el)) return;
  teEwMove(r,c,dr,dc);
}
function teEwMouse(el){ el._teMouse=true; el.dataset.edit='1'; }
function teEwFocusCell(el){ if(el._teMouse){ el._teMouse=false; return; } el.dataset.edit=''; el.select(); }
function teEwRestoreFocus(){
  if(!teEwFocus) return;
  const f=teEwFocus; teEwFocus=null;
  let el=teEwCell(f.r,f.c);
  if(!el||el.disabled){ const n=teEwRowCount(); for(let k=0;k<n;k++){ const x=teEwCell(k,f.c); if(x&&!x.disabled){ el=x; break; } } }
  if(el&&!el.disabled){ el.focus(); el.closest('tr').scrollIntoView({block:'nearest'}); }
}
// On loading an employee: jump straight to the first working day up to today with no In Time.
function teEwFirstEmptyRow(){
  const dates=teEwMonthDates(teEwMonth); const today=todayStr();
  for(let i=0;i<dates.length;i++){
    const md=teEwRowModel(teEwEmp, dates[i]);
    if(dates[i]<=today && !md.onLeave && !md.hasIn && md.dow!==0 && !md.hol) return i;
  }
  return 0;
}

/* ---- Selection / navigation actions ---- */
function teEwSelectEmp(code){
  teEwEmp=code||'';
  if(teEwEmp && teEwFocus===null && teEwEditMode) teEwFocus={r:teEwFirstEmptyRow(),c:0};
  render('timeentry');
}
function teEwPickFromText(v){
  v=String(v||'').trim().toLowerCase(); if(!v) return;
  const emps=teFilteredEmployees(teEwMonth);
  const code=v.split('—')[0].trim();
  const hit=emps.find(e=>e.code.toLowerCase()===code) || emps.find(e=>`${e.code} — ${e.name}`.toLowerCase()===v)
    || emps.find(e=>e.name.toLowerCase().startsWith(v)) || emps.find(e=>(`${e.code} ${e.name}`).toLowerCase().includes(v));
  if(hit){ teEwSelectEmp(hit.code); }
  else { const el=document.getElementById('teEwFind'); if(el){ el.classList.add('bad'); el.title='No active employee matches that.'; } }
}
function teEwStepEmp(dir){
  const emps=teFilteredEmployees(teEwMonth); if(!emps.length) return;
  let i=emps.findIndex(e=>e.code===teEwEmp);
  i = i<0 ? 0 : (i+dir+emps.length)%emps.length;
  teEwSelectEmp(emps[i].code);
}
function teEwSetMonth(v){ if(!v) return; teEwMonth=v; render('timeentry'); }
function teEwStepMonth(dir){ const [y,m]=teEwMonth.split('-').map(Number); const d=new Date(y,m-1+dir,1); teEwMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('timeentry'); }
function teEwUnlock(){
  if(!teEwCanEdit()){ alert('You do not have permission to edit time entries.'); return; }
  teEwEditMode=true; if(teEwEmp) teEwFocus={r:teEwFirstEmptyRow(),c:0}; render('timeentry');
}
function teEwLock(){
  const a=document.activeElement; if(a && a.closest && a.closest('#teEwGrid') && a.tagName==='INPUT') teEwCommitTime(a);
  teEwEditMode=false; render('timeentry');
}
// Cross-links between the two views (same records, different angle).
function teOpenEmpWise(code, dt){ teEwEmp=code; if(dt) teEwMonth=monthKey(dt); teTab='empwise'; render('timeentry'); }
function teOpenDateWise(dt){ teGridDate=dt; teGridEditMode=false; teTab='entry'; ensureTimeEntriesForDate(dt); render('timeentry'); }

function printTEEmployee(){
  if(!teEwEmp) return;
  const emp=(db.employees||[]).find(e=>e.code===teEwEmp)||{name:'',department:''};
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const rows=teEwMonthDates(teEwMonth).map((dt,i)=>{
    const md=teEwRowModel(teEwEmp, dt), cc=teEwComputedCells(md);
    const att = md.onLeave ? `On Leave — ${md.leave.type}${md.leave.remarks?' ('+teEsc(md.leave.remarks)+')':''}`
      : md.leave ? 'Half Day' : md.hasIn ? (teIsHolidayDate(dt)?'Holiday OT':'Present') : md.dow===0?'Sunday':md.hol?'Holiday':'-';
    return `<tr><td>${i+1}</td><td>${fmtDate(dt)}</td><td>${dayNames[md.dow]}</td><td>${md.onLeave?'-':md.inTxt||'-'}</td><td>${md.onLeave?'-':md.outTxt||'-'}</td>
      <td>${cc.shift}</td><td>${cc.working}</td><td>${cc.late}</td><td>${cc.ot}</td><td>${cc.total}</td><td>${att}</td></tr>`;
  }).join('');
  const t=teEwTotals(teEwEmp, teEwMonth);
  const [y,m]=teEwMonth.split('-').map(Number);
  const monthName=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const html=`<p style="margin:0 0 8px;"><b>${teEsc(emp.code||teEwEmp)} — ${teEsc(emp.name)}</b>${emp.department?' · '+teEsc(emp.department):''}</p>
  <table class="repTable"><thead><tr><th>Sl No</th><th>Date</th><th>Day</th><th>In Time</th><th>Out Time</th><th>Shift</th><th>Working</th><th>Late</th><th>OT</th><th>Total</th><th>Attendance</th></tr></thead>
  <tbody>${rows}<tr style="font-weight:700;"><td colspan="6" style="text-align:right;">Month total</td><td>${teFmtHM(t.working)}</td><td>${teFmtHM(t.late)}</td><td>${teFmtHM(t.ot)}</td><td>${teFmtHM(t.total)}</td><td>${t.present} present · ${t.leave} leave</td></tr></tbody></table>`;
  openPrintWindow(`Employee Time Entry — ${emp.name||teEwEmp} — ${monthName}`, html);
}

function renderTEEmpWiseTab(){
  const emps=teFilteredEmployees(teEwMonth);
  if(teEwEmp && !emps.some(e=>e.code===teEwEmp)) teEwEmp='';
  const emp=emps.find(e=>e.code===teEwEmp);
  const canEdit=teEwCanEdit();
  const unlocked=canEdit&&teEwEditMode;
  const [y,m]=teEwMonth.split('-').map(Number);
  const monthName=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const inputStyle='padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:13px;';
  const picker=`<div class="panelHead" style="margin-bottom:10px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;">${ico('user')} Employee
          <input id="teEwFind" class="teEwFind" list="teEwEmpList" placeholder="Type code or name, press Enter" value="${emp?teEsc(emp.code+' — '+emp.name):''}"
            onfocus="this.select()" onkeydown="if(event.key==='Enter'){event.preventDefault();teEwPickFromText(this.value);}" onchange="teEwPickFromText(this.value)" style="${inputStyle}width:260px;">
        </label>
        <datalist id="teEwEmpList">${emps.map(e=>`<option value="${teEsc(e.code+' — '+e.name)}">${teEsc(e.department||'')}</option>`).join('')}</datalist>
        <button class="btn secondary" title="Previous employee (Alt+↑)" onclick="teEwStepEmp(-1)">‹</button>
        <button class="btn secondary" title="Next employee (Alt+↓)" onclick="teEwStepEmp(1)">›</button>
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-left:6px;">${ico('calendar-days')} Month
          <input type="month" value="${teEwMonth}" onchange="teEwSetMonth(this.value)" style="${inputStyle}">
        </label>
        <button class="btn secondary" title="Previous month (Alt+PageUp)" onclick="teEwStepMonth(-1)">‹</button>
        <button class="btn secondary" title="Next month (Alt+PageDown)" onclick="teEwStepMonth(1)">›</button>
        ${teEwMonth!==monthKey(todayStr())?`<button class="btn secondary" onclick="teEwSetMonth('${monthKey(todayStr())}')">This month</button>`:''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span id="teEwSaveState" class="teEwSave ${teEwSaveState}"></span>
        ${!unlocked
          ? `<button class="btn btnEditAtt" ${canEdit?'':'disabled'} onclick="teEwUnlock()">${ico('pencil')} Edit</button>`
          : `<button class="btn" onclick="teEwLock()">${ico('save')} Save</button>`}
        <button class="btn secondary" ${emp?'':'disabled'} onclick="printTEEmployee()">${ico('printer')} Print</button>
      </div>
    </div>`;
  if(!emp){
    return `<div class="panel">${picker}
      <div class="empty" style="padding:36px 10px;">Choose an employee above to see and enter their time for ${monthName}.<br><span style="font-size:12px;color:var(--muted);">Type a code or name and press Enter — or use ‹ › to step through the roster.</span></div>
    </div>`;
  }
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dates=teEwMonthDates(teEwMonth);
  const t=teEwTotals(teEwEmp, teEwMonth);
  const rowsHtml=dates.map((dt,i)=>{
    const md=teEwRowModel(teEwEmp, dt), cc=teEwComputedCells(md);
    const dis=(!unlocked||md.onLeave)?'disabled':'';
    const dayTag = md.dow===0 ? `<span class="teEwDayTag">Auto OT</span>` : md.hol ? `<span class="teEwDayTag hol" title="${teEsc(md.hol.remarks||'Booked holiday')}">${teEsc(md.hol.remarks||'Holiday')}</span>` : '';
    return `<tr class="${teEwRowClass(md, dt)}" data-r="${i}" data-dt="${dt}">
      <td class="teEwDate"><button type="button" tabindex="-1" class="teEwDateLink" title="Open ${fmtDate(dt)} in Date-wise view" onclick="teOpenDateWise('${dt}')">${fmtDate(dt)}</button></td>
      <td class="teEwDow">${dayNames[md.dow]}${dayTag}</td>
      <td class="teEwInCell"><input class="teEwTime in" data-r="${i}" data-c="0" value="${md.inTxt}" ${dis} placeholder="${unlocked&&!md.onLeave?'hh:mm':''}" autocomplete="off" spellcheck="false"
        onmousedown="teEwMouse(this)" onfocus="teEwFocusCell(this)" onkeydown="teEwKey(event,this)" onblur="teEwCommitTime(this)" aria-label="In time ${fmtDate(dt)}"></td>
      <td class="teEwOutCell"><input class="teEwTime out" data-r="${i}" data-c="1" value="${md.outTxt}" ${dis} placeholder="${unlocked&&!md.onLeave?'hh:mm':''}" autocomplete="off" spellcheck="false"
        onmousedown="teEwMouse(this)" onfocus="teEwFocusCell(this)" onkeydown="teEwKey(event,this)" onblur="teEwCommitTime(this)" aria-label="Out time ${fmtDate(dt)}"></td>
      <td data-k="shift">${cc.shift}</td>
      <td data-k="working">${cc.working}</td>
      <td data-k="late" class="${cc.lateCls}">${cc.late}</td>
      <td data-k="ot" class="${cc.otCls}">${cc.ot}</td>
      <td data-k="total" class="teEwTotal">${cc.total}</td>
      <td data-k="status">${md.status}</td>
      <td><select class="teEwAtt" data-r="${i}" data-c="2" ${unlocked?'':'disabled'} onkeydown="teEwKey(event,this)" onchange="teEwSetAttendance(this)" aria-label="Attendance ${fmtDate(dt)}">
        <option value="" ${!md.leave?'selected':''}>Auto (from time)</option>
        ${TE_LEAVE_TYPES.map(tp=>`<option value="${tp}" ${md.leave&&md.leave.type===tp?'selected':''}>${tp}</option>`).join('')}
      </select></td>
      <td>${unlocked?`<button type="button" tabindex="-1" class="teEwClear" title="Clear In/Out time for this date" onclick="teEwClearRow(${i})">${ico('x')}</button>`:''}</td>
    </tr>`;
  }).join('');
  if(teEwFocus) setTimeout(teEwRestoreFocus,0);
  return `<div class="panel">
    ${picker}
    <div class="teEwEmpCard">
      <div><b>${teEsc(emp.name)}</b> <span style="color:var(--muted);">${teEsc(emp.code)}${emp.department?' · '+teEsc(emp.department):''}${emp.designation?' · '+teEsc(emp.designation):''}</span></div>
      <div style="font-size:12px;color:var(--muted);">${monthName}${unlocked?' · unlocked for editing':' · locked — click '+ico('pencil')+' Edit to enter time'}</div>
    </div>
    <div class="teStatRow" id="teEwStats">${teEwStatsHtml(t)}</div>
    ${unlocked?`<div class="teEwKeys">
      <span><kbd>930</kbd> <kbd>9:30</kbd> <kbd>5:30p</kbd> <kbd>17:30</kbd> type a time</span>
      <span><kbd>Enter</kbd> / <kbd>↓</kbd> next date</span>
      <span><kbd>←</kbd> <kbd>→</kbd> In · Out · Attendance</span>
      <span><kbd>Ctrl</kbd>+<kbd>D</kbd> or <kbd>=</kbd> copy from row above</span>
      <span><kbd>F2</kbd> edit inside a cell</span>
      <span><kbd>Esc</kbd> undo cell</span>
      <span><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> employee · <kbd>Alt</kbd>+<kbd>PgUp</kbd>/<kbd>PgDn</kbd> month</span>
    </div>`:''}
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid" id="teEwGrid" data-emp="${teEsc(teEwEmp)}">
      <thead><tr>
        <th>Date</th><th>Day</th>
        <th class="teEwInHead">${ico('log-in')} In Time</th><th class="teEwOutHead">${ico('log-out')} Out Time</th>
        <th>Shift</th><th title="Standard working hours (max 8:00 after the 30-minute break)">Working</th><th>Late</th><th>OT</th><th title="Working + OT">Total</th>
        <th>Status</th><th>Attendance</th><th></th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr id="teEwFoot">${teEwFootHtml(t)}</tr></tfoot>
    </table></div>
    <p class="syncNote">This view edits the same records as <b>Date-wise Time Entry</b>, <b>Employee Leave</b> and the <b>Attendance &amp; OT Summary</b> — a change here shows up there straight away, and the other way round. Shift, Working, Late and OT use the same rules as the Date-wise grid (Sundays and booked holidays count as full-day OT). Setting <b>Attendance</b> to Loss of Pay or Half Day records an Employee Leave for that date; set it back to <b>Auto</b> to remove it. Click a date to open that day in the Date-wise view.</p>
  </div>`;
}

function renderTimeEntry(){
  return `<div class="teTabs">
    <div class="teTab ${teTab==='entry'?'active':''}" onclick="teSetTab('entry')">${ico('calendar')} Date-wise Time Entry</div>
    <div class="teTab ${teTab==='empwise'?'active':''}" onclick="teSetTab('empwise')">${ico('user')} Employee-wise Time Entry</div>
    <div class="teTab ${teTab==='leave'?'active':''}" onclick="teSetTab('leave')">${ico('palm')} Employee Leave</div>
    <div class="teTab ${teTab==='holiday'?'active':''}" onclick="teSetTab('holiday')">${ico('calendar')} Holiday Booking</div>
    <div class="teTab ${teTab==='summary'?'active':''}" onclick="teSetTab('summary')">${ico('chart')} Attendance &amp; OT Summary</div>
  </div>
  ${teTab!=='holiday' ? renderTEFilterBar() : ''}
  ${teTab==='entry' ? renderTEEntryTab() : teTab==='empwise' ? renderTEEmpWiseTab() : teTab==='leave' ? renderTELeaveTab() : teTab==='holiday' ? renderTEHolidayTab() : renderTESummaryTab()}`;
}

function renderTEEntryTab(){
  ensureTimeEntriesForDate(teGridDate);
  return `
  ${renderTEDateGrid()}
  ${renderTEDayList()}`;
}

function renderTEDayList(){
  const dates=Object.keys(db.timeEntries).sort().reverse().slice(0,14); // most recent 14 days with any entries
  if(!dates.length) return `<div class="panel"><div class="empty">No time entries recorded yet.</div></div>`;
  return dates.map(dt=>{
    const rows=db.timeEntries[dt]||{};
    const codes=Object.keys(rows).filter(teCodeInFilter);
    if(!codes.length) return '';
    const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
    const byShift={'First Shift':[],'General Shift':[],'Second Shift':[]};
    const onLeave=[];
    codes.forEach(code=>{
      const leave=teGetLeave(dt, code);
      const emp=empMap[code]||{name:'(removed employee)',department:''};
      if(leave && leave.type!=='Half Day'){ onLeave.push({code,emp,leave}); return; }
      const entry=rows[code];
      if(!entry || entry.inH==='' || entry.inH===undefined){ if(!leave) return; } // nothing entered yet
      const c=teCompute(entry, dt);
      const shiftName=c.shift?c.shift.name:'General Shift';
      (byShift[shiftName]||byShift['General Shift']).push({code,emp,entry,c,leave});
    });
    if(!onLeave.length && Object.values(byShift).every(l=>!l.length)) return ''; // nothing entered on this date yet
    const holidayTag = teIsHolidayDate(dt) ? ` <span class="tag HalfDay" style="padding:1px 8px;font-size:11px;">Holiday · Full-day OT</span>` : '';
    return `<div class="panel teDayGroup">
      <div class="panelHead"><h4 style="margin:0;">${ico('calendar')} ${fmtDate(dt)}${holidayTag}</h4>
        <button class="btn secondary" onclick="printTEDay('${dt}')">${ico('printer')} Print</button></div>
      ${renderTELeaveGroupBox(onLeave)}
      <div class="teShiftGrid">
        ${Object.keys(byShift).map(sn=>renderTEShiftBox(sn,byShift[sn],dt)).join('')}
      </div>
    </div>`;
  }).join('');
}
function renderTELeaveGroupBox(list){
  if(!list.length) return '';
  return `<div class="teShiftBox" style="margin-bottom:14px;">
    <h5>${ico('palm')} On Leave</h5>
    <table><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Leave Type</th><th>Remarks</th></tr></thead>
    <tbody>${list.map((r,idx)=>`<tr>
      <td>${idx+1}</td><td>${r.code}</td><td style="text-align:left;">${r.emp.name}</td><td>${r.leave.type}</td><td style="text-align:left;">${r.leave.remarks||'-'}</td>
    </tr>`).join('')}</tbody></table>
  </div>`;
}
function renderTEShiftBox(shiftName, list, dt){
  if(!list.length) return '';
  const canDel=hasPerm('timeentry','delete');
  return `<div class="teShiftBox">
    <h5>${shiftName==='First Shift'?ico('sunrise'):shiftName==='Second Shift'?ico('moon'):ico('sun')} ${shiftName}</h5>
    <table><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>In</th><th>Out</th><th>Working</th><th>Late</th><th>OT</th>${canDel?'<th></th>':''}</tr></thead>
    <tbody>${list.map((r,idx)=>`<tr>
      <td>${idx+1}</td><td>${r.code}</td><td style="text-align:left;">${r.emp.name}${r.leave&&r.leave.type==='Half Day'?` <span class="tag HalfDay" style="padding:1px 7px;font-size:10px;">${ico('contrast')} Half Day</span>`:''}</td>
      <td>${r.entry.inH?String(r.entry.inH).padStart(2,'0')+':'+String(r.entry.inM).padStart(2,'0')+' '+r.entry.inAP:'-'}</td>
      <td>${r.entry.outH?String(r.entry.outH).padStart(2,'0')+':'+String(r.entry.outM).padStart(2,'0')+' '+r.entry.outAP:'-'}</td>
      <td>${teFmtHM(r.c.working)}</td><td>${r.c.late>0?teFmtHM(r.c.late):'On time'}</td><td>${teFmtHM(r.c.ot)}</td>
      ${canDel?`<td><button class="btn danger" style="padding:3px 8px;font-size:11px;" onclick="teDeleteEntry('${dt}','${r.code}')">${ico('x')}</button></td>`:''}
    </tr>`).join('')}</tbody></table>
  </div>`;
}
function printTEDay(dt){
  const rows=db.timeEntries[dt]||{};
  const codes=Object.keys(rows).filter(teCodeInFilter);
  if(!codes.length){ alert('No time entries for this date'+(teFilterText()?' in '+teFilterText():'')+'.'); return; }
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  const tableRows=codes.map((code,idx)=>{
    const emp=empMap[code]||{name:'(removed employee)',department:''};
    const leave=teGetLeave(dt, code);
    if(leave && leave.type!=='Half Day'){
      return `<tr><td>${idx+1}</td><td>${code}</td><td style="text-align:left;">${emp.name}</td><td>${emp.department||'-'}</td>
      <td colspan="6">${ico('palm')} On Leave — ${leave.type}${leave.remarks?' ('+leave.remarks+')':''}</td></tr>`;
    }
    const entry=rows[code]; const c=teCompute(entry,dt);
    const halfDayNote = leave ? ` <span style="font-size:10px;">${ico('contrast')} Half Day${leave.remarks?' — '+leave.remarks:''}</span>` : '';
    return `<tr><td>${idx+1}</td><td>${code}</td><td style="text-align:left;">${emp.name}${halfDayNote}</td><td>${emp.department||'-'}</td>
      <td>${c.shift?c.shift.name:'-'}</td>
      <td>${entry.inH?String(entry.inH).padStart(2,'0')+':'+String(entry.inM).padStart(2,'0')+' '+entry.inAP:'-'}</td>
      <td>${entry.outH?String(entry.outH).padStart(2,'0')+':'+String(entry.outM).padStart(2,'0')+' '+entry.outAP:'-'}</td>
      <td>${teFmtHM(c.working)}</td><td>${c.late>0?teFmtHM(c.late):'On time'}</td><td>${teFmtHM(c.ot)}</td></tr>`;
  }).join('');
  const html=`<table class="repTable"><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Dept</th><th>Shift</th><th>In Time</th><th>Out Time</th><th>Working</th><th>Late</th><th>OT</th></tr></thead><tbody>${tableRows}</tbody></table>`;
  openPrintWindow(`Employee Time Entry — ${fmtDate(dt)}${teFilterText()?' — '+teFilterText():''}`, html);
}

/* ---------------- Holiday Booking tab (this module's own calendar — separate from
   the Payroll → Payroll Process Holiday Calendar, which drives NOWD/NOPH). ---------------- */
function teCalPrevMonth(){ const [y,m]=teCalMonth.split('-').map(Number); const d=new Date(y,m-2,1); teCalMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('timeentry'); }
function teCalNextMonth(){ const [y,m]=teCalMonth.split('-').map(Number); const d=new Date(y,m,1); teCalMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('timeentry'); }
function teCalToday(){ teCalMonth=monthKey(todayStr()); render('timeentry'); }
function teSelectCalDate(dt){ teSelHolDate=dt; teHolRemarks=(db.timeHolidays.find(h=>h.date===dt)||{}).remarks||''; render('timeentry'); }
function teSetHolRemarks(v){ teHolRemarks=v; }
function teBookHoliday(){
  if(!hasPerm('timeentry','add') && !hasPerm('timeentry','edit')){ alert('You do not have permission to book holidays.'); return; }
  if(!teSelHolDate){ alert('Please click a date on the calendar first.'); return; }
  const existingIdx=db.timeHolidays.findIndex(h=>h.date===teSelHolDate);
  const rec={date:teSelHolDate, remarks:teHolRemarks||''};
  if(existingIdx>-1) db.timeHolidays[existingIdx]=rec; else db.timeHolidays.push(rec);
  saveDB(db); render('timeentry');
}
function teRemoveHoliday(dt, ev){
  if(ev) ev.stopPropagation();
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to remove a booked holiday.'); return; }
  db.timeHolidays=db.timeHolidays.filter(h=>h.date!==dt);
  if(teSelHolDate===dt){ teSelHolDate=null; teHolRemarks=''; }
  saveDB(db); render('timeentry');
}
function renderTEHolidayTab(){
  const canEdit=hasPerm('timeentry','add')||hasPerm('timeentry','edit');
  const [y,m]=teCalMonth.split('-').map(Number);
  const dim=new Date(y,m,0).getDate();
  const firstDow=new Date(y,m-1,1).getDay(); // 0=Sun
  const monthName=new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push('<div class="teCalCell empty"></div>');
  for(let d=1; d<=dim; d++){
    const dt=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isSun=new Date(y,m-1,d).getDay()===0;
    const booked=db.timeHolidays.find(h=>h.date===dt);
    let cls='teCalCell'+(isSun?' sunday':'')+(booked?' booked':'')+(teSelHolDate===dt?' selected':'');
    cells.push(`<div class="${cls}" onclick="${isSun?'':`teSelectCalDate('${dt}')`}">
      <b>${d}</b>
      ${isSun?`<span class="teSunTag">Sun · Auto OT</span>`:''}
      ${booked?`<span class="teOcc">${ico('bookmark')} ${booked.remarks||'Booked'}</span>${canEdit?`<span class="teRemove" onclick="teRemoveHoliday('${dt}',event)">${ico('x')}</span>`:''}`:''}
    </div>`);
  }
  const dows=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `<div class="panel">
    <h3>${ico('calendar')} Time Entry — Holiday Booking</h3>
    <p class="syncNote">Click any date below to select it, then use Book Holiday to confirm (with an optional occasion/remarks name). A booked date makes every In/Out entry on that date full-day OT (no Late), and that OT is paid in Payroll; time worked on a booked date is paid as OT only, not as a Present day. Sundays (shaded, marked "Sun · Auto OT") and Payroll NOPH holidays already work this way. This calendar does not change NOWD or NOPH — paid holidays are set in Payroll → Payroll Process → Holiday Calendar.</p>
    <div class="teCalWrap">
      <div class="teCalHead">
        <button class="btn secondary" onclick="teCalPrevMonth()">‹ Prev</button>
        <b>${monthName}</b>
        <button class="btn secondary" onclick="teCalNextMonth()">Next ›</button>
        <button class="btn secondary" onclick="teCalToday()" style="margin-left:auto;">Today</button>
      </div>
      <div class="teCalGrid">
        ${dows.map(d=>`<div class="teCalDow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
    </div>
    <div class="formGrid" style="margin-top:16px;">
      <div><label>Selected Date</label><input type="text" value="${teSelHolDate?fmtDate(teSelHolDate):''}" disabled></div>
      <div><label>Occasion / Remarks (optional)</label><input type="text" placeholder="e.g. Diwali, Independence Day" value="${teHolRemarks}" ${canEdit?'':'disabled'} oninput="teSetHolRemarks(this.value)"></div>
      <div class="full"><button class="btn" ${canEdit&&teSelHolDate?'':'disabled'} onclick="teBookHoliday()">${ico('pin')} Book Holiday</button></div>
    </div>
  </div>`;
}

/* ---------------- Attendance & OT Summary (a.k.a. Monthly Working Summary) — a read-only,
   month-level roll-up with the SAME figures payroll pays: day counts from Attendance (which
   includes Time Entry days — getAttStatus), Paid Days, and OT / Late as used on the salary slip
   (Time Entry totals unless typed on the Attendance screen). ---------------- */
function teSummarySetMonth(v){ if(!v) return; teSummaryMonth=v; render('timeentry'); }
function teSummaryPrevMonth(){ const [y,m]=teSummaryMonth.split('-').map(Number); const d=new Date(y,m-2,1); teSummaryMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('timeentry'); }
function teSummaryNextMonth(){ const [y,m]=teSummaryMonth.split('-').map(Number); const d=new Date(y,m,1); teSummaryMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('timeentry'); }
function teSummaryThisMonth(){ teSummaryMonth=monthKey(todayStr()); render('timeentry'); }
// One row per employee on the roll in the month (narrowed by the Unit / Contractor filter), using
// computePayrollForEmployee — so it matches the Payroll list and the salary slip.
function teMonthSummaryRows(monthStr){
  return teFilteredEmployees(monthStr).map(e=>{
    const p=computePayrollForEmployee(e, monthStr);
    const working=teMonthDays(e.code, monthStr).reduce((s,x)=>s+(x.c.working||0),0);
    return {emp:e, presentDays:p.presentDays, halfDays:p.halfDayCount, lopDays:p.lopMarked, nophDays:p.holidayDays,
      unmarked:p.unmarkedDays, paidDays:p.daysWorking, leaveDays:p.lopMarked+p.halfDayCount, workingMin:working,
      otHours:p.otHours, otMin:Math.round(p.otHours*60), otAmount:p.otAmount, lateMin:p.lateMinutes,
      lateCharged:p.lateChargedMinutes, lateDeduction:p.lateDeduction};
  });
}
function teSummaryColumns(){
  return [
    {header:'Emp Code', key:'code', width:10}, {header:'Employee', key:'name', width:24}, {header:'Department', key:'department', width:14},
    {header:'Present', key:'presentDays', type:'number'}, {header:'Half Day', key:'halfDays', type:'number'}, {header:'LOP', key:'lopDays', type:'number'},
    {header:'NOPH', key:'nophDays', type:'number'}, {header:'Not Marked', key:'unmarked', type:'number'}, {header:'Paid Days', key:'paidDays', type:'number'},
    {header:'Working Hrs (Time Entry)', key:'workingHrs', type:'number'}, {header:'OT Hrs', key:'otHours', type:'number'}, {header:'OT Amount', key:'otAmount', type:'money'},
    {header:'Late Min', key:'lateMin', type:'number'}, {header:'Late Charged Min', key:'lateCharged', type:'number'}, {header:'Late Deduction', key:'lateDeduction', type:'money'},
  ];
}
function teSummaryFlatRows(rows){
  return rows.map(r=>({code:r.emp.code, name:r.emp.name, department:r.emp.department||'', presentDays:r.presentDays, halfDays:r.halfDays, lopDays:r.lopDays,
    nophDays:r.nophDays, unmarked:r.unmarked, paidDays:r.paidDays, workingHrs:Math.round(r.workingMin/60*100)/100, otHours:r.otHours, otAmount:r.otAmount,
    lateMin:r.lateMin, lateCharged:r.lateCharged, lateDeduction:r.lateDeduction}));
}
function teSummaryMonthName(monthStr){ const [y,m]=monthStr.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}); }
function printTESummary(monthStr){
  const rows=teMonthSummaryRows(monthStr);
  const cols=teSummaryColumns(), flat=teSummaryFlatRows(rows);
  const tot=k=>Math.round(flat.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const cell=(c,v)=>c.type==='money'?fmt(v):v;
  const html=`<table class="repTable"><thead><tr><th>Sl No</th>${cols.map(c=>`<th>${c.header}</th>`).join('')}</tr></thead><tbody>
    ${flat.map((r,i)=>`<tr><td>${i+1}</td>${cols.map(c=>`<td${c.key==='name'?' style="text-align:left;"':''}>${cell(c,r[c.key])}</td>`).join('')}</tr>`).join('')}
    <tr class="subtotal"><td colspan="4">TOTAL</td>${cols.slice(3).map(c=>`<td>${cell(c,tot(c.key))}</td>`).join('')}</tr>
  </tbody></table>`;
  openPrintWindow(`Attendance & OT Summary — ${teSummaryMonthName(monthStr)}${teFilterText()?' — '+teFilterText():''}`, html, {orientation:'landscape'});
}
function downloadTESummaryExcel(monthStr){
  if(!hasPerm('timeentry','export')){ alert('You do not have permission to export.'); return; }
  const rows=teMonthSummaryRows(monthStr);
  window.downloadExcel({ fileName:`${companyFilePrefix()}-Attendance-OT-Summary-${monthLabel(monthStr)}.xlsx`,
    sheets:[{ name:'Attendance & OT', title:`${db.companyName||''} — Attendance & OT Summary — ${teSummaryMonthName(monthStr)}`,
      subtitle:teFilterText()||'All units · All contractors', columns:teSummaryColumns(), rows:teSummaryFlatRows(rows), totals:true }] });
}
function renderTESummaryTab(){
  const rows=teMonthSummaryRows(teSummaryMonth);
  const monthName=teSummaryMonthName(teSummaryMonth);
  const tot=k=>Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const num=(v,warn)=>`<td style="padding:7px;${warn&&v>0?'color:var(--warn);font-weight:600;':''}">${v}</td>`;
  return `<div class="panel">
    <div class="panelHead">
      <h3 style="margin:0;">${ico('chart')} Attendance &amp; OT Summary — ${monthName} <span style="font-weight:400;font-size:12px;color:var(--muted);">(same figures as Payroll)</span></h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;">${ico('calendar-days')} Month
          <input type="month" value="${teSummaryMonth}" onchange="teSummarySetMonth(this.value)" style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:13px;">
        </label>
        <button class="btn secondary" onclick="teSummaryPrevMonth()">‹ Prev</button>
        <button class="btn secondary" onclick="teSummaryNextMonth()">Next ›</button>
        <button class="btn secondary" onclick="teSummaryThisMonth()">This Month</button>
        <button class="btn secondary" onclick="printTESummary('${teSummaryMonth}')">${ico('printer')} Print</button>
        ${hasPerm('timeentry','export')?`<button class="btn secondary" ${rows.length?'':'disabled'} onclick="downloadTESummaryExcel('${teSummaryMonth}')">${ico('file-spreadsheet')} Excel</button>`:''}
      </div>
    </div>
    <p class="syncNote">One row per employee on the roll in ${monthName}, with the figures Payroll uses: Present / Half Day / LOP / NOPH come from Attendance (days entered in Time Entry count there unless a different status is marked on the Attendance screen), Paid Days = Present + Half Day × 0.5 + NOPH, and OT / Late are the month's Time Entry totals unless a figure was typed on the Attendance screen. The first ${lateGraceMinutes(teSummaryMonth)} Late minutes in a month are free.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:18px;">
      <div class="stat"><div class="statTop"><span class="statIcon">${ico('users')}</span></div><div class="n">${rows.length}</div><div class="l">Employees</div></div>
      <div class="stat"><div class="statTop"><span class="statIcon">${ico('circle-check')}</span></div><div class="n">${tot('paidDays')}</div><div class="l">Total Paid Days</div></div>
      <div class="stat"><div class="statTop"><span class="statIcon">${ico('timer')}</span></div><div class="n">${tot('otHours')}</div><div class="l">Total OT Hours</div></div>
      <div class="stat"><div class="statTop"><span class="statIcon">${ico('alert')}</span></div><div class="n">${tot('lateMin')}</div><div class="l">Total Late Minutes</div></div>
    </div>
    <div class="tableScrollWrap"><table style="min-width:1100px;width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:center;color:var(--muted);">
        <th style="padding:8px;">Sl No</th><th style="padding:8px;">Emp Code</th><th style="padding:8px;text-align:left;">Employee</th><th style="padding:8px;">Department</th>
        <th style="padding:8px;">Present</th><th style="padding:8px;">Half Day</th><th style="padding:8px;">LOP</th><th style="padding:8px;">NOPH</th><th style="padding:8px;" title="Working days up to today with no status — not paid">Not Marked</th><th style="padding:8px;">Paid Days</th>
        <th style="padding:8px;">Working Hrs</th><th style="padding:8px;">OT Hrs</th><th style="padding:8px;">OT ₹</th><th style="padding:8px;">Late Min</th><th style="padding:8px;">Late Ded. ₹</th>
      </tr></thead>
      <tbody>
      ${!rows.length?`<tr><td colspan="15" class="empty">No employees on the roll this month.</td></tr>`:rows.map((r,idx)=>`<tr style="border-top:1px solid var(--line);text-align:center;">
        <td style="padding:7px;color:var(--muted);">${idx+1}</td>
        <td style="padding:7px;">${r.emp.code}</td>
        <td style="padding:7px;text-align:left;"><button type="button" class="teEmpLink" title="Open ${teEsc(r.emp.name)}'s month in Employee-wise view" onclick="teOpenEmpWise('${teEsc(r.emp.code)}','${teSummaryMonth}-01')">${teEsc(r.emp.name)}</button></td>
        <td style="padding:7px;">${r.emp.department||'-'}</td>
        ${num(r.presentDays)}${num(r.halfDays)}${num(r.lopDays,true)}${num(r.nophDays)}${num(r.unmarked,true)}
        <td style="padding:7px;font-weight:700;">${r.paidDays}</td>
        <td style="padding:7px;">${teFmtHM(r.workingMin)}</td>
        <td style="padding:7px;${r.otHours>0?'color:var(--danger);font-weight:600;':''}">${r.otHours}</td>
        <td style="padding:7px;">${fmt(r.otAmount)}</td>
        <td style="padding:7px;${r.lateMin>0?'color:var(--warn);font-weight:600;':''}" title="${r.lateCharged} min charged after the grace">${r.lateMin}</td>
        <td style="padding:7px;">${fmt(r.lateDeduction)}</td>
      </tr>`).join('')}
      ${rows.length?`<tr style="border-top:2px solid var(--line);text-align:center;font-weight:700;background:var(--accent-soft);">
        <td colspan="4" style="padding:7px;text-align:right;">Total</td>
        <td style="padding:7px;">${tot('presentDays')}</td><td style="padding:7px;">${tot('halfDays')}</td><td style="padding:7px;">${tot('lopDays')}</td><td style="padding:7px;">${tot('nophDays')}</td><td style="padding:7px;">${tot('unmarked')}</td>
        <td style="padding:7px;">${tot('paidDays')}</td><td style="padding:7px;">${teFmtHM(tot('workingMin'))}</td><td style="padding:7px;">${tot('otHours')}</td><td style="padding:7px;">${fmt(tot('otAmount'))}</td><td style="padding:7px;">${tot('lateMin')}</td><td style="padding:7px;">${fmt(tot('lateDeduction'))}</td>
      </tr>`:''}
      </tbody>
    </table></div>
  </div>`;
}

