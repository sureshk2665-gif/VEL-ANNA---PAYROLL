/* ================= CONTRACTORS BILL =================
   What MF pays each contractor for a month (click a contractor to see its employees):
     Service charge = every FULL Present day of the employees it supplied × that contractor's rate
                      (Half Days, holidays (NOPH) and absent days don't count);
     Total payable  = the Net Pay of those employees (Salary) + the service charge.
   Each contractor has its own rate (₹30 per present day to start), set per month from the 1st:
   db.contractorRates[ym] = {contractorCode: rate}. A month without a contractor's rate uses that
   contractor's latest earlier rate, so a new month starts from last month's rates. Only Admin /
   Software Admin can change rates, for any month, at any time. (Older data stored one number per
   month for every contractor; that still reads as that month's rate for all of them.) Salary and
   present days are the live payroll figures (computePayrollForEmployee), so they always match the
   Payroll screen and the salary slips. */
let cbMonth=monthKey(todayStr());
let cbOpen={};                        // contractor code -> true when its employee list is expanded
let cbEditing=false;                  // rate boxes open (Edit) — closed again by Save or Cancel
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
  cbEditing=false;
  render('contractorbill');
}
function cbShiftMonth(d){ if(cbEditing) return; cbMonth=nextMonthKey(cbMonth, d); render('contractorbill'); }
// Rates are changed only after Edit; Save stores them, Cancel shows the stored rates again.
function cbEditRates(){ if(!cbCanEditRate()){ alert('Only an Admin can change the service charge.'); return; } cbEditing=true; render('contractorbill'); setTimeout(()=>{ const i=document.querySelector('.cbRateIn input'); if(i){ i.focus(); i.select(); } },0); }
function cbCancelRates(){ const b=document.getElementById('cbSaveBar'); if(b && b.classList.contains('dirty') && !confirm('Discard the rates you changed?')) return; cbEditing=false; render('contractorbill'); }
// A changed rate box lights up the Save button until the rates are saved.
function cbRateTyped(){ const b=document.getElementById('cbSaveBar'); if(b) b.classList.add('dirty'); }
function cbSet(field, val){
  if(field==='month'){ if(!val) return; cbMonth=val; }
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
      return {e, days, noph:+(r.noph??r.holidayDays)||0, commission:Math.round(days*rate*100)/100, earnings:+r.earningsTotal||0, deductions:+r.deductionsTotal||0, net:+r.netSalary||0, paidDays:+r.daysWorking||0};
    });
    const days=emps.reduce((s,x)=>s+x.days,0);
    const noph=emps.reduce((s,x)=>s+x.noph,0);
    const net=Math.round(emps.reduce((s,x)=>s+x.net,0)*100)/100;
    const commission=Math.round(days*rate*100)/100;
    return {c, emps, empCount:emps.length, days, noph, rate, commission, net, total:Math.round((net+commission)*100)/100};
  });
}

/* The page, kept to the essentials: one bill per contractor for the month —
   Present days × rate = Service charge; + Salary (the Net Pay of the employees it supplied) =
   Total payable. Click a contractor for its employees. Rates: Edit rates (Admin). */
