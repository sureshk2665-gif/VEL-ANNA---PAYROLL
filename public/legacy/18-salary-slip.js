/* ================= SALARY SLIP ================= */
function monthLabel(ym){
  const [y,m]=ym.split('-');
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[+m-1]+'-'+y;
}
function openSlip(code, ym){
  const e=db.employees.find(x=>x.code===code);
  if(!e){ alert('No payroll record found.'); return; }
  if(!db.payroll[ym]?.[code]){ alert('No payroll record found.'); return; }
  // Always recompute live from current Attendance data so the slip can never
  // go stale relative to edits made after "Generate / Regenerate Payroll" was last clicked.
  const r=computePayrollForEmployee(e, ym);
  db.payroll[ym][code]=r; saveDB(db);
  document.getElementById('modalContent').innerHTML=`
  <div class="slip" id="slipPrintArea">
    <div style="text-align:center;border-bottom:1px solid #1c2430;padding-bottom:8px;margin-bottom:10px;">
      <h2 style="margin:0;font-size:24px;">${db.companyName||'YOUR COMPANY PVT LTD'}</h2>
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
        <td>No of days working ${r.presentPlusHalf}</td>
        <td>NOPH ${r.noph}</td>
        <td>NOPL Taken (this month) ${r.leaveDays}</td>
      </tr>
      <tr>
        <td>MODE ${e.mode||'-'}</td>
        <td>NOPL Bal ${r.noplBalance}</td>
        <td>ESI NO : ${e.esiNo||'-'}</td>
      </tr>
    </table>
    <table style="border:1px solid #1c2430;text-align:center;">
      <colgroup><col style="width:29%"><col style="width:12%"><col style="width:13%"><col style="width:29%"><col style="width:13%"></colgroup>
      <tr style="background:#0f6b5c;color:#fff;"><th style="text-align:center;">DETAILS</th><th style="text-align:center;">SCALE</th><th style="text-align:center;">EARNED</th><th style="text-align:center;">DEDUCTIONS</th><th style="text-align:center;">AMOUNT (₹)</th></tr>
      <tr><td style="text-align:left;">Basic</td><td>${fmt(e.basic).replace('₹','')}</td><td>${fmt(r.basicE).replace('₹','')}</td><td style="text-align:left;">ESI</td><td>${fmt(r.esi).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">HRA</td><td>${fmt(e.hra).replace('₹','')}</td><td>${fmt(r.hraE).replace('₹','')}</td><td style="text-align:left;">Tax</td><td>${fmt(r.tax).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Conveyance</td><td>${fmt(e.conveyance).replace('₹','')}</td><td>${fmt(r.conveyanceE).replace('₹','')}</td><td style="text-align:left;">Rent</td><td>${fmt(r.rent).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Washing Allowance</td><td>${fmt(e.washing).replace('₹','')}</td><td>${fmt(r.washingE).replace('₹','')}</td><td style="text-align:left;">Canteen — Lunch</td><td>${fmt(r.canteenLunchAmt).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Over Time</td><td>${fmt(e.da).replace('₹','')}</td><td>${fmt(r.otAmount).replace('₹','')}</td><td style="text-align:left;">Canteen — Dinner</td><td>${fmt(r.canteenDinnerAmt).replace('₹','')}</td></tr>
      <tr><td style="text-align:left;">Other Allowance</td><td>${fmt(e.medical).replace('₹','')}</td><td>${fmt(r.otherAllowance).replace('₹','')}</td><td style="text-align:left;">Advance</td><td>${fmt(r.advance).replace('₹','')}</td></tr>
      <tr><td></td><td></td><td></td><td style="text-align:left;">Others</td><td>${fmt(r.otherDed).replace('₹','')}</td></tr>
      <tr style="font-weight:700;background:#f3f3f3;">
        <td style="text-align:left;">TOTAL EARNINGS</td>
        <td>${fmt(r.scaleTotal).replace('₹','')}</td>
        <td>${fmt(r.earningsTotal).replace('₹','')}</td>
        <td style="text-align:left;">TOTAL DEDUCTIONS</td>
        <td>${fmt(r.deductionsTotal).replace('₹','')}</td>
      </tr>
    </table>
    <div style="text-align:center;margin-top:10px;">
      <div style="display:inline-block;border:3px solid #0f6b5c;border-radius:8px;background:#e4f2ee;padding:10px 26px;font-weight:800;font-size:22px;color:#0f6b5c;letter-spacing:.3px;">NET PAY&nbsp;&nbsp;₹${fmt(r.netSalary).replace('₹','')}</div>
    </div>
    <p style="font-size:17px;margin-top:10px;">In Words: ${amountInWords(r.netSalary)}</p>
    <br>
    <p style="font-size:17px;text-align:right;padding-right:12%;">Signature of the Employee : ____________________</p>
  </div>
  <div class="modalActions no-print">
    <button class="btn secondary" onclick="closeModal()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>`;
  showModal();
}

