/* ================= ATTENDANCE — shared parts =================
   Attendance is entered as month totals, every employee on one page (10b-temp-attendance.js:
   Present days, LOP, OT, Late, Canteen tokens). This file keeps what that page and Payroll share:
   date and holiday helpers, contractor paid leave, the month and Unit / Contractor filters, and the
   Month Summary, Holidays and Contractor Paid Leave tabs.
   Months entered day by day before (db.attendance[date][code] = Present / LossOfPay / HalfDay,
   db.dayFigs[date][code] = {late, ot} minutes) are still read by Payroll for an employee with no
   month totals; the Attendance grid shows them as that employee's figures, and typing over them
   turns them into month totals (tmpSeed). */
/* ---- Date and holiday helpers (used by Payroll, Reports and the Dashboard) ---- */
function daysInMonth(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); }
// Sundays in the month — the weekly off.
function sundaysInMonth(ym){
  const total=daysInMonth(ym);
  let count=0;
  for(let d=1; d<=total; d++){ if(isSunday(ym,d)) count++; }
  return count;
}
// Holiday Calendar: NOPH (paid holiday) dates are taken off NOWD like Sundays. A holiday on a Sunday
// is not counted twice.
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
// NOWD — Number Of Working Days: days in the month − Sundays − NOPH holidays.
function computeWorkingDays(ym){ return daysInMonth(ym) - sundaysInMonth(ym) - holidaysInMonth(ym); }
function isSunday(ym, day){ const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,day).getDay()===0; }

/* ---- Contractor paid leave (the Contractor Paid Leave tab) ----
   db.contractorLeaves = [{date, contractor, name}]: a paid day off on that date for every employee of
   that contractor. For them it counts exactly like a paid holiday (NOPH): paid, not a working day,
   and time worked on it is OT. */
function contractorLeaveOn(con, ds){
  const L=db.contractorLeaves;
  return con && Array.isArray(L) && L.length ? L.find(l=>l.date===ds && l.contractor===con) || null : null;
}
function empPaidLeaveOn(code, ds){
  const L=db.contractorLeaves;
  if(!Array.isArray(L) || !L.some(l=>l.date===ds)) return null;
  const e=(db.employees||[]).find(x=>x.code===code);
  return e ? contractorLeaveOn(e.contractor, ds) : null;
}

/* ---- One day's status ----
     1. a Holiday Calendar date counts as 'NOPH' for every employee, and a contractor's paid leave
        as 'NOPH' for that contractor's employees;
     2. a mark made on this screen (Present / LossOfPay / HalfDay — db.attendance);
     3. otherwise a day entered with In / Out times before db.simpleAttFrom — timeEntryAttStatus(). */
function getAttStatus(date, code){
  const t=getHolidayType(date);
  if(t) return t;
  if(empPaidLeaveOn(code, date)) return 'NOPH';
  const s=db.attendance && db.attendance[date] && db.attendance[date][code] || '';
  if(s) return s==='PaidLeave' ? 'LossOfPay' : s; // NOPL (paid leave) was removed — any old NOPL mark counts as Loss Of Pay
  return timeEntryAttStatus(date, code);
}
// A day's status from its entry: LOP / Half Day when marked, else
// Present when an In Time was entered, else '' (not marked). A booked holiday without pay is not a
// working day: time worked on it is paid as full-day OT, not as a Present day.
function timeEntryAttStatus(date, code){
  const lv=typeof teGetLeave==='function' ? teGetLeave(date, code) : null;
  if(lv) return lv.type==='Half Day' ? 'HalfDay' : 'LossOfPay';
  const te=db.timeEntries && db.timeEntries[date] && db.timeEntries[date][code];
  if(!(te && te.inH!=='' && te.inH!==undefined && te.inH!==null)) return '';
  return (db.timeHolidays||[]).some(h=>h.date===date) ? '' : 'Present';
}

