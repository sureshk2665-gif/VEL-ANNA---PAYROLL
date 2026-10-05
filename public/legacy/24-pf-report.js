/* ================= PF REPORT ================= */
// All 12 months (April -> March) that fall inside a Financial Year label like "2025-2026".
function fyMonthKeys(fy){
  const [y1,y2]=fy.split('-').map(Number);
  return monthsInRange(y1+'-04-01', y2+'-03-31');
}
// Yearly, consolidated, employee-wise PF contribution summary for a Financial Year — one row
// per employee (no repeated names), with a Total PF column per processed month plus yearly
// Employee / Employer / Total PF totals, built from the actual PF figures processed each month.
// Unlike the ESI Report, employees who are on-roll but currently have PF Exempted/Nil are still
// listed (with ₹0) so enabling PF for them later automatically starts showing real figures.
function pfReportRows(fy){
  const s=getSettings();
  const months=fyMonthKeys(fy);
  const byEmp={};
  months.forEach(ym=>{
    const rec=db.payroll[ym];
    if(!rec) return;
    Object.values(rec).forEach(r=>{
      const e=db.employees.find(x=>x.code===r.code);
      let pfEmp, pfEmpr;
      if(r.pf!==undefined){
        pfEmp=r.pf||0;
        pfEmpr = r.pfEmployer!==undefined ? r.pfEmployer : Math.round((r.pfWages||0)*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12));
      } else {
        // Payroll generated before PF tracking was added — fall back to the employee's
        // current PF applicability against that month's actual Basic + DA.
        const applicable = e ? !!e.pfApplicable : false;
        const wages=(r.basicE||0)+(r.daE||0);
        pfEmp = applicable ? Math.round(wages*s.pfRate) : 0;
        pfEmpr = applicable ? Math.round(wages*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12)) : 0;
      }
      const pfNoVal = r.pfNo || (e&&e.pfNo) || '';
      const uanVal = r.uan || (e&&e.uan) || '';
      let pfIdentifier='-';
      if(pfNoVal && uanVal) pfIdentifier = pfNoVal+' / '+uanVal;
      else if(pfNoVal || uanVal) pfIdentifier = pfNoVal || uanVal;
      if(!byEmp[r.code]) byEmp[r.code]={
        Code:r.code, Name:r.name, Department:(e&&e.department)||r.department||'-', PFNo:pfIdentifier,
        monthly:{}, totalEmployee:0, totalEmployer:0, totalAll:0
      };
      const rowEmp=byEmp[r.code];
      rowEmp.Department=(e&&e.department)||r.department||rowEmp.Department;
      rowEmp.PFNo=pfIdentifier!=='-' ? pfIdentifier : rowEmp.PFNo;
      rowEmp.monthly[ym]={employee:pfEmp, employer:pfEmpr, total:pfEmp+pfEmpr};
      rowEmp.totalEmployee+=pfEmp;
      rowEmp.totalEmployer+=pfEmpr;
      rowEmp.totalAll+=pfEmp+pfEmpr;
    });
  });
  const rows=Object.values(byEmp).sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
  const processedMonths=months.filter(ym=>db.payroll[ym]);
  const grandTotal={
    employee: rows.reduce((s,r)=>s+r.totalEmployee,0),
    employer: rows.reduce((s,r)=>s+r.totalEmployer,0),
    all: rows.reduce((s,r)=>s+r.totalAll,0)
  };
  return {rows, months:processedMonths, grandTotal};
}
function pfReportTableHtml(rows, months, grandTotal){
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee Code</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th>
    ${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}
    <th>Employee PF Contribution</th><th>Employer PF Contribution</th><th>Total PF Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td><td>${r.PFNo}</td>
      ${months.map(ym=>`<td class="num">${r.monthly[ym]!==undefined?fmt(r.monthly[ym].total):'-'}</td>`).join('')}
      <td class="num">${fmt(r.totalEmployee)}</td><td class="num">${fmt(r.totalEmployer)}</td><td class="num"><b>${fmt(r.totalAll)}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="${4+months.length}" style="text-align:center;">Grand Total</td>
      <td class="num">${fmt(grandTotal.employee)}</td><td class="num">${fmt(grandTotal.employer)}</td><td class="num">${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table></div>`;
}
function printPFReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const {rows,months,grandTotal}=pfReportRows(yearlyFY);
  if(!rows.length){ alert('No PF Contribution Found for Financial Year '+yearlyFY+'.'); return; }
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Financial Year: ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]})</p>
  <table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee Code</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th>
      ${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}
      <th>Employee PF Contribution</th><th>Employer PF Contribution</th><th>Total PF Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td><td>${r.PFNo}</td>
      ${months.map(ym=>`<td>${r.monthly[ym]!==undefined?fmt(r.monthly[ym].total):'-'}</td>`).join('')}
      <td>${fmt(r.totalEmployee)}</td><td>${fmt(r.totalEmployer)}</td><td>${fmt(r.totalAll)}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="${5+months.length}" style="text-align:center;">Grand Total</td>
      <td>${fmt(grandTotal.employee)}</td><td>${fmt(grandTotal.employer)}</td><td>${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('PF Contribution Report — FY '+yearlyFY, tableHtml);
}
/* ================= PF REPORT (MONTHLY) ================= */
// Month-wise, employee-wise PF contribution summary, built from the actual PF figures processed
// in that payroll month. Unlike the ESI Report, every on-roll employee for the month is listed —
// including employees for whom PF is currently Exempted/Nil, who show ₹0 — so enabling PF for
// them later automatically starts showing real figures here without any other change.
function pfMonthlyReportRows(ym){
  const rec=db.payroll[ym]||{};
  const s=getSettings();
  return Object.values(rec)
    .map(r=>{
      const e=db.employees.find(x=>x.code===r.code);
      let pfEmp, pfEmpr;
      if(r.pf!==undefined){
        pfEmp=r.pf||0;
        pfEmpr = r.pfEmployer!==undefined ? r.pfEmployer : Math.round((r.pfWages||0)*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12));
      } else {
        const applicable = e ? !!e.pfApplicable : false;
        const wages=(r.basicE||0)+(r.daE||0);
        pfEmp = applicable ? Math.round(wages*s.pfRate) : 0;
        pfEmpr = applicable ? Math.round(wages*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12)) : 0;
      }
      const pfNoVal = r.pfNo || (e&&e.pfNo) || '';
      const uanVal = r.uan || (e&&e.uan) || '';
      let pfIdentifier='-';
      if(pfNoVal && uanVal) pfIdentifier = pfNoVal+' / '+uanVal;
      else if(pfNoVal || uanVal) pfIdentifier = pfNoVal || uanVal;
      return {
        Code:r.code,
        Name:r.name,
        Department:(e&&e.department)||r.department||'-',
        'PF Number / UAN': pfIdentifier,
        'PF Employee Contribution': pfEmp,
        'PF Employer Contribution': pfEmpr,
        'Total PF Contribution': pfEmp+pfEmpr
      };
    })
    .sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
}
function pfMonthlyReportTotals(rows){
  return {
    totalEmployee: rows.reduce((s,r)=>s+r['PF Employee Contribution'],0),
    totalEmployer: rows.reduce((s,r)=>s+r['PF Employer Contribution'],0),
    grandTotal: rows.reduce((s,r)=>s+r['Total PF Contribution'],0)
  };
}
function pfMonthlyReportTableHtml(rows){
  const {totalEmployee,totalEmployer,grandTotal}=pfMonthlyReportTotals(rows);
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th><th>PF Employee Contribution</th><th>PF Employer Contribution</th><th>Total PF Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td><td>${r['PF Number / UAN']}</td>
      <td class="num">${fmt(r['PF Employee Contribution'])}</td><td class="num">${fmt(r['PF Employer Contribution'])}</td><td class="num"><b>${fmt(r['Total PF Contribution'])}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="4" style="text-align:center;">Total</td>
      <td class="num">${fmt(totalEmployee)}</td><td class="num">${fmt(totalEmployer)}</td><td class="num">${fmt(grandTotal)}</td>
    </tr>
  </tbody></table></div>`;
}
function printPFMonthlyReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const rows=pfMonthlyReportRows(payMonth);
  if(!rows.length){ alert('No PF Contribution Found for '+monthLabel(payMonth)+'.'); return; }
  const {totalEmployee,totalEmployer,grandTotal}=pfMonthlyReportTotals(rows);
  const tableHtml=`<table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th><th>PF Employee Contribution</th><th>PF Employer Contribution</th><th>Total PF Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td><td>${r['PF Number / UAN']}</td>
      <td>${fmt(r['PF Employee Contribution'])}</td><td>${fmt(r['PF Employer Contribution'])}</td><td>${fmt(r['Total PF Contribution'])}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="5" style="text-align:center;">Total</td>
      <td>${fmt(totalEmployee)}</td><td>${fmt(totalEmployer)}</td><td>${fmt(grandTotal)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('PF Contribution Report — '+monthLabel(payMonth), tableHtml);
}
