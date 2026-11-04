/* ================================================================================
   EMPLOYEE TIME ENTRY — daily In / Out times, Employee Leave and holiday booking.
   ---------------------------------------------------------------------------------
   Stores: db.timeEntries, db.timeLeaves, db.timeHolidays. This module never writes
   db.attendance or db.payroll. Payroll reads it in two places:
     - getAttStatus() (Attendance): a day not marked on the Attendance screen takes its
       status from here — In Time entered = Present, Employee Leave = Loss of Pay / Half Day;
     - lateMinutesFor() / otHoursFor() (Payroll): the month's Late minutes and OT hours
       (teMonthLateMinutes / teMonthOTMinutes).
   db.timeHolidays (holiday OT here) is separate from the Payroll Holiday Calendar.
   ================================================================================ */
let teTab='entry';                 // 'entry' (Date-wise) | 'empwise' (Employee-wise) | 'leave' | 'summary' | 'tokens' | 'shiftmap' | 'holiday'
let teTokMonth=monthKey(todayStr()); // Monthly Token Entry month
let teGridDate=todayStr();         // date currently selected in the Time Entries grid (defaults to today)
let teGridEditMode=false;          // false = grid rows are locked/view-only until "Edit" is pressed
let teCalMonth=monthKey(todayStr());
let teSummaryMonth=monthKey(todayStr()); // month shown in the Attendance & OT Summary tab
const TE_LEAVE_TYPES=['Loss of Pay','Half Day']; // no NOPL (paid leave)
let teLeaveDate=todayStr();
let teLeaveEmp='';
let teLeaveType=TE_LEAVE_TYPES[0];
let teLeaveRemarks='';

// Auto-creates a blank time-entry row (in memory) for every employee on the roll on the selected
// grid date, so the day's roster is always ready for quick entry. Blank rows are not saved on their
// own — they go to the database with the next real change — so simply opening Time Entry never
// writes the whole database from this tab. Purely additive: never overwrites or removes an entry
// someone has already filled in.
function ensureTimeEntriesForDate(dateStr2){
  if(!db.timeEntries[dateStr2]) db.timeEntries[dateStr2]={};
  let changed=false;
  // Bulk Shift's "select all" box once counted itself as an employee and saved a row under the
  // code "undefined" — drop any such rows.
  Object.keys(db.timeEntries).forEach(dt=>{ const day=db.timeEntries[dt]; if(day && Object.prototype.hasOwnProperty.call(day,'undefined')){ delete day.undefined; changed=true; } });
  activeEmployeesForTE(dateStr2).forEach(e=>{
    if(!db.timeEntries[dateStr2][e.code]) db.timeEntries[dateStr2][e.code]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
  });
  if(changed) saveDB(db);
}

function teTimeToMinutes(h,m,ap){
  // A blank hour means "no time entered" — not 12:00 midnight (that showed empty rows as
  // First shift / 8:00 working / 3:30 OT).
  if(h===''||h===null||h===undefined) return null;
  h=Number(h); m=(m===''||m===null||m===undefined)?0:Number(m);
  if(isNaN(h)||isNaN(m)) return null;
  let hh=h%12; if(ap==='PM') hh+=12;
  return hh*60+m;
}
function teFmtHM(mins){
  if(mins===null||mins===undefined||isNaN(mins)) return '–';
  mins=Math.max(0,Math.round(mins));
  return Math.floor(mins/60)+':'+String(mins%60).padStart(2,'0');
}
// The company's shifts (8 working hours + a 30-minute break; "+ OT" = 2 hours more, "+ Extra OT" on
// the Second Shift = till 5:00 AM, 5 hours more). Times are minutes from midnight (> 1440 = next day).
// These are the starting list; the timings in use live in db.shiftPresets (teShiftPresets).
const TE_SHIFTS=[
  {key:'first',    label:'First Shift',       inMin:7*60,     outMin:15*60+30},
  {key:'firstOT',  label:'First Shift + OT',  inMin:7*60,     outMin:17*60+30},
  {key:'general',  label:'General Shift',     inMin:9*60,     outMin:17*60+30},
  {key:'second',   label:'Second Shift',      inMin:15*60+30, outMin:24*60},
  {key:'secondOT', label:'Second Shift + OT', inMin:15*60+30, outMin:26*60},
  {key:'secondOTx', label:'Second Shift + Extra OT', inMin:15*60+30, outMin:29*60}
];
function teMinToHMAP(min){ min=((min%1440)+1440)%1440; return {h:(Math.floor(min/60)%12)||12, m:min%60, ap:min>=720?'PM':'AM'}; }
function teMinLabel(min){ const t=teMinToHMAP(min); return t.h+':'+String(t.m).padStart(2,'0')+' '+t.ap; }
function teShiftLabel(s){ return `${s.label} (${teMinLabel(s.inMin)} – ${teMinLabel(s.outMin)})`; }
// Shift auto-detection from the In Time — purely for this module's own display & print:
//   First Shift   (7:00 AM – 3:30 PM):  In before 9:00 AM
//   General Shift (9:00 AM – 5:30 PM):  In from 9:00 AM until 3:00 PM
//   Second Shift  (3:30 PM – 12:00 AM): In from 3:00 PM
// Used for an employee with no planned shift that day (see teShiftWindow).
function teDetectShift(inMin){
  if(inMin===null) return null;
  if(inMin < 9*60) return {name:'First Shift', standard:7*60};
  if(inMin < 15*60) return {name:'General Shift', standard:9*60};
  return {name:'Second Shift', standard:15*60+30};
}
function teIsHolidayDate(dateStr2){
  const [y,m,d]=dateStr2.split('-').map(Number);
  if(new Date(y,m-1,d).getDay()===0) return true; // Sunday — always full-day OT
  if(typeof getHolidayType==='function' && getHolidayType(dateStr2)==='NOPH') return true; // Payroll holiday (NOPH): paid as NOPH, time worked is OT
  return (db.timeHolidays||[]).some(h=>h.date===dateStr2);
}
// Looks up whether this employee has an Employee Leave record for this date. Used to
// auto-reflect a booked leave in the Time Entry grid/list/print — no separate manual
// time entry is needed on that date once leave is booked. Reads db.timeLeaves only
// (this module's own store); never touches db.attendance/db.payroll.
function teGetLeave(dateStr2, code){
  const l=(db.timeLeaves||[]).find(l=>l.date===dateStr2 && l.empCode===code) || null;
  return l && l.type==='NOPL' ? {...l, type:'Loss of Pay'} : l; // NOPL was removed — old records read as Loss of Pay
}
/* ---- Late, Working and OT for one day ----
   Measured against the employee's SHIFT: the shift planned for them that day (Shift Groups →
   weekly rotation, or a one-day change in Date-wise), otherwise the shift their In Time falls in
   (teDetectShift). A planned shift more than 4 hours away from the In Time is treated as not
   applying (e.g. a person who swapped shifts) and the detected shift is used.
     Late    = minutes after the shift start (9:00 for General: 9:00 on time, 9:36 → 36 min)
             + minutes left before the shift end (out 4:30 PM on a 5:30 PM shift → 60 min).
     Working = the time inside the shift (coming early does not add; leaving late is OT) less the
               30-minute break, at most 8 hours.
     OT      = minutes after the shift end (shift start + 8 hours + 30-minute break).
   Sundays and holidays: no Late; the whole time worked is OT. */
