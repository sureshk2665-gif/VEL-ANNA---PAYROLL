/* ================= SALARY ADVANCE MODULE ================= */
let advEmpCode='';
function ensureSalaryAdvances(){ if(!Array.isArray(db.salaryAdvances)) db.salaryAdvances=[]; return db.salaryAdvances; }
function nextMonthKey(ym, offset){
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(y, m-1+offset, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function buildAdvanceSchedule(amount, months, startMonth){
  const schedule=[];
  if(!amount || !months) return schedule;
  const per = Math.round((amount/months)*100)/100;
  let balance = amount;
  for(let i=0; i<months; i++){
    const isLast = i===months-1;
    const amt = isLast ? Math.round(balance*100)/100 : per;
    balance = Math.round((balance-amt)*100)/100;
    schedule.push({ month: nextMonthKey(startMonth, i), amount: amt, balance: Math.max(0,balance) });
  }
  return schedule;
}
function addSalaryAdvance(){
  if(!hasPerm('salaryadvance','add')){ alert('You do not have permission to add salary advances.'); return; }
  const code=document.getElementById('adv_emp').value;
  const amount=+document.getElementById('adv_amount').value||0;
  const months=+document.getElementById('adv_months').value||0;
  const startMonth=document.getElementById('adv_start').value;
  const remarks=document.getElementById('adv_remarks').value||'';
  if(!code){ alert('Please select an employee.'); return; }
  if(amount<=0){ alert('Advance amount must be greater than zero.'); return; }
  if(months<=0){ alert('Number of months must be at least 1.'); return; }
  if(!startMonth){ alert('Please choose a deduction start month.'); return; }
  const schedule=buildAdvanceSchedule(amount, months, startMonth);
  const rec={
    id:'ADV'+Date.now(), empCode:code, amount, months, startMonth,
    monthlyDeduction: Math.round((amount/months)*100)/100,
    remarks, schedule, createdAt:new Date().toISOString()
  };
  ensureSalaryAdvances().push(rec);
  saveDB(db);
  render('salaryadvance');
}
function deleteSalaryAdvance(id){
  if(!hasPerm('salaryadvance','delete')){ alert('You do not have permission to delete salary advances.'); return; }
  if(!confirm('Delete this salary advance record and its remaining schedule? This cannot be undone.')) return;
  db.salaryAdvances=ensureSalaryAdvances().filter(a=>a.id!==id);
  saveDB(db);
  render('salaryadvance');
}
// Total advance recovery scheduled for a given employee + payroll month, across all their advances.
// Payroll picks this up automatically — no manual entry needed once an advance is created here.
function scheduledAdvanceDeduction(code, ym){
  return ensureSalaryAdvances()
    .filter(a=>a.empCode===code)
    .reduce((sum,a)=>{
      const row=a.schedule.find(r=>r.month===ym);
      return sum + (row ? row.amount : 0);
    }, 0);
}
// Returns the individual advance records (with their matching month's row) contributing to a
// given employee+month — used to show *why* a figure appears (or doesn't) on the Attendance screen.
function scheduledAdvanceDetails(code, ym){
  return ensureSalaryAdvances()
    .filter(a=>a.empCode===code)
    .map(a=>({ advance:a, row:a.schedule.find(r=>r.month===ym) }))
    .filter(x=>x.row);
}
// An instalment counts as recovered once payroll has been generated for its month (it is deducted
// on that month's salary slip). The schedule itself always adds up to the full advance, so summing
// all of it showed a balance of ₹0 from the day the advance was given.
function advanceRowRecovered(r){ return payrollGenerated(r.month); }
function advanceRecoveredAmount(a){
  return Math.round(a.schedule.filter(advanceRowRecovered).reduce((s,r)=>s+r.amount,0)*100)/100;
}
function advanceStatus(a){
  return a.schedule.length && a.schedule.every(advanceRowRecovered) ? 'recovered' : 'active';
}
// Page state: list filter, search, and which advances have their schedule opened.
let advFilter='active', advSearch='', advOpen=new Set();
function advEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Employee box: type a code or name, pick from the list; the code goes into #adv_emp for addSalaryAdvance().
function advPickEmp(inp){
  const v=String(inp.value).trim(), code=(v.split(/\s+[—-]\s+/)[0]||'').toUpperCase();
  const emp=db.employees.find(e=>e.code.toUpperCase()===code) || db.employees.find(e=>(e.name||'').toLowerCase()===v.toLowerCase());
  document.getElementById('adv_emp').value=emp ? emp.code : '';
  inp.classList.toggle('bad', !!v && !emp);
  advPreview();
}
// Live line under the form: "₹2,000 a month for 3 months · Oct-2026 → Dec-2026".
function advPreview(){
  const el=document.getElementById('advPreview'); if(!el) return;
  const amount=+document.getElementById('adv_amount').value||0, months=+document.getElementById('adv_months').value||0, start=document.getElementById('adv_start').value;
  if(amount>0 && months>0 && start){
    const per=Math.round(amount/months*100)/100;
    el.innerHTML=`<b>${fmt(per)}</b> a month for <b>${months}</b> month${months===1?'':'s'} · ${monthLabel(start)} → ${monthLabel(nextMonthKey(start, months-1))}`;
  } else el.textContent='Monthly deduction = Advance ÷ Months. The recovery schedule is made when you create the advance.';
}
function advSetFilter(f){ advFilter=f; render('salaryadvance'); }
function advSetSearch(el){ const pos=el.selectionStart; advSearch=el.value; render('salaryadvance'); const i=document.getElementById('advSearch'); if(i){ i.focus(); i.setSelectionRange(pos,pos); } }
function advToggle(id){ if(advOpen.has(id)) advOpen.delete(id); else advOpen.add(id); render('salaryadvance'); }
function renderSalaryAdvance(){
  const advances=ensureSalaryAdvances();
  const onRoll=db.employees.filter(e=>isEmpOnRollOn(e,todayStr())).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const canAdd=hasPerm('salaryadvance','add'), canDel=hasPerm('salaryadvance','delete');
  const thisMonth=monthKey(todayStr());
  const info=advances.map(a=>{
    const emp=db.employees.find(e=>e.code===a.empCode);
    const recovered=advanceRecoveredAmount(a);
    return {a, emp, recovered, balance:Math.max(0, Math.round((a.amount-recovered)*100)/100), status:advanceStatus(a)};
  });
  const active=info.filter(x=>x.status!=='recovered');
  const outstanding=active.reduce((s,x)=>s+x.balance,0);
  const dueThisMonth=advances.reduce((s,a)=>s+((a.schedule.find(r=>r.month===thisMonth)||{}).amount||0),0);
  const recoveredTotal=info.reduce((s,x)=>s+x.recovered,0);
  const q=advSearch.trim().toLowerCase();
  const list=info.filter(x=>(advFilter==='all' || (advFilter==='active' ? x.status!=='recovered' : x.status==='recovered'))
      && (!q || `${x.a.empCode} ${x.emp?x.emp.name:''} ${x.a.remarks||''}`.toLowerCase().includes(q)))
    .sort((p,r)=>(r.a.createdAt||'').localeCompare(p.a.createdAt||''));
  const rows=list.map(({a,emp,recovered,balance,status})=>{
    const pct=a.amount ? Math.min(100, Math.round(recovered/a.amount*100)) : 0;
    const open=advOpen.has(a.id);
    const sched=a.schedule.map(r=>{ const done=advanceRowRecovered(r);
      return `<span class="advInst ${done?'done':r.month===thisMonth?'now':''}" title="${done?'Deducted in '+monthLabel(r.month)+' payroll':'Payroll for '+monthLabel(r.month)+' not generated yet'}">${done?ico('check'):''}${monthLabel(r.month)} · ${fmt(r.amount)}</span>`; }).join('');
    return `<tr class="${open?'advOpenRow':''}">
      <td class="advCode">${advEsc(a.empCode)}</td>
      <td><b>${advEsc(emp?emp.name:a.empCode)}</b>${a.remarks?`<span class="advRemark">${advEsc(a.remarks)}</span>`:''}</td>
      <td class="num">${fmt(a.amount)}</td>
      <td class="num">${fmt(a.monthlyDeduction)} × ${a.months}</td>
      <td>${monthLabel(a.startMonth)} → ${monthLabel(nextMonthKey(a.startMonth, a.months-1))}</td>
      <td class="advProg"><div class="advBar" title="${pct}% recovered"><i style="width:${pct}%"></i></div><span>${fmt(recovered)} recovered</span></td>
      <td class="num"><b>${fmt(balance)}</b></td>
      <td>${status==='recovered'?'<span class="tag Present">Recovered</span>':'<span class="advActive">Active</span>'}</td>
      <td class="rowActions"><button onclick="advToggle('${a.id}')" aria-expanded="${open}">${ico('calendar')} Schedule</button>${canDel?`<button class="del advDel" title="Delete this advance" aria-label="Delete advance of ${advEsc(emp?emp.name:a.empCode)}" onclick="deleteSalaryAdvance('${a.id}')">${ico('trash')}</button>`:''}</td>
    </tr>${open?`<tr class="advSchedRow"><td></td><td colspan="8"><div class="advSched">${sched}</div></td></tr>`:''}`;
  }).join('');
  const seg=(k,label,n)=>`<button type="button" class="attUnitTab ${advFilter===k?'active':''}" onclick="advSetFilter('${k}')">${label} <span class="advCount">${n}</span></button>`;
  return `
  ${canAdd ? `
  <div class="panel advNew">
    <h3>${ico('plus')} Issue New Salary Advance</h3>
    <div class="advForm">
      <div class="advEmp"><label for="adv_empFind">Employee</label>
        <input id="adv_empFind" list="advEmpList" placeholder="Type code or name" autocomplete="off" oninput="advPickEmp(this)" onchange="advPickEmp(this)">
        <datalist id="advEmpList">${onRoll.map(e=>`<option value="${advEsc(e.code+' — '+e.name)}">${advEsc(e.department||'')}</option>`).join('')}</datalist>
        <input type="hidden" id="adv_emp" value=""></div>
      <div><label for="adv_amount">Advance (₹)</label><input type="number" id="adv_amount" min="0" placeholder="6000" oninput="advPreview()"></div>
      <div><label for="adv_months">Months</label><input type="number" id="adv_months" min="1" placeholder="3" oninput="advPreview()"></div>
      <div><label for="adv_start">First deduction</label><input type="month" id="adv_start" value="${thisMonth}" onchange="advPreview()"></div>
      <div class="advRem"><label for="adv_remarks">Remarks (optional)</label><input type="text" id="adv_remarks" placeholder="Reason / notes"></div>
      <div class="advGo"><button class="btn" onclick="addSalaryAdvance()">${ico('plus')} Create Advance</button></div>
    </div>
    <p class="advPreview" id="advPreview">Monthly deduction = Advance ÷ Months. The recovery schedule is made when you create the advance.</p>
  </div>` : ''}
  <div class="teStatRow advStrip">
    <div class="teStatBox"><b>${active.length}</b><span>Active advances</span></div>
    <div class="teStatBox ${outstanding?'warn':''}"><b>${fmt(Math.round(outstanding*100)/100)}</b><span>Still to recover</span></div>
    <div class="teStatBox"><b>${fmt(Math.round(dueThisMonth*100)/100)}</b><span>Deducted in ${monthLabel(thisMonth)}</span></div>
    <div class="teStatBox ok"><b>${fmt(Math.round(recoveredTotal*100)/100)}</b><span>Recovered so far</span></div>
  </div>
  <div class="panel advList">
    <div class="advListHead">
      <div class="attUnitTabs advSeg" role="tablist">${seg('active','Active',active.length)}${seg('recovered','Recovered',info.length-active.length)}${seg('all','All',info.length)}</div>
      <div class="searchWrap advSearchWrap"><span class="sIcon">${ico('search')}</span><input id="advSearch" placeholder="Search employee or remarks" value="${advEsc(advSearch)}" oninput="advSetSearch(this)" aria-label="Search advances"></div>
    </div>
    ${!advances.length ? '<div class="empty">No salary advances issued yet.</div>' : !list.length ? `<div class="empty">No ${advFilter==='all'?'':advFilter+' '}advances${q?' match your search':''}.</div>` : `
    <div class="tableScrollWrap advScroll">
    <table class="advTable">
      <thead><tr><th>Code</th><th>Employee</th><th class="num">Advance</th><th class="num">Monthly</th><th>Recovery period</th><th>Recovered</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`}
    <p class="syncNote">The monthly deduction is taken automatically in Payroll for each scheduled month and shows on the salary slip. An instalment counts as recovered once that month's payroll is generated; the advance stops on its own when the full amount is recovered.</p>
  </div>`;
}
