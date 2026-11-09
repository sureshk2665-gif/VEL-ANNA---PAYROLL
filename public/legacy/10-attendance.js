/* ================= ATTENDANCE — once a month, one row per employee =================
   From the cut-over month (db.monthlyAttFrom — attIsMonthly in 12-payroll-calc.js) attendance is
   entered once a month. For every employee the client types:
     LOP days · Half Days · Late (minutes) · OT (hours) · Canteen tokens · one-off Allowance / Deduction
   Everything else follows with the same formulas as before:
     Working days = days on the roll that month, not Sundays, NOPH or holidays without pay
     Present      = Working days − LOP − Half Days        Paid Days = Present + Half Days × ½ + NOPH
     then Basic, HRA, OT pay, PF, ESI, Canteen, Late deduction and Net Pay (computePayrollForEmployee)
   — so Payroll, salary slips, reports and the Contractors Bill all show these figures.
   The table is grouped by contractor (every employee is under one; LOP differs contractor by
   contractor): one contractor open at a time, every contractor's bar always on screen (teSecApply,
   13-screen-tools.js). Made for filling a whole month fast: Enter / arrows move between boxes, a column
   pasted from Excel fills down, and each contractor's bar shows its totals.
   Months before the cut-over were entered day by day: they are shown here read-only (the figures
   Payroll worked out from the days), and one button switches such a month to monthly entry.
   The second tab is the Holiday Calendar (NOPH and holidays without pay). */

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

/* ---- One day's status — for the months entered day by day (before the cut-over) ----
     1. a Holiday Calendar date counts as 'NOPH' for every employee;
     2. a mark made on the old daily Attendance screen;
     3. otherwise the former Employee Time Entry (In / Out times, leave) — see timeEntryAttStatus(). */
function getAttStatus(date, code){
  const t=getHolidayType(date);
  if(t) return t;
  const s=db.attendance && db.attendance[date] && db.attendance[date][code] || '';
  if(s) return s==='PaidLeave' ? 'LossOfPay' : s; // NOPL (paid leave) was removed — any old NOPL mark counts as Loss Of Pay
  return timeEntryAttStatus(date, code);
}
// A day's status from Employee Time Entry: its Employee Leave (Loss of Pay / Half Day), else
// Present when an In Time was entered, else '' (not marked). A booked holiday without pay is not a
// working day: time worked on it is paid as full-day OT, not as a Present day.
function timeEntryAttStatus(date, code){
  const lv=typeof teGetLeave==='function' ? teGetLeave(date, code) : null;
  if(lv) return lv.type==='Half Day' ? 'HalfDay' : 'LossOfPay';
  const te=db.timeEntries && db.timeEntries[date] && db.timeEntries[date][code];
  if(!(te && te.inH!=='' && te.inH!==undefined && te.inH!==null)) return '';
  return (db.timeHolidays||[]).some(h=>h.date===date) ? '' : 'Present';
}

/* ---- The cut-over to monthly entry ----
   The first time this version loads, the current month becomes the first monthly-entry month, so
   every earlier month stays exactly as it was. Whatever was already entered for the current month
   (Loss of Pay / Half Days, Late, OT, tokens) is carried into its monthly figures. An earlier month
   can be switched to monthly entry from this screen (attSwitchToMonthly). */
