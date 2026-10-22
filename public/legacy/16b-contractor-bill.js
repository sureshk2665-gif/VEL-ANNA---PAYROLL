/* ================= CONTRACTORS BILL =================
   Two views for a month, listing every contractor (click a contractor to see its employees):
   - Contractor Service Charge: MF pays each contractor a fixed amount for every FULL Present day of
     every employee that contractor supplied. Half Days, holidays (NOPH) and absent days don't count.
   - Company Payable: what MF pays the contractor for the month = the Net Pay of the employees it
     supplied + that service charge.
   Each contractor has its own rate (₹30 per present day to start), set per month from the 1st:
   db.contractorRates[ym] = {contractorCode: rate}. A month without a contractor's rate uses that
   contractor's latest earlier rate, so a new month starts from last month's rates. Only Admin /
   Software Admin can change rates, for any month, at any time. (Older data stored one number per
   month for every contractor; that still reads as that month's rate for all of them.) Salary and
   present days are the live payroll figures (computePayrollForEmployee), so they always match the
   Payroll screen and the salary slips. */
let cbTab='commission';               // 'commission' | 'company'
let cbMonth=monthKey(todayStr());
let cbOpen={};                        // contractor code -> true when its employee list is expanded
const CB_DEFAULT_RATE=30;

// The rate stored for one contractor in month ym, or undefined when the month has none for it.
function cbStoredRate(ym, code){
  const m=(db.contractorRates||{})[ym];
  if(m===undefined || m===null) return undefined;
  if(typeof m!=='object') return +m||0;           // old data: one rate for every contractor
  return (m[code]!==undefined && m[code]!==null) ? (+m[code]||0) : undefined;
}
// Contractor's rate for month ym: that month's own rate, else its latest earlier one, else ₹30.
function cbRateFor(ym, code){
  const own=cbStoredRate(ym, code);
  if(own!==undefined) return own;
  const earlier=Object.keys(db.contractorRates||{}).filter(k=>k<ym).sort().reverse();
  for(const k of earlier){ const v=cbStoredRate(k, code); if(v!==undefined) return v; }
  return CB_DEFAULT_RATE;
}
function cbEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function cbCanEditRate(){ return !!currentUser && (currentUser.role==='Admin' || currentUser.role==='Software Admin'); }
function cbSaveRates(){
  if(!cbCanEditRate()){ alert('Only an Admin can change the service charge.'); return; }
  const next={};
  for(const c of getContractors()){
    const el=document.getElementById('cb_rate_'+c.code);
    if(!el) continue;
    const v=String(el.value).trim();
    if(v==='' || isNaN(+v) || +v<0){ alert(`Please enter the service charge per present day for ${c.name||c.code} (for example 30).`); el.focus(); return; }
    next[c.code]=Math.round(+v*100)/100;
  }
  if(!db.contractorRates) db.contractorRates={};
  const old=db.contractorRates[cbMonth];
  // Keep any contractor rates not on screen; old single-number months become per-contractor.
  db.contractorRates[cbMonth]={...(old && typeof old==='object' ? old : {}), ...next};
  saveDB(db);
  render('contractorbill');
}
function cbSet(field, val){
  if(field==='tab') cbTab=val;
  else if(field==='month'){ if(!val) return; cbMonth=val; }
  else if(field==='toggle') cbOpen[val]=!cbOpen[val];
  render('contractorbill');
}