function slipCardHTML(e, r, ym){
  if(!e||!r) return '<div class="slipCard slipCard-empty"></div>';
  return `
  <div class="slipCard">
    <div class="slipHead">
      <h2>${db.companyName||'YOUR COMPANY PVT LTD'}</h2>
      <p>${unitAddress(e.unit)}</p>
      <p class="slipTitle">Salary Slip — ${monthLabel(ym)}</p>
    </div>
    <div class="slipEmpLine"><b>EMP.CODE ${e.code}</b> &nbsp;|&nbsp; <b>${e.name}</b> &nbsp;|&nbsp; ${e.designation||'-'} &nbsp;|&nbsp; ${unitLabel(e.unit)}</div>
    <table class="slipMeta">
      <tr><td>NOWD ${r.nowd}</td><td>LOP ${r.lopDays}</td><td>OT HRS ${r.otHours}</td></tr>
      <tr><td>Days Worked ${r.presentPlusHalf}</td><td>NOPH ${r.noph}</td><td>NOPL Taken ${r.leaveDays}</td></tr>
      <tr><td>MODE ${e.mode||'-'}</td><td>NOPL Bal ${r.noplBalance}</td><td>ESI NO : ${e.esiNo||'-'}</td></tr>
    </table>
    <table class="slipBody">
      <colgroup><col style="width:25%"><col style="width:11%"><col style="width:12%"><col style="width:32%"><col style="width:20%"></colgroup>
      <tr class="hd"><th>DETAILS</th><th>SCALE</th><th>EARNED</th><th>DEDUCTIONS</th><th>AMT ₹</th></tr>
      <tr><td>Basic</td><td class="amt">${fmt(e.basic).replace('₹','')}</td><td class="amt">${fmt(r.basicE).replace('₹','')}</td><td>ESI (excl.Washing)</td><td class="amt">${fmt(r.esi).replace('₹','')}</td></tr>
      <tr><td>HRA</td><td class="amt">${fmt(e.hra).replace('₹','')}</td><td class="amt">${fmt(r.hraE).replace('₹','')}</td><td>Tax</td><td class="amt">${fmt(r.tax).replace('₹','')}</td></tr>
      <tr><td>Conveyance</td><td class="amt">${fmt(e.conveyance).replace('₹','')}</td><td class="amt">${fmt(r.conveyanceE).replace('₹','')}</td><td>Rent</td><td class="amt">${fmt(r.rent).replace('₹','')}</td></tr>
      <tr><td>Washing Allw.</td><td class="amt">${fmt(e.washing).replace('₹','')}</td><td class="amt">${fmt(r.washingE).replace('₹','')}</td><td>Canteen-Lunch</td><td class="amt">${fmt(r.canteenLunchAmt).replace('₹','')}</td></tr>
      <tr><td>OT</td><td class="amt">${fmt(e.da).replace('₹','')}</td><td class="amt">${fmt(r.otAmount).replace('₹','')}</td><td>Canteen-Dinner</td><td class="amt">${fmt(r.canteenDinnerAmt).replace('₹','')}</td></tr>
      <tr><td>Other Allw.</td><td class="amt">${fmt(e.medical).replace('₹','')}</td><td class="amt">${fmt(r.otherAllowance).replace('₹','')}</td><td>Advance</td><td class="amt">${fmt(r.advance).replace('₹','')}</td></tr>
      <tr><td></td><td class="amt"></td><td class="amt"></td><td>Others</td><td class="amt">${fmt(r.otherDed).replace('₹','')}</td></tr>
      <tr class="totalRow">
        <td>TOTAL</td>
        <td class="amt">${fmt(r.scaleTotal).replace('₹','')}</td>
        <td class="amt">${fmt(r.earningsTotal).replace('₹','')}</td>
        <td>TOTAL</td>
        <td class="amt">${fmt(r.deductionsTotal).replace('₹','')}</td>
      </tr>
    </table>
    <div class="netPayWrap"><span class="netCell">NET PAY&nbsp;&nbsp;₹${fmt(r.netSalary).replace('₹','')}</span></div>
    <div class="slipFoot">
      <span>In Words: ${amountInWords(r.netSalary)}</span>
      <span class="slipSign">Signature: ____________</span>
    </div>
  </div>`;
}
function printAllSlips(unit){
  if(!hasPerm('payroll','print')){ alert('You do not have permission to print payslips.'); return; }
  const existing = db.payroll[payMonth];
  if(!existing){ alert('Generate payroll first.'); return; }
  // Recompute every record live from current Attendance data before printing,
  // so slips can never go stale relative to edits made after the last Generate/Regenerate.
  Object.keys(existing).forEach(code=>{
    const e=db.employees.find(x=>x.code===code);
    if(e) existing[code]=computePayrollForEmployee(e, payMonth);
  });
  saveDB(db);
  // Employee Pay Slip Unit 1 / Unit 2: filter the payroll records down to just the employees
  // who belong to the selected Working Unit (falls back to Unit-1 for records with no unit set,
  // matching unitLabel()'s own fallback elsewhere in the app).
  let records = Object.values(existing);
  if(unit) records = records.filter(r=>{
    const e=db.employees.find(x=>x.code===r.code);
    return (e && e.unit || 'Unit-1') === unit;
  });
  const unitTitle = unit ? ` — ${unitLabel(unit)}` : '';
  if(!records.length){ alert(unit ? `No payroll records to print for ${unitLabel(unit)}.` : 'No payroll records to print.'); return; }
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

