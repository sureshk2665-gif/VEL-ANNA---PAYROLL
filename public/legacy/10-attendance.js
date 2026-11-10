/* ================= ATTENDANCE — one employee at a time, every date of the month =================
   Made for entering a whole month quickly, employee by employee:
     1. pick the employee (type a code or name; ‹ › for the previous / next one);
     2. every date of the month is a row, like a sheet — Sundays and holidays are marked;
     3. tick days (Shift+click ticks a range), choose a shift (General, First, Second, + OT, + Extra
        OT) and click Fill: those days get the shift's In / Out times. A person on First and Second
        shift by turns: tick one set of days, fill First; tick the others, fill Second;
     4. tick days and click Mark LOP or Mark Half Day (Clear puts a day back to "Needs entry");
     5. change any In / Out time; Late (minutes) and OT (hours) are worked out from the times and the
        day's shift, and a figure typed in either box replaces the worked-out one for that day;
     6. canteen tokens and any one-off allowance / deduction for the month, then Save & next.
   Payroll, salary slips, reports, the Contractors Bill and the Dashboard all work from these days
   (getAttStatus, teMonthDays): Present = days with an In time, LOP / Half Day = days marked, Paid
   Days = Present + Half Days × ½ + NOPH. A working day up to today with nothing entered is not paid.
   Other tabs: Month Summary (every employee's month, by contractor, read-only — click a row to open
   that employee) and Holidays (the Holiday Calendar).
   Data: db.timeEntries / db.timeLeaves (13b-past-days.js), and db.payrollAdjustments[ym][code] for
   canteenTokens, otherAllowanceOneOff and otherDedOneOff. */
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

/* ---- One day's status ----
     1. a Holiday Calendar date counts as 'NOPH' for every employee;
     2. a mark made on the old daily Attendance screen;
     3. otherwise the day entered on this screen (In / Out times, LOP / Half Day) — timeEntryAttStatus(). */
function getAttStatus(date, code){
  const t=getHolidayType(date);
  if(t) return t;
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
function attMonthName(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}); }
// A month typed as month totals → entered day by day from now on (its totals are dropped).
function attMonthToDaily(ym){
  if(!attCanEdit()){ alert('You do not have permission to edit attendance.'); return; }
  if(typeof teEditActive==='function' && teEditActive()){ alert('Save or cancel the open edit first.'); return; }
  if(!confirm(`Enter ${attMonthName(ym)} day by day?\n\nThe LOP days, Half Days, Late minutes and OT hours typed as month totals are removed; `
    +`Payroll then counts the days entered here. Canteen tokens, allowances and deductions stay.`
    +(payrollGenerated(ym)?`\n\nPayroll for ${attMonthName(ym)} is already generated — it will show the new figures.`:''))) return;
  Object.values((db.payrollAdjustments||{})[ym]||{}).forEach(attDropTotals);
  db.monthlyAttMonths=(db.monthlyAttMonths||[]).filter(m=>m!==ym);
  saveDB(db);
  render('attendance');
}

/* ---- Screen state ---- */
let attMonth=monthKey(todayStr());
let attTab='entry';          // 'entry' (one employee's days) | 'summary' (every employee) | 'holidays'
let attUnitFilter='';        // '' = all units, or a unit code
let attContractorFilter='';  // '' = all, or a contractor code ('-' = not set)
let attEditMode=false;       // the days are locked until Edit (an Edit session — Save / Cancel)
let attEmp='';               // the employee shown
let attSel=new Set();        // the dates ticked for Fill / Mark
let attSelAnchor='';         // the date ticked last (Shift+click ticks everything between)
let attFillShift='general';  // the shift Fill uses
let attActNote='';           // what the last Fill / Mark did

function attCanEdit(){ return hasPerm('attendance','edit') || hasPerm('attendance','add'); }
function attEditable(){ return attCanEdit() && attEditMode && !attIsMonthly(attMonth); }
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
// Working days on the roll: not Sundays, NOPH or holidays without pay.
function attWorkDays(e, ym){
  let n=0; const dim=daysInMonth(ym);
  for(let d=1; d<=dim; d++){ const ds=dateStr(ym,d); if(!isSunday(ym,d) && isEmpOnRollOn(e, ds) && getHolidayType(ds)!=='NOPH' && !isUnpaidHolidayDate(ds)) n++; }
  return n;
}
// Working days on the roll up to today with nothing entered (not paid until they are).
function attMissingDays(e, ym){
  if(attIsMonthly(ym)) return 0;
  const today=todayStr(); let n=0;
  for(const dt of attMonthDates(ym)){
    if(dt>today) break;
    if(attDow(dt)===0 || attHoliday(dt) || !isEmpOnRollOn(e, dt)) continue;
    if(!getAttStatus(dt, e.code)) n++;
  }
  return n;
}
function attEntry(dt, code){ return db.timeEntries && db.timeEntries[dt] && db.timeEntries[dt][code] || null; }
function attHasTime(en, k){ return !!en && en[k+'H']!=='' && en[k+'H']!==undefined && en[k+'H']!==null; }
function attFmtTime(en, k){ return attHasTime(en,k) ? String(en[k+'H']).padStart(2,'0')+':'+String(en[k+'M']===''||en[k+'M']===undefined?0:en[k+'M']).padStart(2,'0')+' '+(en[k+'AP']||'AM') : ''; }
// Everything one row shows.
function attDay(e, dt){
  const code=e.code, entry=attEntry(dt, code), dow=attDow(dt), hol=attHoliday(dt), onRoll=isEmpOnRollOn(e, dt);
  const st=onRoll ? getAttStatus(dt, code) : '';
  const lop=st==='LossOfPay', half=st==='HalfDay';
  const hasIn=attHasTime(entry,'in'), hasOut=attHasTime(entry,'out');
  const off=dow===0 || !!hol;
  const c=onRoll && hasIn && !lop ? teDayFigures(entry, dt, code, half) : null;
  return {dt, dow, hol, onRoll, st, lop, half, entry, hasIn, hasOut, off, c,
    missing: onRoll && !off && !st && dt<=todayStr(), future: dt>todayStr()};
}

