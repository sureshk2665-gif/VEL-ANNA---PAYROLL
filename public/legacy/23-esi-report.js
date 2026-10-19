/* ================= ESI REPORT ================= */
// Month-wise, employee-wise ESI contribution summary, built LIVE from the generated payroll month
// (payrollMonthRecords — current attendance / time entry / wages), so it always matches the slips.
function esiEmployerOf(r, s){
  // Older payroll records generated before the Employer ESI Rate setting existed
  // won't have esiEmployer stored — fall back to the current rate on that month's ESI wages.
  return r.esiEmployer!==undefined ? (r.esiEmployer||0) : Math.round((r.esiWages||0)*(s.esiEmployerRate!==undefined?s.esiEmployerRate:0.0325));
}
// ESI rows include an employee when ESI is currently applicable to them or the live record has ESI > 0.
function esiRowIncluded(r, e){ return !!(e && e.esiApplicable) || (r.esi||0)>0; }
function esiReportRows(ym){
  const list=payrollMonthRecords(ym)||[];
  const s=getSettings();
  return list
    .map(r=>{
      const id=reportEmpIdentity(r);
      if(!esiRowIncluded(r, id.emp)) return null;
      const esiEmployee=r.esi||0;
      const esiEmployer=esiEmployerOf(r, s);
      return {
        Code:r.code,
        Name:id.name,
        Department:id.department,
        'ESI No':id.esiNo||'-',
        'Paid Days':r.daysWorking||0,
        'ESI Wages':r.esiWages||0,
        'ESI Employee Contribution':esiEmployee,
        'ESI Employer Contribution':esiEmployer,
        'Total ESI Contribution':esiEmployee+esiEmployer
      };
    })
    .filter(Boolean)
    .sort((a,b)=>String(a.Code).localeCompare(String(b.Code),undefined,{numeric:true}));
}
function esiReportTotals(rows){
  return {
    totalWages: rows.reduce((s,r)=>s+r['ESI Wages'],0),
    totalEmployee: rows.reduce((s,r)=>s+r['ESI Employee Contribution'],0),
    totalEmployer: rows.reduce((s,r)=>s+r['ESI Employer Contribution'],0),
    grandTotal: rows.reduce((s,r)=>s+r['Total ESI Contribution'],0)
  };
}
function esiReportTableHtml(rows){
  const {totalWages,totalEmployee,totalEmployer,grandTotal}=esiReportTotals(rows);
  return `<div class="tableScrollWrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee Name</th><th>Department</th><th>ESI No</th><th>Paid Days</th><th>ESI Wages</th><th>ESI Employee Contribution</th><th>ESI Employer Contribution</th><th>Total ESI Contribution</th>
  </tr></thead><tbody>
    ${rows.map(r=>`<tr>
      <td>${r.Code}</td><td class="empNameCell"><span class="avatarChip">${initials(r.Name)}</span>${r.Name}</td><td>${r.Department}</td><td>${r['ESI No']}</td>
      <td class="num">${r['Paid Days']}</td><td class="num">${fmt(r['ESI Wages'])}</td>
      <td class="num">${fmt(r['ESI Employee Contribution'])}</td><td class="num">${fmt(r['ESI Employer Contribution'])}</td><td class="num"><b>${fmt(r['Total ESI Contribution'])}</b></td>
    </tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;">
      <td colspan="5" style="text-align:center;">Total</td>
      <td class="num">${fmt(totalWages)}</td><td class="num">${fmt(totalEmployee)}</td><td class="num">${fmt(totalEmployer)}</td><td class="num">${fmt(grandTotal)}</td>
    </tr>
  </tbody></table></div>`;
}
function printESIReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const rows=esiReportRows(payMonth);
  if(!rows.length){ alert('No ESI Contribution Found for '+monthLabel(payMonth)+'.'); return; }
  const {totalWages,totalEmployee,totalEmployer,grandTotal}=esiReportTotals(rows);
  const tableHtml=`<table class="repTable"><thead><tr>
      <th>S.No</th><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>ESI No</th><th>Paid Days</th><th>ESI Wages</th><th>ESI Employee Contribution</th><th>ESI Employer Contribution</th><th>Total ESI Contribution</th>
    </tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td><td>${r['ESI No']}</td>
      <td>${r['Paid Days']}</td><td>${fmt(r['ESI Wages'])}</td>
      <td>${fmt(r['ESI Employee Contribution'])}</td><td>${fmt(r['ESI Employer Contribution'])}</td><td>${fmt(r['Total ESI Contribution'])}</td>
    </tr>`).join('')}
    <tr class="subtotal">
      <td colspan="6" style="text-align:center;">Total</td>
      <td>${fmt(totalWages)}</td><td>${fmt(totalEmployee)}</td><td>${fmt(totalEmployer)}</td><td>${fmt(grandTotal)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('ESI Contribution Report — '+monthLabel(payMonth), tableHtml, {orientation:'landscape'});
}
// Excel version of the ESI (Monthly) report for the selected month — same rows/totals as screen/PDF.
function esiExcelSpec(){
  const ym=payMonth;
  if(!payrollGenerated(ym)) return null;
  const rows=esiReportRows(ym);
  if(!rows.length) return null;
  return {
    fileName:`${companyFilePrefix()}-ESI-Report-${monthLabel(ym)}.xlsx`,
    sheets:[{
      name:'ESI '+monthLabel(ym),
      title:(db.companyName||'')+(db.companyName?' — ':'')+'ESI Contribution Report — '+monthLabel(ym),
      subtitle:rows.length+' employee'+(rows.length===1?'':'s')+' | Generated on '+fmtDate(todayStr()),
      columns:[
        {header:'Employee ID', key:'code', width:12, type:'text'},
        {header:'Employee Name', key:'name', width:28, type:'text'},
        {header:'Department', key:'department', width:18, type:'text'},
        {header:'ESI No', key:'esiNo', width:16, type:'text'},
        {header:'Paid Days', key:'paidDays', width:10, type:'number', noTotal:true},
        {header:'ESI Wages', key:'esiWages', width:14, type:'money'},
        {header:'ESI Employee Contribution', key:'employee', width:16, type:'money'},
        {header:'ESI Employer Contribution', key:'employer', width:16, type:'money'},
        {header:'Total ESI Contribution', key:'total', width:16, type:'money'}
      ],
      rows:rows.map(r=>({code:r.Code, name:r.Name, department:r.Department, esiNo:r['ESI No']==='-'?'':r['ESI No'], paidDays:r['Paid Days'], esiWages:r['ESI Wages'], employee:r['ESI Employee Contribution'], employer:r['ESI Employer Contribution'], total:r['Total ESI Contribution']})),
      totals:true
    }]
  };
}
/* ================= ESI REPORT (YEARLY) ================= */
// Yearly, consolidated, employee-wise ESI contribution summary for a Financial Year — one row
// per employee (no repeated names), with a Total ESI column for every generated month of the FY,
// plus yearly Employee / Employer / Total ESI, built live from each generated month. An employee
// is listed when ESI is currently applicable to them or they had live ESI > 0 in any month.
function esiYearlyReportRows(fy){
  const s=getSettings();
  const months=fyMonthKeys(fy).filter(ym=>payrollGenerated(ym));
  const byEmp={};
  months.forEach(ym=>{
    const list=payrollMonthRecords(ym);
    if(!list) return;
    list.forEach(r=>{
      const id=reportEmpIdentity(r);
      if(!esiRowIncluded(r, id.emp)) return;
      const esiEmp=r.esi||0;
      const esiEmpr=esiEmployerOf(r, s);
      if(!byEmp[r.code]) byEmp[r.code]={
        Code:r.code, Name:id.name, Department:id.department,
        monthly:{}, totalEmployee:0, totalEmployer:0, totalAll:0
      };
      const row=byEmp[r.code];
      row.monthly[ym]={employee:esiEmp, employer:esiEmpr, total:esiEmp+esiEmpr};
      row.totalEmployee+=esiEmp;
      row.totalEmployer+=esiEmpr;
      row.totalAll+=esiEmp+esiEmpr;
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
function esiYearlyMonthTotals(rows, months){
  const t={}; months.forEach(ym=>{ t[ym]=rows.reduce((s,r)=>s+(r.monthly[ym]?r.monthly[ym].total:0),0); }); return t;
}
function esiYearlyReportTableHtml(rows, months, grandTotal, fy){
  const mt=esiYearlyMonthTotals(rows, months);
  return `${fyNotGeneratedNoteHtml(fy||yearlyFY)}<div class="tableScrollWrap"><table><thead><tr>
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
      <td colspan="3" style="text-align:center;">Grand Total</td>
      ${months.map(ym=>`<td class="num">${fmt(mt[ym])}</td>`).join('')}
      <td class="num">${fmt(grandTotal.employee)}</td><td class="num">${fmt(grandTotal.employer)}</td><td class="num">${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table></div>`;
}
function printESIYearlyReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  const {rows,months,grandTotal}=esiYearlyReportRows(yearlyFY);
  if(!rows.length){ alert('No ESI Contribution Found for Financial Year '+yearlyFY+'.'); return; }
  const mt=esiYearlyMonthTotals(rows, months);
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Financial Year: ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]})</p>
  ${fyNotGeneratedNoteHtml(yearlyFY)}
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
      <td colspan="4" style="text-align:center;">Grand Total</td>
      ${months.map(ym=>`<td>${fmt(mt[ym])}</td>`).join('')}
      <td>${fmt(grandTotal.employee)}</td><td>${fmt(grandTotal.employer)}</td><td>${fmt(grandTotal.all)}</td>
    </tr>
  </tbody></table>`;
  openPrintWindow('ESI Contribution Report (Yearly) — FY '+yearlyFY, tableHtml, {orientation:'landscape'});
}
// Excel version of the ESI (Yearly) report for the selected FY — same rows/totals as screen/PDF.
function esiYearlyExcelSpec(){
  const fy=yearlyFY;
  const {rows,months,notGenerated}=esiYearlyReportRows(fy);
  if(!rows.length) return null;
  const mKey=ym=>'m_'+ym.replace('-','_');
  return {
    fileName:`${companyFilePrefix()}-ESI-Report-FY-${fy}.xlsx`,
    sheets:[{
      name:'ESI FY '+fy,
      title:(db.companyName||'')+(db.companyName?' — ':'')+'ESI Contribution Report (Yearly) — FY '+fy,
      subtitle:'Financial Year: '+fy+' (Apr '+fy.split('-')[0]+' – Mar '+fy.split('-')[1]+')'+(notGenerated.length?' | Payroll not generated yet: '+notGenerated.map(monthLabel).join(', '):''),
      columns:[
        {header:'Employee Code', key:'code', width:12, type:'text'},
        {header:'Employee Name', key:'name', width:28, type:'text'},
        {header:'Department', key:'department', width:18, type:'text'},
        ...months.map(ym=>({header:monthLabel(ym), key:mKey(ym), width:12, type:'money'})),
        {header:'Employee ESI Contribution', key:'employee', width:16, type:'money'},
        {header:'Employer ESI Contribution', key:'employer', width:16, type:'money'},
        {header:'Total ESI Contribution', key:'total', width:16, type:'money'}
      ],
      rows:rows.map(r=>{
        const o={code:r.Code, name:r.Name, department:r.Department, employee:r.totalEmployee, employer:r.totalEmployer, total:r.totalAll};
        months.forEach(ym=>{ o[mKey(ym)]=r.monthly[ym]!==undefined?r.monthly[ym].total:''; });
        return o;
      }),
      totals:true
    }]
  };
}
