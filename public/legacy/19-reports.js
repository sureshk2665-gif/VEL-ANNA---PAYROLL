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
// Attendance & OT Register filter state: unit ('All' or a unit code) and contractor ('' = all, '-' = none, or a code).
let attRegUnit = 'All';
let attRegContractor = '';
const REPORTS_LIST = [
  {key:'employee',   icon:'user', title:'Employee Report',              desc:'All active employees with department, designation, unit and daily wage.', needsMonth:false, category:'general'},
  {key:'resignedEmp',icon:'door-open', title:'Resigned Employees Report',    desc:'All resigned employees with joining date, resignation date and reason.', needsMonth:false, category:'general'},
  {key:'department', icon:'tag', title:'Department Report',            desc:'Headcount grouped by department (active employees).', needsMonth:false, category:'general'},
  {key:'unit',       icon:'factory', title:'Unit-wise Report',              desc:'Payroll summary split by working unit.', needsMonth:true, category:'monthly'},
  {key:'acquittance',icon:'pen-line', title:'Unit-wise Salary Acquittance Register', desc:'A4 landscape register for employee signatures — max 15 employees per page, header repeated on every page, page totals and unit grand total.', needsMonth:true, needsUnitFilter:true, category:'monthly'},
  {key:'contractor', icon:'users', title:'Contractor-wise Report',        desc:'Payroll summary split by contractor (any unit), with each contractor\'s service charge.', needsMonth:true, category:'monthly'},
  {key:'acquittanceContractor',icon:'pen-line', title:'Contractor-wise Salary Acquittance Register', desc:'Same A4 signature register, one section per contractor — optionally for one unit only (e.g. a contractor\'s employees in Unit-2).', needsMonth:true, needsContractorFilter:true, category:'monthly'},
  {key:'attendanceRegister', icon:'calendar-days', title:'Attendance & OT Register (Monthly)', desc:'Per employee: NOWD, Present, Half Day, LOP, NOPH, Not Marked, Paid Days, OT hours & amount, late minutes & deduction, canteen tokens and advance — with a totals row.', needsMonth:true, needsAttRegFilters:true, category:'monthly'},
  {key:'print',      icon:'printer', title:'Print Report',                  desc:'Full payroll listing for the selected month, ready to print.', needsMonth:true, category:'monthly'},
  {key:'pfMonthly',  icon:'landmark', title:'PF Report (Monthly)',           desc:'Month-wise, employee-wise PF contribution summary — Employee, Employer and Total PF.', needsMonth:true, category:'monthly'},
  {key:'esi',        icon:'heart-pulse', title:'ESI Report (Monthly)',          desc:'Month-wise, employee-wise ESI contribution summary — Employee, Employer and Total ESI.', needsMonth:true, category:'monthly'},
  {key:'experience', icon:'cake', title:'Employee Experience Report',   desc:'Age and Company Experience (Years & Months) as on Financial Year end, with Department, Designation and Status filters.', needsMonth:false, needsExpFilters:true, category:'yearly'},
  {key:'pf',         icon:'landmark', title:'PF Report (Yearly)',            desc:'Yearly consolidated PF summary — one row per employee, month-wise Total PF plus Employee/Employer/Total PF for the Financial Year.', needsMonth:false, needsFY:true, category:'yearly'},
  {key:'esiYearly',  icon:'heart-pulse', title:'ESI Report (Yearly)',           desc:'Yearly consolidated ESI summary — one row per employee, month-wise Total ESI plus Employee/Employer/Total ESI for the Financial Year.', needsMonth:false, needsFY:true, category:'yearly'},
  {key:'bonus833',   icon:'gift', title:'Bonus Report @ 8.33%',          desc:'Statutory minimum bonus on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.0833, category:'yearly'},
  {key:'bonus15',    icon:'gift', title:'Bonus Report @ 15%',            desc:'Bonus @ 15% on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.15, category:'yearly'},
  {key:'bonus20',    icon:'gift', title:'Bonus Report @ 20%',            desc:'Statutory maximum bonus on eligible Basic Wages (₹7,000 ceiling) for a date range.', needsMonth:false, needsDateRange:true, bonusRate:0.20, category:'yearly'},
];
/* ---- The Reports page: 7 reports. Reports that were copies of each other (by unit / by contractor,
   month / year, three bonus rates, the employee lists) are one card each, with a choice inside the
   report (REPORT_FAMILIES → variants). Each variant is one of REPORTS_LIST above, unchanged — the
   same preview, PDF / print and Excel. ---- */
const REPORT_GROUPS = [
  {key:'monthly',   icon:'calendar',    label:'Monthly'},
  {key:'statutory', icon:'landmark',    label:'Statutory'},
  {key:'employees', icon:'users',       label:'Employees'},
];
const REPORT_FAMILIES = [
  {key:'salary', group:'monthly', icon:'receipt', title:'Salary Register', asks:'Pick a month',
    desc:'Every employee\'s pay for a month — by contractor (with each contractor\'s service charge), by unit, or one full list.',
    label:'Group by', variants:[{key:'contractor',label:'Contractor'},{key:'unit',label:'Unit'},{key:'print',label:'One full list'}]},
  {key:'acquittance', group:'monthly', icon:'pen-line', title:'Salary Acquittance Register', asks:'Pick a month',
    desc:'A4 register for employee signatures — by contractor or by unit, with page totals and grand totals.',
    label:'By', variants:[{key:'acquittanceContractor',label:'Contractor'},{key:'acquittance',label:'Unit'}]},
  {key:'attendance', group:'monthly', icon:'calendar-days', title:'Attendance & OT Register', asks:'Pick a month',
    desc:'Per employee: Present, Half Day, LOP, NOPH, Paid Days, OT hours & amount, late minutes & deduction, canteen tokens and advance.',
    variants:[{key:'attendanceRegister'}]},
  {key:'pf', group:'statutory', icon:'landmark', title:'PF Report', asks:'Pick a month or a financial year', noVariantList:true,
    desc:'Employee-wise PF — Employee, Employer and Total PF, for a month or a whole financial year.',
    label:'Period', variants:[{key:'pfMonthly',label:'Month'},{key:'pf',label:'Financial year'}]},
  {key:'esi', group:'statutory', icon:'heart-pulse', title:'ESI Report', asks:'Pick a month or a financial year', noVariantList:true,
    desc:'Employee-wise ESI — Employee, Employer and Total ESI, for a month or a whole financial year.',
    label:'Period', variants:[{key:'esi',label:'Month'},{key:'esiYearly',label:'Financial year'}]},
  {key:'bonus', group:'statutory', icon:'gift', title:'Bonus Report', asks:'Pick a date range',
    desc:'Bonus on eligible Basic Wages (₹7,000 ceiling) for a date range — at 8.33% (statutory minimum), 15% or 20% (maximum).',
    label:'Rate', variants:[{key:'bonus833',label:'8.33%'},{key:'bonus15',label:'15%'},{key:'bonus20',label:'20%'}]},
  {key:'employees', group:'employees', icon:'users', title:'Employee List', asks:'Opens straight away',
    desc:'Active employees, resigned employees, headcount by department, or age & company experience.',
    label:'Show', variants:[{key:'employee',label:'Active'},{key:'resignedEmp',label:'Resigned'},{key:'department',label:'By department'},{key:'experience',label:'Age & experience'}]},
];
function repFamilyOf(key){ return REPORT_FAMILIES.find(f=>f.variants.some(v=>v.key===key)) || null; }
const repLastVariant={}; // family → the variant chosen last (opening the card again shows it)
function renderReports(){
  return reportView ? renderReportDetail(reportView) : renderReportsList();
}
function renderReportsList(){
  return REPORT_GROUPS.map(g=>{
    const list=REPORT_FAMILIES.filter(f=>f.group===g.key);
    return `
    <div class="panel repCatPanel">
      <h3>${ico(g.icon)} ${g.label}</h3>
      <div class="reportGrid">
        ${list.map(f=>`
          <div class="reportCard" data-family="${f.key}" role="button" tabindex="0" onclick="openReportFamily('${f.key}')" onkeydown="if(event.key==='Enter')openReportFamily('${f.key}')">
            <div class="reportCardIcon">${ico(f.icon)}</div>
            <div class="reportCardBody">
              <div class="reportCardTitle">${f.title}</div>
              <div class="reportCardDesc">${f.desc}</div>
              <div class="reportCardMeta">${ico(f.asks.startsWith('Opens')?'file-text':f.asks==='Pick a month'?'calendar':'calendar-range')} ${f.asks}${f.variants.length>1&&!f.noVariantList?` · ${f.variants.map(v=>v.label).join(' / ')}`:''}</div>
            </div>
            <div class="reportCardArrow">›</div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}
function openReportFamily(fk){
  const f=REPORT_FAMILIES.find(x=>x.key===fk); if(!f) return;
  openReport(repLastVariant[fk] || f.variants[0].key);
}
// The choice inside a report (Group by / By / Period / Rate / Show).
function repSetVariant(key){ const f=repFamilyOf(key); if(f) repLastVariant[f.key]=key; reportView=key; render('reports'); }
function repVariantsHtml(key){
  const f=repFamilyOf(key); if(!f || f.variants.length<2) return '';
  return `<div class="repVariants" role="group" aria-label="${f.label}"><span class="repVarLbl">${f.label}</span>${f.variants.map(v=>`<button type="button" class="attTab ${v.key===key?'active':''}" aria-pressed="${v.key===key}" onclick="repSetVariant('${v.key}')">${v.label}</button>`).join('')}</div>`;
}
function openReport(key){ reportView=key; render('reports'); }
function repShiftMonth(d){ payMonth=nextMonthKey(payMonth, d); render('reports'); }
function closeReport(){ reportView=null; render('reports'); }
function renderReportDetail(key){
  const meta=REPORTS_LIST.find(r=>r.key===key);
  if(!meta){ reportView=null; return renderReportsList(); }
  let previewHtml='', hasData=true;
  // Figures for the slim strip above the preview: [value, label, highlighted?] — from the same rows the preview shows.
  let figs=[];
  let aboveHtml='';   // shown above the preview (Contractor-wise Report: service charge by contractor)
  const N=v=>Math.round((Number(v)||0)*100)/100, sumK=(rows,k)=>N(rows.reduce((t,r)=>t+(Number(r[k])||0),0));
  if(key==='employee'){ const rows=employeeReportRows(); previewHtml=tableFromRows(rows);
    figs=[[rows.length,'Employees'],[rows.filter(r=>r.Status==='Active').length,'Active'],[rows.filter(r=>r.Status!=='Active').length,'Inactive']]; }
  else if(key==='resignedEmp'){ const rows=resignedReportRows(); previewHtml=tableFromRows(rows); figs=[[rows.length,'Resigned employees']]; }
  else if(key==='department'){ const rows=departmentReportRows(); previewHtml=tableFromRows(rows);
    figs=[[rows.length,'Departments'],[sumK(rows,'Employees'),'Employees (active)'],[rows.filter(r=>!r.Employees).length,'Empty departments']]; }
  else if(key==='experience'){
    const rows=experienceReportRows(expFY, expDept, expDesig, expStatus);
    figs=[[rows.length,'Employees'],[expFY,'Financial year']];
    if(!rows.length){ previewHtml='<div class="empty">No employees match the selected filters.</div>'; hasData=false; }
    else previewHtml=tableFromRows(rows);
  }
  else if(meta.needsDateRange){
    if(bonusFromDate>bonusToDate){ previewHtml='<div class="empty">"From Date" cannot be after "To Date".</div>'; hasData=false; }
    else{
      const {rows,months,grandTotal}=bonusReportRows(meta.bonusRate,bonusFromDate,bonusToDate);
      figs=[[rows.length,'Employees'],[months.filter(payrollGenerated).length+' of '+months.length,'Months with payroll'],[fmt(sumK(rows,'Bonus Eligible Basic Wages')),'Eligible basic wages'],[fmt(grandTotal),'Bonus amount',1]];
      if(!rows.length){ previewHtml='<div class="empty">No payroll records found for employees in the selected period.</div>'; hasData=false; }
      else previewHtml=bonusTableHtml(rows,months,grandTotal);
    }
  }
  else if(key==='esi'){
    if(!payrollGenerated(payMonth)){ previewHtml='<div class="empty">'+ico('alert')+' No ESI Contribution Found — payroll has not been generated for '+monthLabel(payMonth)+' yet.</div>'; hasData=false; }
    else{
      const rows=esiReportRows(payMonth);
      figs=[[rows.length,'Employees'],[fmt(sumK(rows,'ESI Wages')),'ESI wages'],[fmt(sumK(rows,'ESI Employee Contribution')),'Employee share'],[fmt(sumK(rows,'ESI Employer Contribution')),'Employer share'],[fmt(sumK(rows,'Total ESI Contribution')),'Total ESI',1]];
      if(!rows.length){ previewHtml='<div class="empty">'+ico('alert')+' No ESI Contribution Found for '+monthLabel(payMonth)+'.</div>'; hasData=false; }
      else previewHtml=esiReportTableHtml(rows);
    }
  }
  else if(key==='esiYearly'){
    const {rows,months,grandTotal}=esiYearlyReportRows(yearlyFY);
    figs=[[rows.length,'Employees'],[months.length,'Months processed'],[fmt(grandTotal.employee),'Employee share'],[fmt(grandTotal.employer),'Employer share'],[fmt(grandTotal.all),'Total ESI',1]];
    if(!rows.length){ previewHtml='<div class="empty">'+ico('alert')+' No ESI Contribution Found for Financial Year '+yearlyFY+'.</div>'; hasData=false; }
    else previewHtml=esiYearlyReportTableHtml(rows,months,grandTotal);
  }
  else if(key==='pfMonthly'){
    if(!payrollGenerated(payMonth)){ previewHtml='<div class="empty">'+ico('alert')+' No PF Contribution Found — payroll has not been generated for '+monthLabel(payMonth)+' yet.</div>'; hasData=false; }
    else{
      const rows=pfMonthlyReportRows(payMonth);
      figs=[[rows.length,'Employees'],[fmt(sumK(rows,'PF Wages')),'PF wages'],[fmt(sumK(rows,'PF Employee Contribution')),'Employee share'],[fmt(sumK(rows,'PF Employer Contribution')),'Employer share'],[fmt(sumK(rows,'Total PF Contribution')),'Total PF',1]];
      if(!rows.length){ previewHtml='<div class="empty">'+ico('alert')+' No PF Contribution Found for '+monthLabel(payMonth)+'.</div>'; hasData=false; }
      else previewHtml=pfMonthlyReportTableHtml(rows);
    }
  }
  else if(key==='acquittanceContractor'){
    const res=acquittancePreviewHtml(payMonth, key);
    previewHtml=res.html; hasData=res.hasData;
  }
  else if(key==='acquittance'){
    const res=acquittancePreviewHtml(payMonth, key);
    previewHtml=res.html; hasData=res.hasData;
  }
  else if(key==='attendanceRegister'){
    if(!payrollGenerated(payMonth)){ previewHtml='<div class="empty">No payroll generated for this month yet.</div>'; hasData=false; }
    else{
      const rows=attendanceRegisterRows(payMonth);
      figs=[[rows.length,'Employees'],[sumK(rows,'Present'),'Present days'],[sumK(rows,'NOPH'),'NOPH days'],[sumK(rows,'LOP'),'LOP days'],[sumK(rows,'PaidDays'),'Paid days',1],[sumK(rows,'OTHrs'),'OT hours'],[sumK(rows,'LateMin'),'Late minutes']];
      if(!rows.length){ previewHtml='<div class="empty">No employees on the roll'+(attRegFilterText()?' for '+attRegFilterText():'')+' this month.</div>'; hasData=false; }
      else previewHtml=tableFromRows(rows,{totals:true});
    }
  }
  else if(key==='pf'){
    const {rows,months,grandTotal}=pfReportRows(yearlyFY);
    figs=[[rows.length,'Employees'],[months.length,'Months processed'],[fmt(grandTotal.employee),'Employee share'],[fmt(grandTotal.employer),'Employer share'],[fmt(grandTotal.all),'Total PF',1]];
    if(!rows.length){ previewHtml='<div class="empty">'+ico('alert')+' No PF Contribution Found — no payroll has been generated for Financial Year '+yearlyFY+' yet.</div>'; hasData=false; }
    else previewHtml=pfReportTableHtml(rows,months,grandTotal);
  }
  else{
    if(!payrollGenerated(payMonth)){ previewHtml='<div class="empty">No payroll generated for this month yet.</div>'; hasData=false; }
    else{
      const rows=payrollReportRows(payMonth);
      const groups=key==='unit'?new Set(rows.map(r=>r.UnitCode)).size:key==='contractor'?new Set(rows.map(r=>r.ContractorCode||'-')).size:0;
      figs=[...(groups?[[groups, key==='unit'?'Units':'Contractors']]:[]),[rows.length,'Employees'],[sumK(rows,'Present'),'Present days'],[sumK(rows,'PaidDays'),'Paid days'],[fmt(sumK(rows,'Earnings')),'Earnings'],[fmt(sumK(rows,'Deductions')),'Deductions'],[fmt(sumK(rows,'NetSalary')),'Net pay',1]];
      if(key==='contractor' && rows.length){
        const svc=repContractorSummary(payMonth);
        figs.splice(figs.length-1, 0, [fmt(N(svc.reduce((t,r)=>t+r.ServiceCharge,0))),'Service charge']);
        aboveHtml=repContractorSummaryHtml(svc);
      }
      if(!rows.length){ previewHtml='<div class="empty">No payroll records for this month.</div>'; hasData=false; }
      else previewHtml=tableFromRows(rows,{totals:true});
    }
  }
  const canPrint=hasPerm('reports','print');
  const canExport=hasPerm('reports','export');
  // Month with previous / next arrows (the month is shared with the Payroll screen), then the report's own filters.
  const filtersHtml=`
      ${meta.needsMonth ? `<span class="repMonth"><span class="repLbl">Month</span>
        <button class="btn secondary cbNav" onclick="repShiftMonth(-1)" title="Previous month" aria-label="Previous month">‹</button>
        <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('reports')" aria-label="Month">
        <button class="btn secondary cbNav" onclick="repShiftMonth(1)" title="Next month" aria-label="Next month">›</button></span>` : ''}
      ${meta.needsUnitFilter ? `
        <label style="font-size:12px;color:var(--muted);">Working Unit
          <select onchange="acqUnit=this.value;render('reports')">
            <option value="All" ${acqUnit==='All'?'selected':''}>All Units (each unit on its own pages)</option>
            ${unitOptionsHtml(acqUnit)}
          </select>
        </label>` : ''}
      ${meta.needsContractorFilter ? `
        <label style="font-size:12px;color:var(--muted);">Contractor
          <select onchange="acqContractor=this.value;render('reports')">
            <option value="All" ${acqContractor==='All'?'selected':''}>All Contractors (each on its own pages)</option>
            ${getContractors().map(c=>`<option value="${c.code}" ${acqContractor===c.code?'selected':''}>${c.name||c.code}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">Working Unit
          <select onchange="acqContractorUnit=this.value;render('reports')">
            <option value="All" ${acqContractorUnit==='All'?'selected':''}>All Units</option>
            ${unitOptionsHtml(acqContractorUnit)}
          </select>
        </label>` : ''}
      ${meta.needsAttRegFilters ? `
        <label style="font-size:12px;color:var(--muted);">Working Unit
          <select onchange="attRegUnit=this.value;render('reports')">
            <option value="All" ${attRegUnit==='All'?'selected':''}>All Units</option>
            ${unitOptionsHtml(attRegUnit)}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">Contractor
          <select onchange="attRegContractor=this.value;render('reports')">
            ${contractorFilterOptionsHtml(attRegContractor)}
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
            <option value="Inactive" ${expStatus==='Inactive'?'selected':''}>Inactive</option>
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
`;
  return `
  <div class="toolbar repTop">
    <div class="repTopRow">
      <div class="repTopL">
        <button class="btn secondary" onclick="closeReport()" title="Back to the list of reports">${ico('arrow-left')} Reports</button>
        <span class="cbSep"></span>
        <span class="repTitleIcon">${ico((repFamilyOf(key)||meta).icon)}</span>
        <div class="repTitle"><b>${(repFamilyOf(key)||meta).title}</b><small>${meta.desc}</small></div>
      </div>
      <div class="repActions">
      ${canPrint ? `<button class="btn" ${hasData?'':'disabled'} onclick="downloadReportPDF('${key}')">${ico('download')} Download PDF</button>` : ''}
      ${canPrint ? `<button class="btn secondary" ${hasData?'':'disabled'} onclick="downloadReportPDF('${key}')">${ico('printer')} Print</button>` : ''}
      ${canExport ? `<button class="btn secondary" ${hasData?'':'disabled'} onclick="downloadReportExcel('${key}')">${ico('file-spreadsheet')} Excel</button>` : ''}
      </div>
    </div>
    ${repVariantsHtml(key)}
    ${filtersHtml.trim()?`<div class="repFilters">${filtersHtml}</div>`:''}
  </div>
  ${hasData && figs.length ? `<div class="teStatRow repStrip">${figs.map(([v,l,k])=>`<div class="teStatBox${k?' repKey':''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
  <div class="panel repPanel">
    ${hasData?aboveHtml:''}
    <div class="reportPreview">${previewHtml}</div>
    ${meta.needsDateRange ? `<p class="syncNote">Bonus Eligible Basic Wages = actual sum of each month's Earnings → Basic Salary within the selected period (only months with generated payroll are included). For Bonus Amount, each month's Basic Salary is first capped at ${fmt(BONUS_CEILING)} (if Basic ≤ ${fmt(BONUS_CEILING)}, actual is used) and then summed and multiplied by ${(meta.bonusRate*100).toFixed(2).replace(/\.00$/,'')}%.</p>` : ''}
    ${meta.needsExpFilters ? `<p class="syncNote">Age and Company Experience are calculated as on ${fmtDate(fyEndDate(expFY))} (last day of Financial Year ${expFY}). Employees who joined after this date are excluded. Experience is shown in completed Years and Months.</p>` : ''}
    ${key==='acquittanceContractor' ? `<p class="syncNote">Same A4 Landscape register as the unit-wise one, with one section per contractor (each starting on a fresh page, at most ${ACQ_ROWS_PER_PAGE} employees per page, page totals and a contractor grand total). Pick a Working Unit to print only that contractor's employees in that unit.</p>` : ''}
    ${key==='acquittance' ? `<p class="syncNote">Printed on A4 Landscape so all 11 columns fit at full size with a signature column. Each page holds at most ${ACQ_ROWS_PER_PAGE} employees; larger units roll over to the next page with the same header. Every page shows its Page Total, and the last page of each unit shows the Unit Grand Total. Employees are listed in Emp ID order.</p>` : ''}
    ${key==='attendanceRegister' ? `<p class="syncNote">Live figures for ${monthLabel(payMonth)} from Attendance — every employee on the roll that month${attRegFilterText()?' ('+attRegFilterText()+')':''}. Present counts a Half Day as ½; LOP is the Loss of Pay days; Paid Days = Present + NOPH. Not Marked = days with no attendance entry yet. Late ₹ is charged on the Late Charged Minutes (after the free grace time).</p>` : ''}
    ${key==='esi' ? `<p class="syncNote">Figures are the actual ESI Employee and ESI Employer contributions processed in the ${monthLabel(payMonth)} payroll run. ESI Wages = Total Earnings (Basic + HRA + OT + Other Allowance); ESI = ESI Wages × the ESI rate, rounded. Only employees with ESI applicable and a contribution greater than ₹0 for the month are listed.</p>` : ''}
    ${key==='esiYearly' ? `<p class="syncNote">Yearly consolidated view for Financial Year ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]}) — one row per employee, with Total ESI for each processed month plus yearly Employee / Employer / Total ESI, built from the actual ESI figures processed in each month's payroll run. Only employees with an ESI contribution greater than ₹0 in at least one month of the year are listed.</p>` : ''}
    ${key==='pfMonthly' ? `<p class="syncNote">Figures are the actual PF Employee and PF Employer contributions processed in the ${monthLabel(payMonth)} payroll run. Every on-roll employee for the month is listed, including employees for whom PF is currently Exempted/Nil — they show ₹0 and will automatically show real contributions the moment PF is enabled for them.</p>` : ''}
    ${key==='pf' ? `<p class="syncNote">Yearly consolidated view for Financial Year ${yearlyFY} (Apr ${yearlyFY.split('-')[0]} – Mar ${yearlyFY.split('-')[1]}) — one row per employee, with Total PF for each processed month plus yearly Employee / Employer / Total PF, built from the actual PF figures processed in each month's payroll run. Every on-roll employee is listed, including employees for whom PF is currently Exempted/Nil — they show ₹0 and will automatically show real contributions the moment PF is enabled for them.</p>` : ''}
  </div>`;
}
function downloadReportPDF(key){
  if(!hasPerm('reports','print')){ alert('You do not have permission to print or download reports.'); return; }
  if(key==='employee') return printSimpleReport('Employee Report', employeeReportRows());
  if(key==='resignedEmp') return printSimpleReport('Resigned Employees Report', resignedReportRows());
  if(key==='department') return printSimpleReport('Department Report', departmentReportRows());
  if(key==='experience') return printSimpleReport('Employee Experience Report — FY '+expFY+' (as on '+fmtDate(fyEndDate(expFY))+')', experienceReportRows(expFY, expDept, expDesig, expStatus));
  if(key==='unit') return printPayrollReport('unit');
  if(key==='contractor') return printPayrollReport('contractor');
  if(key==='acquittance' || key==='acquittanceContractor') return printAcquittanceReport(key);
  if(key==='print') return printGeneralPayrollReport();
  if(key==='attendanceRegister'){
    if(!payrollGenerated(payMonth)){ alert('Generate payroll first.'); return; }
    const rows=attendanceRegisterRows(payMonth);
    return printSimpleReport('Attendance & OT Register — '+monthLabel(payMonth)+(attRegFilterText()?' — '+attRegFilterText():''), rows, {totals:true, orientation:'landscape', compact:true});
  }
  if(key==='esi') return printESIReport();
  if(key==='esiYearly') return printESIYearlyReport();
  if(key==='pfMonthly') return printPFMonthlyReport();
  if(key==='pf') return printPFReport();
  const meta=REPORTS_LIST.find(r=>r.key===key);
  if(meta && meta.needsDateRange) return printBonusReport(meta);
}
/* ---- Contractor service charge (Contractor-wise Report) ----
   The same figures as Contractors Bill → Company Payable (cbContractorRows): service charge = the
   contractor's rate × the FULL Present days its employees worked. NOPH (paid holidays), Half Days and
   absent days are not counted — NOPH is paid to the employee in the salary only. */
function repContractorSummary(ym){
  return cbContractorRows(ym).filter(r=>r.empCount).map(r=>({Contractor:r.c.name||r.c.code, Code:r.c.code, Employees:r.empCount, PresentDays:r.days, NOPH:r.noph,
    NetPay:r.net, RatePerDay:r.rate, ServiceCharge:r.commission, TotalPayable:r.total}));
}
function repContractorSummaryHtml(rows){
  if(!rows.length) return '';
  const sum=k=>Math.round(rows.reduce((t,r)=>t+(+r[k]||0),0)*100)/100;
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return `<div class="repSvc">
    <div class="repSvcHead"><b>${ico('users')} Service charge by contractor</b><span>Rate × full <b>Present</b> days only. NOPH (paid holidays), Half Days and absent days are not counted — NOPH is paid in the employee's salary.</span></div>
    <div class="cbScroll"><table class="cbTable">
      <thead><tr><th>Contractor</th><th class="num">Employees</th><th class="num" title="Full Present days (a Half Day is not counted)">Full Present Days</th><th class="num" title="Paid holidays — paid in the salary, not counted for the service charge">NOPH (not counted)</th><th class="num">Salary (Net Pay)</th><th class="num">Rate / Day</th><th class="num">Service Charge</th><th class="num">Total Payable</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td><b>${esc(r.Contractor)}</b></td><td class="num">${r.Employees}</td><td class="num">${r.PresentDays}</td><td class="num">${r.NOPH}</td><td class="num">${fmt(r.NetPay)}</td><td class="num">₹${r.RatePerDay}</td><td class="num"><b>${fmt(r.ServiceCharge)}</b></td><td class="num"><b>${fmt(r.TotalPayable)}</b></td></tr>`).join('')}
      <tr class="cbTotal"><td>Total — all contractors</td><td class="num">${sum('Employees')}</td><td class="num">${sum('PresentDays')}</td><td class="num">${sum('NOPH')}</td><td class="num">${fmt(sum('NetPay'))}</td><td></td><td class="num">${fmt(sum('ServiceCharge'))}</td><td class="num">${fmt(sum('TotalPayable'))}</td></tr></tbody>
    </table></div>
  </div>`;
}
/* ---- Attendance & OT Register (Monthly) — live from payrollMonthRecords ---- */
function attRegFilterText(){
  const parts=[];
  if(attRegUnit && attRegUnit!=='All') parts.push(unitLabel(attRegUnit));
  if(attRegContractor) parts.push(attRegContractor==='-' ? 'Contractor not set' : (contractorName(attRegContractor)||attRegContractor));
  return parts.join(' · ');
}
// Payroll records of a month for the employees matching a unit ('All' or a code) and contractor
// ('' = all, '-' = none, or a code) filter — unit / contractor taken from the current employee.
function payrollRecordsFiltered(ym, unit, contractor){
  return (payrollMonthRecords(ym)||[]).filter(r=>{
    const e=db.employees.find(x=>x.code===r.code)||{unit:r.unit, contractor:r.contractor};
    return (!unit || unit==='All' || unitCodeOf(e.unit)===unit) && contractorFilterMatches(e, contractor);
  });
}
function attendanceRegisterRows(ym){
  const n=v=>Number(v)||0;
  return payrollRecordsFiltered(ym, attRegUnit, attRegContractor).map(r=>{
    const e=db.employees.find(x=>x.code===r.code);
    return {Code:r.code, Name:(e&&e.name)||r.name||'-', Unit:unitLabel(e?e.unit:r.unit), Contractor:contractorName(e?(e.contractor||''):(r.contractor||''))||'-',
      NOWD:n(r.nowd), WeekOff:payWeekOff(r, ym), Present:payPresentDays(r), HalfDay:n(r.halfDayCount), LOP:n(r.lopDays), NOPH:n(r.holidayDays), NotMarked:n(r.unmarkedDays), PaidDays:n(r.daysWorking),
      OTHrs:n(r.otHours), OTAmount:n(r.otAmount), LateMin:n(r.lateMinutes), LateChargedMin:n(r.lateChargedMinutes), LateAmount:n(r.lateDeduction),
      CanteenTokens:n(r.canteenTokens), CanteenAmount:n(r.canteen), AdvanceAmount:n(r.advance)};
  });
}
/* ---- Download Excel from the report viewer ---- */
// Excel spec built straight from a preview's rows array (columns = the row keys).
function reportRowsExcelSpec(title, rows, opts){
  opts=opts||{};
  if(!rows || !rows.length) return null;
  const cols=Object.keys(rows[0]).map(k=>{
    const isNum=rows.some(r=>typeof r[k]==='number');
    const type=isNum ? (REPORT_MONEY_KEYS.includes(k) ? 'money' : 'number') : 'text';
    return {header:reportColLabel(k), key:k, type, width:type==='text' ? Math.min(30, Math.max(10, reportColLabel(k).length+2)) : 12, noTotal:REPORT_NO_TOTAL_KEYS.includes(k)};
  });
  return {
    fileName:`${companyFilePrefix()}-${title.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}${opts.period?'-'+opts.period:''}.xlsx`,
    sheets:[{name:opts.sheetName||title, title:`${db.companyName||''} — ${title}`, subtitle:opts.subtitle||'', columns:cols, rows, totals:!!opts.totals}]
  };
}
// Payroll register sheets for the payroll-type reports: one sheet with everyone, plus one sheet per
// unit / contractor (same grouping as the PDF). Unit / contractor come from
// the current employee record.
function payrollReportExcelSpec(key){
  const recs=payrollMonthRecords(payMonth)||[];
  if(!recs.length) return null;
  const rows=recs.map(payrollRegisterRow);
  const cols=payrollRegisterColumns();
  const ml=monthLabel(payMonth);
  const sheet=(name, list, subtitle)=>({name, title:`${db.companyName||''} — Payroll Register — ${ml}`, subtitle, columns:cols, rows:list, totals:true});
  const sheets=[sheet('All Employees', rows, 'All units · All contractors')];
  const empOf=r=>db.employees.find(x=>x.code===r.code)||{unit:r.unit, contractor:r.contractor};
  let label='Payroll-Report';
  if(key==='unit'){
    label='Unit-wise-Payroll';
    getUnits().forEach(u=>{ const list=rows.filter(r=>unitCodeOf(empOf(r).unit)===u.code); if(list.length) sheets.push(sheet(u.code, list, unitDisplayName(u))); });
  } else if(key==='contractor'){
    label='Contractor-wise-Payroll';
    sheets.push({name:'Service Charge', title:`${db.companyName||''} — Contractor Service Charge — ${ml}`,
      subtitle:'Service charge = rate × full Present days only (NOPH, Half Days and absent days not counted)',
      columns:[{header:'Contractor', key:'Contractor', width:28},{header:'Employees', key:'Employees', type:'number'},{header:'Full Present Days', key:'PresentDays', type:'number'},
        {header:'NOPH (not counted)', key:'NOPH', type:'number'},{header:'Salary (Net Pay)', key:'NetPay', type:'money'},{header:'Rate / Day', key:'RatePerDay', type:'money', noTotal:true},
        {header:'Service Charge', key:'ServiceCharge', type:'money'},{header:'Total Payable', key:'TotalPayable', type:'money'}],
      rows:repContractorSummary(payMonth), totals:true});
    getContractors().forEach(c=>{ const list=rows.filter(r=>contractorFilterMatches(empOf(r), c.code)); if(list.length) sheets.push(sheet(c.name||c.code, list, 'Contractor: '+(c.name||c.code))); });
    const none=rows.filter(r=>!getContractors().some(c=>c.code===(empOf(r).contractor||'')));
    if(none.length) sheets.push(sheet('Contractor not set', none, 'Contractor not set'));
  }
  return {fileName:`${companyFilePrefix()}-${label}-${ml}.xlsx`, sheets};
}
function downloadReportExcel(key){
  if(!hasPerm('reports','export')){ alert('You do not have permission to export reports.'); return; }
  const meta=REPORTS_LIST.find(r=>r.key===key);
  if(!meta) return;
  if(typeof window.downloadExcel!=='function'){ alert('Excel export is not available right now. Please reload the page and try again.'); return; }
  const ml=monthLabel(payMonth);
  const call=(fnName, ...args)=>{
    const fn=window[fnName];
    if(typeof fn!=='function'){ alert('Excel export is not available for this report yet.'); return undefined; }
    return fn(...args);
  };
  let spec=null;
  if(meta.needsMonth && !payrollGenerated(payMonth)){ alert('Generate payroll first.'); return; }
  if(key==='unit' || key==='contractor' || key==='print') spec=payrollReportExcelSpec(key);
  else if(key==='acquittance' || key==='acquittanceContractor'){
    if(typeof window.acquittanceExcel==='function') return window.acquittanceExcel(key);
    spec=call('acquittanceExcelSpec', key); if(spec===undefined) return;
  }
  else if(key==='esi'){ spec=call('esiExcelSpec'); if(spec===undefined) return; }
  else if(key==='esiYearly'){ spec=call('esiYearlyExcelSpec'); if(spec===undefined) return; }
  else if(key==='pfMonthly'){ spec=call('pfMonthlyExcelSpec'); if(spec===undefined) return; }
  else if(key==='pf'){ spec=call('pfYearlyExcelSpec'); if(spec===undefined) return; }
  else if(meta.needsDateRange){ spec=call('bonusExcelSpec', meta); if(spec===undefined) return; }
  else if(key==='attendanceRegister'){
    const f=attRegFilterText();
    spec=reportRowsExcelSpec('Attendance & OT Register', attendanceRegisterRows(payMonth), {period:ml+(f?'-'+f.replace(/[^A-Za-z0-9]+/g,'-'):''), sheetName:'Attendance OT '+ml, subtitle:ml+(f?' · '+f:' · All units · All contractors'), totals:true});
  }
  else if(key==='employee') spec=reportRowsExcelSpec('Employee Report', employeeReportRows(), {period:todayStr()});
  else if(key==='resignedEmp') spec=reportRowsExcelSpec('Resigned Employees Report', resignedReportRows(), {period:todayStr()});
  else if(key==='department') spec=reportRowsExcelSpec('Department Report', departmentReportRows(), {period:todayStr(), totals:true});
  else if(key==='experience') spec=reportRowsExcelSpec('Employee Experience Report', experienceReportRows(expFY, expDept, expDesig, expStatus), {period:'FY-'+expFY, sheetName:'Experience FY '+expFY, subtitle:'FY '+expFY+' (as on '+fmtDate(fyEndDate(expFY))+')'});
  if(!spec){ alert('No data to export.'); return; }
  return window.downloadExcel(spec);
}