const TE_BREAK_MIN=30, TE_WORK_MIN=8*60;
function teShiftWindow(inMin, dateForRow, code){
  const planned = code && dateForRow && typeof teEmpShift==='function' ? teEmpShift(code, dateForRow) : null;
  if(planned){
    let start=planned.inMin;
    // Second-shift style starts late in the day; an In Time just after midnight belongs to it.
    if(start-inMin>12*60) start-=1440; else if(inMin-start>12*60) start+=1440;
    if(Math.abs(inMin-start)<=4*60) return {name:planned.label, start};
  }
  const d=teDetectShift(inMin);
  return {name:d.name, start:d.standard};
}
function teCompute(entry, dateForRow, code){
  const inMin=teTimeToMinutes(entry.inH,entry.inM,entry.inAP);
  const outMinRaw=teTimeToMinutes(entry.outH,entry.outM,entry.outAP);
  if(inMin===null) return {shift:null,late:0,lateIn:0,earlyOut:0,working:0,ot:0};
  let outMin=outMinRaw;
  if(outMin!==null && outMin<=inMin) outMin+=24*60; // overnight out-time
  const holidayFullOT = dateForRow ? teIsHolidayDate(dateForRow) : false;
  if(holidayFullOT){
    const dur = (outMin!==null) ? Math.max(0,outMin-inMin) : 0;
    return {shift:teDetectShift(inMin), late:0, lateIn:0, earlyOut:0, working:0, ot:dur};
  }
  const w=teShiftWindow(inMin, dateForRow, code);
  const shift={name:w.name, standard:w.start};
  const regularEnd = w.start + TE_WORK_MIN + TE_BREAK_MIN; // shift start + 8 hours + 30-minute break
  const lateIn = Math.max(0, inMin - w.start);
  if(outMin===null) return {shift, late:lateIn, lateIn, earlyOut:0, working:0, ot:0};
  const earlyOut = Math.max(0, regularEnd - outMin);
  const span = Math.min(outMin, regularEnd) - Math.max(inMin, w.start);
  const working = Math.min(Math.max(0, span - TE_BREAK_MIN), TE_WORK_MIN);
  const ot = Math.max(0, outMin - regularEnd);
  return {shift, late:lateIn+earlyOut, lateIn, earlyOut, working, ot};
}
// The days of a month whose Time Entry Late and OT count in payroll: the employee is on the roll,
// the day has a time entry, and the day is not Loss of Pay (a Time Entry leave or a mark on the
// Attendance screen). Sundays and holidays count their whole time as OT (teCompute).
function teMonthDays(code, ym){
  const emp=(db.employees||[]).find(e=>e.code===code);
  const out=[], dim=daysInMonth(ym);
  for(let d=1; d<=dim; d++){
    const ds=ym+'-'+String(d).padStart(2,'0');
    const entry=db.timeEntries && db.timeEntries[ds] && db.timeEntries[ds][code];
    if(!entry || entry.inH==='' || entry.inH===undefined || entry.inH===null) continue;
    if(emp && !isEmpOnRollOn(emp, ds)) continue;
    const lv=teGetLeave(ds, code); if(lv && lv.type!=='Half Day') continue;
    if(typeof getAttStatus==='function' && getAttStatus(ds, code)==='LossOfPay') continue;
    out.push({date:ds, c:teHalfDayCap(teCompute(entry, ds, code), !!lv)});
  }
  return out;
}
// A Half Day counts at most 4 working hours (half of 8) and no Late — the person is off for half
// the shift, so coming late or leaving early is the half day itself. OT is kept as worked.
const TE_HALF_DAY_MIN=4*60;
function teHalfDayCap(c, half){ return half && c ? {...c, working:Math.min(c.working, TE_HALF_DAY_MIN), late:0, lateIn:0, earlyOut:0} : c; }
function teMonthTotal(code, ym, key){ return teMonthDays(code, ym).reduce((s,x)=>s+(x.c[key]||0), 0); }
// Total Late (minutes) in a month. Payroll uses it for the Late Deduction unless a different figure
// is typed for that month on the Attendance screen.
function teMonthLateMinutes(code, ym){ return teMonthTotal(code, ym, 'late'); }
// Total OT (minutes) in a month — same days as Late. Payroll uses it for OT unless hours are typed
// on the Attendance screen.
function teMonthOTMinutes(code, ym){ return teMonthTotal(code, ym, 'ot'); }
// OT minutes per day (for a month whose wage changed part-way: each day is paid at its own rate).
function teMonthOTByDay(code, ym){ return teMonthDays(code, ym).filter(x=>x.c.ot>0).map(x=>({date:x.date, min:x.c.ot})); }
function teSetTab(t){ if(t!==teTab && !teEditConfirmLeave()) return; teTab=t; render('timeentry'); }

