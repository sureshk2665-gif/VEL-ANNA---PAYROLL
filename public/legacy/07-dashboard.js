/* ================= DASHBOARD =================
   The month at a glance — only what needs a look or an action:
     1. Four tiles: Employees on the roll, Attendance (how many are entered), Net pay and the
        Contractors Bill — each opens its page.
     2. Needs attention: days still to enter (this month and last), last month's payroll not
        generated, employees without a contractor — each with its button. Nothing listed = all done.
     3. By contractor: employees, entered, net pay and the bill (salary + service charge).
   Figures come from the same calculation as Attendance, Payroll and the Contractors Bill. Tiles and
   items for pages the signed-in user cannot open are left out. */
function dashEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Employees on the roll in a month with the working days up to today still to enter.
function dashMissing(ym){ return payrollEmployeesFor(ym).map(e=>({e, miss:attMissingDays(e, ym)})); }
// Opens Attendance on a month (and an employee).
function dashOpenAtt(ym, code){ openAttDay(ym+'-01', code); }
function dashOpenAttSummary(ym){ tmpTab='summary'; attMonth=ym; render('attendance'); }
function dashOpenPayroll(ym){ payMonth=ym; render('payroll'); }
function dashOpenBill(ym){ if(typeof cbMonth!=='undefined') cbMonth=ym; render('contractorbill'); }
function dashNoContractor(){ empFilter={search:'',status:'',unit:'',contractor:'-',dept:'',missing:false}; render('employees'); }
function dashTile(o){
  return `<button type="button" class="dashTile ${o.warn?'warn':''}" ${o.click?`onclick="${o.click}"`:'disabled'}>
    <span class="dtLbl">${ico(o.icon)} ${o.label}</span>
    <span class="dtVal">${o.value}</span>
    <span class="dtSub">${o.sub}</span>
  </button>`;
}
function renderDashboard(){
  const today=todayStr(), ym=monthKey(today), prevYm=nextMonthKey(ym,-1);
  const canEmp=canOpenModule('employees'), canAtt=canOpenModule('attendance'), canPay=canOpenModule('payroll'), canBill=canOpenModule('contractorbill');
  const roll=payrollEmployeesFor(ym);
  const miss=canAtt ? dashMissing(ym) : [];
  const upToDate=miss.filter(x=>!x.miss).length, todo=miss.length-upToDate;
  let bill=null;
  if((canPay || canBill) && typeof cbContractorRows==='function'){ try{ bill=cbContractorRows(ym); }catch(e){ bill=null; } }
  // Net pay of every employee on the roll (those without a contractor too).
  const recs=(canPay || canBill) ? roll.map(e=>computePayrollForEmployee(e, ym)) : [];
  const net=(canPay || canBill) ? Math.round(recs.reduce((s,r)=>s+(+r.netSalary||0),0)) : null;
  const total=bill ? Math.round(bill.reduce((s,r)=>s+r.total,0)) : null; // what the contractors are paid (their employees' salary + service charge)
  const svc=bill ? Math.round(bill.reduce((s,r)=>s+r.commission,0)) : null;
  const gen=payrollGenerated(ym);
  const month=attMonthName(ym);

  // 1. Tiles
  const tiles=[];
  if(canEmp) tiles.push(dashTile({icon:'users', label:'Employees', value:roll.length, sub:'on the roll in '+dashEsc(month), click:"render('employees')"}));
  if(canAtt) tiles.push(dashTile({icon:'calendar-days', label:'Attendance', value:`${upToDate}<small> of ${miss.length}</small>`, sub:todo?`entered — ${todo} not entered yet`:'everyone entered', warn:!!todo, click:`dashOpenAtt('${ym}')`}));
  if(canPay && net!==null) tiles.push(dashTile({icon:'wallet', label:'Net pay', value:fmt(net), sub:gen?'payroll generated — so far this month':'so far — payroll not generated yet', click:`dashOpenPayroll('${ym}')`}));
  if(canBill && total!==null) tiles.push(dashTile({icon:'receipt', label:'Contractors Bill', value:fmt(total), sub:`salary + ${fmt(svc)} service charge`, click:`dashOpenBill('${ym}')`}));

  // 2. Needs attention
  const items=[];
  if(canAtt && todo) items.push({icon:'calendar-days', text:`<b>${todo}</b> employee${todo===1?' has':'s have'} no attendance entered for ${dashEsc(month)} yet — not paid until entered.`, btn:'See who', click:`dashOpenAttSummary('${ym}')`});
  if(canAtt && !payrollGenerated(prevYm)){
    const prevTodo=dashMissing(prevYm).filter(x=>x.miss).length;
    if(prevTodo) items.push({icon:'calendar-days', text:`<b>${prevTodo}</b> employee${prevTodo===1?' has':'s have'} no attendance entered for ${dashEsc(attMonthName(prevYm))}.`, btn:'Enter '+dashEsc(attMonthName(prevYm)), click:`dashOpenAtt('${prevYm}')`});
  }
  if(canPay && payrollEmployeesFor(prevYm).length && !payrollGenerated(prevYm)) items.push({icon:'wallet', text:`Payroll for ${dashEsc(attMonthName(prevYm))} is not generated yet.`, btn:'Open Payroll', click:`dashOpenPayroll('${prevYm}')`});
  const known=new Set(getContractors().map(c=>c.code));
  const noCon=roll.filter(e=>!known.has(e.contractor)).length;
  if(canEmp && noCon) items.push({icon:'alert', text:`<b>${noCon}</b> employee${noCon===1?' has':'s have'} no contractor — every employee must be under one.`, btn:'Show them', click:'dashNoContractor()'});
  const attention=`<section class="panel dashAttn">
    <div class="panelHead"><h3>Needs attention</h3>${items.length?`<span class="dashMeta">${items.length}</span>`:''}</div>
    ${items.length?`<ul>${items.map(it=>`<li><span class="daIco">${ico(it.icon)}</span><span class="daText">${it.text}</span><button type="button" class="btn secondary" onclick="${it.click}">${it.btn}</button></li>`).join('')}</ul>`
      :`<p class="dashAllDone">${ico('circle-check')} Nothing to do — attendance is entered and payroll is in order.</p>`}
  </section>`;

  // 3. By contractor
  let byCon='';
  if(bill || canAtt){
    const cons=getContractors().map(c=>{
      const b=bill && bill.find(r=>r.c.code===c.code);
      const m=miss.filter(x=>x.e.contractor===c.code);
      return {name:c.name||c.code, emps:m.length || (b?b.empCount:0), up:m.filter(x=>!x.miss).length, net:b?b.net:null, total:b?b.total:null};
    }).filter(r=>r.emps);
    const unset=miss.filter(x=>!known.has(x.e.contractor));
    if(unset.length){
      const un=recs.filter(r=>!known.has(r.contractor)), unNet=un.length ? Math.round(un.reduce((s,r)=>s+(+r.netSalary||0),0)) : null;
      cons.push({name:'Contractor not set', emps:unset.length, up:unset.filter(x=>!x.miss).length, net:unNet, total:null, unset:true});
    }
    const showMoney=bill && (canPay || canBill);
    byCon=cons.length?`<section class="panel">
      <div class="panelHead"><h3>By contractor</h3><span class="dashMeta">${dashEsc(month)}</span></div>
      <div class="dashTableWrap"><table class="dashTable"><thead><tr><th>Contractor</th><th class="num">Employees</th>${canAtt?'<th class="num">Entered</th>':''}${showMoney?'<th class="num">Net pay</th><th class="num" title="Net pay + service charge">Bill</th>':''}</tr></thead>
      <tbody>${cons.map(r=>`<tr><td class="${r.unset?'dashNeg':''}">${dashEsc(r.name)}</td><td class="num">${r.emps}</td>${canAtt?`<td class="num ${r.up<r.emps?'dashNeg':''}">${r.up}</td>`:''}${showMoney?`<td class="num">${r.net===null?'—':fmt(r.net)}</td><td class="num"><b>${r.total===null?'—':fmt(r.total)}</b></td>`:''}</tr>`).join('')}</tbody></table></div>
    </section>`:'';
  }

  if(!tiles.length && !items.length && !byCon) return `<section class="panel"><p class="dashEmpty">Welcome. Use the menu to open the pages you have access to.</p></section>`;
  return `${tiles.length?`<div class="dashTiles">${tiles.join('')}</div>`:''}
    <div class="dashRow">${byCon||''}${attention}</div>`;
}
function initials(name){
  if(!name) return '?';
  const parts=name.trim().split(/\s+/);
  return ((parts[0]?.[0]||'')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}
