/* ================= ATTENDANCE ================= */
let attMonth = monthKey(todayStr());
let attSearch = '';
let attCompact = true;
let attViewMode = 'employee'; // 'day' (quick mark) or 'employee' (employee-wise monthly calendar)
let attDate = todayStr();
let attEmpCode = ''; // selected employee for the Employee-wise Monthly Attendance view
let attUnitFilter = ''; // '' = all units, 'Unit-1' or 'Unit-2' — filters the Employee dropdown above
let attEditMode = false; // Monthly Attendance screen: locked (view) until the user clicks Edit
let attEditSnapshot = null; // used to restore data if edits are cancelled
function getMonthAttendanceSnapshot(code, ym){
  const dim=daysInMonth(ym);
  const snap={};
  for(let d=1; d<=dim; d++){ const dt=dateStr(ym,d); snap[dt]=db.attendance[dt]?.[code]; }
  return snap;
}
function toggleAttEdit(){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  attEditSnapshot = { dates: getMonthAttendanceSnapshot(attEmpCode, attMonth), adj: JSON.parse(JSON.stringify(getAdj(attMonth, attEmpCode))) };
  attEditMode = true;
  render('attendance');
}
function saveAttendance(){
  attEditMode = false;
  attEditSnapshot = null;
  saveDB(db);
  render('attendance');
}
function cancelAttendanceEdit(){
  if(attEditSnapshot){
    Object.keys(attEditSnapshot.dates).forEach(dt=>{
      const val=attEditSnapshot.dates[dt];
      if(!db.attendance[dt]) db.attendance[dt]={};
      if(val) db.attendance[dt][attEmpCode]=val; else delete db.attendance[dt][attEmpCode];
    });
    Object.assign(getAdj(attMonth, attEmpCode), attEditSnapshot.adj);
    saveDB(db);
  }
  attEditMode = false;
  attEditSnapshot = null;
  render('attendance');
}
function setAttView(mode){ attViewMode=mode; render('attendance'); }
function shiftAttDate(delta){
  const d=new Date(attDate+'T00:00:00');
  d.setDate(d.getDate()+delta);
  attDate=d.toISOString().slice(0,10);
  attMonth=monthKey(attDate);
  render('attendance');
}
function setAttDate(v){ attDate=v; attMonth=monthKey(v); render('attendance'); }
function goAttToday(){ attDate=todayStr(); attMonth=monthKey(attDate); render('attendance'); }
function toggleAttCompact(){ attCompact=!attCompact; render('attendance'); }
const QUICK_STATUS = ['Present','HalfDay','LossOfPay','PaidLeave'];
function daysInMonth(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); }
// NOWD — Number Of Working Days is always auto-calculated per payroll month:
// Total Days in the month − Sundays in the month. There is no manual entry for this figure.
function sundaysInMonth(ym){
  const total=daysInMonth(ym);
  let count=0;
  for(let d=1; d<=total; d++){ if(isSunday(ym,d)) count++; }
  return count;
}
// Holiday Calendar — dates selected here are deducted from NOWD in addition to Sundays.
// A holiday that falls on a Sunday is not double-counted (it's already removed as a Sunday).
// NOPH (No. of Paid Holidays) is the only selectable Holiday Calendar type — it's deducted
// from NOWD the same way Sundays are, and auto-locks Attendance for that date.
function dateStr(ym, day){ return ym+'-'+String(day).padStart(2,'0'); }
function getHolidayEntry(dateStr){ return (db.holidays||[]).find(h=>h.date===dateStr); }
function getHolidayType(dateStr){ const h=getHolidayEntry(dateStr); return h?h.type:null; }
function isHolidayDate(dateStr){ return !!getHolidayEntry(dateStr); }
function isHoliday(ym, day){ return isHolidayDate(dateStr(ym, day)); }
function holidaysInMonth(ym){
  const total=daysInMonth(ym);
  let count=0;
  for(let d=1; d<=total; d++){ if(isHoliday(ym,d) && !isSunday(ym,d)) count++; }
  return count;
}
function computeWorkingDays(ym){ return daysInMonth(ym) - sundaysInMonth(ym) - holidaysInMonth(ym); }
function weekdayShort(ym, day){ const [y,m]=ym.split('-').map(Number); return ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(y,m-1,day).getDay()]; }
function isSunday(ym, day){ const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,day).getDay()===0; }
function addHolidayDate(dateVal){
  if(!dateVal) return;
  if(!db.holidays) db.holidays=[];
  const existing=db.holidays.find(h=>h.date===dateVal);
  if(!existing){ db.holidays.push({date:dateVal, type:'NOPH'}); }
  db.holidays.sort((a,b)=>a.date.localeCompare(b.date));
  saveDB(db);
  render('payrollprocess');
}
function removeHolidayDate(dateVal){
  if(!db.holidays) return;
  db.holidays = db.holidays.filter(h=>h.date!==dateVal);
  saveDB(db);
  render('payrollprocess');
}
// Single source of truth for "what is this employee's status on this date" — used everywhere
// attendance is displayed or summarized. A Holiday Calendar date always wins: it shows/counts
// as 'NOPH' for every employee automatically, regardless of what (if anything) is stored.
function getAttStatus(date, code){
  const t=getHolidayType(date);
  if(t) return t;
  return db.attendance[date]?.[code] || '';
}