/* ---- Edit / Save --------------------------------------------------------------
   Nothing changed in Employee Time Entry (Date-wise, Employee-wise, Token Entry, Shift Groups) or
   in Attendance → Edit Monthly Figures reaches the database — or Payroll — until Save.
   Edit opens a session and keeps a copy of the stores below; changes show on screen straight away;
   Save writes them; Cancel puts the copy back. Leaving the screen (another page, another Time Entry
   tab) with unsaved changes asks to Save or Discard. While a session is open, anything else that
   saves the database writes these stores as they were before Edit (teDraftSafe), so a half-done
   edit never leaks out. */
const TE_EDIT_KEYS=['timeEntries','timeLeaves','shiftOverrides','payrollAdjustments','attendance','groupWeekShift','groupMap','shiftPresets','shiftPresetsOffered','shiftGroups','holidays','timeHolidays'];
let teEdit=null; // {area:'grid'|'tokens'|'groups'|'leave'|'holidays'|'attendance', snap:JSON, dirty:boolean}
function teEditActive(area){ return !!teEdit && (!area || teEdit.area===area); }
function teEditBegin(area){
  if(teEdit) return teEdit.area===area;
  teEdit={area, snap:JSON.stringify(Object.fromEntries(TE_EDIT_KEYS.map(k=>[k, db[k]===undefined?null:db[k]]))), dirty:false};
  return true;
}
// A change made inside a session: shown on screen, saved only with Save.
function teEditTouch(){ if(teEdit){ teEdit.dirty=true; if(typeof teEwSetSaveState==='function') teEwSetSaveState('unsaved'); } }
// Every screen's Edit flag, closed together when a session ends.
function teEditEndModes(){
  teGridEditMode=false;
  if(typeof teEwEditMode!=='undefined') teEwEditMode=false;
  if(typeof teDwSel!=='undefined') teDwSel.clear();
  if(typeof attEditMode!=='undefined'){ attEditMode=false; attEditSnapshot=null; }
}
async function teEditSave(){
  if(!teEdit) return true;
  teEdit=null; teEditEndModes();
  return teEwQueueSave();
}
function teEditDiscard(){
  if(!teEdit) return;
  const snap=JSON.parse(teEdit.snap);
  TE_EDIT_KEYS.forEach(k=>{ if(snap[k]===null) delete db[k]; else db[k]=snap[k]; });
  teEdit=null; teEditEndModes();
  if(typeof teEwSetSaveState==='function') teEwSetSaveState('idle');
}
// Cancel button: back to the saved figures.
function teEditCancel(page){
  if(teEdit && teEdit.dirty && !confirm('Discard the changes you made since Edit?')) return;
  teEditDiscard(); render(page||'timeentry');
}
// Before leaving a screen that has an open session. true = go on, false = stay.
function teEditConfirmLeave(){
  if(!teEdit) return true;
  if(!teEdit.dirty){ teEditDiscard(); return true; } // opened but nothing changed: just close it
  if(confirm('You have changes that are not saved yet.\n\nOK = Save them now\nCancel = choose to discard them or keep editing')){ teEditSave(); return true; }
  if(confirm('Discard the changes?\n\nOK = Discard them\nCancel = stay here and keep editing')){ teEditDiscard(); return true; }
  return false;
}
// What saveDB writes while a session is open: the edited stores as they were before Edit.
function teDraftSafe(d){
  if(!teEdit) return d;
  const snap=JSON.parse(teEdit.snap), out={...d};
  TE_EDIT_KEYS.forEach(k=>{ if(snap[k]===null) delete out[k]; else out[k]=snap[k]; });
  return out;
}
window.addEventListener('beforeunload',e=>{ if(teEdit && teEdit.dirty){ e.preventDefault(); e.returnValue=''; } });
// Edit / Save / Cancel bar for a Time Entry tab whose whole content is one edit area.
function teAreaEdit(area){ if(!teEditBegin(area)){ alert('Save or cancel the other edit first.'); return; } render('timeentry'); }
function teAreaSave(){ teEditSave(); render('timeentry'); }
function teEditBarHtml(area, allowed, offNote, onNote, below){
  const on=allowed && teEditActive(area);
  return `<div class="teSmEditBar ${below?'teHasFilt':''}">
    <span class="teSmEditNote">${on?onNote:allowed?offNote:'View only.'}</span>
    <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
    ${!allowed ? '' : on
      ? `<button class="btn secondary" onclick="teEditCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn" onclick="teAreaSave()">${ico('save')} Save</button>`
      : `<button class="btn btnEditAtt" onclick="teAreaEdit('${area}')">${ico('pencil')} Edit</button>`}
    ${below||''}
  </div>`;
}
// Changing the date switches the whole Date-wise grid to that date, auto-creating blank rows for
// every active employee on it. The grid stays unlocked if it was, so entry can continue
// date after date (‹ › buttons or Alt+PgUp / Alt+PgDn).
function teSetGridDate(v){
  if(!v) return;
  teGridDate=v;
  ensureTimeEntriesForDate(teGridDate);
  render('timeentry');
}
// "✏️ Edit" / "💾 Save" pair, shown right next to the Date Selector: Edit unlocks every
// row on the selected date for in-place editing; Save re-locks the grid once the user is
// done. Cell values already save instantly to Supabase as they're typed, so
// Save here mainly confirms the update and returns the grid to its safer, read-only state.
function teToggleGridEdit(){
  if(!hasPerm('timeentry','add') && !hasPerm('timeentry','edit')){ alert('You do not have permission to edit time entries.'); return; }
  teGridEditMode=true;
  render('timeentry');
}
function teSaveGridChanges(){
  teGridEditMode=false;
  render('timeentry');
}
// Employees Time Entry lists: those on the roll on a date ('YYYY-MM-DD') or in a month ('YYYY-MM'),
// the same rule payroll uses — so someone who resigned mid-month can still have that month's days
// entered and corrected. With no date: everyone not resigned.
function activeEmployeesForTE(scope){
  const list=(db.employees||[]).filter(e=> !scope ? e.status!=='Resigned'
    : scope.length===7 ? isEmpOnRollInMonth(e, scope) : isEmpOnRollOn(e, scope));
  return list.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
}
// The date or month the open Time Entry tab is showing.
function teScope(){
  return teTab==='empwise' ? teEwMonth : teTab==='summary' ? teSummaryMonth : teTab==='tokens' ? teTokMonth : teTab==='leave' ? teLeaveDate : teGridDate;
}
/* ---- Unit / Contractor filter (one filter for the whole Time Entry page: Date-wise grid,
   Employee-wise picker, Employee Leave, Attendance & OT Summary and their prints). It only
   narrows what is shown — every active employee still gets a row in db.timeEntries. ---- */
