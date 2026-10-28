/* ================= SETTINGS ================= */
// Admin is split into tabs so one section shows at a time; the tab is remembered while the app is open.
let settingsTab='';
function setSettingsTab(t){ settingsTab=t; render('settings'); }
function renderSettings(){
  const canEditSettings = hasPerm('settings','edit');
  const tabs=[
    (isAdmin()||isSoftwareAdmin()) && {key:'rates', icon:'percent', label:'Payroll Rates'},
    {key:'designations', icon:'tag', label:'Designations'},
    isAdmin() && {key:'users', icon:'users', label:'Users & Permissions'},
    {key:'account', icon:'lock', label:isAdmin()?'Password & Backup':'Password'},
  ].filter(Boolean);
  if(!tabs.some(t=>t.key===settingsTab)) settingsTab=tabs[0].key;
  const body = settingsTab==='rates' ? renderPayrollRatesPanel()
    : settingsTab==='designations' ? renderDesignationsPanel()
    : settingsTab==='users' ? renderUserRightsPanel()
    : `<div class="setTwo">
    <div class="panel"><h3>${ico('lock')} Change Password</h3>
      <div class="formGrid setNarrow">
        <div><label>Current Password</label><input type="password" id="s_curPass" autocomplete="current-password"></div>
        <div><label>New Password</label><input type="password" id="s_newPass" autocomplete="new-password"></div>
      </div>
      <div class="modalActions" style="justify-content:flex-start;"><button class="btn" onclick="changePassword()">Update Password</button></div>
    </div>
    ${isAdmin() ? `
    <div class="panel"><h3>${ico('download')} Backup</h3>
      <p style="font-size:13px;color:var(--muted);">Download a full backup of the ERP database. Keep the downloaded file somewhere safe.</p>
      <div class="modalActions" style="justify-content:flex-start;">
        <button class="btn" onclick="backupData()">${ico('download')} Backup Data (Download)</button>
      </div>
      <p id="backupInfo" style="font-size:12px;color:var(--muted);margin-top:8px;"></p>
    </div>` : ''}
  </div>`;
  return `<div class="teTabs setTabs" role="tablist">
    ${tabs.map(t=>`<div class="teTab ${settingsTab===t.key?'active':''}" role="tab" tabindex="0" aria-selected="${settingsTab===t.key}" onclick="setSettingsTab('${t.key}')" onkeydown="if(event.key==='Enter')setSettingsTab('${t.key}')">${ico(t.icon)} ${t.label}</div>`).join('')}
  </div>
  ${body}`;
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

// Payroll Rates (Admin and Software Admin only): PF / ESI rates, canteen token price and the
// monthly late grace, used by every payroll run.
function renderPayrollRatesPanel(){
  const s=getSettings();
  return `<div class="panel"><h3>${ico('percent')} Payroll Rates</h3>
    <p style="font-size:13px;color:var(--muted);margin:-6px 0 14px;">Used by every payroll run. A change applies to months generated from now on; regenerate a month on the Payroll page to apply it there. There is no paid leave: an absent day is Loss Of Pay.</p>
    <div class="formGrid setRates">
      <div><label>PF rate — employee (0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfRate" value="${s.pfRate}"></div>
      <div><label>PF rate — employer (0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfEmployerRate" value="${s.pfEmployerRate}"></div>
      <div><label>ESI rate — employee (0.0075 = 0.75%)</label><input type="number" step="0.0001" id="s_esiRate" value="${s.esiRate}"></div>
      <div><label>ESI rate — employer (0.0325 = 3.25%)</label><input type="number" step="0.0001" id="s_esiEmployerRate" value="${s.esiEmployerRate}"></div>
      <div><label>Canteen token price (₹ per token)</label><input type="number" step="0.01" min="0" id="s_canteenTokenPrice" value="${s.canteenTokenPrice}"></div>
      <div><label>Late grace (minutes per month)</label><input type="number" step="1" min="0" id="s_lateGraceMinutes" value="${lateGraceMinutes()}"></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:12px;"><b>Wages:</b> Basic = 60% and HRA = 40% of the Daily Wage, paid for Present + Half Day × 0.5 + paid holidays. <b>OT</b> per hour = Daily Wage ÷ 8 × the employee's OT Factor; OT hours come from Employee Time Entry. <b>Late:</b> one minute = Daily Wage ÷ 8 ÷ 60, after the free late minutes above. <b>Canteen:</b> tokens (Employee Time Entry → Monthly Token Entry) × the token price. <b>Working days (NOWD)</b> = days in the month − Sundays − paid holidays (Employee Time Entry → Holiday Calendar).</p>
    <div class="modalActions"><button class="btn" onclick="savePayrollConstants()">${ico('save')} Save Payroll Rates</button></div>
  </div>`;
}
