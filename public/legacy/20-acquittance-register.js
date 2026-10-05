/* ================= SALARY ACQUITTANCE REGISTER (Unit-wise, paginated) =================
   A4 Landscape register for physical salary acknowledgement. Hard limit of
   ACQ_ROWS_PER_PAGE employees per sheet; each Unit starts on a fresh page and any
   overflow rolls to the next page(s) with the full header repeated. Every page shows
   its own Page Total; the last page of each Unit also shows the Unit Grand Total.
   Pages are built as fixed-size A4 sheets (not browser-flowed tables), so the
   15-per-page rule holds exactly on screen, in print and in Save-as-PDF. */
let acqUnit = 'All';
const ACQ_ROWS_PER_PAGE = 15;
function acqEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function acqAmt(n){ return (Math.round((Number(n)||0)*100)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function monthLabelLong(ym){
  const [y,m]=ym.split('-');
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return names[+m-1]+' '+y;
}
function acquittanceUnitRows(ym, unitCode){
  const rec=db.payroll[ym]||{};
  return Object.values(rec).map(r=>{
    const e=db.employees.find(x=>x.code===r.code)||{};
    return {
      code:r.code, name:r.name||e.name||'-',
      unit:(e.unit==='Unit-2')?'Unit-2':'Unit-1',
      designation:r.designation||e.designation||'',
      department:r.department||e.department||'',
      days:Number(r.daysWorking)||0,
      gross:Number(r.earningsTotal)||0,
      ded:Number(r.deductionsTotal)||0,
      net:Number(r.netSalary)||0
    };
  }).filter(r=>r.unit===unitCode)
    .sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
}
// [{unitCode, unitName, unitAddress, rows}] for the selected filter; units with no payroll rows are skipped.
function acquittanceUnits(ym, filter){
  const codes = filter==='All' ? ['Unit-1','Unit-2'] : [filter];
  return codes.map(c=>({
    unitCode:c, unitName:unitLabel(c),
    unitAddress:(c==='Unit-2'?db.unit2Address:db.unit1Address)||'',
    rows:acquittanceUnitRows(ym,c)
  })).filter(u=>u.rows.length);
}
function acquittanceSheetCount(units){
  return units.reduce((s,u)=>s+Math.ceil(u.rows.length/ACQ_ROWS_PER_PAGE),0);
}
// Builds the complete standalone HTML document (all sheets). opts.preview=true adds the
// on-screen fit-to-width script used inside the in-app preview iframe; otherwise a print bar.
function acquittanceDocHtml(ym, units, opts){
  opts=opts||{};
  const sum=(rows,k)=>rows.reduce((s,r)=>s+(Number(r[k])||0),0);
  const monthText=monthLabelLong(ym);
  const regLine=[
    db.companyGSTIN?('GSTIN: '+acqEsc(db.companyGSTIN)):'',
    db.companyPAN?('PAN: '+acqEsc(db.companyPAN)):'',
    db.companyCIN?('CIN: '+acqEsc(db.companyCIN)):''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const totalSheets=acquittanceSheetCount(units);
  let sheetNo=0;
  const sheets=[];
  units.forEach(u=>{
    const pages=[];
    for(let i=0;i<u.rows.length;i+=ACQ_ROWS_PER_PAGE) pages.push(u.rows.slice(i,i+ACQ_ROWS_PER_PAGE));
    pages.forEach((pg,pi)=>{
      sheetNo++;
      const isLast = pi===pages.length-1;
      const startSn = pi*ACQ_ROWS_PER_PAGE;
      const bodyRows = pg.map((r,i)=>{
        const dd=[r.designation,r.department].filter(Boolean).map(acqEsc); // [designation, department]
        return `<tr>
          <td class="c">${startSn+i+1}</td>
          <td class="c">${acqEsc(r.code)}</td>
          <td class="l name"><div class="clamp2">${acqEsc(r.name)}</div></td>
          <td class="l dd">${dd.length?`<div class="one">${dd[0]}</div>${dd[1]?`<div class="one sub">${dd[1]}</div>`:''}`:'-'}</td>
          <td class="c">${r.days}</td>
          <td class="r">${acqAmt(r.gross)}</td>
          <td class="r">${acqAmt(r.ded)}</td>
          <td class="r net">${acqAmt(r.net)}</td>
          <td class="sig"></td>
        </tr>`;
      }).join('');
      const pageTotalRow = `<tr class="pTotal">
          <td colspan="5" class="r">Page Total &nbsp;<span class="cnt">(${pg.length} employee${pg.length>1?'s':''})</span></td>
          <td class="r">${acqAmt(sum(pg,'gross'))}</td>
          <td class="r">${acqAmt(sum(pg,'ded'))}</td>
          <td class="r">${acqAmt(sum(pg,'net'))}</td>
          <td></td>
        </tr>`;
      const grandRow = isLast ? `<tr class="gTotal">
          <td colspan="5" class="r">Grand Total — ${acqEsc(u.unitName)} &nbsp;<span class="cnt">(${u.rows.length} employee${u.rows.length>1?'s':''}${pages.length>1?', '+pages.length+' pages':''})</span></td>
          <td class="r">${acqAmt(sum(u.rows,'gross'))}</td>
          <td class="r">${acqAmt(sum(u.rows,'ded'))}</td>
          <td class="r">${acqAmt(sum(u.rows,'net'))}</td>
          <td></td>
        </tr>` : '';
      sheets.push(`<section class="sheet">
        <header class="aHead">
          <div class="aCo">
            ${companyLogoImgHtml(34)}
            <div>
              <h1>${acqEsc(db.companyName||'YOUR COMPANY PVT LTD')}</h1>
              <p>${acqEsc(db.companyAddress||'Company Address, City, State')}${regLine?(' &nbsp;|&nbsp; '+regLine):''}</p>
            </div>
          </div>
          <h2>Salary Acquittance Register</h2>
          <div class="aMeta">
            <span>Unit: <b>${acqEsc(u.unitName)}</b>${u.unitAddress?` <i>(${acqEsc(u.unitAddress)})</i>`:''}</span>
            <span>Month &amp; Year: <b>${monthText}</b></span>
            <span>Page <b>${pi+1}</b> of <b>${pages.length}</b></span>
          </div>
        </header>
        <table class="aTable">
          <colgroup>
            <col style="width:4.5%"><col style="width:8%"><col style="width:18%"><col style="width:16%">
            <col style="width:6.5%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:16%">
          </colgroup>
          <thead><tr>
            <th>S.No.</th><th>Emp ID</th><th>Employee Name</th><th>Designation / Department</th>
            <th>Days Worked</th><th>Gross Salary (₹)</th><th>Total Deductions (₹)</th><th>Net Payable Salary (₹)</th>
            <th>Employee Signature / Date</th>
          </tr></thead>
          <tbody>${bodyRows}${pageTotalRow}${grandRow}</tbody>
        </table>
        <div class="spacer"></div>
        ${isLast ? '' : `<div class="contNote">Continued on page ${pi+2} of ${pages.length} — ${acqEsc(u.unitName)}</div>`}
        <footer class="aFoot">
          <span>Prepared by: ____________________</span>
          <span>Checked by: ____________________</span>
          <span>Authorised Signatory: ____________________</span>
        </footer>
        <div class="aStamp"><span>Generated on ${fmtDate(todayStr())}</span><span>Sheet ${sheetNo} of ${totalSheets}</span></div>
      </section>`);
    });
  });
  const previewScript = opts.preview ? `<script>
    (function(){
      function fit(){
        var w=document.documentElement.clientWidth||window.innerWidth;
        document.body.style.zoom=Math.min(1,(w-12)/1140);
        requestAnimationFrame(function(){ try{ if(window.frameElement) window.frameElement.style.height=Math.ceil(document.documentElement.scrollHeight)+'px'; }catch(e){} });
      }
      fit(); window.addEventListener('resize',fit);
    })();
  <\/script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Salary Acquittance Register - ${monthText}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
    @page{size:A4 landscape;margin:0;}
    html,body{margin:0;padding:0;}
    body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c2430;background:#fff;line-height:1.25;}
    .sheet{width:297mm;height:209.5mm;padding:8mm 10mm 7mm;display:flex;flex-direction:column;overflow:hidden;background:#fff;page-break-after:always;break-after:page;}
    .sheets .sheet:last-child{page-break-after:auto;break-after:auto;}
    .aHead{flex:none;}
    .aCo{display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;background:#e4f2ee;border-bottom:2px solid #0f6b5c;padding:5px 8px;}
    .aCo h1{margin:0;font-size:19px;color:#0f6b5c;letter-spacing:.3px;}
    .aCo p{margin:1px 0 0;font-size:10.5px;color:#444;}
    .aHead h2{margin:5px 0 3px;text-align:center;font-size:15px;letter-spacing:.6px;text-transform:uppercase;color:#1c2430;}
    .aMeta{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:3px 2px 4px;border-bottom:1px solid #d8d6cd;margin-bottom:4px;}
    .aMeta i{font-style:normal;color:#666;font-size:10.5px;}
    table.aTable{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;flex:none;}
    .aTable th{background:#0f6b5c;color:#fff;font-weight:600;font-size:10.5px;padding:4px 4px;border:1px solid #0f6b5c;text-align:center;vertical-align:middle;line-height:1.2;}
    .aTable td{border:1px solid #c9c7be;padding:2px 5px;height:8.4mm;vertical-align:middle;overflow:hidden;}
    .aTable tbody tr{page-break-inside:avoid;break-inside:avoid;}
    .aTable tbody tr:nth-child(even) td{background:#f6faf9;}
    .aTable td.c{text-align:center;} .aTable td.r{text-align:right;} .aTable td.l{text-align:left;}
    .aTable td.name{font-weight:600;}
    .aTable td.dd{font-size:10.5px;line-height:1.2;}
    .aTable td.dd .sub{color:#666;font-size:9.5px;}
    /* Fixed row height keeps exactly 15 rows per sheet: long names clamp to 2 lines,
       designation and department to 1 line each (ellipsis). */
    .aTable .clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.2;max-height:2.4em;word-break:break-word;}
    .aTable .one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .aTable td.net{font-weight:700;}
    .aTable td.sig{background:#fff !important;}
    .aTable tr.pTotal td{height:7mm;background:#e4f2ee !important;font-weight:700;color:#0f6b5c;border-top:1.5px solid #0f6b5c;}
    .aTable tr.gTotal td{height:7.5mm;background:#0f6b5c !important;color:#fff;font-weight:700;border-color:#0f6b5c;font-size:11.5px;}
    .aTable .cnt{font-weight:400;font-size:10px;opacity:.85;}
    .spacer{flex:1 1 auto;min-height:2mm;}
    .contNote{flex:none;text-align:right;font-size:10px;font-style:italic;color:#666;margin-bottom:3mm;}
    .aFoot{flex:none;display:flex;justify-content:space-between;font-size:11px;color:#333;padding-top:2mm;}
    .aStamp{flex:none;display:flex;justify-content:space-between;font-size:9px;color:#888;margin-top:2mm;border-top:1px solid #e3e1d9;padding-top:1mm;}
    .printBar{text-align:center;padding:12px 0;}
    @media screen{
      body{background:#dfe3e6;}
      .sheets{padding:${opts.preview?'6px':'0 0 16px'};}
      .sheet{margin:0 auto 14px;box-shadow:0 2px 10px rgba(0,0,0,.18);}
    }
    @media print{ .printBar{display:none;} body{background:#fff;} .sheet{margin:0;box-shadow:none;} }
  </style></head><body>
  ${opts.preview ? '' : `<div class="printBar"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">⬇️ Download PDF / Print (A4 Landscape)</button></div>`}
  <div class="sheets">${sheets.join('')}</div>
  ${previewScript}
  </body></html>`;
}
function acquittancePreviewHtml(ym, filter){
  if(!db.payroll[ym]) return {html:'<div class="empty">No payroll generated for '+monthLabel(ym)+' yet.</div>', hasData:false};
  const units=acquittanceUnits(ym, filter);
  if(!units.length) return {html:'<div class="empty">No payroll records for '+(filter==='All'?'any unit':unitLabel(filter))+' in '+monthLabel(ym)+'.</div>', hasData:false};
  const doc=acquittanceDocHtml(ym, units, {preview:true});
  const src=doc.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const n=acquittanceSheetCount(units);
  const summary=units.map(u=>`${acqEsc(u.unitName)}: ${u.rows.length} employee${u.rows.length>1?'s':''} → ${Math.ceil(u.rows.length/ACQ_ROWS_PER_PAGE)} page${Math.ceil(u.rows.length/ACQ_ROWS_PER_PAGE)>1?'s':''}`).join(' &nbsp;|&nbsp; ');
  return {
    html:`<p class="syncNote" style="margin-top:6px;font-weight:600;">${summary} &nbsp;|&nbsp; <b>${n} A4 sheet${n>1?'s':''} in total</b></p>
      <iframe class="acqPreviewFrame" title="Salary Acquittance Register preview" srcdoc="${src}" style="width:100%;height:${n*640}px;border:1px solid var(--line);border-radius:10px;background:#dfe3e6;display:block;"></iframe>`,
    hasData:true
  };
}
function printAcquittanceReport(){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  if(!db.payroll[payMonth]){ alert('Generate payroll for '+monthLabel(payMonth)+' first.'); return; }
  const units=acquittanceUnits(payMonth, acqUnit);
  if(!units.length){ alert('No payroll records for the selected unit in '+monthLabel(payMonth)+'.'); return; }
  const w=window.open('','_blank');
  if(!w){ alert('Please allow pop-ups to download/print the report.'); return; }
  w.document.write(acquittanceDocHtml(payMonth, units, {preview:false}));
  w.document.close();
}
