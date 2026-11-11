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
// Read-only view of a month's adjustments (no record is created) — used by the payroll
// calculation, which runs for every month any screen or report shows.
const ADJ_DEFAULTS={otHours:0, lopOverride:null, advance:0, tax:0, otherAllowanceOneOff:0, otherDedOneOff:0, lunchTokens:0, dinnerTokens:0};
function adjFor(ym, code){
  const a=db.payrollAdjustments && db.payrollAdjustments[ym] && db.payrollAdjustments[ym][code];
  return a ? {...ADJ_DEFAULTS, ...a} : {...ADJ_DEFAULTS};
}
/* ---- How a month's attendance was entered ----
   Day by day (the Attendance screen: one employee, every date, In / Out times, LOP / Half Day
   marks — db.timeEntries / db.timeLeaves): Present, LOP, Half Days, Late and OT all come from the
   days. This is how every month is entered, from db.dayAttFrom on (attIsDaily) and before it (the
   former Employee Time Entry — worked out exactly as then).
   Month totals (attIsMonthly): a month whose figures were typed as totals for the month on the
   short-lived monthly screen (db.monthlyAttMonths) — db.payrollAdjustments[ym][code]: lopDays,
   halfDays, lateMinutes, otHours. Every working day on the roll counts as Present unless entered as
   LOP or Half Day. Such a month stays as typed until it is switched to day-by-day entry. */
function attIsMonthly(ym){ return !!ym && !!db && Array.isArray(db.monthlyAttMonths) && db.monthlyAttMonths.includes(ym); }
// Hours shown as hours and minutes, never as a fraction: 9.35 → "9h 21m", 0.65 → "39m", 10 → "10h".
function fmtHrsMin(hours){
  const m=Math.round((+hours||0)*60), h=Math.floor(m/60), mm=m%60;
  if(!m) return '0h';
  return [h?h+'h':'', mm?mm+'m':''].filter(Boolean).join(' ');
}
// The same from minutes: 39 → "39m", 125 → "2h 5m".
function fmtMinHM(min){ return fmtHrsMin((+min||0)/60); }
/* ---- Temp Attendance (10b-temp-attendance.js) ----
   The month's figures typed for one employee on the Temp Attendance page: db.tempAtt[ym][code] =
   {present, lop, ot (minutes), late (minutes), tokens}. When an employee has any of them for a month,
   Payroll uses only these for that month (a blank box counts 0; a blank Present = working days − LOP)
   instead of the days on Attendance: Paid days = Present + paid holidays. */
function tempAttFor(ym, code){
  const t=db && db.tempAtt && db.tempAtt[ym] && db.tempAtt[ym][code];
  return t && Object.keys(t).some(k=>t[k]!==undefined && t[k]!==null && t[k]!=='') ? t : null;
}
function tempAttSet(v){ return v!==undefined && v!==null && v!==''; }
function attIsDaily(ym){ return !!ym && !!db && !!db.dayAttFrom && ym>=db.dayAttFrom && !attIsMonthly(ym); }
// Every month (but one typed as month totals) is entered the same way: each day Present / LOP / Half
// Day with its Late minutes and OT hours (no shifts, no In / Out times — db.attendance marks and
// db.dayFigs, 10-attendance.js; older months were converted to this once — ensureSimpleAttendance).
function attIsSimple(ym){ return !!ym && !!db && !attIsMonthly(ym); }
// From db.lateOffOtFrom on (the month the late rule began), Late beyond the free minutes is taken off
// the month's OT hours first (lateDeductionFor); earlier months keep the rule they were paid with.
function lateOffOt(ym){ return !!ym && !!db && !!db.lateOffOtFrom && ym>=db.lateOffOtFrom && !attIsMonthly(ym); }
// A booked "holiday without pay" (Holiday Calendar): not a working day and not paid.
function isUnpaidHolidayDate(ds){ return (db.timeHolidays||[]).some(h=>h.date===ds); }
// Canteen tokens for an employee in a month: the month's own figure entered on Attendance (or
// Employee Time Entry → Monthly Token Entry before). Months before db.dayAttFrom without one fall back
// to the employee's usual monthly count stored on the employee record; later months use only the
// figure entered (none = 0).
function canteenTokensFor(e, ym){
  const tmp=tempAttFor(ym, e.code); if(tmp) return Math.max(0, Math.round(+tmp.tokens||0));
  const adj=adjFor(ym, e.code);
  if(adj.canteenTokens!==undefined && adj.canteenTokens!==null) return +adj.canteenTokens||0;
  return attIsMonthly(ym) || attIsDaily(ym) ? 0 : (+e.canteenTokens||0);
}
/* ---- Rates for a month ----
   PF / ESI rates, the canteen token price and the late grace are copied into
   db.payrollSettings[ym] when that month is generated, so changing a rate later does not reprice a
   month that was already processed — Regenerate applies today's rates to it. A month not generated
   yet (or generated before rates were kept) uses the current rates. */