function attendanceSummary(code, ym){
  const dim=daysInMonth(ym);
  let present=0, leave=0, noph=0, halfDay=0, lop=0, marked=0;
  for(let d=1; d<=dim; d++){
    // Sundays are already excluded from NOWD's denominator, so they must never contribute to
    // Days Worked either — otherwise a Sunday marked Present (e.g. by a bulk "Fill as Present"
    // action) inflates earnings by an extra day's pay beyond NOWD. Skip them entirely here.
    if(isSunday(ym,d)) continue;
    const s=getAttStatus(dateStr(ym,d), code);
    if(!s) continue;
    marked++;
    if(s==='Present') present++;
    else if(s==='PaidLeave') leave++;
    else if(s==='NOPH') noph++;
    else if(s==='HalfDay') halfDay++;
    else if(s==='LossOfPay') lop++;
  }
  const payableDays = present + leave + noph + halfDay*0.5;
  return { present, leave, holiday: noph, holidayOnly:0, nophDays:noph, halfDay, lop, absent:lop, marked,
    unmarked: dim-marked, daysInMonth: dim, lopEquivalent: lop + halfDay*0.5, payableDays: Math.round(payableDays*100)/100 };
}
// Kept for payroll compatibility — LOP-equivalent days derived straight from Attendance data.
function attendanceLopCount(code, ym){ return attendanceSummary(code, ym).lopEquivalent; }
// Total NOPL (Paid Leave) days marked in Attendance for an employee,
// from the beginning of all recorded attendance up to and including the given month — this
// links Paid Leave entered in Attendance to the NOPL Balance shown on the Salary Slip.
function noplUsedUpto(code, ym){
  let total=0;
  Object.keys(db.attendance).forEach(dateKey=>{
    if(dateKey.slice(0,7) <= ym){
      // Use getAttStatus (not the raw stored value) so a date later added to the Holiday
      // Calendar as NOPH is correctly excluded here too, matching payroll's NOPL Taken figure.
      const s=getAttStatus(dateKey, code);
      if(s==='PaidLeave') total++;
    }
  });
  return total;
}

function attTabsInline(){
  return `<div class="attTabsInline">
    <button class="attTab active" style="cursor:default;" title="Monthly Attendance">🗓 Monthly Attendance</button>
  </div><span class="attTabDivider"></span>`;
}
function renderAttendance(){
  return `<div class="attStage">${renderAttendanceEmployee()}</div>`;
}

/* ================= ATTENDANCE COMPLETION TRACKING =================
   Answers, at a glance, "has everyone's attendance been marked?" for the month
   currently open on screen — so nobody gets missed when there are many employees.
   An employee's "required" days are their on-roll, non-Sunday days from the 1st of
   the month up to today (or the whole month, if it's already in the past). Holidays
   auto-count as marked (getAttStatus returns NOPH for them), so only genuinely
   unmarked working days show up as "pending". */
