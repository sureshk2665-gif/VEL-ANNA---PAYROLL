/* ================= USER MANAGEMENT ================= */
function addUser(){
  if(!actorCanManageUsers()){ alert('You do not have permission to add users.'); return; }
  const name=document.getElementById('u_name').value.trim();
  const username=document.getElementById('u_username').value.trim();
  const password=document.getElementById('u_password').value;
  const role=document.getElementById('u_role').value;
  if(currentUser.role==='Admin' && (role==='Admin' || role==='Software Admin')){ alert('Admin cannot create Admin or Software Admin accounts. Only a Software Admin can do this.'); return; }
  if(!username){ alert('Username is required.'); return; }
  if(!password || password.length<4){ alert('Password must be at least 4 characters.'); return; }
  if(!Array.isArray(db.users)) db.users=[];
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())){
    alert('A user with this username already exists.'); return;
  }
  const newUser={username,password,name,role,active:true};
  ensureUserPermissions(newUser);
  db.users.push(newUser);
  saveDB(db);
  render(userAdminRedirectPage());
}
function editUser(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to edit this user.'); return; }
  const name=prompt('Full Name:', u.name||'');
  if(name===null) return;
  const roleHint = currentUser.role==='Software Admin' ? 'Admin/Software Admin/HR/Accounts/Viewer' : 'HR/Accounts/Viewer';
  const role=prompt('Role ('+roleHint+'):', u.role||'');
  if(role===null) return;
  if(currentUser.role==='Admin' && (role==='Admin' || role==='Software Admin')){ alert('Admin cannot assign the Admin or Software Admin role. Only a Software Admin can do this.'); return; }
  const pw=prompt('New Password (leave blank to keep current):','');
  const wasAdmin = u.role==='Admin' || u.role==='Software Admin';
  u.name=name;
  u.role=role;
  if(pw) u.password=pw;
  if(u.username==='admin' && db.admin) db.admin.password=u.password;
  if(wasAdmin && role!=='Admin' && role!=='Software Admin'){ u.permissions=defaultPermsForRole(role); }
  ensureUserPermissions(u);
  saveDB(db);
  render(userAdminRedirectPage());
}
function deleteUser(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to delete this user.'); return; }
  if(u.username==='admin'){ alert('The admin account cannot be deleted.'); return; }
  if(!confirm(`Delete user "${u.username}"?`)) return;
  db.users.splice(i,1);
  saveDB(db);
  render(userAdminRedirectPage());
}
function toggleUserActive(i){
  const u=db.users[i];
  if(!u) return;
  if(!canManageTargetUser(u)){ alert('You do not have permission to change this user\'s status.'); return; }
  if(u.username==='admin'){ alert('The admin account cannot be deactivated.'); return; }
  const isActiveNow = u.active!==false;
  u.active = !isActiveNow;
  saveDB(db);
  render(userAdminRedirectPage());
}
async function resetAllData(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can reset all data.'); return; }
  if(!confirm('This will erase ALL data in Supabase. Continue?')) return;
  const fresh=defaultDB();
  await saveDB(fresh);
  db=fresh;
  render('dashboard');
}

