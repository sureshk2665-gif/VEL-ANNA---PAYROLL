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
    applyCompanyBranding();
    render('softwareadmin');
  };
  reader.readAsDataURL(file);
}
function removeCompanyLogo(){
  if(!confirm('Remove the company logo? It will no longer appear on printed slips and reports.')) return;
  db.companyLogo='';
  saveDB(db);
  applyCompanyBranding();
  render('softwareadmin');
}

/* ================= COMPANY BRANDING (app shell) =================
   Shows the Company Name + Logo saved in Software Admin in the sidebar, on the login screen, in
   the browser tab title and as the tab icon — for every user. The login screen is shown before
   any data can be read (RLS), so the last-seen name/logo is also kept in this browser's
   localStorage and applied at startup; with nothing cached the built-in VIPL name/logo is used. */
const BRANDING_CACHE_KEY='vipl_company_branding';
let _defaultBranding=null;
function applyCompanyBranding(){
  const sideImg=document.querySelector('.sidebarBrand img');
  const sideName=document.querySelector('.sidebarBrand h2');
  const loginImg=document.getElementById('loginLogo');
  const loginName=document.querySelector('.loginTitle');
  const favicon=document.querySelector('link[rel="icon"]');
  if(!_defaultBranding){
    _defaultBranding={ name:(sideName&&sideName.textContent)||document.title, logo:(sideImg&&sideImg.getAttribute('src'))||'' };
  }
  let brand=null;
  if(currentUser){
    // Signed in: the saved company details are authoritative — remember them for the login screen.
    brand={ name:db.companyName||'', logo:db.companyLogo||'' };
    try{ localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(brand)); }catch(e){}
  }else{
    try{ brand=JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)||'null'); }catch(e){ brand=null; }
  }
  const name=(brand && brand.name) || _defaultBranding.name;
  const logo=(brand && brand.logo) || _defaultBranding.logo;
  if(sideName) sideName.textContent=name;
  if(loginName) loginName.textContent=name;
  [sideImg, loginImg].forEach(img=>{ if(img){ img.src=logo; img.alt=name+' Logo'; } });
  if(favicon) favicon.href=logo;
  document.title=name;
}

// Attendance module supports exactly these 4 manually-selectable statuses.
// 'NOPH' is a separate, auto-applied status driven by the Holiday Calendar
// (Payroll → Payroll Process) — it is never manually selectable, only shown/locked.
const STATUS_LIST=['Present','HalfDay','LossOfPay','PaidLeave'];
const STATUS_LABEL={Present:'Present',HalfDay:'Half Day',LossOfPay:'Loss Of Pay',PaidLeave:'NOPL',NOPH:'NOPH'};
const PAID_STATUSES=['Present','NOPH','PaidLeave'];

