/* ================= BONUS REPORT ================= */
// Returns list of YYYY-MM month keys (inclusive) between two YYYY-MM-DD dates.
function monthsInRange(fromDate, toDate){
  const months=[];
  let y=Number(fromDate.slice(0,4)), m=Number(fromDate.slice(5,7));
  const endY=Number(toDate.slice(0,4)), endM=Number(toDate.slice(5,7));
  while(y<endY || (y===endY && m<=endM)){
    months.push(String(y)+'-'+String(m).padStart(2,'0'));
    m++; if(m>12){ m=1; y++; }
  }
  return months;
}
// Identity fields for a statutory/bonus report row: always from the CURRENT employee master
// (db.employees), with the payroll record's own copy as fallback (e.g. a deleted employee).
function reportEmpIdentity(r){
  const e=(db.employees||[]).find(x=>x.code===r.code)||null;
  return {
    emp:e,
    name:(e&&e.name)||r.name||'',
    department:(e&&e.department)||r.department||'-',
    pfNo:(e&&e.pfNo)||r.pfNo||'',
    uan:(e&&e.uan)||r.uan||'',
    esiNo:(e&&e.esiNo)||r.esiNo||''
  };
}
function bonusReportRows(rate, fromDate, toDate){
  const months=monthsInRange(fromDate,toDate);
  const byEmp={}; // code -> {code,name,department,monthly:{ym:basic}, basicWages (actual total), eligibleWages (capped total, for bonus calc only)}
  months.forEach(ym=>{
    const list=payrollMonthRecords(ym); // live figures; null = month not generated (skipped)
    if(!list) return;
    list.forEach(r=>{
      const basic=r.basicE||0;
      const eligible=Math.min(basic, BONUS_CEILING); // ceiling applied per month, bonus calc only
      const id=reportEmpIdentity(r);
      if(!byEmp[r.code]) byEmp[r.code]={Code:r.code, Name:id.name, Department:id.department, monthly:{}, BasicWages:0, EligibleWages:0};
      byEmp[r.code].monthly[ym]=basic;
      byEmp[r.code].BasicWages+=basic;
      byEmp[r.code].EligibleWages+=eligible;
    });
  });
  const rows=Object.values(byEmp).map(r=>({
    Code:r.Code, Name:r.Name, Department:r.Department,
    monthly:r.monthly,
    'Bonus Eligible Basic Wages':Math.round(r.BasicWages),
    'Bonus Amount':Math.round(r.EligibleWages*rate)
  })).sort((a,b)=>String(a.Code).localeCompare(String(b.Code),undefined,{numeric:true}));
  const grandTotal=rows.reduce((s,r)=>s+r['Bonus Amount'],0);
  return {rows, months, grandTotal};
}
// Totals row: Basic per month, Bonus Eligible Basic Wages and Bonus Amount.
function bonusReportTotals(rows, months){
  const monthly={};
  months.forEach(ym=>{ monthly[ym]=rows.reduce((s,r)=>s+(r.monthly[ym]||0),0); });
  return {
    monthly,
    eligible: rows.reduce((s,r)=>s+r['Bonus Eligible Basic Wages'],0),
    bonus: rows.reduce((s,r)=>s+r['Bonus Amount'],0)
  };
}
function bonusTableHtml(rows, months, grandTotal){
  const t=bonusReportTotals(rows, months);
  return `<div class="tableScrollWrap"><table><thead><tr><th>Employee Code</th><th>Employee Name</th><th>Department</th>${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}<th>Bonus Eligible Basic Wages</th><th>Bonus Amount</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>${months.map(ym=>`<td class="num">${r.monthly[ym]!==undefined?fmt(r.monthly[ym]):'-'}</td>`).join('')}<td class="num">${fmt(r['Bonus Eligible Basic Wages'])}</td><td class="num">${fmt(r['Bonus Amount'])}</td></tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;"><td colspan="3" style="text-align:center;">Total</td>${months.map(ym=>`<td class="num">${fmt(t.monthly[ym])}</td>`).join('')}<td class="num">${fmt(t.eligible)}</td><td class="num">${fmt(grandTotal)}</td></tr>
  </tbody></table></div>`;
}
function printBonusReport(meta){
  if(bonusFromDate>bonusToDate){ alert('"From Date" cannot be after "To Date".'); return; }
  const {rows,months,grandTotal}=bonusReportRows(meta.bonusRate,bonusFromDate,bonusToDate);
  if(!rows.length){ alert('No payroll records found for employees in the selected period.'); return; }
  const t=bonusReportTotals(rows, months);
  const ratePct=(meta.bonusRate*100).toFixed(2).replace(/\.00$/,'');
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Period: ${fmtDate(bonusFromDate)} to ${fmtDate(bonusToDate)} &nbsp;|&nbsp; Bonus Ceiling on Basic Salary (for Bonus Amount calc only): ${fmt(BONUS_CEILING)} per month &nbsp;|&nbsp; Bonus Rate: ${ratePct}%</p>
  <table class="repTable"><thead><tr><th>S.No</th><th>Employee Code</th><th>Employee Name</th><th>Department</th>${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}<th>Bonus Eligible Basic Wages</th><th>Bonus Amount</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>${months.map(ym=>`<td>${r.monthly[ym]!==undefined?fmt(r.monthly[ym]):'-'}</td>`).join('')}<td>${fmt(r['Bonus Eligible Basic Wages'])}</td><td>${fmt(r['Bonus Amount'])}</td></tr>`).join('')}
    <tr class="subtotal"><td colspan="4" style="text-align:center;font-weight:700;">Total</td>${months.map(ym=>`<td style="font-weight:700;">${fmt(t.monthly[ym])}</td>`).join('')}<td style="font-weight:700;">${fmt(t.eligible)}</td><td style="font-weight:700;">${fmt(grandTotal)}</td></tr>
  </tbody></table>`;
  openPrintWindow(meta.title+' ('+fmtDate(bonusFromDate)+' to '+fmtDate(bonusToDate)+')', tableHtml, {orientation:'landscape', signatureGap:true});
}
// Excel version of the open Bonus Report (rate from the open report, period from the date pickers).
function bonusExcelSpec(){
  const meta=REPORTS_LIST.find(r=>r.key===reportView && r.bonusRate);
  if(!meta || bonusFromDate>bonusToDate) return null;
  const {rows,months}=bonusReportRows(meta.bonusRate,bonusFromDate,bonusToDate);
  if(!rows.length) return null;
  const ratePct=(meta.bonusRate*100).toFixed(2).replace(/\.00$/,'');
  const mKey=ym=>'m_'+ym.replace('-','_');
  return {
    fileName:`${companyFilePrefix()}-Bonus-${ratePct}pct-${bonusFromDate}-to-${bonusToDate}.xlsx`,
    sheets:[{
      name:'Bonus',
      title:(db.companyName||'')+(db.companyName?' — ':'')+meta.title,
      subtitle:'Period: '+fmtDate(bonusFromDate)+' to '+fmtDate(bonusToDate)+' | Bonus Ceiling on Basic: '+fmt(BONUS_CEILING)+' per month | Bonus Rate: '+ratePct+'%',
      columns:[
        {header:'Employee Code', key:'code', width:12, type:'text'},
        {header:'Employee Name', key:'name', width:28, type:'text'},
        {header:'Department', key:'department', width:18, type:'text'},
        ...months.map(ym=>({header:monthLabel(ym), key:mKey(ym), width:12, type:'money'})),
        {header:'Bonus Eligible Basic Wages', key:'eligible', width:16, type:'money'},
        {header:'Bonus Amount', key:'bonus', width:14, type:'money'}
      ],
      rows:rows.map(r=>{
        const o={code:r.Code, name:r.Name, department:r.Department, eligible:r['Bonus Eligible Basic Wages'], bonus:r['Bonus Amount']};
        months.forEach(ym=>{ o[mKey(ym)]=r.monthly[ym]!==undefined?r.monthly[ym]:''; });
        return o;
      }),
      totals:true
    }]
  };
}
function employeeReportRows(){
  // Active Employee Report: resigned employees are tracked separately in the
  // Resigned Employees module and its own report, not mixed in here.
  return db.employees.filter(e=>e.status!=='Resigned').map(e=>({Code:e.code,Name:e.name,Department:e.department||'-',Designation:e.designation||'-',WorkingUnit:unitLabel(e.unit),Contractor:contractorName(e)||'Non Contractor',Status:e.status,Mobile:e.mobile||'-',DailyWage:calcGross(e)}));
}
function resignedReportRows(){
  return db.employees.filter(e=>e.status==='Resigned').map(e=>({Code:e.code,Name:e.name,Department:e.department||'-',Designation:e.designation||'-',JoiningDate:e.joining?fmtDate(e.joining):'-',ResignationDate:e.resignationDate?fmtDate(e.resignationDate):'-',Reason:e.resignReason||'-'}));
}
// unitLabel() / unitAddress() live in public/legacy/06b-units.js.
function departmentReportRows(){
  return db.departments.map(d=>({Department:d,Employees:db.employees.filter(e=>e.department===d && e.status!=='Resigned').length}));
}