/* ---- Day-by-day entry from db.dayAttFrom (12-payroll-calc.js) ----
   Runs once when this version first loads. Months typed as month totals on the short-lived monthly
   screen keep those totals (db.monthlyAttMonths) until switched to day entry here. A month that only
   had figures carried over to that screen (nothing typed) goes back to its days: the carried LOP /
   Half Day / Late / OT totals are dropped, so Payroll counts the days again. Canteen tokens, one-off
   allowances and deductions are kept. Without that screen ever having run, the current month starts
   day entry and keeps each employee's usual canteen token count as its figure. */
const ATT_TOTAL_KEYS=['lopDays','halfDays','lateMinutes','attEntered'];
function attDropTotals(a){
  if(!a) return;
  ATT_TOTAL_KEYS.forEach(k=>{ delete a[k]; });
  if(a.otTyped){ a.otHours=0; a.otTyped=false; }
}
function ensureDayAttendance(){
  if(db.dayAttFrom) return;
  const cur=monthKey(todayStr()), from=db.monthlyAttFrom || cur, keep=[];
  if(db.monthlyAttFrom){
    Object.keys(db.payrollAdjustments||{}).filter(ym=>ym>=from).forEach(ym=>{
      const month=db.payrollAdjustments[ym]||{};
      if(Object.values(month).some(a=>a && a.attEntered)) keep.push(ym);
      else Object.values(month).forEach(attDropTotals);
    });
  } else {
    payrollEmployeesFor(cur).forEach(e=>{
      const a=adjFor(cur, e.code);
      if((a.canteenTokens===undefined || a.canteenTokens===null) && +e.canteenTokens) getAdj(cur, e.code).canteenTokens=+e.canteenTokens;
    });
  }
  db.monthlyAttMonths=keep.sort();
  db.dayAttFrom=from;
  delete db.monthlyAttFrom;
}
/* ---- Present / LOP / Half Day with Late and OT per day, for every month ----
   Runs when data loads (and after a backup is restored). Every month is entered the same way. Days
   entered with In / Out times (the former Employee Time Entry, months before this way began) are
   converted once: Present (or Half Day), with the Late and OT worked out from the times as that
   day's figures; LOP / Half Day leave entries become the day's mark. Payroll for those months stays
   the same — the times give the same days, late minutes and OT as before. The late-off-OT rule
   applies from the month this way began (db.lateOffOtFrom). The converted times are kept in the
   database untouched for reference (a day's mark and figures come first). */
function ensureSimpleAttendance(){
  if(!db.simpleAttFrom) db.simpleAttFrom=monthKey(todayStr());
  if(!db.lateOffOtFrom) db.lateOffOtFrom=db.simpleAttFrom;
  if(db.attAllConverted) return;
  attConvertTimes('0000-00', db.simpleAttFrom, true);
  attConvertTimes(db.simpleAttFrom, null, false);
  db.attAllConverted=true;
}
// Days entered with In / Out times (and LOP / Half Day leave entries) in the months from `from` up to
// (not including) `to` → Present / LOP / Half Day marks, with the Late and OT worked out from the
// times as each day's figures. keepRaw leaves the times and leave entries in place.
function attConvertTimes(from, to, keepRaw){
  const inRange=ym=>ym>=from && (!to || ym<to);
  const emps=new Map((db.employees||[]).map(e=>[e.code, e]));
  const mark=(dt, code, st)=>{ if(!db.attendance) db.attendance={}; if(!db.attendance[dt]) db.attendance[dt]={}; if(!db.attendance[dt][code]) db.attendance[dt][code]=st; };
  Object.keys(db.timeEntries||{}).filter(dt=>inRange(dt.slice(0,7))).forEach(dt=>{
    Object.keys(db.timeEntries[dt]||{}).forEach(code=>{
      const en=db.timeEntries[dt][code], lv=teGetLeave(dt, code);
      const half=!!(lv && lv.type==='Half Day'), lop=!!(lv && !half);
      if(!lop && attHasTime(en,'in')){
        const e=emps.get(code), off=attDow(dt)===0 || !!attHolidayFor(e, dt);
        if(!off) mark(dt, code, half?'HalfDay':'Present');
        const c=teDayFigures(en, dt, code, half), f={};
        if(c.late>0) f.late=Math.round(c.late); if(c.ot>0) f.ot=Math.round(c.ot);
        if(Object.keys(f).length && !(db.dayFigs && db.dayFigs[dt] && db.dayFigs[dt][code])){ if(!db.dayFigs) db.dayFigs={}; if(!db.dayFigs[dt]) db.dayFigs[dt]={}; db.dayFigs[dt][code]=f; }
      }
      if(!keepRaw) delete db.timeEntries[dt][code];
    });
    if(!keepRaw && !Object.keys(db.timeEntries[dt]).length) delete db.timeEntries[dt];
  });
  if(Array.isArray(db.timeLeaves)){
    db.timeLeaves.filter(l=>inRange(String(l.date).slice(0,7))).forEach(l=>mark(l.date, l.empCode, l.type==='Half Day'?'HalfDay':'LossOfPay'));
    if(!keepRaw) db.timeLeaves=db.timeLeaves.filter(l=>!inRange(String(l.date).slice(0,7)));
  }
}
function attMonthName(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}); }

