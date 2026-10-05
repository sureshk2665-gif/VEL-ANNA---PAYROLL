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
function bonusReportRows(rate, fromDate, toDate){
  const months=monthsInRange(fromDate,toDate);
  const byEmp={}; // code -> {code,name,department,monthly:{ym:basic}, basicWages (actual total), eligibleWages (capped total, for bonus calc only)}
  months.forEach(ym=>{
    const rec=db.payroll[ym];
    if(!rec) return;
    Object.values(rec).forEach(r=>{
      const basic=r.basicE||0;
      const eligible=Math.min(basic, BONUS_CEILING); // ceiling applied per month, bonus calc only
      if(!byEmp[r.code]) byEmp[r.code]={Code:r.code, Name:r.name, Department:r.department||'-', monthly:{}, BasicWages:0, EligibleWages:0};
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
  })).sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
  const grandTotal=rows.reduce((s,r)=>s+r['Bonus Amount'],0);
  return {rows, months, grandTotal};
}
function bonusTableHtml(rows, months, grandTotal){
  return `<div class="tableScrollWrap"><table><thead><tr><th>Employee Code</th><th>Employee Name</th><th>Department</th>${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}<th>Bonus Eligible Basic Wages</th><th>Bonus Amount</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>${months.map(ym=>`<td class="num">${r.monthly[ym]!==undefined?fmt(r.monthly[ym]):'-'}</td>`).join('')}<td class="num">${fmt(r['Bonus Eligible Basic Wages'])}</td><td class="num">${fmt(r['Bonus Amount'])}</td></tr>`).join('')}
    <tr class="subtotal" style="font-weight:700;"><td colspan="${3+months.length+1}" style="text-align:center;">Grand Total Bonus Amount</td><td>${fmt(grandTotal)}</td></tr>
  </tbody></table></div>`;
}
function printBonusReport(meta){
  if(bonusFromDate>bonusToDate){ alert('"From Date" cannot be after "To Date".'); return; }
  const {rows,months,grandTotal}=bonusReportRows(meta.bonusRate,bonusFromDate,bonusToDate);
  if(!rows.length){ alert('No payroll records found for employees in the selected period.'); return; }
  const ratePct=(meta.bonusRate*100).toFixed(2).replace(/\.00$/,'');
  const tableHtml=`<p style="font-size:11px;margin:0 0 6px;">Period: ${fmtDate(bonusFromDate)} to ${fmtDate(bonusToDate)} &nbsp;|&nbsp; Bonus Ceiling on Basic Salary (for Bonus Amount calc only): ${fmt(BONUS_CEILING)} per month &nbsp;|&nbsp; Bonus Rate: ${ratePct}%</p>
  <table class="repTable"><thead><tr><th>S.No</th><th>Employee Code</th><th>Employee Name</th><th>Department</th>${months.map(ym=>`<th>${monthLabel(ym)}</th>`).join('')}<th>Bonus Eligible Basic Wages</th><th>Bonus Amount</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.Department}</td>${months.map(ym=>`<td>${r.monthly[ym]!==undefined?fmt(r.monthly[ym]):'-'}</td>`).join('')}<td>${fmt(r['Bonus Eligible Basic Wages'])}</td><td>${fmt(r['Bonus Amount'])}</td></tr>`).join('')}
    <tr class="subtotal"><td colspan="${5+months.length}" style="text-align:right;font-weight:700;">Grand Total Bonus Amount</td><td style="font-weight:700;">${fmt(grandTotal)}</td></tr>
  </tbody></table>`;
  openPrintWindow(meta.title+' ('+fmtDate(bonusFromDate)+' to '+fmtDate(bonusToDate)+')', tableHtml, {orientation:'landscape', signatureGap:true});
}
function employeeReportRows(){
  // Active Employee Report: resigned employees are tracked separately in the
  // Resigned Employees module and its own report, not mixed in here.
  return db.employees.filter(e=>e.status!=='Resigned').map(e=>({Code:e.code,Name:e.name,Department:e.department||'-',Designation:e.designation||'-',WorkingUnit:unitLabel(e.unit),Status:e.status,Mobile:e.mobile||'-',NetSalary:calcNet(e)}));
}
function resignedReportRows(){
  return db.employees.filter(e=>e.status==='Resigned').map(e=>({Code:e.code,Name:e.name,Department:e.department||'-',Designation:e.designation||'-',JoiningDate:e.joining?fmtDate(e.joining):'-',ResignationDate:e.resignationDate?fmtDate(e.resignationDate):'-',Reason:e.resignReason||'-'}));
}
function unitLabel(unit){
  return unit==='Unit-2' ? (db.unit2Name||'Unit-2') : (db.unit1Name||'Unit-1');
}
// Returns the printed address for an employee's Working Unit, falling back to the
// main company address if that unit's address hasn't been set up in Admin > Payroll Process.
function unitAddress(unit){
  const addr = unit==='Unit-2' ? db.unit2Address : db.unit1Address;
  return addr || db.companyAddress || 'Company Address, City, State';
}
function incrementHistoryReportRows(){
  return db.increments.slice().sort((a,b)=> (b.effectiveDate||'').localeCompare(a.effectiveDate||'')).map(r=>({
    FinancialYear:r.financialYear, Code:r.empCode, Name:r.empName, EffectiveDate:fmtDate(r.effectiveDate),
    PrevBasic:r.prevBasic, PrevHRA:r.prevHra, PrevConveyance:r.prevConveyance, PrevWashing:r.prevWashing,
    IncrementAmount:r.incrementAmount,
    RevisedBasic:r.revisedBasic, RevisedHRA:r.revisedHra, RevisedConveyance:r.revisedConveyance, RevisedWashing:r.revisedWashing, RevisedGross:r.revisedGross,
    Remarks:r.remarks||'-'
  }));
}
function departmentReportRows(){
  return db.departments.map(d=>({Department:d,Employees:db.employees.filter(e=>e.department===d && e.status!=='Resigned').length}));
}