/* ---- Rendering ---- */
function renderAttendance(){
  const tab=(k, icon, label)=>`<div class="teTab ${attTab===k?'active':''}" role="tab" onclick="attSetTab('${k}')">${ico(icon)} ${label}</div>`;
  const tabs=`<div class="teTabs attPageTabs" role="tablist">${tab('entry','user','Employee Attendance')}${tab('summary','clipboard','Month Summary')}${tab('holidays','calendar','Holidays')}</div>`;
  if(attTab==='holidays'){ teHostPage='attendance'; return tabs+renderTEHolidayTab(); }
  return tabs+(attTab==='summary' ? renderAttSummary() : renderAttEntry());
}
function attSetTab(t){
  if(t===attTab) return;
  if(typeof teEditConfirmLeave==='function' && !teEditConfirmLeave()) return;
  attTab=t; render('attendance');
}
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
function attSetUnit(v){ attUnitFilter=v||''; render('attendance'); }
function attSetContractor(v){ attContractorFilter=v||''; render('attendance'); }
function attClearFilters(){ attUnitFilter=''; attContractorFilter=''; render('attendance'); }
function attSetMonth(v){ if(!v || v===attMonth) return; attCommitActive(); attMonth=v; attSel.clear(); attActNote=''; render('attendance'); }
function attStepMonth(k){ attSetMonth(nextMonthKey(attMonth, k)); }
// Opens a date's month (the Dashboard's links), optionally on one employee.
function openAttDay(date, code){ attTab='entry'; attMonth=monthKey(date); if(code) attEmp=code; attSel.clear(); render('attendance'); }
function attMonthBarHtml(){
  const thisM=monthKey(todayStr());
  return `<span class="teBarLbl">${ico('calendar-days')} Month</span>
    <button class="btn secondary teDwNav" title="Previous month" aria-label="Previous month" onclick="attStepMonth(-1)">‹</button>
    <input type="month" value="${attMonth}" onchange="attSetMonth(this.value)" aria-label="Month">
    <button class="btn secondary teDwNav" title="Next month" aria-label="Next month" onclick="attStepMonth(1)">›</button>
    ${attMonth!==thisM?`<button class="btn secondary" onclick="attSetMonth('${thisM}')">This month</button>`:''}`;
}
function attEditButtonsHtml(withNext){
  if(!attCanEdit() || attIsMonthly(attMonth)) return '';
  return attEditMode
    ? `<button class="btn secondary" onclick="attCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn ${withNext?'secondary':''}" onclick="attSave()">${ico('save')} Save</button>${withNext?`<button class="btn" onclick="attSaveNext()" title="Save, then open the next employee">${ico('save')} Save &amp; next ›</button>`:''}`
    : `<button class="btn btnEditAtt" onclick="attEdit()">${ico('pencil')} Edit</button>`;
}

