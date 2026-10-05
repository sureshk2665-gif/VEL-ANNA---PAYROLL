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
function advanceRecoveredAmount(a){
  return Math.round(a.schedule.reduce((s,r)=>s+r.amount,0)*100)/100;
}
function advanceStatus(a, todayYm){
  const lastRow=a.schedule[a.schedule.length-1];
  return lastRow && lastRow.month <= todayYm ? 'recovered' : 'active';
}
function renderSalaryAdvance(){
  const advances=ensureSalaryAdvances();
  const empOpts=db.employees.filter(e=>isEmpOnRollOn(e,todayStr())).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(e=>`<option value="${e.code}">${e.code} - ${e.name}</option>`).join('');
  const canAdd=hasPerm('salaryadvance','add');
  const todayYm=monthKey(todayStr());
  const rows=advances.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(a=>{
    const emp=db.employees.find(e=>e.code===a.empCode);
    const recovered=advanceRecoveredAmount(a);
    const balance=Math.max(0, Math.round((a.amount-recovered)*100)/100);
    const status=advanceStatus(a, todayYm);
    const schedRows=a.schedule.map(r=>`<tr class="${r.month<=todayYm?'paidRow':''}"><td>${monthLabel(r.month)}</td><td>${fmt(r.amount)}</td><td>${fmt(r.balance)}</td></tr>`).join('');
    return `<tr>
      <td>${emp?emp.name:a.empCode}</td>
      <td>${a.empCode}</td>
      <td>${fmt(a.amount)}</td>
      <td>${a.months}</td>
      <td>${monthLabel(a.startMonth)}</td>
      <td>${fmt(a.monthlyDeduction)}</td>
      <td>${fmt(balance)}</td>
      <td><span class="advStatus ${status}">${status==='recovered'?'Recovered':'Active'}</span></td>
      <td>${a.remarks||'-'}</td>
      <td>
        <button class="btn secondary" style="padding:4px 8px;font-size:11px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';">Schedule</button>
        <div style="display:none;position:relative;">
          <table class="advSchedule"><thead><tr><th>Month</th><th>Deduction</th><th>Balance</th></tr></thead><tbody>${schedRows}</tbody></table>
        </div>
        ${hasPerm('salaryadvance','delete') ? `<button class="btn danger" style="padding:4px 8px;font-size:11px;margin-top:4px;" onclick="deleteSalaryAdvance('${a.id}')">Delete</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  return `
  <div class="panel">
    ${canAdd ? `
    <h3 style="margin-top:0;">Issue New Salary Advance</h3>
    <div class="advFormGrid">
      <div style="grid-column:1/-1;"><label>Employee Name</label><select id="adv_emp" style="width:100%;">${empOpts}</select></div>
      <div><label>Advance Amount (₹)</label><input type="number" id="adv_amount" min="0" placeholder="e.g. 6000"></div>
      <div><label>Number of Months</label><input type="number" id="adv_months" min="1" placeholder="e.g. 3"></div>
      <div><label>Deduction Start Month</label><input type="month" id="adv_start" value="${monthKey(todayStr())}"></div>
      <div style="grid-column:1/-1;"><label>Remarks (optional)</label><input type="text" id="adv_remarks" placeholder="Reason / notes"></div>
    </div>
    <button class="btn" onclick="addSalaryAdvance()">➕ Create Advance & Generate Schedule</button>
    <p class="advCalcNote">Monthly deduction is calculated automatically as Advance Amount ÷ Number of Months, and the month-wise recovery schedule is generated instantly.</p>
    ` : ''}
  </div>
  <div class="panel">
    <h3 style="margin-top:0;">Salary Advance Records</h3>
    ${!advances.length ? '<div class="empty">No salary advances issued yet.</div>' : `
    <div style="overflow-x:auto;">
    <table class="advTable">
      <thead><tr><th>Employee</th><th>Code</th><th>Advance ₹</th><th>Months</th><th>Start Month</th><th>Monthly ₹</th><th>Balance ₹</th><th>Status</th><th>Remarks</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`}
    <p class="syncNote">Once created, the monthly deduction is picked up automatically during Payroll processing for the scheduled month, and stops on its own once the full advance amount has been recovered.</p>
  </div>`;
}