function renderContractorBill(){
  const rows=cbContractorRows(cbMonth);
  const generated=payrollGenerated(cbMonth);
  const allowed=cbCanEditRate(), editable=allowed && cbEditing;
  const sum=k=>Math.round(rows.reduce((s,r)=>s+(+r[k]||0),0)*100)/100;
  const rateCell=r=>editable
    ? `<span class="cbRateIn">₹<input id="cb_rate_${r.c.code}" type="number" min="0" step="0.5" value="${r.rate}" oninput="cbRateTyped()" onkeydown="if(event.key==='Enter')cbSaveRates()" aria-label="Service charge per present day for ${cbEsc(r.c.name||r.c.code)}" title="Service charge per full Present day for ${cbEsc(r.c.name||r.c.code)}, ${monthLabel(cbMonth)}"></span>`
    : `₹${r.rate}`;
  const contractorRow=r=>{
    const open=!!cbOpen[r.c.code];
    const head=`<tr class="cbRow${open?' open':''}" onclick="cbSet('toggle','${r.c.code}')" title="Show / hide the employees" aria-expanded="${open}">
      <td class="cbCaret"><span>›</span></td><td><b>${cbEsc(r.c.name||r.c.code)}</b></td><td class="num">${r.empCount}</td><td class="num">${r.days}</td>
      <td onclick="event.stopPropagation()" class="num cbRateCell">${rateCell(r)}</td><td class="num">${fmt(r.commission)}</td><td class="num">${fmt(r.net)}</td><td class="num"><b>${fmt(r.total)}</b></td></tr>`;
    if(!open) return head;
    const emp=`<table class="cbTable cbInner">
      <thead><tr><th class="num">Sl</th><th>Code</th><th>Name</th><th class="num">Present days</th><th class="num">Service charge</th><th class="num">Salary (net pay)</th><th class="num">Total payable</th></tr></thead>
      <tbody>${r.emps.map((x,i)=>`<tr><td class="num">${i+1}</td><td>${cbEsc(x.e.code)}</td><td>${cbEsc(x.e.name)}</td><td class="num">${x.days}</td><td class="num">${fmt(x.commission)}</td><td class="num">${fmt(x.net)}</td><td class="num"><b>${fmt(Math.round((x.net+x.commission)*100)/100)}</b></td></tr>`).join('') || `<tr><td colspan="7" class="empty">No employees from this contractor on the roll in ${monthLabel(cbMonth)}.</td></tr>`}</tbody>
    </table>`;
    return head+`<tr class="cbDetail"><td colspan="8">${emp}</td></tr>`;
  };
  return `
  <div class="panel cbPanel cbSimple">
    <div class="cbBar">
      <div class="cbBarGrp">
        <button class="btn secondary cbNav" ${editable?'disabled':''} onclick="cbShiftMonth(-1)" title="Previous month" aria-label="Previous month">‹</button>
        <input type="month" value="${cbMonth}" ${editable?'disabled title="Save or cancel the rates first"':''} onchange="cbSet('month',this.value)" aria-label="Month">
        <button class="btn secondary cbNav" ${editable?'disabled':''} onclick="cbShiftMonth(1)" title="Next month" aria-label="Next month">›</button>
      </div>
      <div class="cbBarGrp" id="cbSaveBar">
        ${editable
          ? `<span class="cbEditNote">${ico('pencil')} Type each contractor's rate per present day for ${monthLabel(cbMonth)}</span><button class="btn secondary" onclick="cbCancelRates()">${ico('x')} Cancel</button><button class="btn" onclick="cbSaveRates()">${ico('save')} Save rates</button>`
          : `<button class="btn secondary" onclick="printContractorBill()">${ico('printer')} Print</button>
             ${hasPerm('contractorbill','export')?`<button class="btn secondary" onclick="downloadContractorBillExcel()">${ico('file-spreadsheet')} Excel</button>`:''}
             ${allowed?`<button class="btn secondary" onclick="cbEditRates()">${ico('pencil')} Edit rates</button>`:''}`}
      </div>
    </div>
    <div class="teStatRow cbStrip">
      <div class="teStatBox"><b>${sum('empCount')}</b><span>Employees supplied</span></div>
      <div class="teStatBox"><b>${fmt(sum('commission'))}</b><span>Service charge</span></div>
      <div class="teStatBox"><b>${fmt(sum('net'))}</b><span>Salary (net pay)</span></div>
      <div class="teStatBox cbKey"><b>${fmt(sum('total'))}</b><span>Total payable</span></div>
    </div>
    ${!generated?`<div class="payWarn">${ico('alert')} Payroll for ${monthLabel(cbMonth)} is not generated yet — the salary is worked out from the attendance entered so far.</div>`:''}
    <div class="tableScrollWrap cbScroll"><table class="cbTable cbMain">
      <thead><tr><th style="width:28px;"></th><th>Contractor</th><th class="num">Employees</th><th class="num" title="Full Present days of the employees supplied (Half Days and holidays not counted)">Present days</th><th class="num">Rate / day</th><th class="num" title="Present days × rate">Service charge</th><th class="num" title="Net Pay of the employees supplied — the same as their salary slips">Salary (net pay)</th><th class="num">Total payable</th></tr></thead>
      <tbody>${rows.map(contractorRow).join('') || `<tr><td colspan="8" class="empty">No contractors yet — add them in Software Admin.</td></tr>`}
      ${rows.length?`<tr class="cbTotal"><td></td><td>Total — all contractors</td><td class="num">${sum('empCount')}</td><td class="num">${sum('days')}</td><td></td><td class="num">${fmt(sum('commission'))}</td><td class="num">${fmt(sum('net'))}</td><td class="num">${fmt(sum('total'))}</td></tr>`:''}
      </tbody></table></div>
    <p class="syncNote">Total payable = Salary (net pay of the employees supplied) + Service charge. Service charge = full Present days × the contractor's rate — Half Days, holidays and absent days are not counted. Click a contractor to see its employees.${allowed?' Rates are set per month from the 1st; the next month starts with the same rates.':''}</p>
  </div>`;
}

function cbExcelSheets(){
  const rows=cbContractorRows(cbMonth), company=true; // the whole bill: salary + service charge
  const summary={ name:'Contractors Bill',
    title:`${db.companyName||''} — Contractors Bill — ${monthLabel(cbMonth)}`,
    subtitle:'Service charge per full present day, at each contractor\'s rate',
    columns:[{header:'Contractor', key:'name', width:28},{header:'Employees Supplied', key:'empCount', type:'number'},{header:'Total Present Days', key:'days', type:'number'},
      ...(company?[{header:'Total NOPH Days', key:'noph', type:'number'}]:[]),
      {header:'Rate / Day', key:'rate', type:'money', noTotal:true},
      ...(company?[{header:'Salary (Net Pay)', key:'net', type:'money'}]:[]),
      {header:'Service Charge', key:'commission', type:'money'},
      ...(company?[{header:'Total Payable', key:'total', type:'money'}]:[])],
    rows:rows.map(r=>({name:r.c.name||r.c.code, empCount:r.empCount, days:r.days, noph:r.noph, rate:r.rate, net:r.net, commission:r.commission, total:r.total})), totals:true };
  const detail={ name:'Employees', title:`${monthLabel(cbMonth)} — employees by contractor`,
    columns:[{header:'Contractor', key:'contractor', width:24},{header:'Emp Code', key:'code'},{header:'Name', key:'name', width:24},{header:'Unit', key:'unit'},
      {header:'Present Days', key:'days', type:'number'},
      ...(company?[{header:'NOPH', key:'noph', type:'number'},{header:'Paid Days', key:'paidDays', type:'number'},{header:'Total Earnings', key:'earnings', type:'money'},{header:'Deductions', key:'deductions', type:'money'},{header:'Net Pay', key:'net', type:'money'}]:[]),
      {header:'Service Charge', key:'commission', type:'money'},
      ...(company?[{header:'Total Payable', key:'total', type:'money'}]:[])],
    rows:rows.flatMap(r=>r.emps.map(x=>({contractor:r.c.name||r.c.code, code:x.e.code, name:x.e.name, unit:unitLabel(x.e.unit), days:x.days, noph:x.noph, paidDays:x.paidDays, earnings:x.earnings, deductions:x.deductions, net:x.net, commission:x.commission, total:Math.round((x.net+x.commission)*100)/100}))),
    totals:true };
  return [summary, detail];
}
function downloadContractorBillExcel(){
  if(!hasPerm('contractorbill','export')){ alert('You do not have permission to export.'); return; }
  window.downloadExcel({ fileName:`${companyFilePrefix()}-Contractors-Bill-${monthLabel(cbMonth)}.xlsx`, sheets:cbExcelSheets() });
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
  const html=`<p style="margin:0 0 8px;">${sheets[0].subtitle}. Total Payable = Net Pay of the employees supplied + service charge (full present days × rate; half days and holidays not counted).</p>
    ${table(sheets[0])}<h3 style="margin:14px 0 6px;font-size:13px;">Employees</h3>${table(sheets[1])}`;
  openPrintWindow(`Contractors Bill — ${monthLabel(cbMonth)}`, html, {orientation:'landscape'});
}
