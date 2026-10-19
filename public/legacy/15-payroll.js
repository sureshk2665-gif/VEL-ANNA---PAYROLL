// Payroll screen filters: they narrow the table, the totals and Print Pay Slips (payroll is always
// generated for every on-roll employee). '' = all; contractor '-' = no contractor.
let payUnitFilter = '';
let payContractorFilter = '';
function payrollFilterMatches(code){
  const e=db.employees.find(x=>x.code===code);
  return (!payUnitFilter || unitCodeOf(e && e.unit)===payUnitFilter) && contractorFilterMatches(e, payContractorFilter);
}
function renderPayroll(){
  const existing = db.payroll[payMonth] || null;
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,payMonth));
  const allRows = existing ? Object.values(existing) : [];
  const rows = allRows.filter(r=>payrollFilterMatches(r.code));
  const filtered = !!(payUnitFilter || payContractorFilter);
  const selText = [payUnitFilter?unitLabel(payUnitFilter):'', payContractorFilter?(payContractorFilter==='-'?'No contractor':contractorName(payContractorFilter)):''].filter(Boolean).join(' · ');
  const totalNet = rows.reduce((s,r)=>s+r.netSalary,0);
  const totalEarnings = rows.reduce((s,r)=>s+(r.earningsTotal||0),0);
  const totalDeductions = rows.reduce((s,r)=>s+(r.deductionsTotal||0),0);
  const unmarkedTotal = rows.reduce((s,r)=>s+(r.unmarkedDays||0),0);
  return `
  ${existing ? `
  <div class="grid">
    <div class="stat" style="--stat-color:#0f6b5c;"><div class="statTop"><div class="statIcon">${ico('users')}</div></div><div class="n">${rows.length}</div><div class="l">Employees Processed</div></div>
    <div class="stat" style="--stat-color:#2563eb;"><div class="statTop"><div class="statIcon">${ico('circle-arrow-down')}</div></div><div class="n">${fmt(totalEarnings)}</div><div class="l">Total Earnings</div></div>
    <div class="stat" style="--stat-color:#dc2626;"><div class="statTop"><div class="statIcon">${ico('circle-arrow-up')}</div></div><div class="n">${fmt(totalDeductions)}</div><div class="l">Total Deductions</div></div>
    <div class="stat" style="--stat-color:#6d28d9;"><div class="statTop"><div class="statIcon">${ico('wallet')}</div></div><div class="n">${fmt(totalNet)}</div><div class="l">Net Salary Payable</div></div>
  </div>` : ''}
  <div class="toolbar">
    <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('payroll')">
    ${hasPerm('payroll','add') || hasPerm('payroll','edit') ? `<button class="btn" onclick="generatePayroll()">${ico('settings')} Generate / Regenerate Payroll</button>` : ''}
    <button class="btn secondary" onclick="render('attendance')">${ico('calendar-days')} Go to Attendance</button>
    <select onchange="payUnitFilter=this.value;render('payroll')" title="Filter by unit">
      <option value="">All Units</option>
      ${unitOptionsHtml(payUnitFilter)}
    </select>
    <select onchange="payContractorFilter=this.value;render('payroll')" title="Filter by contractor">
      ${contractorFilterOptionsHtml(payContractorFilter)}
    </select>
    ${hasPerm('payroll','print') ? `<button class="btn secondary" onclick="openPaySlipDialog()" title="Print pay slips by month, unit, contractor or employee">${ico('printer')} Print Pay Slips…</button>` : ''}
    <span style="font-size:12px;color:var(--muted);margin-left:auto;">NOWD: ${computeWorkingDays(payMonth)} (auto-calculated: Total Days − Sundays − Holidays for ${monthLabel(payMonth)} — see Payroll Process)</span>
  </div>
  <p class="syncNote">Working days, holidays, half-days and LOP are pulled automatically from the Attendance module for ${monthLabel(payMonth)} — days entered in Employee Time Entry count there too — and OT hours and Late minutes from Employee Time Entry. Mark attendance first, then Generate / Regenerate Payroll to sync the latest figures.${unmarkedTotal?` <b>${unmarkedTotal} employee-day(s) this month are still unmarked in Attendance.</b>`:''}</p>

  <div class="panel">
    ${existing ? `<div class="tableScrollWrap"><table class="payrollTable"><thead><tr>
      <th>Code</th><th>Name</th><th class="num">NOWD</th><th class="num">Present</th><th class="num">NOPH</th><th class="num">Half</th><th class="num">LOP</th><th class="num">Days Worked</th><th class="num">OT Hrs</th><th class="num" title="Late minutes this month (first ${lateGraceMinutes()} free)">Late Min</th><th class="num">Earnings</th><th class="num">Deductions</th><th class="num">Net Pay</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr onclick="openSlip('${r.code}','${payMonth}')" title="Click to view Salary Slip">
        <td>${r.code}</td><td class="empNameCell">${r.name}</td><td class="num">${r.nowd}</td><td class="num">${r.presentDays}</td><td class="num">${r.holidayDays}</td><td class="num">${r.halfDayCount}</td><td class="num">${r.lopDays}</td><td class="num">${r.daysWorking}</td><td class="num">${r.otHours}</td><td class="num" title="${r.lateDeduction?`${r.lateChargedMinutes} min × ₹${r.latePerMinute} = ₹${r.lateDeduction} deducted`:'Within the free grace time'}">${r.lateMinutes||0}</td>
        <td class="num">${fmt(r.earningsTotal)}</td><td class="num">${fmt(r.deductionsTotal)}</td><td class="num"><b>${fmt(r.netSalary)}</b></td>
      </tr>`).join('')}
      ${!rows.length ? `<tr><td colspan="13"><div class="empty">No payroll records for ${selText} this month.</div></td></tr>` : ''}
      <tr><td colspan="12" style="text-align:right;"><b>Total Net Salary Paid${filtered?' — '+selText:''}</b></td><td class="num"><b>${fmt(totalNet)}</b></td></tr>
    </tbody></table></div>` : `<div class="empty">${active.length? ''+ico('settings')+' Payroll not generated for this month yet. Click "Generate / Regenerate Payroll" above.' : 'Add employees first.'}</div>`}
  </div>`;
}
function generatePayroll(){
  if(generatePayrollFor(payMonth)) render('payroll');
}
// Generates (or regenerates) payroll for every on-roll employee of a month. Returns true on success.
function generatePayrollFor(ym){
  if(!hasPerm('payroll','add') && !hasPerm('payroll','edit')){ alert('You do not have permission to generate payroll.'); return false; }
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,ym));
  if(!active.length){ alert('No active employees.'); return false; }
  const rec={};
  active.forEach(e=>{ rec[e.code]=computePayrollForEmployee(e,ym); });
  db.payroll[ym]=rec;
  saveDB(db);
  return true;
}

