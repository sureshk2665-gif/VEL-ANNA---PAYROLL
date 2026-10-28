/* ================= DASHBOARD =================
   Answers one question first: has today's attendance been entered, and who is missing?
     1. Today: present out of everyone on the roll, the split (Present / Loss of Pay / Half Day /
        not entered) and the one action — enter today's attendance in Employee Time Entry.
     2. The last 14 working days as columns (today's column in the company colour), beside the
        list of who still needs an entry today (or who is absent, once everyone is entered).
     3. Today by unit and by contractor.
     4. This month's payroll and what is owed to contractors.
   Every figure is computed from the same data as Attendance, Time Entry and Payroll. Blocks the
   signed-in user cannot open are left out. */
function dashEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// The last n working days (oldest first, no Sundays / holidays) up to today.
function dashLastWorkingDays(n){
  const out=[]; const d=new Date();
  for(let guard=0; out.length<n && guard<90; guard++){
    const ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if(d.getDay()!==0 && !isHolidayDate(ds)) out.unshift(ds);
    d.setDate(d.getDate()-1);
  }
  return out;
}
// Status counts for a date over a list of employees on the roll that day.
function dashDayCounts(ds, list){
  const c={roll:0, present:0, lop:0, half:0, none:0, noneList:[], lopList:[], halfList:[]};
  list.forEach(e=>{
    if(!isEmpOnRollOn(e, ds)) return;
    c.roll++;
    const s=getAttStatus(ds, e.code);
    if(s==='Present'||s==='NOPH') c.present++;
    else if(s==='LossOfPay'){ c.lop++; c.lopList.push(e); }
    else if(s==='HalfDay'){ c.half++; c.halfList.push(e); }
    else { c.none++; c.noneList.push(e); }
  });
  return c;
}
// Columns for the last working days: present (Present + Half Day) per day, today in the accent.
function dashDaysChart(days, narrow){
  const W=narrow?360:640, H=narrow?190:230, L=36, R=8, T=12, B=26, pw=W-L-R, ph=H-T-B;
  const vals=days.map(d=>d.present), max=Math.max(1, ...days.map(d=>d.roll));
  const step=max<=10?2:max<=40?10:max<=100?25:max<=200?50:100;
  const top=Math.ceil(max/step)*step;
  const y=v=>T+ph-(v/top)*ph;
  const n=vals.length, slot=pw/n, bw=Math.max(6, Math.min(28, slot*0.6));
  const ticks=[]; for(let v=0; v<=top; v+=step) ticks.push(v);
  const lbl=ds=>{ const d=new Date(ds+'T00:00:00'); return String(d.getDate()).padStart(2,'0')+' '+d.toLocaleString('en-GB',{month:'short'}); };
  const every=Math.ceil(n/7);
  return `<svg class="dashChart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Employees present on each of the last ${n} working days">
    ${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v===0?'base':'grid'}"/><text x="${L-6}" y="${(y(v)+4).toFixed(1)}" class="tick" text-anchor="end">${v}</text>`).join('')}
    ${days.map((d,i)=>{ const x=L+slot*i+(slot-bw)/2, h=(d.present/top)*ph; return `<rect x="${x.toFixed(1)}" y="${y(d.present).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" class="${d.today?'today':'bar'}"><title>${fmtDate(d.ds)}: ${d.present} present of ${d.roll}${d.none?` · ${d.none} not entered`:''}</title></rect>`; }).join('')}
    ${days.map((d,i)=>(i%every===0||i===n-1)?`<text x="${(L+slot*i+slot/2).toFixed(1)}" y="${H-8}" class="tick${d.today?' strong':''}" text-anchor="middle">${d.today?'Today':lbl(d.ds)}</text>`:'').join('')}
  </svg>`;
}
function dashTable(rows, firstHead){
  return `<div class="dashTableWrap"><table class="dashTable"><thead><tr><th>${firstHead}</th><th class="num">Employees</th><th class="num">Present</th><th class="num">Loss of Pay</th><th class="num">Half Day</th><th class="num">Not entered</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${dashEsc(r.name)}</td><td class="num">${r.c.roll}</td><td class="num">${r.c.present}</td><td class="num">${r.c.lop}</td><td class="num">${r.c.half}</td><td class="num ${r.c.none?'dashNeg':''}">${r.c.none||'0'}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderDashboard(){
  const today=todayStr(), ym=monthKey(today);
  const emps=db.employees||[];
  const canAtt=canOpenModule('attendance')||canOpenModule('timeentry');
  const canTE=canOpenModule('timeentry');
  const canPay=canOpenModule('payroll');
  const now=new Date();
  const dateText=now.toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const offToday=now.getDay()===0 || isHolidayDate(today);
  const holName=(getHolidayEntry(today)||{}).name;
  const c=dashDayCounts(today, emps);
  const entered=c.roll-c.none;
  const blocks=[];

  // 1. Today
  if(canAtt){
    const finding = offToday ? `${now.getDay()===0?'Sunday':(holName||'Holiday')} — no attendance is due today. Anyone who works is paid OT.`
      : c.none ? `${c.none} of ${c.roll} employee${c.roll===1?'':'s'} still need today's attendance.`
      : `Everyone is accounted for: ${c.present} present, ${c.lop} on Loss of Pay${c.half?`, ${c.half} on half day`:''}.`;
    blocks.push(`<section class="panel dashToday">
      <div class="dashTodayHead">
        <div>
          <h3>Today · ${dashEsc(dateText)}</h3>
          <p class="dashFinding ${!offToday&&c.none?'warn':''}">${dashEsc(finding)}</p>
        </div>
        <div class="dashActions">
          ${canTE?`<button class="btn" onclick="teOpenDateWise('${today}')">${ico('timer')} Enter today's attendance</button>`:''}
          ${canOpenModule('attendance')?`<button class="btn secondary" onclick="render('attendance');openAttDay('${today}')">View in Attendance</button>`:''}
        </div>
      </div>
      <div class="dashStrip">
        <div class="lead"><span class="lbl">Present</span><span class="val">${c.present}<small> of ${c.roll}</small></span></div>
        <div><span class="lbl">Loss of Pay</span><span class="val">${c.lop}</span></div>
        <div><span class="lbl">Half Day</span><span class="val">${c.half}</span></div>
        <div><span class="lbl">Not entered</span><span class="val ${!offToday&&c.none?'dashNeg':''}">${offToday?'—':c.none}</span></div>
        <div><span class="lbl">Entered</span><span class="val">${offToday?'—':Math.round(entered/(c.roll||1)*100)+'%'}</span></div>
      </div>
    </section>`);

    // 2. Last 14 working days + who needs attention
    // Phones get the last 7 days, so the chart's labels stay readable.
    const narrow=window.innerWidth<640;
    const days=dashLastWorkingDays(narrow?7:14).map(ds=>{ const d=dashDayCounts(ds, emps); return {ds, today:ds===today, present:d.present+d.half, roll:d.roll, none:d.none}; });
    const avg=days.length?Math.round(days.reduce((s,d)=>s+d.present,0)/days.length):0;
    const list = (!offToday && c.none) ? {title:'Not entered today', items:c.noneList, empty:''}
      : {title:'Absent today', items:c.lopList.concat(c.halfList), empty: offToday?'No attendance is due today.':'No one is absent today.'};
    const shown=list.items.slice(0,5);
    blocks.push(`<div class="dashRow">
      <section class="panel dashChartCard">
        <div class="panelHead"><h3>Present, last ${days.length} working days</h3><span class="dashMeta">Average ${avg} a day</span></div>
        ${dashDaysChart(days, narrow)}
      </section>
      <section class="panel dashList2">
        <div class="panelHead"><h3>${list.title}</h3><span class="dashMeta">${list.items.length}</span></div>
        ${shown.length?`<ul>${shown.map(e=>{ const lv=typeof teGetLeave==='function'?teGetLeave(today,e.code):null;
          return `<li><span class="avatarChip">${initials(e.name)}</span><span class="dlMain"><b>${dashEsc(e.name)}</b><small>${dashEsc(e.code)} · ${dashEsc(unitLabel(e.unit))}${contractorName(e)?' · '+dashEsc(contractorName(e)):''}</small></span><span class="dlSide">${lv?dashEsc(lv.type==='Half Day'?'Half Day':(lv.remarks||'Loss of Pay')):''}</span></li>`; }).join('')}</ul>`
          :`<p class="dashEmpty">${list.empty}</p>`}
        ${list.items.length>shown.length && canTE?`<button class="linkBtn" onclick="teOpenDateWise('${today}')">View all ${list.items.length} in Time Entry</button>`:''}
      </section>
    </div>`);

    // 3. Today by unit and by contractor
    const byUnit=getUnits().map(u=>({name:unitDisplayName(u), c:dashDayCounts(today, emps.filter(e=>unitCodeOf(e.unit)===u.code))})).filter(r=>r.c.roll);
    const byCon=getContractors().map(k=>({name:k.name||k.code, c:dashDayCounts(today, emps.filter(e=>e.contractor===k.code))})).filter(r=>r.c.roll);
    const noCon=dashDayCounts(today, emps.filter(e=>!getContractors().some(k=>k.code===e.contractor)));
    if(noCon.roll) byCon.push({name:'Contractor not set', c:noCon});
    if(byUnit.length||byCon.length) blocks.push(`<div class="dashRow even">
      <section class="panel"><div class="panelHead"><h3>Today by unit</h3></div>${dashTable(byUnit,'Unit')}</section>
      <section class="panel"><div class="panelHead"><h3>Today by contractor</h3></div>${dashTable(byCon,'Contractor')}</section>
    </div>`);
  }

  // 4. This month's payroll
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
      </div><p class="dashNote">So far this month, from the attendance and time entered up to today; it updates as entries are made.</p>`
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