// Carries a day-by-day month's figures into monthly figures (run while the month is still
// day-by-day). Days with nothing entered then count as Present.
function attConvertMonth(ym){
  payrollEmployeesFor(ym).forEach(e=>{
    const r=computePayrollForEmployee(e, ym);
    const put={lopDays:+r.lopMarked||0, halfDays:+r.halfDayCount||0, lateMinutes:+r.lateMinutes||0, canteenTokens:+r.canteenTokens||0};
    const ot=+r.otHours||0;
    if(!ot && !Object.values(put).some(v=>v)) return; // nothing to carry over
    const a=getAdj(ym, e.code);
    Object.keys(put).forEach(k=>{ if(put[k]) a[k]=put[k]; });
    if(ot){ a.otHours=ot; a.otTyped=true; }
  });
}
function ensureMonthlyAttendance(){
  if(db.monthlyAttFrom) return;
  const ym=monthKey(todayStr());
  attConvertMonth(ym);
  db.monthlyAttFrom=ym;
}
function attMonthName(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}); }
// Moves the cut-over back to `ym`: that month (and any up to the old cut-over) is entered here from now on.
function attSwitchToMonthly(ym){
  if(!attCanEdit()){ alert('You do not have permission to edit attendance.'); return; }
  if(typeof teEditActive==='function' && teEditActive()){ alert('Save or cancel the open edit first.'); return; }
  const from=db.monthlyAttFrom; if(!from || ym>=from) return;
  const months=[]; for(let m=ym; m<from; m=nextMonthKey(m,1)) months.push(m);
  const gen=months.filter(m=>payrollGenerated(m));
  const span=months.length>1 ? `${attMonthName(ym)} to ${attMonthName(months[months.length-1])}` : attMonthName(ym);
  if(!confirm(`Enter ${span} on this screen instead of day by day?\n\n`
    +`Each employee's Loss of Pay days, Half Days, Late minutes, OT hours and canteen tokens are carried over from what was entered day by day. `
    +`Working days with nothing entered then count as Present (until now they were not paid).`
    +(gen.length?`\n\nPayroll for ${gen.map(m=>attMonthName(m)).join(', ')} is already generated — it will show the new figures.`:''))) return;
  months.forEach(attConvertMonth);
  db.monthlyAttFrom=ym;
  saveDB(db);
  render('attendance');
}

/* ---- Screen state ---- */
let attMonth=monthKey(todayStr());
let attTab='entry';          // 'entry' (monthly attendance) | 'holidays' (Holiday Calendar)
let attUnitFilter='';        // '' = all units, or a unit code
let attContractorFilter='';  // '' = all, or a contractor code
let attEditMode=false;       // boxes are locked until Edit (an Edit session — Save / Cancel)
let attFocusFirst=false;     // after Edit: put the cursor in the first row still to be entered

// The boxes, in order (data-c). Stored in db.payrollAdjustments[ym][code].
const ATT_COLS=[
  {k:'lopDays',              h:'LOP',          title:'Loss of Pay days this month', whole:false},
  {k:'halfDays',             h:'Half Day',     title:'Half days this month (each is paid ½ day)', whole:true},
  {k:'lateMinutes',          h:'Late (min)',   title:'Late minutes this month (the first minutes of the month are free — Admin → Late Waiver)', whole:true},
  {k:'otHours',              h:'OT (hrs)',     title:'OT hours this month — paid at Daily Wage ÷ 8 × OT Factor', whole:false},
  {k:'canteenTokens',        h:'Tokens',       title:'Canteen tokens bought this month — deducted at the token price of the employee\'s unit', whole:true},
  {k:'otherAllowanceOneOff', h:'Allowance ₹',  title:'One-off allowance this month (added to Total Earnings)', whole:false},
  {k:'otherDedOneOff',       h:'Deduction ₹',  title:'One-off deduction this month', whole:false}
];

function attCanEdit(){ return hasPerm('attendance','edit'); }
function attEditable(){ return attCanEdit() && attEditMode && attIsMonthly(attMonth); }
function attEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const attN=v=>Math.round((+v||0)*100)/100;

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
// Working days on the roll: not Sundays, NOPH or holidays without pay.
function attWorkDays(e, ym){
  let n=0; const dim=daysInMonth(ym);
  for(let d=1; d<=dim; d++){ const ds=dateStr(ym,d); if(!isSunday(ym,d) && isEmpOnRollOn(e, ds) && getHolidayType(ds)!=='NOPH' && !isUnpaidHolidayDate(ds)) n++; }
  return n;
}
function attEntered(code){ const a=db.payrollAdjustments && db.payrollAdjustments[attMonth] && db.payrollAdjustments[attMonth][code]; return !!(a && a.attEntered); }
// The value in a box: the figure entered (monthly months), or the figure Payroll worked out from the
// days (day-by-day months, read-only). Zero shows as an empty box.
function attBoxValue(e, k, r){
  let v;
  if(attIsMonthly(attMonth)){ const a=adjFor(attMonth, e.code); v=a[k]; }
  else v={lopDays:r.lopMarked, halfDays:r.halfDayCount, lateMinutes:r.lateMinutes, otHours:r.otHours, canteenTokens:r.canteenTokens, otherAllowanceOneOff:r.otherAllowance, otherDedOneOff:r.otherDed}[k];
  return v===undefined || v===null || v==='' || !+v ? '' : attN(v);
}

