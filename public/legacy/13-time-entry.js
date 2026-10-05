/* ================================================================================
   EMPLOYEE TIME ENTRY — standalone sub-module.
   ---------------------------------------------------------------------------------
   INTENTIONALLY INDEPENDENT: this module reads/writes ONLY db.timeEntries and
   db.timeHolidays (both defined in defaultDB() above). It never reads or writes
   db.attendance, db.payroll, db.holidays, or any Payroll Process constant, and no
   Payroll function (generatePayroll, computeWorkingDays, calcNet, etc.) reads
   db.timeEntries or db.timeHolidays. It exists purely for fast employee time entry,
   on-screen viewing, and printing — it has NO effect on salary/payslip processing.
   Do not wire this module into Payroll or Attendance without an explicit request.
   ================================================================================ */
let teTab='entry';                 // 'entry' (Date-wise) | 'empwise' (Employee-wise) | 'leave' | 'holiday' | 'summary'
let teGridDate=todayStr();         // date currently selected in the Time Entries grid (defaults to today)
let teGridEditMode=false;          // false = grid rows are locked/view-only until "Edit" is pressed
let teCalMonth=monthKey(todayStr());
let teSummaryMonth=monthKey(todayStr()); // month shown in the Attendance & OT Summary tab
let teSelHolDate=null;
let teHolRemarks='';
let teGridSearch='';
const TE_LEAVE_TYPES=['Loss of Pay','Half Day','NOPL'];
let teLeaveDate=todayStr();
let teLeaveEmp='';
let teLeaveType=TE_LEAVE_TYPES[0];
let teLeaveRemarks='';

function teHourOpts(sel){ return Array.from({length:12},(_,i)=>i+1).map(h=>`<option value="${h}" ${String(h)===String(sel)?'selected':''}>${String(h).padStart(2,'0')}</option>`).join(''); }
function teMinOpts(sel){ return Array.from({length:60},(_,i)=>i).map(m=>`<option value="${m}" ${String(m)===String(sel)?'selected':''}>${String(m).padStart(2,'0')}</option>`).join(''); }
// Auto-creates a blank time-entry row for every active employee for the selected grid
// date (defaults to the system/today's date, but works for ANY date picked via the Date
// Selector), so the day's roster is always ready for quick entry without manually adding
// each employee one-by-one. Only writes to Supabase if something was actually missing —
// safe to call on every render of the Time Entry tab. Purely additive: never overwrites
// or removes an entry someone has already filled in, and never touches db.attendance/db.payroll.
function ensureTimeEntriesForDate(dateStr2){
  if(!db.timeEntries[dateStr2]) db.timeEntries[dateStr2]={};
  let changed=false;
  activeEmployeesForTE().forEach(e=>{
    if(!db.timeEntries[dateStr2][e.code]){
      db.timeEntries[dateStr2][e.code]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
      changed=true;
    }
  });
  if(changed) saveDB(db);
}

