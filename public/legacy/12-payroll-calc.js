/* ================= PAYROLL ================= */
let payMonth = monthKey(todayStr());
function getAdj(ym, code){
  if(!db.payrollAdjustments) db.payrollAdjustments={};
  if(!db.payrollAdjustments[ym]) db.payrollAdjustments[ym]={};
  if(!db.payrollAdjustments[ym][code]) db.payrollAdjustments[ym][code]={otHours:0, lopOverride:null, advance:0, tax:0, otherAllowanceOneOff:0, otherDedOneOff:0, lunchTokens:0, dinnerTokens:0};
  if(db.payrollAdjustments[ym][code].lunchTokens===undefined) db.payrollAdjustments[ym][code].lunchTokens=0;
  if(db.payrollAdjustments[ym][code].dinnerTokens===undefined) db.payrollAdjustments[ym][code].dinnerTokens=0;
  if(db.payrollAdjustments[ym][code].otherDedOneOff===undefined) db.payrollAdjustments[ym][code].otherDedOneOff=0;
  return db.payrollAdjustments[ym][code];
}
// Canteen tokens for an employee in a month: the month's own figure if one was entered on the
// Attendance screen, otherwise the employee's usual monthly count (Employee form).
function canteenTokensFor(e, ym){
  const adj=getAdj(ym, e.code);
  return (adj.canteenTokens!==undefined && adj.canteenTokens!==null) ? (+adj.canteenTokens||0) : (+e.canteenTokens||0);
}
function canteenTokenPrice(){
  const p=getSettings().canteenTokenPrice;
  return p===undefined ? 150 : (+p||0);
}
function computePayrollForEmployee(e, ym){
  const s=getSettings();
  // NOWD is auto-calculated for the payroll month: Total Days − Sundays − Holidays.
  const nowd = computeWorkingDays(ym);
  const adj = getAdj(ym, e.code);
  const attSum = attendanceSummary(e.code, ym);
  const lopDays = adj.lopOverride!==null ? adj.lopOverride : attSum.lopEquivalent;
  const noplTaken = attSum.leave;
  // NOPH is already excluded from NOWD's denominator (NOWD = Total − Sundays − NOPH), so it
  // must NOT also be added back into the Days Worked numerator — doing so double-counts NOPH
  // (both shrinking NOWD and inflating Days Worked) and lets earnings exceed the Scale Salary.
  // NOPL, unlike NOPH, is NOT subtracted from NOWD, so it correctly stays in this sum.
  const daysWorking = Math.max(0, (attSum.present + attSum.halfDay*0.5) + noplTaken);
  // Earnings use the dynamic calendar NOWD (Total Days − Sundays − Holidays) as the
  // per-day rate divisor, i.e. factor = Days Worked / NOWD.
  // Days Worked here = Present + Half-Day(0.5) + NOPL Taken (daysWorking, computed above).
  // NOPH is NOT added back separately here (it is already excluded from NOWD's denominator,
  // so adding it again in the numerator would double-count it).
  // NOTE: OT rate below intentionally keeps the FIXED 26-day standard divisor and is
  // NOT affected by this change.
  const payableDaysForEarnings = daysWorking;
  const factor = nowd ? Math.max(0, payableDaysForEarnings) / nowd : 0;

  // Salary structure: Basic + HRA (the only salary components kept in the Employee form).
  const basicE=Math.round((e.basic||0)*factor);
  const hraE=Math.round((e.hra||0)*factor);
  // OT rate = (Basic / No. of Working Days / 8 hours) x 2 (double rate), as per standard formula
  const otPerHourRate = ((e.basic||0)/26/8)*2;
  const otAmount=Math.round((adj.otHours||0)*otPerHourRate);
  const otherAllowance=adj.otherAllowanceOneOff||0; // one-off, entered on the Attendance screen

  const scaleTotal=(e.basic||0)+(e.hra||0);
  const earningsTotal = basicE+hraE+otAmount+otherAllowance;

  const esiWages = earningsTotal;
  const esi = e.esiApplicable ? Math.round(esiWages*s.esiRate) : 0;
  const esiEmployer = e.esiApplicable ? Math.round(esiWages*(s.esiEmployerRate!==undefined?s.esiEmployerRate:0.0325)) : 0;
  // PF Wages = Basic (as processed this month). PF is only applicable when the employee's PF
  // Deduction flag is enabled — Exempted/Nil employees show 0.
  const pfWages = basicE;
  const pf = e.pfApplicable ? Math.round(pfWages*s.pfRate) : 0;
  const pfEmployer = e.pfApplicable ? Math.round(pfWages*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12)) : 0;
  // Canteen: tokens bought this month × the Canteen Token Price (Payroll Process).
  const canteenTokens = canteenTokensFor(e, ym);
  const tokenPrice = canteenTokenPrice();
  const canteen = Math.round(canteenTokens*tokenPrice*100)/100;
  const tax = adj.tax||0;
  // Advance deduction = whatever the Salary Advance module's auto-generated recovery schedule says
  // is due this month (stops automatically once the full advance has been recovered).
  const advance = scheduledAdvanceDeduction(e.code, ym);
  const otherDed = adj.otherDedOneOff||0; // one-off, entered on the Attendance screen
  const deductionsTotal = pf+esi+tax+canteen+advance+otherDed; // PF (employee share) is deducted from salary
  const netSalary = Math.max(0, earningsTotal - deductionsTotal);

  return {
    code:e.code, name:e.name, department:e.department, designation:e.designation,
    nowd, lopDays, daysWorking: Math.round(daysWorking*100)/100,
    presentDays:attSum.present, leaveDays:attSum.leave, holidayDays:attSum.holiday, halfDayCount:attSum.halfDay,
    presentPlusHalf: Math.round((attSum.present + attSum.halfDay*0.5)*100)/100,
    unmarkedDays:attSum.unmarked,
    noph:attSum.holiday, otHours:adj.otHours||0, otPerHourRate:Math.round(otPerHourRate*100)/100,
    basicE,hraE,otAmount,otherAllowance,
    scaleTotal, earningsTotal,
    esi, esiEmployer, esiWages, pf, pfEmployer, pfWages, pfNo:e.pfNo||'', uan:e.uan||'', tax, canteen, canteenTokens, canteenTokenPrice:tokenPrice,
    advance, otherDed, deductionsTotal,
    netSalary: Math.round(netSalary),
    generatedAt:new Date().toISOString()
  };
}
