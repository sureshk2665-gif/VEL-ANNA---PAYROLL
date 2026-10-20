/* ================= SALARY SLIP ================= */
function monthLabel(ym){
  const [y,m]=ym.split('-');
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[+m-1]+'-'+y;
}
// Pay slip heading: the employee's contractor name (no company name or logo). An employee with
// no contractor keeps the company name and logo.
function slipHeadingHtml(e, logoSize, h2Style){
  const c=contractorName(e);
  if(c) return `<h2${h2Style?` style="${h2Style}"`:''}>${c.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</h2>`;
  return `${companyLogoImgHtml(logoSize)}<h2${h2Style?` style="${h2Style}"`:''}>${db.companyName||'YOUR COMPANY PVT LTD'}</h2>`;
}
// Small notes under the slip table: days not marked in Attendance, and a wage change during the month.
function slipNotesHtml(r){
  const notes=[];
  if(r.unmarkedDays) notes.push(`${r.unmarkedDays} working day${r.unmarkedDays===1?'':'s'} not marked in Attendance (not paid)`);
  if(Array.isArray(r.wageSegments) && r.wageSegments.length>1)
    notes.push('Daily wage this month: '+r.wageSegments.map(g=>`₹${g.dailyWage} (${fmtDate(g.from).slice(0,5)}–${fmtDate(g.to).slice(0,5)})`).join(', '));
  return notes.join(' · ');
}
// Viewing a slip only reads: it is computed from current data (payrollRecordFor) and never saved.
function openSlip(code, ym){
  const e=db.employees.find(x=>x.code===code);
  const r=e && payrollRecordFor(code, ym);
  if(!r){ alert('No payroll record found.'); return; }
  const others=(+r.otherDed||0)+(+r.tax||0);
  const notes=slipNotesHtml(r);
  document.getElementById('modalContent').innerHTML=`
  <div class="slip" id="slipPrintArea">
    <div style="text-align:center;border-bottom:1px solid #1c2430;padding-bottom:8px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;">${slipHeadingHtml(e, 36, 'margin:0;font-size:24px;')}</div>
      <p style="margin:2px 0;font-size:17px;">${unitAddress(e.unit)}</p>
    </div>
    <p style="margin:4px 0;font-weight:600;font-size:19px;white-space:normal;overflow:visible;line-height:1.4;">EMP.CODE ${e.code} &nbsp;|&nbsp; ${e.name} &nbsp;|&nbsp; <span style="font-weight:400;">${e.designation||'-'}</span> &nbsp;|&nbsp; <span style="font-weight:400;font-size:14px;">${unitLabel(e.unit)}</span></p>
    <table style="font-size:17px;margin-bottom:8px;">
      <tr>
        <td>${monthLabel(ym)}-NOWD ${r.nowd}</td>
        <td>LOP ${r.lopDays}</td>
        <td>OT HOURS ${r.otHours}</td>
      </tr>
      <tr>
        <td>Paid days ${r.daysWorking}</td>
        <td>NOPH ${r.noph}</td>
        <td>LATE ${r.lateMinutes||0} MIN</td>
      </tr>
      <tr>
        <td>MODE ${e.mode||'-'}</td>
        <td>CANTEEN TOKENS ${r.canteenTokens||0}</td>
        <td>ESI NO : ${e.esiNo||'-'}</td>
      </tr>
    </table>
    <table style="border:1px solid #1c2430;text-align:center;">
      <colgroup><col style="width:24%"><col style="width:15%"><col style="width:15%"><col style="width:30%"><col style="width:16%"></colgroup>
      <tr style="background:#0f6b5c;color:#fff;"><th style="text-align:center;">DETAILS</th><th style="text-align:center;">PER DAY</th><th style="text-align:center;">EARNED</th><th style="text-align:center;">DEDUCTIONS</th><th style="text-align:center;">AMOUNT (₹)</th></tr>
      <tr><td style="text-align:left;">Basic</td><td>${fmt(r.basicPerDay??e.basic).replace('₹','')}</td><td>${fmt(r.basicE).replace('₹','')}</td><td style="text-align:left;">ESI</td><td>${fmt(r.esi).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">HRA</td><td>${fmt(r.hraPerDay??e.hra).replace('₹','')}</td><td>${fmt(r.hraE).replace('₹','')}</td><td style="text-align:left;">PF</td><td>${fmt(r.pf).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Over Time</td><td>${r.otPerHourRate?fmt(r.otPerHourRate).replace('₹','')+'/hr':''}</td><td>${fmt(r.otAmount).replace('₹','')}</td><td style="text-align:left;">Canteen (${r.canteenTokens||0} × ₹${r.canteenTokenPrice||0})</td><td>${fmt(r.canteen).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Other Allowance</td><td></td><td>${fmt(r.otherAllowance).replace('₹','')}</td><td style="text-align:left;">Advance</td><td>${fmt(r.advance).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;font-weight:700;">GROSS (Basic + OT)</td><td></td><td style="font-weight:700;">${fmt(r.grossSalary??(r.basicE+r.otAmount)).replace('₹','')}</td><td style="text-align:left;">Others</td><td>${fmt(others).replace('₹','')}</td></tr>
      <tr><td></td><td></td><td></td><td style="text-align:left;">Late (${r.lateChargedMinutes||0} min${r.lateChargedMinutes?' × ₹'+r.latePerMinute:''})</td><td>${fmt(r.lateDeduction||0).replace('₹','')}</td></tr>
      <tr style="font-weight:700;background:#f3f3f3;">
        <td style="text-align:left;">TOTAL EARNINGS</td>
        <td>${fmt(r.scaleTotal).replace('₹','')}</td>
        <td>${fmt(r.earningsTotal).replace('₹','')}</td>
        <td style="text-align:left;">TOTAL DEDUCTIONS</td>
        <td>${fmt(r.deductionsTotal).replace('₹','')}</td>
      </tr>
    </table>
    ${notes?`<p style="margin:6px 0 0;font-size:14px;color:#555;">${notes}</p>`:''}
    <div style="text-align:center;margin-top:10px;">
      <div style="display:inline-block;border:3px solid #0f6b5c;border-radius:8px;background:#e4f2ee;padding:10px 26px;font-weight:800;font-size:22px;color:#0f6b5c;letter-spacing:.3px;">NET PAY&nbsp;&nbsp;₹${fmt(r.netSalary).replace('₹','')}</div>
    </div>
    <p style="font-size:17px;margin-top:10px;">In Words: ${amountInWords(r.netSalary)}</p>
    <br>
    <p style="font-size:17px;text-align:right;padding-right:12%;">Signature of the Employee : ____________________</p>
  </div>
  <div class="modalActions no-print">
    <button class="btn secondary" onclick="closeModal()">Close</button>
    <button class="btn" onclick="window.print()">${ico('printer')} Print / Save as PDF</button>
  </div>`;
  showModal();
}

