/* ================= COMPANY LOGO (Admin) =================
   One logo, stored once as a base64 data URL in db.companyLogo, reused everywhere the
   company header is printed — Salary Slips, Payroll/Attendance Reports, etc. Change it
   once in Admin and it reflects across all printed output immediately. */
function companyLogoImgHtml(maxHeight){
  if(!db.companyLogo) return '';
  return `<img src="${db.companyLogo}" alt="Company Logo" style="height:${maxHeight||32}px;max-width:100px;object-fit:contain;flex-shrink:0;">`;
}
function uploadCompanyLogo(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }
  if(file.size > 1024*1024*2){ alert('Please choose an image under 2MB.'); return; }
  const reader = new FileReader();
  reader.onload = function(e){
    db.companyLogo = e.target.result;
    saveDB(db);
    render('softwareadmin');
  };
  reader.readAsDataURL(file);
}
function removeCompanyLogo(){
  if(!confirm('Remove the company logo? It will no longer appear on printed slips and reports.')) return;
  db.companyLogo='';
  saveDB(db);
  render('softwareadmin');
}

// Attendance module supports exactly these 4 manually-selectable statuses.
// 'NOPH' is a separate, auto-applied status driven by the Holiday Calendar
// (Payroll → Payroll Process) — it is never manually selectable, only shown/locked.
const STATUS_LIST=['Present','HalfDay','LossOfPay','PaidLeave'];
const STATUS_LABEL={Present:'Present',HalfDay:'Half Day',LossOfPay:'Loss Of Pay',PaidLeave:'NOPL',NOPH:'NOPH'};
const PAID_STATUSES=['Present','NOPH','PaidLeave'];

