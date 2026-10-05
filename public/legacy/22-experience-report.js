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
  return [...new Set(db.employees.map(e=>e.designation).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
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
function payrollReportRows(){
  const rec=db.payroll[payMonth]||{};
  return Object.values(rec).map(r=>{
    const e=db.employees.find(x=>x.code===r.code);
    return {Code:r.code,Name:r.name,WorkingUnit:unitLabel(e&&e.unit),UnitCode:(e&&e.unit)||'Unit-1',PaymentMode:(e&&e.mode)||'-',DaysWorked:r.daysWorking,LOP:r.lopDays,Earnings:r.earningsTotal,Deductions:r.deductionsTotal,ESI:r.esi||0,Canteen:r.canteen||0,NetSalary:r.netSalary};
  });
}
