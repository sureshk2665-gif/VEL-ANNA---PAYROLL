/* ================= USER MANAGEMENT =================
   Each user has two parts: the ERP profile in db.users (name, role, active, permissions) and a
   Supabase Auth login account (username + hashed password + role). Login accounts can only be
   created or changed with the server's secret key, so these functions go through the
   /api/users serverless function (api/users.js), which re-checks the caller's role itself. */
const USERNAME_PATTERN=/^[a-z0-9._-]{2,40}$/;
const MIN_PASSWORD_LENGTH=6; // Supabase Auth's default minimum
// Calls api/users.js as the signed-in user. Returns the JSON reply, or null after alerting.
async function callUserAdminApi(payload){
  try{
    const { data:{ session } } = await sb.auth.getSession();
    if(!session){ alert('Your session has expired. Please log in again.'); return null; }
    const res=await fetch('/api/users',{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+session.access_token },
      body:JSON.stringify(payload)
    });
    let body={};
    try{ body=await res.json(); }catch(e){}
    if(!res.ok){ alert('Could not update the login account: '+(body.error || ('server error '+res.status))); return null; }
    return body;
  }catch(e){
    alert('Could not reach the user-management server: '+e.message);
    return null;
  }
}
async function addUser(){
  if(!actorCanManageUsers()){ alert('You do not have permission to add users.'); return; }
  const name=document.getElementById('u_name').value.trim();
  const username=document.getElementById('u_username').value.trim().toLowerCase();
  const password=document.getElementById('u_password').value;
  const role=document.getElementById('u_role').value;
  if(currentUser.role==='Admin' && (role==='Admin' || role==='Software Admin')){ alert('Admin cannot create Admin or Software Admin accounts. Only a Software Admin can do this.'); return; }
  if(!username){ alert('Username is required.'); return; }
  if(!USERNAME_PATTERN.test(username)){ alert('Username can only use lowercase letters, numbers, dot, dash and underscore (2–40 characters).'); return; }
  if(!password || password.length<MIN_PASSWORD_LENGTH){ alert('Password must be at least '+MIN_PASSWORD_LENGTH+' characters.'); return; }
  if(!Array.isArray(db.users)) db.users=[];
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())){
    alert('A user with this username already exists.'); return;
  }
  if(!await callUserAdminApi({action:'save', username, password, role, active:true})) return;
  const newUser={username,name,role,active:true};
  ensureUserPermissions(newUser);
  db.users.push(newUser);
  saveDB(db);
  render(userAdminRedirectPage());
}
async function editUser(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to edit this user.'); return; }
  const name=prompt('Full Name:', u.name||'');
  if(name===null) return;
  const roleHint = currentUser.role==='Software Admin' ? 'Admin/Software Admin/HR/Accounts/Viewer' : 'HR/Accounts/Viewer';
  const role=prompt('Role ('+roleHint+'):', u.role||'');
  if(role===null) return;
  if(currentUser.role==='Admin' && (role==='Admin' || role==='Software Admin')){ alert('Admin cannot assign the Admin or Software Admin role. Only a Software Admin can do this.'); return; }
  const pw=prompt('New Password (min. '+MIN_PASSWORD_LENGTH+' characters — leave blank to keep current):','');
  if(pw && pw.length<MIN_PASSWORD_LENGTH){ alert('Password must be at least '+MIN_PASSWORD_LENGTH+' characters.'); return; }
  const result=await callUserAdminApi({action:'save', username:u.username, role, password:pw||undefined, active:u.active!==false});
  if(!result) return;
  if(result.missing) alert('Note: "'+u.username+'" has no login account yet, so they cannot sign in. Edit again and enter a password to create one.');
  const wasAdmin = u.role==='Admin' || u.role==='Software Admin';
  u.name=name;
  u.role=role;
  if(wasAdmin && role!=='Admin' && role!=='Software Admin'){ u.permissions=defaultPermsForRole(role); }
  ensureUserPermissions(u);
  saveDB(db);
  render(userAdminRedirectPage());
}
async function deleteUser(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to delete this user.'); return; }
  if(u.username==='admin'){ alert('The admin account cannot be deleted.'); return; }
  if(!confirm(`Delete user "${u.username}"?`)) return;
  if(!await callUserAdminApi({action:'delete', username:u.username})) return;
  db.users.splice(i,1);
  saveDB(db);
  render(userAdminRedirectPage());
}
async function toggleUserActive(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to change this user\'s status.'); return; }
  if(u.username==='admin'){ alert('The admin account cannot be deactivated.'); return; }
  const isActiveNow = u.active!==false;
  if(!await callUserAdminApi({action:'save', username:u.username, role:u.role, active:!isActiveNow})) return;
  u.active = !isActiveNow;
  saveDB(db);
  render(userAdminRedirectPage());
}
async function resetAllData(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can reset all data.'); return; }
  if(!confirm('This will erase ALL data in Supabase (user accounts are kept). Continue?')) return;
  const fresh=defaultDB();
  // Keep the user profiles: their login accounts live in Supabase Auth and would otherwise be
  // left without a profile (and the person resetting would lose their own).
  fresh.users=db.users;
  await saveDB(fresh);
  db=fresh;
  render('dashboard');
}

