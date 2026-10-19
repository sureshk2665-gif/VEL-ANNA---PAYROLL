/* ================= DASHBOARD ================= */
function renderDashboard(){
  const emps=db.employees;
  const today=todayStr();
  const active=emps.filter(e=>isEmpOnRollOn(e,today));
  const counts={Present:0,Absent:0,HalfDay:0,PaidLeave:0,LossOfPay:0};
  active.forEach(e=>{
    const s=getAttStatus(today, e.code);
    if(!s) counts.Absent++;
    else if(counts[s]!==undefined) counts[s]++;
  });
  const thisMonth=monthKey(today);
  const payrollThisMonth=db.payroll[thisMonth]||{};
  const salaryExpense=Object.values(payrollThisMonth).reduce((s,r)=>s+(r.netSalary||0),0);
  const now=new Date();
  const upcoming=active.filter(e=>e.dob).map(e=>{
    const d=new Date(e.dob); d.setFullYear(now.getFullYear());
    if(d<now) d.setFullYear(now.getFullYear()+1);
    return {...e,nextBday:d};
  }).sort((a,b)=>a.nextBday-b.nextBday).slice(0,5);
  const recent=[...emps].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
  const attPct = active.length ? Math.round(((active.length-counts.Absent)/active.length)*100) : 0;

  return `
  <div class="grid">
    <div class="stat" style="--stat-color:#0f6b5c;"><div class="statTop"><div class="statIcon">👥</div></div><div class="n">${active.length}</div><div class="l">Active Employees</div></div>
    <div class="stat" style="--stat-color:#16a34a;"><div class="statTop"><div class="statIcon">✅</div></div><div class="n">${counts.Present}</div><div class="l">Present Today</div></div>
    <div class="stat" style="--stat-color:#dc2626;"><div class="statTop"><div class="statIcon">🚫</div></div><div class="n">${counts.Absent}</div><div class="l">Absent Today</div></div>
    <div class="stat" style="--stat-color:#d97706;"><div class="statTop"><div class="statIcon">🕐</div></div><div class="n">${counts.HalfDay}</div><div class="l">Half Day</div></div>
    <div class="stat" style="--stat-color:#2563eb;"><div class="statTop"><div class="statIcon">🌿</div></div><div class="n">${counts.PaidLeave}</div><div class="l">NOPL</div></div>
    <div class="stat" style="--stat-color:#991b1b;"><div class="statTop"><div class="statIcon">⛔</div></div><div class="n">${counts.LossOfPay}</div><div class="l">Loss Of Pay</div></div>
    <div class="stat" style="--stat-color:#6d28d9;"><div class="statTop"><div class="statIcon">💰</div></div><div class="n">${fmt(salaryExpense)}</div><div class="l">This Month Salary Expense</div></div>
    <div class="stat" style="--stat-color:#0891b2;"><div class="statTop"><div class="statIcon">📈</div></div><div class="n">${attPct}%</div><div class="l">Attendance %</div></div>
  </div>
  <div class="toolbar no-print">
    <button class="btn" onclick="render('employees');openEmployeeModal()">+ Add Employee</button>
    <button class="btn secondary" onclick="render('attendance')">⚡ Mark Attendance</button>
    <button class="btn secondary" onclick="render('payroll')">💳 Generate Payroll</button>
  </div>
  <div class="panel">
    <div class="panelHead"><h3>🎂 Upcoming Birthdays</h3></div>
    ${upcoming.length? `<table><thead><tr><th>Name</th><th>Code</th><th>Date</th></tr></thead><tbody>
      ${upcoming.map(e=>`<tr><td class="empNameCell"><span class="avatarChip">${initials(e.name)}</span>${e.name}</td><td>${e.code}</td><td>${fmtDate(e.nextBday)}</td></tr>`).join('')}
    </tbody></table>`:'<div class="empty">No birthday data yet.</div>'}
  </div>
  <div class="panel">
    <div class="panelHead"><h3>🆕 Recent Employees</h3></div>
    ${recent.length? `<table><thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Status</th></tr></thead><tbody>
      ${recent.map(e=>`<tr><td>${e.code}</td><td class="empNameCell"><span class="avatarChip">${initials(e.name)}</span>${e.name}</td><td>${e.department||'-'}</td><td><span class="tag ${e.status}">${e.status}</span></td></tr>`).join('')}
    </tbody></table>`:'<div class="empty">No employees yet. Add your first employee.</div>'}
  </div>`;
}
function initials(name){
  if(!name) return '?';
  const parts=name.trim().split(/\s+/);
  return ((parts[0]?.[0]||'')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}

