/* ================= ATTENDANCE — one employee at a time, every date of the month =================
   Made for entering a whole month quickly, employee by employee:
     1. pick the employee (type a code or name; ‹ › for the previous / next one);
     2. every date of the month is a row, like a sheet — Sundays, holidays and the contractor's paid
        leave are marked;
     3. tick days (Shift+click ticks a range, Working days ticks them all) and Mark Present / LOP /
        Half Day — or click a day's own P / LOP / ½ (or press P, L, H in its boxes);
     4. type Late minutes and OT hours on the days they happened (OT also on a Sunday or holiday worked);
     5. canteen tokens and any one-off allowance / deduction for the month, then Save & next.
   No shifts and no In / Out times: whatever shift was worked, the day is Present.
   Payroll, salary slips, reports, the Contractors Bill and the Dashboard all work from these days
   (getAttStatus, teMonthDays → attFigDays): Total paid days = full days + Half Days × ½ + paid holidays; a
   working day up to today with nothing marked is not paid. Late beyond the month's free minutes is
   taken off the OT hours first; what OT cannot cover is cut from salary (lateDeductionFor).
   Every month is entered the same way (months entered with In / Out times before were converted).
   Other tabs: Month Summary (every employee's month, by contractor, read-only — click a row to open
   that employee), Holidays (the Holiday Calendar) and Contractor Paid Leave (paid days off by date
   for one contractor's employees).
   Data: db.attendance[date][code] (Present / LossOfPay / HalfDay), db.dayFigs[date][code] = {late,
   ot} (minutes), and db.payrollAdjustments[ym][code] for canteenTokens, otherAllowanceOneOff and
   otherDedOneOff. */
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
let attSel=new Set();        // the dates ticked for Mark Present / LOP / Half Day / Clear
let attSelAnchor='';         // the date ticked last (Shift+click ticks everything between)
let attActNote='';           // what the last Mark did

function attCanEdit(){ return hasPerm('attendance','edit') || hasPerm('attendance','add'); }
function attEditable(){ return attCanEdit() && attEditMode && attIsSimple(attMonth); }
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
  if(attIsMonthly(ym)) return 0;
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
// Everything one row shows.
function attDay(e, dt){
  const code=e.code, dow=attDow(dt), hol=attHolidayFor(e, dt), onRoll=isEmpOnRollOn(e, dt);
  const st=onRoll ? getAttStatus(dt, code) : '';
  const off=dow===0 || !!hol;
  let late=0, ot=0;
  if(attIsSimple(dt.slice(0,7))){ const f=attFig(dt, code); if(f && st!=='LossOfPay'){ late=Math.round(+f.late||0); ot=Math.round(+f.ot||0); } }
  else if(onRoll && st!=='LossOfPay'){ const en=attEntry(dt, code); if(attHasTime(en,'in')){ const c=teDayFigures(en, dt, code, st==='HalfDay'); late=c.late; ot=c.ot; } }
  return {dt, dow, hol, onRoll, st, off, late, ot, lop:st==='LossOfPay', half:st==='HalfDay', present:st==='Present',
    missing: onRoll && !off && !st && dt<=todayStr(), future: dt>todayStr()};
}

