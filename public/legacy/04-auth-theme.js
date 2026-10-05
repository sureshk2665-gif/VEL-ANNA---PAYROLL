/* ================= AUTH ================= */
const SESSION_KEY='hrms_session_v1';
let currentUser=null;
// 4-digit passcode/OTP login-verification state (see attemptLogin() / attemptOtpVerify()) —
// holds the user record that already passed the Username+Password check and the OTP it must
// still enter before currentUser is actually set / the LoginLog record is created. Cleared the
// moment verification succeeds, is retried, or the person clicks "← Back".
let pendingOtpUser=null;
let pendingOtpCode='';
// The LoginLog record ("session") id for the currently signed-in user, so logout() knows
// exactly which row to close out with a Logout Time + Session Duration. Also persisted inside
// the sessionStorage session (see attemptOtpVerify() / the DOMContentLoaded restore below) so a
// page reload can still find and close the right row later, without re-prompting for the OTP.
let currentLoginLogId=null;

function findUser(username,password){
  if(!Array.isArray(db.users)) return null;
  return db.users.find(u=>u.username.toLowerCase()===String(username||'').toLowerCase() && u.password===password) || null;
}
// "Xh Ym" session-duration formatter used by the LoginLog — given two ISO timestamps, returns
// the elapsed wall-clock time between them (never negative; a logout somehow recorded before
// its login simply reads "0m").
function fmtSessionDuration(loginIso, logoutIso){
  const start=new Date(loginIso), end=new Date(logoutIso);
  if(isNaN(start) || isNaN(end)) return '';
  const mins=Math.max(0, Math.round((end-start)/60000));
  const h=Math.floor(mins/60), m=mins%60;
  return h>0 ? `${h}h ${m}m` : `${m}m`;
}
function attemptLogin(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  const user=findUser(u,p);
  if(!user){ err.textContent='Invalid username or password.'; return; }
  if(user.active===false){ err.textContent='This account has been deactivated. Contact your Administrator.'; return; }
  // Username + Password are correct, but the dashboard is NOT granted yet — a 4-digit
  // passcode/OTP must also be entered correctly first (see attemptOtpVerify() below).
  err.textContent='';
  pendingOtpUser=user;
  goToOtpStep();
}
// Generates a fresh random 4-digit code (1000–9999, so it's always exactly 4 digits) and shows
// the OTP entry step. Since this app has no SMS/Email gateway configured to actually deliver a
// code, the generated code is surfaced directly on-screen so the feature is fully usable
// end-to-end rather than silently blocking sign-in on an undeliverable code.
function goToOtpStep(){
  pendingOtpCode=String(Math.floor(1000+Math.random()*9000));
  document.getElementById('loginStepCreds').style.display='none';
  document.getElementById('loginStepOtp').style.display='block';
  document.getElementById('otpForUser').textContent=pendingOtpUser.name||pendingOtpUser.username;
  document.getElementById('otpDemoNote').textContent=`Demo Mode — no SMS/Email gateway configured. Your code: ${pendingOtpCode}`;
  const otpErr=document.getElementById('otpErr'); if(otpErr) otpErr.textContent='';
  const otpEl=document.getElementById('loginOtp');
  if(otpEl){ otpEl.value=''; otpEl.focus(); }
}
// Re-generates and re-shows a new 4-digit code for the same pendingOtpUser, without going back
// to re-checking Username/Password.
function resendOtp(){
  if(!pendingOtpUser) return;
  goToOtpStep();
}
// Returns to the Username/Password step, discarding whatever code was generated — the person
// must re-enter valid credentials to get a new one.
function backToCredentialsStep(){
  pendingOtpUser=null;
  pendingOtpCode='';
  const stepOtp=document.getElementById('loginStepOtp'); if(stepOtp) stepOtp.style.display='none';
  const stepCreds=document.getElementById('loginStepCreds'); if(stepCreds) stepCreds.style.display='block';
  const otpErr=document.getElementById('otpErr'); if(otpErr) otpErr.textContent='';
  const uEl=document.getElementById('loginUser'); if(uEl) uEl.focus();
}
// Final gate: only once the 4-digit code entered here matches pendingOtpCode does currentUser
// actually get set and the dashboard become reachable. This is also the single point where a
// LoginLog "session" row is created — login_time is recorded exactly when access is granted,
// never earlier (so a wrong/abandoned OTP attempt never creates a stray log entry).
function attemptOtpVerify(){
  const otpEl=document.getElementById('loginOtp');
  const otpErr=document.getElementById('otpErr');
  const entered=(otpEl.value||'').trim();
  if(!pendingOtpUser || !pendingOtpCode){ backToCredentialsStep(); return; }
  if(entered.length!==4 || !/^\d{4}$/.test(entered)){
    otpErr.textContent='Please enter the 4-digit code.';
    return;
  }
  if(entered!==pendingOtpCode){
    otpErr.textContent='Incorrect code. Please try again.';
    otpEl.value=''; otpEl.focus();
    return;
  }
  otpErr.textContent='';
  currentUser=pendingOtpUser;
  // Create this session's LoginLog row — login_time is "now", logout_time/session_duration are
  // filled in only later by logout() when the person actually signs out.
  const logRow={ id:'LL'+Date.now()+Math.floor(Math.random()*1000), userId:currentUser.username, name:currentUser.name||currentUser.username,
    loginTime:new Date().toISOString(), logoutTime:'', sessionDuration:'' };
  if(!Array.isArray(db.loginLogs)) db.loginLogs=[];
  db.loginLogs.push(logRow);
  currentLoginLogId=logRow.id;
  saveDB(db);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({username:currentUser.username, loginLogId:logRow.id}));
  pendingOtpUser=null;
  pendingOtpCode='';
  otpEl.value='';
  showApp();
}
function showApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='block';
  const badge=document.getElementById('currentUserBadge');
  if(badge && currentUser) badge.textContent='👤 '+(currentUser.name||currentUser.username)+(currentUser.role?' ('+currentUser.role+')':'');
  refreshNavVisibility();
  const firstAllowed=PERMISSION_MODULES.map(m=>m.key).find(k=>canOpenModule(k))||'dashboard';
  render(firstAllowed);
}
function showLogin(){
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  backToCredentialsStep();
  const pf=document.getElementById('loginPass'); if(pf) pf.value='';
  const ef=document.getElementById('loginErr'); if(ef) ef.textContent='';
}
function logout(){
  // Close out this session's LoginLog row — stamp logout_time and compute/store
  // session_duration ("Xh Ym") — before clearing currentUser, so the record this person just
  // finished is captured exactly once, right here.
  if(currentLoginLogId){
    const row=(db.loginLogs||[]).find(x=>x.id===currentLoginLogId);
    if(row && !row.logoutTime){
      row.logoutTime=new Date().toISOString();
      row.sessionDuration=fmtSessionDuration(row.loginTime, row.logoutTime);
      saveDB(db);
    }
  }
  currentLoginLogId=null;
  currentUser=null;
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
}
window.addEventListener('DOMContentLoaded',()=>{
  const sideLogo=document.querySelector('.sidebarBrand img');
  const loginLogo=document.getElementById('loginLogo');
  if(sideLogo && loginLogo) loginLogo.src=sideLogo.src;

  document.getElementById('loginPass').addEventListener('keydown',e=>{ if(e.key==='Enter') attemptLogin(); });
  document.getElementById('loginUser').addEventListener('keydown',e=>{ if(e.key==='Enter') attemptLogin(); });
  document.getElementById('loginOtp').addEventListener('keydown',e=>{ if(e.key==='Enter') attemptOtpVerify(); });

  // Show a lightweight "loading" state on the login screen while Supabase data is fetched.
  const loginErr=document.getElementById('loginErr');
  if(loginErr) loginErr.textContent='Connecting to database…';

  dbReady.then(()=>{
    if(loginErr) loginErr.textContent='';
    const raw=sessionStorage.getItem(SESSION_KEY);
    if(raw){
      try{
        const sess=JSON.parse(raw);
        const user=(db.users||[]).find(u=>u.username===sess.username);
        if(user && user.active===false){ sessionStorage.removeItem(SESSION_KEY); showLogin(); return; }
        // A valid sessionStorage session means Username+Password AND the 4-digit OTP were
        // already verified earlier in this browser tab — restoring it on reload does not ask
        // for the OTP again, it just reattaches to the SAME LoginLog row (sess.loginLogId) so
        // logout() still closes out the correct session later.
        if(user){ currentUser=user; currentLoginLogId=sess.loginLogId||null; showApp(); return; }
      }catch(e){}
    }
    showLogin();
  });
});

function toggleTheme(){
  document.body.classList.toggle('dark');
  localStorage.setItem('hrms_dark', document.body.classList.contains('dark') ? '1' : '0');
}
function setColorTheme(name){
  document.body.classList.forEach(c=>{ if(c.startsWith('theme-')) document.body.classList.remove(c); });
  if(name && name!=='teal') document.body.classList.add('theme-'+name);
  localStorage.setItem('hrms_theme', name);
}
(function applySavedTheme(){
  if(localStorage.getItem('hrms_dark')==='1') document.body.classList.add('dark');
  const savedTheme=localStorage.getItem('hrms_theme')||'teal';
  if(savedTheme!=='teal') document.body.classList.add('theme-'+savedTheme);
  window.addEventListener('DOMContentLoaded',()=>{
    const picker=document.getElementById('themePicker');
    if(picker) picker.value=savedTheme;
  });
})();

