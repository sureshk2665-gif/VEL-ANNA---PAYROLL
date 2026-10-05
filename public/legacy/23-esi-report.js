/* ================= ESI REPORT ================= */
// Month-wise, employee-wise ESI contribution summary, built from the actual ESI
// figures processed in that payroll month (not recalculated from current employee data).
function esiReportRows(ym){
  const rec=db.payroll[ym]||{};
  const s=getSettings();
  return Object.values(rec)
    .filter(r=>(r.esi||0)>0)
    .map(r=>{
      const e=db.employees.find(x=>x.code===r.code);
      const esiEmployee=r.esi||0;
      // Older payroll records generated before the Employer ESI Rate setting existed
      // won't have esiEmployer stored — fall back to the current rate on the wages that
      // were actually used for that month's Employee ESI.
      const esiEmployer = r.esiEmployer!==undefined ? r.esiEmployer : Math.round((r.esiWages||0)*(s.esiEmployerRate!==undefined?s.esiEmployerRate:0.0325));
      return {
        Code:r.code,
        Name:r.name,
        Department:(e&&e.department)||r.department||'-',
        'ESI Employee Contribution':esiEmployee,
        'ESI Employer Contribution':esiEmployer,
        'Total ESI Contribution':esiEmployee+esiEmployer
      };
    })
    .sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
}
function esiReportTotals(rows){
  return {
    totalEmployee: rows.reduce((s,r)=>s+r['ESI Employee Contribution'],0),
    totalEmployer: rows.reduce((s,r)=>s+r['ESI Employer Contribution'],0),
    grandTotal: rows.reduce((s,r)=>s+r['Total ESI Contribution'],0)
  };
}
function esiReportTableHtml(rows){
  const {totalEmployee,totalEmployer,grandTotal}=esiReportTotals(rows);
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>ESI Employee Contribution</th><th>ESI Employer Contribution</th><th>Total ESI Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td>
      <td class="num">${fmt(r['ESI Employee Contribution'])}</td><td class="num">${fmt(r['ESI Employer Contribution'])}</td><td class="num"><b>${fmt(r['Total ESI Contribution'])}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="3" style="text-align:center;">Total</td>
      <td class="num">${fmt(totalEmployee)}</td><td class="num">${fmt(totalEmployer)}</td><td class="num">${fmt(grandTotal)}</td>
    </tr>
  </tbody></table></div>`;
}
function printESIReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const rows=esiReportRows(payMonth);
  if(!rows.length){ alert('No ESI Contribution Found for '+monthLabel(payMonth)+'.'); return; }
  const {totalEmployee,totalEmployer,grandTotal}=esiReportTotals(rows);
  const tableHtml=`<table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>ESI Employee Contribution</th><th>ESI Employer Contribution</th><th>Total ESI Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>
      <td>${fmt(r['ESI Employee Contribution'])}</td><td>${fmt(r['ESI Employer Contribution'])}</td><td>${fmt(r['Total ESI Contribution'])}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="4" style="text-align:center;">Total</td>
      <td>${fmt(totalEmployee)}</td><td>${fmt(totalEmployer)}</td><td>${fmt(grandTotal)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('ESI Contribution Report — '+monthLabel(payMonth), tableHtml);
}
/* ================= ESI REPORT (YEARLY) ================= */
// Yearly, consolidated, employee-wise ESI contribution summary for a Financial Year — one row
// per employee (no repeated names), with a Total ESI column per month that had a contribution,
// plus yearly Employee / Employer / Total ESI. Only employees with an ESI contribution greater
// than ₹0 in at least one month of the year are listed (same threshold rule as the monthly report).
function esiYearlyReportRows(fy){
  const s=getSettings();
  const months=fyMonthKeys(fy);
  const byEmp={};
  months.forEach(ym=>{
    const rec=db.payroll[ym];
    if(!rec) return;
    Object.values(rec).filter(r=>(r.esi||0)>0).forEach(r=>{
      const e=db.employees.find(x=>x.code===r.code);
      const esiEmp=r.esi||0;
      const esiEmpr = r.esiEmployer!==undefined ? r.esiEmployer : Math.round((r.esiWages||0)*(s.esiEmployerRate!==undefined?s.esiEmployerRate:0.0325));
      if(!byEmp[r.code]) byEmp[r.code]={
        Code:r.code, Name:r.name, Department:(e&&e.department)||r.department||'-',
        monthly:{}, totalEmployee:0, totalEmployer:0, totalAll:0
      };
      const row=byEmp[r.code];
      row.Department=(e&&e.department)||r.department||row.Department;
      row.monthly[ym]={employee:esiEmp, employer:esiEmpr, total:esiEmp+esiEmpr};
      row.totalEmployee+=esiEmp;
      row.totalEmployer+=esiEmpr;
      row.totalAll+=esiEmp+esiEmpr;
    });
  });
  const rows=Object.values(byEmp).sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
  const processedMonths=months.filter(ym=>db.payroll[ym] && Object.values(db.payroll[ym]).some(r=>(r.esi||0)>0));
  const grandTotal={
    employee: rows.reduce((s,r)=>s+r.totalEmployee,0),
    employer: rows.reduce((s,r)=>s+r.totalEmployer,0),
    all: rows.reduce((s,r)=>s+r.totalAll,0)
  };
  return {rows, months:processedMonths, grandTotal};
}
function esiYearlyReportTableHtml(rows, months, grandTotal){
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee Code</th><th>Employee Name</th><th>Department</th>
    ${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}
    <th>Employee ESI Contribution</th><th>Employer ESI Contribution</th><th>Total ESI Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td>
      ${months.map(ym=>`<td class="num">${r.monthly[ym]!==undefined?fmt(r.monthly[ym].total):'-'}</td>`).join('')}
      <td class="num">${fmt(r.totalEmployee)}</td><td class="num">${fmt(r.totalEmployer)}</td><td class="num"><b>${fmt(r.totalAll)}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="${3+months.length}" style="text-align:center;">Grand Total</td>
      <td class="num">${fmt(grandTotal.employee)}</td><td class="num">${fmt(grandTotal.employer)}</td><td class="num">${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table></div>`;
}
function printESIYearlyReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const {rows,months,grandTotal}=esiYearlyReportRows(yearlyFY);
  if(!rows.length){ alert('No ESI Contribution Found for Financial Year '+yearlyFY+'.'); return; }
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Financial Year: ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]})</p>
  <table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee Code</th><th>Employee Name</th><th>Department</th>
      ${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}
      <th>Employee ESI Contribution</th><th>Employer ESI Contribution</th><th>Total ESI Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>
      ${months.map(ym=>`<td>${r.monthly[ym]!==undefined?fmt(r.monthly[ym].total):'-'}</td>`).join('')}
      <td>${fmt(r.totalEmployee)}</td><td>${fmt(r.totalEmployer)}</td><td>${fmt(r.totalAll)}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="${4+months.length}" style="text-align:center;">Grand Total</td>
      <td>${fmt(grandTotal.employee)}</td><td>${fmt(grandTotal.employer)}</td><td>${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('ESI Contribution Report (Yearly) — FY '+yearlyFY, tableHtml);
}
