/* ================= SHARED USER MANAGEMENT / USER RIGHTS PANEL =================
   Rendered on BOTH the Admin ('settings') page and the Software Admin ('softwareadmin')
   page. Behaves differently depending on who is logged in:
     - Software Admin (currentUser.role==='Software Admin'): sees and can manage EVERY
       account, including Admin and other Software Admin accounts (full Admin Management),
       and can assign the Admin / Software Admin roles.
     - Admin (currentUser.role==='Admin'): sees and can manage ONLY normal/operational
       accounts (never Admin or Software Admin accounts), and can never assign the Admin or
       Software Admin role to anyone. Admin & Software Admin rows are completely hidden from
       an Admin's view here — this is the enforcement point, not just a UI convenience. */
function renderUserRightsPanel(){
  const actorIsSA = !!currentUser && currentUser.role==='Software Admin';
  const allUsers = db.users||[];
  const visibleUsers = allUsers
    .map((u,i)=>({u,i}))
    .filter(x=> actorIsSA || (x.u.role!=='Admin' && x.u.role!=='Software Admin'));
  const roleOptions = actorIsSA
    ? ['Admin','Software Admin','HR','Accounts','Viewer']
    : ['HR','Accounts','Viewer'];
  return `
  <div class="panel"><h3>👤 User Management</h3>
    <p style="font-size:12px;color:var(--muted);">
      ${actorIsSA
        ? 'As <b>Software Admin</b> — the highest-level software authority — you can create, edit, delete and activate/deactivate every account, including other Admin and Software Admin accounts, and assign any role.'
        : 'As <b>Admin</b> you can create, edit, delete and activate/deactivate normal user accounts, and assign their module-wise permissions. Admin and Software Admin accounts are managed exclusively by a Software Admin and are not shown here.'}
    </p>
    <table>
      <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${visibleUsers.map(({u,i})=>`
        <tr>
          <td>${u.username}</td>
          <td>${u.name||''}</td>
          <td>${u.role||''}</td>
          <td>${u.active===false ? '<span style="color:#c33;">Inactive</span>' : '<span style="color:#0a7;">Active</span>'}</td>
          <td style="white-space:nowrap;">
            <button class="btn secondary" style="padding:5px 10px;font-size:12px;" onclick="editUser(${i})">Edit</button>
            ${u.username!=='admin' && u.role!=='Admin' && u.role!=='Software Admin' ? `<button class="btn secondary" style="padding:5px 10px;font-size:12px;" onclick="openPermissionsModal(${i})">🔐 Permissions</button>` : ''}
            ${u.username!=='admin' ? `<button class="btn secondary" style="padding:5px 10px;font-size:12px;" onclick="toggleUserActive(${i})">${u.active===false?'Activate':'Deactivate'}</button>` : ''}
            ${u.username!=='admin' ? `<button class="btn danger" style="padding:5px 10px;font-size:12px;" onclick="deleteUser(${i})">Delete</button>` : ''}
          </td>
        </tr>`).join('') || `<tr><td colspan="5" style="color:var(--muted);">No users to show here yet.</td></tr>`}
      </tbody>
    </table>
    <h4 style="margin-top:16px;">Add New User</h4>
    <div class="formGrid">
      <div><label>Full Name</label><input id="u_name" placeholder="e.g. Priya Sharma"></div>
      <div><label>Username</label><input id="u_username" placeholder="e.g. priya.s"></div>
      <div><label>Password</label><input type="password" id="u_password" placeholder="Min. 6 characters"></div>
      <div><label>Role</label><select id="u_role">${roleOptions.map(r=>`<option>${r}</option>`).join('')}</select></div>
    </div>
    <p style="font-size:12px;color:var(--muted);">
      ${actorIsSA
        ? 'New users get sensible default permissions for their role — fine-tune them afterwards with the 🔐 Permissions button.'
        : 'Admin cannot create Admin or Software Admin accounts — only the roles above are available. New users get sensible default permissions — fine-tune them afterwards with the 🔐 Permissions button.'}
    </p>
    <div class="modalActions"><button class="btn" onclick="addUser()">Add User</button></div>
  </div>
  <div class="panel"><h3>🔐 User Rights Management</h3>
    <p style="font-size:12px;color:var(--muted);">Pick a user, tick the permissions they should have for each module, then Save. Users only see and can perform the actions checked here. ${actorIsSA ? '' : 'Access to the Software Admin module itself is never granted from here — it is controlled solely by the Admin / Software Admin role, which only a Software Admin can assign.'}</p>
    ${renderPermissionsMatrix()}
  </div>`;
}
/* ---- Permission matrix (inline, for a quick default view) ----
   Only ever lists normal/operational users: an Admin or Software Admin role already has a
   blanket permission bypass (see hasPerm), so editing their checkboxes here would be a no-op —
   they are intentionally excluded from this list for both actors. */
