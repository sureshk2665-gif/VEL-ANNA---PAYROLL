/* ================= EMPLOYEE EXPERIENCE REPORT ================= */
// Given a Financial Year label like "2025-2026" (Apr-Mar), returns its last date "2026-03-31".
function fyEndDate(fyLabel){
  if(!fyLabel || fyLabel.indexOf('-')===-1) return todayStr();
  const endY=Number(fyLabel.split('-')[1]);
  return endY+'-03-31';
}
// Financial Years available to pick from: current FY back to the earliest joining year on record.
function fyOptionsList(){
  const curFY=financialYearOf(todayStr());
  const curStartY=Number(curFY.split('-')[0]);
  let minY=curStartY;
  db.employees.forEach(e=>{ if(e.joining){ const jy=Number(e.joining.slice(0,4)); if(jy<minY) minY=jy; } });
  const years=[];
  for(let y=curStartY; y>=minY; y--) years.push(y+'-'+(y+1));
  return years;
}
// Distinct designations typed against employees (designation is free text, not a fixed list).
function designationOptionsList(){
  return [...new Set([...designationList(), ...db.employees.map(e=>e.designation).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
}
// Completed years & months between two YYYY-MM-DD dates (fromDate up to asOfDate).
function yearsMonthsBetween(fromDate, asOfDate){
  if(!fromDate) return null;
  const [fy,fm,fd]=fromDate.split('-').map(Number);
  const [ay,am,ad]=asOfDate.split('-').map(Number);
  const from=new Date(fy,fm-1,fd), asOf=new Date(ay,am-1,ad);
  if(from>asOf) return null;
  let years=asOf.getFullYear()-from.getFullYear();
  let months=asOf.getMonth()-from.getMonth();
  if(asOf.getDate()<from.getDate()) months--;
  if(months<0){ years--; months+=12; }
  return {years,months};
}
function ymLabel(ym){
  if(!ym) return '-';
  return ym.years+'y '+ym.months+'m';
}
function experienceReportRows(fy, dept, desig, status){
  const asOf=fyEndDate(fy);
  return db.employees
    .filter(e=> status==='All' ? true : e.status===status)
    .filter(e=> !dept || e.department===dept)
    .filter(e=> !desig || e.designation===desig)
    .filter(e=> !e.joining || e.joining<=asOf) // must have joined on/before the FY end
    .map(e=>({
      Code:e.code,
      Name:e.name,
      Department:e.department||'-',
      Designation:e.designation||'-',
      'Age (as on FY End)':e.dob?ymLabel(yearsMonthsBetween(e.dob,asOf)):'-',
      'Date of Joining':e.joining?fmtDate(e.joining):'-',
      'Experience in this Company':e.joining?ymLabel(yearsMonthsBetween(e.joining,asOf)):'-'
    }))
    .sort((a,b)=>a.Code.localeCompare(b.Code,undefined,{numeric:true}));
}
// Payroll rows for the report hub — LIVE (payrollMonthRecords): every employee on the roll that
// month, sorted by code. Identity (name, unit, contractor, payment mode) comes from the current
// employee record, falling back to the payroll record. Legacy months may lack newer fields (-> 0).
function payrollReportRows(ym){
  const list=payrollMonthRecords(ym||payMonth)||[];
  const n=v=>Number(v)||0;
  return list.map(r=>{
    const e=db.employees.find(x=>x.code===r.code);
    const unit=e?e.unit:r.unit;
    const contractor=e?(e.contractor||''):(r.contractor||'');
    const row={Code:r.code,Name:(e&&e.name)||r.name||'-',WorkingUnit:unitLabel(unit),Contractor:contractorName(contractor)||'Non Contractor',PaymentMode:(e&&e.mode)||r.mode||'-',
      Present:n(r.presentDays),NOPH:n(r.holidayDays),HalfDay:n(r.halfDayCount),LOP:n(r.lopDays),PaidDays:n(r.daysWorking),OTHrs:n(r.otHours),LateMin:n(r.lateMinutes),
      Gross:n(r.grossSalary),Earnings:n(r.earningsTotal),ESI:n(r.esi),PF:n(r.pf),Canteen:n(r.canteen),Late:n(r.lateDeduction),Advance:n(r.advance),OtherDed:n(r.otherDed)+n(r.tax),
      Deductions:n(r.deductionsTotal),NetSalary:n(r.netSalary)};
    // Kept for compatibility (same as PaidDays) plus the contractor code for filtering — not
    // enumerable, so tables/exports built from Object.keys() don't show them as columns.
    Object.defineProperty(row,'DaysWorked',{value:row.PaidDays,enumerable:false});
    Object.defineProperty(row,'ContractorCode',{value:contractor,enumerable:false});
    Object.defineProperty(row,'UnitCode',{value:unitCodeOf(unit),enumerable:false});
    return row;
  });
}
