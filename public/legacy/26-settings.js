/* ================= SETTINGS ================= */
// Admin is split into tabs so one section shows at a time; the tab is remembered while the app is open.
let settingsTab='';
function setSettingsTab(t){
  if(settingsEdit && t!==settingsTab && !confirm('Discard the changes you are making?')) return;
  settingsEdit=''; settingsTab=t; render('settings');
}
// Pay Rules tab — PF & ESI / Late free minutes / Canteen token price: each card's boxes open only
// after its Edit; Save stores them; Cancel shows the stored values again.
let settingsEdit=''; // 'rates' | 'canteen' | 'late' while that panel is open for changes
function setEditOpen(k){ if(!isAdmin() && !isSoftwareAdmin()) return; settingsEdit=k; render('settings'); }
function setEditCancel(){ settingsEdit=''; render('settings'); }
function setEditButtons(k, saveFn, saveLabel){
  return settingsEdit===k
    ? `<button class="btn secondary" onclick="setEditCancel()">${ico('x')} Cancel</button><button class="btn" onclick="${saveFn}()">${ico('save')} ${saveLabel}</button>`
    : `<button class="btn btnEditAtt" onclick="setEditOpen('${k}')">${ico('pencil')} Edit</button>`;
}
function renderSettings(){
  const canEditSettings = hasPerm('settings','edit');
  const tabs=[
    (isAdmin()||isSoftwareAdmin()) && {key:'pay', icon:'percent', label:'Pay Rules'},
    {key:'designations', icon:'tag', label:'Designations'},
    isAdmin() && {key:'users', icon:'users', label:'Users & Permissions'},
    {key:'account', icon:'lock', label:isAdmin()?'Password & Backup':'Password'},
  ].filter(Boolean);
  if(['rates','canteen','late'].includes(settingsTab)) settingsTab='pay'; // the three are one tab now
  if(!tabs.some(t=>t.key===settingsTab)) settingsTab=tabs[0].key;
  const body = settingsTab==='pay' ? `<div class="setPayGrid">${renderPayrollRatesPanel()}${renderLateWaiverPanel()}${renderCanteenPricesPanel()}</div>`
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

// Canteen token price for each working unit (see canteenTokenPrice() in 12-payroll-calc.js). A box
// left empty uses the default price shown below it.
function renderCanteenPricesPanel(){
  const s=getSettings(), own=unitTokenPrices(), def=+s.canteenTokenPrice||0;
  return `<div class="panel setCard setCanteen"><div class="setCardHead"><h3>${ico('receipt')} Canteen token price</h3>${setEditButtons('canteen','saveCanteenPrices','Save')}</div>
    <p class="setLead">Price per token for each working unit. Tokens × price is deducted from pay.</p>
    <fieldset class="setEditFs" ${settingsEdit==='canteen'?'':'disabled'}>
    <table class="setPriceTable"><thead><tr><th>Unit</th><th>Unit name</th><th class="num">Employees</th><th class="num">Price per token (₹)</th></tr></thead><tbody>
      ${getUnits().map(u=>{ const n=(db.employees||[]).filter(e=>e.status!=='Resigned' && unitCodeOf(e.unit)===u.code).length; const v=tokenPriceValue(own[u.code]);
        return `<tr><td>${u.code}</td><td>${designationEsc(unitDisplayName(u))}</td><td class="num">${n}</td>
          <td class="num"><input type="number" step="0.01" min="0" class="setPriceIn" data-unit="${designationEsc(u.code)}" value="${v===null?'':v}" placeholder="${def}" aria-label="Token price for ${designationEsc(unitDisplayName(u))}"></td></tr>`; }).join('')}
    </tbody></table>
    <div class="formGrid setRates" style="margin-top:14px;">
      <div><label>Default price (units with an empty box)</label><input type="number" step="0.01" min="0" id="s_canteenTokenPrice" value="${def}"></div>
    </div>
    </fieldset>
    <details class="repHow"><summary>${ico('alert')} When a change applies</summary><p class="syncNote">A changed price applies to months generated from now on. To apply it to a month already generated, click Regenerate on the Payroll page for that month.</p></details>
  </div>`;
}
function saveCanteenPrices(){
  if(!isAdmin() && !isSoftwareAdmin()){ alert('Only an administrator can change canteen token prices.'); return; }
  const s=getSettings(), prices={};
  document.querySelectorAll('.setPriceIn').forEach(inp=>{ const v=tokenPriceValue(String(inp.value).trim()); if(v!==null) prices[inp.dataset.unit]=v; });
  s.canteenTokenPrices=prices;
  const d=tokenPriceValue(String(document.getElementById('s_canteenTokenPrice').value).trim());
  s.canteenTokenPrice = d===null ? 150 : d;
  saveDB(db);
  alert('Canteen token prices saved. They apply to months generated from now on; to apply them to a month already generated, click Regenerate on the Payroll page for that month.');
  settingsEdit=''; render('settings');
}

// Late waiver: the first N Late minutes of each month are free (lateGraceMinutes() in 12-payroll-calc.js).
function renderLateWaiverPanel(){
  const cur=monthKey(todayStr()), now=lateGraceMinutes(cur), active=lateWaiverFor(cur);
  const list=lateWaivers().slice().sort((a,b)=>a.from<b.from?1:-1);
  return `<div class="panel setCard"><div class="setCardHead"><h3>${ico('clock')} Late — free minutes</h3>${setEditButtons('late','saveLateWaiver','Save')}</div>
    <p class="setLead">The first <b>${now} minutes</b> of late in a month are free (${monthLabel(cur)}${active?'':', default'}). Beyond them, late comes off OT first, then is cut from pay.</p>
    <fieldset class="setEditFs" ${settingsEdit==='late'?'':'disabled'}>
    <div class="formGrid setRates">
      <div><label for="lw_minutes">Waiver (minutes per month)</label><input type="number" step="1" min="0" id="lw_minutes" value="${now}" placeholder="60"></div>
      <div><label for="lw_from">Applies from month</label><input type="month" id="lw_from" value="${cur}"></div>
    </div>
    </fieldset>
    <details class="repHow"><summary>${ico('alert')} How it's worked out</summary><p class="syncNote">Only the minutes beyond the free ones count: they come off the month's OT time first, and what OT cannot cover is cut from pay (one minute = Daily Wage ÷ 8 ÷ 60). Example with ${now} free minutes: 150 minutes late → ${Math.max(0,150-now)} minutes count. A change applies to Payroll straight away, from the month you choose onwards; earlier months keep theirs.</p></details>
    ${list.length?`<h4 style="margin:14px 0 6px;font-size:13px;">History</h4>
    <table class="setPriceTable"><thead><tr><th>From month</th><th class="num">Waiver</th><th></th></tr></thead><tbody>
      ${list.map(w=>`<tr><td>${monthLabel(w.from)}${active&&active.from===w.from?' <span class="tag Active">In use</span>':''}</td><td class="num">${Math.round(+w.minutes||0)} min</td>
        <td class="rowActions">${settingsEdit==='late'?`<button class="del" onclick="deleteLateWaiver('${w.from}')">${ico('trash')} Remove</button>`:''}</td></tr>`).join('')}
    </tbody></table>`:''}
  </div>`;
}
function saveLateWaiver(){
  if(!isAdmin() && !isSoftwareAdmin()){ alert('Only an administrator can change the late waiver.'); return; }
  const raw=String(document.getElementById('lw_minutes').value).trim(), from=document.getElementById('lw_from').value;
  if(raw==='' || isNaN(+raw) || +raw<0){ alert('Enter the waiver in minutes (for example 60).'); return; }
  if(!from){ alert('Choose the month the waiver applies from.'); return; }
  const s=getSettings();
  s.lateWaivers=lateWaivers().filter(w=>w.from!==from).concat([{from, minutes:Math.round(+raw), savedAt:new Date().toISOString()}]);
  saveDB(db);
  alert(`Late waiver of ${Math.round(+raw)} minutes saved from ${monthLabel(from)}. Payroll uses it straight away.`);
  settingsEdit=''; render('settings');
}
function deleteLateWaiver(from){
  if(!isAdmin() && !isSoftwareAdmin()){ alert('Only an administrator can change the late waiver.'); return; }
  if(settingsEdit!=='late'){ alert('Click Edit first.'); return; }
  if(!confirm(`Remove the late waiver set from ${monthLabel(from)}? Those months go back to the earlier waiver.`)) return;
  getSettings().lateWaivers=lateWaivers().filter(w=>w.from!==from);
  saveDB(db); render('settings');
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
    <p class="setLead">The list in the Employee form's Designation box. Renaming one updates every employee who has it.</p>
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

// PF & ESI (Admin and Software Admin only), shown and typed as percentages; savePayrollConstants
// (28-user-rights-backup.js) stores them as fractions. The tab also holds Late and Canteen.
function renderPayrollRatesPanel(){
  const s=getSettings(), pct=v=>Math.round((+v||0)*100*10000)/10000;
  const box=(id, label, v)=>`<div><label for="${id}">${label}</label><span class="setPct"><input type="number" step="0.01" min="0" id="${id}" value="${pct(v)}">%</span></div>`;
  return `<div class="panel setCard"><div class="setCardHead"><h3>${ico('percent')} PF &amp; ESI</h3>${setEditButtons('rates','savePayrollConstants','Save')}</div>
    <p class="setLead">PF is a share of Basic; ESI is a share of Total Earnings.</p>
    <fieldset class="setEditFs" ${settingsEdit==='rates'?'':'disabled'}>
    <div class="formGrid setRates">
      ${box('s_pfRate','PF — employee', s.pfRate)}
      ${box('s_pfEmployerRate','PF — employer', s.pfEmployerRate)}
      ${box('s_esiRate','ESI — employee', s.esiRate)}
      ${box('s_esiEmployerRate','ESI — employer', s.esiEmployerRate)}
    </div>
    </fieldset>
    <details class="repHow"><summary>${ico('alert')} How pay is worked out</summary><p class="syncNote"><b>Wages:</b> Basic = 60% and HRA = 40% of the Daily Wage, paid for each Present day (a Half Day counts ½) and paid holiday. <b>OT</b> per hour = Daily Wage ÷ 8 × the employee's OT Factor. <b>Late:</b> beyond the free minutes, late comes off OT first, then one minute = Daily Wage ÷ 8 ÷ 60. <b>Canteen:</b> tokens × the token price of the employee's unit. <b>NOWD</b> = days in the month − Sundays − paid holidays. A changed PF / ESI rate applies to months generated from now on; Regenerate a month on the Payroll page to apply it there.</p></details>
  </div>`;
}
