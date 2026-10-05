function tableFromRows(rows){
  if(!rows.length) return '<div class="empty">No data.</div>';
  const cols=Object.keys(rows[0]);
  return `<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof r[c]==='number'&&/Salary/.test(c)?fmt(r[c]):r[c]}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
}
/* Generic printable window used by the simple (non-payroll) reports, and shared
   header/footer styling so every report's PDF looks consistent. */
function openPrintWindow(title, bodyHtml, opts){
  opts = opts || {};
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to download/print the report.'); return; }
  const orientation = opts.orientation || 'portrait';
  const footNoteExtraCss = opts.signatureGap ? 'margin-top:70px;padding-top:40px;' : '';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{margin:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;padding:6px;line-height:1.3;}
    @page{size:A4 ${orientation};margin:14mm 10mm 16mm;}
    .companyHead{position:relative;text-align:center;background:#e4f2ee;border-bottom:2px solid #0f6b5c;padding:6px 8px;margin:-6px -6px 8px;page-break-after:avoid;break-after:avoid;}
    .companyHead h1{margin:0;font-size:20px;letter-spacing:.3px;color:#0f6b5c;}
    .companyHead p{margin:1px 0;font-size:12px;color:#444;}
    .companyHead .regLine{font-size:11px;color:#555;margin-top:2px;}
    .reportTitle{text-align:center;font-size:15px;font-weight:700;margin:4px 0 6px;text-transform:uppercase;letter-spacing:.5px;page-break-after:avoid;break-after:avoid;}
    table.repTable{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:4px;}
    table.repTable th,table.repTable td{border:1px solid #d8d6cd;padding:3px 6px;text-align:center;}
    table.repTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    table.repTable th{background:#0f6b5c;color:#fff;font-size:10.5px;font-weight:600;border-color:#0f6b5c;}
    table.repTable tbody tr:nth-child(odd){background:#f6faf9;}
    table.repTable tr.subtotal{background:#e4f2ee !important;font-weight:700;color:#0f6b5c;border-top:1.5px solid #0f6b5c;}
    .footNote{margin-top:20px;padding-top:10px;border-top:1px solid #d8d6cd;display:flex;justify-content:space-between;font-size:11px;color:#444;page-break-inside:avoid;break-inside:avoid;${footNoteExtraCss}}
    .printBar{text-align:center;margin-bottom:14px;}
    @media print{ .printBar{display:none;} }
    table.pageWrap{width:100%;border-collapse:collapse;}
    table.pageWrap>thead>tr>td, table.pageWrap>tbody>tr>td{padding:0;border:none;}
  </style></head>
  <body>
  <div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">⬇️ Download PDF / Print</button></div>
  <table class="pageWrap"><thead><tr><td>
  <div class="companyHead">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      ${companyLogoImgHtml(32)}<h1 style="margin:0;">${db.companyName||'YOUR COMPANY PVT LTD'}</h1>
    </div>
    <p>${db.companyAddress||'Company Address, City, State'}</p>
    <p class="regLine">
      ${db.companyGSTIN?('GSTIN: '+db.companyGSTIN+' &nbsp;|&nbsp; '):''}${db.companyPAN?('PAN: '+db.companyPAN+' &nbsp;|&nbsp; '):''}${db.companyCIN?('CIN: '+db.companyCIN+' &nbsp;|&nbsp; '):''}${db.companyPhone?('Ph: '+db.companyPhone+' &nbsp;|&nbsp; '):''}${db.companyEmail?('Email: '+db.companyEmail):''}
    </p>
  </div>
  <div class="reportTitle">${title}</div>
  </td></tr></thead>
  <tbody><tr><td>
  ${bodyHtml}
  <div class="footNote">
    <span>Prepared by: ____________________</span>
    <span>Authorized Signatory: ____________________</span>
  </div>
  </td></tr></tbody></table>
  </body></html>`);
  w.document.close();
}
function printSimpleReport(title, rows){
  if(!rows.length){ alert('No data to print.'); return; }
  const cols=Object.keys(rows[0]);
  const tableHtml=`<table class="repTable"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof r[c]==='number'&&/Salary/.test(c)?fmt(r[c]):r[c]}</td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
  openPrintWindow(title, tableHtml);
}
function printGeneralPayrollReport(){
  const rows=payrollReportRows();
  if(!rows.length){ alert('No payroll records for this month.'); return; }
  const sumOf=(key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
  const cols=Object.keys(rows[0]);
  const totalCols=['Earnings','Deductions','ESI','Canteen','NetSalary'];
  const totalsRow=cols.map((c,i)=> i===0 ? 'TOTAL' : (totalCols.includes(c) ? fmt(sumOf(c)) : ''));
  const tableHtml=`<table class="repTable"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof r[c]==='number'&&/Salary/.test(c)?fmt(r[c]):r[c]}</td>`).join('')}</tr>`).join('')}
    <tr class="subtotal">${totalsRow.map(v=>`<td>${v}</td>`).join('')}</tr>
  </tbody></table>`;
  openPrintWindow(`Payroll Report — ${monthLabel(payMonth)}`, tableHtml);
}

function unitSectionRowsHTML(rows, startSn){
  let sn=startSn;
  return rows.map(r=>`<tr>
      <td>${sn++}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.PaymentMode||'-'}</td>
      <td>${fmt(r.Earnings)}</td><td>${fmt(r.Deductions)}</td><td>${r.LOP}</td><td>${r.DaysWorked}</td>
      <td class="netCell">${fmt(r.NetSalary)}</td>
    </tr>`).join('');
}
function printPayrollReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print reports.'); return; }
  const rec=db.payroll[payMonth];
  if(!rec){ alert('Generate payroll first.'); return; }
  const allRows=payrollReportRows();
  if(!allRows.length){ alert('No payroll records for this month.'); return; }
  const unit1Rows=allRows.filter(r=>r.WorkingUnit===unitLabel('Unit-1'));
  const unit2Rows=allRows.filter(r=>r.WorkingUnit===unitLabel('Unit-2'));
  const sumOf=(rows,key)=>rows.reduce((s,r)=>s+(r[key]||0),0);
  const MODES=['NEFT','TRANSFER','CASH','CHEQUE'];
  const modeSummaryHTML=(rows)=>{
    const present=MODES.filter(m=>rows.some(r=>(r.PaymentMode||'-')===m));
    if(!present.length) return '';
    return `
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${present.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td>No. of Employees</td>${present.map(m=>`<td>${rows.filter(r=>(r.PaymentMode||'-')===m).length}</td>`).join('')}<td>${rows.length}</td></tr>
        <tr><td>Net Pay Amount</td>${present.map(m=>`<td>${fmt(sumOf(rows.filter(r=>(r.PaymentMode||'-')===m),'NetSalary'))}</td>`).join('')}<td>${fmt(sumOf(rows,'NetSalary'))}</td></tr>
      </tbody>
    </table>`;
  };
  const unitTableHTML=(title, rows)=>{
    if(!rows.length) return `<div class="reportSection"><h3 class="unitTitle">${title}</h3><p class="noRows">No employees currently working in this unit.</p></div>`;
    return `
    <div class="reportSection">
    <h3 class="unitTitle">${title} <span class="cnt">(${rows.length} employee${rows.length>1?'s':''})</span></h3>
    <table class="repTable">
      <colgroup>
        <col style="width:4%"><col style="width:9%"><col style="width:24%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:8%"><col style="width:11%"><col style="width:11%">
      </colgroup>
      <thead><tr><th>S.No</th><th>Code</th><th>Name</th><th>Payment Mode</th><th>Earnings</th><th>Deductions</th><th>LOP</th><th>Days Worked</th><th>Net Pay</th></tr></thead>
      <tbody>${unitSectionRowsHTML(rows,1)}
        <tr class="subtotal"><td colspan="4">Sub Total — ${title}</td><td>${fmt(sumOf(rows,'Earnings'))}</td><td>${fmt(sumOf(rows,'Deductions'))}</td><td></td><td></td><td>${fmt(sumOf(rows,'NetSalary'))}</td></tr>
      </tbody>
    </table>
    ${modeSummaryHTML(rows) ? `<h4 class="modeTitle">Mode of Payment Summary — ${title}</h4>${modeSummaryHTML(rows)}` : ''}
    </div>`;
  };
  const grandNet=sumOf(allRows,'NetSalary'), grandEarn=sumOf(allRows,'Earnings'), grandDed=sumOf(allRows,'Deductions');
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to print the report.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payroll Report - ${monthLabel(payMonth)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{margin:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;padding:6px;line-height:1.3;}
    @page{size:A4 portrait;margin:14mm 10mm 16mm;}
    .companyHead{position:relative;text-align:center;background:#e4f2ee;border-bottom:2px solid #0f6b5c;padding:6px 8px;margin:-6px -6px 8px;page-break-after:avoid;break-after:avoid;}
    .companyHead h1{margin:0;font-size:20px;letter-spacing:.3px;color:#0f6b5c;}
    .companyHead p{margin:1px 0;font-size:12px;color:#444;}
    .companyHead .regLine{font-size:11px;color:#555;margin-top:2px;}
    .reportTitle{text-align:center;font-size:15px;font-weight:700;margin:4px 0 6px;text-transform:uppercase;letter-spacing:.5px;page-break-after:avoid;break-after:avoid;}
    .reportTitle span{font-weight:400;text-transform:none;color:#555;font-size:12px;display:block;margin-top:1px;}
    .unitTitle{background:#e4f2ee;border-left:4px solid #0f6b5c;padding:3px 8px;font-size:13px;margin:8px 0 4px;color:#0f6b5c;text-align:center;page-break-after:avoid;break-after:avoid;}
    .unitTitle .cnt{font-weight:400;color:#666;font-size:11px;}
    .reportSection{page-break-inside:avoid;break-inside:avoid-page;margin-bottom:4px;}
    .modeTitle{font-size:12px;color:#0f6b5c;margin:6px 0 3px;font-weight:700;text-align:center;}
    table.modeTable{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:6px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;}
    table.modeTable th,table.modeTable td{border:1px solid #d8d6cd;padding:3px 5px;text-align:center;overflow:hidden;text-overflow:ellipsis;}
    table.modeTable th{background:#1c2430;color:#fff;font-size:10.5px;font-weight:600;}
    table.modeTable td:first-child{text-align:center;font-weight:600;}
    table.modeTable tr:last-child td{font-weight:700;color:#0f6b5c;background:#f6faf9;}
    table.modeTable td:last-child{font-weight:700;background:#e4f2ee !important;color:#0f6b5c;}
    .noRows{font-size:11px;color:#888;padding:4px 8px;font-style:italic;}
    table.repTable{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:4px;table-layout:fixed;}
    table.repTable th,table.repTable td{border:1px solid #d8d6cd;padding:3px 5px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    table.repTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    table.repTable td:nth-child(3){white-space:normal;word-break:break-word;}
    table.repTable th{background:#0f6b5c;color:#fff;font-size:10.5px;font-weight:600;border-color:#0f6b5c;}
    table.repTable tbody tr:nth-child(odd){background:#f6faf9;}
    table.repTable tbody tr:nth-child(even){background:#fff;}
    table.repTable td:nth-child(1),table.repTable td:nth-child(5),table.repTable td:nth-child(6),table.repTable td:nth-child(7),table.repTable td:nth-child(8),table.repTable td:nth-child(9){text-align:center;}
    table.repTable .netCell{font-weight:600;}
    table.repTable tr.subtotal{background:#e4f2ee !important;font-weight:700;color:#0f6b5c;}
    table.repTable tr.subtotal td{text-align:center;border-top:1.5px solid #0f6b5c;}
    table.repTable tr.subtotal td:first-child{text-align:center;}
    .grandTotalBox{margin-top:10px;border-top:2px solid #0f6b5c;padding-top:5px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;font-size:11px;background:#f6f5f1;padding:6px 8px;border-radius:6px;}
    .grandTotalBox b{font-size:12px;color:#0f6b5c;}
    .footNote{margin-top:20px;padding-top:10px;border-top:1px solid #d8d6cd;display:flex;justify-content:space-between;font-size:11px;color:#444;page-break-inside:avoid;break-inside:avoid;}
    .printBar{text-align:center;margin-bottom:14px;}
    @media print{ .printBar{display:none;} }
    table.pageWrap{width:100%;border-collapse:collapse;}
    table.pageWrap>thead>tr>td, table.pageWrap>tbody>tr>td{padding:0;border:none;}
  </style></head>
  <body>
  <div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">Print / Save as PDF</button></div>
  <table class="pageWrap"><thead><tr><td>
  <div class="companyHead">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      ${companyLogoImgHtml(32)}<h1 style="margin:0;">${db.companyName||'YOUR COMPANY PVT LTD'}</h1>
    </div>
    <p>${db.companyAddress||'Company Address, City, State'}</p>
    <p class="regLine">
      ${db.companyGSTIN?('GSTIN: '+db.companyGSTIN+' &nbsp;|&nbsp; '):''}${db.companyPAN?('PAN: '+db.companyPAN+' &nbsp;|&nbsp; '):''}${db.companyCIN?('CIN: '+db.companyCIN+' &nbsp;|&nbsp; '):''}${db.companyPhone?('Ph: '+db.companyPhone+' &nbsp;|&nbsp; '):''}${db.companyEmail?('Email: '+db.companyEmail):''}
    </p>
  </div>
  <div class="reportTitle">Payroll / Salary Report<span>For the month of ${monthLabel(payMonth)}</span></div>
  </td></tr></thead>
  <tbody><tr><td>
  ${unitTableHTML((db.unit1Name||'Unit-1')+(db.unit1Address?(' — '+db.unit1Address):''), unit1Rows)}
  ${unitTableHTML((db.unit2Name||'Unit-2')+(db.unit2Address?(' — '+db.unit2Address):''), unit2Rows)}
  <div class="grandTotalBox">
    <span>Total Employees: <b>${allRows.length}</b></span>
    <span>Total Earnings: <b>${fmt(grandEarn)}</b></span>
    <span>Total Deductions: <b>${fmt(grandDed)}</b></span>
    <span>Grand Total Net Pay: <b>${fmt(grandNet)}</b></span>
  </div>
  <div class="footNote">
    <span>Prepared by: ____________________</span>
    <span>Authorized Signatory: ____________________</span>
  </div>
  </td></tr></tbody></table>
  </body></html>`);
  w.document.close();
}