/* ---- Rendering ---- */
function renderAttendance(){
  const tabs=`<div class="teTabs attPageTabs" role="tablist">
    <div class="teTab ${attTab==='entry'?'active':''}" role="tab" onclick="attSetTab('entry')">${ico('calendar-days')} Monthly Attendance</div>
    <div class="teTab ${attTab==='holidays'?'active':''}" role="tab" onclick="attSetTab('holidays')">${ico('calendar')} Holidays</div>
  </div>`;
  if(attTab==='holidays'){ teHostPage='attendance'; return tabs+renderTEHolidayTab(); }
  return tabs+renderAttEntry();
}
function attSetTab(t){
  if(t===attTab) return;
  if(typeof teEditConfirmLeave==='function' && !teEditConfirmLeave()) return;
  attTab=t; render('attendance');
}
function attFilterRowHtml(shown, all){
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" ${attEditMode?'disabled title="Save or cancel first"':''} onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  const any=!!(attUnitFilter||attContractorFilter);
  return `<div class="teFiltRow">
    <span class="teFiltLbl">${ico('filter')} Filter</span>
    ${sel(attUnitFilter, 'attSetUnit', 'Unit', `<option value="" ${!attUnitFilter?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${attUnitFilter===u.code?'selected':''}>${attEsc(unitTabLabel(u))}</option>`).join(''))}
    ${sel(attContractorFilter, 'attSetContractor', 'Contractor', contractorFilterOptionsHtml(attContractorFilter))}
    <span class="teFiltCount">${shown===all?`${all} employees`:`<b>${shown}</b> of ${all} employees`}</span>
    ${any&&!attEditMode?`<button type="button" class="teFiltClear" onclick="attClearFilters()">${ico('filter-x')} Clear filters</button>`:''}
  </div>`;
}
function attSetUnit(v){ attUnitFilter=v||''; render('attendance'); }
function attSetContractor(v){ attContractorFilter=v||''; render('attendance'); }
function attClearFilters(){ attUnitFilter=''; attContractorFilter=''; render('attendance'); }
function attSetMonth(v){ if(!v || v===attMonth) return; if(attEditMode){ alert('Save or cancel first.'); return; } attMonth=v; render('attendance'); }
function attStepMonth(k){ attSetMonth(nextMonthKey(attMonth, k)); }
// Kept for the Dashboard's "View in Attendance": opens that date's month.
function openAttDay(date){ attTab='entry'; attMonth=monthKey(date); render('attendance'); }

function attStatsHtml(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  const monthly=attIsMonthly(attMonth), entered=monthly ? recs.filter(x=>attEntered(x.e.code)).length : 0;
  return `<div class="teStatBox"><b>${recs.length}</b><span>Employees</span></div>
    <div class="teStatBox"><b>${computeWorkingDays(attMonth)}</b><span>Working days (NOWD)</span></div>
    ${monthly?`<div class="teStatBox ${entered<recs.length?'warn':''}"><b>${entered}<small> / ${recs.length}</small></b><span>Entered</span></div>`:''}
    <div class="teStatBox"><b>${sum('lopMarked')}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${sum('halfDayCount')}</b><span>Half days</span></div>
    <div class="teStatBox"><b>${sum('otHours')}</b><span>OT hours</span></div>
    <div class="teStatBox"><b>${sum('lateMinutes')}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${sum('canteenTokens')}</b><span>Tokens</span></div>
    <div class="teStatBox"><b>${fmt(sum('netSalary'))}</b><span>Net pay</span></div>`;
}
// A contractor bar's figures.
function attSecSum(recs){
  const sum=k=>attN(recs.reduce((s,x)=>s+(+x.r[k]||0),0));
  const parts=[`LOP ${sum('lopMarked')}`, `Half ${sum('halfDayCount')}`, `OT ${sum('otHours')} h`];
  if(attIsMonthly(attMonth)) parts.push(`${recs.filter(x=>attEntered(x.e.code)).length}/${recs.length} entered`);
  return parts.join(' · ');
}
function attMRowHtml(e, r, i, editable){
  const work=attWorkDays(e, attMonth), box=k=>attBoxValue(e, k, r);
  const cells=ATT_COLS.map((c,ci)=>`<td class="attInCell"><input class="attIn" data-r="${i}" data-c="${ci}" data-k="${c.k}" value="${box(c.k)}" inputmode="decimal" autocomplete="off" spellcheck="false"
      ${editable?'':'disabled'} placeholder="0" title="${attEsc(c.title)}" aria-label="${attEsc(c.h)} — ${attEsc(e.name)}"
      onfocus="this.select()" oninput="attInput(this)" onkeydown="attKey(event,this)" onpaste="attPaste(event,this)"></td>`);
  const entered=attIsMonthly(attMonth) && attEntered(e.code);
  return `<tr class="attMRow ${attIsMonthly(attMonth)&&!entered?'notEntered':''}" data-code="${attEsc(e.code)}" data-r="${i}">
    <td class="num attSl">${i+1}</td><td>${attEsc(e.code)}</td><td class="attName">${attEsc(e.name)}</td>
    <td class="num" data-k="work" title="Working days on the roll (not Sundays, NOPH or holidays without pay)">${work}</td>
    ${cells[0]}${cells[1]}
    <td class="num attCalc" data-k="present" title="Present = Working days − LOP − Half Days, + Half Days × ½">${payPresentDays(r)}</td>
    <td class="num attCalc" data-k="paid" title="Paid Days = Present + NOPH">${attN(r.daysWorking)}</td>
    ${cells.slice(2).join('')}
    <td class="num attNet" data-k="net" title="Net Pay — the same figure as Payroll and the salary slip">${fmt(r.netSalary)}</td>
  </tr>`;
}
function renderAttEntry(){
  const ym=attMonth, monthly=attIsMonthly(ym), canEdit=attCanEdit(), editable=attEditable();
  if(attEditMode && !monthly){ attEditMode=false; }
  const emps=attEmployees(), all=payrollEmployeesFor(ym).length;
  const recs=emps.map(e=>({e, r:computePayrollForEmployee(e, ym)}));
  const groups=attGroups(emps);
  let idx=0;
  const open=teOpenSecs.attGrid;
  const bodies=groups.map((g, gi)=>{
    const gr=recs.filter(x=>g.emps.includes(x.e)), folded=!open.has(g.key);
    const rows=gr.map(x=>attMRowHtml(x.e, x.r, idx++, editable)).join('');
    return `<tbody class="teSec attSec ${folded?'folded':''} ${g.unset?'attUnset':''}" data-sec="${attEsc(g.key)}" style="--secTop:${gi};--secBot:${groups.length-1-gi}">
      <tr class="teGrpHead teDwShiftHead teSecHead"><td colspan="14">
        <button type="button" class="teDwFold" tabindex="-1" aria-expanded="${!folded}" title="${folded?'Click to expand this contractor':'Fold this contractor'}" onclick="teSecFold(this)">${ico('chevron-down')}<span class="teShiftBadge">${attEsc(g.name)}</span><span>${gr.length} employee${gr.length===1?'':'s'}</span><span class="attSecSum" data-sum="${attEsc(g.key)}">${attSecSum(gr)}</span>${g.unset?'<span class="attUnsetTag">Edit these employees and choose their contractor</span>':''}<span class="teDwFoldNote">Click to expand</span></button></td></tr>
      ${rows}
    </tbody>`;
  }).join('');
  const prev=nextMonthKey(ym,-1), thisM=monthKey(todayStr());
  const note = monthly
    ? (editable
      ? `Type each employee's LOP days, Half Days, Late minutes, OT hours and canteen tokens — everything else is calculated. <b>Enter</b> / <b>↓</b> next employee, <b>←</b> <b>→</b> next box; paste a column copied from Excel to fill down. Save when done.`
      : `Each employee's month: LOP days, Half Days, Late minutes, OT hours and canteen tokens. Present = working days − LOP − Half Days; Payroll, slips, reports and the Contractors Bill use these figures.${canEdit?' Click <b>Edit</b> to enter them.':''}`)
    : `<b>${attMonthName(ym)}</b> was entered day by day (before monthly attendance began) — shown here read-only, as Payroll worked it out.${canEdit&&db.monthlyAttFrom?` <button type="button" class="btn secondary attSwitchBtn" onclick="attSwitchToMonthly('${ym}')">Enter ${attEsc(attMonthName(ym))} here instead</button>`:''}`;
  if(attFocusFirst){ attFocusFirst=false; setTimeout(attFocusFirstOpen, 0); }
  setTimeout(()=>{ teSetHeadHeight('attGrid'); teSecRefreshAll('attGrid'); teFitGridBox('attGrid'); }, 0);
  return `<div class="panel attPanel">
    <div class="teDwTop teBar">
      <div class="teDwGroup">
        <span class="teBarLbl">${ico('calendar-days')} Month</span>
        <button class="btn secondary teDwNav" ${attEditMode?'disabled':''} title="Previous month" aria-label="Previous month" onclick="attStepMonth(-1)">‹</button>
        <input type="month" value="${ym}" ${attEditMode?'disabled':''} onchange="attSetMonth(this.value)" aria-label="Month">
        <button class="btn secondary teDwNav" ${attEditMode?'disabled':''} title="Next month" aria-label="Next month" onclick="attStepMonth(1)">›</button>
        ${ym!==thisM && !attEditMode?`<button class="btn secondary" onclick="attSetMonth('${thisM}')">This month</button>`:''}
      </div>
      <div class="teDwGroup">
        <span class="teDwFindWrap">${ico('search')}<input id="attFind" placeholder="Find employee — Enter" autocomplete="off" title="Type a code or name and press Enter"
          onkeydown="if(event.key==='Enter'){event.preventDefault();attFind(this.value);}" oninput="this.classList.remove('bad')"></span>
        <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
        ${!canEdit||!monthly ? '' : attEditMode
          ? `<button class="btn secondary" onclick="attCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn" onclick="attSave()">${ico('save')} Save</button>`
          : `<button class="btn btnEditAtt" onclick="attEdit()">${ico('pencil')} Edit</button>`}
      </div>
    </div>
    ${attFilterRowHtml(emps.length, all)}
    <p class="attNote ${monthly?'':'attNoteOld'}">${note}</p>
    <div class="teStatRow" id="attStats">${attStatsHtml(recs)}</div>
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid attGrid" id="attGrid">
      <thead><tr>
        <th class="teDwSlTh"><button type="button" id="attGridFoldAll" class="teDwFoldAll" tabindex="-1" aria-expanded="true" title="Fold every contractor — only the bars stay" onclick="teSecFoldAll('attGrid')">${ico('chevron-down')}</button>Sl</th>
        <th>Code</th><th style="text-align:left;">Employee</th><th title="Working days on the roll">Work days</th>
        <th class="attInHead">LOP</th><th class="attInHead">Half Day</th><th>Present</th><th>Paid days</th>
        <th class="attInHead">Late (min)</th><th class="attInHead">OT (hrs)</th><th class="attInHead">Tokens</th><th class="attInHead">Allowance ₹</th><th class="attInHead">Deduction ₹</th>
        <th>Net pay</th>
      </tr></thead>
      ${bodies || `<tbody><tr><td colspan="14"><div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></td></tr></tbody>`}
    </table></div>
    <p class="syncNote">Working days = days on the roll that month, not Sundays, NOPH holidays or holidays without pay (Holidays tab). Present = Working days − LOP − Half Days, and a Half Day is paid ½. Late, OT, tokens, allowance and deduction are the month's totals. Net pay is worked out exactly as on the Payroll page and the salary slip; the Contractors Bill counts each contractor's full Present days.</p>
  </div>`;
}

/* ---- Edit / Save (an Edit session: nothing reaches the database or Payroll until Save) ---- */
function attEdit(){
  if(!attCanEdit()){ alert('You do not have permission to edit attendance.'); return; }
  if(!attIsMonthly(attMonth)) return;
  if(!teEditBegin('attendance')){ alert('Save or cancel the other edit first.'); return; }
  attEditMode=true; attFocusFirst=true; render('attendance');
}
function attSave(){ teEditSave(); attEditMode=false; render('attendance'); }
function attCancel(){ teEditCancel('attendance'); }
// After Edit: the first row still to be entered (its contractor opens), else the first row.
function attFocusFirstOpen(){
  const tr=document.querySelector('#attGrid tr.attMRow.notEntered') || document.querySelector('#attGrid tr.attMRow');
  const inp=tr && tr.querySelector('input.attIn:not(:disabled)');
  if(inp){ teSecReveal(inp); teSecFocus(inp); inp.select(); }
}

/* ---- Typing ---- */
function attParse(raw, whole){
  const s=String(raw==null?'':raw).trim().replace(/,/g,'');
  if(s==='') return {v:null};
  const n=Number(s);
  if(!isFinite(n) || n<0) return {bad:true};
  return {v: whole ? Math.round(n) : Math.round(n*100)/100};
}
function attInput(inp){
  if(!attEditable()) return;
  const tr=inp.closest('tr.attMRow'), code=tr.dataset.code, col=ATT_COLS[+inp.dataset.c];
  const p=attParse(inp.value, col.whole);
  if(p.bad){ inp.classList.add('bad'); inp.title='Enter a number (0 or more)'; return; }
  inp.classList.remove('bad'); inp.title=col.title;
  const a=getAdj(attMonth, code);
  if(p.v===null) delete a[col.k]; else a[col.k]=p.v;
  if(col.k==='otHours') a.otTyped=true;
  a.attEntered=true;
  teEditTouch();
  attUpdateRow(tr);
  attTotalsSoon();
}
// Recomputes one row in place (the boxes keep focus).
function attUpdateRow(tr){
  const e=(db.employees||[]).find(x=>x.code===tr.dataset.code); if(!e) return;
  const r=computePayrollForEmployee(e, attMonth), a=adjFor(attMonth, e.code), work=attWorkDays(e, attMonth);
  const set=(k,v)=>{ const el=tr.querySelector(`[data-k="${k}"]`); if(el && el.tagName!=='INPUT') el.textContent=v; };
  set('present', payPresentDays(r)); set('paid', attN(r.daysWorking)); set('net', fmt(r.netSalary));
  tr.classList.toggle('notEntered', !attEntered(e.code));
  const over=(+a.lopDays||0)+(+a.halfDays||0) > work;
  tr.classList.toggle('attOver', over);
  ['lopDays','halfDays'].forEach(k=>{ const el=tr.querySelector(`input[data-k="${k}"]`); if(el){ el.classList.toggle('bad', over); el.title=over?`LOP + Half Days are more than the ${work} working days`:ATT_COLS.find(c=>c.k===k).title; } });
}
let attTotalsTimer=null;
function attTotalsSoon(){ clearTimeout(attTotalsTimer); attTotalsTimer=setTimeout(attRefreshTotals, 150); }
function attRefreshTotals(){
  const recs=attEmployees().map(e=>({e, r:computePayrollForEmployee(e, attMonth)}));
  const st=document.getElementById('attStats'); if(st) st.innerHTML=attStatsHtml(recs);
  attGroups(recs.map(x=>x.e)).forEach(g=>{
    const el=document.querySelector(`#attGrid .attSecSum[data-sum="${CSS.escape(g.key)}"]`);
    if(el) el.textContent=attSecSum(recs.filter(x=>g.emps.includes(x.e)));
  });
}

/* ---- Keyboard: Enter / ↓ next employee (into the next contractor when one ends), ↑ back,
   ← → between boxes ---- */
function attCell(r,c){ return document.querySelector(`#attGrid input.attIn[data-r="${r}"][data-c="${c}"]`); }
function attKey(ev, inp){
  const r=+inp.dataset.r, c=+inp.dataset.c;
  let dr=0, dc=0;
  if(ev.key==='Enter') dr=ev.shiftKey?-1:1;
  else if(ev.key==='ArrowDown') dr=1;
  else if(ev.key==='ArrowUp') dr=-1;
  else if(ev.key==='ArrowRight' && inp.selectionEnd===inp.value.length) dc=1;
  else if(ev.key==='ArrowLeft' && inp.selectionStart===0) dc=-1;
  else return;
  ev.preventDefault();
  attMove(r, c, dr, dc);
}
function attMove(r, c, dr, dc){
  let el=null;
  if(dc){ const cc=c+dc; if(cc>=0 && cc<ATT_COLS.length) el=attCell(r, cc); }
  else el=attCell(r+dr, c);
  if(!el || el.disabled) return;
  teSecReveal(el); teSecFocus(el); el.select();
}
// Paste: lines go down the rows of this contractor, tab-separated values across the boxes.
function attPaste(ev, inp){
  if(!attEditable()) return;
  const text=(ev.clipboardData || window.clipboardData).getData('text') || '';
  if(!/[\t\n]/.test(text.replace(/\s+$/,''))) return; // a single value: normal paste
  ev.preventDefault();
  const lines=text.replace(/\r/g,'').replace(/\n+$/,'').split('\n');
  const tr0=inp.closest('tr.attMRow'), rows=[...tr0.closest('tbody').querySelectorAll('tr.attMRow')], start=rows.indexOf(tr0), c0=+inp.dataset.c;
  let filled=0, extra=0;
  lines.forEach((ln, i)=>{
    const tr=rows[start+i]; if(!tr){ extra++; return; }
    ln.split('\t').forEach((v, j)=>{ const el=tr.querySelector(`input.attIn[data-c="${c0+j}"]`); if(el && !el.disabled){ el.value=String(v).trim(); attInput(el); } });
    filled++;
  });
  if(extra) alert(`${filled} row(s) filled. ${extra} more line(s) were not used — this contractor has no more employees below.`);
}

/* ---- Find employee ---- */
function attFind(v){
  v=String(v||'').trim().toLowerCase(); if(!v) return;
  const rows=[...document.querySelectorAll('#attGrid tr.attMRow')];
  const nameOf=tr=>tr.querySelector('.attName').textContent.toLowerCase();
  const tr=rows.find(t=>t.dataset.code.toLowerCase()===v) || rows.find(t=>nameOf(t).startsWith(v)) || rows.find(t=>(t.dataset.code+' '+nameOf(t)).toLowerCase().includes(v));
  const box=document.getElementById('attFind');
  if(!tr){ if(box){ box.classList.add('bad'); box.title='No employee matches that.'; } return; }
  if(box){ box.classList.remove('bad'); box.title=''; }
  teSecReveal(tr); teSecKeepInView(tr);
  tr.classList.remove('teDwFlash'); void tr.offsetWidth; tr.classList.add('teDwFlash');
  const inp=tr.querySelector('input.attIn:not(:disabled)'); if(inp){ teSecFocus(inp); inp.select(); }
}