let teUnitFilter='';        // '' = all units, or a unit code ('Unit-1', …)
let teContractorFilter='';  // '' = all, '-' = no contractor, or a contractor code
function teEmpMatchesFilter(e){
  return !!e && (!teUnitFilter || unitCodeOf(e.unit)===teUnitFilter) && contractorFilterMatches(e, teContractorFilter);
}
function teFilteredEmployees(scope){ return activeEmployeesForTE(scope===undefined ? teScope() : scope).filter(teEmpMatchesFilter); }
// For lists keyed by employee code (day lists, leave records, prints).
function teCodeInFilter(code){
  if(!teUnitFilter && !teContractorFilter) return true;
  return teEmpMatchesFilter((db.employees||[]).find(e=>e.code===code));
}
function teFilterText(){
  return [teUnitFilter?unitLabel(teUnitFilter):'', teContractorFilter?(teContractorFilter==='-'?'Contractor not set':contractorName(teContractorFilter)):''].filter(Boolean).join(' · ');
}
function teSetUnitFilter(v){ teUnitFilter=v||''; teDwSel.clear(); render('timeentry'); }
function teSetContractorFilter(v){ teContractorFilter=v||''; teDwSel.clear(); render('timeentry'); }
/* ---- Keep a grid's frozen headings in sight (Date-wise and Employee-wise) ----
   A grid scrolls inside its own box; its column headings (and Date-wise's shift bars, Employee-wise's
   month total at the bottom) freeze at the edges of that box. The page around it scrolls too, so the
   two are kept in step:
     - the box is as tall as the room left under the toolbar (at least 360px, at most the window),
       so the whole grid — headings included — is on screen;
     - scrolling down over the grid first moves the page just enough to show the whole box, then
       the rows scroll under the frozen headings;
     - whenever the rows scroll while the top of the box is above the window (the page was scrolled
       further), the page brings it back down. */
const TE_FIT_GAP=8;
function teFitOuter(box){
  for(let q=box.parentElement; q; q=q.parentElement){ const o=getComputedStyle(q).overflowY; if((o==='auto'||o==='scroll') && q.scrollHeight>q.clientHeight+1) return q; }
  return document.scrollingElement || document.documentElement;
}
// The page scroller and the visible part of it (top / bottom on screen).
function teFitView(box){
  const outer=teFitOuter(box), win=outer===document.scrollingElement || outer===document.documentElement;
  const r=win ? {top:0, bottom:window.innerHeight} : outer.getBoundingClientRect();
  return {outer, top:r.top, bottom:r.bottom};
}
function teFitGridBox(gridId){
  const g=document.getElementById(gridId), box=g && g.closest('.teEwWrap'); if(!box) return;
  const v=teFitView(box), viewH=v.bottom-v.top;
  const topInPage=box.getBoundingClientRect().top - v.top + v.outer.scrollTop; // where the box starts with the page at the top
  const room=viewH - topInPage - TE_FIT_GAP;
  box.classList.add('teFit');
  box.style.setProperty('--teBoxH', Math.round(Math.min(viewH-2*TE_FIT_GAP, Math.max(360, room)))+'px');
  if(!box.dataset.fit){
    box.dataset.fit='1';
    box.addEventListener('wheel', teFitBoxWheel, {passive:false});
    box.addEventListener('scroll', teFitBoxScroll, {passive:true});
  }
}
function teFitBoxWheel(ev){
  if(ev.deltaY<=0 || ev.ctrlKey || ev.shiftKey) return;
  const box=ev.currentTarget;
  if(box.scrollTop+box.clientHeight >= box.scrollHeight-1) return; // rows at the end: the page scrolls on as usual
  const v=teFitView(box), below=box.getBoundingClientRect().bottom - (v.bottom-TE_FIT_GAP);
  if(below<=1) return; // the whole box is on screen: the rows scroll
  ev.preventDefault();
  const px=ev.deltaY*(ev.deltaMode===1 ? 16 : ev.deltaMode===2 ? v.bottom-v.top : 1);
  v.outer.scrollTop+=Math.min(below, px);
}
function teFitBoxScroll(ev){
  const box=ev.currentTarget; if(box.scrollTop<=0) return;
  const v=teFitView(box), above=box.getBoundingClientRect().top - (v.top+TE_FIT_GAP);
  if(above < -1) v.outer.scrollTop+=above; // the headings went above the window: bring them back
}
window.addEventListener('resize', ()=>{ ['teDwGrid','teEwGrid'].forEach(id=>{ if(document.getElementById(id)) teFitGridBox(id); }); });

