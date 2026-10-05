/* ================= DEPARTMENTS ================= */
function renderDepartments(){
  return `
  ${hasPerm('departments','add') ? `<div class="toolbar">
    <input id="newDeptInput" placeholder="New department name">
    <button class="btn" onclick="addDepartment()">+ Add Department</button>
  </div>` : ''}
  <div class="panel">
    <table><thead><tr><th>Department</th><th>Employees</th><th>Actions</th></tr></thead><tbody>
      ${db.departments.map(d=>{
        const count=db.employees.filter(e=>e.department===d).length;
        return `<tr><td><b>🏷️ ${d}</b></td><td>${count}</td><td class="rowActions">${hasPerm('departments','delete') ? `<button class="del" onclick="deleteDepartment('${d}')">🗑️ Delete</button>` : ''}</td></tr>`;
      }).join('')}
    </tbody></table>
  </div>`;
}
function addDepartment(){
  if(!hasPerm('departments','add')){ alert('You do not have permission to add departments.'); return; }
  const v=document.getElementById('newDeptInput').value.trim();
  if(!v) return;
  if(db.departments.includes(v)){ alert('Department already exists'); return; }
  db.departments.push(v); saveDB(db); render('departments');
}
function deleteDepartment(d){
  if(!hasPerm('departments','delete')){ alert('You do not have permission to delete departments.'); return; }
  if(db.employees.some(e=>e.department===d)){ alert('Cannot delete a department with employees assigned.'); return; }
  if(!confirm('Delete department "'+d+'"?')) return;
  db.departments=db.departments.filter(x=>x!==d); saveDB(db); render('departments');
}

