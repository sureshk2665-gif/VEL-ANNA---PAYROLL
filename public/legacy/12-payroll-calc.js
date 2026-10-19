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
  // DAILY WAGE payroll (as in the company's model sheet):
  //   Paid days  = Present + Half Day × 0.5 + NOPL (paid leave) + Holidays (NOPH) while on the roll
  //   Basic      = Basic/day × Paid days        HRA = HRA/day × Paid days
  //   OT         = OT rate/hr (Daily Wage ÷ 8 × 1.5) × OT hours
  //   GROSS      = Basic + OT                    Total Earnings = GROSS + HRA (+ one-off allowance)
  // Sundays are never paid days. NOWD is still shown for reference only.
  let holidaysPaid=0;
  for(let d=1; d<=daysInMonth(ym); d++){
    const ds=dateStr(ym,d);
    if(!isSunday(ym,d) && getHolidayType(ds)==='NOPH' && isEmpOnRollOn(e, ds)) holidaysPaid++;
  }
  const workedDays = attSum.present + attSum.halfDay*0.5 + noplTaken;
  const daysWorking = Math.max(0, workedDays + holidaysPaid);
  const wage = dailyWageSplit(e.dailyWage || ((e.basic||0)+(e.hra||0)));

  const basicE=Math.round(wage.basic*daysWorking);
  const hraE=Math.round(wage.hra*daysWorking);
  const otPerHourRate = wage.otRate;
  const otAmount=Math.round((adj.otHours||0)*otPerHourRate);
  const otherAllowance=adj.otherAllowanceOneOff||0; // one-off, entered on the Attendance screen

  const scaleTotal=wage.dailyWage; // per day
  const grossSalary = basicE+otAmount; // GROSS = Basic + OT
  const earningsTotal = grossSalary+hraE+otherAllowance;

  const esiWages = grossSalary; // ESI on GROSS (Basic + OT)
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
    dailyWage:wage.dailyWage, basicPerDay:wage.basic, hraPerDay:wage.hra, holidaysPaid,
    scaleTotal, grossSalary, earningsTotal,
    esi, esiEmployer, esiWages, pf, pfEmployer, pfWages, pfNo:e.pfNo||'', uan:e.uan||'', tax, canteen, canteenTokens, canteenTokenPrice:tokenPrice,
    advance, otherDed, deductionsTotal,
    netSalary: Math.round(netSalary),
    generatedAt:new Date().toISOString()
  };
}