/* ---- Folding sections of a grid, one open at a time (Date-wise shifts, Employee-wise weeks) ----
   A section is <tbody class="teSec" data-sec="id"> whose first row is its bar (tr.teSecHead, with a
   .teDwFold button). Every section starts folded — only its bar shows. Click a bar to open it;
   opening another folds the one before; click the open bar again to fold it. The corner button
   (<gridId>FoldAll) opens every section or folds them all. The bar stays at the top of the grid
   (under the column headings) while its rows scroll. Folding only changes what is shown. */
const teOpenSecs={teDwGrid:new Set(), teEwGrid:new Set(), teLvGrid:new Set()};
const TE_SEC_WORD={teDwGrid:'shift', teEwGrid:'week', teLvGrid:'date'};
function teSecGridId(el){ const t=el && el.closest('table'); return t ? t.id : ''; }
function teSecApply(gridId){
  const open=teOpenSecs[gridId], word=TE_SEC_WORD[gridId]||'section';
  document.querySelectorAll(`#${gridId} tbody.teSec`).forEach(tb=>{
    const on=open.has(tb.dataset.sec);
    tb.classList.toggle('folded', !on);
    const b=tb.querySelector('.teDwFold'); if(b){ b.setAttribute('aria-expanded', String(on)); b.title=on?`Fold this ${word}`:`Click to expand this ${word}`; }
    const a=document.activeElement; if(!on && a && tb.contains(a) && !a.closest('tr.teSecHead')) a.blur();
  });
  teSecRefreshAll(gridId);
}
// Open only this section (the others fold); with toTop, bring its bar to the top of the grid.
function teSecOpenOnly(tb, toTop){
  const gridId=teSecGridId(tb); if(!teOpenSecs[gridId]) return;
  teOpenSecs[gridId]=new Set([tb.dataset.sec]); teSecApply(gridId);
  if(toTop){
    const box=tb.closest('.teEwWrap'), head=document.querySelector(`#${gridId} thead`), bar=tb.querySelector('tr.teSecHead td');
    const stick=bar ? parseFloat(getComputedStyle(bar).top) : NaN; // where its bar freezes
    if(box) box.scrollTop+=tb.getBoundingClientRect().top - box.getBoundingClientRect().top - (isFinite(stick) ? stick : (head?head.offsetHeight:0));
  }
}
function teSecFold(btn){
  const tb=btn.closest('tbody.teSec'), gridId=teSecGridId(tb); if(!tb || !teOpenSecs[gridId]) return;
  const open=teOpenSecs[gridId];
  if(open.size===1 && open.has(tb.dataset.sec)){ open.clear(); teSecApply(gridId); } // the open one: fold it
  else teSecOpenOnly(tb, true);
}
// Scroll a grid's box just enough to show this row clear of what is frozen over it: the column
// headings, its own bar (and the bars stacked above it), the next bar (and the bars stacked below
// it) and a frozen total row. scrollIntoView does not know about those and leaves rows under them.
function teSecKeepInView(tr){
  const box=tr && tr.closest('.teEwWrap'), table=tr && tr.closest('table'); if(!box || !table) return;
  const rect=el=>el ? el.getBoundingClientRect() : null, b=rect(box);
  let top=b.top+box.clientTop, bottom=top+box.clientHeight;
  const th=table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells[0]; if(th) top=Math.max(top, rect(th).bottom);
  const tb=tr.closest('tbody.teSec');
  if(tb){
    const own=tb.querySelector('tr.teSecHead td:last-child'); if(own) top=Math.max(top, rect(own).bottom);
    let nx=tb.nextElementSibling; while(nx && !(nx.tagName==='TBODY' && nx.classList.contains('teSec'))) nx=nx.nextElementSibling;
    const next=nx && nx.querySelector('tr.teSecHead td:last-child'); if(next) bottom=Math.min(bottom, rect(next).top);
  }
  const ft=table.tFoot && table.tFoot.rows[0] && table.tFoot.rows[0].cells[0]; if(ft) bottom=Math.min(bottom, rect(ft).top);
  const r=rect(tr);
  if(r.top<top) box.scrollTop-=top-r.top; else if(r.bottom>bottom) box.scrollTop+=r.bottom-bottom;
}
// Focus a cell and keep its row in sight (see teSecKeepInView).
function teSecFocus(el){ el.focus({preventScroll:true}); teSecKeepInView(el.closest('tr')); }
// A cell in a folded section (keyboard move / jump): open that section, the others fold.
function teSecReveal(el){ const tb=el && el.closest('tbody.teSec'); if(tb && tb.classList.contains('folded')) teSecOpenOnly(tb, false); }
function teSecFoldAll(gridId){
  const secs=[...document.querySelectorAll(`#${gridId} tbody.teSec`)];
  teOpenSecs[gridId] = secs.some(tb=>!tb.classList.contains('folded')) ? new Set() : new Set(secs.map(tb=>tb.dataset.sec));
  teSecApply(gridId);
}
function teSecRefreshAll(gridId){
  const b=document.getElementById(gridId+'FoldAll'); if(!b) return;
  const word=TE_SEC_WORD[gridId]||'section', secs=[...document.querySelectorAll(`#${gridId} tbody.teSec`)], all=!!secs.length && secs.every(tb=>tb.classList.contains('folded'));
  b.classList.toggle('folded', all); b.setAttribute('aria-expanded', String(!all));
  b.title=all?`Expand every ${word}`:`Fold every ${word} — only the bars stay`;
}
// The frozen bars sit just under the column headings: tell them their height.
// Exact (fractional) heights, half a pixel under, so frozen bars sit flush with no sliver of rows between.
function teSetHeadHeight(gridId){
  const g=document.getElementById(gridId), h=g && g.tHead && g.tHead.rows[0]; if(h) g.style.setProperty('--teHeadH', (h.getBoundingClientRect().height-0.5)+'px');
  const bar=g && g.querySelector('tr.teSecHead'); if(bar) g.style.setProperty('--teBarH', (bar.getBoundingClientRect().height-0.5)+'px'); // one bar's height (Date-wise stacks them)
}