// One entry per contractor with its employees for the month.
function cbContractorRows(ym){
  const generated=payrollGenerated(ym);
  return getContractors().map(c=>{
    const rate=cbRateFor(ym, c.code);
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
  const generated=payrollGenerated(cbMonth);
  const editable=cbCanEditRate();
  const sum=k=>Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const tab=(k,icon,label)=>`<button class="attTab ${cbTab===k?'active':''}" onclick="cbSet('tab','${k}')">${ico(icon)} ${label}</button>`;
  const company=cbTab==='company';
  const cols=company?8:6;
  // Rate / Day: a box per contractor while the month can still be set, else the fixed rate.
  const rateCell=r=>editable
    ? `₹ <input id="cb_rate_${r.c.code}" type="number" min="0" step="0.5" value="${r.rate}" onkeydown="if(event.key==='Enter')cbSaveRates()" title="Service charge per full Present day for ${cbEsc(r.c.name||r.c.code)}, ${monthLabel(cbMonth)}">`
    : `<b>₹${r.rate}</b>`;
  // A contractor row (click to show / hide its employees) and, when open, its employee list.
  const contractorRow=r=>{
    const open=!!cbOpen[r.c.code];
    const head=`<tr class="cbRow${open?' open':''}" onclick="cbSet('toggle','${r.c.code}')" title="Show / hide the employees">
      <td class="cbCaret">${open?'▾':'▸'}</td><td style="text-align:left;"><b>${cbEsc(r.c.name||r.c.code)}</b></td><td>${r.empCount}</td><td>${r.days}</td><td onclick="event.stopPropagation()" class="cbRateCell">${rateCell(r)}</td>
      ${company?`<td>${fmt(r.net)}</td>`:''}<td><b>${fmt(r.commission)}</b></td>${company?`<td><b>${fmt(r.total)}</b></td>`:''}</tr>`;
    if(!open) return head;
    const emp=`<table class="cbTable cbInner">
      <thead><tr><th>Sl No</th><th>Emp Code</th><th style="text-align:left;">Name</th><th>Unit</th><th>Present Days</th>${company?'<th>Paid Days</th><th>Total Earnings</th><th>Deductions</th><th>Net Pay</th>':''}<th>Service Charge</th>${company?'<th>Total Payable</th>':''}</tr></thead>
      <tbody>${r.emps.map((x,i)=>`<tr><td>${i+1}</td><td>${x.e.code}</td><td style="text-align:left;">${cbEsc(x.e.name)}</td><td>${unitLabel(x.e.unit)}</td><td>${x.days}</td>${company?`<td>${x.paidDays}</td><td>${fmt(x.earnings)}</td><td>${fmt(x.deductions)}</td><td>${fmt(x.net)}</td>`:''}<td>${fmt(x.commission)}</td>${company?`<td><b>${fmt(Math.round((x.net+x.commission)*100)/100)}</b></td>`:''}</tr>`).join('') || `<tr><td colspan="11" class="empty">No employees from this contractor on the roll in ${monthLabel(cbMonth)}.</td></tr>`}</tbody>
    </table>`;
    return head+`<tr class="cbDetail"><td colspan="${cols}"><div class="tableScrollWrap">${emp}</div></td></tr>`;
  };
  const mainTable=`<div class="tableScrollWrap"><table class="cbTable">
    <thead><tr><th style="width:28px;"></th><th style="text-align:left;">Contractor</th><th>Employees Supplied</th><th>Total Present Days</th><th>Rate / Day</th>${company?'<th>Salary (Net Pay)</th>':''}<th>Service Charge</th>${company?'<th>Total Payable</th>':''}</tr></thead>
    <tbody>${rows.map(contractorRow).join('') || `<tr><td colspan="${cols}" class="empty">No contractors yet.</td></tr>`}
    ${rows.length?`<tr class="cbTotal"><td></td><td style="text-align:left;">Total — all contractors</td><td>${sum('empCount')}</td><td>${sum('days')}</td><td></td>${company?`<td>${fmt(sum('net'))}</td>`:''}<td>${fmt(sum('commission'))}</td>${company?`<td>${fmt(sum('total'))}</td>`:''}</tr>`:''}
    </tbody></table></div>`;
  const allOpen=rows.length && rows.every(r=>cbOpen[r.c.code]);
  // Who can change this month's rates, with the one Save for every contractor's box.
  const rateBar=`<div class="cbRateBox">
    <span>${ico('tag')} Service charge per present day — ${monthLabel(cbMonth)} (from the 1st):</span>
    ${editable
      ? `<span class="cbRateNote">Enter each contractor's rate in the table, then</span> <button class="btn tiny" onclick="cbSaveRates()">${ico('save')} Save Service Charges</button>`
      : `<span class="cbRateNote">Only an Admin can change the rates</span>`}
  </div>`;
  return `
  <div class="panel">
    <div class="cbTop">
      <div class="attTabsInline">${tab('commission','users','Contractor Service Charge')}${tab('company','wallet','Company Payable')}</div>
      <label class="cbLbl">${ico('calendar-days')} Month <input type="month" value="${cbMonth}" onchange="cbSet('month',this.value)"></label>
      <span style="margin-left:auto;display:flex;gap:8px;">
        ${rows.length?`<button class="btn secondary" onclick="cbToggleAll(${allOpen?0:1})">${ico('users')} ${allOpen?'Hide':'Show'} all employees</button>`:''}
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
    ${rateBar}
    ${mainTable}
    <p class="syncNote">${cbTab==='company'
      ? `Total Payable = the employees' <b>Net Pay</b> (the same figure as their salary slips) + the contractor's service charge. ${generated?'':`<b>Payroll for ${monthLabel(cbMonth)} is not generated yet</b> — salary shown is worked out from the current attendance and Time Entry.`}`
      : `Service Charge = full <b>Present</b> days of all the employees the contractor supplied × that contractor's rate. Half Days, holidays and absent days are not counted. Present days come from Employee Time Entry / Attendance.`}
      ${cbCanEditRate()?' Each contractor can have a different rate. Rates are set for the month from the 1st; the next month starts with the same rates until they are changed. An Admin can change the rates of any month at any time.':''}</p>
  </div>`;
}

function cbToggleAll(open){
  cbOpen={};
  if(open) getContractors().forEach(c=>{ cbOpen[c.code]=true; });
  render('contractorbill');
}
function cbExcelSheets(){
  const rows=cbContractorRows(cbMonth), company=cbTab==='company';
  const summary={ name:company?'Company Payable':'Contractor Service Charge',
    title:`${db.companyName||''} — ${company?'Company Payable to Contractors':'Contractor Service Charge'} — ${monthLabel(cbMonth)}`,
    subtitle:'Service charge per full present day, at each contractor\'s rate',
    columns:[{header:'Contractor', key:'name', width:28},{header:'Employees Supplied', key:'empCount', type:'number'},{header:'Total Present Days', key:'days', type:'number'},
      {header:'Rate / Day', key:'rate', type:'money', noTotal:true},
      ...(company?[{header:'Salary (Net Pay)', key:'net', type:'money'}]:[]),
      {header:'Service Charge', key:'commission', type:'money'},
      ...(company?[{header:'Total Payable', key:'total', type:'money'}]:[])],
    rows:rows.map(r=>({name:r.c.name||r.c.code, empCount:r.empCount, days:r.days, rate:r.rate, net:r.net, commission:r.commission, total:r.total})), totals:true };
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
  window.downloadExcel({ fileName:`${companyFilePrefix()}-${cbTab==='company'?'Company-Payable':'Contractor-Service-Charge'}-${monthLabel(cbMonth)}.xlsx`, sheets:cbExcelSheets() });
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
  openPrintWindow(`${cbTab==='company'?'Company Payable to Contractors':'Contractor Service Charge'} — ${monthLabel(cbMonth)}`, html, {orientation:'landscape'});
}
