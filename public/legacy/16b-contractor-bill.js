/* ================= CONTRACTORS BILL =================
   Two views for a month, one or all contractors:
   - Contractor Service Charge: MF pays each contractor a fixed amount for every FULL Present day of
     every employee that contractor supplied. Half Days, holidays (NOPH) and absent days don't count.
   - Company Payable: what MF pays the contractor for the month = the Net Pay of the employees it
     supplied + that service charge.
   The rate (₹30 per present day to start) is kept per month in db.contractorRates[ym]. A month
   without its own rate uses the latest earlier month's rate. Only Admin / Software Admin can
   change it. Salary and present days are the live payroll figures (computePayrollForEmployee),
   so they always match the Payroll screen and the salary slips. */
let cbTab='commission';               // 'commission' | 'company'
let cbMonth=monthKey(todayStr());
let cbContractor='';                  // '' = all contractors, else a contractor code
const CB_DEFAULT_RATE=30;

function cbRateFor(ym){
  const r=db.contractorRates||{};
  if(r[ym]!==undefined && r[ym]!==null) return +r[ym]||0;
  const earlier=Object.keys(r).filter(k=>k<ym).sort().pop();
  return earlier ? (+r[earlier]||0) : CB_DEFAULT_RATE;
}
function cbCanEditRate(){ return !!currentUser && (currentUser.role==='Admin' || currentUser.role==='Software Admin'); }
function cbSaveRate(){
  if(!cbCanEditRate()){ alert('Only an Admin can change the service charge rate.'); return; }
  const v=String(document.getElementById('cb_rate').value).trim();
  if(v==='' || isNaN(+v) || +v<0){ alert('Please enter the amount per present day (for example 30).'); return; }
  if(!db.contractorRates) db.contractorRates={};
  db.contractorRates[cbMonth]=Math.round(+v*100)/100;
  saveDB(db);
  render('contractorbill');
}
function cbSet(field, val){
  if(field==='tab') cbTab=val;
  else if(field==='month'){ if(!val) return; cbMonth=val; }
  else if(field==='contractor') cbContractor=val;
  render('contractorbill');
}

// One entry per contractor (narrowed by the contractor filter) with its employees for the month.
function cbContractorRows(ym){
  const rate=cbRateFor(ym);
  const generated=payrollGenerated(ym);
  return getContractors().filter(c=>!cbContractor || c.code===cbContractor).map(c=>{
    const emps=payrollEmployeesFor(ym).filter(e=>e.contractor===c.code).map(e=>{
      const r=(generated && payrollRecordFor(e.code, ym)) || computePayrollForEmployee(e, ym);
      const days=+r.presentDays||0;
      return {e, days, commission:Math.round(days*rate*100)/100, earnings:+r.earningsTotal||0, deductions:+r.deductionsTotal||0, net:+r.netSalary||0, paidDays:+r.daysWorking||0};
    });
    const days=emps.reduce((s,x)=>s+x.days,0);
    const net=Math.round(emps.reduce((s,x)=>s+x.net,0)*100)/100;
    const commission=Math.round(days*rate*100)/100;
    return {c, emps, empCount:emps.length, days, rate, commission, net, total:Math.round((net+commission)*100)/100};
  });
}