const PAYROLL_RATE_KEYS=['pfRate','pfEmployerRate','esiRate','esiEmployerRate','canteenTokenPrice','lateGraceMinutes'];
const PAYROLL_RATE_DEFAULTS={pfRate:0.12, pfEmployerRate:0.12, esiRate:0.0075, esiEmployerRate:0.0325, canteenTokenPrice:150, lateGraceMinutes:120};
function payrollRates(ym){
  const s=getSettings(), saved=ym && db.payrollSettings ? db.payrollSettings[ym] : null;
  const r={};
  PAYROLL_RATE_KEYS.forEach(k=>{
    const v = saved && saved[k]!==undefined && saved[k]!==null ? saved[k] : s[k];
    r[k] = (v===undefined || v===null || v==='' || isNaN(+v)) ? PAYROLL_RATE_DEFAULTS[k] : +v;
  });
  return r;
}
function capturePayrollRates(ym){
  if(!db.payrollSettings) db.payrollSettings={};
  const cur=payrollRates(null);
  db.payrollSettings[ym]=Object.fromEntries(PAYROLL_RATE_KEYS.map(k=>[k,cur[k]]));
  db.payrollSettings[ym].canteenTokenPrices={...unitTokenPrices()};
}
/* ---- Canteen token price per working unit ----
   Admin → Canteen Token Prices sets a price for each unit (db.settings.canteenTokenPrices,
   {unitCode: ₹}); a unit without its own price uses the single price (canteenTokenPrice). Like the
   other rates, the prices are copied into the month when it is generated, so a later change
   reaches a generated month only after Regenerate. An employee's tokens are charged at the price
   of their working unit. */
function unitTokenPrices(){
  const p=getSettings().canteenTokenPrices;
  return p && typeof p==='object' ? p : {};
}
function tokenPriceValue(v){ return v===undefined || v===null || v==='' || isNaN(+v) ? null : Math.max(0, +v); }
function canteenTokenPrice(ym, unit){
  const u=unit ? unitCodeOf(unit) : '';
  const saved=ym && db.payrollSettings ? db.payrollSettings[ym] : null;
  const own=u ? tokenPriceValue(saved ? (saved.canteenTokenPrices||{})[u] : unitTokenPrices()[u]) : null;
  return own!==null ? own : Math.max(0, payrollRates(ym).canteenTokenPrice);
}
// Late minutes for the month: the figure typed on the Attendance screen for that month if there
// is one, otherwise the total Late from Employee Time Entry.
function lateMinutesFor(e, ym){
  const tmp=tempAttFor(ym, e.code); if(tmp) return Math.max(0, Math.round(+tmp.late||0));
  const adj=adjFor(ym, e.code);
  if(adj.lateMinutes!==undefined && adj.lateMinutes!==null && adj.lateMinutes!=='') return +adj.lateMinutes||0;
  if(attIsMonthly(ym)) return 0; // monthly entry: only the minutes entered
  return typeof teMonthLateMinutes==='function' ? teMonthLateMinutes(e.code, ym) : 0;
}
// OT hours for the month: hours typed on the Attendance screen for that month if any (otTyped),
// otherwise the month's OT total from Employee Time Entry. Older months saved before Time Entry fed
// OT keep any non-zero figure that was typed then.
function otTypedFor(adj){ return adj.otTyped===undefined ? (+adj.otHours>0) : !!adj.otTyped; }
function otHoursFor(e, ym){
  const tmp=tempAttFor(ym, e.code); if(tmp) return Math.round(Math.max(0, +tmp.ot||0)/60*100)/100;
  const adj=adjFor(ym, e.code);
  if(otTypedFor(adj) || attIsMonthly(ym)) return +adj.otHours||0; // monthly entry: only the hours entered
  return typeof teMonthOTMinutes==='function' ? Math.round(teMonthOTMinutes(e.code, ym)/60*100)/100 : 0;
}
/* ---- Late waiver (Admin → Late Waiver) ----
   The first N Late minutes of each month are not deducted. Each waiver applies from a month
   onwards (db.settings.lateWaivers = [{from:'YYYY-MM', minutes}]); Payroll uses it straight away —
   no Regenerate — for that month and every month after it, until a later waiver takes over. Months
   before the first waiver keep the grace they were generated with (payrollRates). */