/* ---- Screen state ---- */
let attMonth=monthKey(todayStr());
let attUnitFilter='';        // '' = all units, or a unit code
let attContractorFilter='';  // '' = all, or a contractor code ('-' = not set)
function attEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const attN=v=>Math.round((+v||0)*100)/100;
const ATT_DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ATT_MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function attShortDate(dt){ const [,m,d]=dt.split('-'); return d+' '+ATT_MON[+m-1]; }

// Employees on the roll that month, inside the Unit / Contractor filters, by code.
function attEmployees(){
  return payrollEmployeesFor(attMonth).filter(e=>(!attUnitFilter || unitCodeOf(e.unit)===attUnitFilter) && contractorFilterMatches(e, attContractorFilter));
}
// One section per contractor (in the contractor list's order); employees whose contractor is not
// set come last, flagged.
function attGroups(emps){
  const cons=getContractors(), known=new Set(cons.map(c=>c.code));
  const out=cons.map(c=>({key:c.code, name:c.name||c.code, emps:emps.filter(e=>e.contractor===c.code)})).filter(g=>g.emps.length);
  const none=emps.filter(e=>!known.has(e.contractor));
  if(none.length) out.push({key:'-', name:'Contractor not set', emps:none, unset:true});
  return out;
}
function attMonthDates(ym){ return Array.from({length:daysInMonth(ym)},(_,i)=>dateStr(ym,i+1)); }
function attDow(dt){ const [y,m,d]=dt.split('-').map(Number); return new Date(y,m-1,d).getDay(); }
// The Holiday Calendar entry for a date: {kind:'paid'|'unpaid', name} or null.
function attHoliday(dt){
  const p=getHolidayEntry(dt); if(p) return {kind:'paid', name:p.name||'Paid holiday'};
  const u=(db.timeHolidays||[]).find(h=>h.date===dt); if(u) return {kind:'unpaid', name:u.remarks||u.name||'Holiday'};
  return null;
}
// The same for one employee, with their contractor's paid leave: {kind:'paid'|'unpaid'|'cleave', name}.
function attHolidayFor(e, dt){
  const h=attHoliday(dt); if(h) return h;
  const c=e && contractorLeaveOn(e.contractor, dt);
  return c ? {kind:'cleave', name:c.name||''} : null;
}
// Working days on the roll up to today with nothing entered (not paid until they are).
function attMissingDays(e, ym){
  if(attIsMonthly(ym) || tempAttFor(ym, e.code)) return 0;
  const today=todayStr(); let n=0;
  for(const dt of attMonthDates(ym)){
    if(dt>today) break;
    if(attDow(dt)===0 || attHolidayFor(e, dt) || !isEmpOnRollOn(e, dt)) continue;
    if(!getAttStatus(dt, e.code)) n++;
  }
  return n;
}
function attEntry(dt, code){ return db.timeEntries && db.timeEntries[dt] && db.timeEntries[dt][code] || null; }
function attHasTime(en, k){ return !!en && en[k+'H']!=='' && en[k+'H']!==undefined && en[k+'H']!==null; }
// A day's Late minutes and OT minutes as entered on this screen (db.dayFigs[date][code] = {late, ot}).
function attFig(dt, code){ return db.dayFigs && db.dayFigs[dt] && db.dayFigs[dt][code] || null; }
// The days with Late / OT in a month, as Payroll counts them (teMonthDays, 13b-past-days.js): on the
// roll and not LOP.
function attFigDays(code, ym){
  const F=db.dayFigs||{}, emp=(db.employees||[]).find(e=>e.code===code), out=[];
  for(const ds of attMonthDates(ym)){
    const f=F[ds] && F[ds][code]; if(!f) continue;
    if(emp && !isEmpOnRollOn(emp, ds)) continue;
    if(getAttStatus(ds, code)==='LossOfPay') continue;
    const late=Math.max(0, Math.round(+f.late||0)), ot=Math.max(0, Math.round(+f.ot||0));
    if(late || ot) out.push({date:ds, c:{late, ot, working:0}});
  }
  return out;
}

