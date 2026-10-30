/* ================= SOFTWARE ADMIN (separate, strictly role-gated module) =================
   Only visible/accessible to the 'Software Admin' role — see isSoftwareAdmin(). An 'Admin'
   (operational admin) can NEVER open, view, or be redirected into this module. Houses: Company
   Details, Automatic Backup Scheduler (+ manual Data Backup/Restore), and the FULL User Rights /
   Admin Management panel (which, unlike the Admin's own restricted copy, can create/edit/delete
   Admin and Software Admin accounts too). This is intentionally kept out of the regular per-user
   permission checkboxes so Software Admin access can never be handed out by accident. */
function renderSoftwareAdmin(){
  if(!isSoftwareAdmin()) return denyMsg('view this page','System');
  return `
  <div class="panel"><h3>${ico('building')} Company Details</h3>
    <p style="font-size:12px;color:var(--muted);">These appear in the header of printed slips and reports.</p>
    <div class="formGrid" style="align-items:flex-start;">
      <div>
        <label>Company Logo</label>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <div style="width:80px;height:80px;border:1px dashed var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--card);">
            ${db.companyLogo ? `<img src="${db.companyLogo}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-size:11px;color:var(--muted);">No logo</span>`}
          </div>
          <div>
            <input type="file" accept="image/*" onchange="uploadCompanyLogo(this)" style="font-size:12px;">
            ${db.companyLogo ? `<button type="button" class="btn danger" style="margin-top:8px;padding:6px 12px;font-size:12px;" onclick="removeCompanyLogo()">Remove Logo</button>` : ''}
            <p style="font-size:11px;color:var(--muted);margin:6px 0 0;">PNG/JPG, under 2MB. Appears automatically on Salary Slips and all printed reports.</p>
          </div>
        </div>
      </div>
      <div><label>Company Name</label><input id="s_companyName" value="${db.companyName||''}"></div>
      <div><label>Registered Address</label><input id="s_companyAddress" value="${db.companyAddress||''}"></div>
      <div><label>GSTIN</label><input id="s_companyGSTIN" value="${db.companyGSTIN||''}"></div>
      <div><label>PAN</label><input id="s_companyPAN" value="${db.companyPAN||''}"></div>
      <div><label>CIN</label><input id="s_companyCIN" value="${db.companyCIN||''}"></div>
      <div><label>Phone</label><input id="s_companyPhone" value="${db.companyPhone||''}"></div>
      <div><label>Email</label><input id="s_companyEmail" value="${db.companyEmail||''}"></div>
    </div>
    <h4 style="margin:18px 0 4px;">Working Units</h4>
    <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">Units are shown as "${unitPrefix()?unitPrefix()+' ':''}Unit-1", "${unitPrefix()?unitPrefix()+' ':''}Unit-2" … (the first word of the Company Name). Edit a unit's address here and press Save — it changes everywhere the unit is shown (employee form and list, attendance, salary slips, acquittance register and reports). A unit can be deleted only while no employee (active, inactive or resigned) belongs to it.</p>
    <div style="overflow-x:auto;">
    <table>
      <thead><tr><th>Unit</th><th>Address (printed on salary slips)</th><th>Employees</th><th></th></tr></thead>
      <tbody>
      ${getUnits().map(u=>{ const n=unitEmployeeCount(u.code); return `<tr>
        <td><b>${unitDisplayName(u)}</b></td>
        <td><input id="s_unitAddress_${u.code}" placeholder="(uses the Registered Address)" value="${String(u.address||'').replace(/"/g,'&quot;')}"></td>
        <td>${n}</td>
        <td class="rowActions"><button class="del" ${n?`disabled title="Move these ${n} employee(s) to another unit first"`:''} onclick="deleteWorkingUnit('${u.code}')">${ico('trash')} Delete</button></td>
      </tr>`; }).join('')}
      </tbody>
    </table>
    </div>
    <h4 style="margin:22px 0 4px;">Contractors</h4>
    <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">Contractors supply employees; any contractor can supply employees to any unit. Rename a contractor here and press Save — it changes everywhere (employee form and list, salary slips, reports, Excel template). A contractor can be deleted only while no employee (active, inactive or resigned) was supplied by them.</p>
    <div style="overflow-x:auto;">
    <table>
      <thead><tr><th>Contractor Name</th><th>Address</th><th>Phone</th><th>Employees</th><th></th></tr></thead>
      <tbody>
      ${getContractors().map(c=>{ const n=contractorEmployeeCount(c.code); const v=x=>String(x||'').replace(/"/g,'&quot;'); return `<tr>
        <td><input id="s_contractorName_${c.code}" value="${v(c.name)}"></td>
        <td><input id="s_contractorAddress_${c.code}" value="${v(c.address)}"></td>
        <td><input id="s_contractorPhone_${c.code}" value="${v(c.phone)}"></td>
        <td>${n}</td>
        <td class="rowActions"><button class="del" ${n?`disabled title="Move these ${n} employee(s) to another contractor first"`:''} onclick="deleteContractor('${c.code}')">${ico('trash')} Delete</button></td>
      </tr>`; }).join('') || '<tr><td colspan="5" style="color:var(--muted);">No contractors yet.</td></tr>'}
      </tbody>
    </table>
    </div>
    <div class="modalActions"><button class="btn secondary" onclick="addWorkingUnit()">${ico('plus')} Add Unit</button><button class="btn secondary" onclick="addContractor()">${ico('plus')} Add Contractor</button><button class="btn" onclick="saveCompanySettings()">Save</button></div>
  </div>
  <div class="panel"><h3>${ico('file-spreadsheet')} Bulk Import Employees</h3>
    <p style="font-size:13px;color:var(--muted);">Add many new employees at once from an Excel file: download the template, fill one row per employee, then upload it. Rows are checked before anything is added. Bulk import is available only here; other users add employees one at a time from Employees → + Add Employee.</p>
    <div class="modalActions" style="justify-content:flex-start;"><button class="btn" onclick="openBulkImport()">${ico('file-spreadsheet')} Bulk Import (Excel)</button></div>
  </div>
  ${renderUserRightsPanel()}
  <div class="panel"><h3>${ico('database')} Data Backup &amp; Restore</h3>
    <p style="font-size:13px;color:var(--muted);">All data is stored locally in this browser (no server). Take a backup regularly and store the file safely — clearing browser data, reinstalling the browser, or switching devices will erase records unless you restore from a backup.</p>
    <div class="modalActions" style="justify-content:flex-start;gap:10px;flex-wrap:wrap;">
      <button class="btn" onclick="backupData()">${ico('download')} Backup Data (Download)</button>
      <button class="btn secondary" onclick="document.getElementById('restoreFileInput').click()">${ico('upload')} Restore Data (Upload)</button>
      <input type="file" id="restoreFileInput" accept="application/json,.json" style="display:none" onchange="restoreData(this.files[0])">
    </div>
    <p id="backupInfo" style="font-size:12px;color:var(--muted);margin-top:8px;"></p>
    <hr style="border:none;border-top:1px solid var(--line);margin:16px 0;">
    <p style="font-size:13px;color:var(--muted);">Employee details: one Excel sheet with every employee and every field of the employee form. Empty cells are coloured yellow, and the last columns list what still needs to be filled for each employee.</p>
    <div class="modalActions" style="justify-content:flex-start;">
      <button class="btn secondary" onclick="downloadAllEmployeeDetails()">${ico('file-spreadsheet')} Download All Employee Details (Excel)</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--line);margin:16px 0;">
    <p style="font-size:13px;color:var(--muted);">Danger zone. <b>Delete All Attendance Data</b> is for clearing test entries before go-live: it removes attendance, In / Out times, leave entries and OT / late figures, and keeps employees, holidays, shift groups and settings. A backup file is downloaded first.</p>
    <div class="modalActions" style="justify-content:flex-start;gap:10px;flex-wrap:wrap;">
      <button class="btn danger" onclick="deleteAllAttendanceData()">${ico('trash')} Delete All Attendance Data</button>
      <button class="btn danger" onclick="resetAllData()">Reset All Data</button>
    </div>
  </div>
  <div class="panel"><h3>${ico('timer')} Automatic Backup Scheduler</h3>
    <p style="font-size:13px;color:var(--muted);">Schedule backups to run on their own, saved as a download in the same location as manual backups above. This works while the app is open in a browser tab — keep a tab open (or open it once a day) so the schedule can trigger. If the app wasn't open at the scheduled time, the overdue backup runs automatically the next time it's opened.</p>
    <div class="formGrid">
      <div><label>Automatic Backup</label>
        <select id="ab_enabled">
          <option value="0" ${!db.autoBackup?.enabled?'selected':''}>Disabled</option>
          <option value="1" ${db.autoBackup?.enabled?'selected':''}>Enabled</option>
        </select>
      </div>
      <div><label>Frequency</label>
        <select id="ab_frequency" onchange="const f=this.value; document.getElementById('ab_weekdayWrap').style.display=(f==='weekly'?'':'none'); document.getElementById('ab_domWrap').style.display=(f==='monthly'?'':'none');">
          <option value="daily" ${db.autoBackup?.frequency==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${db.autoBackup?.frequency==='weekly'?'selected':''}>Weekly</option>
          <option value="monthly" ${db.autoBackup?.frequency==='monthly'?'selected':''}>Monthly</option>
        </select>
      </div>
      <div><label>Backup Time</label><input type="time" id="ab_time" value="${db.autoBackup?.time||'20:00'}"></div>
      <div id="ab_weekdayWrap" style="${db.autoBackup?.frequency==='weekly'?'':'display:none;'}"><label>Day of Week</label>
        <select id="ab_weekday">
          ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${(+ (db.autoBackup?.weekday??1))===i?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div id="ab_domWrap" style="${db.autoBackup?.frequency==='monthly'?'':'display:none;'}"><label>Day of Month</label>
        <input type="number" id="ab_dom" min="1" max="28" value="${db.autoBackup?.dayOfMonth||1}">
      </div>
    </div>
    <div class="modalActions" style="justify-content:flex-start;gap:10px;">
      <button class="btn" onclick="saveAutoBackupSchedule()">Save Schedule</button>
      <button class="btn secondary" onclick="runAutoBackup('Manual Trigger')">Run Backup Now</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:8px;">
      ${db.autoBackup?.enabled ? `Status: <b style="color:var(--accent, #0a7);">Enabled</b> — next run around ${db.autoBackup.nextRun ? new Date(db.autoBackup.nextRun).toLocaleString() : 'calculating…'}` : 'Status: <b>Disabled</b>'}
    </p>
    <h4 style="margin-top:16px;">Backup History / Log</h4>
    <div style="overflow-x:auto;">
    <table>
      <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>
        ${(db.backupHistory||[]).slice().reverse().slice(0,50).map(h=>`<tr>
          <td>${h.date}</td><td>${h.time}</td><td>${h.type}</td>
          <td>${h.status==='Success' ? '<span style="color:#0a7;">'+ico('circle-check')+' Success</span>' : '<span style="color:#c33;">'+ico('circle-x')+' Failed</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted);">No automatic backups have run yet.</td></tr>'}
      </tbody>
    </table>
    </div>
  </div>
  ${renderLoginLogsPanel()}`;
}
// LoginLog viewer — shown at the bottom of the Software Admin page so the LoginLog data
// feature actually has somewhere to be seen and used, not just written silently to storage.
// Read-only: most recent sign-in first, capped at the last 100 rows for a fast render. A row
// with no Logout Time / Duration means that session is either still open right now, or the
// browser/tab was closed without using Logout.
function renderLoginLogsPanel(){
  const rows=(db.loginLogs||[]).slice().sort((a,b)=>String(b.loginTime).localeCompare(String(a.loginTime))).slice(0,100);
  return `
  <div class="panel"><h3>${ico('key')} Login Log <span style="font-size:12px;color:var(--muted);font-weight:400;">${(db.loginLogs||[]).length} session(s) recorded</span></h3>
    <p style="font-size:12px;color:var(--muted);">Every successful sign-in — after Username + Password AND the 4-digit OTP are both verified — is logged here with Login Time, Logout Time and Session Duration. A blank Logout Time/Duration means that session is either still open or the tab was closed without using Logout.</p>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto;">
    <table>
      <thead><tr><th>User</th><th>Login Time</th><th>Logout Time</th><th>Duration</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td>${r.name||r.userId}</td>
          <td>${r.loginTime ? new Date(r.loginTime).toLocaleString() : '—'}</td>
          <td>${r.logoutTime ? new Date(r.logoutTime).toLocaleString() : '<span style="color:var(--accent);">— open —</span>'}</td>
          <td>${r.sessionDuration||'—'}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted);">No login sessions recorded yet.</td></tr>'}
      </tbody>
    </table>
    </div>
  </div>`;
}

/* ---- Download All Employee Details (Excel) — Software Admin ----
   Every employee, every field of the employee form (same labels and dropdown wording), one row
   each. Empty cells are coloured yellow and the last two columns say how many fields are empty and
   which ones, so the sheet shows what still has to be collected. A Summary sheet counts the empty
   cells per field. Calculated fields (Employee Code, Basic, HRA, OT rate) are filled in but never
   counted as missing; Inactive From / Resignation Date only count for Inactive / Resigned staff. */
function employeeDetailValue(f, e){
  if(f.key==='code') return e.code||'';
  if(f.key==='basic'||f.key==='hra'||f.key==='otRate') return +e.dailyWage>0 ? dailyWageSplit(e.dailyWage, otFactorOf(e))[f.key] : '';
  if(f.input==='select'){
    const v=employeeFieldFormValue(f, e);
    if(v===''||v===null||v===undefined) return '';
    const o=employeeFieldOptions(f, e).find(x=>String(x.value)===String(v));
    return o ? String(o.label) : String(v);
  }
  if(f.input==='date') return e[f.key] ? fmtDate(e[f.key]) : '';
  if(f.input==='number'){ const v=e[f.key]; return (v===undefined||v===null||v==='') ? '' : +v; }
  const v=e[f.key]; return v===undefined||v===null ? '' : String(v).trim();
}
function employeeDetailIsMissing(f, e, v){
  if(f.auto || f.key==='resignReason') return false;
  if(f.key==='inactiveFrom') return e.status==='Inactive' && v==='';
  if(f.key==='resignationDate') return e.status==='Resigned' && v==='';
  if(f.key==='dailyWage') return !(+v>0);
  return v==='';
}
function downloadAllEmployeeDetails(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can download all employee details.'); return; }
  if(typeof window.downloadExcel!=='function'){ alert('Excel export is not available right now. Please reload the page and try again.'); return; }
  const emps=(db.employees||[]).slice().sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  if(!emps.length){ alert('There are no employees yet.'); return; }
  const fields=employeeFields();
  const label=f=>String(f.label).replace(/\s*\*\s*$/,'');
  const columns=[{header:'S.No', key:'_sno', width:6, type:'number'}]
    .concat(fields.map(f=>({header:label(f), key:f.key, width:f.width||16, type:f.input==='number'?'number':'text', keepBlank:true})))
    .concat([{header:'Empty fields', key:'_emptyCount', width:9, type:'number'}, {header:'Still to fill', key:'_emptyList', width:70, type:'text'}]);
  const missingBy={};
  const rows=emps.map((e,i)=>{
    const row={_sno:i+1}, empty=[];
    fields.forEach(f=>{
      const v=employeeDetailValue(f, e);
      row[f.key]=v;
      if(employeeDetailIsMissing(f, e, v)){ empty.push(f.key); missingBy[f.key]=(missingBy[f.key]||0)+1; }
    });
    row._empty=empty;
    row._emptyCount=empty.length;
    row._emptyList=empty.map(k=>label(fields.find(f=>f.key===k))).join(', ');
    return row;
  });
  const complete=rows.filter(r=>!r._emptyCount).length;
  const summary=fields.filter(f=>!f.auto && f.key!=='resignReason').map(f=>({field:label(f), empty:missingBy[f.key]||0, filled:emps.length-(missingBy[f.key]||0)}));
  const name=db.companyName||DEFAULT_BRAND_NAME;
  window.downloadExcel({
    fileName:`${companyFilePrefix()}-All-Employee-Details-${todayStr()}.xlsx`,
    creator:name,
    sheets:[
      {name:'Employees', title:`${name} — All Employee Details`, freezeCols:4,
        subtitle:`${emps.length} employees as on ${fmtDate(todayStr())} · ${complete} complete, ${emps.length-complete} with empty fields · yellow cells are empty and need to be filled`,
        columns, rows},
      {name:'Summary', title:'Empty fields per column', subtitle:'Inactive From / Resignation Date count only for Inactive / Resigned employees. Calculated fields are not counted.',
        columns:[{header:'Field', key:'field', width:34, type:'text'}, {header:'Empty', key:'empty', width:10, type:'number'}, {header:'Filled', key:'filled', width:10, type:'number'}],
        rows:summary.sort((a,b)=>b.empty-a.empty)}
    ]
  });
}

/* ---- Delete All Attendance Data — Software Admin ----
   For clearing test entries before the software is handed over. Removes: attendance marked on the
   Attendance screen, Employee Time Entry In / Out times, leave entries (Loss of Pay / Half Day),
   per-day shift changes, and the OT hours / late minutes / LOP typed on the Attendance screen.
   Keeps: employees, holidays, shift groups and the weekly rotation, canteen tokens, allowances,
   deductions, salary advances, payroll rates and users. A backup file is downloaded first; if
   that fails nothing is deleted. */
async function deleteAllAttendanceData(){
  if(!isSoftwareAdmin()){ alert('Only the Software Admin can delete attendance data.'); return; }
  const days=new Set([...Object.keys(db.attendance||{}), ...Object.keys(db.timeEntries||{}), ...(db.timeLeaves||[]).map(l=>l.date)]);
  if(!days.size){ alert('There is no attendance data to delete.'); return; }
  const typed=prompt(`Delete ALL attendance data (${days.size} day(s))?\n\n`
    +`Removes: attendance, In / Out times, leave entries, day shift changes, and OT / late / LOP figures typed on the Attendance screen.\n`
    +`Keeps: employees, holidays, shift groups, tokens, allowances, deductions, advances, rates and users.\n\n`
    +`A backup file is downloaded first. This cannot be undone except by restoring that backup.\n\nType DELETE to continue.`);
  if(typed===null) return;
  if(typed.trim()!=='DELETE'){ alert('Nothing was deleted. Type DELETE in capital letters to confirm.'); return; }
  if(!backupData()){ alert('The backup could not be downloaded, so nothing was deleted.'); return; }
  db.attendance={};
  db.timeEntries={};
  db.timeLeaves=[];
  db.shiftOverrides={};
  Object.values(db.payrollAdjustments||{}).forEach(month=>Object.values(month||{}).forEach(a=>{
    a.otTyped=false; a.otHours=0; a.lopOverride=null; delete a.lateMinutes;
  }));
  await saveDB(db);
  render('softwareadmin');
  alert(`All attendance data (${days.size} day(s)) was deleted. A backup file was downloaded first.`);
}
