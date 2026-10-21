// Report columns printed as money (₹) — an explicit list, so day/hour counts are never formatted
// as rupees and every money column is (not just the ones whose key happens to contain "Salary").
const REPORT_MONEY_KEYS=['Gross','Earnings','ESI','PF','Canteen','Late','Advance','OtherDed','Deductions','NetSalary',
  'OTAmount','LateAmount','CanteenAmount','AdvanceAmount','DailyWage'];
// Columns that are never summed in a totals row (rates / per-month constants).
const REPORT_NO_TOTAL_KEYS=['NOWD','DailyWage'];
// Printed headers for the report row keys (anything not listed prints as its key).
const REPORT_COL_LABELS={WorkingUnit:'Working Unit',UnitCode:'Unit Code',PaymentMode:'Payment Mode',HalfDay:'Half Day',PaidDays:'Paid Days',DaysWorked:'Paid Days',
  OTHrs:'OT Hrs',LateMin:'Late Min',LateChargedMin:'Late Charged Min',Gross:'Gross (Basic + OT)',Earnings:'Total Earnings',Late:'Late (₹)',
  OtherDed:'Other Ded.',Deductions:'Total Deductions',NetSalary:'Net Pay',NotMarked:'Not Marked',OTAmount:'OT ₹',LateAmount:'Late ₹',
  CanteenTokens:'Canteen Tokens',CanteenAmount:'Canteen ₹',AdvanceAmount:'Advance ₹',DailyWage:'Daily Wage'};
