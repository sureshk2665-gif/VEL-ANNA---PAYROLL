/* ================= PF REPORT ================= */
// All 12 months (April -> March) that fall inside a Financial Year label like "2025-2026".
function fyMonthKeys(fy){
  const [y1,y2]=fy.split('-').map(Number);
  return monthsInRange(y1+'-04-01', y2+'-03-31');
}
// FY months up to the current month whose payroll has not been generated yet.
function fyMonthsNotGenerated(fy){
  const cur=todayStr().slice(0,7);
  return fyMonthKeys(fy).filter(ym=>ym<=cur && !payrollGenerated(ym));
}
// Visible note for the yearly statutory reports (screen and PDF) listing those months.
function fyNotGeneratedNoteHtml(fy){
  const list=fyMonthsNotGenerated(fy);
  if(!list.length) return '';
  return `<p class="syncNote" style="font-size:11px;margin:0 0 6px;">Payroll not generated yet for: <b>${list.map(monthLabel).join(', ')}</b> — these months are not included below.</p>`;
}
// PF figures for one live payroll record. Records from before PF tracking (no pf field) fall back
// to the employee's current PF applicability against that month's PF wages (or Basic).
function pfFiguresOf(r, e, s){
  const emprRate=s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12;
  if(r.pf!==undefined){
    const wages=r.pfWages||0;
    return {wages, employee:r.pf||0, employer:r.pfEmployer!==undefined ? (r.pfEmployer||0) : Math.round(wages*emprRate)};
  }
  const applicable = e ? !!e.pfApplicable : false;
  const wages=r.pfWages||r.basicE||0;
  return {
    wages: applicable ? wages : 0,
    employee: applicable ? Math.round(wages*s.pfRate) : 0,
    employer: applicable ? Math.round(wages*emprRate) : 0
  };
}
function pfIdentifierOf(id){
  if(id.pfNo && id.uan) return id.pfNo+' / '+id.uan;
  return id.pfNo || id.uan || '-';
}
// Yearly, consolidated, employee-wise PF contribution summary for a Financial Year — one row
// per employee (no repeated names), with a Total PF column per generated month plus yearly
// Employee / Employer / Total PF totals, computed live from each generated month.
// Unlike the ESI Report, employees who are on-roll but currently have PF Exempted/Nil are still
// listed (with ₹0) so enabling PF for them later automatically starts showing real figures.
function pfReportRows(fy){
  const s=getSettings();
  const months=fyMonthKeys(fy).filter(ym=>payrollGenerated(ym));
  const byEmp={};
  months.forEach(ym=>{
    const list=payrollMonthRecords(ym);
    if(!list) return;
    list.forEach(r=>{
      const id=reportEmpIdentity(r);
      const f=pfFiguresOf(r, id.emp, s);
      if(!byEmp[r.code]) byEmp[r.code]={
        Code:r.code, Name:id.name, Department:id.department, PFNo:pfIdentifierOf(id),
        monthly:{}, totalEmployee:0, totalEmployer:0, totalAll:0
      };
      const rowEmp=byEmp[r.code];
      rowEmp.monthly[ym]={employee:f.employee, employer:f.employer, total:f.employee+f.employer};
      rowEmp.totalEmployee+=f.employee;
      rowEmp.totalEmployer+=f.employer;
      rowEmp.totalAll+=f.employee+f.employer;
    });
  });
  const rows=Object.values(byEmp).sort((a,b)=>String(a.Code).localeCompare(String(b.Code),undefined,{numeric:true}));
  const grandTotal={
    employee: rows.reduce((s,r)=>s+r.totalEmployee,0),
    employer: rows.reduce((s,r)=>s+r.totalEmployer,0),
    all: rows.reduce((s,r)=>s+r.totalAll,0)
  };
  return {rows, months, grandTotal, notGenerated:fyMonthsNotGenerated(fy)};
}
function pfYearlyMonthTotals(rows, months){
  const t={}; months.forEach(ym=>{ t[ym]=rows.reduce((s,r)=>s+(r.monthly[ym]?r.monthly[ym].total:0),0); }); return t;
}
function pfReportTableHtml(rows, months, grandTotal, fy){
  const mt=pfYearlyMonthTotals(rows, months);
  return `${fyNotGeneratedNoteHtml(fy||yearlyFY)}<div class="tableScrollWrap"><table><thead><tr>
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
      <td colspan="4" style="text-align:center;">Grand Total</td>
      ${months.map(ym=>`<td class="num">${fmt(mt[ym])}</td>`).join('')}
      <td class="num">${fmt(grandTotal.employee)}</td><td class="num">${fmt(grandTotal.employer)}</td><td class="num">${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table></div>`;
}
function printPFReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const {rows,months,grandTotal}=pfReportRows(yearlyFY);
  if(!rows.length){ alert('No PF Contribution Found for Financial Year '+yearlyFY+'.'); return; }
  const mt=pfYearlyMonthTotals(rows, months);
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Financial Year: ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]})</p>
  ${fyNotGeneratedNoteHtml(yearlyFY)}
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
      <td colspan="5" style="text-align:center;">Grand Total</td>
      ${months.map(ym=>`<td>${fmt(mt[ym])}</td>`).join('')}
      <td>${fmt(grandTotal.employee)}</td><td>${fmt(grandTotal.employer)}</td><td>${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('PF Contribution Report — FY '+yearlyFY, tableHtml, {orientation:'landscape'});
}
// Excel version of the PF (Yearly) report for the selected FY — same rows/totals as screen/PDF.
function pfYearlyExcelSpec(){
  const fy=yearlyFY;
  const {rows,months,notGenerated}=pfReportRows(fy);
  if(!rows.length) return null;
  const mKey=ym=>'m_'+ym.replace('-','_');
  return {
    fileName:`${companyFilePrefix()}-PF-Report-FY-${fy}.xlsx`,
    sheets:[{
      name:'PF FY '+fy,
      title:(db.companyName||'')+(db.companyName?' — ':'')+'PF Contribution Report — FY '+fy,
      subtitle:'Financial Year: '+fy+' (Apr '+fy.split('-')[0]+' – Mar '+fy.split('-')[1]+')'+(notGenerated.length?' | Payroll not generated yet: '+notGenerated.map(monthLabel).join(', '):''),
      columns:[
        {header:'Employee Code', key:'code', width:12, type:'text'},
        {header:'Employee Name', key:'name', width:28, type:'text'},
        {header:'Department', key:'department', width:18, type:'text'},
        {header:'PF Number / UAN', key:'pfNo', width:26, type:'text'},
        ...months.map(ym=>({header:monthLabel(ym), key:mKey(ym), width:12, type:'money'})),
        {header:'Employee PF Contribution', key:'employee', width:16, type:'money'},
        {header:'Employer PF Contribution', key:'employer', width:16, type:'money'},
        {header:'Total PF Contribution', key:'total', width:16, type:'money'}
      ],
      rows:rows.map(r=>{
        const o={code:r.Code, name:r.Name, department:r.Department, pfNo:r.PFNo==='-'?'':r.PFNo, employee:r.totalEmployee, employer:r.totalEmployer, total:r.totalAll};
        months.forEach(ym=>{ o[mKey(ym)]=r.monthly[ym]!==undefined?r.monthly[ym].total:''; });
        return o;
      }),
      totals:true
    }]
  };
}
/* ================= PF REPORT (MONTHLY) ================= */
// Month-wise, employee-wise PF contribution summary, computed live for the generated payroll
// month. Unlike the ESI Report, every on-roll employee for the month is listed —
// including employees for whom PF is currently Exempted/Nil, who show ₹0 — so enabling PF for
// them later automatically starts showing real figures here without any other change.
function pfMonthlyReportRows(ym){
  const list=payrollMonthRecords(ym)||[];
  const s=getSettings();
  return list
    .map(r=>{
      const id=reportEmpIdentity(r);
      const f=pfFiguresOf(r, id.emp, s);
      return {
        Code:r.code,
        Name:id.name,
        Department:id.department,
        'PF Number / UAN': pfIdentifierOf(id),
        'Paid Days': r.daysWorking||0,
        'PF Wages': f.wages,
        'PF Employee Contribution': f.employee,
        'PF Employer Contribution': f.employer,
        'Total PF Contribution': f.employee+f.employer
      };
    })
    .sort((a,b)=>String(a.Code).localeCompare(String(b.Code),undefined,{numeric:true}));
}
function pfMonthlyReportTotals(rows){
  return {
    totalWages: rows.reduce((s,r)=>s+r['PF Wages'],0),
    totalEmployee: rows.reduce((s,r)=>s+r['PF Employee Contribution'],0),
    totalEmployer: rows.reduce((s,r)=>s+r['PF Employer Contribution'],0),
    grandTotal: rows.reduce((s,r)=>s+r['Total PF Contribution'],0)
  };
}
function pfMonthlyReportTableHtml(rows){
  const {totalWages,totalEmployee,totalEmployer,grandTotal}=pfMonthlyReportTotals(rows);
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th><th>Paid Days</th><th>PF Wages</th><th>PF Employee Contribution</th><th>PF Employer Contribution</th><th>Total PF Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td><td>${r['PF Number / UAN']}</td>
      <td class="num">${r['Paid Days']}</td><td class="num">${fmt(r['PF Wages'])}</td>
      <td class="num">${fmt(r['PF Employee Contribution'])}</td><td class="num">${fmt(r['PF Employer Contribution'])}</td><td class="num"><b>${fmt(r['Total PF Contribution'])}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="5" style="text-align:center;">Total</td>
      <td class="num">${fmt(totalWages)}</td><td class="num">${fmt(totalEmployee)}</td><td class="num">${fmt(totalEmployer)}</td><td class="num">${fmt(grandTotal)}</td>
    </tr>
  </tbody></table></div>`;
}
function printPFMonthlyReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const rows=pfMonthlyReportRows(payMonth);
  if(!rows.length){ alert('No PF Contribution Found for '+monthLabel(payMonth)+'.'); return; }
  const {totalWages,totalEmployee,totalEmployer,grandTotal}=pfMonthlyReportTotals(rows);
  const tableHtml=`<table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>PF Number / UAN</th><th>Paid Days</th><th>PF Wages</th><th>PF Employee Contribution</th><th>PF Employer Contribution</th><th>Total PF Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td><td>${r['PF Number / UAN']}</td>
      <td>${r['Paid Days']}</td><td>${fmt(r['PF Wages'])}</td>
      <td>${fmt(r['PF Employee Contribution'])}</td><td>${fmt(r['PF Employer Contribution'])}</td><td>${fmt(r['Total PF Contribution'])}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="6" style="text-align:center;">Total</td>
      <td>${fmt(totalWages)}</td><td>${fmt(totalEmployee)}</td><td>${fmt(totalEmployer)}</td><td>${fmt(grandTotal)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('PF Contribution Report — '+monthLabel(payMonth), tableHtml, {orientation:'landscape'});
}
// Excel version of the PF (Monthly) report for the selected month — same rows/totals as screen/PDF.
function pfMonthlyExcelSpec(){
  const ym=payMonth;
  if(!payrollGenerated(ym)) return null;
  const rows=pfMonthlyReportRows(ym);
  if(!rows.length) return null;
  return {
    fileName:`${companyFilePrefix()}-PF-Report-${monthLabel(ym)}.xlsx`,
    sheets:[{
      name:'PF '+monthLabel(ym),
      title:(db.companyName||'')+(db.companyName?' — ':'')+'PF Contribution Report — '+monthLabel(ym),
      subtitle:rows.length+' employee'+(rows.length===1?'':'s')+' | Generated on '+fmtDate(todayStr()),
      columns:[
        {header:'Employee ID', key:'code', width:12, type:'text'},
        {header:'Employee Name', key:'name', width:28, type:'text'},
        {header:'Department', key:'department', width:18, type:'text'},
        {header:'PF Number / UAN', key:'pfNo', width:26, type:'text'},
        {header:'Paid Days', key:'paidDays', width:10, type:'number', noTotal:true},
        {header:'PF Wages', key:'pfWages', width:14, type:'money'},
        {header:'PF Employee Contribution', key:'employee', width:16, type:'money'},
        {header:'PF Employer Contribution', key:'employer', width:16, type:'money'},
        {header:'Total PF Contribution', key:'total', width:16, type:'money'}
      ],
      rows:rows.map(r=>({code:r.Code, name:r.Name, department:r.Department, pfNo:r['PF Number / UAN']==='-'?'':r['PF Number / UAN'], paidDays:r['Paid Days'], pfWages:r['PF Wages'], employee:r['PF Employee Contribution'], employer:r['PF Employer Contribution'], total:r['Total PF Contribution']})),
      totals:true
    }]
  };
}