function renderContractorBill(){
  const rows=cbContractorRows(cbMonth);
  const rate=cbRateFor(cbMonth);
  const generated=payrollGenerated(cbMonth);
  const sum=k=>Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const ownRate=db.contractorRates && db.contractorRates[cbMonth]!==undefined;
  const tab=(k,icon,label)=>`<button class="attTab ${cbTab===k?'active':''}" onclick="cbSet('tab','${k}')">${ico(icon)} ${label}</button>`;
  const one=cbContractor ? rows[0] : null;
  const commissionTable=`<div class="tableScrollWrap"><table class="cbTable">
    <thead><tr><th style="text-align:left;">Contractor</th><th>Employees Supplied</th><th>Total Present Days</th><th>Rate / Day</th><th>Service Charge</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td style="text-align:left;"><b>${r.c.name||r.c.code}</b></td><td>${r.empCount}</td><td>${r.days}</td><td>₹${rate}</td><td><b>${fmt(r.commission)}</b></td></tr>`).join('') || `<tr><td colspan="5" class="empty">No contractors.</td></tr>`}
    ${rows.length>1?`<tr class="cbTotal"><td style="text-align:left;">Total</td><td>${sum('empCount')}</td><td>${sum('days')}</td><td>₹${rate}</td><td>${fmt(sum('commission'))}</td></tr>`:''}
    </tbody></table></div>`;
  const companyTable=`<div class="tableScrollWrap"><table class="cbTable">
    <thead><tr><th style="text-align:left;">Contractor</th><th>Employees Supplied</th><th>Total Present Days</th><th>Salary (Net Pay)</th><th>Service Charge</th><th>Total Payable</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td style="text-align:left;"><b>${r.c.name||r.c.code}</b></td><td>${r.empCount}</td><td>${r.days}</td><td>${fmt(r.net)}</td><td>${fmt(r.commission)}</td><td><b>${fmt(r.total)}</b></td></tr>`).join('') || `<tr><td colspan="6" class="empty">No contractors.</td></tr>`}
    ${rows.length>1?`<tr class="cbTotal"><td style="text-align:left;">Total</td><td>${sum('empCount')}</td><td>${sum('days')}</td><td>${fmt(sum('net'))}</td><td>${fmt(sum('commission'))}</td><td>${fmt(sum('total'))}</td></tr>`:''}
    </tbody></table></div>`;
  const detail = one ? `<h4 style="margin:18px 0 8px;">${ico('users')} ${one.c.name||one.c.code} — employees, ${monthLabel(cbMonth)}</h4>
    <div class="tableScrollWrap"><table class="cbTable">
      <thead><tr><th>Sl No</th><th>Emp Code</th><th style="text-align:left;">Name</th><th>Unit</th><th>Present Days</th>${cbTab==='company'?'<th>Paid Days</th><th>Total Earnings</th><th>Deductions</th><th>Net Pay</th>':''}<th>Service Charge</th>${cbTab==='company'?'<th>Total Payable</th>':''}</tr></thead>
      <tbody>${one.emps.map((x,i)=>`<tr><td>${i+1}</td><td>${x.e.code}</td><td style="text-align:left;">${x.e.name}</td><td>${unitLabel(x.e.unit)}</td><td>${x.days}</td>${cbTab==='company'?`<td>${x.paidDays}</td><td>${fmt(x.earnings)}</td><td>${fmt(x.deductions)}</td><td>${fmt(x.net)}</td>`:''}<td>${fmt(x.commission)}</td>${cbTab==='company'?`<td><b>${fmt(Math.round((x.net+x.commission)*100)/100)}</b></td>`:''}</tr>`).join('') || `<tr><td colspan="11" class="empty">No employees from this contractor on the roll in ${monthLabel(cbMonth)}.</td></tr>`}</tbody>
    </table></div>` : '';
  return `
  <div class="panel">
    <div class="cbTop">
      <div class="attTabsInline">${tab('commission','users','Contractor Service Charge')}${tab('company','wallet','Company Payable')}</div>
      <label class="cbLbl">${ico('calendar-days')} Month <input type="month" value="${cbMonth}" onchange="cbSet('month',this.value)"></label>
      <label class="cbLbl">${ico('building')} Contractor
        <select onchange="cbSet('contractor',this.value)"><option value="">All Contractors</option>${getContractors().map(c=>`<option value="${c.code}" ${cbContractor===c.code?'selected':''}>${c.name||c.code}</option>`).join('')}</select>
      </label>
      <span class="cbRate">${ico('tag')} Service charge rate for ${monthLabel(cbMonth)}:
        ${cbCanEditRate()
          ? `₹ <input id="cb_rate" type="number" min="0" step="0.5" value="${rate}" title="Amount paid to the contractor for each full Present day of each of its employees"> per present day <button class="btn tiny" onclick="cbSaveRate()">${ico('save')} Save</button>`
          : `<b>₹${rate}</b> per present day`}
        <span class="cbRateNote">${ownRate?'set for this month':'carried from the previous rate'}</span>
      </span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn secondary" onclick="printContractorBill()">${ico('printer')} Print</button>
        ${hasPerm('contractorbill','export')?`<button class="btn secondary" onclick="downloadContractorBillExcel()">${ico('file-spreadsheet')} Excel</button>`:''}
      </span>
    </div>
    <div class="grid" style="margin-top:14px;">
      <div class="stat" style="--stat-color:#0f6b5c;"><div class="n">${sum('empCount')}</div><div class="l">Employees Supplied</div></div>
      <div class="stat" style="--stat-color:#2563eb;"><div class="n">${sum('days')}</div><div class="l">Total Present Days</div></div>
      ${cbTab==='company'?`<div class="stat" style="--stat-color:#6d28d9;"><div class="n">${fmt(sum('net'))}</div><div class="l">Salary (Net Pay)</div></div>`:''}
      <div class="stat" style="--stat-color:#b45309;"><div class="n">${fmt(sum('commission'))}</div><div class="l">Service Charge</div></div>
      ${cbTab==='company'?`<div class="stat" style="--stat-color:#dc2626;"><div class="n">${fmt(sum('total'))}</div><div class="l">Total Payable</div></div>`:''}
    </div>
    ${cbTab==='company' ? companyTable : commissionTable}
    ${detail}
    <p class="syncNote">${cbTab==='company'
      ? `Total Payable = the employees' <b>Net Pay</b> (the same figure as their salary slips) + the contractor's service charge. ${generated?'':`<b>Payroll for ${monthLabel(cbMonth)} is not generated yet</b> — salary shown is worked out from the current attendance and Time Entry.`}`
      : `Service Charge = full <b>Present</b> days of all the employees the contractor supplied × ₹${rate}. Half Days, holidays and absent days are not counted. Present days come from Employee Time Entry / Attendance.`}
      ${cbCanEditRate()?' The rate can be changed for any month (usually from the 1st); later months keep it until it is changed again.':''}</p>
  </div>`;
}

