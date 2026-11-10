// Payroll screen filters: they narrow the table, the totals and Print Pay Slips (payroll is always
// generated for every on-roll employee). '' = all; contractor '-' = no contractor.
let payUnitFilter = '';
let payContractorFilter = '';
function payrollFilterMatches(code){
  const e=db.employees.find(x=>x.code===code);
  return (!payUnitFilter || unitCodeOf(e && e.unit)===payUnitFilter) && contractorFilterMatches(e, payContractorFilter);
}
// The month's payroll rows on screen: always computed from current data (payrollMonthRecords), so
// the list, the totals, the slips and every report agree. null = month not generated yet.
function payrollRowsOnScreen(){
  const all=payrollMonthRecords(payMonth);
  return all ? all.filter(r=>payrollFilterMatches(r.code)) : null;
}
function payrollSelText(){
  return [payUnitFilter?unitLabel(payUnitFilter):'', payContractorFilter?(payContractorFilter==='-'?'Contractor not set':contractorName(payContractorFilter)):''].filter(Boolean).join(' · ');
}
function payShiftMonth(d){ payMonth=nextMonthKey(payMonth, d); render('payroll'); }
/* ---- The Payroll page: money only ----
   Attendance (days, LOP, OT, late) is entered and checked on Attendance; here each employee's month
   shows as Paid days → Earnings − Deductions = Net pay. Every other figure is on the salary slip
   (click a row), in Excel and in the Attendance & OT Register report. */