/* ---- One filter row for Date-wise and Employee-wise: Unit, Contractor, Group and Shift side by side
   as plain drop-downs, how many employees are shown, and Clear. A drop-down in use is tinted, so it
   is plain which filters are on. Unit and Contractor are the same filter as the other tabs' bar.
     o = {grp, setGrp, shift, setShift, shiftCounts:{key:n,'-':n}, shiftTitle, clear, shown, all, noShift}
   setGrp / setShift / clear are called as  <setGrp>(value)  and  <clear>()  in the page. ---- */
function teFilterRowHtml(o){
  const sel=(on, fn, label, title, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}" title="${teEsc(title)}">${opts}</select>`;
  const opt=(v, cur, text)=>`<option value="${teEsc(v)}" ${cur===v?'selected':''}>${teEsc(text)}</option>`;
  const cnt=k=>o.shiftCounts && o.shiftCounts[k]!==undefined ? ` (${o.shiftCounts[k]})` : '';
  const any=!!(teUnitFilter||teContractorFilter||o.grp||o.shift);
  return `<div class="teFiltRow">
    <span class="teFiltLbl">${ico('filter')} Filter</span>
    ${sel(teUnitFilter, 'teSetUnitFilter', 'Unit', 'Working unit',
      opt('', teUnitFilter, 'All Units')+getUnits().map(u=>opt(u.code, teUnitFilter, unitTabLabel(u))).join(''))}
    ${sel(teContractorFilter, 'teSetContractorFilter', 'Contractor', 'Contractor', contractorFilterOptionsHtml(teContractorFilter))}
    ${sel(o.grp, o.setGrp, 'Group', 'Shift group (Shift Groups tab)',
      opt('', o.grp, 'All Groups')+teGroups().map(g=>opt(g.key, o.grp, g.label)).join('')+opt('-', o.grp, 'No group'))}
    ${o.noShift ? '' : sel(o.shift, o.setShift, 'Shift', o.shiftTitle,
      opt('', o.shift, 'All Shifts')+teShiftPresets().map(p=>opt(p.key, o.shift, p.label+cnt(p.key))).join('')+opt('-', o.shift, 'No shift planned'+cnt('-')))}
    <span class="teFiltCount">${o.shown===o.all?`${o.all} employees`:`<b>${o.shown}</b> of ${o.all} employees`}</span>
    ${any?`<button type="button" class="teFiltClear" onclick="${o.clear}()" title="Show everyone">${ico('filter-x')} Clear filters</button>`:''}
  </div>`;
}

/* ---- Group and Shift filters for the other tabs (Leave Entry, Attendance & OT, Token Entry,
   Shift Groups). Each tab keeps its own; Unit and Contractor are shared by every tab. The Shift
   filter means the shift planned on the date shown (Leave Entry: the leave's date) or, for a month,
   on any day of that month. ---- */
