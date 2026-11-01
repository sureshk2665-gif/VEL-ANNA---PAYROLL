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
function deptEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Opens the Employees list showing only this department.
function deptOpenEmployees(d){ empFilter.dept=d; render('employees'); }
function renderDepartments(){
  const canAdd=hasPerm('departments','add'), canDel=hasPerm('departments','delete');
  const info=db.departments.map(d=>{
    const all=db.employees.filter(e=>e.department===d);
    const onRoll=all.filter(e=>e.status!=='Resigned').length;
    return {d, all:all.length, onRoll};
  }).sort((x,y)=>(y.all>0)-(x.all>0) || y.onRoll-x.onRoll || x.d.localeCompare(y.d));
  const inUse=info.filter(x=>x.all).length, maxOn=Math.max(1,...info.map(x=>x.onRoll));
  const onRollTotal=db.employees.filter(e=>e.status!=='Resigned').length;
  const noDept=db.employees.filter(e=>e.status!=='Resigned' && !e.department).length;
  const rows=info.map(x=>{
    const pct=Math.round(x.onRoll/maxOn*100);
    const status=x.all
      ? `<span class="tag Active">In use</span>`
      : `<span class="deptUnused">Unused — auto-removed on ${fmtDate(deptRemovalDate(x.d))}</span>`;
    return `<tr class="${x.all?'':'deptIdle'}">
      <td><b>${deptEsc(x.d)}</b></td>
      <td><div class="deptCount"><div class="deptBar"><i style="width:${x.onRoll?Math.max(pct,3):0}%"></i></div><span>${x.onRoll}</span></div></td>
      <td class="num deptOld">${x.all-x.onRoll||'—'}</td>
      <td>${status}</td>
      <td class="rowActions">
        ${x.onRoll && canOpenModule('employees')?`<button onclick="deptOpenEmployees('${deptEsc(x.d).replace(/'/g,"\\'")}')">${ico('users')} Employees</button>`:''}
        ${!x.all && canDel?`<button class="del" onclick="deleteDepartment('${deptEsc(x.d).replace(/'/g,"\\'")}')">${ico('trash')} Delete</button>`:''}
      </td></tr>`;
  }).join('');
  return `
  <div class="teStatRow deptStrip">
    <div class="teStatBox"><b>${db.departments.length}</b><span>Departments</span></div>
    <div class="teStatBox ok"><b>${inUse}</b><span>In use</span></div>
    <div class="teStatBox"><b>${db.departments.length-inUse}</b><span>Unused</span></div>
    <div class="teStatBox"><b>${onRollTotal}</b><span>Employees on roll</span></div>
    <div class="teStatBox ${noDept?'warn':''}"><b>${noDept}</b><span>No department</span></div>
  </div>
  <div class="panel deptPanel">
    <div class="deptHead">
      <h3>${ico('tag')} Departments</h3>
      ${canAdd ? `<div class="deptAdd">
        <input id="newDeptInput" placeholder="New department name" aria-label="New department name" onkeydown="if(event.key==='Enter')addDepartment()">
        <button class="btn" onclick="addDepartment()">${ico('plus')} Add Department</button>
      </div>` : ''}
    </div>
    <div class="tableScrollWrap deptScroll"><table class="deptTable">
      <thead><tr><th>Department</th><th>Employees on roll</th><th class="num" title="Resigned employees who had this department">Resigned</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">No departments yet.</td></tr>'}</tbody>
    </table></div>
    <p class="syncNote">A department that no employee has had for more than ${DEPT_UNUSED_MONTHS} months is removed automatically. Departments that any employee has — including inactive and resigned employees — are always kept, so only unused departments can be deleted.</p>
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

