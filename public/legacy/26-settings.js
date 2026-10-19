/* ================= SETTINGS ================= */
function renderSettings(){
  const canEditSettings = hasPerm('settings','edit');
  return `
  ${canEditSettings ? `
  <div class="panel"><h3>Payroll Constants</h3>
    <p style="font-size:12px;color:var(--muted);">Payroll Constants (ESI Rate, PF Rate, Canteen Token Price), the auto-calculated NOWD, and the Holiday Calendar have moved to <b>Payroll → Payroll Process</b>. NOPH is taken automatically from the Holiday Calendar — no manual entry needed.</p>
    <div class="modalActions"><button class="btn secondary" onclick="render('payrollprocess')">Go to Payroll Process</button></div>
  </div>` : ''}
  ${renderDesignationsPanel()}
  <div class="panel"><h3>Change Password</h3>
    <div class="formGrid">
      <div><label>Current Password</label><input type="password" id="s_curPass"></div>
      <div><label>New Password</label><input type="password" id="s_newPass"></div>
    </div>
    <div class="modalActions"><button class="btn" onclick="changePassword()">Update Password</button></div>
  </div>
  ${isAdmin() ? `
  <div class="panel"><h3>${ico('download')} Backup</h3>
    <p style="font-size:13px;color:var(--muted);">Download a full backup of the ERP database. This is an additional right granted to the Admin account — Restore Data and Reset All Data remain exclusive to Software Admin.</p>
    <div class="modalActions" style="justify-content:flex-start;">
      <button class="btn" onclick="backupData()">${ico('download')} Backup Data (Download)</button>
    </div>
    <p id="backupInfo" style="font-size:12px;color:var(--muted);margin-top:8px;"></p>
  </div>` : ''}
  ${isAdmin() ? renderUserRightsPanel() : ''}`;
}

/* ---- Designations (managed list, like Departments) ----
   db.designations feeds the Designation dropdown in the Employee form and the Bulk Import Excel
   template. Renaming updates every employee that has it; a designation still in use cannot be
   deleted. Editing needs Admin "Edit" rights (Admin and Software Admin have them). */
function designationEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderDesignationsPanel(){
  const canEdit=hasPerm('settings','edit');
  const list=designationList();
  return `
  <div class="panel"><h3>${ico('tag')} Designations</h3>
    <p style="font-size:12px;color:var(--muted);">The Designation dropdown in the Employee form and in the Bulk Import Excel template uses this list. Renaming a designation updates every employee who has it.</p>
    ${canEdit ? `<div class="toolbar" style="margin:10px 0 12px;">
      <input id="newDesigInput" placeholder="New designation, e.g. Operator" onkeydown="if(event.key==='Enter')addDesignation()">
      <button class="btn" onclick="addDesignation()">${ico('plus')} Add Designation</button>
    </div>` : ''}
    ${list.length ? `<table><thead><tr><th>Designation</th><th>Employees</th>${canEdit?'<th>Actions</th>':''}</tr></thead><tbody>
      ${list.map((d,i)=>{
        const count=(db.employees||[]).filter(e=>e.designation===d).length;
        return `<tr><td><b>${designationEsc(d)}</b></td><td>${count}</td>${canEdit?`<td class="rowActions">
          <button onclick="renameDesignation(${i})">${ico('pencil')} Rename</button>
          <button class="del" ${count?`disabled title="${count} employee(s) have this designation"`:''} onclick="deleteDesignation(${i})">${ico('trash')} Delete</button>
        </td>`:''}</tr>`;
      }).join('')}
    </tbody></table>` : '<div class="empty">No designations yet.'+(canEdit?' Add the first one above.':'')+'</div>'}
  </div>`;
}
function addDesignation(){
  if(!hasPerm('settings','edit')){ alert('You do not have permission to edit designations.'); return; }
  const el=document.getElementById('newDesigInput');
  const v=(el && el.value || '').trim();
  if(!v) return;
  if(!Array.isArray(db.designations)) db.designations=[];
  if(db.designations.some(d=>d.toLowerCase()===v.toLowerCase())){ alert('This designation already exists.'); return; }
  db.designations.push(v);
  db.designations.sort((a,b)=>a.localeCompare(b));
  saveDB(db); render('settings');
}
function renameDesignation(i){
  if(!hasPerm('settings','edit')){ alert('You do not have permission to edit designations.'); return; }
  const old=designationList()[i];
  if(old===undefined) return;
  const v=(prompt('Rename designation "'+old+'" to:', old)||'').trim();
  if(!v || v===old) return;
  if(db.designations.some((d,j)=>j!==i && d.toLowerCase()===v.toLowerCase())){ alert('This designation already exists.'); return; }
  db.designations[i]=v;
  db.designations.sort((a,b)=>a.localeCompare(b));
  (db.employees||[]).forEach(e=>{ if(e.designation===old) e.designation=v; });
  saveDB(db); render('settings');
}
function deleteDesignation(i){
  if(!hasPerm('settings','edit')){ alert('You do not have permission to edit designations.'); return; }
  const d=designationList()[i];
  if(d===undefined) return;
  const n=(db.employees||[]).filter(e=>e.designation===d).length;
  if(n){ alert('"'+d+'" is used by '+n+' employee(s) (including inactive/resigned). Change their designation first, or rename it instead.'); return; }
  if(!confirm('Delete designation "'+d+'"?')) return;
  db.designations.splice(i,1);
  saveDB(db); render('settings');
}
