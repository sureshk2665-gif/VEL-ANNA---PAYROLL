/* ================= AUTH =================
   Sign-in uses Supabase Auth (passwords are checked and stored, hashed, by Supabase — never in
   the erp_data JSON). An account can only open the app if:
     1. its username + password are accepted by Supabase Auth,
     2. it has a role in its Auth app_metadata (set only by the server, api/users.js), and
     3. its ERP user profile in db.users is not deactivated.
   The RLS policies (supabase/setup.sql) apply the same role check on the database side, so the
   data cannot be read without signing in. */
const SESSION_KEY='hrms_session_v1';
let currentUser=null;
// The LoginLog record ("session") id for the currently signed-in user, so logout() knows
// exactly which row to close out with a Logout Time + Session Duration. Also persisted in
// sessionStorage (see startSession()) so a page reload can still find and close the right row.
let currentLoginLogId=null;
let loginBusy=false;

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
async function attemptLogin(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  if(!u || !p){ err.textContent='Enter your username and password.'; return; }
  if(loginBusy) return;
  loginBusy=true;
  err.textContent='Signing in…';
  try{
    const {data, error}=await sb.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
    if(error && (error.code==='user_banned' || /banned/i.test(error.message||''))){ err.textContent='This account has been deactivated. Contact your Administrator.'; return; }
    if(error || !data || !data.user){ err.textContent='Invalid username or password.'; return; }
    await startSession(data.user, true);
  }catch(e){
    err.textContent='Could not reach the login server. Check your internet connection.';
  }finally{
    loginBusy=false;
  }
}
// Shows a reason on the login screen and drops the Supabase session.
async function rejectSession(message){
  try{ await sb.auth.signOut(); }catch(e){}
  currentUser=null;
  currentLoginLogId=null;
  sessionStorage.removeItem(SESSION_KEY);
  db=defaultDB();
  const err=document.getElementById('loginErr');
  if(err) err.textContent=message;
  return false;
}
// Runs after Supabase Auth accepted the account — either a fresh sign-in (isNewLogin) or a
// session restored on page reload. Loads the data, matches the ERP user profile and opens the app.
async function startSession(authUser, isNewLogin){
  const meta=(authUser && authUser.app_metadata) || {};
  if(!meta.role) return rejectSession('This account is not set up for VIPL Payroll. Contact your Software Admin.');
  try{
    await initDB();
  }catch(e){
    return rejectSession('Could not load data: '+(e && e.message ? e.message : e));
  }
  const username=(meta.username || String(authUser.email||'').split('@')[0]).toLowerCase();
  if(!Array.isArray(db.users)) db.users=[];
  let user=db.users.find(x=>String(x.username).toLowerCase()===username);
  if(!user){
    // The account was created directly in Supabase (e.g. the first Software Admin) and has no
    // ERP profile yet — create one from its server-assigned role.
    user={username, name:username, role:meta.role, active:true};
    ensureUserPermissions(user);
    db.users.push(user);
    await saveDB(db);
  }
  if(user.active===false) return rejectSession('This account has been deactivated. Contact your Administrator.');
  // The role in Supabase Auth (changeable only through api/users.js) is authoritative.
  if(user.role!==meta.role){
    user.role=meta.role;
    ensureUserPermissions(user);
    await saveDB(db);
  }
  currentUser=user;
  if(isNewLogin){
    // Create this session's LoginLog row — login_time is "now", logout_time/session_duration are
    // filled in only later by logout() when the person actually signs out.
    const logRow={ id:'LL'+Date.now()+Math.floor(Math.random()*1000), userId:currentUser.username, name:currentUser.name||currentUser.username,
      loginTime:new Date().toISOString(), logoutTime:'', sessionDuration:'' };
    if(!Array.isArray(db.loginLogs)) db.loginLogs=[];
    db.loginLogs.push(logRow);
    currentLoginLogId=logRow.id;
    saveDB(db);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({username:currentUser.username, loginLogId:logRow.id}));
  }else{
    // Page reload inside the same tab: reattach to the SAME LoginLog row so logout() still
    // closes out the correct session later.
    try{
      const sess=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
      currentLoginLogId=(sess && sess.username===currentUser.username && sess.loginLogId) || null;
    }catch(e){ currentLoginLogId=null; }
  }
  const err=document.getElementById('loginErr'); if(err) err.textContent='';
  const pf=document.getElementById('loginPass'); if(pf) pf.value='';
  showApp();
  return true;
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
  const pf=document.getElementById('loginPass'); if(pf) pf.value='';
  const ef=document.getElementById('loginErr'); if(ef) ef.textContent='';
  const uEl=document.getElementById('loginUser'); if(uEl) uEl.focus();
}
async function logout(){
  // Close out this session's LoginLog row — stamp logout_time and compute/store
  // session_duration ("Xh Ym") — before signing out, so the record this person just
  // finished is captured exactly once, right here (the save must finish while still signed in).
  if(currentLoginLogId){
    const row=(db.loginLogs||[]).find(x=>x.id===currentLoginLogId);
    if(row && !row.logoutTime){
      row.logoutTime=new Date().toISOString();
      row.sessionDuration=fmtSessionDuration(row.loginTime, row.logoutTime);
      await saveDB(db);
    }
  }
  try{ await sb.auth.signOut(); }catch(e){}
  currentLoginLogId=null;
  currentUser=null;
  sessionStorage.removeItem(SESSION_KEY);
  db=defaultDB(); // don't keep the company's data in memory after signing out
  closeModal();
  showLogin();
}
window.addEventListener('DOMContentLoaded',()=>{
  const sideLogo=document.querySelector('.sidebarBrand img');
  const loginLogo=document.getElementById('loginLogo');
  if(sideLogo && loginLogo) loginLogo.src=sideLogo.src;

  document.getElementById('loginPass').addEventListener('keydown',e=>{ if(e.key==='Enter') attemptLogin(); });
  document.getElementById('loginUser').addEventListener('keydown',e=>{ if(e.key==='Enter') attemptLogin(); });

  // Show a lightweight "loading" state on the login screen while an existing session is checked.
  const loginErr=document.getElementById('loginErr');
  if(loginErr) loginErr.textContent='Connecting to database…';

  (async()=>{
    let session=null;
    try{ ({ data:{ session } } = await sb.auth.getSession()); }catch(e){ session=null; }
    if(session && session.user){
      // A Supabase session already exists in this browser tab (page reload) — reopen the app
      // without asking for the password again.
      const ok=await startSession(session.user, false);
      if(!ok) document.getElementById('loginScreen').style.display='flex';
      return;
    }
    showLogin();
  })();
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