/* ---- Employee Attendance tab ---- */
function attStatusHtml(x){
  if(!x.onRoll) return `<span class="teEwMuted">Not on roll</span>`;
  const worked=x.hasIn ? ` <small>· worked (OT)</small>` : '';
  if(x.st==='NOPH') return `<span class="tag NOPH">${attEsc(x.hol?x.hol.name:'Paid holiday')} <small>· paid</small>${worked}</span>`;
  if(x.lop) return `<span class="tag LossOfPay">LOP</span>`;
  if(x.half) return `<span class="tag HalfDay">Half Day</span>`;
  if(x.dow===0) return `<span class="attOffTag">Sunday${worked}</span>`;
  if(x.hol) return `<span class="tag teEwHolTag">${attEsc(x.hol.name)} <small>· no pay</small>${worked}</span>`;
  if(x.hasIn) return x.hasOut ? `<span class="tag Present">Present</span>` : `<span class="tag HalfDay" title="Type the Out time">Out time missing</span>`;
  if(x.st==='Present') return `<span class="tag Present">Present</span>`;
  if(x.future) return `<span class="teEwMuted">–</span>`;
  return `<span class="teEwMissing">Needs entry</span>`;
}
function attShiftText(x){
  const own=x.entry && x.entry.shift ? teShiftByKey(x.entry.shift) : null;
  if(own) return attEsc(own.label.replace(' Shift',''));
  return x.c && x.c.shift ? `<span class="teEwMuted" title="Shift worked out from the In time">${attEsc(x.c.shift.name.replace(' Shift',''))}</span>` : '<span class="teEwMuted">–</span>';
}
function attFigVal(x, k){
  if(!x.c) return '';
  if(k==='late') return x.c.lateTyped || x.c.late ? String(Math.round(x.c.late)) : '';
  return x.c.otTyped || x.c.ot ? String(attN(x.c.ot/60)) : '';
}
function attRowHtml(e, x, i, editable){
  const dis=!editable || !x.onRoll || x.lop;
  const time=(k, c)=>`<td class="${k==='in'?'teEwInCell':'teEwOutCell'}"><input class="teEwTime ${k} attT" data-r="${i}" data-c="${c}" data-k="${k}" value="${attFmtTime(x.entry,k)}" ${dis?'disabled':''}
      placeholder="${editable&&!dis?'hh:mm':''}" autocomplete="off" spellcheck="false" aria-label="${k==='in'?'In':'Out'} time ${fmtDate(x.dt)}"
      onfocus="this.select()" onkeydown="attKey(event,this)" onblur="attCommit(this)"></td>`;
  const fig=(k, c)=>{ const typed=x.c && (k==='late'?x.c.lateTyped:x.c.otTyped);
    return `<td><input class="attIn attFig ${typed?'typed':''}" data-r="${i}" data-c="${c}" data-k="${k}" value="${attFigVal(x,k)}" ${dis||!x.c?'disabled':''}
      placeholder="${x.c&&!dis?'0':''}" inputmode="decimal" autocomplete="off" spellcheck="false"
      title="${k==='late'?'Late minutes this day':'OT hours this day'} — worked out from the times${typed?'; typed for this day (clear the box to work it out again)':'; type a figure to change it'}"
      aria-label="${k==='late'?'Late minutes':'OT hours'} ${fmtDate(x.dt)}" onfocus="this.select()" onkeydown="attKey(event,this)" onblur="attCommit(this)"></td>`; };
  const sel=attSel.has(x.dt);
  const cls=['attDRow', x.dow===0?'sun':'', x.hol?'hol':'', x.lop?'onLeave':'', x.missing?'missing':'', sel?'sel':'', x.dt===todayStr()?'today':''].filter(Boolean).join(' ');
  return `<tr class="${cls}" data-r="${i}" data-dt="${x.dt}">
    <td class="attChk"><input type="checkbox" tabindex="-1" ${sel?'checked':''} ${editable&&x.onRoll?'':'disabled'} onclick="attTick(event,'${x.dt}')" aria-label="Tick ${fmtDate(x.dt)}"></td>
    <td class="attDate" onclick="attTickDate(event,'${x.dt}')" title="${fmtDate(x.dt)}">${attShortDate(x.dt)}</td><td class="attDow">${ATT_DOW[x.dow]}</td>
    <td class="attSt" data-k="status">${attStatusHtml(x)}</td>
    <td data-k="shift">${attShiftText(x)}</td>
    ${time('in',0)}${time('out',1)}${fig('late',2)}${fig('ot',3)}
  </tr>`;
}
// The month for the employee as Payroll counts it.
function attEmpStatsHtml(e, r, missing){
  return `<div class="teStatBox"><b>${payPresentDays(r)}</b><span>Present days</span></div>
    <div class="teStatBox"><b>${attN(r.lopMarked)}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${attN(r.halfDayCount)}</b><span>Half days</span></div>
    <div class="teStatBox ${missing?'warn':''}"><b>${missing}</b><span>Days to enter</span></div>
    <div class="teStatBox"><b>${attN(r.lateMinutes)}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${attN(r.otHours)}</b><span>OT hours</span></div>
    <div class="teStatBox"><b>${attN(r.daysWorking)}</b><span>Paid days</span></div>
    <div class="teStatBox"><b>${fmt(r.netSalary)}</b><span>Net pay</span></div>`;
}
const ATT_MONTH_BOXES=[
  {k:'canteenTokens', h:'Canteen tokens', title:'Canteen tokens bought this month — deducted at the token price of the employee\'s unit', whole:true},
  {k:'otherAllowanceOneOff', h:'Allowance ₹', title:'One-off allowance this month (added to Total Earnings)', whole:false},
  {k:'otherDedOneOff', h:'Deduction ₹', title:'One-off deduction this month', whole:false}
];
function attMonthBoxesHtml(e, r, editable){
  const val=k=>{ const v=k==='canteenTokens' ? r.canteenTokens : k==='otherAllowanceOneOff' ? r.otherAllowance : r.otherDed; return +v ? attN(v) : ''; };
  return ATT_MONTH_BOXES.map((b,i)=>`<label class="attMBox" title="${attEsc(b.title)}"><span>${b.h}</span>
    <input class="attIn" data-mk="${b.k}" value="${val(b.k)}" ${editable?'':'disabled'} placeholder="0" inputmode="decimal" autocomplete="off" onfocus="this.select()" onchange="attMonthBox(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></label>`).join('');
}
function attActionBarHtml(){
  const presets=teShiftPresets(); if(!presets.some(p=>p.key===attFillShift)) attFillShift=(presets[0]||{}).key||'';
  const n=attSel.size;
  return `<div class="attActBar">
    <div class="attActRow">
      <span class="attSelInfo" id="attSelInfo">${n?`<b>${n}</b> day${n===1?'':'s'} ticked`:'Tick days'}</span>
      <button type="button" class="btn secondary" onclick="attTickWorking()" title="Tick every working day of the month (not Sundays or holidays)">${ico('check')} Working days</button>
      <button type="button" class="btn secondary" onclick="attTickNone()">Untick</button>
      <span class="attActSep"></span>
      <select id="attFillShift" onchange="attFillShift=this.value" aria-label="Shift to fill">${presets.map(p=>`<option value="${attEsc(p.key)}" ${p.key===attFillShift?'selected':''}>${attEsc(p.label)} · ${teMinLabel(p.inMin)} – ${teMinLabel(p.outMin)}</option>`).join('')}</select>
      <button type="button" class="btn" onclick="attFill()" title="Put this shift's In / Out times on the ticked days">${ico('zap')} Fill</button>
      <span class="attActSep"></span>
      <button type="button" class="btn attLopBtn" onclick="attMark('Loss of Pay')">Mark LOP</button>
      <button type="button" class="btn secondary" onclick="attMark('Half Day')">Mark Half Day</button>
      <button type="button" class="btn secondary" onclick="attMark('')" title="Remove times and LOP / Half Day from the ticked days">${ico('x')} Clear</button>
    </div>
    <p class="attActNote ${attActNote?'ok':''}" id="attActNote">${attActNote?attEsc(attActNote):'Tick days (Shift+click ticks a range), then Fill with a shift, or Mark LOP / Half Day. Change any time in the boxes; Late and OT are worked out — type in them to change a day\'s figure.'}</p>
  </div>`;
}
function renderAttEntry(){
  const ym=attMonth, monthly=attIsMonthly(ym), emps=attEmployees(), all=payrollEmployeesFor(ym).length;
  if(!emps.some(e=>e.code===attEmp)) attEmp=emps.length ? emps[0].code : '';
  const e=emps.find(x=>x.code===attEmp), editable=attEditable();
  const top=`<div class="teDwTop teBar attTop">
      <div class="teDwGroup">
        <button class="btn secondary teDwNav" title="Previous employee" aria-label="Previous employee" onclick="attStepEmp(-1)">‹</button>
        ${attEpHtml(emps, e)}
        <button class="btn secondary teDwNav" title="Next employee" aria-label="Next employee" onclick="attStepEmp(1)">›</button>
        <span class="teBarSep"></span>
        ${attMonthBarHtml()}
      </div>
      <div class="teDwGroup">
        <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
        ${e?attEditButtonsHtml(true):''}
      </div>
    </div>
    ${attFilterRowHtml(emps.length, all)}`;
  if(!e) return `<div class="panel attPanel">${top}<div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></div>`;
  const r=computePayrollForEmployee(e, ym), missing=attMissingDays(e, ym);
  const head=`<div class="attEmpCard">
      <div class="attEmpName"><b>${attEsc(e.name)}</b> <span>${attEsc(e.code)}</span></div>
      <div class="attEmpMeta">${contractorName(e)?attEsc(contractorName(e)):'<span class="empNoCon">Contractor not set</span>'} · ${attEsc(unitLabel(e.unit))}${e.designation?' · '+attEsc(e.designation):''} · Daily wage ${fmt(r.dailyWage)}</div>
    </div>`;
  if(monthly){
    const a=adjFor(ym, e.code);
    return `<div class="panel attPanel">${top}${head}
      <p class="attNote attNoteOld"><b>${attEsc(attMonthName(ym))}</b> was entered as month totals: LOP ${attN(a.lopDays)} · Half Days ${attN(a.halfDays)} · Late ${attN(a.lateMinutes)} min · OT ${attN(a.otHours)} h. Payroll uses these figures.
        ${attCanEdit()?`<button type="button" class="btn secondary attSwitchBtn" onclick="attMonthToDaily('${ym}')">Enter ${attEsc(attMonthName(ym))} day by day instead</button>`:''}</p>
      <div class="teStatRow" id="attStats">${attEmpStatsHtml(e, r, 0)}</div>
    </div>`;
  }
  const days=attMonthDates(ym).map(dt=>attDay(e, dt));
  setTimeout(()=>{ teFitGridBox('attDayGrid'); }, 0);
  return `<div class="panel attPanel">${top}${head}
    <div class="teStatRow" id="attStats">${attEmpStatsHtml(e, r, missing)}</div>
    <div class="attMBoxes">${attMonthBoxesHtml(e, r, editable)}
      ${!attCanEdit()?'':editable?'':`<span class="attLockNote">${ico('pencil')} Click <b>Edit</b> to enter ${attEsc(e.name)}'s attendance.</span>`}</div>
    ${editable?attActionBarHtml():''}
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid attDayGrid" id="attDayGrid" data-emp="${attEsc(e.code)}">
      <thead><tr>
        <th class="attChk"><input type="checkbox" tabindex="-1" ${editable?'':'disabled'} ${attSel.size&&days.filter(x=>x.onRoll&&!x.off).every(x=>attSel.has(x.dt))?'checked':''} onclick="this.checked?attTickWorking():attTickNone()" title="Tick every working day" aria-label="Tick every working day"></th>
        <th>Date</th><th>Day</th><th>Status</th><th>Shift</th>
        <th class="teEwInHead">In time</th><th class="teEwOutHead">Out time</th><th title="Minutes late in + minutes left early">Late (min)</th><th title="Time after the shift end (whole time on Sundays and holidays)">OT (hrs)</th>
      </tr></thead>
      <tbody>${days.map((x,i)=>attRowHtml(e, x, i, editable)).join('')}</tbody>
      <tfoot><tr id="attDayFoot">${attFootHtml(r, missing)}</tr></tfoot>
    </table></div>
    <p class="syncNote">A working day up to today with nothing entered is not paid — every such day shows <b>Needs entry</b>. Late = minutes after the shift start + minutes left before the shift end; OT = time after the shift end (shift start + 8 hours + 30-minute break); on Sundays and holidays the whole time worked is OT. Half Days are paid ½ and have no Late. Payroll, salary slips, reports, the Contractors Bill and the Dashboard all use these days.</p>
  </div>`;
}
function attFootHtml(r, missing){
  return `<td colspan="5" class="attFootLbl">Month: ${payPresentDays(r)} present · ${attN(r.lopMarked)} LOP · ${attN(r.halfDayCount)} half day${missing?` · <span class="teEwMissing">${missing} to enter</span>`:''}</td>
    <td colspan="2"></td><td>${attN(r.lateMinutes)}</td><td>${attN(r.otHours)}</td>`;
}

/* ---- Ticking days ---- */
function attCurEmp(){ return (db.employees||[]).find(x=>x.code===attEmp) || null; }
function attSelRefresh(){
  document.querySelectorAll('#attDayGrid tr.attDRow').forEach(tr=>{
    const on=attSel.has(tr.dataset.dt); tr.classList.toggle('sel', on);
    const cb=tr.querySelector('td.attChk input'); if(cb) cb.checked=on;
  });
  const n=attSel.size, el=document.getElementById('attSelInfo');
  if(el) el.innerHTML=n?`<b>${n}</b> day${n===1?'':'s'} ticked`:'Tick days';
}
// Click ticks / unticks a day; Shift+click does the same to every day from the one ticked last.
function attTick(ev, dt){
  if(!attEditable()){ ev.preventDefault(); return; }
  const e=attCurEmp(), on=!attSel.has(dt);
  const dates=attMonthDates(attMonth).filter(d=>!e || isEmpOnRollOn(e, d));
  if(ev.shiftKey && attSelAnchor && dates.includes(attSelAnchor)){
    const a=dates.indexOf(attSelAnchor), b=dates.indexOf(dt);
    dates.slice(Math.min(a,b), Math.max(a,b)+1).forEach(d=>{ if(on) attSel.add(d); else attSel.delete(d); });
  } else if(on) attSel.add(dt); else attSel.delete(dt);
  attSelAnchor=dt;
  attSelRefresh();
}
function attTickDate(ev, dt){ if(attEditable()) attTick(ev, dt); }
function attTickWorking(){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  attSel=new Set(attMonthDates(attMonth).filter(dt=>isEmpOnRollOn(e, dt) && attDow(dt)!==0 && !attHoliday(dt)));
  attSelAnchor=''; attSelRefresh();
}
function attTickNone(){ attSel.clear(); attSelAnchor=''; attSelRefresh(); }

/* ---- Writing a day (db.timeEntries / db.timeLeaves) ---- */
function attEnsureEntry(dt, code){
  if(!db.timeEntries) db.timeEntries={};
  if(!db.timeEntries[dt]) db.timeEntries[dt]={};
  if(!db.timeEntries[dt][code]) db.timeEntries[dt][code]={inH:'',inM:'',inAP:'AM',outH:'',outM:'',outAP:'PM'};
  return db.timeEntries[dt][code];
}
// A mark from the old daily Attendance screen would hide what is entered here: it goes.
function attClearOldMark(dt, code){ if(db.attendance && db.attendance[dt] && db.attendance[dt][code]!==undefined) delete db.attendance[dt][code]; }
function attSetTime(en, k, v){ // v = {h,m,ap} or null
  if(v){ en[k+'H']=String(v.h); en[k+'M']=String(v.m); en[k+'AP']=v.ap; }
  else { en[k+'H']=''; en[k+'M']=''; en[k+'AP']=k==='in'?'AM':'PM'; }
}
function attSetLeave(dt, code, type){ // 'Loss of Pay' | 'Half Day' | '' (none)
  if(!Array.isArray(db.timeLeaves)) db.timeLeaves=[];
  const old=teGetLeave(dt, code);
  db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===dt && l.empCode===code));
  if(type) db.timeLeaves.push({date:dt, empCode:code, type, remarks:old && old.remarks || ''});
}
// The ticked days for an action: working days on the roll, or — when only Sundays / holidays are
// ticked — those (someone who worked on them).
function attActionDays(e, allowOff){
  const days=[...attSel].sort().map(dt=>attDay(e, dt)).filter(x=>x.onRoll);
  const work=days.filter(x=>!x.off), off=days.filter(x=>x.off);
  return allowOff && !work.length ? {use:off, skipped:0} : {use:work, skipped:off.length};
}
function attDone(note){
  attSel.clear(); attSelAnchor=''; attActNote=note;
  teEditTouch(); render('attendance');
}
function attFill(){
  if(!attEditable()) return;
  const e=attCurEmp(), p=teShiftByKey(attFillShift);
  if(!e) return; if(!p){ alert('Choose a shift.'); return; }
  if(!attSel.size){ alert('Tick the days to fill first (Shift+click ticks a range, or use Working days).'); return; }
  const {use, skipped}=attActionDays(e, true);
  let n=0, kept=0;
  use.forEach(x=>{
    if(x.lop || x.half){ kept++; return; }
    const en=attEnsureEntry(x.dt, e.code);
    attSetTime(en, 'in', teMinToHMAP(p.inMin)); attSetTime(en, 'out', teMinToHMAP(p.outMin));
    en.shift=p.key; delete en.lateOv; delete en.otOv;
    attClearOldMark(x.dt, e.code); n++;
  });
  attDone([`${n} day${n===1?'':'s'} filled with ${p.label} (${teMinLabel(p.inMin)} – ${teMinLabel(p.outMin)})`,
    kept?`${kept} LOP / Half Day kept (Clear them first to fill)`:'', skipped?`${skipped} Sunday / holiday skipped`:''].filter(Boolean).join(' · ')+'.');
}
function attMark(type){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  if(!attSel.size){ alert('Tick the days first.'); return; }
  const {use, skipped}=attActionDays(e, !type);
  use.forEach(x=>{
    attClearOldMark(x.dt, e.code);
    attSetLeave(x.dt, e.code, type);
    const en=attEntry(x.dt, e.code);
    if(en && type!=='Half Day'){ attSetTime(en,'in',null); attSetTime(en,'out',null); delete en.shift; delete en.lateOv; delete en.otOv; }
  });
  const what=type==='Loss of Pay'?'marked LOP':type==='Half Day'?'marked Half Day':'cleared';
  attDone([`${use.length} day${use.length===1?'':'s'} ${what}`, skipped?`${skipped} Sunday / holiday skipped`:''].filter(Boolean).join(' · ')+'.');
}
function attMonthBox(inp){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  const b=ATT_MONTH_BOXES.find(x=>x.k===inp.dataset.mk);
  const p=attParseNum(inp.value, b.whole);
  if(p.bad){ inp.classList.add('bad'); inp.title='Enter a number (0 or more)'; return; }
  inp.classList.remove('bad'); inp.title=b.title;
  const a=getAdj(attMonth, e.code);
  if(p.v===null) delete a[b.k]; else a[b.k]=p.v;
  teEditTouch(); attRefreshTotals();
}
function attParseNum(raw, whole){
  const s=String(raw==null?'':raw).trim().replace(/,/g,'');
  if(s==='') return {v:null};
  const n=Number(s);
  if(!isFinite(n) || n<0) return {bad:true};
  return {v: whole ? Math.round(n) : Math.round(n*100)/100};
}

/* ---- Edit / Save (an Edit session: nothing reaches the database or Payroll until Save) ---- */
function attEdit(){
  if(!attCanEdit()){ alert('You do not have permission to edit attendance.'); return; }
  if(attIsMonthly(attMonth)) return;
  if(!teEditBegin('attendance')){ alert('Save or cancel the other edit first.'); return; }
  attEditMode=true; attActNote=''; render('attendance');
}
function attSave(){ attCommitActive(); teEditSave(); attEditMode=false; attSel.clear(); attActNote=''; render('attendance'); }
function attCancel(){ attSel.clear(); attActNote=''; teEditCancel('attendance'); }
// Save, then the next employee — still in Edit.
function attSaveNext(){
  attCommitActive(); teEditSave();
  const emps=attEmployees(), i=emps.findIndex(e=>e.code===attEmp);
  if(i>=0 && i<emps.length-1) attEmp=emps[i+1].code;
  attSel.clear(); attSelAnchor=''; attActNote='';
  attEditMode=teEditBegin('attendance');
  render('attendance');
  if(i>=emps.length-1) setTimeout(()=>alert('Saved. That was the last employee in the list.'), 0);
}

/* ---- Typing a time, or a day's Late / OT ----
   Times: 9, 930, 0930, 9:30, 9.30, 1730, 17:30, 9:30a, 5:30 pm … An explicit a/p (or a 24-hour
   value) always wins; otherwise In is read next to the day's shift (or the employee's last In time)
   and Out as the reading that gives a sensible length after the In time. "=" copies the box above. */
function attParseTime(raw){
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
function attResolveAP(p, kind, refMin, halfDay){
  const cands=['AM','PM'].map(ap=>({ap,min:teTimeToMinutes(p.h,p.m,ap)}));
  if(kind==='in'){
    if(refMin===null||refMin===undefined) return (p.h>=6&&p.h<=11)?'AM':'PM';
    const dist=x=>{ const d=Math.abs(x-refMin); return Math.min(d,1440-d); };
    return dist(cands[0].min)<=dist(cands[1].min)?'AM':'PM';
  }
  if(refMin===null||refMin===undefined) return 'PM';
  const target=halfDay?270:510, lo=halfDay?60:270, hi=1260;
  const scored=cands.map(c=>({ap:c.ap, d:(c.min-refMin+1440)%1440}));
  let pool=scored.filter(c=>c.d>=lo&&c.d<=hi); if(!pool.length) pool=scored;
  pool.sort((a,b)=>Math.abs(a.d-target)-Math.abs(b.d-target));
  return pool[0].ap;
}
// The In time to read a typed In against: the day's shift, else the employee's last In time.
function attInRef(code, dt, en){
  const own=en && en.shift ? teShiftByKey(en.shift) : null; if(own) return own.inMin;
  for(let k=1;k<=14;k++){
    const d=teEwShiftDate(dt,-k), x=attEntry(d, code);
    if(attHasTime(x,'in')){ const v=teTimeToMinutes(x.inH,x.inM,x.inAP); if(v!==null) return v; }
  }
  return null;
}
// Commits one box. false = it could not be read (the box stays, marked).
function attCommit(inp){
  if(!inp || !inp.isConnected || inp.disabled || !attEditable()) return true;
  const grid=inp.closest('#attDayGrid'); if(!grid || grid.dataset.emp!==attEmp) return true;
  const e=attCurEmp(); if(!e) return true;
  const tr=inp.closest('tr'), dt=tr.dataset.dt, k=inp.dataset.k, x=attDay(e, dt);
  const raw=inp.value.trim();
  if(k==='in' || k==='out'){
    const stored=attFmtTime(x.entry, k);
    if(raw===stored){ inp.classList.remove('bad'); return true; }
    let v=null;
    if(raw==='='||raw==='"'){
      for(let p=tr.previousElementSibling; p; p=p.previousElementSibling){
        const pe=attEntry(p.dataset.dt, e.code); if(attHasTime(pe,k)){ v={h:+pe[k+'H'], m:+pe[k+'M']||0, ap:pe[k+'AP']}; break; }
      }
      if(!v){ inp.classList.add('bad'); inp.title='Nothing above to copy.'; return false; }
    } else if(raw!==''){
      const p=attParseTime(raw);
      if(!p){ inp.classList.add('bad'); inp.title='Could not read this time. Try 930, 9:30, 5:30p or 17:30.'; return false; }
      if(!p.ap){
        const ref = k==='in' ? attInRef(e.code, dt, x.entry) : (x.hasIn ? teTimeToMinutes(x.entry.inH,x.entry.inM,x.entry.inAP) : null);
        p.ap=attResolveAP(p, k, ref, x.half);
      }
      v=p;
    }
    if(!v && !stored){ inp.value=''; return true; }
    const en=attEnsureEntry(dt, e.code);
    attSetTime(en, k, v);
    delete en.lateOv; delete en.otOv; // worked out again from the new times
    if(!attHasTime(en,'in') && !attHasTime(en,'out')) delete en.shift;
    attClearOldMark(dt, e.code);
  } else {
    const shown=attFigVal(x, k);
    if(raw===shown){ inp.classList.remove('bad'); return true; }
    const en=x.entry; if(!en || !x.c) return true;
    const key=k==='late'?'lateOv':'otOv';
    if(raw===''){ delete en[key]; }
    else {
      const n=Number(raw.replace(/,/g,''));
      if(!isFinite(n) || n<0){ inp.classList.add('bad'); inp.title='Enter a number (0 or more)'; return false; }
      const min = k==='late' ? Math.round(n) : Math.round(n*60);
      const calc = k==='late' ? (x.c.calcLate!==undefined ? x.c.calcLate : x.c.late) : (x.c.calcOt!==undefined ? x.c.calcOt : x.c.ot);
      if(min===Math.round(calc)) delete en[key]; else en[key]=min;
    }
  }
  inp.classList.remove('bad');
  teEditTouch();
  attUpdateRow(+tr.dataset.r);
  attRefreshTotals();
  return true;
}
// Commits the box being typed in (before Save, a month / employee change …).
function attCommitActive(){ const a=document.activeElement; if(a && a.closest && a.closest('#attDayGrid') && a.tagName==='INPUT' && a.type!=='checkbox') attCommit(a); }
// Redraws one row in place (its boxes stay, so the cursor is never lost).
function attUpdateRow(r){
  const tr=document.querySelector(`#attDayGrid tr.attDRow[data-r="${r}"]`), e=attCurEmp(); if(!tr || !e) return;
  const tmp=document.createElement('tbody'); tmp.innerHTML=attRowHtml(e, attDay(e, tr.dataset.dt), r, attEditable());
  const nr=tmp.firstElementChild;
  tr.className=nr.className;
  ['status','shift'].forEach(k=>{ tr.querySelector(`[data-k="${k}"]`).innerHTML=nr.querySelector(`[data-k="${k}"]`).innerHTML; });
  tr.querySelectorAll('input[data-c]').forEach(inp=>{
    const n=nr.querySelector(`input[data-c="${inp.dataset.c}"]`); if(!n) return;
    inp.value=n.value; inp.disabled=n.disabled; inp.placeholder=n.placeholder; inp.title=n.title; inp.className=n.className;
  });
}
function attRefreshTotals(){
  const e=attCurEmp(); if(!e) return;
  const r=computePayrollForEmployee(e, attMonth), missing=attMissingDays(e, attMonth);
  const st=document.getElementById('attStats'); if(st) st.innerHTML=attEmpStatsHtml(e, r, missing);
  const f=document.getElementById('attDayFoot'); if(f) f.innerHTML=attFootHtml(r, missing);
}
// Keyboard: Enter / ↓ next day, ↑ back, ← → between the boxes (at the edge of the text).
function attCell(r, c){ return document.querySelector(`#attDayGrid input[data-r="${r}"][data-c="${c}"]`); }
function attKey(ev, inp){
  const r=+inp.dataset.r, c=+inp.dataset.c;
  if(ev.key==='Escape'){ const e=attCurEmp(); if(e){ const x=attDay(e, inp.closest('tr').dataset.dt); inp.value=inp.dataset.k==='in'||inp.dataset.k==='out'?attFmtTime(x.entry, inp.dataset.k):attFigVal(x, inp.dataset.k); inp.classList.remove('bad'); inp.select(); } return; }
  if((ev.ctrlKey||ev.metaKey) && (ev.key==='d'||ev.key==='D') && (inp.dataset.k==='in'||inp.dataset.k==='out')){ ev.preventDefault(); inp.value='='; if(attCommit(inp)) attMove(r, c, 1, 0); return; }
  let dr=0, dc=0;
  if(ev.key==='Enter') dr=ev.shiftKey?-1:1;
  else if(ev.key==='ArrowDown') dr=1;
  else if(ev.key==='ArrowUp') dr=-1;
  else if(ev.key==='ArrowRight' && inp.selectionEnd===inp.value.length) dc=1;
  else if(ev.key==='ArrowLeft' && inp.selectionStart===0) dc=-1;
  else if(ev.key==='Tab') dc=ev.shiftKey?-1:1;
  else return;
  ev.preventDefault();
  if(!attCommit(inp)) return;
  attMove(r, c, dr, dc);
}
function attMove(r, c, dr, dc){
  const n=document.querySelectorAll('#attDayGrid tr.attDRow').length;
  if(dc){
    for(let cc=c+dc; cc>=0 && cc<=3; cc+=dc){ const el=attCell(r, cc); if(el && !el.disabled){ el.focus(); return; } }
    // past the last box of a day: the first box of the next day (and back)
    for(let rr=r+dc; rr>=0 && rr<n; rr+=dc){ for(let k=0;k<=3;k++){ const el=attCell(rr, dc>0?k:3-k); if(el && !el.disabled){ el.focus(); el.scrollIntoView({block:'nearest'}); return; } } }
    return;
  }
  for(let rr=r+dr; rr>=0 && rr<n; rr+=dr){ const el=attCell(rr, c); if(el && !el.disabled){ el.focus(); el.scrollIntoView({block:'nearest'}); return; } }
}

