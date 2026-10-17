/* ================= EMPLOYEES ================= */
let empFilter={search:'',dept:'',status:''};
function renderEmployees(){
  const depts=db.departments;
  // Active Employee List: resigned employees are never shown here — they live exclusively
  // in the Resigned Employees module until they rejoin.
  const activeEmps=db.employees.filter(e=>e.status!=='Resigned');
  let list=activeEmps.filter(e=>{
    if(empFilter.search && !(`${e.name} ${e.code}`.toLowerCase().includes(empFilter.search.toLowerCase()))) return false;
    if(empFilter.dept && e.department!==empFilter.dept) return false;
    return true;
  });
  return `
  <div class="toolbar">
    <div class="searchWrap"><span class="sIcon">🔍</span><input placeholder="Search name or code..." oninput="empFilter.search=this.value;render('employees')" value="${empFilter.search}"></div>
    <select onchange="empFilter.dept=this.value;render('employees')">
      <option value="">All Departments</option>
      ${depts.map(d=>`<option ${empFilter.dept===d?'selected':''}>${d}</option>`).join('')}
    </select>
    <span style="font-size:12.5px;color:var(--muted);">${list.length} of ${activeEmps.length} active employee(s)</span>
    ${hasPerm('employees','add') ? `<button class="btn" style="margin-left:auto;" onclick="openAddEmployeeChooser()">+ Add Employee</button>` : ''}
  </div>
  <div class="panel">
    ${list.length? `<table><thead><tr>
      <th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Working Unit</th><th>Mobile</th><th>Net Salary</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${list.map(e=>`<tr>
        <td>${e.code}</td><td class="empNameCell"><span class="avatarChip">${initials(e.name)}</span>${e.name}</td><td>${e.department||'-'}</td><td>${e.designation||'-'}</td>
        <td>${unitLabel(e.unit)}</td>
        <td>${e.mobile||'-'}</td><td><b>${fmt(calcNet(e))}</b></td><td><span class="tag ${e.status}">${e.status}</span></td>
        <td class="rowActions">
          ${hasPerm('employees','edit') ? `<button onclick="openEmployeeModal('${e.code}')">✏️ Edit</button>` : ''}
          ${hasPerm('employees','delete') ? `<button class="del" onclick="deleteEmployee('${e.code}')">🗑️ Delete</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">🔎 No employees found. Try adjusting your search or filters.</div>'}
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
    <div class="searchWrap"><span class="sIcon">🔍</span><input placeholder="Search name or code..." oninput="resignedFilter.search=this.value;render('resigned')" value="${resignedFilter.search}"></div>
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
          ${hasPerm('employees','edit') ? `<button onclick="openEmployeeModal('${e.code}')">✏️ Edit</button>` : ''}
          ${hasPerm('employees','delete') ? `<button class="del" onclick="deleteEmployee('${e.code}')">🗑️ Delete</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table>` : '<div class="empty">🔎 No resigned employees.</div>'}
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
/* ---- "+ Add Employee" choice: Add Manually (the form below) or Bulk Import (Excel) ----
   The Bulk Import dialog is a React component (src/features/employee-import/BulkImportDialog.jsx);
   it is opened with the 'vipl:open-bulk-import' event and uses the two functions below. */
function openAddEmployeeChooser(){
  if(!hasPerm('employees','add')){ alert('You do not have permission to do this.'); return; }
  document.getElementById('modalContent').innerHTML = `
    <h3>Add Employee</h3>
    <p style="color:var(--muted);font-size:13px;margin:-4px 0 16px;">How would you like to add employees?</p>
    <div class="addEmpChoices">
      <button type="button" class="addEmpChoice" onclick="openEmployeeModal()">
        <span class="addEmpChoiceIcon">✍️</span>
        <span><b>Add Manually</b><small>Fill in the form for one employee</small></span>
      </button>
      <button type="button" class="addEmpChoice" onclick="openBulkImport()">
        <span class="addEmpChoiceIcon">📥</span>
        <span><b>Bulk Import</b><small>Upload an Excel file with one or more new employees</small></span>
      </button>
    </div>
    <div class="modalActions"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div>`;
  showModal();
}
function openBulkImport(){
  closeModal();
  window.dispatchEvent(new CustomEvent('vipl:open-bulk-import'));
}
// What the Bulk Import dialog needs to build the template and check uploaded rows.
function employeeImportContext(){
  return {
    canAdd: hasPerm('employees','add'),
    username: currentUser ? currentUser.username : '',
    departments: (db.departments||[]).slice(),
    fields: employeeSheetFields(),
    employees: (db.employees||[]).map(e=>({code:e.code, name:e.name, aadhaar:e.aadhaar||'', pan:e.pan||'', accNo:e.accNo||''}))
  };
}
// Adds already-validated NEW employees (fields as produced by the import) exactly like saving the
// Add Employee form once per employee, but with a single save at the end.
async function importEmployees(list){
  if(!hasPerm('employees','add')){ alert('You do not have permission to add employees.'); return null; }
  if(!Array.isArray(list) || !list.length) return null;
  const codes=[];
  const now=new Date().toISOString();
  list.forEach(f=>{
    const code='EMP'+String(db.nextEmpNum).padStart(3,'0');
    db.nextEmpNum++;
    db.employees.push({
      // Same fields as the Add Employee form (employeeRecordFromSheet in 07b-employee-fields.js).
      ...employeeRecordFromSheet(f),
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
function openEmployeeModal(code){
  if(code ? !hasPerm('employees','edit') : !hasPerm('employees','add')){ alert('You do not have permission to do this.'); return; }
  const editing = code ? db.employees.find(e=>e.code===code) : null;
  const e = editing || {code:'', status:'Active'};
  document.getElementById('modalContent').innerHTML = `
    <h3>${editing?'Edit Employee':'Add Employee'}</h3>
    <form id="empForm">
    ${employeeFormHtml(e)}

    <div class="modalActions">
      <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn">${editing?'Save Changes':'Add Employee'}</button>
    </div>
    </form>`;
  // Fields come from employeeFields() (public/legacy/07b-employee-fields.js) — selects are pre-selected there.
  document.getElementById('empForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    saveEmployee(editing?editing.code:null);
  });
  showModal();
}
function toggleResignationField(status){
  const wrap=document.getElementById('f_resignationWrap');
  if(wrap) wrap.style.display = status==='Resigned' ? '' : 'none';
  const reasonWrap=document.getElementById('f_resignReasonWrap');
  if(reasonWrap) reasonWrap.style.display = status==='Resigned' ? '' : 'none';
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
  const prior = existingCode ? db.employees.find(e=>e.code===existingCode) : null;
  const joiningVal=f.joining||'';
  const data={
    ...f,
    code: existingCode || nextEmpCode(),
    name,
    status,
    resignationDate,
    resignReason,
    employmentHistory: prior ? (prior.employmentHistory||[]) : [],
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
function deleteEmployee(code){
  if(!hasPerm('employees','delete')){ alert('You do not have permission to delete employees.'); return; }
  if(!confirm('Delete this employee? This cannot be undone.')) return;
  const wasResigned = (db.employees.find(e=>e.code===code)||{}).status==='Resigned';
  db.employees=db.employees.filter(e=>e.code!==code);
  saveDB(db);
  render(wasResigned ? 'resigned' : 'employees');
}

