/* ================= NAV ================= */
document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click',()=>{
    if(el.dataset.page==='reports') reportView=null; // always land on the report list from the sidebar
    render(el.dataset.page);
  });
});
function setActiveNav(page){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.page===page));
}
function render(page){
  if(!canOpenModule(page)){
    // No view permission for this module: bounce to the first module the user CAN open.
    const fallback=PERMISSION_MODULES.map(m=>m.key).find(k=>canOpenModule(k));
    if(fallback && fallback!==page){ render(fallback); return; }
  }
  setActiveNav(page);
  const titles={dashboard:'Dashboard',employees:'Employees',resigned:'Resigned Employees',departments:'Departments',attendance:'Attendance',timeentry:'Employee Time Entry',payroll:'Payroll',payrollprocess:'Payroll Process',increment:'Annual Increment',salaryadvance:'Salary Advance',reports:'Reports',settings:'Admin',softwareadmin:'Software Admin'};
  const subtitles={dashboard:"Welcome back — here's today's snapshot",employees:'Search, add and manage your workforce',resigned:'Employees who have resigned — rejoin them to restore full access',departments:'Organize employees into departments',attendance:'Fast, full-screen monthly attendance entry',timeentry:'Standalone employee time entry & holiday booking — view and print only, separate from Payroll',payroll:'Process salaries and generate payslips',payrollprocess:'Payroll processing rules — working days, paid holidays, paid leave and other payroll constants',increment:'Record yearly salary increments by Financial Year and keep full history',salaryadvance:'Issue employee advances and auto-manage monthly recovery',reports:'Open a report, then download it as PDF or print it',settings:'Change your password, manage normal user accounts, and go to Payroll Process for payroll constants',softwareadmin:'Company details, automatic backup scheduler and full user rights / admin management — Software Admin only'};
  document.getElementById('pageTitle').textContent=titles[page];
  const subEl=document.getElementById('pageSubtitle'); if(subEl) subEl.textContent=subtitles[page]||'';
  const mainPanel=document.getElementById('mainPanel');
  if(mainPanel) mainPanel.classList.toggle('fullScreenPage', page==='attendance');
  const body=document.getElementById('pageBody');
  if(!canOpenModule(page)){
    body.innerHTML=denyMsg('view this page',titles[page]||page);
    return;
  }
  if(page==='dashboard') body.innerHTML=renderDashboard();
  if(page==='employees') body.innerHTML=renderEmployees();
  if(page==='resigned') body.innerHTML=renderResigned();
  if(page==='departments') body.innerHTML=renderDepartments();
  if(page==='attendance') body.innerHTML=renderAttendance();
  if(page==='timeentry') body.innerHTML=renderTimeEntry();
  if(page==='payroll') body.innerHTML=renderPayroll();
  if(page==='payrollprocess') body.innerHTML=renderPayrollProcess();
  if(page==='increment') body.innerHTML=renderIncrement();
  if(page==='salaryadvance') body.innerHTML=renderSalaryAdvance();
  if(page==='reports') body.innerHTML=renderReports();
  if(page==='settings') body.innerHTML=renderSettings();
  if(page==='softwareadmin') body.innerHTML=isSoftwareAdmin() ? renderSoftwareAdmin() : denyMsg('view this page','Software Admin');
}
function refreshNavVisibility(){
  document.querySelectorAll('.nav-item').forEach(el=>{
    const page=el.dataset.page;
    el.style.display = canOpenModule(page) ? '' : 'none';
  });
}