function teTimeToMinutes(h,m,ap){
  h=Number(h); m=Number(m);
  if(isNaN(h)||isNaN(m)) return null;
  let hh=h%12; if(ap==='PM') hh+=12;
  return hh*60+m;
}
function teFmtHM(mins){
  if(mins===null||mins===undefined||isNaN(mins)) return '–';
  mins=Math.max(0,Math.round(mins));
  return Math.floor(mins/60)+':'+String(mins%60).padStart(2,'0');
}
// Shift auto-detection + Working/Late/OT computation — purely for this module's own
// display & print. Standard shift-start times used for the "late" comparison:
//   First Shift: before 9:00 AM   → standard start 07:00 AM
//   General Shift: 9:00 AM–5:29 PM → standard start 09:30 AM
//   Second Shift: 5:30 PM onward   → standard start 05:30 PM
function teDetectShift(inMin){
  if(inMin===null) return null;
  if(inMin < 9*60) return {name:'First Shift', standard:7*60};
  if(inMin < 17*60+30) return {name:'General Shift', standard:9*60+30};
  return {name:'Second Shift', standard:17*60+30};
}
function teIsHolidayDate(dateStr2){
  const [y,m,d]=dateStr2.split('-').map(Number);
  if(new Date(y,m-1,d).getDay()===0) return true; // Sunday — always full-day OT
  return db.timeHolidays.some(h=>h.date===dateStr2);
}
// Looks up whether this employee has an Employee Leave record for this date. Used to
// auto-reflect a booked leave in the Time Entry grid/list/print — no separate manual
// time entry is needed on that date once leave is booked. Reads db.timeLeaves only
// (this module's own store); never touches db.attendance/db.payroll.
function teGetLeave(dateStr2, code){
  return (db.timeLeaves||[]).find(l=>l.date===dateStr2 && l.empCode===code) || null;
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
function teSetTab(t){ teTab=t; render('timeentry'); }
// Changing the Date Selector switches the whole "Time Entries" grid to that date,
// auto-creating blank rows for every active employee on it, just like today's date does.
// Switching dates always re-locks the grid, so each date is deliberately unlocked via Edit.
function teSetGridDate(v){
  if(!v) return;
  teGridDate=v;
  teGridEditMode=false;
  ensureTimeEntriesForDate(teGridDate);
  render('timeentry');
}
// "✏️ Edit" / "💾 Save" pair, shown right next to the Date Selector: Edit unlocks every
// row on the selected date for in-place editing; Save re-locks the grid once the user is
// done. Cell values already save instantly to Supabase as they're changed (teGridSet), so
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
function activeEmployeesForTE(){ return (db.employees||[]).filter(e=>e.status!=='Resigned').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})); }
// Inline edit for a single field of a single employee's row in the auto-created quick grid.
function teGridSet(dateStr2, code, field, val){
  if(!hasPerm('timeentry','add') && !hasPerm('timeentry','edit')){ alert('You do not have permission to edit time entries.'); return; }
  if(!db.timeEntries[dateStr2]) db.timeEntries[dateStr2]={};
  if(!db.timeEntries[dateStr2][code]) db.timeEntries[dateStr2][code]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
  db.timeEntries[dateStr2][code][field]=val;
  saveDB(db); render('timeentry');
}
function teSetGridSearch(v){ teGridSearch=v; render('timeentry'); }
// Selecting an employee's name from the Quick Grid loads them into the Single Time Entry form below.
/* ---------------- Employee Leave (this module's own leave log — separate from any
   Payroll leave/NOPL logic; purely a record of who is on leave and why). ---------------- */
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
  const list=(db.timeLeaves||[]).filter(l=>l.date===dt);
  if(!list.length){ alert('No leave records for this date.'); return; }
  const empMap={}; (db.employees||[]).forEach(e=>empMap[e.code]=e);
  const rows=list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)',department:''};
    return `<tr><td>${idx+1}</td><td>${l.empCode}</td><td style="text-align:left;">${emp.name}</td><td>${emp.department||'-'}</td><td>${l.type}</td><td style="text-align:left;">${l.remarks||'-'}</td></tr>`; }).join('');
  const html=`<table class="repTable"><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Dept</th><th>Leave Type</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>`;
  openPrintWindow(`Employee Leave — ${fmtDate(dt)}`, html);
}
function renderTELeaveTab(){
  const emps=activeEmployeesForTE();
  const canEdit=hasPerm('timeentry','add')||hasPerm('timeentry','edit');
  const canDel=hasPerm('timeentry','delete');
  const empMap={}; emps.forEach(e=>empMap[e.code]=e);
  const dates=[...new Set((db.timeLeaves||[]).map(l=>l.date))].sort().reverse().slice(0,20);
  return `<div class="panel">
    <h3>🌴 Record Employee Leave</h3>
    ${!canEdit?`<p class="syncNote" style="color:var(--warn);">You have view-only access to this module.</p>`:''}
    <p class="syncNote">Select the employee and enter their leave details for the chosen date. This is a standalone leave record kept in the Employee Time Entry module only — it is <b>not</b> read by Payroll/NOPL and does not affect salary processing.</p>
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
      <div class="full"><button class="btn" ${canEdit?'':'disabled'} onclick="teSaveLeave()">💾 Save Leave Record</button></div>
    </div>
  </div>
  ${!dates.length?`<div class="panel"><div class="empty">No leave records yet.</div></div>`:dates.map(dt=>{
    const list=(db.timeLeaves||[]).filter(l=>l.date===dt);
    return `<div class="panel teDayGroup">
      <div class="panelHead"><h4 style="margin:0;">🌴 ${fmtDate(dt)}</h4><button class="btn secondary" onclick="printTELeaveDay('${dt}')">🖨️ Print</button></div>
      <div class="teShiftBox"><table><thead><tr><th>Sl No</th><th>Emp Code</th><th>Employee</th><th>Leave Type</th><th>Remarks</th>${canDel?'<th></th>':''}</tr></thead>
      <tbody>${list.map((l,idx)=>{ const emp=empMap[l.empCode]||{name:'(removed employee)'};
        return `<tr><td>${idx+1}</td><td>${l.empCode}</td><td style="text-align:left;">${emp.name}</td><td>${l.type}</td><td style="text-align:left;">${l.remarks||'-'}</td>
        ${canDel?`<td><button class="btn danger" style="padding:3px 8px;font-size:11px;" onclick="teDeleteLeave('${dt}','${l.empCode}')">✕</button></td>`:''}</tr>`; }).join('')}</tbody></table></div>
    </div>`;
  }).join('')}`;
}