/* ---- Employee picker: a button showing the employee. Click it (or start typing on it) and the list
   opens with an empty search box — type a code or name, ↑ ↓ and Enter, or click a name. Each name
   shows the contractor and how many days still need entry. ---- */
function attEpEls(){ return {btn:document.getElementById('teEpBtn'), pop:document.getElementById('teEpPop'), inp:document.getElementById('teEpFind')}; }
function attEpOpts(){ return [...document.querySelectorAll('#teEpList .teEpOpt')]; }
function attEpOpen(text){
  const el=attEpEls(); if(!el.pop) return;
  el.pop.hidden=false; el.btn.setAttribute('aria-expanded','true');
  el.inp.value=text||''; attEpFilter(el.inp.value);
  el.inp.focus();
  document.addEventListener('mousedown', attEpOutside, true);
}
function attEpClose(focusBtn){
  const el=attEpEls(); document.removeEventListener('mousedown', attEpOutside, true);
  if(!el.pop || el.pop.hidden) return;
  el.pop.hidden=true; el.btn.setAttribute('aria-expanded','false');
  if(focusBtn) el.btn.focus();
}
function attEpOutside(ev){ const w=document.getElementById('teEmpPick'); if(!w || !w.contains(ev.target)) attEpClose(false); }
function attEpToggle(){ const el=attEpEls(); if(el.pop && el.pop.hidden) attEpOpen(); else attEpClose(true); }
function attEpBtnKey(ev){
  if(ev.key==='ArrowDown'){ ev.preventDefault(); attEpOpen(); return; }
  if(ev.key.length===1 && ev.key!==' ' && !ev.ctrlKey && !ev.metaKey && !ev.altKey){ ev.preventDefault(); attEpOpen(ev.key); }
}
function attEpSetActive(o){
  attEpOpts().forEach(x=>{ x.classList.toggle('active', x===o); x.setAttribute('aria-selected', x===o?'true':'false'); });
  const inp=document.getElementById('teEpFind');
  if(o){ o.scrollIntoView({block:'nearest'}); if(inp) inp.setAttribute('aria-activedescendant', o.id); }
}
// Just a number ("12") finds EMP012 first.
function attEpFilter(v){
  const q=String(v||'').trim().toLowerCase(), opts=attEpOpts();
  let shown=0;
  opts.forEach(o=>{ const hit=!q || o.dataset.s.includes(q); o.hidden=!hit; if(hit) shown++; });
  const none=document.getElementById('teEpNone'); if(none) none.hidden=!!shown;
  const vis=opts.filter(o=>!o.hidden);
  const num=/^\d+$/.test(q) ? String(+q) : null, codeNum=o=>((o.dataset.code.match(/\d+$/)||[''])[0]).replace(/^0+(?=\d)/,'');
  attEpSetActive(vis.find(o=>o.dataset.code.toLowerCase()===q) || (num!==null && vis.find(o=>codeNum(o)===num))
    || (!q && vis.find(o=>o.dataset.code===attEmp)) || vis[0] || null);
}
function attEpKey(ev){
  const vis=attEpOpts().filter(o=>!o.hidden), cur=vis.findIndex(o=>o.classList.contains('active'));
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
    ev.preventDefault(); if(!vis.length) return;
    const i=cur<0 ? 0 : Math.min(vis.length-1, Math.max(0, cur+(ev.key==='ArrowDown'?1:-1)));
    attEpSetActive(vis[i]);
  } else if(ev.key==='Enter'){
    ev.preventDefault(); if(cur>=0) attEpPick(vis[cur].dataset.code);
  } else if(ev.key==='Escape'){ ev.preventDefault(); attEpClose(true); }
  else if(ev.key==='Tab'){ attEpClose(false); }
}
function attEpPick(code){ attEpClose(false); attSelectEmp(code); setTimeout(()=>{ const b=document.getElementById('teEpBtn'); if(b) b.focus(); },0); }
function attEpHtml(emps, emp){
  const label=e=>`<b>${attEsc(e.code)}</b> ${attEsc(e.name)}`;
  const monthly=attIsMonthly(attMonth);
  return `<div class="teEmpPick" id="teEmpPick">
    <button type="button" id="teEpBtn" class="teEpBtn ${emp?'':'noEmp'}" aria-haspopup="listbox" aria-expanded="false" aria-label="Employee"
      title="Choose the employee — click, or start typing a code or name" onclick="attEpToggle()" onkeydown="attEpBtnKey(event)">
      ${ico('user')}<span class="teEpVal">${emp?label(emp):'Choose employee'}</span>${ico('chevron-down')}</button>
    <div class="teEpPop" id="teEpPop" hidden>
      <div class="teEpSearch">${ico('search')}<input id="teEpFind" placeholder="Type code or name" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="true" aria-controls="teEpList" aria-label="Find employee" oninput="attEpFilter(this.value)" onkeydown="attEpKey(event)"></div>
      <div class="teEpList" id="teEpList" role="listbox" aria-label="Employees">
        ${emps.map((e,i)=>{ const miss=monthly?0:attMissingDays(e, attMonth);
          return `<button type="button" tabindex="-1" role="option" id="teEpO${i}" class="teEpOpt ${e.code===attEmp?'cur':''}" data-code="${attEsc(e.code)}"
          data-s="${attEsc((e.code+' '+e.name+' '+contractorName(e)).toLowerCase())}" onmousedown="event.preventDefault()" onclick="attEpPick(this.dataset.code)">
          <span>${label(e)}</span><small>${attEsc(contractorName(e)||'No contractor')}${miss?` · <em class="attEpMiss">${miss} to enter</em>`:''}</small>${e.code===attEmp?ico('check'):''}</button>`; }).join('')}
        <div class="teEpNone" id="teEpNone" ${emps.length?'hidden':''}>${emps.length?'No employee matches that.':'No employees for these filters.'}</div>
      </div>
      <div class="teEpFoot">${emps.length} employee${emps.length===1?'':'s'} · <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> to choose · <kbd>Esc</kbd> to close</div>
    </div>
  </div>`;
}
function attSelectEmp(code){
  attCommitActive();
  attEmp=code||''; attSel.clear(); attSelAnchor=''; attActNote='';
  render('attendance');
}
function attStepEmp(dir){
  const emps=attEmployees(); if(!emps.length) return;
  let i=emps.findIndex(e=>e.code===attEmp);
  i = i<0 ? 0 : (i+dir+emps.length)%emps.length;
  attSelectEmp(emps[i].code);
}
// Opens one employee's days (from the Month Summary or the Dashboard).
function attOpenEmp(code){
  if(typeof teEditConfirmLeave==='function' && attTab!=='entry' && !teEditConfirmLeave()) return;
  attTab='entry'; attEmp=code; attSel.clear(); attActNote=''; render('attendance');
}