const teTabFilt={leave:{grp:'',shift:''}, summary:{grp:'',shift:''}, tokens:{grp:'',shift:''}, shiftmap:{grp:'',shift:''}};
function teTfSetter(tab, key){ return v=>{ teTabFilt[tab][key]=v||''; render('timeentry'); }; }
function teTfClear(tab){ teTabFilt[tab].grp=''; teTabFilt[tab].shift=''; teUnitFilter=''; teSetContractorFilter(''); }
function teTfGroupOk(tab, code){ const g=teTabFilt[tab].grp; return !g || (g==='-' ? !teEmpGroup(code) : teEmpGroup(code)===g); }
// code -> Set of shift keys planned on the date ('YYYY-MM-DD') or on any day of the month ('YYYY-MM').
function teTfShiftKeys(scope){
  if(scope && scope.length===7) return teEwMonthShiftKeys(scope);
  return code=>{ const k=teEmpShiftKey(code, scope); return new Set(k?[k]:[]); };
}
function teTfShiftOk(tab, code, keys){ const sh=teTabFilt[tab].shift; if(!sh) return true; const k=keys(code); return sh==='-' ? !k.size : k.has(sh); }
// Employees on the roll for the date / month, through Unit, Contractor, Group and Shift.
function teTfEmployees(tab, scope){
  const keys=teTfShiftKeys(scope);
  return teFilteredEmployees(scope).filter(e=>teTfGroupOk(tab, e.code) && teTfShiftOk(tab, e.code, keys));
}
// One employee code (for records such as leave), with the shift taken on that record's date.
function teTfCodeIn(tab, code, scope){ return teCodeInFilter(code) && teTfGroupOk(tab, code) && teTfShiftOk(tab, code, teTfShiftKeys(scope)); }
function teTfFilterText(tab){
  const f=teTabFilt[tab];
  const grp=f.grp ? (f.grp==='-' ? 'No group' : teGroupLabel(f.grp)) : '';
  const sh=f.shift ? (f.shift==='-' ? 'No shift planned' : (teShiftByKey(f.shift)||{}).label||'') : '';
  return [teFilterText(), grp, sh].filter(Boolean).join(' · ');
}
function teTfRowHtml(tab, scope, shown, opts){
  opts=opts||{};
  let counts=null;
  if(!opts.noShift){
    const keys=teTfShiftKeys(scope), n={'-':0}; teShiftPresets().forEach(p=>{ n[p.key]=0; });
    teFilteredEmployees(scope).filter(e=>teTfGroupOk(tab, e.code)).forEach(e=>{ const k=keys(e.code); if(!k.size) n['-']++; k.forEach(x=>{ if(n[x]!==undefined) n[x]++; }); });
    counts=n;
  }
  return teFilterRowHtml({grp:teTabFilt[tab].grp, setGrp:`teTfSetter('${tab}','grp')`, shift:teTabFilt[tab].shift, setShift:`teTfSetter('${tab}','shift')`,
    shiftCounts:counts, shiftTitle:opts.shiftTitle||'', clear:`teTfClear.bind(null,'${tab}')`, noShift:!!opts.noShift,
    shown, all:activeEmployeesForTE(scope).length});
}

/* ---------------- Employee Leave (this module's own leave log — separate from any
   Payroll leave logic; purely a record of who is on leave and why). ---------------- */
