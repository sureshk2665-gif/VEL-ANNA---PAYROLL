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

  const basicE=Math.round((e.basic||0)*factor);
  const hraE=Math.round((e.hra||0)*factor);
  const conveyanceE=Math.round((e.conveyance||0)*factor);
  const washingE=Math.round((e.washing||0)*factor);
  const daE=Math.round((e.da||0)*factor);
  const specialE=Math.round((e.special||0)*factor);
  const medicalE=Math.round((e.medical||0)*factor);
  // OT rate = (Basic / No. of Working Days / 8 hours) x 2 (double rate), as per standard formula
  const otPerHourRate = ((e.basic||0)/26/8)*2;
  const otAmount=Math.round((adj.otHours||0)*otPerHourRate);
  const otherAllowance=(e.other||0)+(adj.otherAllowanceOneOff||0);

  const scaleTotal=(e.basic||0)+(e.hra||0)+(e.da||0)+(e.special||0)+(e.medical||0)+(e.conveyance||0)+(e.washing||0);
  const earningsTotal = basicE+hraE+daE+specialE+medicalE+conveyanceE+washingE+otAmount+otherAllowance;

  // ESI is not applicable on Washing Allowance, so compute ESI wages excluding it
  const esiWages = earningsTotal - washingE;
  const esi = e.esiApplicable ? Math.round(esiWages*s.esiRate) : 0;
  const esiEmployer = e.esiApplicable ? Math.round(esiWages*(s.esiEmployerRate!==undefined?s.esiEmployerRate:0.0325)) : 0;
  // PF Wages = Basic + DA (as processed this month). PF is only applicable when the
  // employee's PF Deduction flag is enabled — Exempted/Nil employees show 0, but will
  // start appearing with real figures automatically the moment PF is enabled for them.
  const pfWages = basicE + daE;
  const pf = e.pfApplicable ? Math.round(pfWages*s.pfRate) : 0;
  const pfEmployer = e.pfApplicable ? Math.round(pfWages*(s.pfEmployerRate!==undefined?s.pfEmployerRate:0.12)) : 0;
  const lunchTokens = adj.lunchTokens||0;
  const dinnerTokens = adj.dinnerTokens||0;
  const lunchRate = s.canteenLunchRate!==undefined ? s.canteenLunchRate : 18;
  const dinnerRate = s.canteenDinnerRate!==undefined ? s.canteenDinnerRate : 13.5;
  const canteenLunchAmt = Math.round(lunchTokens*lunchRate*100)/100;
  const canteenDinnerAmt = Math.round(dinnerTokens*dinnerRate*100)/100;
  const canteen = Math.round((canteenLunchAmt+canteenDinnerAmt)*100)/100;
  const tax = adj.tax||0;
  const rent = e.rent||0;
  // Advance deduction = any manual advance entered for the month + whatever the Salary Advance
  // module's auto-generated recovery schedule says is due this month (stops automatically once
  // the full advance has been recovered).
  const scheduledAdvance = scheduledAdvanceDeduction(e.code, ym);
  const advance = scheduledAdvance;
  const otherDed = (e.otherDed||0) + (adj.otherDedOneOff||0);
  const deductionsTotal = esi+tax+rent+canteen+advance+otherDed;
  const netSalary = Math.max(0, earningsTotal - deductionsTotal);

  return {
    code:e.code, name:e.name, department:e.department, designation:e.designation,
    nowd, lopDays, daysWorking: Math.round(daysWorking*100)/100,
    presentDays:attSum.present, leaveDays:attSum.leave, holidayDays:attSum.holiday, halfDayCount:attSum.halfDay,
    presentPlusHalf: Math.round((attSum.present + attSum.halfDay*0.5)*100)/100,
    unmarkedDays:attSum.unmarked,
    noph:attSum.holiday, otHours:adj.otHours||0, otPerHourRate:Math.round(otPerHourRate*100)/100,
    basicE,hraE,daE,specialE,medicalE,conveyanceE,washingE,otAmount,otherAllowance,
    scaleTotal, earningsTotal,
    esi, esiEmployer, esiWages, pf, pfEmployer, pfWages, pfNo:e.pfNo||'', uan:e.uan||'', tax, rent, canteen, lunchTokens, dinnerTokens, lunchRate, dinnerRate, canteenLunchAmt, canteenDinnerAmt,
    advance, otherDed, deductionsTotal,
    clBalance:e.clBalance||0,
    // NOPL Balance: employee's opening NOPL (Paid Leave) balance minus all Casual Leave /
    // Paid Leave marked in Attendance up to and including this payroll month.
    noplBalance: Math.max(0, (e.noplBalance||0) - noplUsedUpto(e.code, ym)),
    noplBalanceOpening: e.noplBalance||0,
    netSalary: Math.round(netSalary),
    generatedAt:new Date().toISOString()
  };
}