function paySetUnit(v){ payUnitFilter=v||''; render('payroll'); }
function paySetContractor(v){ payContractorFilter=v||''; render('payroll'); }
function payClearFilters(){ payUnitFilter=''; payContractorFilter=''; render('payroll'); }
function renderPayroll(){
  const generated = payrollGenerated(payMonth);
  const onRoll=payrollEmployeesFor(payMonth);
  const shownEmps=onRoll.filter(e=>payrollFilterMatches(e.code)).length;
  const rows = payrollRowsOnScreen() || [];
  const filtered = !!(payUnitFilter || payContractorFilter);
  const selText = payrollSelText();
  const sum = k => Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const unmarked = sum('unmarkedDays'), unmarkedEmps=rows.filter(r=>+r.unmarkedDays).length;
  const rates = payrollRates(payMonth);
  const canGenerate = hasPerm('payroll','add') || hasPerm('payroll','edit');
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  return `
  <div class="panel payPanel">
    <div class="payBar">
      <div class="payBarGrp">
        <button class="btn secondary payNav" onclick="payShiftMonth(-1)" title="Previous month" aria-label="Previous month">‹</button>
        <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('payroll')" aria-label="Month">
        <button class="btn secondary payNav" onclick="payShiftMonth(1)" title="Next month" aria-label="Next month">›</button>
        <span class="payState ${generated?'on':''}" title="${generated?'Payroll is generated for this month and keeps itself up to date':'Payroll is not generated for this month yet'}">${ico(generated?'circle-check':'circle-dashed')} ${generated?'Generated':'Not generated'}</span>
      </div>
      <div class="payBarGrp payBarRight">
        ${generated && hasPerm('payroll','print') ? `<button class="btn secondary" onclick="openPaySlipDialog()" title="Print pay slips by month, unit, contractor or employee">${ico('printer')} Pay Slips</button>` : ''}
        ${generated && hasPerm('payroll','export') ? `<button class="btn secondary" ${rows.length?'':'disabled'} onclick="downloadPayrollExcel()" title="Every figure on the salary slip, one row per employee">${ico('file-spreadsheet')} Excel</button>` : ''}
        ${canGenerate ? `<button class="btn ${generated?'secondary':''}" onclick="generatePayroll()" title="${generated?'Re-apply today\'s rates (PF / ESI / canteen price / late waiver) to this month':'Process this month'}">${ico('settings')} ${generated?'Regenerate':'Generate Payroll'}</button>` : ''}
      </div>
    </div>
    <div class="teFiltRow">
      <span class="teFiltLbl">${ico('filter')} Filter</span>
      ${sel(payUnitFilter, 'paySetUnit', 'Unit', `<option value="" ${!payUnitFilter?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${payUnitFilter===u.code?'selected':''}>${esc(unitTabLabel(u))}</option>`).join(''))}
      ${sel(payContractorFilter, 'paySetContractor', 'Contractor', contractorFilterOptionsHtml(payContractorFilter))}
      <span class="teFiltCount">${filtered?`<b>${shownEmps}</b> of ${onRoll.length} employees`:`${onRoll.length} employees`}</span>
      ${filtered?`<button type="button" class="teFiltClear" onclick="payClearFilters()">${ico('filter-x')} Clear filters</button>`:''}
    </div>
    ${generated ? `
    <div class="teStatRow payStrip">
      <div class="teStatBox"><b>${rows.length}</b><span>Employees</span></div>
      <div class="teStatBox" title="Present (Half Day = ½) + paid holidays"><b>${sum('daysWorking')}</b><span>Paid days</span></div>
      <div class="teStatBox"><b>${fmt(sum('earningsTotal'))}</b><span>Earnings</span></div>
      <div class="teStatBox"><b>${fmt(sum('deductionsTotal'))}</b><span>Deductions</span></div>
      <div class="teStatBox payNet"><b>${fmt(sum('netSalary'))}</b><span>Net pay</span></div>
    </div>
    ${unmarked?`<div class="payWarn">${ico('alert')} <span>${unmarked} working day${unmarked===1?'':'s'} up to today ${unmarked===1?'is':'are'} not entered in Attendance for ${unmarkedEmps} employee${unmarkedEmps===1?'':'s'} — not paid until entered.</span><button type="button" class="btn secondary" onclick="attTab='summary';attMonth='${payMonth}';render('attendance')">${ico('calendar-days')} See who in Attendance</button></div>`:''}
    <div class="tableScrollWrap payScroll"><table class="payrollTable">
      <thead><tr><th>Code</th><th>Employee</th><th>Contractor</th><th class="num" title="Present (Half Day = ½) + paid holidays">Paid days</th><th class="num" title="Basic + HRA + OT + allowance">Earnings</th><th class="num" title="PF, ESI, canteen, late, advance and other deductions">Deductions</th><th class="num">Net pay</th></tr></thead>
      <tbody>
      ${rows.map(r=>`<tr onclick="openSlip('${r.code}','${payMonth}')" title="Click to open ${esc(r.name)}'s salary slip">
        <td>${esc(r.code)}</td><td class="empNameCell">${esc(r.name)}${+r.unmarkedDays?` <button type="button" class="payMiss" title="${r.unmarkedDays} working day(s) not entered in Attendance — not paid. Click to enter them." onclick="event.stopPropagation();openAttDay('${payMonth}-01','${esc(r.code)}')">${r.unmarkedDays} day${+r.unmarkedDays===1?'':'s'} not entered</button>`:''}</td>
        <td class="payCon">${esc(contractorName(r.contractor)||'—')}</td>
        <td class="num">${r.daysWorking}</td><td class="num">${fmt(r.earningsTotal)}</td><td class="num">${fmt(r.deductionsTotal)}</td><td class="num"><b>${fmt(r.netSalary)}</b></td>
      </tr>`).join('')}
      ${!rows.length ? `<tr><td colspan="7"><div class="empty">No employees on the roll${selText?' for '+esc(selText):''} this month.</div></td></tr>` : `
      <tr class="payTotalRow"><td colspan="3"><b>Total${filtered?' — '+esc(selText):''}</b></td><td class="num"><b>${sum('daysWorking')}</b></td><td class="num"><b>${fmt(sum('earningsTotal'))}</b></td><td class="num"><b>${fmt(sum('deductionsTotal'))}</b></td><td class="num"><b>${fmt(sum('netSalary'))}</b></td></tr>`}
      </tbody></table></div>
    <p class="syncNote">Click an employee for the salary slip (every figure: days, OT, late, PF, ESI, canteen…). Figures follow Attendance by themselves. This month's rates: PF ${+(rates.pfRate*100).toFixed(2)}% of Basic, ESI ${+(rates.esiRate*100).toFixed(2)}% of Earnings, first ${lateGraceMinutes(payMonth)} late minutes free${attIsSimple(payMonth)?' (late beyond them comes off OT hours first)':''} — Regenerate applies changed PF / ESI / canteen rates.</p>`
    : `<div class="payEmpty">
      <div class="payEmptyIcon">${ico(onRoll.length?'wallet':'users')}</div>
      <b>${onRoll.length?`Payroll for ${monthLabel(payMonth)} is not generated yet`:'No employees on the roll this month'}</b>
      <span>${onRoll.length?`${onRoll.length} employee${onRoll.length>1?'s':''} on the roll. Generate it once — after that it keeps itself up to date as attendance changes.`:'Add employees first.'}</span>
      ${onRoll.length && canGenerate ? `<button class="btn" onclick="generatePayroll()">${ico('settings')} Generate Payroll</button>` : ''}
    </div>`}
  </div>`;
}
// Payroll register (Excel): every figure on the salary slip, one row per employee — the same
// columns the report sheets use.
function payrollRegisterColumns(){
  return [
    {header:'Code', key:'code', width:10}, {header:'Name', key:'name', width:24}, {header:'Designation', key:'designation', width:14},
    {header:'Working Unit', key:'unitLabel', width:12}, {header:'Contractor', key:'contractorName', width:22},
    {header:'NOWD', key:'nowd', type:'number', noTotal:true}, {header:'Week Off (Sundays)', key:'weekOffDays', type:'number', noTotal:true}, {header:'Present', key:'presentPaid', type:'number'}, {header:'NOPH', key:'holidayDays', type:'number'},
    {header:'Half Day', key:'halfDayCount', type:'number'}, {header:'LOP', key:'lopDays', type:'number'}, {header:'Not Marked', key:'unmarkedDays', type:'number'},
    {header:'Paid Days', key:'daysWorking', type:'number'}, {header:'Daily Wage', key:'dailyWage', type:'money', noTotal:true},
    {header:'Basic', key:'basicE', type:'money'}, {header:'HRA', key:'hraE', type:'money'},
    {header:'OT Worked Hrs', key:'otHoursWorked', type:'number'}, {header:'OT Hrs (paid)', key:'otHours', type:'number'}, {header:'OT Rate / hr', key:'otPerHourRate', type:'money', noTotal:true}, {header:'OT Amount', key:'otAmount', type:'money'},
    {header:'Other Allowance', key:'otherAllowance', type:'money'}, {header:'GROSS (Basic + OT)', key:'grossSalary', type:'money'}, {header:'Total Earnings', key:'earningsTotal', type:'money'},
    {header:'PF', key:'pf', type:'money'}, {header:'ESI', key:'esi', type:'money'}, {header:'Canteen Tokens', key:'canteenTokens', type:'number'}, {header:'Token Price', key:'canteenTokenPrice', type:'money', noTotal:true}, {header:'Canteen', key:'canteen', type:'money'},
    {header:'Advance', key:'advance', type:'money'}, {header:'Late Min', key:'lateMinutes', type:'number'}, {header:'Late off OT (min)', key:'lateOtMinutes', type:'number'}, {header:'Late Charged Min', key:'lateChargedMinutes', type:'number'},
    {header:'Late Deduction', key:'lateDeduction', type:'money'}, {header:'Others', key:'othersDed', type:'money'},
    {header:'Total Deductions', key:'deductionsTotal', type:'money'}, {header:'Net Pay', key:'netSalary', type:'money'},
    {header:'PF Wages', key:'pfWages', type:'money'}, {header:'PF (Employer)', key:'pfEmployer', type:'money'},
    {header:'ESI Wages', key:'esiWages', type:'money'}, {header:'ESI (Employer)', key:'esiEmployer', type:'money'},
    {header:'PF No', key:'pfNo', width:14}, {header:'UAN', key:'uan', width:14}, {header:'ESI No', key:'esiNo', width:14},
  ];
}
// A payroll record with the employee's current details filled in (for registers and reports).
function payrollRegisterRow(r){
  const e=db.employees.find(x=>x.code===r.code)||{};
  return {...r, name:e.name||r.name, designation:e.designation||r.designation||'', unitLabel:unitLabel(e.unit||r.unit),
    contractorName:contractorName(e)||'', othersDed:(+r.otherDed||0)+(+r.tax||0), presentPaid:payPresentDays(r), weekOffDays:payWeekOff(r, r.month||payMonth),
    otHoursWorked:r.otHoursWorked!==undefined?r.otHoursWorked:r.otHours, lateOtMinutes:+r.lateOtMinutes||0,
    pfNo:e.pfNo||r.pfNo||'', uan:e.uan||r.uan||'', esiNo:e.esiNo||r.esiNo||''};
}
function downloadPayrollExcel(){
  if(!hasPerm('payroll','export')){ alert('You do not have permission to export payroll.'); return; }
  const rows=payrollRowsOnScreen();
  if(!rows || !rows.length){ alert('No payroll to export for this month.'); return; }
  const sel=payrollSelText();
  window.downloadExcel({
    fileName:`${companyFilePrefix()}-Payroll-${monthLabel(payMonth)}${sel?'-'+sel.replace(/[^A-Za-z0-9]+/g,'-'):''}.xlsx`,
    sheets:[{ name:'Payroll '+monthLabel(payMonth), title:`${db.companyName||''} — Payroll Register — ${monthLabel(payMonth)}`,
      subtitle: sel || 'All units · All contractors', columns:payrollRegisterColumns(), rows:rows.map(payrollRegisterRow), totals:true }]
  });
}
function generatePayroll(){
  if(generatePayrollFor(payMonth)) render('payroll');
}
// Generates (or regenerates) payroll for every on-roll employee of a month. Returns true on success.
function generatePayrollFor(ym){
  if(!hasPerm('payroll','add') && !hasPerm('payroll','edit')){ alert('You do not have permission to generate payroll.'); return false; }
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,ym));
  if(!active.length){ alert('No active employees.'); return false; }
  capturePayrollRates(ym); // this month keeps today's PF / ESI / canteen / late-grace rates
  const rec={};
  active.forEach(e=>{ rec[e.code]=computePayrollForEmployee(e,ym); });
  db.payroll[ym]=rec; // marks the month as generated (figures are always recomputed live — payrollMonthRecords)
  saveDB(db);
  return true;
}