function lateWaivers(){ const w=getSettings().lateWaivers; return Array.isArray(w) ? w : []; }
function lateWaiverFor(ym){
  const list=lateWaivers().filter(w=>w && w.from && (!ym || w.from<=ym)).sort((a,b)=>a.from<b.from?-1:1);
  return list.length ? list[list.length-1] : null;
}
function lateGraceMinutes(ym){
  const w=lateWaiverFor(ym || monthKey(todayStr()));
  return w ? Math.max(0, Math.round(+w.minutes||0)) : Math.max(0, payrollRates(ym).lateGraceMinutes);
}
// Late Deduction: the first lateGraceMinutes(ym) of Late in the month are free (Admin → Late Waiver).
// From db.lateOffOtFrom on (otHoursAvail given), the minutes beyond are first taken off the month's
// OT hours (fromOt); only what OT cannot cover is deducted from salary. Before that, every minute
// beyond was deducted. One minute's salary = Daily Wage (Basic + HRA per day) ÷ 8 ÷ 60.
function lateDeductionFor(e, ym, dailyWage, otHoursAvail){
  const minutes=lateMinutesFor(e, ym), grace=lateGraceMinutes(ym);
  const over=Math.max(0, minutes-grace);
  const fromOt=otHoursAvail===null || otHoursAvail===undefined ? 0 : Math.min(over, Math.round((+otHoursAvail||0)*60));
  const charged=over-fromOt;
  const perMinute=(+dailyWage||0)/8/60;
  return {minutes, grace, charged, fromOt, perMinute, amount:Math.round(charged*perMinute)};
}

/* ---- Daily wage in force on a date ----
   Daily-wage changes made on the Employee form (e.wageHistory), plus any per-day increments
   recorded before the Annual Increment screen was removed (db.increments), each say "from <date>
   the wage went from X to Y". A date before the
   first change uses that change's previous wage; a date on/after the latest change uses the
   employee's current wage; a date in between uses the wage set by the latest change on or before
   it. With no recorded changes every month uses the current wage. This keeps past months at the
   wage they were paid at when payroll is recomputed. */
function wageOf(basic, hra){ return Math.round(((+basic||0)+(+hra||0))*100)/100; }
function currentDailyWage(e){ return +e.dailyWage || ((+e.basic||0)+(+e.hra||0)); }
function wageEvents(e){
  const ok=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
  const ev=[];
  (db.increments||[]).forEach(r=>{
    if(r.empCode===e.code && r.wageUnit==='day' && ok(r.effectiveDate))
      ev.push({date:r.effectiveDate, prev:wageOf(r.prevBasic,r.prevHra), next:wageOf(r.revisedBasic,r.revisedHra), at:r.createdAt||''});
  });
  (e.wageHistory||[]).forEach(h=>{ if(ok(h.from)) ev.push({date:h.from, prev:+h.prev||0, next:+h.wage||0, at:h.at||''}); });
  return ev.sort((a,b)=>a.date.localeCompare(b.date) || String(a.at).localeCompare(String(b.at)));
}
function wageOnDate(e, ds, ev){
  ev = ev || wageEvents(e);
  const cur=currentDailyWage(e);
  if(!ev.length) return cur;
  let last=-1;
  for(let i=0;i<ev.length;i++){ if(ev[i].date<=ds) last=i; else break; }
  if(last<0) return ev[0].prev || cur;
  if(last===ev.length-1) return cur || ev[last].next;
  return ev[last].next || cur;
}

