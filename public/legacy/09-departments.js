/* ================= DEPARTMENTS =================
   A department that no employee has had for more than 3 months is removed automatically
   (checked at every sign-in — ensureDepartments()). A department that any employee has —
   active, inactive or resigned — is always kept, so employee history keeps its department.
   db.departmentMeta[name] = {since: date added/first seen, lastUsed: last date an employee had it}. */
const COMPANY_DEPARTMENTS = ['Packing','Production','Quality Assurance','Housekeeping','Assembly','Dispatch','Stores'];
const DEPT_UNUSED_MONTHS = 3;
function deptAddMonths(dateStr, n){
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(Date.UTC(y, m-1+n, d));
  return dt.toISOString().slice(0,10);
}
// The date an unused department will be removed (3 months after it was last used / added).
function deptRemovalDate(name){
  const m=(db.departmentMeta||{})[name]||{};
  return deptAddMonths(m.lastUsed||m.since||todayStr(), DEPT_UNUSED_MONTHS);
}
function ensureDepartments(){
  if(!Array.isArray(db.departments)) db.departments=[];
  if(!db.departmentMeta || typeof db.departmentMeta!=='object') db.departmentMeta={};
  const today=todayStr();
  // One-time: add the company's departments (names already present, in any case, are kept as they are).
  if(!db.departmentsSeeded){
    COMPANY_DEPARTMENTS.forEach(n=>{ if(!db.departments.some(d=>d.toLowerCase()===n.toLowerCase())) db.departments.push(n); });
    db.departmentsSeeded=true;
  }
  const used=new Set((db.employees||[]).map(e=>e.department).filter(Boolean));
  // A department an employee has but that is missing from the list (e.g. restored data) comes back.
  used.forEach(d=>{ if(!db.departments.includes(d)) db.departments.push(d); });
  db.departments=db.departments.filter(d=>{
    const m=db.departmentMeta[d] || (db.departmentMeta[d]={since:today});
    if(used.has(d)){ m.lastUsed=today; return true; }
    if(deptRemovalDate(d) <= today){ delete db.departmentMeta[d]; return false; } // unused for 3+ months
    return true;
  });
  Object.keys(db.departmentMeta).forEach(k=>{ if(!db.departments.includes(k)) delete db.departmentMeta[k]; });
}
function renderDepartments(){
  return `
  ${hasPerm('departments','add') ? `<div class="toolbar">
    <input id="newDeptInput" placeholder="New department name">
    <button class="btn" onclick="addDepartment()">${ico('plus')} Add Department</button>
  </div>` : ''}
  <div class="panel">
    <p class="syncNote">A department that no employee has had for more than ${DEPT_UNUSED_MONTHS} months is removed automatically. Departments that any employee has — including inactive and resigned employees — are always kept.</p>
    <table><thead><tr><th>Department</th><th>Employees</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${db.departments.map(d=>{
        const count=db.employees.filter(e=>e.department===d).length;
        const status = count ? '<span class="tag Active">In use</span>' : `<span style="color:var(--muted);font-size:12.5px;">Unused — auto-removed on ${fmtDate(deptRemovalDate(d))}</span>`;
        return `<tr><td><b>${ico('tag')} ${d}</b></td><td>${count}</td><td>${status}</td><td class="rowActions">${hasPerm('departments','delete') ? `<button class="del" onclick="deleteDepartment('${d}')">${ico('trash')} Delete</button>` : ''}</td></tr>`;
      }).join('')}
    </tbody></table>
  </div>`;
}
function addDepartment(){
  if(!hasPerm('departments','add')){ alert('You do not have permission to add departments.'); return; }
  const v=document.getElementById('newDeptInput').value.trim();
  if(!v) return;
  if(db.departments.some(d=>d.toLowerCase()===v.toLowerCase())){ alert('Department already exists'); return; }
  db.departments.push(v);
  if(!db.departmentMeta) db.departmentMeta={};
  db.departmentMeta[v]={since:todayStr()}; // the 3-month clock starts now
  saveDB(db); render('departments');
}
function deleteDepartment(d){
  if(!hasPerm('departments','delete')){ alert('You do not have permission to delete departments.'); return; }
  if(db.employees.some(e=>e.department===d)){ alert('Cannot delete a department that employees have (including inactive or resigned employees).'); return; }
  if(!confirm('Delete department "'+d+'"?')) return;
  db.departments=db.departments.filter(x=>x!==d);
  if(db.departmentMeta) delete db.departmentMeta[d];
  saveDB(db); render('departments');
}

