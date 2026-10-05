/* ================= SETTINGS ================= */
function renderSettings(){
  const canEditSettings = hasPerm('settings','edit');
  return `
  ${canEditSettings ? `
  <div class="panel"><h3>Payroll Constants</h3>
    <p style="font-size:12px;color:var(--muted);">Payroll Constants (ESI Rate, PF Rate, Canteen Rates), the auto-calculated NOWD, and the Holiday Calendar have moved to <b>Payroll → Payroll Process</b>. NOPH and NOPL are taken automatically from the Holiday Calendar and Attendance — no manual entry needed.</p>
    <div class="modalActions"><button class="btn secondary" onclick="render('payrollprocess')">Go to Payroll Process</button></div>
  </div>` : ''}
  <div class="panel"><h3>Change Password</h3>
    <div class="formGrid">
      <div><label>Current Password</label><input type="password" id="s_curPass"></div>
      <div><label>New Password</label><input type="password" id="s_newPass"></div>
    </div>
    <div class="modalActions"><button class="btn" onclick="changePassword()">Update Password</button></div>
  </div>
  ${isAdmin() ? `
  <div class="panel"><h3>⬇ Backup</h3>
    <p style="font-size:13px;color:var(--muted);">Download a full backup of the ERP database. This is an additional right granted to the Admin account — Restore Data and Reset All Data remain exclusive to Software Admin.</p>
    <div class="modalActions" style="justify-content:flex-start;">
      <button class="btn" onclick="backupData()">⬇ Backup Data (Download)</button>
    </div>
    <p id="backupInfo" style="font-size:12px;color:var(--muted);margin-top:8px;"></p>
  </div>` : ''}
  ${isAdmin() ? renderUserRightsPanel() : ''}`;
}