function attendanceCompletionStats(ym){
  const dim = daysInMonth(ym);
  const today = todayStr();
  const curYm = monthKey(today);
  let lastDay;
  if(ym < curYm) lastDay = dim;
  else if(ym === curYm) lastDay = Number(today.slice(8,10));
  else lastDay = 0; // future month — nothing due yet
  const active = db.employees.filter(e=>isEmpOnRollInMonth(e,ym));
  const list = active.map(e=>{
    let required=0, marked=0;
    for(let d=1; d<=lastDay; d++){
      if(isSunday(ym,d)) continue;
      const dt = dateStr(ym,d);
      if(!isEmpOnRollOn(e,dt)) continue;
      required++;
      if(getAttStatus(dt, e.code)) marked++;
    }
    return {code:e.code, name:e.name, department:e.department, required, marked, missing:required-marked, complete: required===0 || marked===required};
  });
  const totalEmp = list.length;
  const complete = list.filter(x=>x.complete).length;
  const notStarted = list.filter(x=>x.required>0 && x.marked===0).length;
  const partial = totalEmp - complete - notStarted;
  const pct = totalEmp ? Math.round(complete/totalEmp*100) : 100;
  return { list, totalEmp, complete, notStarted, partial, pct, lastDay, dim };
}
function renderAttCompletionCard(){
  const st = attendanceCompletionStats(attMonth);
  if(st.lastDay===0){
    return `<div class="attCompletionCard future">
      <div class="accHead"><h4>📋 Attendance Completion — ${monthLabel(attMonth)}</h4></div>
      <p class="syncNote" style="margin:6px 0 0;">This month hasn't started yet — nothing to mark.</p>
    </div>`;
  }
  if(!st.totalEmp){
    return `<div class="attCompletionCard future">
      <div class="accHead"><h4>📋 Attendance Completion — ${monthLabel(attMonth)}</h4></div>
      <p class="syncNote" style="margin:6px 0 0;">No active employees for this month.</p>
    </div>`;
  }
  const pctClass = st.pct===100?'ok':(st.pct>=70?'mid':'low');
  const incomplete = st.list.filter(x=>!x.complete).sort((a,b)=>(b.missing-a.missing)||a.name.localeCompare(b.name));
  return `
  <div class="attCompletionCard">
    <div class="accHead">
      <h4>📋 Attendance Completion — ${monthLabel(attMonth)} <span class="accSub">through ${fmtDate(dateStr(attMonth,st.lastDay))}</span></h4>
      <span class="accPct ${pctClass}">${st.pct}% Complete</span>
    </div>
    <div class="accBarTrack"><div class="accBarFill ${pctClass}" style="width:${st.pct}%;"></div></div>
    <div class="accChips">
      <span class="chip ok">✓ ${st.complete} Fully Marked</span>
      <span class="chip ${st.partial?'warn':''}">◐ ${st.partial} Partially Marked</span>
      <span class="chip ${st.notStarted?'danger':''}">✕ ${st.notStarted} Not Started</span>
      <span class="chip">${st.totalEmp} Total Employees</span>
    </div>
    ${incomplete.length ? `
    <div class="accMissingList">
      ${incomplete.slice(0,60).map(x=>`<button type="button" class="accMissingPill" onclick="setAttEmpCode('${x.code}')" title="Open ${x.name}'s attendance to fill in the missing day(s)">
        <b>${x.name}</b><span>${x.code}${x.department?' · '+x.department:''} · ${x.missing} day${x.missing===1?'':'s'} pending</span>
      </button>`).join('')}
    </div>` : `<p class="syncNote" style="margin:10px 0 0;color:var(--st-present-text);">✅ Everyone is fully marked up to date.</p>`}
  </div>`;
}

function dayCounts(date){
  const active=db.employees.filter(e=>isEmpOnRollOn(e,date));
  const counts={total:active.length, marked:0, unmarked:0};
  active.forEach(e=>{
    const s=getAttStatus(date, e.code);
    if(s) counts.marked++; else counts.unmarked++;
  });
  return counts;
}