/* ---- Month Summary tab: every employee's month by contractor, read-only ---- */
function attSummaryStatsHtml(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  const done=recs.filter(x=>!x.miss).length;
  return `<div class="teStatBox"><b>${recs.length}</b><span>Employees</span></div>
    <div class="teStatBox"><b>${computeWorkingDays(attMonth)}</b><span>Working days (NOWD)</span></div>
    <div class="teStatBox ${done<recs.length?'warn':''}"><b>${done}<small> / ${recs.length}</small></b><span>Up to date</span></div>
    <div class="teStatBox"><b>${sum('lopMarked')}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${sum('halfDayCount')}</b><span>Half days</span></div>
    <div class="teStatBox"><b>${sum('otHours')}</b><span>OT hours</span></div>
    <div class="teStatBox"><b>${sum('lateMinutes')}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${sum('canteenTokens')}</b><span>Tokens</span></div>
    <div class="teStatBox"><b>${fmt(sum('netSalary'))}</b><span>Net pay</span></div>`;
}
function attSecSum(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  return [`LOP ${sum('lopMarked')}`, `Half ${sum('halfDayCount')}`, `OT ${sum('otHours')} h`, `${recs.filter(x=>!x.miss).length}/${recs.length} up to date`].join(' · ');
}
function renderAttSummary(){
  const ym=attMonth, emps=attEmployees(), all=payrollEmployeesFor(ym).length;
  const recs=emps.map(e=>({e, r:computePayrollForEmployee(e, ym), miss:attMissingDays(e, ym)}));
  const groups=attGroups(emps), open=teOpenSecs.attGrid;
  let idx=0;
  const bodies=groups.map((g, gi)=>{
    const gr=recs.filter(x=>g.emps.includes(x.e)), folded=!open.has(g.key);
    const rows=gr.map(x=>`<tr class="attMRow attSumRow ${x.miss?'notEntered':''}" data-code="${attEsc(x.e.code)}" onclick="attOpenEmp(this.dataset.code)" title="Open ${attEsc(x.e.name)}'s days">
      <td class="num attSl">${++idx}</td><td>${attEsc(x.e.code)}</td><td class="attName">${attEsc(x.e.name)}</td>
      <td class="num">${payPresentDays(x.r)}</td><td class="num">${attN(x.r.lopMarked)||''}</td><td class="num">${attN(x.r.halfDayCount)||''}</td><td class="num attCalc">${attN(x.r.daysWorking)}</td>
      <td class="num">${attN(x.r.lateMinutes)||''}</td><td class="num">${attN(x.r.otHours)||''}</td><td class="num">${attN(x.r.canteenTokens)||''}</td>
      <td class="num attNet">${fmt(x.r.netSalary)}</td>
      <td>${x.miss?`<span class="teEwMissing">${x.miss} day${x.miss===1?'':'s'}</span>`:`<span class="attOk">${ico('check')} Up to date</span>`}</td>
    </tr>`).join('');
    return `<tbody class="teSec attSec ${folded?'folded':''} ${g.unset?'attUnset':''}" data-sec="${attEsc(g.key)}" style="--secTop:${gi};--secBot:${groups.length-1-gi}">
      <tr class="teGrpHead teDwShiftHead teSecHead"><td colspan="12">
        <button type="button" class="teDwFold" tabindex="-1" aria-expanded="${!folded}" title="${folded?'Click to expand this contractor':'Fold this contractor'}" onclick="teSecFold(this)">${ico('chevron-down')}<span class="teShiftBadge">${attEsc(g.name)}</span><span>${gr.length} employee${gr.length===1?'':'s'}</span><span class="attSecSum">${attSecSum(gr)}</span>${g.unset?'<span class="attUnsetTag">Edit these employees and choose their contractor</span>':''}<span class="teDwFoldNote">Click to expand</span></button></td></tr>
      ${rows}
    </tbody>`;
  }).join('');
  const monthly=attIsMonthly(ym);
  setTimeout(()=>{ teSetHeadHeight('attGrid'); teSecRefreshAll('attGrid'); teFitGridBox('attGrid'); }, 0);
  return `<div class="panel attPanel">
    <div class="teDwTop teBar"><div class="teDwGroup">${attMonthBarHtml()}</div></div>
    ${attFilterRowHtml(emps.length, all)}
    <p class="attNote ${monthly?'attNoteOld':''}">${monthly
      ? `<b>${attEsc(attMonthName(ym))}</b> was entered as month totals — open an employee to see them, or to switch the month to day-by-day entry.`
      : `Every employee's ${attEsc(attMonthName(ym))} as Payroll counts it. <b>Click an employee</b> to open their days. "Days to enter" = working days up to today with nothing entered (not paid until entered).`}</p>
    <div class="teStatRow" id="attStats">${attSummaryStatsHtml(recs)}</div>
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid attGrid" id="attGrid">
      <thead><tr>
        <th class="teDwSlTh"><button type="button" id="attGridFoldAll" class="teDwFoldAll" tabindex="-1" aria-expanded="true" title="Fold every contractor — only the bars stay" onclick="teSecFoldAll('attGrid')">${ico('chevron-down')}</button>Sl</th>
        <th>Code</th><th style="text-align:left;">Employee</th><th>Present</th><th>LOP</th><th>Half Day</th><th>Paid days</th><th>Late (min)</th><th>OT (hrs)</th><th>Tokens</th><th>Net pay</th><th>Days to enter</th>
      </tr></thead>
      ${bodies || `<tbody><tr><td colspan="12"><div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></td></tr></tbody>`}
    </table></div>
  </div>`;
}
