/* ================= PAST MONTHS ENTERED DAY BY DAY — Late and OT from In / Out times =================
   Months before the monthly-attendance cut-over (db.monthlyAttFrom — 12-payroll-calc.js) were entered
   day by day in the former Employee Time Entry. Their Late minutes and OT hours (when no figure was
   typed for the month) come from the In / Out times kept in the database, measured against the
   shift planned for each day — so those months' payroll stays exactly as it was. No screen uses this
   any more; monthly-entry months never do.
   Data read (all kept as they were):
     db.timeEntries    {date: {empCode: {inH,inM,inAP,outH,outM,outAP}}}
     db.timeLeaves     [{date, empCode, type:'Loss of Pay'|'Half Day', remarks}]
     db.shiftPresets   [{key,label,inMin,outMin}]  shift timings (minutes from midnight)
     db.shiftGroups    [{key,label}]               Shift A Group / Shift B Group / General Group …
     db.groupMap       {empCode: groupKey}         which group each employee was in
     db.groupWeekShift {monday: {groupKey: presetKey}}  the shift a group worked that week; a week
                       without its own choice follows the week before with First and Second swapped
     db.shiftOverrides {date: {empCode: presetKey}}     one person's shift changed for one day */
function teEwDateStr(y,m,d){ const dt=new Date(y,m-1,d); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
function teEwShiftDate(dt,k){ const [y,m,d]=dt.split('-').map(Number); return teEwDateStr(y,m,d+k); }
// The company's shifts (8 working hours + a 30-minute break; "+ OT" = 2 hours more, "+ Extra OT" on
// the Second Shift = till 5:00 AM, 5 hours more). Times are minutes from midnight (> 1440 = next day).
// These are the starting list; the timings in use live in db.shiftPresets (teShiftPresets).
const TE_SHIFTS=[
  {key:'first',    label:'First Shift',       inMin:7*60,     outMin:15*60+30},
  {key:'firstOT',  label:'First Shift + OT',  inMin:7*60,     outMin:17*60+30},
  {key:'general',  label:'General Shift',     inMin:9*60,     outMin:17*60+30},
  {key:'second',   label:'Second Shift',      inMin:15*60+30, outMin:24*60},
  {key:'secondOT', label:'Second Shift + OT', inMin:15*60+30, outMin:26*60},
  {key:'secondOTx', label:'Second Shift + Extra OT', inMin:15*60+30, outMin:29*60}
];
function teTimeToMinutes(h,m,ap){
  // A blank hour means "no time entered" — not 12:00 midnight (that showed empty rows as
  // First shift / 8:00 working / 3:30 OT).
  if(h===''||h===null||h===undefined) return null;
  h=Number(h); m=(m===''||m===null||m===undefined)?0:Number(m);
  if(isNaN(h)||isNaN(m)) return null;
  let hh=h%12; if(ap==='PM') hh+=12;
  return hh*60+m;
}
// Shift detected from the In Time:
//   First Shift   (7:00 AM – 3:30 PM):  In before 9:00 AM
//   General Shift (9:00 AM – 5:30 PM):  In from 9:00 AM until 3:00 PM
//   Second Shift  (3:30 PM – 12:00 AM): In from 3:00 PM
// Used for an employee with no planned shift that day (see teShiftWindow).
function teDetectShift(inMin){
  if(inMin===null) return null;
  if(inMin < 9*60) return {name:'First Shift', standard:7*60};
  if(inMin < 15*60) return {name:'General Shift', standard:9*60};
  return {name:'Second Shift', standard:15*60+30};
}
function teIsHolidayDate(dateStr2){
  const [y,m,d]=dateStr2.split('-').map(Number);
  if(new Date(y,m-1,d).getDay()===0) return true; // Sunday — always full-day OT
  if(typeof getHolidayType==='function' && getHolidayType(dateStr2)==='NOPH') return true; // Payroll holiday (NOPH): paid as NOPH, time worked is OT
  return (db.timeHolidays||[]).some(h=>h.date===dateStr2);
}
// The Employee Leave (Loss of Pay / Half Day) recorded for this employee on this date, if any.
function teGetLeave(dateStr2, code){
  const l=(db.timeLeaves||[]).find(l=>l.date===dateStr2 && l.empCode===code) || null;
  return l && l.type==='NOPL' ? {...l, type:'Loss of Pay'} : l; // NOPL was removed — old records read as Loss of Pay
}
/* ---- Late, Working and OT for one day ----
   Measured against the employee's SHIFT: the shift planned for them that day (Shift Groups →
   weekly rotation, or a one-day change in Date-wise), otherwise the shift their In Time falls in
   (teDetectShift). A planned shift more than 4 hours away from the In Time is treated as not
   applying (e.g. a person who swapped shifts) and the detected shift is used.
     Late    = minutes after the shift start (9:00 for General: 9:00 on time, 9:36 → 36 min)
             + minutes left before the shift end (out 4:30 PM on a 5:30 PM shift → 60 min).
     Working = the time inside the shift (coming early does not add; leaving late is OT) less the
               30-minute break, at most 8 hours.
     OT      = minutes after the shift end (shift start + 8 hours + 30-minute break).
   Sundays and holidays: no Late; the whole time worked is OT. */
const TE_BREAK_MIN=30, TE_WORK_MIN=8*60;
function teShiftWindow(inMin, dateForRow, code){
  const planned = code && dateForRow && typeof teEmpShift==='function' ? teEmpShift(code, dateForRow) : null;
  if(planned){
    let start=planned.inMin;
    // Second-shift style starts late in the day; an In Time just after midnight belongs to it.
    if(start-inMin>12*60) start-=1440; else if(inMin-start>12*60) start+=1440;
    if(Math.abs(inMin-start)<=4*60) return {name:planned.label, start};
  }
  const d=teDetectShift(inMin);
  return {name:d.name, start:d.standard};
}
function teCompute(entry, dateForRow, code){
  const inMin=teTimeToMinutes(entry.inH,entry.inM,entry.inAP);
  const outMinRaw=teTimeToMinutes(entry.outH,entry.outM,entry.outAP);
  if(inMin===null) return {shift:null,late:0,lateIn:0,earlyOut:0,working:0,ot:0};
  let outMin=outMinRaw;
  if(outMin!==null && outMin<=inMin) outMin+=24*60; // overnight out-time
  const holidayFullOT = dateForRow ? teIsHolidayDate(dateForRow) : false;
  if(holidayFullOT){
    const dur = (outMin!==null) ? Math.max(0,outMin-inMin) : 0;
    return {shift:teDetectShift(inMin), late:0, lateIn:0, earlyOut:0, working:0, ot:dur};
  }
  const w=teShiftWindow(inMin, dateForRow, code);
  const shift={name:w.name, standard:w.start};
  const regularEnd = w.start + TE_WORK_MIN + TE_BREAK_MIN; // shift start + 8 hours + 30-minute break
  const lateIn = Math.max(0, inMin - w.start);
  if(outMin===null) return {shift, late:lateIn, lateIn, earlyOut:0, working:0, ot:0};
  const earlyOut = Math.max(0, regularEnd - outMin);
  const span = Math.min(outMin, regularEnd) - Math.max(inMin, w.start);
  const working = Math.min(Math.max(0, span - TE_BREAK_MIN), TE_WORK_MIN);
  const ot = Math.max(0, outMin - regularEnd);
  return {shift, late:lateIn+earlyOut, lateIn, earlyOut, working, ot};
}
// The days of a month whose Time Entry Late and OT count in payroll: the employee is on the roll,
// the day has a time entry, and the day is not Loss of Pay (a Time Entry leave or a mark on the
// Attendance screen). Sundays and holidays count their whole time as OT (teCompute).
function teMonthDays(code, ym){
  const emp=(db.employees||[]).find(e=>e.code===code);
  const out=[], dim=daysInMonth(ym);
  for(let d=1; d<=dim; d++){
    const ds=ym+'-'+String(d).padStart(2,'0');
    const entry=db.timeEntries && db.timeEntries[ds] && db.timeEntries[ds][code];
    if(!entry || entry.inH==='' || entry.inH===undefined || entry.inH===null) continue;
    if(emp && !isEmpOnRollOn(emp, ds)) continue;
    const lv=teGetLeave(ds, code); if(lv && lv.type!=='Half Day') continue;
    if(typeof getAttStatus==='function' && getAttStatus(ds, code)==='LossOfPay') continue;
    out.push({date:ds, c:teHalfDayCap(teCompute(entry, ds, code), !!lv)});
  }
  return out;
}
// A Half Day counts at most 4 working hours (half of 8) and no Late — the person is off for half
// the shift, so coming late or leaving early is the half day itself. OT is kept as worked.
const TE_HALF_DAY_MIN=4*60;
function teHalfDayCap(c, half){ return half && c ? {...c, working:Math.min(c.working, TE_HALF_DAY_MIN), late:0, lateIn:0, earlyOut:0} : c; }
function teMonthTotal(code, ym, key){ return teMonthDays(code, ym).reduce((s,x)=>s+(x.c[key]||0), 0); }
// Total Late (minutes) in a month. Payroll uses it for the Late Deduction unless a different figure
// is typed for that month on the Attendance screen.
function teMonthLateMinutes(code, ym){ return teMonthTotal(code, ym, 'late'); }
// Total OT (minutes) in a month — same days as Late. Payroll uses it for OT unless hours are typed
// on the Attendance screen.
function teMonthOTMinutes(code, ym){ return teMonthTotal(code, ym, 'ot'); }
// OT minutes per day (for a month whose wage changed part-way: each day is paid at its own rate).
function teMonthOTByDay(code, ym){ return teMonthDays(code, ym).filter(x=>x.c.ot>0).map(x=>({date:x.date, min:x.c.ot})); }
const TE_DEFAULT_GROUPS=[{key:'A',label:'Shift A Group'},{key:'B',label:'Shift B Group'},{key:'G',label:'General Group'}];
const TE_SWAP={first:'second', firstOT:'secondOT', second:'first', secondOT:'firstOT', secondOTx:'firstOT'};

const TE_FIRST_SHIFT_KEYS=['first','firstOT','general','second','secondOT'];
function teShiftPresets(){
  const fresh=s=>({key:s.key, label:s.label, inMin:s.inMin, outMin:s.outMin%1440});
  if(!Array.isArray(db.shiftPresets) || !db.shiftPresets.length){
    db.shiftPresets=TE_SHIFTS.map(fresh); db.shiftPresetsOffered=TE_SHIFTS.map(s=>s.key);
  }
  if(!Array.isArray(db.shiftPresetsOffered)) db.shiftPresetsOffered=[...new Set([...TE_FIRST_SHIFT_KEYS, ...db.shiftPresets.map(p=>p.key)])];
  TE_SHIFTS.forEach(s=>{
    if(db.shiftPresetsOffered.includes(s.key)) return;
    db.shiftPresetsOffered.push(s.key);
    if(db.shiftPresets.some(p=>p.key===s.key)) return;
    // Put it right after the shift it extends (Second Shift + OT), else at the end.
    const after=db.shiftPresets.findIndex(p=>p.key==='secondOT');
    db.shiftPresets.splice(after<0 ? db.shiftPresets.length : after+1, 0, fresh(s));
  });
  return db.shiftPresets;
}
function teShiftByKey(k){ return k ? teShiftPresets().find(p=>p.key===k)||null : null; }
function teGroups(){
  if(!Array.isArray(db.shiftGroups) || !db.shiftGroups.length) db.shiftGroups=TE_DEFAULT_GROUPS.map(g=>({...g}));
  return db.shiftGroups;
}
function teGroupMap(){ if(!db.groupMap || typeof db.groupMap!=='object') db.groupMap={}; return db.groupMap; }
function teGroupByKey(k){ return k ? teGroups().find(g=>g.key===k)||null : null; }
function teEmpGroup(code){ const k=teGroupMap()[code]; return teGroupByKey(k) ? k : ''; }
/* ---- Weeks and the rotation ---- */
function teWeekStart(dt){ const [y,m,d]=dt.split('-').map(Number); const x=new Date(y,m-1,d); x.setDate(x.getDate()-((x.getDay()+6)%7)); return teEwDateStr(x.getFullYear(), x.getMonth()+1, x.getDate()); }
function teWeekMap(){ if(!db.groupWeekShift || typeof db.groupWeekShift!=='object') db.groupWeekShift={}; return db.groupWeekShift; }
// {key, suggested}: the week's own choice, else last week's with First and Second swapped.
function teGroupWeekShift(dt, g){
  const w=teWeekMap(), ws=teWeekStart(dt);
  if(w[ws] && teShiftByKey(w[ws][g])) return {key:w[ws][g], suggested:false};
  for(let back=1; back<=104; back++){ // up to two years back, so months picked ahead still follow the rotation
    const prev=w[teEwShiftDate(ws,-7*back)], pk=prev&&prev[g];
    if(!teShiftByKey(pk)) continue;
    let k=pk; for(let i=0;i<back;i++) k=TE_SWAP[k]||k;
    return {key:teShiftByKey(k)?k:pk, suggested:true};
  }
  // Nothing set before this week (e.g. a month before the rotation was first planned): work back
  // from the nearest week set AFTER it, with the same swap, so whole months can be filled.
  for(let fwd=1; fwd<=104; fwd++){
    const next=w[teEwShiftDate(ws,7*fwd)], nk=next&&next[g];
    if(!teShiftByKey(nk)) continue;
    let k=nk; for(let i=0;i<fwd;i++) k=TE_SWAP[k]||k;
    return {key:teShiftByKey(k)?k:nk, suggested:true};
  }
  return {key:'', suggested:false};
}
function teOverrides(){ if(!db.shiftOverrides || typeof db.shiftOverrides!=='object') db.shiftOverrides={}; return db.shiftOverrides; }
function teOverrideShift(dt, code){ const o=teOverrides()[dt]; return o && teShiftByKey(o[code]) ? o[code] : ''; }
// The shift an employee is planned to work on a date: a change for that day, else the group's.
function teEmpShiftKey(code, dt){ return teOverrideShift(dt, code) || (teEmpGroup(code) ? teGroupWeekShift(dt, teEmpGroup(code)).key : ''); }
function teEmpShift(code, dt){ return teShiftByKey(teEmpShiftKey(code, dt)); }
