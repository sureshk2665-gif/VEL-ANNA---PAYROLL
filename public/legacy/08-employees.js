/* ================= EMPLOYEES ================= */
let empFilter={search:'',dept:'',status:'',unit:'',contractor:'',group:''};
// Search keeps the cursor in the box while the list redraws.
function empSetSearch(el){ const pos=el.selectionStart; empFilter.search=el.value; render('employees'); const i=document.getElementById('empSearch'); if(i){ i.focus(); i.setSelectionRange(pos,pos); } }
function empGroupOf(e){ return typeof teEmpGroup==='function' ? (teEmpGroup(e.code)||'') : ''; }
// An employee with at least one empty form field (same rule as Software Admin → Download All
// Employee Details).
function empHasMissing(e){
  if(typeof employeeDetailIsMissing!=='function') return false;
  return employeeFields().some(f=>employeeDetailIsMissing(f, e, employeeDetailValue(f, e)));
}
function renderEmployees(){
  const depts=db.departments;
  // Employee List (Active + Inactive): resigned employees are never shown here — they live
  // exclusively in the Resigned Employees module until they rejoin. Employees are never
  // deleted (their history is kept); mark them Inactive or Resigned instead.
  const activeEmps=db.employees.filter(e=>e.status!=='Resigned');
  const activeCount=activeEmps.filter(e=>e.status!=='Inactive').length;
  const groups=typeof teGroups==='function' ? teGroups() : [];
  let list=activeEmps.filter(e=>{
    if(empFilter.status && (e.status||'Active')!==empFilter.status) return false;
    if(empFilter.search && !(`${e.name} ${e.code}`.toLowerCase().includes(empFilter.search.toLowerCase()))) return false;
    if(empFilter.dept && e.department!==empFilter.dept) return false;
    if(empFilter.unit && unitCodeOf(e.unit)!==empFilter.unit) return false;
    if(empFilter.contractor && (e.contractor||'')!==(empFilter.contractor==='-'?'':empFilter.contractor)) return false;
    if(empFilter.group && (empGroupOf(e)||'-')!==empFilter.group) return false;
    return true;
  });
  const noGroup=list.filter(e=>!empGroupOf(e)).length;
  const missing=list.filter(empHasMissing).length;
  const unitTab=(code,label)=>`<button type="button" role="tab" class="attUnitTab ${empFilter.unit===code?'active':''}" aria-selected="${empFilter.unit===code}" onclick="empFilter.unit='${code}';render('employees')">${label}</button>`;
  return `
  <div class="attUnitTabs empUnitTabs" role="tablist" aria-label="Working unit">
    ${unitTab('','All Units')}${getUnits().map(u=>unitTab(u.code, unitTabLabel(u))).join('')}
  </div>
  <div class="toolbar empBar">
    <div class="empBarGrp">
      <div class="searchWrap"><span class="sIcon">${ico('search')}</span><input id="empSearch" placeholder="Search name or code..." aria-label="Search name or code" oninput="empSetSearch(this)" value="${empFilter.search}"></div>
      <select onchange="empFilter.dept=this.value;render('employees')" aria-label="Department">
        <option value="">All Departments</option>
        ${depts.map(d=>`<option ${empFilter.dept===d?'selected':''}>${d}</option>`).join('')}
      </select>
      <select onchange="empFilter.contractor=this.value;render('employees')" aria-label="Contractor">
        <option value="">All Contractors</option>
        ${getContractors().map(c=>`<option value="${c.code}" ${empFilter.contractor===c.code?'selected':''}>${c.name||c.code}</option>`).join('')}
      </select>
      <select onchange="empFilter.group=this.value;render('employees')" aria-label="Shift group">
        <option value="">All Groups</option>
        ${groups.map(g=>`<option value="${g.key}" ${empFilter.group===g.key?'selected':''}>${g.label}</option>`).join('')}
        <option value="-" ${empFilter.group==='-'?'selected':''}>No group</option>
      </select>
      <select onchange="empFilter.status=this.value;render('employees')" aria-label="Status">
        <option value="">Active &amp; Inactive</option>
        ${['Active','Inactive'].map(s=>`<option ${empFilter.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    ${hasPerm('employees','add') ? `<button class="btn" onclick="openEmployeeModal()">${ico('plus')} Add Employee</button>` : ''}
  </div>
  <div class="teStatRow empStrip">
    <div class="teStatBox"><b>${list.length}</b><span>Shown${list.length!==activeEmps.length?' of '+activeEmps.length:''}</span></div>
    <div class="teStatBox ok"><b>${activeCount}</b><span>Active</span></div>
    <div class="teStatBox"><b>${activeEmps.length-activeCount}</b><span>Inactive</span></div>
    <div class="teStatBox ${noGroup?'warn':''}" title="Set groups in Employee Time Entry → Shift Groups"><b>${noGroup}</b><span>No shift group</span></div>
    <div class="teStatBox ${missing?'warn':''}" title="Employees with at least one empty field in the employee form"><b>${missing}</b><span>Details missing</span></div>
  </div>
  <div class="panel empPanel">
    ${list.length? `<div class="tableScrollWrap empScroll"><table class="empTable"><thead><tr>
      <th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Working Unit</th><th>Contractor</th><th title="Shift group (Employee Time Entry → Shift Groups)">Group</th><th class="num">Daily Wage</th><th>Status</th><th></th>
    </tr></thead><tbody>
      ${list.map(e=>`<tr>
        <td class="empCode">${e.code}</td><td class="empNameCell"><b>${e.name}</b></td><td>${e.department||'-'}</td><td>${e.designation||'-'}</td>
        <td>${unitLabel(e.unit)}</td><td>${contractorName(e)||'-'}</td>
        <td>${empGroupCell(e)}</td><td class="num"><b>${fmt(e.dailyWage||0)}</b></td>
        <td>${(e.status||'Active')==='Active' ? '<span class="empActive">Active</span>' : `<span class="tag ${e.status}">${e.status}</span>${e.status==='Inactive'&&e.inactiveFrom?`<span class="empSince">from ${fmtDate(e.inactiveFrom)}</span>`:''}`}</td>
        <td class="rowActions">
          ${hasPerm('employees','edit') ? `<button onclick="openEmployeeModal('${e.code}')">${ico('pencil')} Edit</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">'+ico('search-x')+' No employees found. Try adjusting your search or filters.</div>'}
  </div>`;
}

/* ================= RESIGNED EMPLOYEES ================= */
let resignedFilter={search:''};
function renderResigned(){
  const list=db.employees.filter(e=>e.status==='Resigned').filter(e=>{
    if(resignedFilter.search && !(`${e.name} ${e.code}`.toLowerCase().includes(resignedFilter.search.toLowerCase()))) return false;
    return true;
  }).sort((a,b)=>(b.resignationDate||'').localeCompare(a.resignationDate||''));
  return `
  <div class="toolbar">
    <div class="searchWrap"><span class="sIcon">${ico('search')}</span><input placeholder="Search name or code..." oninput="resignedFilter.search=this.value;render('resigned')" value="${resignedFilter.search}"></div>
    <span style="font-size:12.5px;color:var(--muted);">${list.length} resigned employee(s)</span>
  </div>
  <div class="panel">
    ${list.length? `<table><thead><tr>
      <th>Employee ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Date of Joining</th><th>Resignation Date</th><th>Reason</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${list.map(e=>`<tr>
        <td>${e.code}</td><td class="empNameCell"><span class="avatarChip">${initials(e.name)}</span>${e.name}</td><td>${e.department||'-'}</td><td>${e.designation||'-'}</td>
        <td>${e.joining?fmtDate(e.joining):'-'}</td><td>${e.resignationDate?fmtDate(e.resignationDate):'-'}</td>
        <td>${e.resignReason||'-'}</td><td><span class="tag Resigned">Resigned</span></td>
        <td class="rowActions">
          ${hasPerm('employees','edit') ? `<button onclick="openRejoinModal('${e.code}')">↩️ Rejoin</button>` : ''}
          ${hasPerm('employees','edit') ? `<button onclick="openEmployeeModal('${e.code}')">${ico('pencil')} Edit</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">'+ico('search-x')+' No resigned employees.</div>'}
  </div>`;
}
function openRejoinModal(code){
  if(!hasPerm('employees','edit')){ alert('You do not have permission to do this.'); return; }
  const e=db.employees.find(x=>x.code===code);
  if(!e) return;
  document.getElementById('modalContent').innerHTML=`
    <h3>Rejoin Employee — ${e.name} (${e.code})</h3>
    <div class="formGrid">
      <div class="full"><label>Rejoin Date *</label><input type="date" id="f_rejoinDate" value="${todayStr()}"></div>
    </div>
    <div class="modalActions">
      <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn" onclick="confirmRejoin('${e.code}')">Confirm Rejoin</button>
    </div>`;
  showModal();
}
function confirmRejoin(code){
  const rejoinDate=document.getElementById('f_rejoinDate').value;
  if(!rejoinDate){ alert('Please enter the Rejoin Date.'); return; }
  const e=db.employees.find(x=>x.code===code);
  if(!e) return;
  if(!e.employmentHistory) e.employmentHistory=[];
  // Close out the just-ended resignation stint in the history log before reopening.
  e.employmentHistory.push({joinDate:e.joining||'', resignDate:e.resignationDate||'', reason:e.resignReason||''});
  e.rejoinDate=rejoinDate;
  e.joining=rejoinDate; // current stint now begins on the rejoin date
  e.status='Active';
  e.resignationDate='';
  e.resignReason='';
  saveDB(db);
  closeModal();
  render('resigned');
}
function nextEmpCode(){
  const n=db.nextEmpNum; db.nextEmpNum++; saveDB(db);
  return 'EMP'+String(n).padStart(3,'0');
}
/* ---- Bulk Import (Excel) — Software Admin only ----
   Opened from Software Admin → Bulk Import Employees. The dialog is a React component
   (src/features/employee-import/BulkImportDialog.jsx); it is opened with the
   'vipl:open-bulk-import' event and uses the two functions below. */
function openBulkImport(){
  if(!isSoftwareAdmin()){ alert('You do not have permission to bulk import employees.'); return; }
  closeModal();
  window.dispatchEvent(new CustomEvent('vipl:open-bulk-import'));
}
// What the Bulk Import dialog needs to build the template and check uploaded rows.
function employeeImportContext(){
  return {
    canAdd: isSoftwareAdmin(),
    companyName: db.companyName||'',
    filePrefix: companyFilePrefix(),
    username: currentUser ? currentUser.username : '',
    departments: (db.departments||[]).slice(),
    designations: designationList().slice(),
    fields: employeeSheetFields(),
    employees: (db.employees||[]).map(e=>({code:e.code, name:e.name, aadhaar:e.aadhaar||'', pan:e.pan||'', accNo:e.accNo||''}))
  };
}
// Adds already-validated NEW employees (fields as produced by the import) exactly like saving the
// Add Employee form once per employee, but with a single save at the end.
async function importEmployees(list){
  if(!isSoftwareAdmin()){ alert('You do not have permission to bulk import employees.'); return null; }
  if(!Array.isArray(list) || !list.length) return null;
  const codes=[];
  const now=new Date().toISOString();
  list.forEach(f=>{
    const code='EMP'+String(db.nextEmpNum).padStart(3,'0');
    db.nextEmpNum++;
    db.employees.push({
      // Same fields as the Add Employee form (employeeRecordFromSheet in 07b-employee-fields.js).
      ...employeeRecordFromSheet(f),
      ...employeeWageFields(f.dailyWage),
      code,
      status:'Active',
      resignationDate:'',
      resignReason:'',
      employmentHistory:[],
      originalJoining:f.joining||'',
      rejoinDate:'',
      createdAt:now
    });
    codes.push(code);
  });
  const saved=await saveDB(db);
  render('employees');
  return { saved, codes };
}
// Changing an employee's daily wage once they have been paid: ask from which date the new wage applies,
// so months before it keep the old wage when payroll is recomputed (wageOnDate). Returns a
// wageHistory entry, null when no question is needed, or false if the user cancelled.
function askWageEffectiveDate(prior, newWage){
  const oldWage=currentDailyWage(prior);
  if(!oldWage || Math.round(oldWage*100)===Math.round(newWage*100)) return null;
  const paidBefore=Object.keys(db.payroll||{}).some(ym=>payrollGenerated(ym) && isEmpOnRollInMonth(prior, ym));
  if(!paidBefore) return null; // never paid yet: the new wage simply applies to every month
  const t=todayStr(), def='01-'+t.slice(5,7)+'-'+t.slice(0,4);
  let ans=prompt(`Daily wage changed from ₹${oldWage} to ₹${newWage}.\n\nFrom which date should the new wage apply? Payroll before this date stays at ₹${oldWage}.\n(DD-MM-YYYY)`, def);
  while(ans!==null){
    const m=String(ans).trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/) || String(ans).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let ds='';
    if(m) ds = m[1].length===4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    if(ds && !isNaN(new Date(ds+'T00:00:00'))) return {from:ds, prev:oldWage, wage:newWage, at:new Date().toISOString(), by:currentUser?currentUser.username:''};
    ans=prompt('Please enter the date as DD-MM-YYYY (for example '+def+').', def);
  }
  return false;
}
function openEmployeeModal(code){
  if(code ? !hasPerm('employees','edit') : !hasPerm('employees','add')){ alert('You do not have permission to do this.'); return; }
  const editing = code ? db.employees.find(e=>e.code===code) : null;
  const e = editing || {code:'', status:'Active'};
  document.getElementById('modalContent').innerHTML = `
    <h3>${editing?'Edit Employee':'Add Employee'}${editing?` <span class="empFormWho">${editing.code} · ${editing.name}</span>`:''}</h3>
    <div class="teTabs empFormTabs" role="tablist">
      ${employeeFieldSections().map((sec,i)=>`<div class="teTab ${i?'':'active'}" role="tab" tabindex="0" data-sec="${sec.key}" onclick="empFormTab('${sec.key}')" onkeydown="if(event.key==='Enter')empFormTab('${sec.key}')">${sec.title}</div>`).join('')}
    </div>
    <form id="empForm" class="empFormTabbed">
    ${employeeFormHtml(e)}

    <div class="modalActions empFormActions">
      <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn" onclick="empFormReveal()">${editing?'Save Changes':'Add Employee'}</button>
    </div>
    </form>`;
  // Fields come from employeeFields() (public/legacy/07b-employee-fields.js) — selects are pre-selected there.
  document.getElementById('empForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    saveEmployee(editing?editing.code:null);
  });
  empFormTab(employeeFieldSections()[0].key);
  showModal();
}
// The form shows one section at a time (Basic / Bank & Statutory / Salary); every field stays in
// the form, so saving reads them all as before.
function empFormTab(key){
  document.querySelectorAll('#empForm fieldset[data-sec]').forEach(f=>{ f.hidden=f.dataset.sec!==key; });
  document.querySelectorAll('.empFormTabs .teTab').forEach(t=>{ const on=t.dataset.sec===key; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
}
// Before the browser checks the form: open the tab holding the first field that needs fixing,
// so its message can be shown.
function empFormReveal(){
  const bad=document.querySelector('#empForm :invalid');
  const fs=bad && bad.closest('fieldset[data-sec]');
  if(fs) empFormTab(fs.dataset.sec);
}
function toggleResignationField(status){
  const wrap=document.getElementById('f_resignationWrap');
  if(wrap) wrap.style.display = status==='Resigned' ? '' : 'none';
  const reasonWrap=document.getElementById('f_resignReasonWrap');
  if(reasonWrap) reasonWrap.style.display = status==='Resigned' ? '' : 'none';
  const inactiveWrap=document.getElementById('f_inactiveWrap');
  if(inactiveWrap) inactiveWrap.style.display = status==='Inactive' ? '' : 'none';
  const inactiveFrom=document.getElementById('f_inactiveFrom');
  if(status==='Inactive' && inactiveFrom && !inactiveFrom.value) inactiveFrom.value=todayStr();
}
function saveEmployee(existingCode){
  // Every form field (see employeeFields() in 07b-employee-fields.js), read in one go.
  const f=readEmployeeFormFields();
  const name=f.name;
  if(!name){ alert('Name is required'); return; }
  const status=f.status;
  let resignationDate = f.resignationDate||'';
  let resignReason = f.resignReason||'';
  if(status==='Resigned' && !resignationDate){ alert('Please enter the Resignation Date.'); return; }
  if(status!=='Resigned'){ resignationDate=''; resignReason=''; }
  const inactiveFrom = status==='Inactive' ? (f.inactiveFrom||'') : '';
  if(status==='Inactive' && !inactiveFrom){ alert('Please enter the Inactive From date.'); return; }
  Object.assign(f, employeeWageFields(f.dailyWage)); // Basic / HRA always follow the daily wage
  const prior = existingCode ? db.employees.find(e=>e.code===existingCode) : null;
  const wageHistory = prior ? (prior.wageHistory||[]).slice() : [];
  const wageChange = prior ? askWageEffectiveDate(prior, +f.dailyWage||0) : null;
  if(wageChange===false) return; // cancelled
  if(wageChange) wageHistory.push(wageChange);
  const joiningVal=f.joining||'';
  const data={
    ...f,
    code: existingCode || nextEmpCode(),
    name,
    status,
    resignationDate,
    resignReason,
    inactiveFrom,
    employmentHistory: prior ? (prior.employmentHistory||[]) : [],
    incrementHistory: prior ? (prior.incrementHistory||[]) : [],
    wageHistory,
    originalJoining: prior ? (prior.originalJoining || joiningVal) : joiningVal,
    rejoinDate: prior ? (prior.rejoinDate||'') : '',
    createdAt: existingCode ? (db.employees.find(e=>e.code===existingCode).createdAt) : new Date().toISOString()
  };
  const idx=db.employees.findIndex(e=>e.code===data.code);
  if(idx>-1) db.employees[idx]=data; else db.employees.push(data);
  saveDB(db);
  closeModal();
  render(data.status==='Resigned' ? 'resigned' : 'employees');
}
// Shift group shown on the Employees list (set in Employee Time Entry → Shift Groups).
function empGroupCell(e){
  const g=typeof teEmpGroup==='function' ? teEmpGroup(e.code) : '';
  return g ? teGroupBadge(g) : '<span style="color:var(--muted);">No group</span>';
}
