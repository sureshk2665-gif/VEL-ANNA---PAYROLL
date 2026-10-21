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
// Canteen tokens for an employee in a month: the month's own figure if one was entered on the
// Attendance screen, otherwise the employee's usual monthly count (Employee form).
function canteenTokensFor(e, ym){
  const adj=adjFor(ym, e.code);
  return (adj.canteenTokens!==undefined && adj.canteenTokens!==null) ? (+adj.canteenTokens||0) : (+e.canteenTokens||0);
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
}
function canteenTokenPrice(ym){ return Math.max(0, payrollRates(ym).canteenTokenPrice); }
// Late minutes for the month: the figure typed on the Attendance screen for that month if there
// is one, otherwise the total Late from Employee Time Entry.
function lateMinutesFor(e, ym){
  const adj=adjFor(ym, e.code);
  if(adj.lateMinutes!==undefined && adj.lateMinutes!==null && adj.lateMinutes!=='') return +adj.lateMinutes||0;
  return typeof teMonthLateMinutes==='function' ? teMonthLateMinutes(e.code, ym) : 0;
}
// OT hours for the month: hours typed on the Attendance screen for that month if any (otTyped),
// otherwise the month's OT total from Employee Time Entry. Older months saved before Time Entry fed
// OT keep any non-zero figure that was typed then.
function otTypedFor(adj){ return adj.otTyped===undefined ? (+adj.otHours>0) : !!adj.otTyped; }
function otHoursFor(e, ym){
  const adj=adjFor(ym, e.code);
  if(otTypedFor(adj)) return +adj.otHours||0;
  return typeof teMonthOTMinutes==='function' ? Math.round(teMonthOTMinutes(e.code, ym)/60*100)/100 : 0;
}
function lateGraceMinutes(ym){ return Math.max(0, payrollRates(ym).lateGraceMinutes); }
// Late Deduction: one minute's salary = Daily Wage (Basic + HRA per day) ÷ 8 ÷ 60. The first
// lateGraceMinutes(ym) of Late in the month (2 hours) are free; every minute beyond is deducted.
function lateDeductionFor(e, ym, dailyWage){
  const minutes=lateMinutesFor(e, ym), grace=lateGraceMinutes(ym);
  const charged=Math.max(0, minutes-grace);
  const perMinute=(+dailyWage||0)/8/60;
  return {minutes, grace, charged, perMinute, amount:Math.round(charged*perMinute)};
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
  //   Paid days  = Present + Half Day × 0.5 + Holidays (NOPH), only on days the employee is on the roll
  //   Basic/HRA  = each paid day at that day's wage (60% / 40% of the Daily Wage — wageOnDate)
  //   OT         = OT rate/hr (Daily Wage ÷ 8 × 1.5) × OT hours (from Employee Time Entry — otHoursFor)
  //   GROSS      = Basic + OT                    Total Earnings = GROSS + HRA (+ one-off allowance)
  // Sundays are never paid days. Working days on the roll with no status up to today are "not marked"
  // (unpaid). NOWD is shown for reference.
  const dim=daysInMonth(ym), today=todayStr(), ev=wageEvents(e);
  let present=0, halfDay=0, lop=0, noph=0, unmarked=0, paidDays=0, basicSum=0, hraSum=0;
  const segs=[];
  for(let d=1; d<=dim; d++){
    const ds=dateStr(ym,d);
    const w=wageOnDate(e, ds, ev);
    const seg=segs[segs.length-1];
    if(seg && seg.dailyWage===w) seg.to=ds; else segs.push({from:ds, to:ds, dailyWage:w});
    if(isSunday(ym,d) || !isEmpOnRollOn(e, ds)) continue;
    const st=getAttStatus(ds, e.code);
    let paid=0;
    if(st==='NOPH'){ noph++; paid=1; }
    else if(st==='Present'){ present++; paid=1; }
    else if(st==='HalfDay'){ halfDay++; paid=0.5; }
    else if(st==='LossOfPay') lop++;
    else if(ds<=today) unmarked++;
    if(paid){ const sp=dailyWageSplit(w); basicSum+=sp.basic*paid; hraSum+=sp.hra*paid; paidDays+=paid; }
  }
  const wage = dailyWageSplit(segs[segs.length-1].dailyWage); // wage at month end — the rate shown on the slip
  const daysWorking = paidDays;
  const lopDays = (adj.lopOverride!==null && adj.lopOverride!==undefined) ? adj.lopOverride : lop + halfDay*0.5;

  const basicE=Math.round(basicSum);
  const hraE=Math.round(hraSum);
  const otPerHourRate = wage.otRate;
  const otHours = otHoursFor(e, ym);
  let otAmount;
  if(segs.length>1 && !otTypedFor(adj) && typeof teMonthOTByDay==='function'){
    // The wage changed during the month: each day's OT is paid at that day's rate.
    otAmount=Math.round(teMonthOTByDay(e.code, ym).reduce((s,x)=>s + x.min/60*dailyWageSplit(wageOnDate(e, x.date, ev)).otRate, 0));
  } else otAmount=Math.round(otHours*otPerHourRate);
  const otherAllowance=+adj.otherAllowanceOneOff||0; // one-off, entered on the Attendance screen

  const scaleTotal=wage.dailyWage; // per day
  const grossSalary = basicE+otAmount; // GROSS = Basic + OT
  const earningsTotal = grossSalary+hraE+otherAllowance;

  const esiWages = grossSalary; // ESI on GROSS (Basic + OT)
  const esi = e.esiApplicable ? Math.round(esiWages*rates.esiRate) : 0;
  const esiEmployer = e.esiApplicable ? Math.round(esiWages*rates.esiEmployerRate) : 0;
  // PF Wages = Basic (as processed this month). PF is only applicable when the employee's PF
  // Deduction flag is enabled — Exempted/Nil employees show 0.
  const pfWages = basicE;
  const pf = e.pfApplicable ? Math.round(pfWages*rates.pfRate) : 0;
  const pfEmployer = e.pfApplicable ? Math.round(pfWages*rates.pfEmployerRate) : 0;
  // Canteen: tokens bought this month × the month's Canteen Token Price (Payroll Process).
  const canteenTokens = canteenTokensFor(e, ym);
  const tokenPrice = canteenTokenPrice(ym);
  const canteen = Math.round(canteenTokens*tokenPrice*100)/100;
  const tax = +adj.tax||0;
  // Advance deduction = whatever the Salary Advance module's auto-generated recovery schedule says
  // is due this month (stops automatically once the full advance has been recovered).
  const advance = scheduledAdvanceDeduction(e.code, ym);
  const otherDed = +adj.otherDedOneOff||0; // one-off, entered on the Attendance screen
  const late = lateDeductionFor(e, ym, wage.dailyWage);
  const lateDeduction = late.amount;
  const deductionsTotal = pf+esi+tax+canteen+advance+otherDed+lateDeduction; // PF (employee share) is deducted from salary
  const netSalary = Math.max(0, earningsTotal - deductionsTotal);

  return {
    code:e.code, name:e.name, department:e.department, designation:e.designation,
    unit:unitCodeOf(e.unit), contractor:e.contractor||'', mode:e.mode||'', esiNo:e.esiNo||'',
    nowd, lopDays, lopMarked:lop, daysWorking: Math.round(daysWorking*100)/100,
    presentDays:present, leaveDays:0, holidayDays:noph, halfDayCount:halfDay,
    presentPlusHalf: Math.round((present + halfDay*0.5)*100)/100,
    unmarkedDays:unmarked,
    noph, otHours, otPerHourRate:Math.round(otPerHourRate*100)/100,
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
   Excel sheets and the dashboard all recompute it from the latest Attendance, Employee Time Entry,
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
function payrollRecordFor(code, ym){
  if(!payrollGenerated(ym)) return null;
  if(payrollIsLegacyMonth(ym)) return db.payroll[ym][code]||null;
  const e=(db.employees||[]).find(x=>x.code===code);
  return e && isEmpOnRollInMonth(e, ym) ? computePayrollForEmployee(e, ym) : null;
}