function renderAttendanceDay(){
  let active=db.employees.filter(e=>isEmpOnRollOn(e,attDate));
  if(attSearch) active=active.filter(e=>(`${e.name} ${e.code}`).toLowerCase().includes(attSearch.toLowerCase()));
  // Unmarked employees first, so what still needs attention is at the top.
  active=[...active].sort((a,b)=>{
    const am=db.attendance[attDate]?.[a.code]?1:0, bm=db.attendance[attDate]?.[b.code]?1:0;
    if(am!==bm) return am-bm;
    return a.name.localeCompare(b.name);
  });
  const dObj=new Date(attDate+'T00:00:00');
  const dayName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dObj.getDay()];
  const dateLabel=fmtDate(attDate);
  const c=dayCounts(attDate);
  const allActive=db.employees.filter(e=>isEmpOnRollOn(e,attDate));
  const isHolidayToday=isHolidayDate(attDate);
  const todayHolidayType=getHolidayType(attDate);
  return `
  <div class="attDateBar">
    ${attTabsInline()}
    <button class="navBtn" onclick="shiftAttDate(-1)" title="Previous day">‹</button>
    <input type="date" value="${attDate}" onchange="setAttDate(this.value)">
    <button class="navBtn" onclick="shiftAttDate(1)" title="Next day">›</button>
    <button class="attTodayBtn" onclick="goAttToday()">Today</button>
    <span class="attDayLabel">${dayName}, ${dateLabel}</span>
    <input type="search" placeholder="Search employee..." value="${attSearch}" oninput="attSearch=this.value;render('attendance')" style="margin-left:auto;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);">
  </div>
  ${isHolidayToday ? `<p class="syncNote" style="color:var(--warn);">🔒 ${dateLabel} is set as <b>${STATUS_LABEL[todayHolidayType]}</b> in the Holiday Calendar. All employees are automatically marked ${STATUS_LABEL[todayHolidayType]} for this date and it cannot be edited here — remove it from the Holiday Calendar (Payroll → Payroll Process) to unlock.</p>` : ''}
  <div class="attDaySumBar">
    <span class="chip">${c.total} Active Employees</span>
    <span class="chip">${c.marked} Marked</span>
    <span class="chip ${c.unmarked?'warn':''}">${c.unmarked} Unmarked</span>
  </div>
  <div class="attBulkBar">
    ${hasPerm('attendance','edit') ? `<button class="btn secondary" ${isHolidayToday?'disabled':''} onclick="markAllQuick('Present')">✓ Mark All Present</button>
    <button class="btn secondary" ${isHolidayToday?'disabled':''} onclick="copyPrevDayAttendance()">Copy Previous Day</button>` : ''}
    ${hasPerm('attendance','delete') ? `<button class="btn danger" ${isHolidayToday?'disabled':''} onclick="clearDayAttendance()">Clear This Day</button>` : ''}
    <button class="attTab" style="margin-left:auto;" onclick="setAttView('grid')">Open Month Grid →</button>
  </div>
  <div class="panel">
    ${!allActive.length ? '<div class="empty">No active employees. Add employees first.</div>' : `
    ${!active.length ? '<div class="empty">No employees match your search.</div>' : `
    <div class="attQuickList">
      ${active.map(e=>{
        const val=getAttStatus(attDate, e.code);
        const otVal=getAdj(attMonth, e.code).otHours||0;
        return `<div class="attQuickRow ${!val?'unmarked':''}">
          <div class="attQuickEmp">
            <div class="empName">${e.name}</div>
            <div class="empSub">${e.code} · ${e.department||'-'}${val?` · ${isHolidayToday?`<span class="tag ${val}" style="padding:1px 7px;">${STATUS_LABEL[val]}</span>`:STATUS_LABEL[val]}`:' · Not marked'}</div>
          </div>
          <div class="attQuickBtns">
            ${QUICK_STATUS.map(s=>`<button type="button" class="attQBtn sel-${s} ${val===s?'active':''}" ${(hasPerm('attendance','edit') && !isHolidayToday)?'':'disabled'} onclick="setCellStatus('${attDate}','${e.code}','${val===s?'':s}')">${STATUS_LABEL[s]}</button>`).join('')}
          </div>
          <div class="attQuickOTWrap">OT hrs
            <input type="number" class="attQuickOT" value="${otVal}" min="0" step="0.5" ${hasPerm('attendance','edit')?'':'disabled'} onchange="setMonthlyOT('${e.code}',+this.value)" title="Overtime hours for ${monthLabel(attMonth)} (monthly total)">
          </div>
        </div>`;
      }).join('')}
    </div>
    `}
    <p class="syncNote">Tap a status to mark it instantly — tap the same status again to clear it. Changes save immediately and flow straight into Payroll. Need finer control, whole-month fills, or a spreadsheet-style view? Use <b>Month Grid</b> above.</p>
    `}
  </div>`;
}
function markAllQuick(status){ setDayForAll(attDate, status); }
function copyPrevDayAttendance(){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  if(isHolidayDate(attDate)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  const d=new Date(attDate+'T00:00:00'); d.setDate(d.getDate()-1);
  const prev=d.toISOString().slice(0,10);
  const src=db.attendance[prev];
  if(!src){ alert('No attendance recorded for the previous day.'); return; }
  if(!db.attendance[attDate]) db.attendance[attDate]={};
  db.employees.filter(e=>isEmpOnRollOn(e,attDate)).forEach(e=>{
    if(src[e.code]) db.attendance[attDate][e.code]=src[e.code];
  });
  saveDB(db);
  render('attendance');
}
function clearDayAttendance(){
  if(!hasPerm('attendance','delete')){ alert('You do not have permission to clear attendance.'); return; }
  if(isHolidayDate(attDate)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  if(!confirm('Clear all attendance entries for '+attDate+'? This cannot be undone.')) return;
  delete db.attendance[attDate];
  saveDB(db);
  render('attendance');
}

/* ================= EMPLOYEE-WISE MONTHLY ATTENDANCE =================
   Faster, focused way to enter a whole month for ONE employee at a time — useful for
   catching up a new joiner, correcting a month in one place, or just working employee-
   by-employee instead of day-by-day. Reads/writes the exact same db.attendance store as
   Quick Mark and Month Grid, so all three views always stay in sync automatically. */
function setAttEmpCode(code){ attEmpCode=code; attEditMode=false; attEditSnapshot=null; render('attendance'); }
// Unit filter above the Employee dropdown. Changing the unit clears the current employee
// selection so the picker re-defaults to the first employee within the newly chosen unit
// (see renderAttendanceEmployee, which rebuilds empOpts from the unit-filtered list).
function setAttUnitFilter(unit){ attUnitFilter=unit; attEmpCode=''; attEditMode=false; attEditSnapshot=null; render('attendance'); }
function shiftAttEmpMonth(delta){
  const [y,m]=attMonth.split('-').map(Number);
  const d=new Date(y, m-1+delta, 1);
  attMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  attEditMode=false; attEditSnapshot=null;
  render('attendance');
}
function setAttEmpMonth(v){ attMonth=v; attEditMode=false; attEditSnapshot=null; render('attendance'); }
function fillEmployeeMonthPresent(code){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const dim=daysInMonth(attMonth);
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d);
    if(isHolidayDate(dt)) continue; // Holiday Calendar (NOPH) dates are locked
    if(isSunday(attMonth,d)) continue; // Sundays are outside NOWD and are never marked Present
    if(!db.attendance[dt]) db.attendance[dt]={};
    if(!db.attendance[dt][code]) db.attendance[dt][code]='Present';
  }
  saveDB(db);
  render('attendance');
}
function copyEmployeePrevMonth(code){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const [y,m]=attMonth.split('-').map(Number);
  const pd=new Date(y, m-2, 1);
  const prevYm=pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');
  const dim=daysInMonth(attMonth);
  const prevDim=daysInMonth(prevYm);
  let copied=0;
  for(let d=1; d<=dim; d++){
    if(d>prevDim) continue;
    const dt=dateStr(attMonth,d);
    if(isHolidayDate(dt)) continue; // Holiday Calendar dates are locked
    const src=db.attendance[dateStr(prevYm,d)]?.[code];
    if(!src) continue;
    if(!db.attendance[dt]) db.attendance[dt]={};
    db.attendance[dt][code]=src;
    copied++;
  }
  if(!copied){ alert('No attendance found for '+code+' in '+monthLabel(prevYm)+'.'); return; }
  saveDB(db);
  render('attendance');
}
function clearEmployeeMonth(code){
  if(!hasPerm('attendance','delete')){ alert('You do not have permission to clear attendance.'); return; }
  if(!confirm('Clear all attendance entries for this employee in '+monthLabel(attMonth)+'? This cannot be undone.')) return;
  const dim=daysInMonth(attMonth);
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d);
    if(db.attendance[dt]) delete db.attendance[dt][code];
  }
  saveDB(db);
  render('attendance');
}
function setAdvanceAmount(code, val){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  a.advance = +val||0;
  saveDB(db);
}
function setCanteenTokens(code, field, val){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  a[field] = +val||0;
  saveDB(db);
}
// Unit-selection dropdown shown to the left of the Employee dropdown on the Attendance screen.
// "All Units" (value="") clears the filter; picking Unit-1/Unit-2 narrows the Employee list.
function attUnitOptionsHTML(){
  return `<select class="empPicker" ${attEditMode?'disabled':''} onchange="setAttUnitFilter(this.value)" title="Select unit">
    <option value="" ${!attUnitFilter?'selected':''}>All Units</option>
    <option value="Unit-1" ${attUnitFilter==='Unit-1'?'selected':''}>${db.unit1Name||'Unit-1'}</option>
    <option value="Unit-2" ${attUnitFilter==='Unit-2'?'selected':''}>${db.unit2Name||'Unit-2'}</option>
  </select>`;
}
function renderAttendanceEmployee(){
  const allActiveAllUnits=db.employees.filter(e=>isEmpOnRollInMonth(e,attMonth)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(!allActiveAllUnits.length) return `<div class="panel"><div class="empty">No active employees. Add employees first.</div></div>`;
  // Unit filter: '' shows every unit's employees; 'Unit-1' / 'Unit-2' narrows the list (and
  // therefore the Employee dropdown below) to just that unit's on-roll employees.
  const active = attUnitFilter ? allActiveAllUnits.filter(e=>(e.unit||'Unit-1')===attUnitFilter) : allActiveAllUnits;
  if(!active.length){
    return `<div class="attStage"><div class="attStageTop">${attTabsInline()}
      <div class="grp">${attUnitOptionsHTML()}</div>
    </div><div class="panel"><div class="empty">No active employees in ${unitLabel(attUnitFilter)} this month.</div></div></div>`;
  }
  if(!attEmpCode || !active.find(e=>e.code===attEmpCode)) attEmpCode = active[0].code;
  const emp = active.find(e=>e.code===attEmpCode);
  const dim = daysInMonth(attMonth);
  const sum = attendanceSummary(attEmpCode, attMonth);
  const adj = getAdj(attMonth, attEmpCode);
  const otVal = adj.otHours||0;
  const s = getSettings();
  const lunchRate = s.canteenLunchRate!==undefined?s.canteenLunchRate:18;
  const dinnerRate = s.canteenDinnerRate!==undefined?s.canteenDinnerRate:13.5;
  const canteenAmt = Math.round(((adj.lunchTokens||0)*lunchRate + (adj.dinnerTokens||0)*dinnerRate)*100)/100;
  const scheduledAdv = scheduledAdvanceDeduction(attEmpCode, attMonth);
  const advDetails = scheduledAdvanceDetails(attEmpCode, attMonth);
  const empAllAdvances = ensureSalaryAdvances().filter(a=>a.empCode===attEmpCode);
  const empOpts = active.map(e=>`<option value="${e.code}" ${e.code===attEmpCode?'selected':''}>${e.name} (${e.code}${e.department?' · '+e.department:''})</option>`).join('');
  const editable = hasPerm('attendance','edit') && attEditMode;
  // Monday-first calendar grid, blanks before day 1 and after the last day
  const [y0,m0]=attMonth.split('-').map(Number);
  const firstDow=(new Date(y0,m0-1,1).getDay()+6)%7; // 0=Mon..6=Sun
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push('<div class="attCalCell blank"></div>');
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d);
    const val=getAttStatus(dt, attEmpCode);
    const dtIsHoliday=isHolidayDate(dt);
    const optionList = dtIsHoliday ? [val] : STATUS_LIST;
    cells.push(`<div class="attCalCell st-${val} ${isSunday(attMonth,d)?'sun':''}">
      <div class="dNum">${d} <span style="font-weight:400;color:var(--muted);">${weekdayShort(attMonth,d)}</span></div>
      <select ${(editable && !dtIsHoliday)?'':'disabled'} onchange="setCellStatus('${dt}','${attEmpCode}',this.value)" title="${dtIsHoliday?STATUS_LABEL[val]+' — Holiday Calendar, locked':(val?STATUS_LABEL[val]:'Not marked')}">
        ${!dtIsHoliday?`<option value="" ${!val?'selected':''}>—</option>`:''}
        ${optionList.map(st=>`<option value="${st}" ${val===st?'selected':''}>${STATUS_LABEL[st]}</option>`).join('')}
      </select>
    </div>`);
  }
  // NOPL Balance shown here is fetched directly from the Payroll module's generated
  // record for this employee+month (db.payroll[ym][code].noplBalance) — Payroll is the
  // single source of truth for this figure; nothing is recalculated here.
  const payrollRec = (db.payroll[attMonth] || {})[attEmpCode];
  const noplBal = payrollRec ? payrollRec.noplBalance : 0;
  const advTip = advDetails.length ? advDetails.map(x=>`${x.advance.reason||'Advance'}: ₹${x.row.amount}`).join(' | ') : 'No salary advance scheduled this month';

  // ---- Top bar: the controls used on every visit — employee, month, edit/save, quick fills ----
  const topBar = `
  <div class="attStageTop">
    ${attTabsInline()}
    <div class="grp">
      ${attUnitOptionsHTML()}
      <select class="empPicker" ${attEditMode?'disabled':''} onchange="setAttEmpCode(this.value)" title="Select employee">${empOpts}</select>
      ${emp && emp.department ? `<span class="attDayLabel" style="font-weight:400;color:var(--muted);">${emp.department}</span>`:''}
      <div class="empField" title="NOPL Balance as per the last generated Payroll for ${monthLabel(attMonth)}. Regenerate Payroll to refresh this figure."><span>NOPL Bal.</span><b><span class="tag PaidLeave" style="padding:1px 8px;font-size:11.5px;">${noplBal}</span></b></div>
    </div>
    <div class="sep"></div>
    <div class="grp">
      <button class="navBtn" ${attEditMode?'disabled':''} onclick="shiftAttEmpMonth(-1)" title="Previous month">‹</button>
      <input type="month" value="${attMonth}" ${attEditMode?'disabled':''} onchange="setAttEmpMonth(this.value)">
      <button class="navBtn" ${attEditMode?'disabled':''} onclick="shiftAttEmpMonth(1)" title="Next month">›</button>
      <span class="attDayLabel">${monthLabel(attMonth)}</span>
    </div>
    <div class="sep"></div>
    <div class="grp">
      ${editable ? `<button class="btn secondary tiny" onclick="fillEmployeeMonthPresent('${attEmpCode}')" title="Fill every unmarked day this month as Present">✓ Fill Remaining Present</button>
      <button class="btn secondary tiny" onclick="copyEmployeePrevMonth('${attEmpCode}')" title="Copy last month's pattern into this month">⧉ Copy Previous Month</button>
      ${hasPerm('attendance','delete') ? `<button class="btn danger tiny" onclick="clearEmployeeMonth('${attEmpCode}')" title="Clear all entries this month">🗑 Clear Month</button>`:''}` : ''}
    </div>
    ${attEditMode ? `<div class="attStageEditNote">✏️ Edit mode — set each day's status, then Save.</div>` : ''}
    <div class="attRightActions">
      ${hasPerm('attendance','edit') ? (attEditMode
        ? `<button class="btn secondary" onclick="cancelAttendanceEdit()">✕ Cancel</button><button class="btn" onclick="saveAttendance()">💾 Save Attendance</button>`
        : `<button class="btn btnEditAtt" onclick="toggleAttEdit()">✏️ Edit Attendance</button>`) : ''}
    </div>
  </div>`;

  // ---- Left column: everything auto-calculated / system-derived (read-only) ----
  const autoCol = `
  <div class="attAutoCol">
    ${renderAttCompletionCard()}
    <div class="autoCard grow">
      <h4>📊 Attendance Summary (auto)</h4>
      <div class="attSumGrid">
        <div class="sk">Present Days</div><div class="sv">${sum.present}</div>
        <div class="sk">Absent Days</div><div class="sv">${sum.absent}</div>
        <div class="sk">NOPL Days</div><div class="sv">${sum.leave}</div>
        <div class="sk">NOPH Days</div><div class="sv">${sum.nophDays}</div>
        <div class="sk">Half Days</div><div class="sv">${sum.halfDay}</div>
        <div class="sk totalRow">Total Payable Days</div><div class="sv totalRow">${sum.payableDays}</div>
      </div>
    </div>
    <div class="autoCard">
      <h4>💳 System-Calculated</h4>
      <div class="autoRow" title="${advTip}"><span>Scheduled Advance</span><b>₹${scheduledAdv}</b></div>
      <div class="autoRow" title="Lunch Tokens × ₹${lunchRate} + Dinner Tokens × ₹${dinnerRate}"><span>Canteen Deduction</span><b>₹${canteenAmt}</b></div>
    </div>
  </div>`;

  // ---- Right column: the actual data-entry surface — calendar + the few editable monthly figures ----
  const entryCol = `
  <div class="attEntryCol">
    <div class="attCalPanel">
      <div class="attCalGrid" style="grid-auto-rows:18px;flex:0 0 auto;">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="attCalDow">${d}</div>`).join('')}
      </div>
      <div class="attCalGrid" style="flex:1;">${cells.join('')}</div>
    </div>
    <div class="attEntryRow">
      <div class="attEntryField"><label>OT Hours</label><input type="number" value="${otVal}" min="0" step="0.5" ${editable?'':'disabled'} onchange="setMonthlyOT('${attEmpCode}',+this.value)"></div>
      <div class="attEntryField"><label>Lunch Tokens (₹${lunchRate}/tkn)</label><input type="number" value="${adj.lunchTokens||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','lunchTokens',this.value)"></div>
      <div class="attEntryField"><label>Dinner Tokens (₹${dinnerRate}/tkn)</label><input type="number" value="${adj.dinnerTokens||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','dinnerTokens',this.value)"></div>
      <div class="attEntryField"><label>Other Allowance (₹)</label><input type="number" value="${adj.otherAllowanceOneOff||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','otherAllowanceOneOff',this.value)"></div>
      <div class="attEntryField"><label>Other Deduction (₹)</label><input type="number" value="${adj.otherDedOneOff||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','otherDedOneOff',this.value)"></div>
    </div>
  </div>`;

  return `${topBar}<div class="attStageBody">${autoCol}${entryCol}</div>`;
}

