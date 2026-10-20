/* ================= ATTENDANCE ================= */
let attMonth = monthKey(todayStr());
let attSearch = '';
let attCompact = true;
let attViewMode = 'overview'; // 'overview' (all employees, month calendar with counts), 'day' (one day, every employee) or 'employee' (one employee's month)
let attDate = todayStr();
let attEmpCode = ''; // selected employee for the Employee-wise Monthly Attendance view
let attUnitFilter = ''; // '' = all units, or a unit code ('Unit-1', 'Unit-2', …) — filters the Employee dropdown above
let attContractorFilter = ''; // '' = all contractors, '-' = no contractor, or a contractor code — same idea
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
    const a=getAdj(attMonth, attEmpCode);
    Object.keys(a).forEach(k=>{ if(!(k in attEditSnapshot.adj)) delete a[k]; }); // e.g. a Late figure typed during this edit
    Object.assign(a, attEditSnapshot.adj);
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
  attDate=localDateStr(d);
  attMonth=monthKey(attDate);
  render('attendance');
}
function setAttDate(v){ attDate=v; attMonth=monthKey(v); render('attendance'); }
function goAttToday(){ attDate=todayStr(); attMonth=monthKey(attDate); render('attendance'); }
function toggleAttCompact(){ attCompact=!attCompact; render('attendance'); }
const QUICK_STATUS = ['Present','HalfDay','LossOfPay'];
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
// attendance is displayed or summarized (Attendance, Payroll, Dashboard). In order:
//   1. a Holiday Calendar date shows/counts as 'NOPH' for every employee;
//   2. a mark made on the Attendance screen;
//   3. otherwise Employee Time Entry — see timeEntryAttStatus().
function getAttStatus(date, code){
  const t=getHolidayType(date);
  if(t) return t;
  const s=db.attendance[date]?.[code] || '';
  if(s) return s==='PaidLeave' ? 'LossOfPay' : s; // NOPL (paid leave) was removed — any old NOPL mark counts as Loss Of Pay
  return timeEntryAttStatus(date, code);
}
// A day's status from Employee Time Entry: its Employee Leave (Loss of Pay / Half Day), else
// Present when an In Time was entered, else '' (not marked).
// A date booked in Time Entry's own Holiday Booking is not a working day there: time worked on it is
// paid as full-day OT, so it does not also count as a Present (paid) day.
function timeEntryAttStatus(date, code){
  const lv=typeof teGetLeave==='function' ? teGetLeave(date, code) : null;
  if(lv) return lv.type==='Half Day' ? 'HalfDay' : 'LossOfPay';
  const te=db.timeEntries && db.timeEntries[date] && db.timeEntries[date][code];
  if(!(te && te.inH!=='' && te.inH!==undefined && te.inH!==null)) return '';
  return (db.timeHolidays||[]).some(h=>h.date===date) ? '' : 'Present';
}
// True when the status shown for this day comes from Employee Time Entry (nothing marked here).
function attIsFromTimeEntry(date, code){
  return !getHolidayType(date) && !(db.attendance[date]?.[code]) && !!timeEntryAttStatus(date, code);
}

// Only days the employee is on the roll count (the same days payroll pays). "unmarked" = working
// days on the roll up to today with no status at all (unpaid).
function attendanceSummary(code, ym){
  const dim=daysInMonth(ym), today=todayStr();
  const emp=(db.employees||[]).find(e=>e.code===code);
  let present=0, leave=0, noph=0, halfDay=0, lop=0, marked=0, unmarked=0;
  for(let d=1; d<=dim; d++){
    // Sundays are already excluded from NOWD's denominator, so they must never contribute to
    // Days Worked either — otherwise a Sunday marked Present (e.g. by a bulk "Fill as Present"
    // action) inflates earnings by an extra day's pay beyond NOWD. Skip them entirely here.
    if(isSunday(ym,d)) continue;
    const ds=dateStr(ym,d);
    if(emp && !isEmpOnRollOn(emp, ds)) continue;
    const s=getAttStatus(ds, code);
    if(!s){ if(ds<=today) unmarked++; continue; }
    marked++;
    if(s==='Present') present++;
    else if(s==='NOPH') noph++;
    else if(s==='HalfDay') halfDay++;
    else if(s==='LossOfPay') lop++;
  }
  const payableDays = present + leave + noph + halfDay*0.5;
  return { present, leave, holiday: noph, holidayOnly:0, nophDays:noph, halfDay, lop, absent:lop, marked,
    unmarked, daysInMonth: dim, lopEquivalent: lop + halfDay*0.5, payableDays: Math.round(payableDays*100)/100 };
}
// Kept for payroll compatibility — LOP-equivalent days derived straight from Attendance data.
function attendanceLopCount(code, ym){ return attendanceSummary(code, ym).lopEquivalent; }