function slipCardHTML(e, r, ym){
  if(!e||!r) return '<div class="slipCard slipCard-empty"></div>';
  return `
  <div class="slipCard">
    <div class="slipHead">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;">${slipHeadingHtml(e, 22)}</div>
      <p>${unitAddress(e.unit)}</p>
      <p class="slipTitle">Salary Slip — ${monthLabel(ym)}</p>
    </div>
    <div class="slipEmpLine"><b>EMP.CODE ${e.code}</b> &nbsp;|&nbsp; <b>${e.name}</b> &nbsp;|&nbsp; ${e.designation||'-'} &nbsp;|&nbsp; ${unitLabel(e.unit)}</div>
    <table class="slipMeta">
      <tr><td>NOWD ${r.nowd}</td><td>LOP ${r.lopDays}</td><td>OT HRS ${r.otHours}</td></tr>
      <tr><td>Paid Days ${r.daysWorking}</td><td>NOPH ${r.noph}</td><td>LATE ${r.lateMinutes||0} MIN</td></tr>
      <tr><td>MODE ${e.mode||'-'}</td><td>CANTEEN TKN ${r.canteenTokens||0}</td><td>ESI NO : ${e.esiNo||'-'}</td></tr>
    </table>
    <table class="slipBody">
      <colgroup><col style="width:25%"><col style="width:11%"><col style="width:12%"><col style="width:32%"><col style="width:20%"></colgroup>
      <tr class="hd"><th>DETAILS</th><th>PER DAY</th><th>EARNED</th><th>DEDUCTIONS</th><th>AMT ₹</th></tr>
      <tr><td>Basic</td><td class="amt">${fmt(r.basicPerDay??e.basic).replace('₹','')}</td><td class="amt">${fmt(r.basicE).replace('₹','')}</td><td>ESI</td><td class="amt">${fmt(r.esi).replace('₹','')}</td></tr>
      <tr><td>HRA</td><td class="amt">${fmt(r.hraPerDay??e.hra).replace('₹','')}</td><td class="amt">${fmt(r.hraE).replace('₹','')}</td><td>PF</td><td class="amt">${fmt(r.pf).replace('₹','')}</td></tr>
      <tr><td>OT</td><td class="amt">${r.otPerHourRate?fmt(r.otPerHourRate).replace('₹','')+'/hr':''}</td><td class="amt">${fmt(r.otAmount).replace('₹','')}</td><td>Canteen (${r.canteenTokens||0} tkn)</td><td class="amt">${fmt(r.canteen).replace('₹','')}</td></tr>
      <tr><td>Other Allw.</td><td class="amt"></td><td class="amt">${fmt(r.otherAllowance).replace('₹','')}</td><td>Advance</td><td class="amt">${fmt(r.advance).replace('₹','')}</td></tr>
      <tr><td><b>GROSS</b></td><td class="amt"></td><td class="amt"><b>${fmt(r.grossSalary??(r.basicE+r.otAmount)).replace('₹','')}</b></td><td>Others</td><td class="amt">${fmt((+r.otherDed||0)+(+r.tax||0)).replace('₹','')}</td></tr>
      <tr><td></td><td class="amt"></td><td class="amt"></td><td>Late (${r.lateChargedMinutes||0} min)</td><td class="amt">${fmt(r.lateDeduction||0).replace('₹','')}</td></tr>
      <tr class="totalRow">
        <td>TOTAL</td>
        <td class="amt">${fmt(r.scaleTotal).replace('₹','')}</td>
        <td class="amt">${fmt(r.earningsTotal).replace('₹','')}</td>
        <td>TOTAL</td>
        <td class="amt">${fmt(r.deductionsTotal).replace('₹','')}</td>
      </tr>
    </table>
    ${slipNotesHtml(r)?`<div class="slipNote">${slipNotesHtml(r)}</div>`:''}
    <div class="netPayWrap"><span class="netCell">NET PAY&nbsp;&nbsp;₹${fmt(r.netSalary).replace('₹','')}</span></div>
    <div class="slipFoot">
      <span>In Words: ${amountInWords(r.netSalary)}</span>
      <span class="slipSign">Signature: ____________</span>
    </div>
  </div>`;
}
/* ---- Print Pay Slips dialog: month + Working Unit + Contractor + Employee, with a live list of
   whose slips will print. Opens with the Payroll screen's month and filters. ---- */