function renderAttendanceGrid(){
  const dim=daysInMonth(attMonth);
  let active=db.employees.filter(e=>isEmpOnRollInMonth(e,attMonth));
  if(attSearch) active=active.filter(e=>(`${e.name} ${e.code}`).toLowerCase().includes(attSearch.toLowerCase()));
  const dayCols=[]; for(let d=1; d<=dim; d++) dayCols.push(d);
  return `
  <div class="attToolbar">
    <input type="month" value="${attMonth}" onchange="attMonth=this.value;render('attendance')">
    <input type="search" placeholder="Search employee..." value="${attSearch}" oninput="attSearch=this.value;render('attendance')">
    ${hasPerm('attendance','edit') ? `<button class="btn secondary" onclick="fillUnmarkedPresent()">Fill Blank Days as Present</button>` : ''}
    ${hasPerm('attendance','delete') ? `<button class="btn danger" onclick="clearMonthAttendance()">Clear This Month</button>` : ''}
    <label class="attViewToggle" style="cursor:pointer;"><input type="checkbox" ${attCompact?'checked':''} onchange="toggleAttCompact()"> Fit all days on screen</label>
  </div>
  <div class="attLegend">
    ${[...STATUS_LIST,'NOPH'].map(s=>`<span class="tag ${s}">${STATUS_LABEL[s]}</span>`).join('')}
  </div>
  <div class="panel">
    ${!db.employees.filter(e=>isEmpOnRollInMonth(e,attMonth)).length ? '<div class="empty">No active employees. Add employees first.</div>' : `
    <div class="attGridWrap" style="${attCompact?'overflow-x:hidden;':''}">
    <table class="attGrid${attCompact?' compact':''}" style="${attCompact?'table-layout:fixed;width:100%;':'width:max-content;'}">
      <thead>
        <tr>
          <th class="empHead">Employee</th>
          ${dayCols.map(d=>`<th class="${isSunday(attMonth,d)?'sun':''} ${isHolidayDate(dateStr(attMonth,d))?'holiday':''}" title="${isHolidayDate(dateStr(attMonth,d))?'NOPH':''}">${d}<br><span style="font-weight:400;">${weekdayShort(attMonth,d)}</span></th>`).join('')}
          <th class="sumHead">Pres</th><th class="sumHead">Leave</th><th class="sumHead">Hol</th><th class="sumHead">Half</th><th class="sumHead">LOP</th><th class="sumHead">OT</th>
        </tr>
      </thead>
      <tbody>
        ${active.length ? active.map(e=>{
          const sum=attendanceSummary(e.code, attMonth);
          const otVal=getAdj(attMonth, e.code).otHours||0;
          return `<tr>
            <td class="empCell">
              <div class="empName">${e.name}</div>
              <div class="empSub">${e.code} · ${e.department||'-'}</div>
              <select class="cellSel" style="width:100%;height:20px;font-size:9px;" ${hasPerm('attendance','edit')?'':'disabled'} onchange="if(this.value){setRowForMonth('${e.code}',this.value);this.value='';}">
                <option value="">Fill whole month...</option>
                ${STATUS_LIST.map(s=>`<option value="${s}">${STATUS_LABEL[s]}</option>`).join('')}
              </select>
            </td>
            ${dayCols.map(d=>{
              const dt=dateStr(attMonth,d);
              const val=getAttStatus(dt, e.code);
              const dtIsHoliday=isHolidayDate(dt);
              const optionList = dtIsHoliday ? [val] : STATUS_LIST;
              return `<td class="${val?('cellStatus-'+val):''}" title="${dtIsHoliday?STATUS_LABEL[val]+' — Holiday Calendar, locked':(val?STATUS_LABEL[val]:'')}">
                <select class="cellSel" ${(hasPerm('attendance','edit') && !dtIsHoliday)?'':'disabled'} onchange="setCellStatus('${dt}','${e.code}',this.value)">
                  ${!dtIsHoliday?`<option value="" ${!val?'selected':''}>—</option>`:''}
                  ${optionList.map(s=>`<option value="${s}" ${val===s?'selected':''}>${STATUS_LABEL[s].slice(0,3)}</option>`).join('')}
                </select>
              </td>`;
            }).join('')}
            <td class="sumCell">${sum.present}</td>
            <td class="sumCell">${sum.leave}</td>
            <td class="sumCell">${sum.holiday}</td>
            <td class="sumCell">${sum.halfDay}</td>
            <td class="sumCell">${sum.lop}</td>
            <td><input type="number" class="otInput" style="width:100%;height:20px;font-size:9px;" value="${otVal}" min="0" step="0.5" ${hasPerm('attendance','edit')?'':'disabled'} onchange="setMonthlyOT('${e.code}',+this.value)"></td>
          </tr>`;
        }).join('') : `<tr><td colspan="${dayCols.length+7}" style="text-align:center;padding:12px;color:var(--muted);">No employees match your search.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td class="empCell"><b>Quick-set whole day</b></td>
          ${dayCols.map(d=>{
            const dt=dateStr(attMonth,d);
            const dtIsHoliday=isHolidayDate(dt);
            return `<td><select class="daySel" ${(hasPerm('attendance','edit') && !dtIsHoliday)?'':'disabled'} onchange="if(this.value){setDayForAll('${dt}',this.value);this.value='';}">
              <option value="">${dtIsHoliday?'🔒':'·'}</option>
              ${QUICK_STATUS.map(s=>`<option value="${s}">${STATUS_LABEL[s].slice(0,3)}</option>`).join('')}
            </select></td>`;
          }).join('')}
          <td colspan="7"></td>
        </tr>
      </tfoot>
    </table>
    </div>
    <p class="syncNote">Changes save instantly and flow straight into Payroll — working days, leave, holidays, half-days and LOP are calculated automatically from this grid, and OT hours entered here are used directly in salary processing. No need to re-enter attendance data on the Payroll page. Untick "Fit all days on screen" for a wider, easier-to-read scrollable view.</p>
    `}
  </div>`;
}
function setCellStatus(date, code, status){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  if(isHolidayDate(date)){ alert('This date is set as NOPH in the Holiday Calendar and is locked. Remove it from the Holiday Calendar (Payroll → Payroll Process) to edit attendance for this date.'); return; }
  if(!db.attendance[date]) db.attendance[date]={};
  if(status) db.attendance[date][code]=status; else delete db.attendance[date][code];
  saveDB(db);
  render('attendance');
}
function setDayForAll(date, status){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  if(isHolidayDate(date)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  const active=db.employees.filter(e=>isEmpOnRollOn(e,date));
  if(!db.attendance[date]) db.attendance[date]={};
  active.forEach(e=>{ db.attendance[date][e.code]=status; });
  saveDB(db);
  render('attendance');
}
function setRowForMonth(code, status){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const dim=daysInMonth(attMonth);
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d);
    if(isHolidayDate(dt)) continue; // Holiday Calendar dates are locked
    if(!db.attendance[dt]) db.attendance[dt]={};
    db.attendance[dt][code]=status;
  }
  saveDB(db);
  render('attendance');
}
function fillUnmarkedPresent(){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,attMonth));
  const dim=daysInMonth(attMonth);
  active.forEach(e=>{
    for(let d=1; d<=dim; d++){
      const dt=dateStr(attMonth,d);
      if(isHolidayDate(dt)) continue; // Holiday Calendar (NOPH) dates are locked
      if(isSunday(attMonth,d)) continue; // Sundays are outside NOWD and are never marked Present
      if(!db.attendance[dt]) db.attendance[dt]={};
      if(!db.attendance[dt][e.code]) db.attendance[dt][e.code]='Present';
    }
  });
  saveDB(db);
  render('attendance');
}
function clearMonthAttendance(){
  if(!hasPerm('attendance','delete')){ alert('You do not have permission to clear attendance.'); return; }
  if(!confirm('Clear all attendance entries for '+monthLabel(attMonth)+'? This cannot be undone.')) return;
  const dim=daysInMonth(attMonth);
  for(let d=1; d<=dim; d++) delete db.attendance[dateStr(attMonth,d)];
  saveDB(db);
  render('attendance');
}
function setMonthlyOT(code, hours){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  a.otHours = hours||0;
  saveDB(db);
}
// Manual per-employee, per-month adjustments (OT hours, LOP override, advance, tax, other allowance one-off)