let permMatrixUserIdx = null;
function renderPermissionsMatrix(){
  const manageableUsers=(db.users||[]).map((u,i)=>({u,i})).filter(x=>x.u.role!=='Admin' && x.u.role!=='Software Admin');
  if(!manageableUsers.length) return '<p style="font-size:12px;color:var(--muted);">No normal users yet. Add a user above to configure their rights.</p>';
  if(permMatrixUserIdx===null || !db.users[permMatrixUserIdx] || db.users[permMatrixUserIdx].role==='Admin' || db.users[permMatrixUserIdx].role==='Software Admin') permMatrixUserIdx=manageableUsers[0].i;
  const u=db.users[permMatrixUserIdx];
  ensureUserPermissions(u);
  return `
    <div class="formGrid" style="margin-bottom:10px;">
      <div><label>User</label>
        <select onchange="permMatrixUserIdx=+this.value;render(userAdminRedirectPage())">
          ${manageableUsers.map(x=>`<option value="${x.i}" ${x.i===permMatrixUserIdx?'selected':''}>${x.u.name||x.u.username} (${x.u.username}) — ${x.u.role||''}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="overflow-x:auto;">
    <table>
      <thead><tr><th>Module</th>${PERMISSION_ACTIONS.map(a=>`<th style="text-align:center;">${a.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${PERMISSION_MODULES.map(m=>`<tr>
          <td><b>${m.label}</b></td>
          ${PERMISSION_ACTIONS.map(a=>`<td style="text-align:center;"><input type="checkbox" id="perm_${m.key}_${a.key}" ${u.permissions[m.key][a.key]?'checked':''}></td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="modalActions" style="justify-content:flex-start;gap:10px;">
      <button class="btn" onclick="saveUserPermissionsFromMatrix()">Save Permissions</button>
      <button class="btn secondary" onclick="grantAllPermissions()">Grant Full Access</button>
      <button class="btn secondary" onclick="revokeAllPermissions()">Revoke All Access</button>
    </div>`;
}
function saveUserPermissionsFromMatrix(){
  const u=db.users[permMatrixUserIdx];
  if(!u || !canManageTargetUser(u)){ alert('You do not have permission to change this user\'s permissions.'); return; }
  ensureUserPermissions(u);
  PERMISSION_MODULES.forEach(m=>{
    PERMISSION_ACTIONS.forEach(a=>{
      const el=document.getElementById(`perm_${m.key}_${a.key}`);
      u.permissions[m.key][a.key]=!!(el && el.checked);
    });
  });
  saveDB(db);
  alert('Permissions saved for '+(u.name||u.username)+'.');
  render(userAdminRedirectPage());
}
function grantAllPermissions(){
  const u=db.users[permMatrixUserIdx];
  if(!u || !canManageTargetUser(u)) return;
  PERMISSION_MODULES.forEach(m=>{ u.permissions[m.key]=fullModulePerms(); });
  saveDB(db);
  render(userAdminRedirectPage());
}
function revokeAllPermissions(){
  const u=db.users[permMatrixUserIdx];
  if(!u || !canManageTargetUser(u)) return;
  PERMISSION_MODULES.forEach(m=>{ u.permissions[m.key]=blankModulePerms(); });
  saveDB(db);
  render(userAdminRedirectPage());
}
/* ---- Permission modal (opened via the 🔐 Permissions button on a user row) ---- */
function openPermissionsModal(i){
  const u=db.users[i];
  if(!u || !canManageTargetUser(u)){ alert('You do not have permission to change this user\'s permissions.'); return; }
  permMatrixUserIdx=i;
  render(userAdminRedirectPage());
  document.getElementById('pageBody').scrollIntoView({behavior:'smooth'});
}
function backupData(){
  // Downloading a backup is now an additional right granted to the operational Admin role too
  // (on top of Software Admin, who retains full backup/restore/reset access elsewhere). Restore
  // and Reset All Data remain exclusive to Software Admin — see restoreData() / resetAllData().
  if(!isSoftwareAdmin() && !isAdmin()){ alert('Only the Admin or Software Admin can access data backup.'); return; }
  try{
    const payload={
      app:'VIPL Payroll',
      dbKey:DB_KEY,
      exportedAt:new Date().toISOString(),
      data:db
    };
    const json=JSON.stringify(payload,null,2);
    const blob=new Blob([json],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const a=document.createElement('a');
    a.href=url;
    a.download=`VIPL-Payroll-Backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const info=document.getElementById('backupInfo');
    if(info) info.textContent='Backup downloaded at '+new Date().toLocaleString();
  }catch(err){
    alert('Backup failed: '+err.message);
  }
}
function restoreData(file){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can restore data.'); return; }
  if(!file) return;
  if(!confirm('Restoring will REPLACE all current data with the contents of this backup file (user accounts are kept as they are). Continue?')) return;
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      const parsed=JSON.parse(e.target.result);
      const incoming = (parsed && typeof parsed==='object' && 'data' in parsed) ? parsed.data : parsed;
      if(!incoming || typeof incoming!=='object' || !('employees' in incoming)){
        alert('This file does not look like a valid VIPL Payroll backup.');
        return;
      }
      // Keep the current user profiles — login accounts live in Supabase Auth, not in backups —
      // and never bring back the plain-text passwords that older backups contain.
      incoming.users = db.users;
      delete incoming.admin;
      const ok = await saveDB(incoming);
      if(!ok){
        // saveDB() already alerted with the specific reason. Do NOT swap `db` over
        // to the incoming data as if nothing went wrong — that's what previously
        // made a failed import look successful until the next logout/refresh.
        return;
      }
      db=incoming;
      alert('Data restored successfully and saved to the database.');
      render('softwareadmin');
    }catch(err){
      alert('Restore failed: could not read this file. '+err.message);
    }finally{
      document.getElementById('restoreFileInput').value='';
    }
  };
  reader.onerror=function(){ alert('Restore failed: could not read the file.'); };
  reader.readAsText(file);
}
/* ---- Automatic Backup Scheduler ---- */
function computeNextRun(cfg, from){
  from = from || new Date();
  const [hh,mm] = (cfg.time||'20:00').split(':').map(n=>+n);
  let next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0, 0);
  if(cfg.frequency==='daily'){
    if(next<=from) next.setDate(next.getDate()+1);
  } else if(cfg.frequency==='weekly'){
    const targetDay = +(cfg.weekday??1);
    while(next.getDay()!==targetDay || next<=from) next.setDate(next.getDate()+1);
  } else if(cfg.frequency==='monthly'){
    const dom = Math.min(Math.max(+(cfg.dayOfMonth||1),1),28);
    next = new Date(from.getFullYear(), from.getMonth(), dom, hh, mm, 0, 0);
    if(next<=from) next = new Date(from.getFullYear(), from.getMonth()+1, dom, hh, mm, 0, 0);
  }
  return next;
}
function saveAutoBackupSchedule(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can configure automatic backup.'); return; }
  const enabled = document.getElementById('ab_enabled').value==='1';
  const frequency = document.getElementById('ab_frequency').value;
  const time = document.getElementById('ab_time').value || '20:00';
  const weekday = +document.getElementById('ab_weekday').value || 0;
  const dayOfMonth = +document.getElementById('ab_dom').value || 1;
  db.autoBackup = db.autoBackup || {};
  db.autoBackup.enabled = enabled;
  db.autoBackup.frequency = frequency;
  db.autoBackup.time = time;
  db.autoBackup.weekday = weekday;
  db.autoBackup.dayOfMonth = dayOfMonth;
  db.autoBackup.nextRun = enabled ? computeNextRun(db.autoBackup).toISOString() : null;
  saveDB(db);
  alert('Automatic backup schedule saved.');
  render('softwareadmin');
  startAutoBackupWatcher();
}
function logBackupHistory(type, status){
  const now = new Date();
  db.backupHistory = db.backupHistory || [];
  db.backupHistory.push({
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    type: type,
    status: status
  });
  if(db.backupHistory.length>500) db.backupHistory = db.backupHistory.slice(-500);
  saveDB(db);
}
function runAutoBackup(typeLabel){
  const type = typeLabel || (db.autoBackup ? (db.autoBackup.frequency.charAt(0).toUpperCase()+db.autoBackup.frequency.slice(1)) : 'Manual Trigger');
  try{
    const payload={ app:'VIPL Payroll', dbKey:DB_KEY, exportedAt:new Date().toISOString(), data:db };
    const json=JSON.stringify(payload,null,2);
    const blob=new Blob([json],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const a=document.createElement('a');
    a.href=url;
    a.download=`VIPL-Payroll-AutoBackup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logBackupHistory(type,'Success');
    if(db.autoBackup){
      db.autoBackup.lastRun = new Date().toISOString();
      db.autoBackup.nextRun = db.autoBackup.enabled ? computeNextRun(db.autoBackup).toISOString() : null;
      saveDB(db);
    }
  }catch(err){
    logBackupHistory(type,'Failed');
  }
  const info=document.getElementById('backupInfo');
  if(info) info.textContent='Automatic backup last ran at '+new Date().toLocaleString();
  if(document.getElementById('ab_enabled')) render('softwareadmin');
}
let _autoBackupTimer=null;
function startAutoBackupWatcher(){
  if(_autoBackupTimer) clearInterval(_autoBackupTimer);
  _autoBackupTimer = setInterval(checkAutoBackupDue, 30000);
  checkAutoBackupDue();
}
function checkAutoBackupDue(){
  if(!db || !db.autoBackup || !db.autoBackup.enabled) return;
  if(!db.autoBackup.nextRun){
    db.autoBackup.nextRun = computeNextRun(db.autoBackup).toISOString();
    saveDB(db);
    return;
  }
  const now = new Date();
  if(now >= new Date(db.autoBackup.nextRun)){
    const type = db.autoBackup.frequency.charAt(0).toUpperCase()+db.autoBackup.frequency.slice(1);
    runAutoBackup(type);
  }
}
document.addEventListener('DOMContentLoaded', ()=>{ dbReady.then(startAutoBackupWatcher); });
// These files load as deferred scripts, which run while readyState is already 'interactive' but
// BEFORE DOMContentLoaded fires — so only fall back here if the page has fully loaded already,
// otherwise the listener above handles it (prevents the watcher from starting twice).
if(document.readyState==='complete') dbReady.then(startAutoBackupWatcher);
function savePayrollConstants(){
  if(!hasPerm('payroll','edit')){ alert('You do not have permission to edit payroll constants.'); return; }
  const s=getSettings();
  s.esiRate=+document.getElementById('s_esiRate').value||0.0075;
  s.esiEmployerRate=+document.getElementById('s_esiEmployerRate').value||0.0325;
  s.pfRate=+document.getElementById('s_pfRate').value||0.12;
  s.pfEmployerRate=+document.getElementById('s_pfEmployerRate').value||0.12;
  s.canteenLunchRate=+document.getElementById('s_canteenLunchRate').value||0;
  s.canteenDinnerRate=+document.getElementById('s_canteenDinnerRate').value||0;
  saveDB(db);
  alert('Payroll constants saved.');
  render('payrollprocess');
}
function saveCompanySettings(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can edit company details.'); return; }
  db.companyName=document.getElementById('s_companyName').value;
  db.companyAddress=document.getElementById('s_companyAddress').value;
  db.companyGSTIN=document.getElementById('s_companyGSTIN').value;
  db.companyPAN=document.getElementById('s_companyPAN').value;
  db.companyCIN=document.getElementById('s_companyCIN').value;
  db.companyPhone=document.getElementById('s_companyPhone').value;
  db.companyEmail=document.getElementById('s_companyEmail').value;
  db.unit1Name=document.getElementById('s_unit1Name').value||'Unit-1';
  db.unit1Address=document.getElementById('s_unit1Address').value;
  db.unit2Name=document.getElementById('s_unit2Name').value||'Unit-2';
  db.unit2Address=document.getElementById('s_unit2Address').value;
  saveDB(db);
  alert('Saved.');
}
async function changePassword(){
  const cur=document.getElementById('s_curPass').value;
  const nw=document.getElementById('s_newPass').value;
  if(!currentUser) return;
  if(!nw || nw.length<6){ alert('New password must be at least 6 characters.'); return; }
  // Passwords are held by Supabase Auth: confirm the current one by signing in with it, then
  // change it on the signed-in account.
  const check=await sb.auth.signInWithPassword({ email: usernameToEmail(currentUser.username), password: cur });
  if(check.error){ alert('Current password incorrect.'); return; }
  const { error }=await sb.auth.updateUser({ password: nw });
  if(error){ alert('Could not update the password: '+error.message); return; }
  document.getElementById('s_curPass').value='';
  document.getElementById('s_newPass').value='';
  alert('Password updated.');
}