let psMonth='', psUnit='', psContractor='', psEmp='';
function openPaySlipDialog(){
  if(!hasPerm('payroll','print')){ alert('You do not have permission to print payslips.'); return; }
  psMonth=payMonth; psUnit=payUnitFilter; psContractor=payContractorFilter; psEmp='';
  renderPaySlipDialog(); showModal();
}
// Employees whose slip the dialog would print: everyone on the roll that month (the same list as the
// Payroll screen), narrowed by unit and contractor.
function paySlipCandidates(){
  const emps = payrollIsLegacyMonth(psMonth)
    ? Object.keys(db.payroll[psMonth]).map(c=>db.employees.find(e=>e.code===c)).filter(Boolean)
    : payrollEmployeesFor(psMonth);
  return emps.filter(e=>(!psUnit || unitCodeOf(e.unit)===psUnit) && contractorFilterMatches(e, psContractor))
    .sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
}
function setPaySlipField(field, val){
  if(field==='month'){ if(!val) return; psMonth=val; }
  else if(field==='unit') psUnit=val;
  else if(field==='contractor') psContractor=val;
  else if(field==='emp') psEmp=val;
  renderPaySlipDialog('ps_'+field);
}
function renderPaySlipDialog(focusId){
  const generated=!!db.payroll[psMonth];
  const list=paySlipCandidates();
  if(psEmp && !list.some(e=>e.code===psEmp)) psEmp='';
  const printing = psEmp ? list.filter(e=>e.code===psEmp) : list;
  const n=printing.length;
  const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const sel=[psUnit?unitLabel(psUnit):'All units', psContractor?(psContractor==='-'?'Non Contractor':contractorName(psContractor)):'All contractors'].join(' · ');
  const canGen=hasPerm('payroll','add')||hasPerm('payroll','edit');
  document.getElementById('modalContent').innerHTML=`
    <h3>${ico('printer')} Print Pay Slips</h3>
    <p class="psIntro">Pick the month, then narrow down by working unit, contractor or a single employee. Slips print 2 per A4 page.</p>
    <div class="formGrid psGrid">
      <div><label for="ps_month">Month</label><input type="month" id="ps_month" value="${psMonth}" onchange="setPaySlipField('month',this.value)"></div>
      <div><label for="ps_unit">Working Unit</label><select id="ps_unit" onchange="setPaySlipField('unit',this.value)"><option value="">All Units</option>${unitOptionsHtml(psUnit)}</select></div>
      <div><label for="ps_contractor">Contractor</label><select id="ps_contractor" onchange="setPaySlipField('contractor',this.value)">${contractorFilterOptionsHtml(psContractor)}</select></div>
      <div><label for="ps_emp">Employee</label><select id="ps_emp" onchange="setPaySlipField('emp',this.value)" ${list.length?'':'disabled'}>
        <option value="">All employees in this selection (${list.length})</option>
        ${list.map(e=>`<option value="${esc(e.code)}" ${psEmp===e.code?'selected':''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
      </select></div>
    </div>
    ${!generated ? `<div class="psNote warn">${ico('alert')} <div><b>Payroll for ${monthLabel(psMonth)} hasn't been generated yet.</b> Generate it first, then print.${canGen?'':' Ask someone with Payroll rights to generate it.'}</div>
        ${canGen?`<button type="button" class="btn" onclick="psGenerate()">${ico('settings')} Generate Payroll for ${monthLabel(psMonth)}</button>`:''}</div>`
      : `<div class="psNote">
        <div class="psSum"><b>${n} pay slip${n===1?'':'s'}</b> · ${monthLabel(psMonth)} · ${psEmp?esc(printing[0].name):esc(sel)}${n?` · ${Math.ceil(n/2)} page${Math.ceil(n/2)===1?'':'s'}`:''}</div>
        ${n?`<div class="psList">${printing.map(e=>`<span class="psChip" title="${esc(unitLabel(e.unit))}${contractorName(e)?' · '+esc(contractorName(e)):''}">${esc(e.code)} · ${esc(e.name)}</span>`).join('')}</div>`
          :`<div class="psEmpty">No employees match this selection.</div>`}
      </div>`}
    <div class="modalActions">
      <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn" ${generated&&n?'':'disabled'} onclick="psPrint()">${ico('printer')} Print ${n&&generated?n+' ':''}Pay Slip${n===1?'':'s'}</button>
    </div>`;
  if(focusId){ const el=document.getElementById(focusId); if(el) el.focus(); }
}
function psGenerate(){
  if(!generatePayrollFor(psMonth)) return;
  payMonth=psMonth; render('payroll'); // show the month just generated behind the dialog
  renderPaySlipDialog();
}
function psPrint(){
  printAllSlips(psUnit, psContractor, psMonth, psEmp);
}
// Prints a month's slips (default: the Payroll screen's month), optionally for one unit, one
// contractor ('-' = no contractor) and/or one employee.
function printAllSlips(unit, contractor, ym, empCode){
  if(!hasPerm('payroll','print')){ alert('You do not have permission to print payslips.'); return; }
  ym = ym || payMonth;
  const payMonth = ym; // the rest of this function prints the chosen month
  // Slips are computed from current data (payrollMonthRecords) — the same figures as the Payroll
  // screen — and printing never saves anything.
  const all = payrollMonthRecords(payMonth);
  if(!all){ alert('Generate payroll first.'); return; }
  // Filter by Working Unit (falls back to Unit-1 for records with no unit set, matching
  // unitLabel()'s own fallback elsewhere in the app), contractor and employee.
  let records = all.filter(r=>{
    const e=db.employees.find(x=>x.code===r.code);
    return (!unit || unitCodeOf(e && e.unit) === unit) && contractorFilterMatches(e, contractor) && (!empCode || r.code===empCode);
  }).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const one = empCode && db.employees.find(x=>x.code===empCode);
  const sel = [unit?unitLabel(unit):'', contractor?(contractor==='-'?'Non Contractor':contractorName(contractor)):'', one?`${one.code} ${one.name}`:''].filter(Boolean).join(' · ');
  const unitTitle = sel ? ` — ${sel}` : '';
  if(!records.length){ alert(sel ? `No payroll records to print for ${sel}.` : 'No payroll records to print.'); return; }
  const perPage = 2;
  const pages=[];
  for(let i=0;i<records.length;i+=perPage){
    const chunk=records.slice(i,i+perPage);
    const cards=chunk.map(r=>slipCardHTML(db.employees.find(x=>x.code===r.code), r, payMonth)).join('');
    const pad = perPage-chunk.length;
    const padding = pad>0 ? '<div class="slipCard slipCard-empty"></div>'.repeat(pad) : '';
    pages.push(`<div class="sheet">${cards}${padding}</div>`);
  }
  const w = window.open('', '_blank');
  if(!w){ alert('Please allow pop-ups to print salary slips.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Salary Slips - ${monthLabel(payMonth)}${unitTitle}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    html,body{margin:0;padding:0;}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;font-weight:700;}
    body *{font-weight:700;}
    @page{size:A4;margin:10mm 8mm 12mm;}

    /* Each .sheet is exactly one printed A4 page, split into 3 fixed equal rows
       so cards can never overlap or drift regardless of content length. */
    .sheet{
      width:100%;height:275mm;max-height:275mm;
      display:grid;grid-template-rows:repeat(2,1fr);gap:5mm;
      page-break-after:always;break-after:page;overflow:hidden;
    }
    .sheet:last-child{page-break-after:auto;break-after:auto;}

    .slipCard{
      border:1px solid #0f6b5c;border-radius:6px;overflow:hidden;
      display:flex;flex-direction:column;justify-content:flex-start;
      position:relative;background:#fff;min-height:0;
      page-break-inside:avoid;break-inside:avoid;
    }
    .slipCard-empty{border:1px dashed #ccc;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 10px,#fff 10px,#fff 20px);}

    .slipHead{text-align:center;padding:5px 10px 4px;background:#e4f2ee;border-bottom:1px solid #0f6b5c;flex-shrink:0;}
    .slipHead h2{margin:0;font-size:18px;color:#0f6b5c;letter-spacing:.2px;text-align:center;}
    .slipHead p{margin:1px 0;font-size:13px;color:#555;text-align:center;}
    .slipHead .slipTitle{font-weight:700;color:#1c2430;font-size:13.5px;margin-top:2px;text-align:center;}

    .slipEmpLine{font-size:14px;padding:4px 10px;background:#f6f5f1;border-bottom:1px solid #e2e0d8;flex-shrink:0;overflow:visible;white-space:normal;word-wrap:break-word;line-height:1.4;text-align:center;}

    table.slipMeta{width:100%;font-size:12.5px;border-collapse:collapse;margin:4px 0;table-layout:fixed;flex-shrink:0;padding:0 10px;text-align:center;}
    table.slipMeta td{padding:2px 10px 2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;}

    table.slipBody{width:calc(100% - 20px);margin:0 10px;border-collapse:collapse;border:1px solid #1c2430;font-size:12.5px;table-layout:fixed;flex-shrink:0;text-align:center;}
    table.slipBody th,table.slipBody td{border:1px solid #d8d6cd;padding:3px 6px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    table.slipBody td.amt{text-align:center;font-variant-numeric:tabular-nums;}
    table.slipBody tr.hd th{background:#0f6b5c;color:#fff;text-align:center;font-size:12px;font-weight:600;border-color:#0f6b5c;}
    table.slipBody tbody tr:nth-child(odd){background:#f6faf9;}
    table.slipBody tbody tr:nth-child(even){background:#fff;}
    table.slipBody tr.totalRow{font-weight:700;background:#e4f2ee !important;}
    table.slipBody tr.totalRow td{border-top:1.5px solid #0f6b5c;color:#0f6b5c;}
    table.slipBody tr.totalRow td.amt{text-align:center;}
    table.slipBody .leaveCell{vertical-align:top;font-size:12px;background:#fff !important;}

    .slipNote{font-size:11px;color:#555;margin:3px 10px 0;flex-shrink:0;}
    .netPayWrap{width:calc(100% - 20px);margin:6px 10px 4px;text-align:center;flex-shrink:0;}
    .netPayWrap .netCell{display:inline-block;font-weight:800;background:#e4f2ee;color:#0f6b5c;border:2.5px solid #0f6b5c;border-radius:6px;padding:5px 22px;font-size:15.5px;letter-spacing:.2px;}

    .slipFoot{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;font-size:12.5px;margin:4px 10px 5px;flex-shrink:0;}
    .slipFoot span:first-child{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;}
    .slipSign{white-space:nowrap;color:#0f6b5c;font-weight:600;margin-right:16px;}

    .printBar{padding:12px;text-align:center;background:#f6f5f1;}
    @media print{ .printBar{display:none;} }
  </style></head>
  <body>
  <div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
  <span style="font-size:12px;color:#666;margin-left:10px;">${records.length} slip(s), ${pages.length} page(s), 2 per sheet</span></div>
  ${pages.join('')}
  </body></html>`);
  w.document.close();
}