/* ---- Rendering ---- */
function attFilterRowHtml(shown, all){
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  const any=!!(attUnitFilter||attContractorFilter);
  return `<div class="teFiltRow">
    <span class="teFiltLbl">${ico('filter')} Filter</span>
    ${sel(attUnitFilter, 'attSetUnit', 'Unit', `<option value="" ${!attUnitFilter?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${attUnitFilter===u.code?'selected':''}>${attEsc(unitTabLabel(u))}</option>`).join(''))}
    ${sel(attContractorFilter, 'attSetContractor', 'Contractor', contractorFilterOptionsHtml(attContractorFilter))}
    <span class="teFiltCount">${shown===all?`${all} employees`:`<b>${shown}</b> of ${all} employees`}</span>
    ${any?`<button type="button" class="teFiltClear" onclick="attClearFilters()">${ico('filter-x')} Clear filters</button>`:''}
  </div>`;
}
function attPage(){ return 'attendance'; }
function attSetUnit(v){ attUnitFilter=v||''; render(attPage()); }
function attSetContractor(v){ attContractorFilter=v||''; render(attPage()); }
function attClearFilters(){ attUnitFilter=''; attContractorFilter=''; render(attPage()); }
function attSetMonth(v){ if(!v || v===attMonth) return; tmpCommitActive(); attMonth=v; render('attendance'); }
function attStepMonth(k){ attSetMonth(nextMonthKey(attMonth, k)); }
// Opens a month on Attendance (the Dashboard's and Payroll's links), optionally on one employee's row.
function openAttDay(date, code){ attMonth=monthKey(date); if(code) tmpOpenEmp(code); else { tmpTab='grid'; render('attendance'); } }
function attMonthBarHtml(){
  const thisM=monthKey(todayStr());
  return `<span class="teBarLbl">${ico('calendar-days')} Month</span>
    <button class="btn secondary teDwNav" title="Previous month" aria-label="Previous month" onclick="attStepMonth(-1)">‹</button>
    <input type="month" value="${attMonth}" onchange="attSetMonth(this.value)" aria-label="Month">
    <button class="btn secondary teDwNav" title="Next month" aria-label="Next month" onclick="attStepMonth(1)">›</button>
    ${attMonth!==thisM?`<button class="btn secondary" onclick="attSetMonth('${thisM}')">This month</button>`:''}`;
}

/* ---- Shared by the Attendance grid (10b-temp-attendance.js) ---- */
// Reads a typed OT: "1:30" (hours:minutes), "2" (hours) or "1.5" (hours) → minutes; null if unreadable.
function attParseOt(raw){
  const s=String(raw).trim();
  const hm=s.match(/^(\d{1,2}):(\d{1,2})$/);
  if(hm){ const m=+hm[2]; return m<60 ? (+hm[1])*60+m : null; }
  const n=Number(s); return isFinite(n) && n>=0 ? Math.round(n*60) : null;
}
// The employee's working days in the month: days on the roll, less Sundays, paid holidays (Holiday
// Calendar NOPH and the contractor's paid leave) and holidays without pay.
function attNowdParts(e, ym){
  const dim=daysInMonth(ym); let sun=0, hol=0, unpaid=0, off=0;
  for(let d=1; d<=dim; d++){
    const ds=dateStr(ym,d);
    if(!isEmpOnRollOn(e, ds)){ off++; continue; }
    if(isSunday(ym,d)){ sun++; continue; }
    const h=attHolidayFor(e, ds);
    if(h){ if(h.kind==='unpaid') unpaid++; else hol++; }
  }
  return {dim, sun, hol, unpaid, off, nowd:dim-off-sun-hol-unpaid};
}

// Opens one employee's row on Attendance (from the Month Summary).
function attOpenEmp(code){ tmpOpenEmp(code); }

/* ---- Month Summary tab: every employee's month by contractor, read-only ---- */
function attSummaryStatsHtml(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  const done=recs.filter(x=>!x.miss).length;
  return `<div class="teStatBox"><b>${recs.length}</b><span>Employees</span></div>
    <div class="teStatBox"><b>${computeWorkingDays(attMonth)}</b><span>Working days (NOWD)</span></div>
    <div class="teStatBox ${done<recs.length?'warn':''}"><b>${done}<small> / ${recs.length}</small></b><span>Entered</span></div>
    <div class="teStatBox"><b>${sum('lopMarked')}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${sum('halfDayCount')}</b><span>Half days</span></div>
    <div class="teStatBox"><b>${sum('otHours')}</b><span>OT hours</span></div>
    <div class="teStatBox"><b>${sum('lateMinutes')}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${sum('canteenTokens')}</b><span>Tokens</span></div>
    <div class="teStatBox"><b>${fmt(sum('netSalary'))}</b><span>Net pay</span></div>`;
}
function attSecSum(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  return [`LOP ${sum('lopMarked')}`, `Half ${sum('halfDayCount')}`, `OT ${sum('otHours')} h`, `${recs.filter(x=>!x.miss).length}/${recs.length} entered`].join(' · ');
}
function renderAttSummary(){
  const ym=attMonth, emps=attEmployees(), all=payrollEmployeesFor(ym).length;
  const recs=emps.map(e=>({e, r:computePayrollForEmployee(e, ym), miss:attMissingDays(e, ym)}));
  const groups=attGroups(emps), open=teOpenSecs.attGrid;
  let idx=0;
  const bodies=groups.map((g, gi)=>{
    const gr=recs.filter(x=>g.emps.includes(x.e)), folded=!open.has(g.key);
    const rows=gr.map(x=>`<tr class="attMRow attSumRow ${x.miss?'notEntered':''}" data-code="${attEsc(x.e.code)}" onclick="attOpenEmp(this.dataset.code)" title="Open ${attEsc(x.e.name)}'s row">
      <td class="num attSl">${++idx}</td><td>${attEsc(x.e.code)}</td><td class="attName">${attEsc(x.e.name)}</td>
      <td class="num">${payPresentDays(x.r)}</td><td class="num">${attN(x.r.lopMarked)||''}</td><td class="num">${attN(x.r.halfDayCount)||''}</td><td class="num attCalc">${attN(x.r.daysWorking)}</td>
      <td class="num">${attN(x.r.lateMinutes)||''}</td><td class="num">${+x.r.otHours?fmtHrsMin(x.r.otHours):''}</td><td class="num">${attN(x.r.canteenTokens)||''}</td>
      <td class="num attNet">${fmt(x.r.netSalary)}</td>
      <td>${x.miss?`<span class="teEwMissing">Not entered</span>`:`<span class="attOk">${ico('check')} Entered</span>`}</td>
    </tr>`).join('');
    return `<tbody class="teSec attSec ${folded?'folded':''} ${g.unset?'attUnset':''}" data-sec="${attEsc(g.key)}" style="--secTop:${gi};--secBot:${groups.length-1-gi}">
      <tr class="teGrpHead teDwShiftHead teSecHead"><td colspan="12">
        <button type="button" class="teDwFold" tabindex="-1" aria-expanded="${!folded}" title="${folded?'Click to expand this contractor':'Fold this contractor'}" onclick="teSecFold(this)">${ico('chevron-down')}<span class="teShiftBadge">${attEsc(g.name)}</span><span>${gr.length} employee${gr.length===1?'':'s'}</span><span class="attSecSum">${attSecSum(gr)}</span>${g.unset?'<span class="attUnsetTag">Edit these employees and choose their contractor</span>':''}<span class="teDwFoldNote">Click to expand</span></button></td></tr>
      ${rows}
    </tbody>`;
  }).join('');
  setTimeout(()=>{ teSetHeadHeight('attGrid'); teSecRefreshAll('attGrid'); teFitGridBox('attGrid'); }, 0);
  return `<div class="panel attPanel">
    <div class="teDwTop teBar"><div class="teDwGroup">${attMonthBarHtml()}</div></div>
    ${attFilterRowHtml(emps.length, all)}
    <p class="attNote">Every employee's ${attEsc(attMonthName(ym))} as Payroll counts it. <b>Click an employee</b> to go to their row. "Not entered" = nothing entered for the month yet (not paid until entered).</p>
    <div class="teStatRow" id="attStats">${attSummaryStatsHtml(recs)}</div>
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid attGrid" id="attGrid">
      <thead><tr>
        <th class="teDwSlTh"><button type="button" id="attGridFoldAll" class="teDwFoldAll" tabindex="-1" aria-expanded="true" title="Fold every contractor — only the bars stay" onclick="teSecFoldAll('attGrid')">${ico('chevron-down')}</button>Sl</th>
        <th>Code</th><th style="text-align:left;">Employee</th><th>Present</th><th>LOP</th><th>Half Day</th><th>Paid days</th><th>Late (min)</th><th title="OT paid (after Late beyond the free minutes), hours and minutes">OT paid</th><th>Tokens</th><th>Net pay</th><th>Status</th>
      </tr></thead>
      ${bodies || `<tbody><tr><td colspan="12"><div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></td></tr></tbody>`}
    </table></div>
  </div>`;
}

/* ---- Contractor Paid Leave tab: paid days off by date, for one contractor's employees ----
   Every date of the month is a row and every contractor a column: tick a contractor on a date (or
   All) and give the day a name. Sundays and Holiday Calendar days are off for everyone already.
   An Edit session like the Holiday Calendar: Attendance and Payroll use it only after Save. */
let attClvReason={}; // a name typed on a date before any contractor is ticked
function attClvCanEdit(){ return hasPerm('attendance','edit'); }
function attClvList(){ if(!Array.isArray(db.contractorLeaves)) db.contractorLeaves=[]; return db.contractorLeaves; }
function attClvNameFor(dt){ const h=attClvList().find(l=>l.date===dt && l.name); return h ? h.name : (attClvReason[dt]||''); }
function attClvSet(dt, con, on){
  const L=attClvList(), had=L.some(l=>l.date===dt && l.contractor===con);
  if(had===on) return true;
  if(had && !hasPerm('attendance','delete')){ alert('You do not have permission to remove a paid leave.'); return false; }
  const name=attClvNameFor(dt);
  db.contractorLeaves=L.filter(l=>!(l.date===dt && l.contractor===con));
  if(on) db.contractorLeaves.push({date:dt, contractor:con, name});
  db.contractorLeaves.sort((a,b)=>a.date.localeCompare(b.date) || String(a.contractor).localeCompare(String(b.contractor)));
  return true;
}
function attClvToggle(dt, con, on){
  if(!teEditActive('cleave')) return;
  attClvSet(dt, con, on);
  teEditTouch(); render(attPage());
}
function attClvAll(dt, on){
  if(!teEditActive('cleave')) return;
  getContractors().forEach(c=>attClvSet(dt, c.code, on));
  teEditTouch(); render(attPage());
}
function attClvName(dt, v){
  if(!teEditActive('cleave')) return;
  v=String(v||'').trim(); attClvReason[dt]=v;
  attClvList().forEach(l=>{ if(l.date===dt) l.name=v; });
  teEditTouch();
}
function renderAttConLeave(){
  const allowed=attClvCanEdit(), on=allowed && teEditActive('cleave');
  const ym=attMonth, cons=getContractors(), dates=attMonthDates(ym), emps=payrollEmployeesFor(ym);
  const L=(db.contractorLeaves||[]).filter(l=>String(l.date).startsWith(ym));
  const head=cons.map(c=>{ const n=L.filter(l=>l.contractor===c.code).length, k=emps.filter(e=>e.contractor===c.code).length;
    return `<th class="clvHead" title="${attEsc(c.name||c.code)}: ${k} employee${k===1?'':'s'} this month"><span>${attEsc(c.name||c.code)}</span><small>${n?`${n} day${n===1?'':'s'}`:'—'}</small></th>`; }).join('');
  const rows=dates.map(dt=>{
    const dow=attDow(dt), hol=attHoliday(dt), off=dow===0 || !!hol;
    const here=L.filter(l=>l.date===dt), reason=(here.find(l=>l.name)||{}).name || attClvReason[dt] || '';
    if(off) return `<tr class="${dow===0?'sun':'hol'}"><td class="attDate">${attShortDate(dt)}</td><td class="attDow">${ATT_DOW[dow]}</td>
      <td colspan="${cons.length+2}" class="clvOff">${dow===0?'Sunday':`${attEsc(hol.name)} · ${hol.kind==='paid'?'paid holiday for everyone':'holiday without pay'}`}</td></tr>`;
    const all=cons.length>0 && cons.every(c=>here.some(l=>l.contractor===c.code));
    return `<tr class="${here.length?'clvOn':''}"><td class="attDate">${attShortDate(dt)}</td><td class="attDow">${ATT_DOW[dow]}</td>
      ${cons.map(c=>{ const has=here.some(l=>l.contractor===c.code);
        return `<td class="clvCell ${has?'on':''}"><input type="checkbox" ${has?'checked':''} ${on?'':'disabled'} onchange="attClvToggle('${dt}','${attEsc(c.code)}',this.checked)" aria-label="Paid leave for ${attEsc(c.name||c.code)} on ${fmtDate(dt)}"></td>`; }).join('')}
      <td class="clvCell clvAll"><input type="checkbox" ${all?'checked':''} ${on?'':'disabled'} onchange="attClvAll('${dt}',this.checked)" aria-label="Paid leave for every contractor on ${fmtDate(dt)}"></td>
      <td><input class="clvReason" value="${attEsc(reason)}" ${on?'':'disabled'} placeholder="${on&&here.length?'Name, e.g. Diwali':''}" maxlength="40" onchange="attClvName('${dt}',this.value)" aria-label="Name of the paid leave on ${fmtDate(dt)}"></td>
    </tr>`;
  }).join('');
  const days=new Set(L.map(l=>l.date)).size;
  return `<div class="panel attPanel">
    <div class="teDwTop teBar"><div class="teDwGroup">${attMonthBarHtml()}</div></div>
    ${teEditBarHtml('cleave', allowed, 'Click Edit to set paid leave dates.', 'Editing — tick a contractor on a date (or All) and name the day, then Save. Attendance and Payroll use it only after Save.')}
    <p class="attNote">A ticked date is a <b>paid day off for every employee of that contractor</b>: paid like a paid holiday (counted with NOPH in Payroll, salary slips and reports), not a working day, and time worked on it is OT. ${days?`${days} date${days===1?'':'s'} in ${attEsc(attMonthName(ym))}.`:`No paid leave in ${attEsc(attMonthName(ym))} yet.`}</p>
    ${cons.length?`<div class="tableScrollWrap"><table class="teEwGrid clvGrid">
      <thead><tr><th>Date</th><th>Day</th>${head}<th class="clvHead"><span>All</span><small>contractors</small></th><th style="text-align:left;">Name</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`:`<div class="empty">No contractors yet — add them in Software Admin.</div>`}
    <p class="syncNote">Not counted for the contractor's service charge (the Contractors Bill counts Present days only), like paid holidays. Employees whose contractor is not set get no contractor paid leave.</p>
  </div>`;
}