function computePayrollForEmployee(e, ym){
  const rates=payrollRates(ym);
  // NOWD is auto-calculated for the payroll month: Total Days − Sundays − Holidays.
  const nowd = computeWorkingDays(ym);
  const adj = adjFor(ym, e.code);
  // DAILY WAGE payroll (as in the company's model sheet), worked out day by day:
  //   Paid days  = Present (a Half Day counts ½) + Holidays (NOPH), only on days the employee is on the roll
  //   Basic/HRA  = each paid day at that day's wage (60% / 40% of the Daily Wage — wageOnDate)
  //   OT         = OT rate/hr (Daily Wage ÷ 8 × OT Factor) × OT hours (from Attendance — otHoursFor)
  //   GROSS      = Basic + OT                    Total Earnings = GROSS + HRA (+ one-off allowance)
  //   ESI        = Total Earnings × ESI rate (0.75%), rounded — this company's rule (e.g. ₹22,392 → ₹168)
  //   PF         = Basic × PF rate (12%), rounded
  // Sundays are never paid days. Working days on the roll with no status up to today are "not marked"
  // (unpaid). NOWD is shown for reference.
  const dim=daysInMonth(ym), today=todayStr(), ev=wageEvents(e);
  let present=0, halfDay=0, lop=0, noph=0, unmarked=0, paidDays=0, basicSum=0, hraSum=0;
  // Monthly entry: working days on the roll (not Sundays, NOPH or holidays without pay) count as
  // Present; the LOP and Half Days entered for the month are taken off afterwards.
  const tmp=tempAttFor(ym, e.code); // typed on Temp Attendance: the month's totals for this employee
  const monthly=attIsMonthly(ym) || !!tmp;
  let workDays=0, workBasic=0, workHra=0;
  const segs=[];
  for(let d=1; d<=dim; d++){
    const ds=dateStr(ym,d);
    const w=wageOnDate(e, ds, ev);
    const seg=segs[segs.length-1];
    if(seg && seg.dailyWage===w) seg.to=ds; else segs.push({from:ds, to:ds, dailyWage:w});
    if(isSunday(ym,d) || !isEmpOnRollOn(e, ds)) continue;
    if(monthly){
      const sp=dailyWageSplit(w);
      if(getHolidayType(ds)==='NOPH' || contractorLeaveOn(e.contractor, ds)){ noph++; basicSum+=sp.basic; hraSum+=sp.hra; paidDays+=1; }
      else if(!isUnpaidHolidayDate(ds)){ workDays++; workBasic+=sp.basic; workHra+=sp.hra; }
      continue;
    }
    const st=getAttStatus(ds, e.code);
    let paid=0;
    if(st==='NOPH'){ noph++; paid=1; }
    else if(st==='Present'){ present++; paid=1; }
    else if(st==='HalfDay'){ halfDay++; paid=0.5; }
    else if(st==='LossOfPay') lop++;
    else if(ds<=today) unmarked++;
    if(paid){ const sp=dailyWageSplit(w); basicSum+=sp.basic*paid; hraSum+=sp.hra*paid; paidDays+=paid; }
  }
  if(tmp){
    // Temp Attendance: Present days as typed (blank = working days − LOP), at most the working days;
    // paid at the month's average day rate, like the month-totals entry below.
    lop=Math.min(Math.max(0, +tmp.lop||0), workDays);
    const typed=tempAttSet(tmp.present) ? Math.max(0, +tmp.present||0) : workDays-lop;
    present=Math.min(typed, workDays); halfDay=0;
    if(workDays){ basicSum+=workBasic/workDays*present; hraSum+=workHra/workDays*present; }
    paidDays+=present;
  } else if(monthly){
    // LOP and Half Days entered for the month, at most the working days on the roll. A day off is
    // taken at the month's average day rate (the same as the day's rate unless the wage changed).
    lop=Math.min(Math.max(0, +adj.lopDays||0), workDays);
    halfDay=Math.min(Math.max(0, +adj.halfDays||0), workDays-lop);
    present=workDays-lop-halfDay;
    const paidWork=workDays-lop-halfDay*0.5;
    if(workDays){ basicSum+=workBasic/workDays*paidWork; hraSum+=workHra/workDays*paidWork; }
    paidDays+=paidWork;
  }
  const otFactor = otFactorOf(e); // 1.0 / 1.5 / 2.0 from the Employee form
  const wage = dailyWageSplit(segs[segs.length-1].dailyWage, otFactor); // wage at month end — the rate shown on the slip
  const daysWorking = paidDays;
  // LOP = Loss of Pay days only (a Half Day is shown in its own column and counts ½ in Present).
  const lopDays = (adj.lopOverride!==null && adj.lopOverride!==undefined) ? adj.lopOverride : lop;

  const basicE=Math.round(basicSum);
  const hraE=Math.round(hraSum);
  const otPerHourRate = wage.otRate;
  // OT hours worked; from db.lateOffOtFrom, Late beyond the free minutes comes off them first.
  const simple=lateOffOt(ym);
  const otWorked = otHoursFor(e, ym);
  const late = lateDeductionFor(e, ym, wage.dailyWage, simple ? otWorked : null);
  const otHours = simple ? Math.max(0, Math.round((otWorked*60 - late.fromOt)/60*100)/100) : otWorked;
  let otAmount;
  if(segs.length>1 && !monthly && !otTypedFor(adj) && typeof teMonthOTByDay==='function'){
    // The wage changed during the month: each day's OT is paid at that day's rate (less the share
    // taken by Late).
    const full=teMonthOTByDay(e.code, ym).reduce((s,x)=>s + x.min/60*dailyWageSplit(wageOnDate(e, x.date, ev), otFactor).otRate, 0);
    otAmount=Math.round(full*(simple && otWorked ? otHours/otWorked : 1));
  } else otAmount=Math.round(otHours*otPerHourRate);
  const otherAllowance=+adj.otherAllowanceOneOff||0; // one-off, entered on the Attendance screen

  const scaleTotal=wage.dailyWage; // per day
  const grossSalary = basicE+otAmount; // GROSS = Basic + OT
  const earningsTotal = grossSalary+hraE+otherAllowance;

  // ESI wages = Total Earnings (Basic + HRA + OT + other allowance) — this company's rule; the
  // employee share (0.75%) and the employer share (3.25%) are both worked out on it.
  const esiWages = earningsTotal;
  const esi = e.esiApplicable ? Math.round(esiWages*rates.esiRate) : 0;
  const esiEmployer = e.esiApplicable ? Math.round(esiWages*rates.esiEmployerRate) : 0;
  // PF Wages = Basic (as processed this month). PF is only applicable when the employee's PF
  // Deduction flag is enabled — Exempted/Nil employees show 0.
  const pfWages = basicE;
  const pf = e.pfApplicable ? Math.round(pfWages*rates.pfRate) : 0;
  const pfEmployer = e.pfApplicable ? Math.round(pfWages*rates.pfEmployerRate) : 0;
  // Canteen: tokens bought this month × the month's token price for the employee's unit (Admin → Canteen Token Prices).
  const canteenTokens = canteenTokensFor(e, ym);
  const tokenPrice = canteenTokenPrice(ym, e.unit); // the price of the employee's working unit
  const canteen = Math.round(canteenTokens*tokenPrice*100)/100;
  const tax = +adj.tax||0;
  // Advance deduction = whatever the Salary Advance module's auto-generated recovery schedule says
  // is due this month (stops automatically once the full advance has been recovered).
  const advance = scheduledAdvanceDeduction(e.code, ym);
  const otherDed = +adj.otherDedOneOff||0; // one-off, entered on the Attendance screen
  const lateDeduction = late.amount;
  const deductionsTotal = pf+esi+tax+canteen+advance+otherDed+lateDeduction; // PF (employee share) is deducted from salary
  const netSalary = Math.max(0, earningsTotal - deductionsTotal);

  return {
    code:e.code, name:e.name, department:e.department, designation:e.designation,
    unit:unitCodeOf(e.unit), contractor:e.contractor||'', mode:e.mode||'', esiNo:e.esiNo||'',
    nowd, weekOff:sundaysInMonth(ym), lopDays, lopMarked:lop, daysWorking: Math.round(daysWorking*100)/100,
    presentDays:present, leaveDays:Math.round((lop + halfDay*0.5)*100)/100, holidayDays:noph, halfDayCount:halfDay,
    presentPlusHalf: Math.round((present + halfDay*0.5)*100)/100,
    unmarkedDays:unmarked, workDays:monthly?workDays:undefined, monthlyAttendance:monthly, tempAttendance:!!tmp,
    noph, otHours, otHoursWorked:otWorked, lateOtMinutes:late.fromOt, otPerHourRate:Math.round(otPerHourRate*100)/100,
    basicE,hraE,otAmount,otherAllowance,
    dailyWage:wage.dailyWage, basicPerDay:wage.basic, hraPerDay:wage.hra, holidaysPaid:noph,
    wageSegments: segs.length>1 ? segs : undefined,
    scaleTotal, grossSalary, earningsTotal,
    esi, esiEmployer, esiWages, pf, pfEmployer, pfWages, pfNo:e.pfNo||'', uan:e.uan||'', tax, canteen, canteenTokens, canteenTokenPrice:tokenPrice,
    advance, otherDed, lateMinutes:late.minutes, lateGraceMinutes:late.grace, lateChargedMinutes:late.charged,
    latePerMinute:Math.round(late.perMinute*100)/100, lateDeduction, deductionsTotal,
    netSalary: Math.round(netSalary),
    generatedAt:new Date().toISOString()
  };
}

