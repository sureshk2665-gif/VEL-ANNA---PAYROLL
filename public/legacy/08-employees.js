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
    ${hasPerm('employees','add') ? `<button class="btn" style="margin-left:auto;" onclick="openEmployeeModal()">+ Add Employee</button>` : ''}
  </div>
  <div class="panel">
    ${list.length? `<table><thead><tr>
      <th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Working Unit</th><th>Mobile</th><th>Net Salary</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${list.map(e=>`<tr>
        <td>${e.code}</td><td class="empNameCell"><span class="avatarChip">${initials(e.name)}</span>${e.name}</td><td>${e.department||'-'}</td><td>${e.designation||'-'}</td>
        <td>${(e.unit==='Unit-2'?(db.unit2Name||'Unit-2'):(db.unit1Name||'Unit-1'))}</td>
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
function openEmployeeModal(code){
  if(code ? !hasPerm('employees','edit') : !hasPerm('employees','add')){ alert('You do not have permission to do this.'); return; }
  const editing = code ? db.employees.find(e=>e.code===code) : null;
  const e = editing || {code:'', status:'Active'};
  document.getElementById('modalContent').innerHTML = `
    <h3>${editing?'Edit Employee':'Add Employee'}</h3>
    <form id="empForm">
    <fieldset><legend>Basic Information</legend>
    <div class="formGrid">
      <div><label>Employee Code</label><input value="${e.code||'(auto)'}" disabled></div>
      <div><label>Status</label><select id="f_status" onchange="toggleResignationField(this.value)"><option ${e.status==='Active'?'selected':''}>Active</option><option ${e.status==='Resigned'?'selected':''}>Resigned</option></select></div>
      <div id="f_resignationWrap" style="${e.status==='Resigned'?'':'display:none;'}"><label>Resignation Date</label><input type="date" id="f_resignationDate" value="${e.resignationDate||''}"></div>
      <div class="full" id="f_resignReasonWrap" style="${e.status==='Resigned'?'':'display:none;'}"><label>Reason for Resignation (Optional)</label><input id="f_resignReason" value="${e.resignReason||''}"></div>
      <div><label>Full Name *</label><input id="f_name" value="${e.name||''}" required></div>
      <div><label>Gender</label><select id="f_gender"><option ${e.gender==='Male'?'selected':''}>Male</option><option ${e.gender==='Female'?'selected':''}>Female</option><option ${e.gender==='Other'?'selected':''}>Other</option></select></div>
      <div><label>Date of Birth</label><input type="date" id="f_dob" value="${e.dob||''}"></div>
      <div><label>Father / Husband Name</label><input id="f_relative" value="${e.relative||''}"></div>
      <div><label>Mobile Number</label><input id="f_mobile" value="${e.mobile||''}"></div>
      <div><label>Email</label><input id="f_email" value="${e.email||''}"></div>
      <div class="full"><label>Address</label><input id="f_address" value="${e.address||''}"></div>
      <div><label>Joining Date</label><input type="date" id="f_joining" value="${e.joining||''}"></div>
      <div><label>Department</label><select id="f_dept">${db.departments.map(d=>`<option ${e.department===d?'selected':''}>${d}</option>`).join('')}</select></div>
      <div><label>Designation</label><input id="f_designation" value="${e.designation||''}"></div>
      <div><label>Employment Type</label><select id="f_empType"><option>Full-Time</option><option>Part-Time</option><option>Contract</option></select></div>
      <div><label>Working Unit</label><select id="f_unit"><option ${(!e.unit||e.unit==='Unit-1')?'selected':''} value="Unit-1">${db.unit1Name||'Unit-1'}</option><option ${e.unit==='Unit-2'?'selected':''} value="Unit-2">${db.unit2Name||'Unit-2'}</option></select></div>
    </div></fieldset>

    <fieldset><legend>Bank &amp; Statutory Details</legend>
    <div class="formGrid">
      <div><label>Bank Name</label><input id="f_bankName" value="${e.bankName||''}"></div>
      <div><label>Branch</label><input id="f_branch" value="${e.branch||''}"></div>
      <div><label>Account Number</label><input id="f_accNo" value="${e.accNo||''}"></div>
      <div><label>IFSC</label><input id="f_ifsc" value="${e.ifsc||''}"></div>
      <div><label>PAN Number</label><input id="f_pan" value="${e.pan||''}"></div>
      <div><label>Aadhaar Number</label><input id="f_aadhaar" value="${e.aadhaar||''}"></div>
      <div><label>PF Number</label><input id="f_pfNo" value="${e.pfNo||''}"></div>
      <div><label>ESI Number</label><input id="f_esiNo" value="${e.esiNo||''}"></div>
      <div><label>UAN Number</label><input id="f_uan" value="${e.uan||''}"></div>
    </div></fieldset>

    <fieldset><legend>Salary Details (Monthly ₹ — "Scale")</legend>
    <div class="formGrid">
      <div><label>Basic Salary</label><input type="number" id="f_basic" value="${e.basic||0}"></div>
      <div><label>HRA</label><input type="number" id="f_hra" value="${e.hra||0}"></div>
      <div><label>DA</label><input type="number" id="f_da" value="${e.da||0}"></div>
      <div><label>Special Allowance</label><input type="number" id="f_special" value="${e.special||0}"></div>
      <div><label>Medical Allowance</label><input type="number" id="f_medical" value="${e.medical||0}"></div>
      <div><label>Conveyance</label><input type="number" id="f_conveyance" value="${e.conveyance||0}"></div>
      <div><label>Washing Allowance</label><input type="number" id="f_washing" value="${e.washing||0}"></div>
      <div><label>Other Allowance</label><input type="number" id="f_other" value="${e.other||0}"></div>
      <div><label>OT Rate (auto: Basic ÷ 26 ÷ 8 hrs × 2)</label><input type="number" id="f_otRate" value="${e.otRate||0}" disabled title="OT rate is auto-calculated from Basic salary ÷ 26 ÷ 8 hrs × 2 and is no longer entered manually."></div>
      <div><label>Payment Mode</label><select id="f_mode"><option>NEFT</option><option>TRANSFER</option><option>CASH</option><option>CHEQUE</option></select></div>
      <div><label>PF Deduction</label><select id="f_pfApplicable"><option value="yes">Yes</option><option value="no">Exempted</option><option value="nil">Nil</option></select></div>
      <div><label>ESI Deduction</label><select id="f_esiApplicable"><option value="yes">Yes</option><option value="no">Exempted</option></select></div>
      <div><label>Professional Tax / Income Tax</label><input type="number" id="f_pt" value="${e.pt||0}"></div>
      <div><label>Canteen Rate (per day ₹) — not used in payroll</label><input type="number" id="f_canteenRate" value="${e.canteenRate||0}" disabled title="Fixed per-day canteen deduction has been removed from payroll. Only Lunch/Dinner tokens are deducted now."></div>
      <div><label>Rent Deduction (monthly)</label><input type="number" id="f_rent" value="${e.rent||0}"></div>
      <div><label>Other Deductions (fixed)</label><input type="number" id="f_otherDed" value="${e.otherDed||0}"></div>
      <div><label>CL Balance</label><input type="number" id="f_clBalance" value="${e.clBalance||0}"></div>
      <div><label>NOPL Balance (Opening)</label><input type="number" id="f_noplBalance" value="${e.noplBalance||0}" title="Opening NOPL (Paid Leave) balance. Paid Leave marked in Attendance is auto-deducted from this to get the balance shown on the Salary Slip."></div>
    </div></fieldset>

    <div class="modalActions">
      <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn">${editing?'Save Changes':'Add Employee'}</button>
    </div>
    </form>`;
  // restore selects properly (since template above sets 'selected' before options generated dynamically for gender/empType, fix manually)
  if(e.gender) document.getElementById('f_gender').value=e.gender;
  if(e.empType) document.getElementById('f_empType').value=e.empType;
  if(e.mode) document.getElementById('f_mode').value=e.mode;
  document.getElementById('f_esiApplicable').value = e.esiApplicable===false ? 'no' : 'yes';
  document.getElementById('f_pfApplicable').value = e.pfDeduction || (e.pfApplicable===false ? 'no' : 'yes');
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
  const name=document.getElementById('f_name').value.trim();
  if(!name){ alert('Name is required'); return; }
  const status=document.getElementById('f_status').value;
  let resignationDate = document.getElementById('f_resignationDate') ? document.getElementById('f_resignationDate').value : '';
  let resignReason = document.getElementById('f_resignReason') ? document.getElementById('f_resignReason').value.trim() : '';
  if(status==='Resigned' && !resignationDate){ alert('Please enter the Resignation Date.'); return; }
  if(status!=='Resigned'){ resignationDate=''; resignReason=''; }
  const prior = existingCode ? db.employees.find(e=>e.code===existingCode) : null;
  const joiningVal=document.getElementById('f_joining').value;
  const data={
    code: existingCode || nextEmpCode(),
    name,
    status,
    resignationDate,
    resignReason,
    employmentHistory: prior ? (prior.employmentHistory||[]) : [],
    originalJoining: prior ? (prior.originalJoining || joiningVal) : joiningVal,
    rejoinDate: prior ? (prior.rejoinDate||'') : '',
    gender:document.getElementById('f_gender').value,
    dob:document.getElementById('f_dob').value,
    relative:document.getElementById('f_relative').value,
    mobile:document.getElementById('f_mobile').value,
    email:document.getElementById('f_email').value,
    address:document.getElementById('f_address').value,
    joining:document.getElementById('f_joining').value,
    department:document.getElementById('f_dept').value,
    designation:document.getElementById('f_designation').value,
    empType:document.getElementById('f_empType').value,
    unit:document.getElementById('f_unit').value,
    bankName:document.getElementById('f_bankName').value,
    branch:document.getElementById('f_branch').value,
    accNo:document.getElementById('f_accNo').value,
    ifsc:document.getElementById('f_ifsc').value,
    pan:document.getElementById('f_pan').value,
    aadhaar:document.getElementById('f_aadhaar').value,
    pfNo:document.getElementById('f_pfNo').value,
    esiNo:document.getElementById('f_esiNo').value,
    uan:document.getElementById('f_uan').value,
    basic:+document.getElementById('f_basic').value||0,
    hra:+document.getElementById('f_hra').value||0,
    da:+document.getElementById('f_da').value||0,
    special:+document.getElementById('f_special').value||0,
    medical:+document.getElementById('f_medical').value||0,
    conveyance:+document.getElementById('f_conveyance').value||0,
    washing:+document.getElementById('f_washing').value||0,
    other:+document.getElementById('f_other').value||0,
    otRate:+document.getElementById('f_otRate').value||0,
    mode:document.getElementById('f_mode').value,
    pfDeduction: document.getElementById('f_pfApplicable').value,
    pfApplicable: document.getElementById('f_pfApplicable').value==='yes',
    esiApplicable: document.getElementById('f_esiApplicable').value==='yes',
    pt:+document.getElementById('f_pt').value||0,
    canteenRate:+document.getElementById('f_canteenRate').value||0,
    rent:+document.getElementById('f_rent').value||0,
    otherDed:+document.getElementById('f_otherDed').value||0,
    clBalance:+document.getElementById('f_clBalance').value||0,
    noplBalance:+document.getElementById('f_noplBalance').value||0,
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

