/* ================= DASHBOARD =================
   This month at a glance, from the same figures as Attendance and Payroll:
     1. Attendance for the month: how many employees' figures are entered, and the month's LOP
        days, Half Days, OT hours, Late minutes and canteen tokens — with the button to enter them
        (and, early in a month, to finish last month's).
     2. The same by contractor (LOP differs contractor by contractor), beside the employees still
        to be entered — or, once everyone is, those with the most Loss of Pay.
     3. This month's payroll and what is owed to contractors.
   Blocks the signed-in user cannot open are left out. */
function dashEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const dashN=v=>Math.round((+v||0)*100)/100;
// Every employee on the roll in the month, with the figures Payroll works out and whether the
// month's attendance is entered for them (a month entered day by day counts as entered).
function dashAttRows(ym){
  const monthly=attIsMonthly(ym);
  return payrollEmployeesFor(ym).map(e=>{
    const r=computePayrollForEmployee(e, ym);
    return {e, r, done: !monthly || !!adjFor(ym, e.code).attEntered};
  });
}
function dashAttSum(rows){
  const sum=k=>dashN(rows.reduce((s,x)=>s+(+x.r[k]||0),0));
  return {roll:rows.length, entered:rows.filter(x=>x.done).length,
    lop:sum('lopMarked'), half:sum('halfDayCount'), ot:sum('otHours'), late:sum('lateMinutes'), tokens:sum('canteenTokens')};
}
// Opens Attendance on a month.
function dashOpenAtt(ym){ openAttDay(ym+'-01'); }
function dashConTable(rows){
  const cons=getContractors(), known=new Set(cons.map(k=>k.code));
  const groups=cons.map(k=>({name:k.name||k.code, rows:rows.filter(x=>x.e.contractor===k.code)}));
  groups.push({name:'Contractor not set', rows:rows.filter(x=>!known.has(x.e.contractor)), unset:true});
  const list=groups.filter(g=>g.rows.length).map(g=>({...g, s:dashAttSum(g.rows)}));
  if(!list.length) return `<p class="dashEmpty">No employees on the roll this month.</p>`;
  return `<div class="dashTableWrap"><table class="dashTable"><thead><tr><th>Contractor</th><th class="num">Employees</th><th class="num">Entered</th><th class="num">LOP days</th><th class="num">Half days</th><th class="num">OT hours</th></tr></thead>
    <tbody>${list.map(g=>`<tr><td class="${g.unset?'dashNeg':''}">${dashEsc(g.name)}</td><td class="num">${g.s.roll}</td><td class="num ${g.s.entered<g.s.roll?'dashNeg':''}">${g.s.entered}</td><td class="num">${g.s.lop}</td><td class="num">${g.s.half}</td><td class="num">${g.s.ot}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderDashboard(){
  const today=todayStr(), ym=monthKey(today), prevYm=nextMonthKey(ym,-1);
  const canAtt=canOpenModule('attendance');
  const canPay=canOpenModule('payroll');
  const blocks=[];

  // 1. Attendance for the month
  if(canAtt){
    const monthly=attIsMonthly(ym);
    const rows=dashAttRows(ym), s=dashAttSum(rows), todo=s.roll-s.entered;
    // Last month, while it still has employees to enter and its payroll is not generated yet
    // (attendance is filled once a month, usually in the first days of the next).
    const prevRows=attIsMonthly(prevYm) && !payrollGenerated(prevYm) ? dashAttRows(prevYm) : [];
    const prevTodo=prevRows.filter(x=>!x.done).length;
    const finding = !s.roll ? 'No employees on the roll this month.'
      : !monthly ? `${attMonthName(ym)} is worked out from the days entered before monthly attendance began.`
      : todo ? `Attendance entered for ${s.entered} of ${s.roll} employee${s.roll===1?'':'s'} so far.`
      : `Attendance is entered for all ${s.roll} employee${s.roll===1?'':'s'}.`;
    blocks.push(`<section class="panel dashToday">
      <div class="dashTodayHead">
        <div>
          <h3>Attendance · ${dashEsc(attMonthName(ym))}</h3>
          <p class="dashFinding">${dashEsc(finding)}</p>
          ${prevTodo?`<p class="dashFinding warn">${dashEsc(attMonthName(prevYm))}: ${prevTodo} of ${prevRows.length} employee${prevRows.length===1?'':'s'} not entered yet.</p>`:''}
        </div>
        <div class="dashActions">
          ${prevTodo?`<button class="btn" onclick="dashOpenAtt('${prevYm}')">${ico('calendar-days')} Enter ${dashEsc(attMonthName(prevYm))}</button>`:''}
          <button class="btn ${prevTodo?'secondary':''}" onclick="dashOpenAtt('${ym}')">${ico('calendar-days')} ${monthly?'Enter attendance':'Open Attendance'}</button>
        </div>
      </div>
      <div class="dashStrip">
        <div class="lead"><span class="lbl">Entered</span><span class="val">${s.entered}<small> of ${s.roll}</small></span></div>
        <div><span class="lbl">LOP days</span><span class="val">${s.lop}</span></div>
        <div><span class="lbl">Half days</span><span class="val">${s.half}</span></div>
        <div><span class="lbl">OT hours</span><span class="val">${s.ot}</span></div>
        <div><span class="lbl">Late minutes</span><span class="val">${s.late}</span></div>
        <div><span class="lbl">Canteen tokens</span><span class="val">${s.tokens}</span></div>
      </div>
    </section>`);

    // 2. By contractor + who needs attention
    const list = todo
      ? {title:'Not entered yet', items:rows.filter(x=>!x.done).map(x=>({e:x.e, side:''})), empty:''}
      : {title:'Most Loss of Pay', items:rows.filter(x=>(+x.r.lopMarked||0)+(+x.r.halfDayCount||0)>0)
          .sort((a,b)=>((+b.r.lopMarked||0)+(+b.r.halfDayCount||0)/2)-((+a.r.lopMarked||0)+(+a.r.halfDayCount||0)/2))
          .map(x=>({e:x.e, side:[+x.r.lopMarked?`LOP ${dashN(x.r.lopMarked)}`:'', +x.r.halfDayCount?`Half ${dashN(x.r.halfDayCount)}`:''].filter(Boolean).join(' · ')})),
         empty:'No Loss of Pay this month.'};
    const shown=list.items.slice(0,6);
    if(s.roll) blocks.push(`<div class="dashRow">
      <section class="panel"><div class="panelHead"><h3>By contractor</h3><span class="dashMeta">${dashEsc(attMonthName(ym))}</span></div>${dashConTable(rows)}</section>
      <section class="panel dashList2">
        <div class="panelHead"><h3>${list.title}</h3><span class="dashMeta">${list.items.length}</span></div>
        ${shown.length?`<ul>${shown.map(x=>`<li><span class="avatarChip">${initials(x.e.name)}</span><span class="dlMain"><b>${dashEsc(x.e.name)}</b><small>${dashEsc(x.e.code)}${contractorName(x.e)?' · '+dashEsc(contractorName(x.e)):''}</small></span><span class="dlSide">${dashEsc(x.side)}</span></li>`).join('')}</ul>`
          :`<p class="dashEmpty">${list.empty}</p>`}
        ${list.items.length>shown.length?`<button class="linkBtn" onclick="dashOpenAtt('${ym}')">View all ${list.items.length} in Attendance</button>`:''}
      </section>
    </div>`);
  }

  // 3. This month's payroll
  if(canPay){
    const gen=payrollGenerated(ym);
    const recs=gen?(payrollMonthRecords(ym)||[]):[];
    const sum=k=>Math.round(recs.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
    let svc=null;
    if(canOpenModule('contractorbill') && typeof cbContractorRows==='function'){ try{ svc=Math.round(cbContractorRows(ym).reduce((s,r)=>s+r.commission,0)*100)/100; }catch(e){ svc=null; } }
    blocks.push(`<section class="panel dashPay">
      <div class="panelHead"><h3>Payroll · ${monthLabel(ym)}</h3>
        <span style="display:flex;gap:8px;align-items:center;">${svc!==null&&canOpenModule('contractorbill')?`<button class="btn secondary" onclick="render('contractorbill')">Contractors Bill</button>`:''}<button class="btn secondary" onclick="render('payroll')">Open Payroll</button></span></div>
      ${gen?`<div class="dashStrip">
        <div><span class="lbl">Employees paid</span><span class="val">${recs.length}</span></div>
        <div><span class="lbl">Earnings</span><span class="val">${fmt(sum('earningsTotal'))}</span></div>
        <div><span class="lbl">Deductions</span><span class="val">${fmt(sum('deductionsTotal'))}</span></div>
        <div class="lead"><span class="lbl">Net pay</span><span class="val money">${fmt(sum('netSalary'))}</span></div>
        ${svc!==null?`<div><span class="lbl">Service charge to contractors</span><span class="val">${fmt(svc)}</span></div>`:''}
      </div><p class="dashNote">From this month's attendance as entered so far; it updates as entries are made.</p>`
      :`<p class="dashEmpty left">Payroll for ${monthLabel(ym)} is not generated yet. Generate it on the Payroll page once the month's attendance is in.</p>`}
    </section>`);
  }

  if(!blocks.length) return `<section class="panel"><p class="dashEmpty">Welcome. Use the menu to open the pages you have access to.</p></section>`;
  return blocks.join('');
}
function initials(name){
  if(!name) return '?';
  const parts=name.trim().split(/\s+/);
  return ((parts[0]?.[0]||'')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}
