/* ================= SOFTWARE ADMIN (separate, strictly role-gated module) =================
   Only visible/accessible to the 'Software Admin' role — see isSoftwareAdmin(). An 'Admin'
   (operational admin) can NEVER open, view, or be redirected into this module. Houses: Company
   Details, Automatic Backup Scheduler (+ manual Data Backup/Restore), and the FULL User Rights /
   Admin Management panel (which, unlike the Admin's own restricted copy, can create/edit/delete
   Admin and Software Admin accounts too). This is intentionally kept out of the regular per-user
   permission checkboxes so Software Admin access can never be handed out by accident. */
function renderSoftwareAdmin(){
  if(!isSoftwareAdmin()) return denyMsg('view this page','Software Admin');
  return `
  <div class="panel"><h3>🏢 Company Details</h3>
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
    <p style="font-size:12px;color:var(--muted);margin-top:10px;">Unit details — used for unit-wise report sections.</p>
    <div class="formGrid">
      <div><label>Unit-1 Name</label><input id="s_unit1Name" value="${db.unit1Name||'Unit-1'}"></div>
      <div><label>Unit-1 Address</label><input id="s_unit1Address" value="${db.unit1Address||''}"></div>
      <div><label>Unit-2 Name</label><input id="s_unit2Name" value="${db.unit2Name||'Unit-2'}"></div>
      <div><label>Unit-2 Address</label><input id="s_unit2Address" value="${db.unit2Address||''}"></div>
    </div>
    <div class="modalActions"><button class="btn" onclick="saveCompanySettings()">Save</button></div>
  </div>
  ${renderUserRightsPanel()}
  <div class="panel"><h3>💾 Data Backup &amp; Restore</h3>
    <p style="font-size:13px;color:var(--muted);">All data is stored locally in this browser (no server). Take a backup regularly and store the file safely — clearing browser data, reinstalling the browser, or switching devices will erase records unless you restore from a backup.</p>
    <div class="modalActions" style="justify-content:flex-start;gap:10px;flex-wrap:wrap;">
      <button class="btn" onclick="backupData()">⬇ Backup Data (Download)</button>
      <button class="btn secondary" onclick="document.getElementById('restoreFileInput').click()">⬆ Restore Data (Upload)</button>
      <input type="file" id="restoreFileInput" accept="application/json,.json" style="display:none" onchange="restoreData(this.files[0])">
    </div>
    <p id="backupInfo" style="font-size:12px;color:var(--muted);margin-top:8px;"></p>
    <hr style="border:none;border-top:1px solid var(--line);margin:16px 0;">
    <p style="font-size:13px;color:var(--muted);">Danger zone.</p>
    <button class="btn danger" onclick="resetAllData()">Reset All Data</button>
  </div>
  <div class="panel"><h3>⏱ Automatic Backup Scheduler</h3>
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
          <td>${h.status==='Success' ? '<span style="color:#0a7;">✔ Success</span>' : '<span style="color:#c33;">✘ Failed</span>'}</td>
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
  <div class="panel"><h3>🔐 Login Log <span style="font-size:12px;color:var(--muted);font-weight:400;">${(db.loginLogs||[]).length} session(s) recorded</span></h3>
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
