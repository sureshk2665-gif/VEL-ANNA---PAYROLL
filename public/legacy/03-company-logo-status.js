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
   localStorage and applied at startup; with nothing cached a plain "Payroll" title and no logo
   are shown (never another company's name/logo). */
const BRANDING_CACHE_KEY='vipl_company_branding'; // storage key only — never shown
const DEFAULT_BRAND_NAME='Payroll';
function applyCompanyBranding(){
  const sideImg=document.querySelector('.sidebarBrand img');
  const sideName=document.querySelector('.sidebarBrand h2');
  const loginImg=document.getElementById('loginLogo');
  const loginName=document.querySelector('.loginTitle');
  let brand=null;
  if(currentUser){
    // Signed in: the saved company details are authoritative — remember them for the login screen.
    brand={ name:db.companyName||'', logo:db.companyLogo||'' };
    try{
      const prev=JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)||'{}');
      if(prev && prev.logo===brand.logo){ brand.accent=prev.accent; brand.accentFor=prev.accentFor; }
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(brand));
    }catch(e){}
  }else{
    try{ brand=JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)||'null'); }catch(e){ brand=null; }
  }
  const name=(brand && brand.name) || DEFAULT_BRAND_NAME;
  const logo=(brand && brand.logo) || '';
  if(sideName) sideName.textContent=name;
  if(loginName) loginName.textContent=name;
  document.querySelectorAll('.brandName').forEach(el=>{ el.textContent=name; }); // other places (login page)
  // No company logo → hide the logo badge instead of showing a placeholder.
  [sideImg, loginImg, ...document.querySelectorAll('img.brandLogo')].forEach(img=>{
    if(!img) return;
    if(logo){ img.src=logo; img.alt=name+' Logo'; } else img.removeAttribute('src');
    const badge=img.closest('.logoBadge');
    if(badge) badge.style.display = logo ? '' : 'none';
  });
  applyLogoAccent(logo, brand);
  let favicon=document.querySelector('link[rel="icon"]');
  if(logo){
    if(!favicon){ favicon=document.createElement('link'); favicon.rel='icon'; document.head.appendChild(favicon); }
    favicon.href=logo;
  }else if(favicon) favicon.remove();
  document.title=name;
}
/* ---- Highlight colour from the logo ----
   The UI accent (active menu item, buttons, focus rings, chips…) is taken from the company logo:
   its dominant saturated colour, darkened if needed so white text on it stays readable. A logo
   with no real colour (black/white/grey) keeps the default teal. The result is cached with the
   branding so the login screen shows it straight away. Screen only — printouts keep their own. */
let _accentFor=null;
function setUiAccent(hex){
  const b=document.body;
  if(hex){ b.style.setProperty('--accent', hex); b.classList.add('logoAccent'); }
  else { b.style.removeProperty('--accent'); b.classList.remove('logoAccent'); }
}
function applyLogoAccent(logo, brand){
  if(!logo){ _accentFor=null; setUiAccent(''); return; }
  if(brand && brand.accentFor===logo.length+':'+logo.slice(-32)){ setUiAccent(brand.accent||''); return; }
  const key=logo.length+':'+logo.slice(-32);
  if(_accentFor===key) return;
  _accentFor=key;
  const img=new Image();
  img.onload=()=>{
    let hex='';
    try{ hex=dominantLogoColor(img); }catch(e){ hex=''; }
    if(_accentFor!==key) return; // a newer logo arrived meanwhile
    setUiAccent(hex);
    if(currentUser){
      try{
        const cached=JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)||'{}');
        cached.accent=hex; cached.accentFor=key;
        localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(cached));
      }catch(e){}
    }
  };
  img.src=logo;
}
function dominantLogoColor(img){
  const N=64, c=document.createElement('canvas'); c.width=N; c.height=N;
  const ctx=c.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(img,0,0,N,N);
  const px=ctx.getImageData(0,0,N,N).data;
  const buckets=new Array(24).fill(null).map(()=>({w:0,r:0,g:0,b:0}));
  for(let i=0;i<px.length;i+=4){
    if(px[i+3]<160) continue;
    const r=px[i]/255, g=px[i+1]/255, b=px[i+2]/255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2, d=max-min;
    if(d<0.12 || l>0.92 || l<0.08) continue; // white, black, grey
    const s=d/(1-Math.abs(2*l-1));
    if(s<0.28) continue;
    let h = max===r ? ((g-b)/d)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4;
    h=(h*60+360)%360;
    const k=buckets[Math.floor(h/15)], w=s*(1-Math.abs(l-0.5));
    k.w+=w; k.r+=px[i]*w; k.g+=px[i+1]*w; k.b+=px[i+2]*w;
  }
  const best=buckets.reduce((a,b)=>b.w>a.w?b:a);
  if(best.w<1) return ''; // no real colour in the logo
  let r=best.r/best.w, g=best.g/best.w, b=best.b/best.w;
  // Darken until white text on it has at least ~4.5:1 contrast.
  const lum=(r,g,b)=>[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  for(let n=0;n<30 && (1.05/(lum(r,g,b)+0.05))<4.5;n++){ r*=0.93; g*=0.93; b*=0.93; }
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}
// File-name prefix from the company name ("MF GROUP & CONTRACTORS" → "MF-GROUP-CONTRACTORS"),
// used for downloaded backups and the Excel template.
function companyFilePrefix(){
  return String(db.companyName||'').trim().replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || DEFAULT_BRAND_NAME;
}

// Attendance module supports exactly these 4 manually-selectable statuses.
// 'NOPH' is a separate, auto-applied status driven by the Holiday Calendar
// (Payroll → Payroll Process) — it is never manually selectable, only shown/locked.
// No NOPL (paid leave): contractor employees get no paid leave, so an absent day is Loss Of Pay.
const STATUS_LIST=['Present','HalfDay','LossOfPay'];
const STATUS_LABEL={Present:'Present',HalfDay:'Half Day',LossOfPay:'Loss Of Pay',NOPH:'NOPH'};
const PAID_STATUSES=['Present','NOPH'];