function cbExcelSheets(){
  const rows=cbContractorRows(cbMonth), rate=cbRateFor(cbMonth), company=cbTab==='company';
  const summary={ name:company?'Company Payable':'Contractor Service Charge',
    title:`${db.companyName||''} — ${company?'Company Payable to Contractors':'Contractor Service Charge'} — ${monthLabel(cbMonth)}`,
    subtitle:`Service charge ₹${rate} per full present day`,
    columns:[{header:'Contractor', key:'name', width:28},{header:'Employees Supplied', key:'empCount', type:'number'},{header:'Total Present Days', key:'days', type:'number'},
      {header:'Rate / Day', key:'rate', type:'money', noTotal:true},
      ...(company?[{header:'Salary (Net Pay)', key:'net', type:'money'}]:[]),
      {header:'Service Charge', key:'commission', type:'money'},
      ...(company?[{header:'Total Payable', key:'total', type:'money'}]:[])],
    rows:rows.map(r=>({name:r.c.name||r.c.code, empCount:r.empCount, days:r.days, rate, net:r.net, commission:r.commission, total:r.total})), totals:true };
  const detail={ name:'Employees', title:`${monthLabel(cbMonth)} — employees by contractor`,
    columns:[{header:'Contractor', key:'contractor', width:24},{header:'Emp Code', key:'code'},{header:'Name', key:'name', width:24},{header:'Unit', key:'unit'},
      {header:'Present Days', key:'days', type:'number'},
      ...(company?[{header:'Paid Days', key:'paidDays', type:'number'},{header:'Total Earnings', key:'earnings', type:'money'},{header:'Deductions', key:'deductions', type:'money'},{header:'Net Pay', key:'net', type:'money'}]:[]),
      {header:'Service Charge', key:'commission', type:'money'},
      ...(company?[{header:'Total Payable', key:'total', type:'money'}]:[])],
    rows:rows.flatMap(r=>r.emps.map(x=>({contractor:r.c.name||r.c.code, code:x.e.code, name:x.e.name, unit:unitLabel(x.e.unit), days:x.days, paidDays:x.paidDays, earnings:x.earnings, deductions:x.deductions, net:x.net, commission:x.commission, total:Math.round((x.net+x.commission)*100)/100}))),
    totals:true };
  return [summary, detail];
}
function downloadContractorBillExcel(){
  if(!hasPerm('contractorbill','export')){ alert('You do not have permission to export.'); return; }
  const sel=cbContractor?'-'+(contractorName(cbContractor)||cbContractor).replace(/[^A-Za-z0-9]+/g,'-'):'';
  window.downloadExcel({ fileName:`${companyFilePrefix()}-${cbTab==='company'?'Company-Payable':'Contractor-Service-Charge'}-${monthLabel(cbMonth)}${sel}.xlsx`, sheets:cbExcelSheets() });
}
function printContractorBill(){
  const sheets=cbExcelSheets();
  const table=sh=>{
    const money=c=>c.type==='money';
    const tot=c=>sh.rows.reduce((s,r)=>s+(+r[c.key]||0),0);
    return `<table class="repTable"><thead><tr>${sh.columns.map(c=>`<th>${c.header}</th>`).join('')}</tr></thead><tbody>
      ${sh.rows.map(r=>`<tr>${sh.columns.map(c=>`<td${c.type?'':' style="text-align:left;"'}>${money(c)?fmt(r[c.key]):(r[c.key]??'')}</td>`).join('')}</tr>`).join('')}
      <tr class="subtotal">${sh.columns.map((c,i)=>`<td>${i===0?'TOTAL':(c.type&&!c.noTotal?(money(c)?fmt(tot(c)):Math.round(tot(c)*100)/100):'')}</td>`).join('')}</tr>
    </tbody></table>`;
  };
  const html=`<p style="margin:0 0 8px;">${sheets[0].subtitle}. ${cbTab==='company'?'Total Payable = Net Pay of the employees supplied + service charge.':'Service Charge = full present days × rate (half days and holidays not counted).'}</p>
    ${table(sheets[0])}<h3 style="margin:14px 0 6px;font-size:13px;">Employees</h3>${table(sheets[1])}`;
  openPrintWindow(`${cbTab==='company'?'Company Payable to Contractors':'Contractor Service Charge'} — ${monthLabel(cbMonth)}${cbContractor?' — '+contractorName(cbContractor):''}`, html, {orientation:'landscape'});
}