function attTabsInline(){
  const tab=(mode,icon,label,title)=>`<button class="attTab ${attViewMode===mode?'active':''}" ${attEditMode?'disabled':''} title="${title}" onclick="setAttView('${mode}')">${ico(icon)} ${label}</button>`;
  return `<div class="attTabsInline">
    ${tab('overview','calendar-days','Month Overview','Every employee — how many are Present, Absent and on Half Day each day')}
    ${tab('day','users','Day View','Every employee on one day — mark or change their attendance')}
    ${tab('employee','user','Employee-wise','One employee\'s whole month')}
  </div><span class="attTabDivider"></span>`;
}
function renderAttendance(){
  if(attViewMode==='day') return `<div class="attStage">${renderAttendanceDay()}</div>`;
  if(attViewMode==='overview') return `<div class="attStage">${renderAttendanceOverview()}</div>`;
  return `<div class="attStage">${renderAttendanceEmployee()}</div>`;
}
// Employees counted on a date: on the roll that day and inside the Unit / Contractor filters.
function attFilteredOnDate(date){
  return db.employees.filter(e=>isEmpOnRollOn(e,date) && (!attUnitFilter || unitCodeOf(e.unit)===attUnitFilter) && contractorFilterMatches(e, attContractorFilter));
}
// Present / Absent (Loss Of Pay) / Half Day / NOPH / Not marked counts for one day (filters applied).
function attDayStatusCounts(date){
  const c={total:0, Present:0, LossOfPay:0, HalfDay:0, NOPH:0, unmarked:0};
  attFilteredOnDate(date).forEach(e=>{
    c.total++;
    const s=getAttStatus(date, e.code);
    if(s && c[s]!==undefined) c[s]++; else if(!s) c.unmarked++;
  });
  return c;
}
function openAttDay(date){ attDate=date; attMonth=monthKey(date); attViewMode='day'; render('attendance'); }
function shiftAttMonth(delta){
  const [y,m]=attMonth.split('-').map(Number); const d=new Date(y, m-1+delta, 1);
  attMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render('attendance');
}
/* ---- Month Overview: one big box per day with how many employees were Present, Absent (Loss Of
   Pay), on Half Day, on a paid holiday or not marked yet — for the unit / contractor chosen above.
   Click a day to open it in Day View. Counts include days filled from Employee Time Entry. ---- */
