/* ================= REPORTS ================= */
// Each report opens on its own, in a clean viewer, with only Download PDF / Print available.
let reportView = null; // null = report list; otherwise the key of the open report
const BONUS_CEILING = 7000;
// Default Bonus Report date range: 1st of current month to today.
let bonusFromDate = todayStr().slice(0,8)+'01';
let bonusToDate = todayStr();
// Employee Experience Report filter state.
let expFY = financialYearOf(todayStr());
let expDept = '';
let expDesig = '';
let expStatus = 'Active';
// PF Contribution Report filter state — yearly, consolidated view.
let yearlyFY = financialYearOf(todayStr());
const REPORTS_LIST = [
  {key:'employee',   icon:'👤', title:'Employee Report',              desc:'All active employees with department, designation, unit and net salary.', needsMonth:false, category:'general'},
  {key:'resignedEmp',icon:'🚪', title:'Resigned Employees Report',    desc:'All resigned employees with joining date, resignation date and reason.', needsMonth:false, category:'general'},
  {key:'department', icon:'🏷️', title:'Department Report',            desc:'Headcount grouped by department (active employees).', needsMonth:false, category:'general'},
  {key:'unit',       icon:'🏭', title:'Unit-wise Report',              desc:'Payroll summary split by working unit, with mode-of-payment totals.', needsMonth:true, category:'monthly'},
  {key:'acquittance',icon:'✍️', title:'Unit-wise Salary Acquittance Register', desc:'A4 landscape register for employee signatures — max 15 employees per page, header repeated on every page, page totals and unit grand total.', needsMonth:true, needsUnitFilter:true, category:'monthly'},
  {key:'mode',       icon:'💳', title:'Mode of Payment-wise Report',   desc:'Payroll summary split by mode of payment (NEFT, Cash, Cheque, etc.).', needsMonth:true, category:'monthly'},
  {key:'print',      icon:'🖨️', title:'Print Report',                  desc:'Full payroll listing for the selected month, ready to print.', needsMonth:true, category:'monthly'},
  {key:'esi',        icon:'🏥', title:'ESI Report (Monthly)',          desc:'Month-wise, employee-wise ESI contribution summary — Employee, Employer and Total ESI.', needsMonth:true, category:'monthly'},
  {key:'pfMonthly',  icon:'🏦', title:'PF Report (Monthly)',           desc:'Month-wise, employee-wise PF contribution summary — Employee, Employer and Total PF.', needsMonth:true, category:'monthly'},
  {key:'experience', icon:'🎂', title:'Employee Experience Report',   desc:'Age and Company Experience (Years & Months) as on Financial Year end, with Department, Designation and Status filters.', needsMonth:false, needsExpFilters:true, category:'yearly'},
  {key:'incrementHistory', icon:'📈', title:'Annual Increment History', desc:'Complete increment history for all employees, by Financial Year.', needsMonth:false, category:'yearly'},
  {key:'esiYearly',  icon:'🏥', title:'ESI Report (Yearly)',           desc:'Yearly consolidated ESI summary — one row per employee, month-wise Total ESI plus Employee/Employer/Total ESI for the Financial Year.', needsMonth:false, needsFY:true, category:'yearly'},
  {key:'pf',         icon:'🏦', title:'PF Report (Yearly)',            desc:'Yearly consolidated PF summary — one row per employee, month-wise Total PF plus Employee/Employer/Total PF for the Financial Year.', needsMonth:false, needsFY:true, category:'yearly'},
  {key:'bonus833',   icon:'🎁', title:'Bonus Report @ 8.33%',          desc:'Statutory minimum bonus on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.0833, category:'yearly'},
  {key:'bonus15',    icon:'🎁', title:'Bonus Report @ 15%',            desc:'Bonus @ 15% on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.15, category:'yearly'},
  {key:'bonus20',    icon:'🎁', title:'Bonus Report @ 20%',            desc:'Statutory maximum bonus on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.20, category:'yearly'},
];
const REPORT_CATEGORIES = [
  {key:'general', label:'📁 General Reports'},
  {key:'monthly', label:'📅 Monthly Reports'},
  {key:'yearly',  label:'📆 Yearly Reports'},
];
function renderReports(){
  return reportView ? renderReportDetail(reportView) : renderReportsList();
}
function renderReportsList(){
  return `
  ${REPORT_CATEGORIES.map(cat=>{
    const list=REPORTS_LIST.filter(r=>r.category===cat.key);
    if(!list.length) return '';
    return `
    <div class="panel">
      <h3>${cat.label}</h3>
      <div class="reportGrid">
        ${list.map(r=>`
          <div class="reportCard" onclick="openReport('${r.key}')">
            <div class="reportCardIcon">${r.icon}</div>
            <div class="reportCardBody">
              <div class="reportCardTitle">${r.title}</div>
              <div class="reportCardDesc">${r.desc}</div>
            </div>
            <div class="reportCardArrow">›</div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('')}
  `;
}
function openReport(key){ reportView=key; render('reports'); }
function closeReport(){ reportView=null; render('reports'); }
function renderReportDetail(key){
  const meta=REPORTS_LIST.find(r=>r.key===key);
  if(!meta){ reportView=null; return renderReportsList(); }
  let previewHtml='', hasData=true;
  if(key==='employee') previewHtml=tableFromRows(employeeReportRows());
  else if(key==='resignedEmp') previewHtml=tableFromRows(resignedReportRows());
  else if(key==='department') previewHtml=tableFromRows(departmentReportRows());
  else if(key==='experience'){
    const rows=experienceReportRows(expFY, expDept, expDesig, expStatus);
    if(!rows.length){ previewHtml='<div class="empty">No employees match the selected filters.</div>'; hasData=false; }
    else previewHtml=tableFromRows(rows);
  }
  else if(key==='incrementHistory'){
    const rows=incrementHistoryReportRows();
    if(!rows.length){ previewHtml='<div class="empty">No increment records yet.</div>'; hasData=false; }
    else previewHtml=tableFromRows(rows);
  }
  else if(meta.needsDateRange){
    if(bonusFromDate>bonusToDate){ previewHtml='<div class="empty">"From Date" cannot be after "To Date".</div>'; hasData=false; }
    else{
      const {rows,months,grandTotal}=bonusReportRows(meta.bonusRate,bonusFromDate,bonusToDate);
      if(!rows.length){ previewHtml='<div class="empty">No payroll records found for employees in the selected period.</div>'; hasData=false; }
      else previewHtml=bonusTableHtml(rows,months,grandTotal);
    }
  }
  else if(key==='esi'){
    if(!db.payroll[payMonth]){ previewHtml='<div class="empty">⚠️ No ESI Contribution Found — payroll has not been generated for '+monthLabel(payMonth)+' yet.</div>'; hasData=false; }
    else{
      const rows=esiReportRows(payMonth);
      if(!rows.length){ previewHtml='<div class="empty">⚠️ No ESI Contribution Found for '+monthLabel(payMonth)+'.</div>'; hasData=false; }
      else previewHtml=esiReportTableHtml(rows);
    }
  }
  else if(key==='esiYearly'){
    const {rows,months,grandTotal}=esiYearlyReportRows(yearlyFY);
    if(!rows.length){ previewHtml='<div class="empty">⚠️ No ESI Contribution Found for Financial Year '+yearlyFY+'.</div>'; hasData=false; }
    else previewHtml=esiYearlyReportTableHtml(rows,months,grandTotal);
  }
  else if(key==='pfMonthly'){
    if(!db.payroll[payMonth]){ previewHtml='<div class="empty">⚠️ No PF Contribution Found — payroll has not been generated for '+monthLabel(payMonth)+' yet.</div>'; hasData=false; }
    else{
      const rows=pfMonthlyReportRows(payMonth);
      if(!rows.length){ previewHtml='<div class="empty">⚠️ No PF Contribution Found for '+monthLabel(payMonth)+'.</div>'; hasData=false; }
      else previewHtml=pfMonthlyReportTableHtml(rows);
    }
  }
  else if(key==='acquittance'){
    const res=acquittancePreviewHtml(payMonth, acqUnit);
    previewHtml=res.html; hasData=res.hasData;
  }
  else if(key==='pf'){
    const {rows,months,grandTotal}=pfReportRows(yearlyFY);
    if(!rows.length){ previewHtml='<div class="empty">⚠️ No PF Contribution Found — no payroll has been generated for Financial Year '+yearlyFY+' yet.</div>'; hasData=false; }
    else previewHtml=pfReportTableHtml(rows,months,grandTotal);
  }
  else{
    if(!db.payroll[payMonth]){ previewHtml='<div class="empty">No payroll generated for this month yet.</div>'; hasData=false; }
    else{
      const rows=payrollReportRows();
      if(!rows.length){ previewHtml='<div class="empty">No payroll records for this month.</div>'; hasData=false; }
      else previewHtml=tableFromRows(rows);
    }
  }
  const canPrint=hasPerm('reports','print');
  return `
  <div class="panel">
    <div class="reportDetailHead">
      <button class="btn secondary" onclick="closeReport()">← Back to Reports</button>
      <h3 style="margin:0;">${meta.icon} ${meta.title}</h3>
    </div>
    <div class="toolbar">
      ${meta.needsMonth ? `<input type="month" value="${payMonth}" onchange="payMonth=this.value;render('reports')">` : ''}
      ${meta.needsUnitFilter ? `
        <label style="font-size:12px;color:var(--muted);">Working Unit
          <select onchange="acqUnit=this.value;render('reports')">
            <option value="All" ${acqUnit==='All'?'selected':''}>All Units (each unit on its own pages)</option>
            <option value="Unit-1" ${acqUnit==='Unit-1'?'selected':''}>${unitLabel('Unit-1')}</option>
            <option value="Unit-2" ${acqUnit==='Unit-2'?'selected':''}>${unitLabel('Unit-2')}</option>
          </select>
        </label>` : ''}
      ${meta.needsDateRange ? `
        <label style="font-size:12px;color:var(--muted);">From Date
          <input type="date" value="${bonusFromDate}" max="${bonusToDate}" onchange="bonusFromDate=this.value;render('reports')">
        </label>
        <label style="font-size:12px;color:var(--muted);">To Date
          <input type="date" value="${bonusToDate}" min="${bonusFromDate}" onchange="bonusToDate=this.value;render('reports')">
        </label>` : ''}
      ${meta.needsExpFilters ? `
        <label style="font-size:12px;color:var(--muted);">Financial Year
          <select onchange="expFY=this.value;render('reports')">
            ${fyOptionsList().map(fy=>`<option value="${fy}" ${fy===expFY?'selected':''}>${fy}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">Department
          <select onchange="expDept=this.value;render('reports')">
            <option value="" ${expDept===''?'selected':''}>All Departments</option>
            ${db.departments.map(d=>`<option value="${d}" ${d===expDept?'selected':''}>${d}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">Designation
          <select onchange="expDesig=this.value;render('reports')">
            <option value="" ${expDesig===''?'selected':''}>All Designations</option>
            ${designationOptionsList().map(d=>`<option value="${d}" ${d===expDesig?'selected':''}>${d}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">Employee Status
          <select onchange="expStatus=this.value;render('reports')">
            <option value="Active" ${expStatus==='Active'?'selected':''}>Active</option>
            <option value="Resigned" ${expStatus==='Resigned'?'selected':''}>Resigned</option>
            <option value="All" ${expStatus==='All'?'selected':''}>All</option>
          </select>
        </label>` : ''}
      ${meta.needsFY ? `
        <label style="font-size:12px;color:var(--muted);">Financial Year
          <select onchange="yearlyFY=this.value;render('reports')">
            ${fyOptionsList().map(fy=>`<option value="${fy}" ${fy===yearlyFY?'selected':''}>${fy}</option>`).join('')}
          </select>
        </label>` : ''}
      ${canPrint ? `<button class="btn" ${hasData?'':'disabled'} onclick="downloadReportPDF('${key}')">⬇️ Download PDF</button>` : ''}
      ${canPrint ? `<button class="btn secondary" ${hasData?'':'disabled'} onclick="downloadReportPDF('${key}')">🖨️ Print</button>` : ''}
    </div>
    ${meta.needsDateRange ? `<p class="syncNote">Bonus Eligible Basic Wages = actual sum of each month's Earnings → Basic Salary within the selected period (only months with generated payroll are included). For Bonus Amount, each month's Basic Salary is first capped at ${fmt(BONUS_CEILING)} (if Basic ≤ ${fmt(BONUS_CEILING)}, actual is used) and then summed and multiplied by ${(meta.bonusRate*100).toFixed(2).replace(/\.00$/,'')}%.</p>` : ''}
    ${meta.needsExpFilters ? `<p class="syncNote">Age and Company Experience are calculated as on ${fmtDate(fyEndDate(expFY))} (last day of Financial Year ${expFY}). Employees who joined after this date are excluded. Experience is shown in completed Years and Months.</p>` : ''}
    ${key==='acquittance' ? `<p class="syncNote">Printed on A4 Landscape so all 9 columns fit at full size with a wide signature column. Each page holds at most ${ACQ_ROWS_PER_PAGE} employees; larger units roll over to the next page with the same header. Every page shows its Page Total, and the last page of each unit shows the Unit Grand Total. Employees are listed in Emp ID order.</p>` : ''}
    ${key==='esi' ? `<p class="syncNote">Figures are the actual ESI Employee and ESI Employer contributions processed in the ${monthLabel(payMonth)} payroll run. Only employees with ESI applicable and a contribution greater than ₹0 for the month are listed.</p>` : ''}
    ${key==='esiYearly' ? `<p class="syncNote">Yearly consolidated view for Financial Year ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]}) — one row per employee, with Total ESI for each processed month plus yearly Employee / Employer / Total ESI, built from the actual ESI figures processed in each month's payroll run. Only employees with an ESI contribution greater than ₹0 in at least one month of the year are listed.</p>` : ''}
    ${key==='pfMonthly' ? `<p class="syncNote">Figures are the actual PF Employee and PF Employer contributions processed in the ${monthLabel(payMonth)} payroll run. Every on-roll employee for the month is listed, including employees for whom PF is currently Exempted/Nil — they show ₹0 and will automatically show real contributions the moment PF is enabled for them.</p>` : ''}
    ${key==='pf' ? `<p class="syncNote">Yearly consolidated view for Financial Year ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]}) — one row per employee, with Total PF for each processed month plus yearly Employee / Employer / Total PF, built from the actual PF figures processed in each month's payroll run. Every on-roll employee is listed, including employees for whom PF is currently Exempted/Nil — they show ₹0 and will automatically show real contributions the moment PF is enabled for them.</p>` : ''}
    <div class="reportPreview">${previewHtml}</div>
  </div>`;
}
function downloadReportPDF(key){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  if(key==='employee') return printSimpleReport('Employee Report', employeeReportRows());
  if(key==='resignedEmp') return printSimpleReport('Resigned Employees Report', resignedReportRows());
  if(key==='department') return printSimpleReport('Department Report', departmentReportRows());
  if(key==='experience') return printSimpleReport('Employee Experience Report — FY '+expFY+' (as on '+fmtDate(fyEndDate(expFY))+')', experienceReportRows(expFY, expDept, expDesig, expStatus));
  if(key==='incrementHistory') return printSimpleReport('Annual Increment History', incrementHistoryReportRows());
  if(key==='unit') return printPayrollReport();
  if(key==='acquittance') return printAcquittanceReport();
  if(key==='mode') return printModeWiseReport();
  if(key==='print') return printGeneralPayrollReport();
  if(key==='esi') return printESIReport();
  if(key==='esiYearly') return printESIYearlyReport();
  if(key==='pfMonthly') return printPFMonthlyReport();
  if(key==='pf') return printPFReport();
  const meta=REPORTS_LIST.find(r=>r.key===key);
  if(meta && meta.needsDateRange) return printBonusReport(meta);
}