/* ---- Rendering ---- */
function renderAttendance(){
  const tab=(k, icon, label)=>`<div class="teTab ${attTab===k?'active':''}" role="tab" onclick="attSetTab('${k}')">${ico(icon)} ${label}</div>`;
  const tabs=`<div class="teTabs attPageTabs" role="tablist">${tab('entry','user','Employee Attendance')}${tab('summary','clipboard','Month Summary')}${tab('holidays','calendar','Holidays')}${tab('cleave','calendar-range','Contractor Paid Leave')}</div>`;
  if(attTab==='holidays'){ teHostPage='attendance'; return tabs+renderTEHolidayTab(); }
  if(attTab==='cleave'){ teHostPage='attendance'; return tabs+renderAttConLeave(); }
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
// The Unit / Contractor filters on the Employee Attendance bar (next to the month).
function attFilterInlineHtml(shown, all){
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  const any=!!(attUnitFilter||attContractorFilter);
  return `<span class="attFiltInline">${ico('filter')}
    ${sel(attUnitFilter, 'attSetUnit', 'Unit', `<option value="" ${!attUnitFilter?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${attUnitFilter===u.code?'selected':''}>${attEsc(unitTabLabel(u))}</option>`).join(''))}
    ${sel(attContractorFilter, 'attSetContractor', 'Contractor', contractorFilterOptionsHtml(attContractorFilter))}
    <span class="teFiltCount">${shown===all?`${all} employees`:`<b>${shown}</b> of ${all}`}</span>
    ${any?`<button type="button" class="teFiltClear" onclick="attClearFilters()" title="Clear filters">${ico('filter-x')}</button>`:''}</span>`;
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
  if(!attCanEdit() || !attIsSimple(attMonth)) return '';
  return attEditMode
    ? `<button class="btn secondary" onclick="attCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn ${withNext?'secondary':''}" onclick="attSave()">${ico('save')} Save</button>${withNext?`<button class="btn" onclick="attSaveNext()" title="Save, then open the next employee">${ico('save')} Save &amp; next ›</button>`:''}`
    : `<button class="btn btnEditAtt" onclick="attEdit()">${ico('pencil')} Edit</button>`;
}

/* ---- Employee Attendance tab ---- */
function attOffText(x){
  if(x.dow===0) return 'Sunday';
  if(!x.hol) return '';
  if(x.hol.kind==='cleave') return 'Paid leave'+(x.hol.name?' · '+x.hol.name:'');
  const n=x.hol.name||'';
  if(x.hol.kind==='paid') return /holiday/i.test(n) ? n : (n ? n+' · paid holiday' : 'Paid holiday');
  return (n||'Holiday')+' · no pay';
}
function attStatusHtml(x, editable){
  if(!x.onRoll) return `<span class="teEwMuted">Not on roll</span>`;
  if(x.off) return `<span class="${x.st==='NOPH'?'tag NOPH':'attOffTag'}">${attEsc(attOffText(x))}</span>`;
  if(editable){
    const b=(st, cls, label, title)=>`<button type="button" tabindex="-1" class="attStB ${cls} ${x.st===st?'on':''}" title="${title}${x.st===st?' — click again to clear':''}" onclick="attSetDay('${x.dt}','${st}')">${label}</button>`;
    return `<span class="attStBtns ${x.missing?'missing':''}" title="${x.missing?'Needs entry — not paid until marked':''}">${b('Present','p','Present','Present')}${b('LossOfPay','l','LOP','Loss of Pay — not paid')}${b('HalfDay','h','Half day','Half Day — paid ½')}</span>`;
  }
  if(x.lop) return `<span class="tag LossOfPay">LOP</span>`;
  if(x.half) return `<span class="tag HalfDay">Half Day</span>`;
  if(x.present) return `<span class="tag Present">Present</span>`;
  if(x.future) return `<span class="teEwMuted">–</span>`;
  return `<span class="teEwMissing">Needs entry</span>`;
}
// A day's box: Late in minutes; OT as hours:minutes (90 min → "1:30").
function attFigVal(x, k){ return k==='late' ? (x.late ? String(x.late) : '') : (x.ot ? Math.floor(x.ot/60)+':'+String(x.ot%60).padStart(2,'0') : ''); }
// Reads a typed OT: "1:30" (hours:minutes), "2" (hours) or "1.5" (hours) → minutes; null if unreadable.
function attParseOt(raw){
  const s=String(raw).trim();
  const hm=s.match(/^(\d{1,2}):(\d{1,2})$/);
  if(hm){ const m=+hm[2]; return m<60 ? (+hm[1])*60+m : null; }
  const n=Number(s); return isFinite(n) && n>=0 ? Math.round(n*60) : null;
}
function attRowHtml(e, x, i, editable){
  const box=(k, c)=>{
    const on=editable && x.onRoll && !x.lop && !(k==='late' && x.off);
    return `<td class="attFigCell"><input class="attIn attFig" data-r="${i}" data-c="${c}" data-k="${k}" value="${attFigVal(x,k)}" ${on?'':'disabled'} placeholder=""
      inputmode="decimal" autocomplete="off" spellcheck="false" title="${k==='late'?'Late minutes this day':'OT this day as hours:minutes, e.g. 1:30'+(x.off?' (worked on a day off)':'')}"
      aria-label="${k==='late'?'Late minutes':'OT hours'} ${fmtDate(x.dt)}" onfocus="this.select()" onkeydown="attKey(event,this)" onblur="attCommit(this)"></td>`; };
  const sel=attSel.has(x.dt);
  const cls=['attDRow', x.dow===0?'sun':'', x.hol?'hol':'', x.lop?'onLeave':'', x.missing?'missing':'', sel?'sel':'', x.dt===todayStr()?'today':''].filter(Boolean).join(' ');
  return `<tr class="${cls}" data-r="${i}" data-dt="${x.dt}">
    <td class="attChk"><input type="checkbox" tabindex="-1" ${sel?'checked':''} ${editable&&x.onRoll&&!x.off?'':'disabled'} onclick="attTick(event,'${x.dt}')" aria-label="Tick ${fmtDate(x.dt)}"></td>
    <td class="attDate" onclick="attTickDate(event,'${x.dt}')" title="${fmtDate(x.dt)}">${attShortDate(x.dt)}</td><td class="attDow">${ATT_DOW[x.dow]}</td>
    <td class="attSt" data-k="status">${attStatusHtml(x, editable)}</td>
    ${box('ot',0)}${box('late',1)}
  </tr>`;
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
// The month for the employee as Payroll counts it: label, the figure, and how it is worked out.
function attEmpStatsHtml(e, r, missing){
  const p=attNowdParts(e, attMonth);
  const full=attN(r.presentDays), half=attN(r.halfDayCount), lop=attN(r.lopMarked), present=payPresentDays(r), noph=attN(r.noph);
  const late=attN(r.lateMinutes), grace=+r.lateGraceMinutes||0, over=Math.max(0, late-grace), fromOt=+r.lateOtMinutes||0, cut=+r.lateChargedMinutes||0;
  const worked=+(r.otHoursWorked!==undefined?r.otHoursWorked:r.otHours)||0, otPaid=+r.otHours||0;
  const box=(label, val, calc, cls)=>`<div class="attSB ${cls||''}"><span class="attSBl">${label}</span><b class="attSBv">${val}</b><span class="attSBc">${calc}</span></div>`;
  const nowdCalc=[`${p.dim} days`, `${p.sun} Sun`, p.hol?`${p.hol} hol`:'', p.unpaid?`${p.unpaid} no-pay`:'', p.off?`${p.off} off roll`:''].filter(Boolean).join(' − ');
  const lateCalc=!late ? 'no late' : late<=grace ? `within ${grace} free min`
    : `${late} − ${grace} free = ${over}`+(fromOt&&!cut?' → off OT':fromOt&&cut?` → ${fromOt} off OT, ${cut} cut`:` min cut from pay`);
  return box('NOWD', p.nowd, nowdCalc)
    + box('LOP', lop, lop?'absent — not paid':'no LOP')
    + box('Half day', half, half?`${half} × ½ = ${attN(half/2)} day paid`:'no half day')
    + box('Present days', present, half?`${full} full + ${half} × ½`:`${full} full days`)
    + box('OT hours', fmtHrsMin(otPaid), fromOt?`${fmtHrsMin(worked)} − ${fmtMinHM(fromOt)} late = ${fmtHrsMin(otPaid)}`:worked?'worked':'no OT')
    + box('Late minutes', late, lateCalc)
    + box('Total paid days', attN(r.daysWorking), noph?`${present} present + ${noph} hol`:`${present} present`, 'key');
}
const ATT_MONTH_BOXES=[
  {k:'canteenTokens', h:'Canteen tokens', title:'Canteen tokens bought this month — deducted at the token price of the employee\'s unit', whole:true},
  {k:'otherAllowanceOneOff', h:'Allowance ₹', title:'One-off allowance this month (added to Total Earnings)', whole:false},
  {k:'otherDedOneOff', h:'Deduction ₹', title:'One-off deduction this month', whole:false}
];
function attMonthBoxesHtml(e, r, editable){
  const val=k=>{ const v=k==='canteenTokens' ? r.canteenTokens : k==='otherAllowanceOneOff' ? r.otherAllowance : r.otherDed; return +v ? attN(v) : ''; };
  return ATT_MONTH_BOXES.map(b=>`<label class="attMBox" title="${attEsc(b.title)}"><span>${b.h}</span>
    <input class="attIn" data-mk="${b.k}" value="${val(b.k)}" ${editable?'':'disabled'} placeholder="0" inputmode="decimal" autocomplete="off" onfocus="this.select()" onchange="attMonthBox(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></label>`).join('');
}
function attActionBarHtml(){
  const n=attSel.size;
  return `<div class="attActBar">
    <div class="attActRow">
      <span class="attSelInfo" id="attSelInfo">${n?`<b>${n}</b> day${n===1?'':'s'} ticked`:'Tick days'}</span>
      <button type="button" class="btn secondary" onclick="attTickWorking()" title="Tick every working day of the month (not Sundays or holidays)">${ico('check')} Working days</button>
      <button type="button" class="btn secondary" onclick="attTickNone()">Untick</button>
      <span class="attActSep"></span>
      <button type="button" class="btn" onclick="attMarkDays('Present')">Mark Present</button>
      <button type="button" class="btn attLopBtn" onclick="attMarkDays('LossOfPay')">Mark LOP</button>
      <button type="button" class="btn secondary" onclick="attMarkDays('HalfDay')">Mark Half Day</button>
      <button type="button" class="btn secondary" onclick="attMarkDays('')" title="Back to Needs entry (Late and OT removed too)">${ico('x')} Clear</button>
      <span class="attActNote ${attActNote?'ok':''}" id="attActNote" title="Tick days (Shift+click ticks a range) and mark them — e.g. Working days → Mark Present. Change one day with its P / LOP / ½ buttons, or press P, L or H in its boxes. Type Late minutes and OT hours on the days they happened (blank = 0).">${attActNote?attEsc(attActNote):`${ico('alert')} How`}</span>
      <span class="attActSave">${attEditButtonsHtml(true)}</span>
    </div>
  </div>`;
}
function renderAttEntry(){
  const ym=attMonth, monthly=attIsMonthly(ym), simple=attIsSimple(ym), emps=attEmployees(), all=payrollEmployeesFor(ym).length;
  if(!emps.some(e=>e.code===attEmp)) attEmp=emps.length ? emps[0].code : '';
  if(attEditMode && !simple) attEditMode=false;
  const e=emps.find(x=>x.code===attEmp), editable=attEditable();
  const top=`<div class="teDwTop teBar attTop">
      <div class="teDwGroup">
        <button class="btn secondary teDwNav" title="Previous employee" aria-label="Previous employee" onclick="attStepEmp(-1)">‹</button>
        ${attEpHtml(emps, e)}
        <button class="btn secondary teDwNav" title="Next employee" aria-label="Next employee" onclick="attStepEmp(1)">›</button>
        <span class="teBarSep"></span>
        ${attMonthBarHtml()}
        <span class="teBarSep"></span>
        ${attFilterInlineHtml(emps.length, all)}
      </div>
      <div class="teDwGroup">
        <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
        ${e && !editable ? attEditButtonsHtml(true) : ''}
      </div>
    </div>`;
  if(!e) return `<div class="panel attPanel">${top}<div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></div>`;
  const r=computePayrollForEmployee(e, ym), missing=attMissingDays(e, ym);
  const head=`<div class="attEmpLine">
      <div class="attEmpName"><b>${attEsc(e.name)}</b> <span>${attEsc(e.code)}</span>
        <span class="attEmpMeta">${contractorName(e)?attEsc(contractorName(e)):'<span class="empNoCon">Contractor not set</span>'} · ${attEsc(unitLabel(e.unit))}${e.designation?' · '+attEsc(e.designation):''} · ${fmt(r.dailyWage)}/day · Net pay <b id="attNetPay">${fmt(r.netSalary)}</b></span></div>
      ${monthly?'':`<div class="attMBoxes">${attMonthBoxesHtml(e, r, editable)}</div>`}
    </div>`;
  if(monthly){
    const a=adjFor(ym, e.code);
    return `<div class="panel attPanel">${top}${head}
      <p class="attNote attNoteOld"><b>${attEsc(attMonthName(ym))}</b> was entered as month totals: LOP ${attN(a.lopDays)} · Half Days ${attN(a.halfDays)} · Late ${attN(a.lateMinutes)} min · OT ${attN(a.otHours)} h. Payroll uses these figures.
        ${attCanEdit()?`<button type="button" class="btn secondary attSwitchBtn" onclick="attMonthToDaily('${ym}')">Enter ${attEsc(attMonthName(ym))} day by day instead</button>`:''}</p>
      <div class="attBanner" id="attStats">${attEmpStatsHtml(e, r, 0)}</div>
    </div>`;
  }
  const days=attMonthDates(ym).map(dt=>attDay(e, dt));
  setTimeout(()=>{ teFitGridBox('attDayGrid'); }, 0);
  return `<div class="panel attPanel attCompact">${top}${head}
    <div class="attBanner" id="attStats">${attEmpStatsHtml(e, r, missing)}</div>
    ${editable?attActionBarHtml():''}
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid attDayGrid attTwoCol" id="attDayGrid" data-emp="${attEsc(e.code)}" style="--attRows:${Math.ceil(days.length/2)}">
      <thead>${[0,1].map(k=>`<tr class="${k?'attHead2':''}">
        <th class="attChk">${k?'':`<input type="checkbox" tabindex="-1" ${editable?'':'disabled'} ${attSel.size&&days.filter(x=>x.onRoll&&!x.off).every(x=>attSel.has(x.dt))?'checked':''} onclick="this.checked?attTickWorking():attTickNone()" title="Tick every working day" aria-label="Tick every working day">`}</th>
        <th>Date</th><th>Day</th><th>Present / LOP / Half day</th><th title="Hours:minutes, e.g. 1:30. On Sundays and holidays, type the time worked">OT (h:mm)</th><th>Late (min)</th>
      </tr>`).join('')}</thead>
      <tbody>${days.map((x,i)=>attRowHtml(e, x, i, editable)).join('')}</tbody>
      <tfoot><tr id="attDayFoot">${attFootHtml(r, missing)}</tr></tfoot>
    </table></div>
    <p class="syncNote">${attNoteHtml(r)}</p>
  </div>`;
}
// The note under the days: how they turn into pay, in plain words.
function attNoteHtml(r){
  const free=+r.lateGraceMinutes||0, offOt=lateOffOt(attMonth);
  return `<b>Total paid days</b> = Present days (a half day counts as ½) + paid holidays (the Holiday Calendar and the contractor's paid leave). `
    + `A working day with nothing marked is not paid until it is marked. `
    + `<b>Late:</b> the first ${free} minutes in the month are free; `
    + (offOt ? `after that, late minutes come off the OT time first, and only what OT cannot cover is cut from pay (daily wage ÷ 8 ÷ 60 per minute).`
             : `after that, every late minute is cut from pay (daily wage ÷ 8 ÷ 60 per minute).`);
}
function attFootHtml(r, missing){
  const fromOt=+r.lateOtMinutes||0;
  const otW=r.otHoursWorked!==undefined?r.otHoursWorked:r.otHours;
  return `<td colspan="6" class="attFootLbl">Month: <b>${payPresentDays(r)}</b> present · <b>${attN(r.lopMarked)}</b> LOP · <b>${attN(r.halfDayCount)}</b> half day · OT <b>${fmtHrsMin(otW)}</b> · Late <b>${attN(r.lateMinutes)}</b> min${fromOt?` · <span class="attFootOt">${fmtMinHM(fromOt)} late taken off OT</span>`:''}${missing?` · <span class="teEwMissing">${missing} day${missing===1?'':'s'} to enter</span>`:''}</td>`;
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
// Click ticks / unticks a day; Shift+click does the same to every working day from the one ticked last.
function attTick(ev, dt){
  if(!attEditable()){ ev.preventDefault(); return; }
  const e=attCurEmp(), on=!attSel.has(dt);
  const dates=attMonthDates(attMonth).filter(d=>!e || (isEmpOnRollOn(e, d) && attDow(d)!==0 && !attHolidayFor(e, d)));
  if(ev.shiftKey && attSelAnchor && dates.includes(attSelAnchor) && dates.includes(dt)){
    const a=dates.indexOf(attSelAnchor), b=dates.indexOf(dt);
    dates.slice(Math.min(a,b), Math.max(a,b)+1).forEach(d=>{ if(on) attSel.add(d); else attSel.delete(d); });
  } else if(on) attSel.add(dt); else attSel.delete(dt);
  attSelAnchor=dt;
  attSelRefresh();
}
function attTickDate(ev, dt){ if(attEditable()){ const cb=ev.currentTarget.parentElement.querySelector('td.attChk input'); if(cb && !cb.disabled) attTick(ev, dt); } }
function attTickWorking(){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  attSel=new Set(attMonthDates(attMonth).filter(dt=>isEmpOnRollOn(e, dt) && attDow(dt)!==0 && !attHolidayFor(e, dt)));
  attSelAnchor=''; attSelRefresh();
}
function attTickNone(){ attSel.clear(); attSelAnchor=''; attSelRefresh(); }

/* ---- Writing a day: db.attendance[date][code] = 'Present' | 'LossOfPay' | 'HalfDay', and
   db.dayFigs[date][code] = {late, ot} (minutes) ---- */
function attSetMark(dt, code, st){
  if(!db.attendance) db.attendance={};
  if(st){ if(!db.attendance[dt]) db.attendance[dt]={}; db.attendance[dt][code]=st; }
  else if(db.attendance[dt]) delete db.attendance[dt][code];
  // anything left from entry with times on that day goes
  if(db.timeEntries && db.timeEntries[dt]) delete db.timeEntries[dt][code];
  if(Array.isArray(db.timeLeaves) && db.timeLeaves.some(l=>l.date===dt && l.empCode===code)) db.timeLeaves=db.timeLeaves.filter(l=>!(l.date===dt && l.empCode===code));
}
function attSetFig(dt, code, k, min){
  if(!db.dayFigs) db.dayFigs={};
  const cur=(db.dayFigs[dt] && db.dayFigs[dt][code]) || {};
  const f={...cur, [k]:Math.max(0, Math.round(+min||0))};
  if(!f.late) delete f.late; if(!f.ot) delete f.ot;
  if(Object.keys(f).length){ if(!db.dayFigs[dt]) db.dayFigs[dt]={}; db.dayFigs[dt][code]=f; }
  else if(db.dayFigs[dt]){ delete db.dayFigs[dt][code]; if(!Object.keys(db.dayFigs[dt]).length) delete db.dayFigs[dt]; }
}
function attClearFigs(dt, code){ if(db.dayFigs && db.dayFigs[dt]){ delete db.dayFigs[dt][code]; if(!Object.keys(db.dayFigs[dt]).length) delete db.dayFigs[dt]; } }
// One day's P / LOP / ½ button (clicking the one already on clears the day).
function attSetDay(dt, st){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  const x=attDay(e, dt); if(!x.onRoll || x.off) return;
  const to = x.st===st ? '' : st;
  attSetMark(dt, e.code, to);
  if(to==='LossOfPay' || !to) attClearFigs(dt, e.code);
  teEditTouch();
  const tr=document.querySelector(`#attDayGrid tr.attDRow[data-dt="${dt}"]`);
  if(tr){ attUpdateRow(+tr.dataset.r); attRefreshTotals(); }
}
function attDone(note){
  attSel.clear(); attSelAnchor=''; attActNote=note;
  teEditTouch(); render('attendance');
}
function attMarkDays(st){
  if(!attEditable()) return;
  const e=attCurEmp(); if(!e) return;
  if(!attSel.size){ alert('Tick the days first (Shift+click ticks a range, or use Working days).'); return; }
  const days=[...attSel].sort().map(dt=>attDay(e, dt)).filter(x=>x.onRoll && !x.off);
  days.forEach(x=>{ attSetMark(x.dt, e.code, st); if(st==='LossOfPay' || !st) attClearFigs(x.dt, e.code); });
  const what={Present:'marked Present', LossOfPay:'marked LOP', HalfDay:'marked Half Day', '':'cleared'}[st];
  attDone(`${days.length} day${days.length===1?'':'s'} ${what}.`);
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
  if(!attIsSimple(attMonth)) return;
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

/* ---- Typing a day's Late minutes / OT hours ---- */
// Commits one box. false = it could not be read (the box stays, marked).
function attCommit(inp){
  if(!inp || !inp.isConnected || inp.disabled || !attEditable()) return true;
  const grid=inp.closest('#attDayGrid'); if(!grid || grid.dataset.emp!==attEmp) return true;
  const e=attCurEmp(); if(!e) return true;
  const tr=inp.closest('tr'), dt=tr.dataset.dt, k=inp.dataset.k, x=attDay(e, dt);
  const raw=inp.value.trim().replace(/,/g,'');
  if(raw===attFigVal(x, k)){ inp.classList.remove('bad'); return true; }
  let min=0;
  if(raw!==''){
    if(k==='late'){
      const n=Number(raw);
      if(!isFinite(n) || n<0){ inp.classList.add('bad'); inp.title='Enter the late minutes (0 or more)'; return false; }
      min=Math.round(n);
    } else {
      const m=attParseOt(raw);
      if(m===null){ inp.classList.add('bad'); inp.title='Enter OT as hours:minutes, e.g. 1:30 (or 2 for 2 hours)'; return false; }
      min=m;
    }
  }
  attSetFig(dt, e.code, k, min);
  // a figure on a working day with nothing marked: the employee was there
  if(min && !x.off && !x.st) attSetMark(dt, e.code, 'Present');
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
  tr.querySelector('[data-k="status"]').innerHTML=nr.querySelector('[data-k="status"]').innerHTML;
  tr.querySelectorAll('input[data-c]').forEach(inp=>{
    const n=nr.querySelector(`input[data-c="${inp.dataset.c}"]`); if(!n) return;
    inp.value=n.value; inp.disabled=n.disabled; inp.placeholder=n.placeholder; inp.title=n.title; inp.className=n.className;
  });
}
function attRefreshTotals(){
  const e=attCurEmp(); if(!e) return;
  const r=computePayrollForEmployee(e, attMonth), missing=attMissingDays(e, attMonth);
  const st=document.getElementById('attStats'); if(st) st.innerHTML=attEmpStatsHtml(e, r, missing);
  const np=document.getElementById('attNetPay'); if(np) np.textContent=fmt(r.netSalary);
  const f=document.getElementById('attDayFoot'); if(f) f.innerHTML=attFootHtml(r, missing);
}
// Keyboard: Enter / ↓ next day, ↑ back, ← → / Tab between Late and OT; P / L / H mark the day.
function attCell(r, c){ return document.querySelector(`#attDayGrid input[data-r="${r}"][data-c="${c}"]`); }
function attKey(ev, inp){
  const r=+inp.dataset.r, c=+inp.dataset.c;
  if(ev.key==='Escape'){ const e=attCurEmp(); if(e){ inp.value=attFigVal(attDay(e, inp.closest('tr').dataset.dt), inp.dataset.k); inp.classList.remove('bad'); inp.select(); } return; }
  const mk={p:'Present', l:'LossOfPay', h:'HalfDay'}[String(ev.key).toLowerCase()];
  if(mk && !ev.ctrlKey && !ev.metaKey && !ev.altKey){
    ev.preventDefault();
    const dt=inp.closest('tr').dataset.dt, e=attCurEmp(), x=e && attDay(e, dt);
    if(x && !x.off && x.st!==mk) attSetDay(dt, mk);
    const el=attCell(r, c); if(el && !el.disabled){ el.focus(); el.select(); } else attMove(r, c, 1, 0);
    return;
  }
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
    const cc=c+dc; if(cc>=0 && cc<=1){ const el=attCell(r, cc); if(el && !el.disabled){ el.focus(); return; } }
    for(let rr=r+dc; rr>=0 && rr<n; rr+=dc){ for(let k=0;k<=1;k++){ const el=attCell(rr, dc>0?k:1-k); if(el && !el.disabled){ el.focus(); el.scrollIntoView({block:'nearest'}); return; } } }
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
      <td class="num">${attN(x.r.lateMinutes)||''}</td><td class="num">${+x.r.otHours?fmtHrsMin(x.r.otHours):''}</td><td class="num">${attN(x.r.canteenTokens)||''}</td>
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
        <th>Code</th><th style="text-align:left;">Employee</th><th>Present</th><th>LOP</th><th>Half Day</th><th>Paid days</th><th>Late (min)</th><th title="OT paid (after Late beyond the free minutes), hours and minutes">OT paid</th><th>Tokens</th><th>Net pay</th><th>Days to enter</th>
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
  teEditTouch(); render('attendance');
}
function attClvAll(dt, on){
  if(!teEditActive('cleave')) return;
  getContractors().forEach(c=>attClvSet(dt, c.code, on));
  teEditTouch(); render('attendance');
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