function renderAttendanceOverview(){
  const dim=daysInMonth(attMonth), today=todayStr();
  const [y0,m0]=attMonth.split('-').map(Number);
  const firstDow=(new Date(y0,m0-1,1).getDay()+6)%7; // Monday first
  const tot={Present:0, LossOfPay:0, HalfDay:0, unmarked:0};
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push('<div class="attOvCell blank"></div>');
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d), sun=isSunday(attMonth,d), hol=getHolidayType(dt), future=dt>today;
    const c=attDayStatusCounts(dt);
    if(!sun){ tot.Present+=c.Present; tot.LossOfPay+=c.LossOfPay; tot.HalfDay+=c.HalfDay; }
    const line=(cls,label,n)=>`<div class="attOvLine ${cls}"><span>${label}</span><b>${n}</b></div>`;
    const any=c.Present+c.LossOfPay+c.HalfDay;
    cells.push(`<button type="button" class="attOvCell ${sun?'sun':''} ${hol?'hol':''} ${dt===today?'today':''} ${future?'future':''}" onclick="openAttDay('${dt}')" title="Open ${fmtDate(dt)} in Day View">
      <div class="attOvHead"><b>${d}</b><span>${weekdayShort(attMonth,d)}</span>${hol?`<em>${STATUS_LABEL[hol]||hol}</em>`:sun?'<em>Sunday</em>':''}</div>
      ${hol ? `<div class="attOvHoliday">Holiday</div>`
        : any ? `${line('present','Present',c.Present)}${line('absent','Absent',c.LossOfPay)}${line('half','Half Day',c.HalfDay)}` : ''}
    </button>`);
  }
  const emps=attFilteredOnDate(dateStr(attMonth, Math.min(dim, attMonth===monthKey(today)?Number(today.slice(8,10)):dim))).length;
  return `${attUnitTabsHTML()}
  <div class="attStageTop">
    ${attTabsInline()}
    <div class="grp">${attUnitOptionsHTML()}</div>
    <div class="sep"></div>
    <div class="grp">
      <button class="navBtn" onclick="shiftAttMonth(-1)" title="Previous month">‹</button>
      <input type="month" value="${attMonth}" onchange="if(this.value){attMonth=this.value;render('attendance');}">
      <button class="navBtn" onclick="shiftAttMonth(1)" title="Next month">›</button>
      <span class="attDayLabel">${monthLabel(attMonth)}</span>
    </div>
    <div class="attOvTotals">
      <span class="chip">${emps} Employees</span>
      <span class="chip ok">${tot.Present} Present</span>
      <span class="chip danger">${tot.LossOfPay} Absent</span>
      <span class="chip warn">${tot.HalfDay} Half Day</span>
    </div>
  </div>
  <div class="attOvPanel">
    <div class="attOvGrid attOvDows">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="attCalDow">${d}</div>`).join('')}</div>
    <div class="attOvGrid">${cells.join('')}</div>
    <p class="syncNote" style="margin:8px 0 0;">View only — attendance comes from <b>Employee Time Entry</b> (In time = Present; Loss of Pay / Half Day leave). Counts are employees for the unit and contractor chosen above (Absent = Loss Of Pay). Click a day to see that day's details. <button type="button" class="linkBtn" onclick="teOpenDateWise(todayStr())">Go to Employee Time Entry →</button></p>
  </div>`;
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
      <div class="accHead"><h4>${ico('clipboard')} Attendance Completion — ${monthLabel(attMonth)}</h4></div>
      <p class="syncNote" style="margin:6px 0 0;">This month hasn't started yet — nothing to mark.</p>
    </div>`;
  }
  if(!st.totalEmp){
    return `<div class="attCompletionCard future">
      <div class="accHead"><h4>${ico('clipboard')} Attendance Completion — ${monthLabel(attMonth)}</h4></div>
      <p class="syncNote" style="margin:6px 0 0;">No active employees for this month.</p>
    </div>`;
  }
  const pctClass = st.pct===100?'ok':(st.pct>=70?'mid':'low');
  const incomplete = st.list.filter(x=>!x.complete).sort((a,b)=>(b.missing-a.missing)||a.name.localeCompare(b.name));
  return `
  <div class="attCompletionCard">
    <div class="accHead">
      <h4>${ico('clipboard')} Attendance Completion — ${monthLabel(attMonth)} <span class="accSub">through ${fmtDate(dateStr(attMonth,st.lastDay))}</span></h4>
      <span class="accPct ${pctClass}">${st.pct}% Complete</span>
    </div>
    <div class="accBarTrack"><div class="accBarFill ${pctClass}" style="width:${st.pct}%;"></div></div>
    <div class="accChips">
      <span class="chip ok">${ico('check')} ${st.complete} Fully Marked</span>
      <span class="chip ${st.partial?'warn':''}">${ico('circle-dashed')} ${st.partial} Partially Marked</span>
      <span class="chip ${st.notStarted?'danger':''}">${ico('x')} ${st.notStarted} Not Started</span>
      <span class="chip">${st.totalEmp} Total Employees</span>
    </div>
    ${incomplete.length ? `
    <div class="accMissingList">
      ${incomplete.slice(0,60).map(x=>`<button type="button" class="accMissingPill" onclick="setAttEmpCode('${x.code}')" title="Open ${x.name}'s attendance to fill in the missing day(s)">
        <b>${x.name}</b><span>${x.code}${x.department?' · '+x.department:''} · ${x.missing} day${x.missing===1?'':'s'} pending</span>
      </button>`).join('')}
    </div>` : `<p class="syncNote" style="margin:10px 0 0;color:var(--st-present-text);">${ico('circle-check')} Everyone is fully marked up to date.</p>`}
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

// Day View (read only): who was Present, Absent (Loss Of Pay) or on Half Day that day, with their
// Time Entry In / Out times. Nothing is shown for a day without attendance; a holiday shows "Holiday".
// Attendance is entered and changed only in Employee Time Entry.
function renderAttendanceDay(){
  const dObj=new Date(attDate+'T00:00:00');
  const dayName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dObj.getDay()];
  const dateLabel=fmtDate(attDate);
  const hol=getHolidayType(attDate);
  const q=attSearch.toLowerCase();
  const rows=attFilteredOnDate(attDate)
    .map(e=>({e, s:getAttStatus(attDate, e.code)}))
    .filter(x=>x.s && x.s!=='NOPH' && (!q || (`${x.e.name} ${x.e.code}`).toLowerCase().includes(q)))
    .sort((a,b)=>({Present:0,HalfDay:1,LossOfPay:2}[a.s]-{Present:0,HalfDay:1,LossOfPay:2}[b.s]) || a.e.code.localeCompare(b.e.code,undefined,{numeric:true}));
  const c=attDayStatusCounts(attDate);
  const tm=code=>{ const t=db.timeEntries&&db.timeEntries[attDate]&&db.timeEntries[attDate][code]; return t&&t.inH!==''&&t.inH!==undefined ? {inT:teEwFmtTime(t.inH,t.inM,t.inAP), outT:teEwFmtTime(t.outH,t.outM,t.outAP)} : {inT:'',outT:''}; };
  const body = hol ? `<div class="attDayEmpty hol">${ico('palm')} <b>Holiday</b> — ${dateLabel} (${STATUS_LABEL[hol]||hol})</div>`
    : !(c.Present+c.LossOfPay+c.HalfDay) ? `<div class="attDayEmpty">No attendance recorded for ${dateLabel}.</div>`
    : `<div class="tableScrollWrap"><table class="attDayTable"><thead><tr><th>Sl No</th><th>Emp Code</th><th style="text-align:left;">Name</th><th>Unit</th><th>Contractor</th><th>In Time</th><th>Out Time</th><th>Status</th></tr></thead><tbody>
      ${rows.map((x,i)=>{ const t=tm(x.e.code); return `<tr><td>${i+1}</td><td>${x.e.code}</td><td style="text-align:left;">${x.e.name}</td><td>${unitLabel(x.e.unit)}</td><td>${contractorName(x.e)||'Non Contractor'}</td><td>${t.inT||'-'}</td><td>${t.outT||'-'}</td><td><span class="tag ${x.s}">${STATUS_LABEL[x.s]}</span></td></tr>`; }).join('') || `<tr><td colspan="8" class="empty">No employees match your search.</td></tr>`}
    </tbody></table></div>`;
  return `${attUnitTabsHTML()}
  <div class="attDateBar">
    ${attTabsInline()}
    <div class="grp">${attUnitOptionsHTML()}</div>
    <button class="navBtn" onclick="shiftAttDate(-1)" title="Previous day">‹</button>
    <input type="date" value="${attDate}" onchange="setAttDate(this.value)">
    <button class="navBtn" onclick="shiftAttDate(1)" title="Next day">›</button>
    <button class="attTodayBtn" onclick="goAttToday()">Today</button>
    <span class="attDayLabel">${dayName}, ${dateLabel}</span>
    <input type="search" placeholder="Search employee..." value="${attSearch}" oninput="attSearch=this.value;render('attendance')" style="margin-left:auto;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);">
  </div>
  ${!hol && (c.Present+c.LossOfPay+c.HalfDay) ? `<div class="attDaySumBar">
    <span class="chip ok">${c.Present} Present</span>
    <span class="chip danger">${c.LossOfPay} Absent</span>
    <span class="chip warn">${c.HalfDay} Half Day</span>
  </div>` : ''}
  <div class="attBulkBar">
    <button class="btn secondary" onclick="teOpenDateWise('${attDate}')">${ico('clock')} Enter / change in Employee Time Entry</button>
    <button class="attTab" style="margin-left:auto;" onclick="setAttView('overview')">← Month Overview</button>
  </div>
  <div class="panel">${body}
    <p class="syncNote">View only — attendance is entered in <b>Employee Time Entry</b> and worked out from the In / Out times and leave recorded there.</p>
  </div>`;
}
// Day View bulk actions act on the employees shown (Unit / Contractor filters).
function markAllQuick(status){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  if(isHolidayDate(attDate)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  if(!db.attendance[attDate]) db.attendance[attDate]={};
  attFilteredOnDate(attDate).forEach(e=>{ if(!getAttStatus(attDate, e.code)) db.attendance[attDate][e.code]=status; }); // only the not-marked ones
  saveDB(db);
  render('attendance');
}
function copyPrevDayAttendance(){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  if(isHolidayDate(attDate)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  const d=new Date(attDate+'T00:00:00'); d.setDate(d.getDate()-1);
  const prev=localDateStr(d);
  const src=db.attendance[prev];
  if(!src){ alert('No attendance recorded for the previous day.'); return; }
  if(!db.attendance[attDate]) db.attendance[attDate]={};
  attFilteredOnDate(attDate).forEach(e=>{
    if(src[e.code]) db.attendance[attDate][e.code]=src[e.code];
  });
  saveDB(db);
  render('attendance');
}
function clearDayAttendance(){
  if(!hasPerm('attendance','delete')){ alert('You do not have permission to clear attendance.'); return; }
  if(isHolidayDate(attDate)){ alert('This date is set as NOPH in the Holiday Calendar and is locked.'); return; }
  if(!confirm('Clear the attendance marked on this screen for '+fmtDate(attDate)+' for the employees shown? Days from Employee Time Entry stay. This cannot be undone.')) return;
  attFilteredOnDate(attDate).forEach(e=>{ if(db.attendance[attDate]) delete db.attendance[attDate][e.code]; });
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
function setAttContractorFilter(c){ attContractorFilter=c; attEmpCode=''; attEditMode=false; attEditSnapshot=null; render('attendance'); }
function shiftAttEmpMonth(delta){
  const [y,m]=attMonth.split('-').map(Number);
  const d=new Date(y, m-1+delta, 1);
  attMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  attEditMode=false; attEditSnapshot=null;
  render('attendance');
}
function setAttEmpMonth(v){ attMonth=v; attEditMode=false; attEditSnapshot=null; render('attendance'); }
// Bulk fills and copies only touch days the employee is on the roll, up to today — a future day
// or a day before joining / after leaving is never marked Present (it would be paid).
function attFillableDay(e, dt){ return !!e && isEmpOnRollOn(e, dt) && dt<=todayStr(); }
function fillEmployeeMonthPresent(code){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const dim=daysInMonth(attMonth);
  const emp=db.employees.find(x=>x.code===code);
  for(let d=1; d<=dim; d++){
    const dt=dateStr(attMonth,d);
    if(isHolidayDate(dt)) continue; // Holiday Calendar (NOPH) dates are locked
    if(isSunday(attMonth,d)) continue; // Sundays are outside NOWD and are never marked Present
    if(!attFillableDay(emp, dt)) continue;
    if(getAttStatus(dt, code)) continue; // already marked, or filled from Employee Time Entry
    if(!db.attendance[dt]) db.attendance[dt]={};
    db.attendance[dt][code]='Present';
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
  const emp=db.employees.find(x=>x.code===code);
  let copied=0;
  for(let d=1; d<=dim; d++){
    if(d>prevDim) continue;
    const dt=dateStr(attMonth,d);
    if(isHolidayDate(dt)) continue; // Holiday Calendar dates are locked
    if(!attFillableDay(emp, dt)) continue;
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
// Late for the Attendance screen's employee/month (see lateDeductionFor in Payroll).
function attLateInfo(emp){
  return lateDeductionFor(emp, attMonth, wageOnDate(emp, dateStr(attMonth, daysInMonth(attMonth)))); // the month's wage
}
function attLateTip(emp){
  const l=attLateInfo(emp);
  return `${l.minutes} min late − ${l.grace} min free = ${l.charged} min × ₹${(Math.round(l.perMinute*100)/100)}/min (Daily Wage ÷ 8 ÷ 60)`;
}
// Late minutes for one month: a typed number overrides Employee Time Entry's total; a blank box
// goes back to the Time Entry figure.
function setMonthlyLate(code, inp){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  if(String(inp.value).trim()==='') delete a.lateMinutes;
  else a.lateMinutes=Math.max(0, Math.round(+inp.value||0));
  saveDB(db);
  const emp=db.employees.find(x=>x.code===code); if(!emp) return;
  inp.value=attLateInfo(emp).minutes;
  const row=document.getElementById('attLateRow');
  if(row){ row.title=attLateTip(emp); row.querySelector('b').textContent='₹'+attLateInfo(emp).amount; }
}
function setCanteenTokens(code, field, val){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  a[field] = +val||0;
  saveDB(db);
}
// Unit- and Contractor-selection dropdowns shown to the left of the Employee dropdown on the
// Attendance screen. "All" clears a filter; picking a unit and/or contractor narrows the Employee list.
function attUnitOptionsHTML(){
  return `<select class="empPicker" ${attEditMode?'disabled':''} onchange="setAttContractorFilter(this.value)" title="Select contractor">
    ${contractorFilterOptionsHtml(attContractorFilter)}
  </select>`;
}
// Unit tabs across the top of the Attendance screen: "All Units", "UNIT 1", "UNIT 2", … Picking a
// tab narrows the Employee dropdown to that unit (locked while attendance is being edited).
function attUnitTabsHTML(){
  const dis=attEditMode?'disabled':'';
  const tab=(code,label,title)=>`<button type="button" role="tab" class="attUnitTab ${attUnitFilter===code?'active':''}" aria-selected="${attUnitFilter===code}" ${dis} title="${String(title).replace(/"/g,'&quot;')}" onclick="setAttUnitFilter('${code}')">${label}</button>`;
  return `<div class="attUnitTabs" role="tablist" aria-label="Working unit">
    ${tab('','All Units','All units')}
    ${getUnits().map(u=>tab(u.code, unitTabLabel(u), unitDisplayName(u))).join('')}
  </div>`;
}
function renderAttendanceEmployee(){
  const allActiveAllUnits=db.employees.filter(e=>isEmpOnRollInMonth(e,attMonth)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  if(!allActiveAllUnits.length) return `<div class="panel"><div class="empty">No active employees. Add employees first.</div></div>`;
  // Unit filter: '' shows every unit's employees; a unit code narrows the list (and
  // therefore the Employee dropdown below) to just that unit's on-roll employees.
  const active = allActiveAllUnits.filter(e=>(!attUnitFilter || unitCodeOf(e.unit)===attUnitFilter) && contractorFilterMatches(e, attContractorFilter));
  if(!active.length){
    const what=[attUnitFilter?'in '+unitLabel(attUnitFilter):'', attContractorFilter?(attContractorFilter==='-'?'with no contractor':'from '+contractorName(attContractorFilter)):''].filter(Boolean).join(' ');
    return `<div class="attStage">${attUnitTabsHTML()}<div class="attStageTop">${attTabsInline()}
      <div class="grp">${attUnitOptionsHTML()}</div>
    </div><div class="panel"><div class="empty">No active employees ${what||'for this selection'} this month.</div></div></div>`;
  }
  if(!attEmpCode || !active.find(e=>e.code===attEmpCode)) attEmpCode = active[0].code;
  const emp = active.find(e=>e.code===attEmpCode);
  const dim = daysInMonth(attMonth);
  const sum = attendanceSummary(attEmpCode, attMonth);
  const adj = getAdj(attMonth, attEmpCode);
  const otVal = otHoursFor(emp, attMonth);
  const s = getSettings();
  const tokenPrice = canteenTokenPrice(attMonth);
  const monthTokens = canteenTokensFor(emp, attMonth);
  const pay = computePayrollForEmployee(emp, attMonth); // same figures as the salary slip
  const canteenAmt = Math.round(monthTokens*tokenPrice*100)/100;
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
    const fromTE = attIsFromTimeEntry(dt, attEmpCode);
    cells.push(`<div class="attCalCell st-${val} ${isSunday(attMonth,d)?'sun':''} ${fromTE?'fromTE':''}">
      <div class="dNum">${d} <span style="font-weight:400;color:var(--muted);">${weekdayShort(attMonth,d)}</span>${fromTE?`<span class="attTETag" title="From Employee Time Entry">${ico('clock')}</span>`:''}</div>
      <div class="attCalStatus" title="${dtIsHoliday?'Holiday Calendar':fromTE?'From Employee Time Entry':val?'Marked earlier on this screen':'No attendance'}">${val?(dtIsHoliday?'Holiday':STATUS_LABEL[val]):''}</div>
    </div>`);
  }
  const advTip = advDetails.length ? advDetails.map(x=>`${x.advance.reason||'Advance'}: ₹${x.row.amount}`).join(' | ') : 'No salary advance scheduled this month';

  // ---- Top bar: the controls used on every visit — employee, month, edit/save, quick fills ----
  const topBar = `
  <div class="attStageTop">
    ${attTabsInline()}
    <div class="grp">
      ${attUnitOptionsHTML()}
      <select class="empPicker" ${attEditMode?'disabled':''} onchange="setAttEmpCode(this.value)" title="Select employee">${empOpts}</select>
      ${emp && emp.department ? `<span class="attDayLabel" style="font-weight:400;color:var(--muted);">${emp.department}</span>`:''}
    </div>
    <div class="sep"></div>
    <div class="grp">
      <button class="navBtn" ${attEditMode?'disabled':''} onclick="shiftAttEmpMonth(-1)" title="Previous month">‹</button>
      <input type="month" value="${attMonth}" ${attEditMode?'disabled':''} onchange="setAttEmpMonth(this.value)">
      <button class="navBtn" ${attEditMode?'disabled':''} onclick="shiftAttEmpMonth(1)" title="Next month">›</button>
      <span class="attDayLabel">${monthLabel(attMonth)}</span>
    </div>
    <div class="sep"></div>
    ${attEditMode ? `<div class="attStageEditNote">${ico('pencil')} Edit mode — change this month's figures below (OT, canteen, allowance, deduction, late), then Save.</div>` : ''}
    <div class="attRightActions">
      ${hasPerm('attendance','edit') ? (attEditMode
        ? `<button class="btn secondary" onclick="cancelAttendanceEdit()">${ico('x')} Cancel</button><button class="btn" onclick="saveAttendance()">${ico('save')} Save</button>`
        : `<button class="btn btnEditAtt" onclick="toggleAttEdit()" title="Attendance itself comes from Employee Time Entry; this edits the month's OT / canteen / allowance / deduction / late figures">${ico('pencil')} Edit Monthly Figures</button>`) : ''}
    </div>
  </div>`;

  // ---- Left column: everything auto-calculated / system-derived (read-only) ----
  const autoCol = `
  <div class="attAutoCol">
    ${renderAttCompletionCard()}
    <div class="autoCard grow">
      <h4>${ico('chart')} Attendance Summary (auto)</h4>
      <div class="attSumGrid">
        <div class="sk">Present Days</div><div class="sv">${sum.present}</div>
        <div class="sk">Loss Of Pay Days</div><div class="sv">${sum.absent}</div>
        <div class="sk">NOPH Days</div><div class="sv">${sum.nophDays}</div>
        <div class="sk">Half Days</div><div class="sv">${sum.halfDay}</div>
        <div class="sk" title="Working days up to today with no status — not paid">Not Marked (unpaid)</div><div class="sv" style="${sum.unmarked?'color:var(--warn);':''}">${sum.unmarked}</div>
        <div class="sk totalRow">Total Payable Days</div><div class="sv totalRow">${sum.payableDays}</div>
      </div>
    </div>
    <div class="autoCard">
      <h4>${ico('credit-card')} System-Calculated</h4>
      <div class="autoRow" title="${advTip}"><span>Scheduled Advance</span><b>₹${scheduledAdv}</b></div>
      <div class="autoRow" title="${monthTokens} token(s) × ₹${tokenPrice}"><span>Canteen Deduction</span><b>₹${canteenAmt}</b></div>
      <div class="autoRow" id="attLateRow" title="${attLateTip(emp)}"><span>Late Deduction</span><b>₹${attLateInfo(emp).amount}</b></div>
      <div class="autoRow" title="${pay.otHours} hrs × ₹${pay.otPerHourRate}/hr"><span>OT Pay</span><b>₹${pay.otAmount}</b></div>
      <div class="autoRow" title="Total Earnings ₹${pay.earningsTotal} − Total Deductions ₹${pay.deductionsTotal} — the same figure as the salary slip"><span>Net Pay (${monthLabel(attMonth)})</span><b>₹${pay.netSalary}</b></div>
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
      <div class="attEntryField" title="${attOTTip(emp)}"><label>OT Hours${otTypedFor(adjFor(attMonth, attEmpCode))?' (typed)':''}</label><input type="number" value="${otVal}" min="0" step="any" ${editable?'':'disabled'} onchange="setMonthlyOT('${attEmpCode}',this)"></div>
      <div class="attEntryField" title="Usual monthly tokens come from the Employee form (${+emp.canteenTokens||0}); change it here for this month only."><label>Canteen Tokens (₹${tokenPrice}/tkn)${adj.canteenTokens!==undefined&&adj.canteenTokens!==null?' (typed)':''}</label><input type="number" value="${monthTokens}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','canteenTokens',this.value)"></div>
      <div class="attEntryField"><label>Other Allowance (₹)</label><input type="number" value="${adj.otherAllowanceOneOff||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','otherAllowanceOneOff',this.value)"></div>
      <div class="attEntryField"><label>Other Deduction (₹)</label><input type="number" value="${adj.otherDedOneOff||0}" min="0" ${editable?'':'disabled'} onchange="setCanteenTokens('${attEmpCode}','otherDedOneOff',this.value)"></div>
      <div class="attEntryField" title="Total Late this month from Employee Time Entry (${typeof teMonthLateMinutes==='function'?teMonthLateMinutes(attEmpCode, attMonth):0} min). Type a different number to use it for this month only; clear the box to go back to Time Entry. The first ${lateGraceMinutes(attMonth)} minutes are free."><label>Late Minutes${adj.lateMinutes!==undefined&&adj.lateMinutes!==null&&adj.lateMinutes!==''?' (typed)':''}</label><input type="number" value="${attLateInfo(emp).minutes}" min="0" step="1" ${editable?'':'disabled'} onchange="setMonthlyLate('${attEmpCode}',this)"></div>
    </div>
  </div>`;

  return `${attUnitTabsHTML()}${topBar}<div class="attStageBody">${autoCol}${entryCol}</div>`;
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
          <th class="sumHead">Pres</th><th class="sumHead">Hol</th><th class="sumHead">Half</th><th class="sumHead">LOP</th><th class="sumHead">OT</th>
        </tr>
      </thead>
      <tbody>
        ${active.length ? active.map(e=>{
          const sum=attendanceSummary(e.code, attMonth);
          const otVal=otHoursFor(e, attMonth);
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
              return `<td class="${val?('cellStatus-'+val):''}" title="${dtIsHoliday?STATUS_LABEL[val]+' — Holiday Calendar, locked':attIsFromTimeEntry(dt, e.code)?STATUS_LABEL[val]+' — from Employee Time Entry':(val?STATUS_LABEL[val]:'')}">
                <select class="cellSel" ${(hasPerm('attendance','edit') && !dtIsHoliday)?'':'disabled'} onchange="setCellStatus('${dt}','${e.code}',this.value)">
                  ${!dtIsHoliday?`<option value="" ${!val?'selected':''}>—</option>`:''}
                  ${optionList.map(s=>`<option value="${s}" ${val===s?'selected':''}>${STATUS_LABEL[s].slice(0,3)}</option>`).join('')}
                </select>
              </td>`;
            }).join('')}
            <td class="sumCell">${sum.present}</td>
            <td class="sumCell">${sum.holiday}</td>
            <td class="sumCell">${sum.halfDay}</td>
            <td class="sumCell">${sum.lop}</td>
            <td><input type="number" class="otInput" style="width:100%;height:20px;font-size:9px;" value="${otVal}" min="0" step="any" ${hasPerm('attendance','edit')?'':'disabled'} onchange="setMonthlyOT('${e.code}',this)" title="${attOTTip(e)}"></td>
          </tr>`;
        }).join('') : `<tr><td colspan="${dayCols.length+6}" style="text-align:center;padding:12px;color:var(--muted);">No employees match your search.</td></tr>`}
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
          <td colspan="5"></td>
        </tr>
      </tfoot>
    </table>
    </div>
    <p class="syncNote">Changes save instantly and flow straight into Payroll — working days, holidays, half-days and LOP are calculated automatically from this grid, and OT hours come from Employee Time Entry (a number typed here overrides it for the month). No need to re-enter attendance data on the Payroll page. Untick "Fit all days on screen" for a wider, easier-to-read scrollable view.</p>
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
      if(!attFillableDay(e, dt)) continue;
      if(getAttStatus(dt, e.code)) continue; // already marked, or filled from Employee Time Entry
      if(!db.attendance[dt]) db.attendance[dt]={};
      db.attendance[dt][e.code]='Present';
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
// OT hours for one month: a typed number (0 included) overrides Employee Time Entry's total; a
// blank box goes back to the Time Entry figure.
function setMonthlyOT(code, inp){
  if(!hasPerm('attendance','edit')){ alert('You do not have permission to edit attendance.'); return; }
  const a=getAdj(attMonth, code);
  if(String(inp.value).trim()===''){ a.otTyped=false; a.otHours=0; }
  else { a.otTyped=true; a.otHours=Math.max(0, +inp.value||0); }
  saveDB(db);
  const emp=db.employees.find(x=>x.code===code);
  if(emp){ inp.value=otHoursFor(emp, attMonth); inp.title=attOTTip(emp); }
}
function attOTTip(emp){
  const te=typeof teMonthOTMinutes==='function' ? Math.round(teMonthOTMinutes(emp.code, attMonth)/60*100)/100 : 0;
  return otTypedFor(adjFor(attMonth, emp.code))
    ? `Typed for ${monthLabel(attMonth)} (Employee Time Entry has ${te} hrs). Clear the box to use Time Entry.`
    : `From Employee Time Entry: ${te} hrs in ${monthLabel(attMonth)}. Type a number to use it instead for this month.`;
}
// Manual per-employee, per-month adjustments (OT hours, LOP override, advance, tax, other allowance one-off)