function teSetLeaveField(field,val){
  if(field==='date') teLeaveDate=val;
  else if(field==='emp') teLeaveEmp=val;
  else if(field==='type') teLeaveType=val;
  else if(field==='remarks') teLeaveRemarks=val;
  render('timeentry');
}
// Leave Entry works after Edit: "Add to list" / remove change the list on screen; Save puts them in
// Attendance and Payroll.
function teSaveLeave(){
  if(!hasPerm('timeentry','add') && !hasPerm('timeentry','edit')){ alert('You do not have permission to record employee leave.'); return; }
  if(!teEditActive('leave')){ alert('Click Edit first.'); return; }
  if(!teLeaveEmp){ alert('Please select an employee.'); return; }
  if(!teLeaveDate){ alert('Please choose a date.'); return; }
  if(!Array.isArray(db.timeLeaves)) db.timeLeaves=[];
  db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===teLeaveDate && l.empCode===teLeaveEmp));
  db.timeLeaves.push({date:teLeaveDate, empCode:teLeaveEmp, type:teLeaveType, remarks:teLeaveRemarks||''});
  if(!db.timeEntries[teLeaveDate]) db.timeEntries[teLeaveDate]={};
  if(!db.timeEntries[teLeaveDate][teLeaveEmp]) db.timeEntries[teLeaveDate][teLeaveEmp]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
  teEditTouch();
  teOpenSecs.teLvGrid=new Set([teLeaveDate]); // show the date just added to
  teLeaveEmp=''; teLeaveRemarks=''; teLeaveType=TE_LEAVE_TYPES[0];
  render('timeentry');
}
function teDeleteLeave(dt, code){
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to remove a leave record.'); return; }
  if(!teEditActive('leave')){ alert('Click Edit first.'); return; }
  if(!confirm('Remove this leave record? (It is removed when you Save.)')) return;
  db.timeLeaves=(db.timeLeaves||[]).filter(l=>!(l.date===dt && l.empCode===code));
  teEditTouch(); render('timeentry');
}
function printTELeaveDay(dt){
  const list=(db.timeLeaves||[]).filter(l=>l.date===dt && teTfCodeIn('leave', l.empCode, l.date));
  const ft=teTfFilterText('leave');
  if(!list.length){ alert('No leave records for this date'+(ft?' for '+ft:'')+'.'); return; }
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  const rows=list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)',department:''};
    return `<tr><td>${idx+1}</td><td>${l.empCode}</td><td style="text-align:left;">${emp.name}</td><td>${emp.department||'-'}</td><td>${l.type==='NOPL'?'Loss of Pay':l.type}</td><td style="text-align:left;">${l.remarks||'-'}</td></tr>`; }).join('');
  const html=`<table class="repTable"><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Dept</th><th>Leave Type</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintWindow(`Employee Leave — ${fmtDate(dt)}${ft?' — '+ft:''}`, html);
}
function renderTELeaveTab(){
  const emps=teTfEmployees('leave', teLeaveDate);
  const allowed=hasPerm('timeentry','add')||hasPerm('timeentry','edit');
  const canEdit=allowed && teEditActive('leave');
  const canDel=canEdit && hasPerm('timeentry','delete');
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  if(teLeaveEmp && !emps.some(e=>e.code===teLeaveEmp)) teLeaveEmp='';
  const leaves=(db.timeLeaves||[]).filter(l=>teTfCodeIn('leave', l.empCode, l.date));
  const dates=[...new Set(leaves.map(l=>l.date))].sort().reverse().slice(0,20);
  const filt=teTfRowHtml('leave', teLeaveDate, emps.length, {shiftTitle:'Shift planned on '+fmtDate(teLeaveDate)+' (the leave list below: on each leave\'s date)'});
  return `${teEditBarHtml('leave', allowed, 'Click Edit to add or remove leave.', 'Editing — add or remove leave below, then Save. Attendance and Payroll use it only after Save.', filt)}
  <div class="panel">
    <h3>${ico('palm')} Record Employee Leave</h3>
    <p class="syncNote">Select the employee and enter their leave details for the chosen date. A Loss of Pay or Half Day recorded here counts in Attendance and Payroll for that day, unless a different status is marked on the Attendance screen.</p>
    <div class="formGrid">
      <div><label>Date</label><input type="date" value="${teLeaveDate}" ${canEdit?'':'disabled'} onchange="teSetLeaveField('date',this.value)"></div>
      <div><label>Employee</label>
        <select ${canEdit?'':'disabled'} onchange="teSetLeaveField('emp',this.value)">
          <option value="">— select employee —</option>
          ${emps.map(e=>`<option value="${e.code}" ${teLeaveEmp===e.code?'selected':''}>${e.code} — ${e.name}</option>`).join('')}
        </select>
      </div>
      <div><label>Leave Type</label>
        <select ${canEdit?'':'disabled'} onchange="teSetLeaveField('type',this.value)">
          ${TE_LEAVE_TYPES.map(t=>`<option value="${t}" ${teLeaveType===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div><label>Leave Details / Remarks</label><input type="text" placeholder="Reason / details" value="${teLeaveRemarks}" ${canEdit?'':'disabled'} oninput="teSetLeaveField('remarks',this.value)"></div>
      <div class="full"><button class="btn" ${canEdit?'':'disabled'} onclick="teSaveLeave()">${ico('plus')} Add to list</button></div>
    </div>
  </div>
  ${!dates.length?`<div class="panel"><div class="empty">${teTfFilterText('leave')?'No leave records for these filters.':'No leave records yet.'}</div></div>`:teLeaveListHtml(dates, leaves, empMap, canDel)}`;
}
/* ---- The leave list: one bar per date (the latest 20), folding like the Date-wise shifts — every date
   starts folded, one open at a time (teSecApply). Each bar: the date, the day, how many are on leave and
   of which type, and that date's Print. The date a leave was just added to opens. ---- */
function teLeaveListHtml(dates, leaves, empMap, canDel){
  const cols=canDel?6:5, open=teOpenSecs.teLvGrid, today=todayStr(), anyOpen=dates.some(d=>open.has(d));
  const type=l=>l.type==='NOPL'?'Loss of Pay':l.type;
  return `<div class="panel">
    <div class="teCalHead"><div><h3 style="margin:0;">${ico('palm')} Leave records</h3><p class="teSmSub">The latest ${dates.length} date${dates.length===1?'':'s'} with leave — click a date to expand it.</p></div></div>
    <div class="teShiftBox"><table class="teLvGrid" id="teLvGrid">
      <thead><tr><th class="teDwSlTh"><button type="button" id="teLvGridFoldAll" class="teDwFoldAll ${anyOpen?'':'folded'}" tabindex="-1" aria-expanded="${anyOpen}" title="${anyOpen?'Fold every date — only the bars stay':'Expand every date'}" onclick="teSecFoldAll('teLvGrid')">${ico('chevron-down')}</button>Sl No</th>
        <th>Emp Code</th><th>Employee</th><th>Leave Type</th><th>Remarks</th>${canDel?'<th></th>':''}</tr></thead>
      ${dates.map(dt=>{
        const list=leaves.filter(l=>l.date===dt), folded=!open.has(dt);
        const byType={}; list.forEach(l=>{ byType[type(l)]=(byType[type(l)]||0)+1; });
        const day=new Date(dt+'T00:00:00').toLocaleDateString('en-US',{weekday:'long'});
        return `<tbody class="teSec teLvSec ${folded?'folded':''}" data-sec="${dt}">
          <tr class="teGrpHead teDwShiftHead teSecHead"><td colspan="${cols-1}">
            <button type="button" class="teDwFold" tabindex="-1" aria-expanded="${!folded}" title="${folded?'Click to expand this date':'Fold this date'}" onclick="teSecFold(this)">${ico('chevron-down')}<span class="teShiftBadge">${fmtDate(dt)}</span><span>${day}</span><span class="teEwWeekSum">${list.length} on leave</span><span>${Object.entries(byType).map(([t,n])=>`${n} ${teEsc(t)}`).join(' · ')}</span>${dt===today?'<span class="teEwThisWk">Today</span>':''}<span class="teDwFoldNote">Click to expand</span></button></td>
            <td class="teLvPrintCell"><button class="btn secondary teLvPrint" onclick="printTELeaveDay('${dt}')" title="Print the leave for ${fmtDate(dt)}">${ico('printer')} Print</button></td></tr>
          ${list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)'};
            return `<tr><td>${idx+1}</td><td>${teEsc(l.empCode)}</td><td style="text-align:left;">${teEsc(emp.name)}</td><td>${teEsc(type(l))}</td><td style="text-align:left;">${teEsc(l.remarks||'-')}</td>
            ${canDel?`<td><button class="btn danger" style="padding:3px 8px;font-size:11px;" onclick="teDeleteLeave('${dt}','${teEsc(l.empCode)}')">${ico('x')}</button></td>`:''}</tr>`; }).join('')}
        </tbody>`;
      }).join('')}
    </table></div>
  </div>`;
}