/* ---- Payroll for a month, always from current data ----
   A month is generated once (Payroll → Generate / Regenerate Payroll): that marks it as processed
   and fixes its rates (payrollRates). From then on the Payroll list, salary slips, reports, PDFs,
   Excel sheets and the dashboard all recompute it from the latest Attendance (and, for months before monthly
   attendance, the day-by-day entries),
   adjustments, advances and wage history — so every screen shows the same figures as the slip.
   The employees are everyone on the roll that month (isEmpOnRollInMonth), not a stored list.
   Months generated by the old monthly-salary engine (records without a daily wage) are shown
   exactly as stored. */
function payrollByCode(a,b){ return String(a.code).localeCompare(String(b.code),undefined,{numeric:true}); }
function payrollGenerated(ym){ return !!(db.payroll && db.payroll[ym]); }
function payrollIsLegacyMonth(ym){
  const rec=db.payroll && db.payroll[ym]; if(!rec) return false;
  const list=Object.values(rec);
  return list.length>0 && list.every(r=>r && r.dailyWage===undefined);
}
function payrollEmployeesFor(ym){ return (db.employees||[]).filter(e=>isEmpOnRollInMonth(e, ym)).sort(payrollByCode); }
function payrollMonthRecords(ym){
  if(!payrollGenerated(ym)) return null;
  if(payrollIsLegacyMonth(ym)) return Object.values(db.payroll[ym]).slice().sort(payrollByCode);
  return payrollEmployeesFor(ym).map(e=>computePayrollForEmployee(e, ym));
}
function payrollMonthMap(ym){
  const list=payrollMonthRecords(ym); if(!list) return null;
  const m={}; list.forEach(r=>{ m[r.code]=r; }); return m;
}
// One employee's record for a generated month (null if the month isn't generated or they weren't on the roll).
// Present days as shown on Payroll, the slip and every report: full days + Half Days × ½
// (e.g. 21 full + 4 half = 23). presentDays alone is the full days (Contractors Bill counts those).
// Sundays in the month — the weekly off: not working days (NOWD) and not paid (NOPH is paid holidays only).
function payWeekOff(r, ym){ return r && r.weekOff!==undefined ? +r.weekOff||0 : sundaysInMonth(ym); }
function payPresentDays(r){
  if(!r) return 0;
  if(r.presentPlusHalf!==undefined && r.presentPlusHalf!==null) return +r.presentPlusHalf||0;
  return Math.round(((+r.presentDays||0) + (+r.halfDayCount||0)*0.5)*100)/100;
}
function payrollRecordFor(code, ym){
  if(!payrollGenerated(ym)) return null;
  if(payrollIsLegacyMonth(ym)) return db.payroll[ym][code]||null;
  const e=(db.employees||[]).find(x=>x.code===code);
  return e && isEmpOnRollInMonth(e, ym) ? computePayrollForEmployee(e, ym) : null;
}
