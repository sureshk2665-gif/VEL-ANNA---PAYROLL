/* ================= ROLE-BASED USER RIGHTS MANAGEMENT ================= */
// Modules that can be individually permissioned. Keys must match the nav data-page values.
const PERMISSION_MODULES=[
  {key:'dashboard',label:'Dashboard'},
  {key:'employees',label:'Employees'},
  {key:'resigned',label:'Resigned Employees'},
  {key:'departments',label:'Departments'},
  {key:'attendance',label:'Attendance'},
  {key:'timeentry',label:'Employee Time Entry'},
  {key:'payroll',label:'Payroll'},
  {key:'increment',label:'Annual Increment'},
  {key:'salaryadvance',label:'Salary Advance'},
  {key:'reports',label:'Reports'},
  {key:'settings',label:'Admin'}
];
// The seven permission types required for every module.
const PERMISSION_ACTIONS=[
  {key:'view',label:'Read / View'},
  {key:'add',label:'Add / Create'},
  {key:'edit',label:'Edit'},
  {key:'delete',label:'Delete'},
  {key:'approve',label:'Approve'},
  {key:'print',label:'Print'},
  {key:'export',label:'Export'}
];
function blankModulePerms(){
  const p={}; PERMISSION_ACTIONS.forEach(a=>p[a.key]=false); return p;
}
function fullModulePerms(){
  const p={}; PERMISSION_ACTIONS.forEach(a=>p[a.key]=true); return p;
}
function defaultPermsForRole(role){
  const perms={};
  PERMISSION_MODULES.forEach(m=>{
    if(role==='Software Admin'){ perms[m.key]=fullModulePerms(); return; } // highest authority — full rights to every ERP module/config
    if(role==='Admin'){ perms[m.key]=fullModulePerms(); return; } // operational admin — full rights to normal ERP modules (Software Admin module is separately hard-gated and NOT covered by this)
    if(role==='Viewer'){ const p=blankModulePerms(); p.view=true; if(m.key!=='settings') p.print=true; perms[m.key]=p; return; }
    // HR / Accounts / any other role: sensible working defaults, fully editable afterwards by Admin/Software Admin.
    const p=blankModulePerms();
    p.view=true; p.add=true; p.edit=true; p.print=true; p.export=true;
    if(m.key==='settings'){ perms[m.key]=blankModulePerms(); perms[m.key].view=true; return; }
    perms[m.key]=p;
  });
  return perms;
}
function ensureUserPermissions(u){
  if(u.role==='Admin' || u.role==='Software Admin'){ u.permissions=defaultPermsForRole(u.role); return u.permissions; }
  if(!u.permissions || typeof u.permissions!=='object') u.permissions=defaultPermsForRole(u.role||'Viewer');
  PERMISSION_MODULES.forEach(m=>{
    // Missing module entirely (e.g. this user's saved permissions pre-date a newly added
    // module such as Employee Time Entry) → backfill with that role's sensible defaults
    // instead of blank/all-false, so newly added modules aren't silently hidden for
    // existing users. Modules the user already has (even if blank) are left untouched.
    if(!u.permissions[m.key]) u.permissions[m.key]=(defaultPermsForRole(u.role||'Viewer')[m.key])||blankModulePerms();
    PERMISSION_ACTIONS.forEach(a=>{ if(typeof u.permissions[m.key][a.key]!=='boolean') u.permissions[m.key][a.key]=false; });
  });
  return u.permissions;
}
// Same fix as above: this must only run against the real, loaded db — never the blank
// placeholder — so it's deferred until dbReady resolves instead of running eagerly here.
dbReady.then(()=>{
  (db.users||[]).forEach(u=>{ if(typeof u.active!=='boolean') u.active=true; ensureUserPermissions(u); });
  saveDB(db);
});

// 'Admin' = normal operational admin (user management, day-to-day ERP administration).
function isAdmin(){ return !!currentUser && currentUser.role==='Admin'; }
// 'Software Admin' = highest-level software authority. Strictly separate from 'Admin' —
// an Admin can NEVER be granted, view, or exercise Software Admin rights. This is a hard-coded
// role gate, not part of the per-user permission checkboxes, so it can never be handed out by
// accident or by an Admin assigning it to someone.
function isSoftwareAdmin(){ return !!currentUser && currentUser.role==='Software Admin'; }
// hasPerm('employees','edit') -> true/false for the logged-in user.
function hasPerm(moduleKey,action){
  if(!currentUser) return false;
  if(currentUser.role==='Software Admin') return true; // full, unrestricted bypass — highest authority
  if(moduleKey==='softwareadmin') return false; // hard-blocked for every role except Software Admin, including Admin
  if(currentUser.role==='Admin') return true; // full bypass for every module EXCEPT softwareadmin (blocked above)
  ensureUserPermissions(currentUser);
  return !!(currentUser.permissions[moduleKey] && currentUser.permissions[moduleKey][action]);
}
// Can the logged-in user manage (create/edit/delete/activate/permission) this target user account?
// Software Admin can manage anyone (full Admin Management). Admin can only manage normal/operational
// users — never another Admin account and never a Software Admin account.
function canManageTargetUser(u){
  if(!currentUser || !u) return false;
  if(currentUser.role==='Software Admin') return true;
  if(currentUser.role==='Admin') return u.role!=='Admin' && u.role!=='Software Admin';
  return false;
}
function actorCanManageUsers(){ return !!currentUser && (currentUser.role==='Software Admin' || currentUser.role==='Admin'); }
// Which page a Software Admin vs. an Admin should land back on after a user-management action.
function userAdminRedirectPage(){ return (currentUser && currentUser.role==='Software Admin') ? 'softwareadmin' : 'settings'; }
// Convenience: does the user have ANY access at all to a module (used to show/hide nav + gate render()).
function canOpenModule(moduleKey){ return hasPerm(moduleKey==='payrollprocess'?'payroll':moduleKey,'view'); }
function denyMsg(action,moduleLabel){
  return `<div class="panel"><h3>🚫 Access Denied</h3><p style="color:var(--muted);">You do not have permission to ${action} in the <b>${moduleLabel}</b> module. Please contact your Administrator if you believe this is a mistake.</p></div>`;
}

function getSettings(){
  if(!db.settings) db.settings={ nowd:24, esiRate:0.0075, esiEmployerRate:0.0325, pfRate:0.12, pfEmployerRate:0.12, canteenLunchRate:18, canteenDinnerRate:13.5 };
  if(db.settings.pfRate===undefined) db.settings.pfRate=0.12;
  if(db.settings.esiEmployerRate===undefined) db.settings.esiEmployerRate=0.0325;
  if(db.settings.pfEmployerRate===undefined) db.settings.pfEmployerRate=0.12;
  if(db.settings.canteenLunchRate===undefined) db.settings.canteenLunchRate=18;
  if(db.settings.canteenDinnerRate===undefined) db.settings.canteenDinnerRate=13.5;
  return db.settings;
}

