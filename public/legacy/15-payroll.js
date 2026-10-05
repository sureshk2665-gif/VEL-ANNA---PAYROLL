function renderPayroll(){
  const existing = db.payroll[payMonth] || null;
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,payMonth));
  const rows = existing ? Object.values(existing) : [];
  const totalNet = rows.reduce((s,r)=>s+r.netSalary,0);
  const totalEarnings = rows.reduce((s,r)=>s+(r.earningsTotal||0),0);
  const totalDeductions = rows.reduce((s,r)=>s+(r.deductionsTotal||0),0);
  const unmarkedTotal = rows.reduce((s,r)=>s+(r.unmarkedDays||0),0);
  return `
  ${existing ? `
  <div class="grid">
    <div class="stat" style="--stat-color:#0f6b5c;"><div class="statTop"><div class="statIcon">👥</div></div><div class="n">${rows.length}</div><div class="l">Employees Processed</div></div>
    <div class="stat" style="--stat-color:#2563eb;"><div class="statTop"><div class="statIcon">📥</div></div><div class="n">${fmt(totalEarnings)}</div><div class="l">Total Earnings</div></div>
    <div class="stat" style="--stat-color:#dc2626;"><div class="statTop"><div class="statIcon">📤</div></div><div class="n">${fmt(totalDeductions)}</div><div class="l">Total Deductions</div></div>
    <div class="stat" style="--stat-color:#6d28d9;"><div class="statTop"><div class="statIcon">💰</div></div><div class="n">${fmt(totalNet)}</div><div class="l">Net Salary Payable</div></div>
  </div>` : ''}
  <div class="toolbar">
    <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('payroll')">
    ${hasPerm('payroll','add') || hasPerm('payroll','edit') ? `<button class="btn" onclick="generatePayroll()">⚙️ Generate / Regenerate Payroll</button>` : ''}
    <button class="btn secondary" onclick="render('attendance')">🗓️ Go to Attendance</button>
    ${existing && hasPerm('payroll','print') ? `<button class="btn secondary" onclick="printAllSlips('Unit-1')">🖨️ Employee Pay Slip Unit 1</button>
    <button class="btn secondary" onclick="printAllSlips('Unit-2')">🖨️ Employee Pay Slip Unit 2</button>` : ''}
    <span style="font-size:12px;color:var(--muted);margin-left:auto;">NOWD: ${computeWorkingDays(payMonth)} (auto-calculated: Total Days − Sundays − Holidays for ${monthLabel(payMonth)} — see Payroll Process)</span>
  </div>
  <p class="syncNote">Working days, leave, holidays, half-days, LOP and OT hours are pulled automatically from the Attendance module for ${monthLabel(payMonth)}. Mark attendance first, then Generate / Regenerate Payroll to sync the latest figures.${unmarkedTotal?` <b>${unmarkedTotal} employee-day(s) this month are still unmarked in Attendance.</b>`:''}</p>

  <div class="panel">
    ${existing ? `<div class="tableScrollWrap"><table class="payrollTable"><thead><tr>
      <th>Code</th><th>Name</th><th class="num">NOWD</th><th class="num">Present</th><th class="num">Leave (NOPL)</th><th class="num">NOPL Bal.</th><th class="num">NOPH</th><th class="num">Half</th><th class="num">LOP</th><th class="num">Days Worked</th><th class="num">OT Hrs</th><th class="num">Earnings</th><th class="num">Deductions</th><th class="num">Net Pay</th>
    </tr></thead><tbody>
      ${rows.map(r=>`<tr onclick="openSlip('${r.code}','${payMonth}')" title="Click to view Salary Slip">
        <td>${r.code}</td><td class="empNameCell">${r.name}</td><td class="num">${r.nowd}</td><td class="num">${r.presentDays}</td><td class="num">${r.leaveDays}</td><td class="num">${r.noplBalance}</td><td class="num">${r.holidayDays}</td><td class="num">${r.halfDayCount}</td><td class="num">${r.lopDays}</td><td class="num">${r.daysWorking}</td><td class="num">${r.otHours}</td>
        <td class="num">${fmt(r.earningsTotal)}</td><td class="num">${fmt(r.deductionsTotal)}</td><td class="num"><b>${fmt(r.netSalary)}</b></td>
      </tr>`).join('')}
      <tr><td colspan="13" style="text-align:right;"><b>Total Net Salary Paid</b></td><td class="num"><b>${fmt(totalNet)}</b></td></tr>
    </tbody></table></div>` : `<div class="empty">${active.length? '⚙️ Payroll not generated for this month yet. Click "Generate / Regenerate Payroll" above.' : 'Add employees first.'}</div>`}
  </div>`;
}
function generatePayroll(){
  if(!hasPerm('payroll','add') && !hasPerm('payroll','edit')){ alert('You do not have permission to generate payroll.'); return; }
  const active=db.employees.filter(e=>isEmpOnRollInMonth(e,payMonth));
  if(!active.length){ alert('No active employees.'); return; }
  const rec={};
  active.forEach(e=>{ rec[e.code]=computePayrollForEmployee(e,payMonth); });
  db.payroll[payMonth]=rec;
  saveDB(db);
  render('payroll');
}