function reportColLabel(k){ return REPORT_COL_LABELS[k]||k; }
function reportCellHtml(k, v){
  if(v===undefined || v===null) return '';
  return typeof v==='number' && REPORT_MONEY_KEYS.includes(k) ? fmt(v) : v;
}
function reportRound(n){ return Math.round((Number(n)||0)*100)/100; }
// Totals for each column: the sum of every numeric column (money formatted), '' for text columns.
function reportTotalsCells(rows, cols){
  return cols.map(c=>{
    if(REPORT_NO_TOTAL_KEYS.includes(c) || !rows.some(r=>typeof r[c]==='number')) return '';
    const sum=reportRound(rows.reduce((t,r)=>t+(Number(r[c])||0),0));
    return REPORT_MONEY_KEYS.includes(c) ? fmt(sum) : sum;
  });
}
// Payment modes present in a set of payroll report rows ('-' = not set, listed last), so per-mode
// columns always add up to the total.
function reportModesOf(rows){
  const modes=[...new Set(rows.map(r=>r.PaymentMode||'-'))];
  return modes.filter(m=>m!=='-').sort().concat(modes.includes('-')?['-']:[]);
}
function reportModeLabel(m){ return m==='-' ? 'Not set' : m; }
// opts.totals: add a TOTAL row summing the numeric columns.
function tableFromRows(rows, opts){
  opts=opts||{};
  if(!rows.length) return '<div class="empty">No data.</div>';
  const cols=Object.keys(rows[0]);
  const totals=opts.totals ? reportTotalsCells(rows, cols) : null;
  if(totals) totals[0]='TOTAL';
  return `<table><thead><tr>${cols.map(c=>`<th>${reportColLabel(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${reportCellHtml(c,r[c])}</td>`).join('')}</tr>`).join('')}
    ${totals ? `<tr class="payTotalRow">${totals.map(v=>`<td><b>${v}</b></td>`).join('')}</tr>` : ''}
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
  <div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">${ico('download')} Download PDF / Print</button></div>
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
// opts.totals: add a TOTAL row; opts.orientation: 'landscape' for wide reports.
function printSimpleReport(title, rows, opts){
  opts=opts||{};
  if(!rows.length){ alert('No data to print.'); return; }
  const cols=Object.keys(rows[0]);
  const totals=opts.totals ? reportTotalsCells(rows, cols) : null;
  if(totals) totals[0]='TOTAL';
  const tableHtml=`${opts.compact?'<style>table.repTable th,table.repTable td{font-size:8.5px;padding:2px 3px;}</style>':''}<table class="repTable"><thead><tr>${cols.map(c=>`<th>${reportColLabel(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r=>`<tr>${cols.map(c=>`<td>${reportCellHtml(c,r[c])}</td>`).join('')}</tr>`).join('')}
    ${totals ? `<tr class="subtotal">${totals.map(v=>`<td>${v}</td>`).join('')}</tr>` : ''}
  </tbody></table>`;
  openPrintWindow(title, tableHtml, {orientation:opts.orientation||'portrait'});
}
// Full payroll listing (A4 landscape): every payroll report column (Unit Code left out — the
// Working Unit column already names it), S.No, and a TOTAL row for the day, hour and ₹ columns.
function printGeneralPayrollReport(){
  if(!payrollGenerated(payMonth)){ alert('Generate payroll first.'); return; }
  const rows=payrollReportRows(payMonth);
  if(!rows.length){ alert('No payroll records for this month.'); return; }
  const cols=Object.keys(rows[0]).filter(c=>c!=='UnitCode');
  const totals=reportTotalsCells(rows, cols);
  const tableHtml=`<style>table.repTable th,table.repTable td{font-size:8.5px;padding:2px 3px;}</style>
  <table class="repTable"><thead><tr><th>S.No</th>${cols.map(c=>`<th>${reportColLabel(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r,i)=>`<tr><td>${i+1}</td>${cols.map(c=>`<td>${reportCellHtml(c,r[c])}</td>`).join('')}</tr>`).join('')}
    <tr class="subtotal"><td colspan="3">TOTAL (${rows.length} employee${rows.length>1?'s':''})</td>${totals.slice(2).map(v=>`<td>${v}</td>`).join('')}</tr>
  </tbody></table>`;
  openPrintWindow(`Payroll Report — ${monthLabel(payMonth)}`, tableHtml, {orientation:'landscape'});
}

// Columns of the unit-wise / contractor-wise / mode-wise payroll PDFs (A4 landscape). `fourth` is
// the grouping-dependent column (Payment Mode, or Working Unit for the mode-wise report).
// ESI + PF + Canteen + Late + Advance + Other Ded. = Total Ded.
function payrollSectionCols(fourth){
  return [
    {h:'S.No', w:3, sn:true}, {h:'Code', k:'Code', w:6}, {h:'Name', k:'Name', w:13}, fourth,
    {h:'Present', k:'Present', w:4.5, num:true}, {h:'Paid Days', k:'PaidDays', w:4.5, num:true}, {h:'LOP', k:'LOP', w:3.5, num:true},
    {h:'OT Hrs', k:'OTHrs', w:4, num:true}, {h:'Late Min', k:'LateMin', w:4, num:true},
    {h:'Total Earnings', k:'Earnings', w:6.5, money:true}, {h:'ESI', k:'ESI', w:5, money:true}, {h:'PF', k:'PF', w:5, money:true},
    {h:'Canteen', k:'Canteen', w:5, money:true}, {h:'Late (₹)', k:'Late', w:5, money:true}, {h:'Advance', k:'Advance', w:5, money:true},
    {h:'Other Ded.', k:'OtherDed', w:5, money:true}, {h:'Total Ded.', k:'Deductions', w:6, money:true}, {h:'Net Pay', k:'NetSalary', w:7, money:true, net:true}
  ];
}
function payrollSectionTableHTML(cols, rows, subtotalLabel){
  const sumOf=k=>reportRound(rows.reduce((t,r)=>t+(Number(r[k])||0),0));
  const cell=(c,r,i)=>c.sn ? i+1 : c.money ? fmt(Number(r[c.k])||0) : (r[c.k]===undefined||r[c.k]===null||r[c.k]==='' ? '-' : r[c.k]);
  const lead=cols.findIndex(c=>c.num||c.money);
  return `<table class="repTable">
      <colgroup>${cols.map(c=>`<col style="width:${c.w}%">`).join('')}</colgroup>
      <thead><tr>${cols.map(c=>`<th>${c.h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r,i)=>`<tr>${cols.map(c=>`<td${c.net?' class="netCell"':''}>${cell(c,r,i)}</td>`).join('')}</tr>`).join('')}
        <tr class="subtotal"><td colspan="${lead}">${subtotalLabel}</td>${cols.slice(lead).map(c=>`<td${c.net?' class="netPayTotal"':''}>${c.money ? fmt(sumOf(c.k)) : c.num ? sumOf(c.k) : ''}</td>`).join('')}</tr>
      </tbody>
    </table>`;
}
// Unit-wise (by='unit', default) or Contractor-wise (by='contractor') payroll report.
function printPayrollReport(by){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print reports.'); return; }
  if(!payrollGenerated(payMonth)){ alert('Generate payroll first.'); return; }
  const allRows=payrollReportRows(payMonth);
  if(!allRows.length){ alert('No payroll records for this month.'); return; }
  // One section per working unit (see getUnits() in 06b-units.js), or per contractor
  // (06c-contractors.js; employees without one get a "Non Contractor" section).
  const byContractor = by==='contractor';
  const contractorOf=r=>r.ContractorCode||'';
  const sections = byContractor
    ? [...getContractors().map(c=>({title:(c.name||c.code)+(c.address?(' — '+c.address):''), rows:allRows.filter(r=>contractorOf(r)===c.code)})),
       {title:'Non Contractor', rows:allRows.filter(r=>!getContractors().some(c=>c.code===contractorOf(r)))}].filter(s=>s.rows.length || s.title!=='Non Contractor')
    : getUnits().map(u=>({title:unitDisplayName(u)+(u.address?(' — '+u.address):''), rows:allRows.filter(r=>r.UnitCode ? r.UnitCode===u.code : r.WorkingUnit===unitLabel(u.code))}));
  const sumOf=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
  // Every mode present in the rows (incl. "Not set"), so the mode columns add up to the Total.
  const modeSummaryHTML=(rows)=>{
    const present=reportModesOf(rows);
    if(!present.length) return '';
    return `
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${present.map(m=>`<th>${reportModeLabel(m)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td>No. of Employees</td>${present.map(m=>`<td>${rows.filter(r=>(r.PaymentMode||'-')===m).length}</td>`).join('')}<td>${rows.length}</td></tr>
        <tr><td>Net Pay Amount</td>${present.map(m=>`<td>${fmt(sumOf(rows.filter(r=>(r.PaymentMode||'-')===m),'NetSalary'))}</td>`).join('')}<td>${fmt(sumOf(rows,'NetSalary'))}</td></tr>
      </tbody>
    </table>`;
  };
  const unitTableHTML=(title, rows)=>{
    if(!rows.length) return `<div class="reportSection"><h3 class="unitTitle">${title}</h3><p class="noRows">No employees currently ${byContractor?'supplied by this contractor':'working in this unit'}.</p></div>`;
    return `
    <div class="reportSection">
    <h3 class="unitTitle">${title} <span class="cnt">(${rows.length} employee${rows.length>1?'s':''})</span></h3>
    ${payrollSectionTableHTML(payrollSectionCols({h:'Payment Mode', k:'PaymentMode', w:7}), rows, 'Sub Total — '+title)}
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
    @page{size:A4 landscape;margin:12mm 8mm 14mm;}
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
    table.repTable{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:4px;table-layout:fixed;}
    table.repTable th,table.repTable td{border:1px solid #d8d6cd;padding:2px 3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    table.repTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    table.repTable td:nth-child(3){white-space:normal;word-break:break-word;}
    table.repTable th{background:#0f6b5c;color:#fff;font-size:9px;font-weight:600;border-color:#0f6b5c;white-space:normal;}
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
  <div class="reportTitle">${byContractor?'Contractor-wise ':''}Payroll / Salary Report<span>For the month of ${monthLabel(payMonth)}</span></div>
  </td></tr></thead>
  <tbody><tr><td>
  ${sections.map(s=>unitTableHTML(s.title, s.rows)).join('\n  ')}
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

function printModeWiseReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print reports.'); return; }
  if(!payrollGenerated(payMonth)){ alert('Generate payroll first.'); return; }
  const allRows=payrollReportRows(payMonth);
  if(!allRows.length){ alert('No payroll records for this month.'); return; }
  const sumOf=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
  const modesPresent=reportModesOf(allRows);
  const ofMode=m=>allRows.filter(r=>(r.PaymentMode||'-')===m);
  const modeTableHTML=(title, rows)=>{
    if(!rows.length) return '';
    return `
    <div class="reportSection">
    <h3 class="unitTitle">${title} <span class="cnt">(${rows.length} employee${rows.length>1?'s':''})</span></h3>
    ${payrollSectionTableHTML(payrollSectionCols({h:'Working Unit', k:'WorkingUnit', w:9}), rows, 'Sub Total — '+title)}
    </div>`;
  };
  const grandNet=sumOf(allRows,'NetSalary'), grandEarn=sumOf(allRows,'Earnings'), grandDed=sumOf(allRows,'Deductions');
  // Each deduction line is its own field (ESI + PF + Canteen + Late + Advance + Other = Total).
  const dedLine=(label,key)=>`<tr><td>${label}</td>${modesPresent.map(m=>`<td>${fmt(sumOf(ofMode(m),key))}</td>`).join('')}<td>${fmt(sumOf(allRows,key))}</td></tr>`;
  const overallSummaryHTML=`
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${modesPresent.map(m=>`<th>${reportModeLabel(m)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        <tr><td>No. of Employees</td>${modesPresent.map(m=>`<td>${ofMode(m).length}</td>`).join('')}<td>${allRows.length}</td></tr>
        <tr><td>Net Pay Amount</td>${modesPresent.map(m=>`<td>${fmt(sumOf(ofMode(m),'NetSalary'))}</td>`).join('')}<td>${fmt(grandNet)}</td></tr>
      </tbody>
    </table>
    <table class="modeTable">
      <thead><tr><th>Mode of Payment</th>${modesPresent.map(m=>`<th>${reportModeLabel(m)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${dedLine('Total Earnings','Earnings')}
        ${dedLine('Total ESI Deductions','ESI')}
        ${dedLine('Total PF Deductions','PF')}
        ${dedLine('Total Canteen Deductions','Canteen')}
        ${dedLine('Total Late Deductions','Late')}
        ${dedLine('Total Advance Deductions','Advance')}
        ${dedLine('Other Deductions','OtherDed')}
        ${dedLine('Sub Total (Total Deductions)','Deductions')}
        ${dedLine('Total Net Salary Paid','NetSalary')}
      </tbody>
    </table>`;
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to print the report.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payroll Report (Mode-wise) - ${monthLabel(payMonth)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    body{margin:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;padding:6px;line-height:1.3;}
    @page{size:A4 landscape;margin:12mm 8mm 14mm;}
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
    table.repTable{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:4px;table-layout:fixed;}
    table.repTable th,table.repTable td{border:1px solid #d8d6cd;padding:2px 3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    table.repTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    table.repTable td:nth-child(3){white-space:normal;word-break:break-word;}
    table.repTable th{background:#0f6b5c;color:#fff;font-size:9px;font-weight:600;border-color:#0f6b5c;white-space:normal;}
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
  ${modesPresent.map(m=>modeTableHTML(reportModeLabel(m), ofMode(m))).join('')}
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