function modeSectionRowsHTML(rows, startSn){
  let sn=startSn;
  return rows.map(r=>{
    const otherDed=(r.Deductions||0)-(r.ESI||0)-(r.Canteen||0);
    return `<tr>
      <td>${sn++}</td><td>${r.Code}</td><td>${r.Name}</td><td>${r.UnitCode||r.WorkingUnit}</td>
      <td>${fmt(r.Earnings)}</td><td>${fmt(r.ESI||0)}</td><td>${fmt(r.Canteen||0)}</td><td>${fmt(otherDed)}</td><td>${fmt(r.Deductions)}</td><td>${r.LOP}</td><td>${r.DaysWorked}</td>
      <td class="netCell">${fmt(r.NetSalary)}</td>
    </tr>`;}).join('');
}
function printModeWiseReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print reports.'); return; }
  const rec=db.payroll[payMonth];
  if(!rec){ alert('Generate payroll first.'); return; }
  const allRows=payrollReportRows();
  if(!allRows.length){ alert('No payroll records for this month.'); return; }
  const sumOf=(rows,key)=>rows.reduce((s,r)=>s+(r[key]||0),0);
  const modesPresent=[...new Set(allRows.map(r=>r.PaymentMode||'-'))].sort();
  const modeTableHTML=(title, rows)=>{
    if(!rows.length) return '';
    return `
    <div class="reportSection">
    <h3 class="unitTitle">${title} <span class="cnt">(${rows.length} employee${rows.length>1?'s':''})</span></h3>
    <table class="repTable">
      <colgroup>
        <col style="width:3%"><col style="width:7%"><col style="width:16%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:4%"><col style="width:7%"><col style="width:12%">
      </colgroup>
      <thead><tr><th>S.No</th><th>Code</th><th>Name</th><th>Working Unit</th><th>Gross Salary</th><th>ESI</th><th>Canteen</th><th>Other Ded.</th><th>Total Ded.</th><th>LOP</th><th>Days Worked</th><th>Net Pay</th></tr></thead>
      <tbody>${modeSectionRowsHTML(rows,1)}
        <tr class="subtotal"><td colspan="4">Sub Total — ${title}</td><td>${fmt(sumOf(rows,'Earnings'))}</td><td>${fmt(sumOf(rows,'ESI'))}</td><td>${fmt(sumOf(rows,'Canteen'))}</td><td>${fmt(sumOf(rows,'Deductions')-sumOf(rows,'ESI')-sumOf(rows,'Canteen'))}</td><td>${fmt(sumOf(rows,'Deductions'))}</td><td></td><td></td><td class="netPayTotal">${fmt(sumOf(rows,'NetSalary'))}</td></tr>
      </tbody>
    </table>
    </div>`;
  };
  const grandNet=sumOf(allRows,'NetSalary'), grandEarn=sumOf(allRows,'Earnings'), grandDed=sumOf(allRows,'Deductions');
  const grandESI=sumOf(allRows,'ESI'), grandCanteen=sumOf(allRows,'Canteen');
  const grandOtherDed=grandDed-grandESI-grandCanteen;
  const overallSummaryHTML=`
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${modesPresent.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td>No. of Employees</td>${modesPresent.map(m=>`<td>${allRows.filter(r=>(r.PaymentMode||'-')===m).length}</td>`).join('')}<td>${allRows.length}</td></tr>
        <tr><td>Net Pay Amount</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'NetSalary'))}</td>`).join('')}<td>${fmt(grandNet)}</td></tr>
      </tbody>
    </table>
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${modesPresent.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td>Total Gross Salary</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'Earnings'))}</td>`).join('')}<td>${fmt(grandEarn)}</td></tr>
        <tr><td>Total ESI Deductions</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'ESI'))}</td>`).join('')}<td>${fmt(grandESI)}</td></tr>
        <tr><td>Total Canteen Deductions</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'Canteen'))}</td>`).join('')}<td>${fmt(grandCanteen)}</td></tr>
        <tr><td>Other Deductions</td>${modesPresent.map(m=>{const rr=allRows.filter(r=>(r.PaymentMode||'-')===m);const od=sumOf(rr,'Deductions')-sumOf(rr,'ESI')-sumOf(rr,'Canteen');return `<td>${fmt(od)}</td>`;}).join('')}<td>${fmt(grandOtherDed)}</td></tr>
        <tr><td>Sub Total (Total Deductions)</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'Deductions'))}</td>`).join('')}<td>${fmt(grandDed)}</td></tr>
        <tr><td>Total Net Salary Paid</td>${modesPresent.map(m=>`<td>${fmt(sumOf(allRows.filter(r=>(r.PaymentMode||'-')===m),'NetSalary'))}</td>`).join('')}<td>${fmt(grandNet)}</td></tr>
      </tbody>
    </table>`;
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to print the report.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payroll Report (Mode-wise) - ${monthLabel(payMonth)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{margin:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;padding:6px;line-height:1.3;}
    @page{size:A4 portrait;margin:14mm 10mm 16mm;}
    .companyHead{position:relative;text-align:center;background:#e4f2ee;border-bottom:2px solid #0f6b5c;padding:6px 8px;margin:-6px -6px 8px;page-break-after:avoid;break-after:avoid;}
    .companyHead h1{margin:0;font-size:20px;letter-spacing:.3px;color:#0f6b5c;}
    .companyHead p{margin:1px 0;font-size:12px;color:#444;}
    .companyHead .regLine{font-size:11px;color:#555;margin-top:2px;}
    .reportTitle{text-align:center;font-size:15px;font-weight:700;margin:4px 0 6px;text-transform:uppercase;letter-spacing:.5px;page-break-after:avoid;break-after:avoid;}
    .reportTitle span{font-weight:400;text-transform:none;color:#555;font-size:12px;display:block;margin-top:1px;}
    .unitTitle{background:#e4f2ee;border-left:4px solid #0f6b5c;padding:3px 8px;font-size:13px;margin:8px 0 4px;color:#0f6b5c;text-align:center;page-break-after:avoid;break-after:avoid;}
    .unitTitle .cnt{font-weight:400;color:#666;font-size:11px;}
    .reportSection{page-break-inside:avoid;break-inside:avoid-page;margin-bottom:4px;}
    .modeTitle{font-size:12px;color:#0f6b5c;margin:6px 0 3px;font-weight:700;text-align:center;}
    table.modeTable{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:6px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;}
    table.modeTable th,table.modeTable td{border:1px solid #d8d6cd;padding:3px 5px;text-align:center;overflow:hidden;text-overflow:ellipsis;}
    table.modeTable th{background:#1c2430;color:#fff;font-size:10.5px;font-weight:600;}
    table.modeTable td:first-child{text-align:center;font-weight:600;}
    table.modeTable tr:last-child td{font-weight:700;color:#0f6b5c;background:#f6faf9;}
    table.modeTable td:last-child{font-weight:700;background:#e4f2ee !important;color:#0f6b5c;}
    .noRows{font-size:11px;color:#888;padding:4px 8px;font-style:italic;}
    table.repTable{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:4px;table-layout:fixed;}
    table.repTable th,table.repTable td{border:1px solid #d8d6cd;padding:3px 5px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    table.repTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    table.repTable td:nth-child(3){white-space:normal;word-break:break-word;}
    table.repTable th{background:#0f6b5c;color:#fff;font-size:10.5px;font-weight:600;border-color:#0f6b5c;}
    table.repTable tbody tr:nth-child(odd){background:#f6faf9;}
    table.repTable tbody tr:nth-child(even){background:#fff;}
    table.repTable td:nth-child(1),table.repTable td:nth-child(5),table.repTable td:nth-child(6),table.repTable td:nth-child(7),table.repTable td:nth-child(8),table.repTable td:nth-child(9){text-align:center;}
    table.repTable .netCell{font-weight:600;}
    table.repTable tr.subtotal{background:#e4f2ee !important;font-weight:700;color:#0f6b5c;}
    table.repTable tr.subtotal td{text-align:center;border-top:1.5px solid #0f6b5c;}
    table.repTable tr.subtotal td:first-child{text-align:center;}
    table.repTable tr.subtotal td.netPayTotal{overflow:visible;text-overflow:clip;white-space:nowrap;}
    .grandTotalBox{margin-top:10px;border-top:2px solid #0f6b5c;padding-top:5px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;font-size:11px;background:#f6f5f1;padding:6px 8px;border-radius:6px;}
    .grandTotalBox b{font-size:12px;color:#0f6b5c;}
    .footNote{margin-top:20px;padding-top:10px;border-top:1px solid #d8d6cd;display:flex;justify-content:space-between;font-size:11px;color:#444;page-break-inside:avoid;break-inside:avoid;}
    .printBar{text-align:center;margin-bottom:14px;}
    @media print{ .printBar{display:none;} }
    table.pageWrap{width:100%;border-collapse:collapse;}
    table.pageWrap>thead>tr>td, table.pageWrap>tbody>tr>td{padding:0;border:none;}
  </style></head>
  <body>
  <div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">Print / Save as PDF</button></div>
  <table class="pageWrap"><thead><tr><td>
  <div class="companyHead">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      ${companyLogoImgHtml(32)}<h1 style="margin:0;">${db.companyName||'YOUR COMPANY PVT LTD'}</h1>
    </div>
    <p>${db.companyAddress||'Company Address, City, State'}</p>
    <p class="regLine">
      ${db.companyGSTIN?('GSTIN: '+db.companyGSTIN+' &nbsp;|&nbsp; '):''}${db.companyPAN?('PAN: '+db.companyPAN+' &nbsp;|&nbsp; '):''}${db.companyCIN?('CIN: '+db.companyCIN+' &nbsp;|&nbsp; '):''}${db.companyPhone?('Ph: '+db.companyPhone+' &nbsp;|&nbsp; '):''}${db.companyEmail?('Email: '+db.companyEmail):''}
    </p>
  </div>
  <div class="reportTitle">Payroll / Salary Report — Mode of Payment-wise<span>For the month of ${monthLabel(payMonth)}</span></div>
  </td></tr></thead>
  <tbody><tr><td>
  <h4 class="modeTitle">Mode of Payment Summary — All Units</h4>
  ${overallSummaryHTML}
  ${modesPresent.map(m=>modeTableHTML(m, allRows.filter(r=>(r.PaymentMode||'-')===m))).join('')}
  <div class="grandTotalBox">
    <span>Total Employees: <b>${allRows.length}</b></span>
    <span>Total Earnings: <b>${fmt(grandEarn)}</b></span>
    <span>Total Deductions: <b>${fmt(grandDed)}</b></span>
    <span>Grand Total Net Pay: <b>${fmt(grandNet)}</b></span>
  </div>
  <div class="footNote">
    <span>Prepared by: ____________________</span>
    <span>Authorized Signatory: ____________________</span>
  </div>
  </td></tr></tbody></table>
  </body></html>`);
  w.document.close();
}

