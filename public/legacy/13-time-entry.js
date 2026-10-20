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
let teTab='entry';                 // 'entry' (Date-wise) | 'empwise' (Employee-wise) | 'leave' | 'holiday' | 'summary'
let teGridDate=todayStr();         // date currently selected in the Time Entries grid (defaults to today)
let teGridEditMode=false;          // false = grid rows are locked/view-only until "Edit" is pressed
let teCalMonth=monthKey(todayStr());
let teSummaryMonth=monthKey(todayStr()); // month shown in the Attendance & OT Summary tab
let teSelHolDate=null;
let teHolRemarks='';
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
// The company's shifts (8 working hours + a 30-minute break; "+ OT" = 2 hours more). Used by
// the Bulk Shift tool in the Date-wise grid; times are minutes from midnight (> 1440 = next day).
const TE_SHIFTS=[
  {key:'first',    label:'First Shift',       inMin:7*60,     outMin:15*60+30},
  {key:'firstOT',  label:'First Shift + OT',  inMin:7*60,     outMin:17*60+30},
  {key:'general',  label:'General Shift',     inMin:9*60,     outMin:17*60+30},
  {key:'second',   label:'Second Shift',      inMin:15*60+30, outMin:24*60},
  {key:'secondOT', label:'Second Shift + OT', inMin:15*60+30, outMin:26*60}
];
function teMinToHMAP(min){ min=((min%1440)+1440)%1440; return {h:(Math.floor(min/60)%12)||12, m:min%60, ap:min>=720?'PM':'AM'}; }
function teMinLabel(min){ const t=teMinToHMAP(min); return t.h+':'+String(t.m).padStart(2,'0')+' '+t.ap; }
function teShiftLabel(s){ return `${s.label} (${teMinLabel(s.inMin)} – ${teMinLabel(s.outMin)})`; }
// Shift auto-detection from the In Time — purely for this module's own display & print:
//   First Shift   (7:00 AM – 3:30 PM):  In before 9:00 AM
//   General Shift (9:00 AM – 5:30 PM):  In from 9:00 AM until 3:00 PM
//   Second Shift  (3:30 PM – 12:00 AM): In from 3:00 PM
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
function teCompute(entry, dateForRow){
  const inMin=teTimeToMinutes(entry.inH,entry.inM,entry.inAP);
  const outMinRaw=teTimeToMinutes(entry.outH,entry.outM,entry.outAP);
  if(inMin===null) return {shift:null,late:0,working:0,ot:0};
  let outMin=outMinRaw;
  if(outMin!==null && outMin<=inMin) outMin+=24*60; // overnight out-time
  const holidayFullOT = dateForRow ? teIsHolidayDate(dateForRow) : false;
  if(holidayFullOT){
    const dur = (outMin!==null) ? Math.max(0,outMin-inMin) : 0;
    return {shift:teDetectShift(inMin), late:0, working:0, ot:dur};
  }
  const shift=teDetectShift(inMin);
  // Personal shift-start for Late/OT purposes = the actual In Time rounded DOWN to the
  // nearest HALF-HOUR (e.g. 7:10 AM → 7:00, 8:10 AM → 8:00, 5:30 PM → 5:30 — since Second
  // Shift's own standard start already falls on a half-hour mark) — not the shift's fixed
  // standard start. Late is always just the minutes past that half-hour mark. The 8 working
  // hours (+30-minute break) then run from that rounded mark, so anything worked beyond it is OT.
  const roundedStart = Math.floor(inMin/30)*30;
  const late = inMin - roundedStart;
  if(outMin===null) return {shift, late, working:0, ot:0};
  const regularEnd = roundedStart + 8*60 + 30; // 8 working hours + 30-minute break
  const working = Math.min(Math.max(0,outMin-roundedStart-30), 8*60);
  const ot = Math.max(0, outMin - regularEnd);
  return {shift, late, working, ot};
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
    out.push({date:ds, c:teCompute(entry, ds)});
  }
  return out;
}
function teMonthTotal(code, ym, key){ return teMonthDays(code, ym).reduce((s,x)=>s+(x.c[key]||0), 0); }
// Total Late (minutes) in a month. Payroll uses it for the Late Deduction unless a different figure
// is typed for that month on the Attendance screen.
function teMonthLateMinutes(code, ym){ return teMonthTotal(code, ym, 'late'); }
// Total OT (minutes) in a month — same days as Late. Payroll uses it for OT unless hours are typed
// on the Attendance screen.
function teMonthOTMinutes(code, ym){ return teMonthTotal(code, ym, 'ot'); }
// OT minutes per day (for a month whose wage changed part-way: each day is paid at its own rate).
function teMonthOTByDay(code, ym){ return teMonthDays(code, ym).filter(x=>x.c.ot>0).map(x=>({date:x.date, min:x.c.ot})); }
function teSetTab(t){ teTab=t; render('timeentry'); }
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
function teDeleteEntry(dateStr2, code){
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to delete time entries.'); return; }
  if(!confirm('Remove this time entry?')) return;
  if(db.timeEntries[dateStr2]){ delete db.timeEntries[dateStr2][code]; }
  saveDB(db); render('timeentry');
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
  return teTab==='empwise' ? teEwMonth : teTab==='summary' ? teSummaryMonth : teTab==='leave' ? teLeaveDate : teGridDate;
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
  return [teUnitFilter?unitLabel(teUnitFilter):'', teContractorFilter?(teContractorFilter==='-'?'Non Contractor':contractorName(teContractorFilter)):''].filter(Boolean).join(' · ');
}
function teSetUnitFilter(v){ teUnitFilter=v||''; teDwSel.clear(); render('timeentry'); }
function teSetContractorFilter(v){ teContractorFilter=v||''; teDwSel.clear(); render('timeentry'); }
function teClearFilter(){ teUnitFilter=''; teSetContractorFilter(''); }
function renderTEFilterBar(){
  const tab=(code,label,title)=>`<button type="button" role="tab" class="attUnitTab ${teUnitFilter===code?'active':''}" aria-selected="${teUnitFilter===code}" title="${teEsc(title)}" onclick="teSetUnitFilter('${code}')">${label}</button>`;
  const shown=teFilteredEmployees().length, all=activeEmployeesForTE(teScope()).length;
  return `<div class="teFilterBar">
    <div class="attUnitTabs" role="tablist" aria-label="Working unit">
      ${tab('','All Units','All units')}
      ${getUnits().map(u=>tab(u.code, unitTabLabel(u), unitDisplayName(u))).join('')}
    </div>
    <label class="teFilterLbl">${ico('building')} Contractor
      <select onchange="teSetContractorFilter(this.value)" title="Filter by contractor">${contractorFilterOptionsHtml(teContractorFilter)}</select>
    </label>
    <span class="teFilterCount">${shown===all?`${all} employees`:`Showing ${shown} of ${all} employees`}</span>
    ${(teUnitFilter||teContractorFilter)?`<button type="button" class="teFilterClear" onclick="teClearFilter()">${ico('x')} Clear</button>`:''}
  </div>`;
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
function teSaveLeave(){
  if(!hasPerm('timeentry','add') && !hasPerm('timeentry','edit')){ alert('You do not have permission to record employee leave.'); return; }
  if(!teLeaveEmp){ alert('Please select an employee.'); return; }
  if(!teLeaveDate){ alert('Please choose a date.'); return; }
  if(!Array.isArray(db.timeLeaves)) db.timeLeaves=[];
  db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===teLeaveDate && l.empCode===teLeaveEmp));
  db.timeLeaves.push({date:teLeaveDate, empCode:teLeaveEmp, type:teLeaveType, remarks:teLeaveRemarks||''});
  if(!db.timeEntries[teLeaveDate]) db.timeEntries[teLeaveDate]={};
  if(!db.timeEntries[teLeaveDate][teLeaveEmp]) db.timeEntries[teLeaveDate][teLeaveEmp]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
  saveDB(db);
  teLeaveEmp=''; teLeaveRemarks=''; teLeaveType=TE_LEAVE_TYPES[0];
  render('timeentry');
}
function teDeleteLeave(dt, code){
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to remove a leave record.'); return; }
  if(!confirm('Remove this leave record?')) return;
  db.timeLeaves=(db.timeLeaves||[]).filter(l=>!(l.date===dt && l.empCode===code));
  saveDB(db); render('timeentry');
}
function printTELeaveDay(dt){
  const list=(db.timeLeaves||[]).filter(l=>l.date===dt && teCodeInFilter(l.empCode));
  if(!list.length){ alert('No leave records for this date.'); return; }
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  const rows=list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)',department:''};
    return `<tr><td>${idx+1}</td><td>${l.empCode}</td><td style="text-align:left;">${emp.name}</td><td>${emp.department||'-'}</td><td>${l.type==='NOPL'?'Loss of Pay':l.type}</td><td style="text-align:left;">${l.remarks||'-'}</td></tr>`; }).join('');
  const html=`<table class="repTable"><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Dept</th><th>Leave Type</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintWindow(`Employee Leave — ${fmtDate(dt)}${teFilterText()?' — '+teFilterText():''}`, html);
}
function renderTELeaveTab(){
  const emps=teFilteredEmployees(teLeaveDate);
  const canEdit=hasPerm('timeentry','add')||hasPerm('timeentry','edit');
  const canDel=hasPerm('timeentry','delete');
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  if(teLeaveEmp && !emps.some(e=>e.code===teLeaveEmp)) teLeaveEmp='';
  const leaves=(db.timeLeaves||[]).filter(l=>teCodeInFilter(l.empCode));
  const dates=[...new Set(leaves.map(l=>l.date))].sort().reverse().slice(0,20);
  return `<div class="panel">
    <h3>${ico('palm')} Record Employee Leave</h3>
    ${!canEdit?`<p class="syncNote" style="color:var(--warn);">You have view-only access to this module.</p>`:''}
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
      <div class="full"><button class="btn" ${canEdit?'':'disabled'} onclick="teSaveLeave()">${ico('save')} Save Leave Record</button></div>
    </div>
  </div>
  ${!dates.length?`<div class="panel"><div class="empty">No leave records yet.</div></div>`:dates.map(dt=>{
    const list=leaves.filter(l=>l.date===dt);
    return `<div class="panel teDayGroup">
      <div class="panelHead"><h4 style="margin:0;">${ico('palm')} ${fmtDate(dt)}</h4><button class="btn secondary" onclick="printTELeaveDay('${dt}')">${ico('printer')} Print</button></div>
      <div class="teShiftBox"><table><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Leave Type</th><th>Remarks</th>${canDel?'<th></th>':''}</tr></thead>
      <tbody>${list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)'};
        return `<tr><td>${idx+1}</td><td>${l.empCode}</td><td style="text-align:left;">${emp.name}</td><td>${l.type==='NOPL'?'Loss of Pay':l.type}</td><td style="text-align:left;">${l.remarks||'-'}</td>
        ${canDel?`<td><button class="btn danger" style="padding:3px 8px;font-size:11px;" onclick="teDeleteLeave('${dt}','${l.empCode}')">${ico('x')}</button></td>`:''}</tr>`; }).join('')}</tbody></table></div>
    </div>`;
  }).join('')}`;
}

