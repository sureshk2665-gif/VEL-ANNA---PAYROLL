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
  return [payUnitFilter?unitLabel(payUnitFilter):'', payContractorFilter?(payContractorFilter==='-'?'Non Contractor':contractorName(payContractorFilter)):''].filter(Boolean).join(' · ');
}
function renderPayroll(){
  const generated = payrollGenerated(payMonth);
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,payMonth));
  const rows = payrollRowsOnScreen() || [];
  const filtered = !!(payUnitFilter || payContractorFilter);
  const selText = payrollSelText();
  const sum = k => Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const totalNet = sum('netSalary');
  const totalEarnings = sum('earningsTotal');
  const totalDeductions = sum('deductionsTotal');
  const unmarkedTotal = sum('unmarkedDays');
  const rates = payrollRates(payMonth);
  return `
  ${generated ? `
  <div class="grid">
    <div class="stat" style="--stat-color:#0f6b5c;"><div class="statTop"><div class="statIcon">${ico('users')}</div></div><div class="n">${rows.length}</div><div class="l">Employees Processed</div></div>
    <div class="stat" style="--stat-color:#2563eb;"><div class="statTop"><div class="statIcon">${ico('circle-arrow-down')}</div></div><div class="n">${fmt(totalEarnings)}</div><div class="l">Total Earnings</div></div>
    <div class="stat" style="--stat-color:#dc2626;"><div class="statTop"><div class="statIcon">${ico('circle-arrow-up')}</div></div><div class="n">${fmt(totalDeductions)}</div><div class="l">Total Deductions</div></div>
    <div class="stat" style="--stat-color:#6d28d9;"><div class="statTop"><div class="statIcon">${ico('wallet')}</div></div><div class="n">${fmt(totalNet)}</div><div class="l">Net Salary Payable</div></div>
  </div>` : ''}
  <div class="toolbar">
    <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('payroll')">
    ${hasPerm('payroll','add') || hasPerm('payroll','edit') ? `<button class="btn" onclick="generatePayroll()" title="${generated?'Re-apply today\'s rates (PF / ESI / canteen price / late grace) to this month':'Process this month'}">${ico('settings')} ${generated?'Regenerate Payroll':'Generate Payroll'}</button>` : ''}
    <button class="btn secondary" onclick="render('attendance')">${ico('calendar-days')} Go to Attendance</button>
    <select onchange="payUnitFilter=this.value;render('payroll')" title="Filter by unit">
      <option value="">All Units</option>
      ${unitOptionsHtml(payUnitFilter)}
    </select>
    <select onchange="payContractorFilter=this.value;render('payroll')" title="Filter by contractor">
      ${contractorFilterOptionsHtml(payContractorFilter)}
    </select>
    ${hasPerm('payroll','print') ? `<button class="btn secondary" onclick="openPaySlipDialog()" title="Print pay slips by month, unit, contractor or employee">${ico('printer')} Print Pay Slips…</button>` : ''}
    ${generated && hasPerm('payroll','export') ? `<button class="btn secondary" ${rows.length?'':'disabled'} onclick="downloadPayrollExcel()" title="Every figure on the salary slip, one row per employee">${ico('file-spreadsheet')} Excel</button>` : ''}
    <span style="font-size:12px;color:var(--muted);margin-left:auto;">NOWD: ${computeWorkingDays(payMonth)} (auto-calculated: Total Days − Sundays − Holidays for ${monthLabel(payMonth)} — see Payroll Process)</span>
  </div>
  <p class="syncNote">Working days, holidays, half-days and LOP come from the Attendance module for ${monthLabel(payMonth)} — days entered in Employee Time Entry count there too — and OT hours and Late minutes from Employee Time Entry. ${generated?`Every figure here, on the salary slips and in the reports updates by itself when attendance or time entries change — no need to regenerate. Rates for this month: PF ${+(rates.pfRate*100).toFixed(2)}%, ESI ${+(rates.esiRate*100).toFixed(2)}%, canteen ₹${rates.canteenTokenPrice}/token, late grace ${rates.lateGraceMinutes} min (Regenerate to apply changed rates).`:'Generate payroll once for the month; after that it keeps itself up to date.'}${unmarkedTotal?` <b>${unmarkedTotal} working day(s) up to today are not marked in Attendance (not paid).</b>`:''}</p>

  <div class="panel">
    ${generated ? `<div class="tableScrollWrap"><table class="payrollTable"><thead><tr>
      <th>Code</th><th>Name</th><th class="num">NOWD</th><th class="num">Present</th><th class="num">NOPH</th><th class="num">Half</th><th class="num">LOP</th><th class="num" title="Working days up to today with no status in Attendance — not paid">Not Marked</th><th class="num" title="Present + Half Day × 0.5 + NOPH">Paid Days</th><th class="num">OT Hrs</th><th class="num" title="Late minutes this month (first ${rates.lateGraceMinutes} free)">Late Min</th><th class="num">Earnings</th><th class="num">Deductions</th><th class="num">Net Pay</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr onclick="openSlip('${r.code}','${payMonth}')" title="Click to view Salary Slip">
        <td>${r.code}</td><td class="empNameCell">${r.name}</td><td class="num">${r.nowd}</td><td class="num">${r.presentDays}</td><td class="num">${r.holidayDays}</td><td class="num">${r.halfDayCount}</td><td class="num">${r.lopDays}</td><td class="num" style="${r.unmarkedDays?'color:var(--warn);font-weight:600;':''}">${r.unmarkedDays||0}</td><td class="num">${r.daysWorking}</td><td class="num">${r.otHours}</td><td class="num" title="${r.lateDeduction?`${r.lateChargedMinutes} min × ₹${r.latePerMinute} = ₹${r.lateDeduction} deducted`:'Within the free grace time'}">${r.lateMinutes||0}</td>
        <td class="num">${fmt(r.earningsTotal)}</td><td class="num">${fmt(r.deductionsTotal)}</td><td class="num"><b>${fmt(r.netSalary)}</b></td>
      </tr>`).join('')}
      ${!rows.length ? `<tr><td colspan="14"><div class="empty">No employees on the roll${selText?' for '+selText:''} this month.</div></td></tr>` : `
      <tr class="payTotalRow"><td colspan="3"><b>Total${filtered?' — '+selText:''}</b></td><td class="num"><b>${sum('presentDays')}</b></td><td class="num"><b>${sum('holidayDays')}</b></td><td class="num"><b>${sum('halfDayCount')}</b></td><td class="num"><b>${sum('lopDays')}</b></td><td class="num"><b>${unmarkedTotal}</b></td><td class="num"><b>${sum('daysWorking')}</b></td><td class="num"><b>${sum('otHours')}</b></td><td class="num"><b>${sum('lateMinutes')}</b></td><td class="num"><b>${fmt(totalEarnings)}</b></td><td class="num"><b>${fmt(totalDeductions)}</b></td><td class="num"><b>${fmt(totalNet)}</b></td></tr>`}
    </tbody></table></div>` : `<div class="empty">${active.length? ''+ico('settings')+' Payroll not generated for this month yet. Click "Generate Payroll" above.' : 'Add employees first.'}</div>`}
  </div>`;
}
// Payroll register (Excel): every figure on the salary slip, one row per employee — the same
// columns the report sheets use.
function payrollRegisterColumns(){
  return [
    {header:'Code', key:'code', width:10}, {header:'Name', key:'name', width:24}, {header:'Designation', key:'designation', width:14},
    {header:'Working Unit', key:'unitLabel', width:12}, {header:'Contractor', key:'contractorName', width:22}, {header:'Payment Mode', key:'mode', width:10},
    {header:'NOWD', key:'nowd', type:'number', noTotal:true}, {header:'Present', key:'presentDays', type:'number'}, {header:'NOPH', key:'holidayDays', type:'number'},
    {header:'Half Day', key:'halfDayCount', type:'number'}, {header:'LOP', key:'lopDays', type:'number'}, {header:'Not Marked', key:'unmarkedDays', type:'number'},
    {header:'Paid Days', key:'daysWorking', type:'number'}, {header:'Daily Wage', key:'dailyWage', type:'money', noTotal:true},
    {header:'Basic', key:'basicE', type:'money'}, {header:'HRA', key:'hraE', type:'money'},
    {header:'OT Hrs', key:'otHours', type:'number'}, {header:'OT Rate / hr', key:'otPerHourRate', type:'money', noTotal:true}, {header:'OT Amount', key:'otAmount', type:'money'},
    {header:'Other Allowance', key:'otherAllowance', type:'money'}, {header:'GROSS (Basic + OT)', key:'grossSalary', type:'money'}, {header:'Total Earnings', key:'earningsTotal', type:'money'},
    {header:'ESI', key:'esi', type:'money'}, {header:'PF', key:'pf', type:'money'}, {header:'Canteen Tokens', key:'canteenTokens', type:'number'}, {header:'Canteen', key:'canteen', type:'money'},
    {header:'Advance', key:'advance', type:'money'}, {header:'Late Min', key:'lateMinutes', type:'number'}, {header:'Late Charged Min', key:'lateChargedMinutes', type:'number'},
    {header:'Late Deduction', key:'lateDeduction', type:'money'}, {header:'Others', key:'othersDed', type:'money'},
    {header:'Total Deductions', key:'deductionsTotal', type:'money'}, {header:'Net Pay', key:'netSalary', type:'money'},
    {header:'ESI Wages', key:'esiWages', type:'money'}, {header:'ESI (Employer)', key:'esiEmployer', type:'money'},
    {header:'PF Wages', key:'pfWages', type:'money'}, {header:'PF (Employer)', key:'pfEmployer', type:'money'},
    {header:'PF No', key:'pfNo', width:14}, {header:'UAN', key:'uan', width:14}, {header:'ESI No', key:'esiNo', width:14},
  ];
}
// A payroll record with the employee's current details filled in (for registers and reports).
function payrollRegisterRow(r){
  const e=db.employees.find(x=>x.code===r.code)||{};
  return {...r, name:e.name||r.name, designation:e.designation||r.designation||'', unitLabel:unitLabel(e.unit||r.unit),
    contractorName:contractorName(e)||'', mode:e.mode||r.mode||'', othersDed:(+r.otherDed||0)+(+r.tax||0),
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

