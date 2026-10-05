/* ================= ANNUAL INCREMENT ================= */
// Financial Year runs April -> March. Returns a label like "2026-2027".
function financialYearOf(dateStr){
  if(!dateStr) return '';
  const [y,m]=dateStr.split('-').map(Number);
  return (m>=4) ? (y+'-'+(y+1)) : ((y-1)+'-'+y);
}
// Given "2026-2027" returns "2025-2026" — the Financial Year immediately before it.
function previousFinancialYear(fyLabel){
  if(!fyLabel) return '';
  const [start]=fyLabel.split('-').map(Number);
  return (start-1)+'-'+start;
}
let incEmpCode=''; // employee currently selected for the "Add Increment" form
let incHistoryEmpCode=''; // '' = show every employee's history; else filter to one employee code
let editIncId=''; // id of increment record currently being edited (inline edit form), '' = none
// 60% Basic / 20% HRA / 10% Conveyance / 10% Washing Allowance split.
// Rounded so the four parts always add back to the exact total (Washing absorbs the remainder).
function splitIncrementAmount(amount){
  amount=Math.round(Number(amount)||0);
  const basic=Math.round(amount*0.60);
  const hra=Math.round(amount*0.20);
  const conveyance=Math.round(amount*0.10);
  const washing=amount-basic-hra-conveyance; // absorbs any rounding remainder
  return {basic,hra,conveyance,washing};
}
function renderIncrement(){
  const activeEmployees=db.employees.filter(e=>e.status!=='Resigned').sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const canAdd=hasPerm('increment','add');
  const canDelete=hasPerm('increment','delete');
  const canEdit=hasPerm('increment','edit');
  const canPrint=hasPerm('increment','print');
  const emp = incEmpCode ? db.employees.find(e=>e.code===incEmpCode) : null;
  const today=todayStr();
  const defaultFY=financialYearOf(today);

  let formHtml='';
  if(emp){
    const prevBasic=emp.basic||0, prevHra=emp.hra||0, prevConv=emp.conveyance||0, prevWash=emp.washing||0;
    formHtml=`
    <div class="panel" style="margin-top:14px;">
      <h3>➕ New Increment — ${emp.name} (${emp.code})</h3>
      <form id="incForm">
        <div class="formGrid">
          <div><label>Financial Year</label><input id="inc_fy" value="${defaultFY}" disabled></div>
          <div><label>Increment Effective Date *</label><input type="date" id="inc_effDate" value="${today}" onchange="updateIncrementFyLabels(this.value);recalcIncrement();" required></div>
          <div><label>Total Increment Amount (₹) *</label><input type="number" id="inc_amount" value="0" min="0" oninput="recalcIncrement()" required></div>
          <div class="full"><label>Remarks</label><input id="inc_remarks" placeholder="Optional note (e.g. performance increment, promotion, etc.)"></div>
        </div>

        <fieldset style="margin-top:14px;"><legend>Previous Year's Salary Structure — FY <span id="inc_prevFyLabel">${previousFinancialYear(defaultFY)}</span> (editable)</legend>
        <div class="formGrid">
          <div><label>Basic Salary</label><input type="number" id="inc_prevBasic" value="${prevBasic}" oninput="recalcIncrement()"></div>
          <div><label>HRA</label><input type="number" id="inc_prevHra" value="${prevHra}" oninput="recalcIncrement()"></div>
          <div><label>Conveyance</label><input type="number" id="inc_prevConv" value="${prevConv}" oninput="recalcIncrement()"></div>
          <div><label>Washing Allowance</label><input type="number" id="inc_prevWash" value="${prevWash}" oninput="recalcIncrement()"></div>
        </div></fieldset>

        <fieldset style="margin-top:14px;"><legend>Increment Distribution (auto: 60% Basic / 20% HRA / 10% Conveyance / 10% Washing)</legend>
        <div class="formGrid">
          <div><label>Increment – Basic</label><input type="number" id="inc_addBasic" value="0" disabled></div>
          <div><label>Increment – HRA</label><input type="number" id="inc_addHra" value="0" disabled></div>
          <div><label>Increment – Conveyance</label><input type="number" id="inc_addConv" value="0" disabled></div>
          <div><label>Increment – Washing</label><input type="number" id="inc_addWash" value="0" disabled></div>
        </div></fieldset>

        <fieldset style="margin-top:14px;"><legend>Current Year's Revised Salary Structure — FY <span id="inc_currFyLabel">${defaultFY}</span> (editable, effective from ${fmtDate(today)})</legend>
        <div class="formGrid">
          <div><label>Revised Basic Salary</label><input type="number" id="inc_revBasic" value="${prevBasic}" oninput="recalcIncrementGross()"></div>
          <div><label>Revised HRA</label><input type="number" id="inc_revHra" value="${prevHra}" oninput="recalcIncrementGross()"></div>
          <div><label>Revised Conveyance</label><input type="number" id="inc_revConv" value="${prevConv}" oninput="recalcIncrementGross()"></div>
          <div><label>Revised Washing Allowance</label><input type="number" id="inc_revWash" value="${prevWash}" oninput="recalcIncrementGross()"></div>
          <div><label>Revised Gross (Basic+HRA+Conv.+Washing)</label><input type="number" id="inc_revGross" value="${prevBasic+prevHra+prevConv+prevWash}" disabled></div>
        </div></fieldset>

        <div class="modalActions">
          <button type="button" class="btn secondary" onclick="incEmpCode='';render('increment')">Cancel</button>
          <button type="submit" class="btn">💾 Save Increment</button>
        </div>
      </form>
    </div>`;
  }

  const historyRows=db.increments
    .filter(r=>!incHistoryEmpCode || r.empCode===incHistoryEmpCode)
    .sort((a,b)=> (a.empCode||'').localeCompare(b.empCode||'',undefined,{numeric:true}) || (b.effectiveDate||'').localeCompare(a.effectiveDate||'') || (b.createdAt||'').localeCompare(a.createdAt||''));

  const editRec = editIncId ? db.increments.find(r=>r.id===editIncId) : null;
  let editFormHtml='';
  if(editRec){
    editFormHtml=`
    <div class="panel" style="margin-top:14px;">
      <h3>✏️ Edit Increment — ${editRec.empName} (${editRec.empCode}), FY ${editRec.financialYear}</h3>
      <form id="editIncForm">
        <div class="formGrid">
          <div><label>Effective Date *</label><input type="date" id="edit_effDate" value="${editRec.effectiveDate}" required></div>
          <div><label>Total Increment Amount (₹) *</label><input type="number" id="edit_amount" value="${editRec.incrementAmount}" min="0" oninput="recalcEditIncrement()" required></div>
          <div class="full"><label>Remarks</label><input id="edit_remarks" value="${(editRec.remarks||'').replace(/"/g,'&quot;')}" placeholder="Optional note"></div>
        </div>

        <fieldset style="margin-top:14px;"><legend>Previous Year's Salary Structure (editable)</legend>
        <div class="formGrid">
          <div><label>Basic Salary</label><input type="number" id="edit_prevBasic" value="${editRec.prevBasic}" oninput="recalcEditIncrement()"></div>
          <div><label>HRA</label><input type="number" id="edit_prevHra" value="${editRec.prevHra}" oninput="recalcEditIncrement()"></div>
          <div><label>Conveyance</label><input type="number" id="edit_prevConv" value="${editRec.prevConveyance}" oninput="recalcEditIncrement()"></div>
          <div><label>Washing Allowance</label><input type="number" id="edit_prevWash" value="${editRec.prevWashing}" oninput="recalcEditIncrement()"></div>
        </div></fieldset>

        <fieldset style="margin-top:14px;"><legend>Revised Salary Structure (editable)</legend>
        <div class="formGrid">
          <div><label>Revised Basic Salary</label><input type="number" id="edit_revBasic" value="${editRec.revisedBasic}" oninput="recalcEditIncrementGross()"></div>
          <div><label>Revised HRA</label><input type="number" id="edit_revHra" value="${editRec.revisedHra}" oninput="recalcEditIncrementGross()"></div>
          <div><label>Revised Conveyance</label><input type="number" id="edit_revConv" value="${editRec.revisedConveyance}" oninput="recalcEditIncrementGross()"></div>
          <div><label>Revised Washing Allowance</label><input type="number" id="edit_revWash" value="${editRec.revisedWashing}" oninput="recalcEditIncrementGross()"></div>
          <div><label>Revised Gross</label><input type="number" id="edit_revGross" value="${editRec.revisedGross}" disabled></div>
        </div></fieldset>

        <p class="syncNote">Saving updates this audit record only. If this was the employee's most recent increment, their live salary structure (used for future payroll) is also updated to match the Revised figures above.</p>

        <div class="modalActions">
          <button type="button" class="btn secondary" onclick="editIncId='';render('increment')">Cancel</button>
          <button type="submit" class="btn">💾 Save Changes</button>
        </div>
      </form>
    </div>`;
  }

  return `
  <div class="panel">
    <h3>📈 Annual Increment</h3>
    <p class="syncNote">Select an employee to record their annual increment. The system auto-splits the Total Increment Amount as 60% Basic, 20% HRA, 10% Conveyance and 10% Washing Allowance — you can still edit any figure before saving. Saving updates the employee's salary structure for all <b>future</b> payroll; past payroll and reports already generated are never changed.</p>
    <div class="toolbar">
      <select id="inc_empPicker" onchange="incEmpCode=this.value;render('increment')">
        <option value="">— Select Employee —</option>
        ${activeEmployees.map(e=>`<option value="${e.code}" ${incEmpCode===e.code?'selected':''}>${e.code} — ${e.name}${e.department?' ('+e.department+')':''}</option>`).join('')}
      </select>
      ${!canAdd?'<span style="font-size:12px;color:var(--muted);">You do not have permission to add increments.</span>':''}
    </div>
  </div>
  ${emp && canAdd ? formHtml : (emp && !canAdd ? `<div class="panel" style="margin-top:14px;">${denyMsg('add increments','Annual Increment')}</div>` : '')}
  ${editRec ? (canEdit ? editFormHtml : `<div class="panel" style="margin-top:14px;">${denyMsg('edit increments','Annual Increment')}</div>`) : ''}

  <div class="panel" style="margin-top:14px;">
    <div class="toolbar">
      <h3 style="margin:0;">🕒 Increment History</h3>
      <select style="margin-left:auto;" onchange="incHistoryEmpCode=this.value;render('increment')">
        <option value="">All Employees</option>
        ${db.employees.slice().sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(e=>`<option value="${e.code}" ${incHistoryEmpCode===e.code?'selected':''}>${e.code} — ${e.name}</option>`).join('')}
      </select>
      ${canPrint ? `<button class="btn secondary" onclick="printIncrementHistory()">🖨️ Print</button>` : ''}
    </div>
    ${historyRows.length ? `
    <div style="margin:2px 0 12px;">
      <span class="legendSwatch"><span class="dot prev"></span> Previous Year Salary</span>
      <span class="legendSwatch"><span class="dot curr"></span> Current Year (Revised) Salary</span>
    </div>
    <div class="tableScrollWrap"><table class="incHistTable"><thead>
      <tr class="groupRow">
        <th colspan="4"></th>
        <th colspan="4" class="prevYearGroup">Previous Year Salary</th>
        <th class="deltaGroup">Change</th>
        <th colspan="5" class="currYearGroup">Current Year (Revised) Salary</th>
        <th colspan="${(canEdit||canDelete)?2:1}"></th>
      </tr>
      <tr class="colRow">
      <th>Fin. Year</th><th>Emp Code</th><th>Name</th><th>Effective Date</th>
      <th class="num prevYearCol">Basic</th><th class="num prevYearCol">HRA</th><th class="num prevYearCol">Conv.</th><th class="num prevYearCol">Washing</th>
      <th class="num">Increment Amt</th>
      <th class="num currYearCol">Basic</th><th class="num currYearCol">HRA</th><th class="num currYearCol">Conv.</th><th class="num currYearCol">Washing</th><th class="num currYearCol">Gross</th>
      <th>Remarks</th>${(canEdit||canDelete)?'<th></th>':''}
    </tr></thead><tbody>
      ${historyRows.map(r=>`<tr>
        <td>${r.financialYear}</td><td>${r.empCode}</td><td>${r.empName}</td><td>${fmtDate(r.effectiveDate)}</td>
        <td class="num prevYearCol">${fmt(r.prevBasic)}</td><td class="num prevYearCol">${fmt(r.prevHra)}</td><td class="num prevYearCol">${fmt(r.prevConveyance)}</td><td class="num prevYearCol">${fmt(r.prevWashing)}</td>
        <td class="num deltaCol">+${fmt(r.incrementAmount)}</td>
        <td class="num currYearCol">${fmt(r.revisedBasic)}</td><td class="num currYearCol">${fmt(r.revisedHra)}</td><td class="num currYearCol">${fmt(r.revisedConveyance)}</td><td class="num currYearCol">${fmt(r.revisedWashing)}</td><td class="num currYearCol"><b>${fmt(r.revisedGross)}</b></td>
        <td>${r.remarks||'-'}</td>
        ${(canEdit||canDelete)?`<td class="rowActions">${canEdit?`<button onclick="editIncId='${r.id}';render('increment')">✏️ Edit</button>`:''}${canDelete?`<button onclick="deleteIncrementRecord('${r.id}')">🗑️ Delete</button>`:''}</td>`:''}
      </tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">No increment records yet.</div>`}
  </div>`;
}
// Recomputes the auto-split (Increment – Basic/HRA/Conveyance) and the Revised structure
// whenever the Total Increment Amount or Previous Year figures change.
// Keeps the "Financial Year" field and both fieldset legends (Previous FY / Current FY)
// in sync whenever the Increment Effective Date is changed.
function updateIncrementFyLabels(effectiveDate){
  const fy=financialYearOf(effectiveDate);
  document.getElementById('inc_fy').value=fy;
  const prevLbl=document.getElementById('inc_prevFyLabel'); if(prevLbl) prevLbl.textContent=previousFinancialYear(fy);
  const currLbl=document.getElementById('inc_currFyLabel'); if(currLbl) currLbl.textContent=fy;
}
function recalcIncrement(){
  const amt=+document.getElementById('inc_amount').value||0;
  const split=splitIncrementAmount(amt);
  document.getElementById('inc_addBasic').value=split.basic;
  document.getElementById('inc_addHra').value=split.hra;
  document.getElementById('inc_addConv').value=split.conveyance;
  document.getElementById('inc_addWash').value=split.washing;
  const prevBasic=+document.getElementById('inc_prevBasic').value||0;
  const prevHra=+document.getElementById('inc_prevHra').value||0;
  const prevConv=+document.getElementById('inc_prevConv').value||0;
  const prevWash=+document.getElementById('inc_prevWash').value||0;
  document.getElementById('inc_revBasic').value=prevBasic+split.basic;
  document.getElementById('inc_revHra').value=prevHra+split.hra;
  document.getElementById('inc_revConv').value=prevConv+split.conveyance;
  document.getElementById('inc_revWash').value=prevWash+split.washing;
  recalcIncrementGross();
}
function recalcIncrementGross(){
  const b=+document.getElementById('inc_revBasic').value||0;
  const h=+document.getElementById('inc_revHra').value||0;
  const c=+document.getElementById('inc_revConv').value||0;
  const w=+document.getElementById('inc_revWash').value||0;
  document.getElementById('inc_revGross').value=b+h+c+w;
}
(function bindIncrementFormSubmit(){
  // Delegate the submit event since #incForm is re-rendered dynamically.
  document.addEventListener('submit',function(ev){
    if(ev.target && ev.target.id==='incForm'){ ev.preventDefault(); saveIncrementRecord(); }
  });
})();
function saveIncrementRecord(){
  if(!hasPerm('increment','add')){ alert('You do not have permission to add increments.'); return; }
  const emp=db.employees.find(e=>e.code===incEmpCode);
  if(!emp){ alert('Please select an employee.'); return; }
  const effectiveDate=document.getElementById('inc_effDate').value;
  if(!effectiveDate){ alert('Please enter the Increment Effective Date.'); return; }
  const amount=+document.getElementById('inc_amount').value||0;
  if(amount<=0){ alert('Please enter a Total Increment Amount greater than zero.'); return; }
  const record={
    id:'INC'+Date.now()+Math.floor(Math.random()*1000),
    empCode:emp.code, empName:emp.name,
    financialYear:financialYearOf(effectiveDate),
    effectiveDate,
    prevBasic:+document.getElementById('inc_prevBasic').value||0,
    prevHra:+document.getElementById('inc_prevHra').value||0,
    prevConveyance:+document.getElementById('inc_prevConv').value||0,
    prevWashing:+document.getElementById('inc_prevWash').value||0,
    incrementAmount:amount,
    incrementBasic:+document.getElementById('inc_addBasic').value||0,
    incrementHra:+document.getElementById('inc_addHra').value||0,
    incrementConveyance:+document.getElementById('inc_addConv').value||0,
    incrementWashing:+document.getElementById('inc_addWash').value||0,
    revisedBasic:+document.getElementById('inc_revBasic').value||0,
    revisedHra:+document.getElementById('inc_revHra').value||0,
    revisedConveyance:+document.getElementById('inc_revConv').value||0,
    revisedWashing:+document.getElementById('inc_revWash').value||0,
    revisedGross:+document.getElementById('inc_revGross').value||0,
    remarks:document.getElementById('inc_remarks').value.trim(),
    createdAt:new Date().toISOString(),
    createdBy: currentUser?currentUser.username:''
  };
  db.increments.push(record);
  // Update the employee's live salary structure — this is what every FUTURE payroll run,
  // salary slip and report will pick up. Already-generated payroll months (db.payroll[ym])
  // are frozen snapshots and are never touched, so past figures remain unchanged.
  emp.basic=record.revisedBasic;
  emp.hra=record.revisedHra;
  emp.conveyance=record.revisedConveyance;
  emp.washing=record.revisedWashing;
  if(!Array.isArray(emp.incrementHistory)) emp.incrementHistory=[];
  emp.incrementHistory.push(record.id);
  saveDB(db);
  incEmpCode='';
  incHistoryEmpCode=record.empCode;
  render('increment');
}
(function bindEditIncrementFormSubmit(){
  document.addEventListener('submit',function(ev){
    if(ev.target && ev.target.id==='editIncForm'){ ev.preventDefault(); saveEditedIncrementRecord(); }
  });
})();
function recalcEditIncrement(){
  // Re-derives the auto-split from the (possibly edited) Total Increment Amount and Previous figures,
  // then refreshes the Revised structure to prevBasic+split, etc. — mirrors the Add form's behaviour.
  const amt=+document.getElementById('edit_amount').value||0;
  const split=splitIncrementAmount(amt);
  const prevBasic=+document.getElementById('edit_prevBasic').value||0;
  const prevHra=+document.getElementById('edit_prevHra').value||0;
  const prevConv=+document.getElementById('edit_prevConv').value||0;
  const prevWash=+document.getElementById('edit_prevWash').value||0;
  document.getElementById('edit_revBasic').value=prevBasic+split.basic;
  document.getElementById('edit_revHra').value=prevHra+split.hra;
  document.getElementById('edit_revConv').value=prevConv+split.conveyance;
  document.getElementById('edit_revWash').value=prevWash+split.washing;
  recalcEditIncrementGross();
}
function recalcEditIncrementGross(){
  const b=+document.getElementById('edit_revBasic').value||0;
  const h=+document.getElementById('edit_revHra').value||0;
  const c=+document.getElementById('edit_revConv').value||0;
  const w=+document.getElementById('edit_revWash').value||0;
  document.getElementById('edit_revGross').value=b+h+c+w;
}
function saveEditedIncrementRecord(){
  if(!hasPerm('increment','edit')){ alert('You do not have permission to edit increment records.'); return; }
  const rec=db.increments.find(r=>r.id===editIncId);
  if(!rec){ alert('Record not found.'); return; }
  const effectiveDate=document.getElementById('edit_effDate').value;
  if(!effectiveDate){ alert('Please enter the Effective Date.'); return; }
  const amount=+document.getElementById('edit_amount').value||0;
  if(amount<=0){ alert('Please enter a Total Increment Amount greater than zero.'); return; }
  if(!confirm(`Save changes to the ${rec.financialYear} increment for ${rec.empName}?`)) return;

  // Was this the employee's most-recent increment BEFORE editing? (used below to decide whether
  // to also refresh the employee's live salary structure)
  const emp=db.employees.find(e=>e.code===rec.empCode);
  const siblings=db.increments.filter(r=>r.empCode===rec.empCode).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const wasLatest = siblings.length && siblings[siblings.length-1].id===rec.id;

  rec.effectiveDate=effectiveDate;
  rec.financialYear=financialYearOf(effectiveDate);
  rec.incrementAmount=amount;
  rec.prevBasic=+document.getElementById('edit_prevBasic').value||0;
  rec.prevHra=+document.getElementById('edit_prevHra').value||0;
  rec.prevConveyance=+document.getElementById('edit_prevConv').value||0;
  rec.prevWashing=+document.getElementById('edit_prevWash').value||0;
  const split=splitIncrementAmount(amount);
  rec.incrementBasic=split.basic; rec.incrementHra=split.hra; rec.incrementConveyance=split.conveyance; rec.incrementWashing=split.washing;
  rec.revisedBasic=+document.getElementById('edit_revBasic').value||0;
  rec.revisedHra=+document.getElementById('edit_revHra').value||0;
  rec.revisedConveyance=+document.getElementById('edit_revConv').value||0;
  rec.revisedWashing=+document.getElementById('edit_revWash').value||0;
  rec.revisedGross=+document.getElementById('edit_revGross').value||0;
  rec.remarks=document.getElementById('edit_remarks').value.trim();
  rec.editedAt=new Date().toISOString();
  rec.editedBy=currentUser?currentUser.username:'';

  // Re-check whether this is (still) the latest increment for the employee after the date edit,
  // and if so, sync the employee's live salary structure to the (possibly edited) Revised figures.
  const siblingsAfter=db.increments.filter(r=>r.empCode===rec.empCode).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const isLatestNow = siblingsAfter.length && siblingsAfter[siblingsAfter.length-1].id===rec.id;
  if(emp && (wasLatest || isLatestNow) && isLatestNow){
    emp.basic=rec.revisedBasic; emp.hra=rec.revisedHra; emp.conveyance=rec.revisedConveyance; emp.washing=rec.revisedWashing;
  }

  saveDB(db);
  editIncId='';
  incHistoryEmpCode=rec.empCode;
  render('increment');
}
function deleteIncrementRecord(id){
  if(!hasPerm('increment','delete')){ alert('You do not have permission to delete increment records.'); return; }
  const rec=db.increments.find(r=>r.id===id);
  if(!rec) return;
  if(!confirm(`Delete the ${rec.financialYear} increment of ${fmt(rec.incrementAmount)} for ${rec.empName}? This cannot be undone.\n\nNote: if this employee has had further increments after this one, their current salary is NOT changed by this delete — only the audit record is removed.`)) return;
  db.increments=db.increments.filter(r=>r.id!==id);
  const emp=db.employees.find(e=>e.code===rec.empCode);
  if(emp && Array.isArray(emp.incrementHistory)) emp.incrementHistory=emp.incrementHistory.filter(x=>x!==id);
  // If the deleted record was this employee's most recent increment, roll their live salary
  // back to the next-most-recent increment (or leave as-is if none — Basic/HRA/Conveyance in
  // the Employees module can then be corrected manually if needed).
  if(emp){
    const remaining=db.increments.filter(r=>r.empCode===emp.code).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
    const wasLatest = !remaining.length || rec.effectiveDate >= (remaining[remaining.length-1].effectiveDate);
    if(wasLatest && remaining.length){
      const last=remaining[remaining.length-1];
      emp.basic=last.revisedBasic; emp.hra=last.revisedHra; emp.conveyance=last.revisedConveyance; emp.washing=last.revisedWashing;
    } else if(wasLatest && !remaining.length){
      emp.basic=rec.prevBasic; emp.hra=rec.prevHra; emp.conveyance=rec.prevConveyance; emp.washing=rec.prevWashing;
    }
  }
  saveDB(db);
  render('increment');
}
function printIncrementHistory(){
  if(!hasPerm('increment','print')){ alert('You do not have permission to print.'); return; }
  const rows=db.increments
    .filter(r=>!incHistoryEmpCode || r.empCode===incHistoryEmpCode)
    .sort((a,b)=> (a.empCode||'').localeCompare(b.empCode||'',undefined,{numeric:true}) || (b.effectiveDate||'').localeCompare(a.effectiveDate||''))
    .map(r=>({
      FinancialYear:r.financialYear, EmpCode:r.empCode, Name:r.empName, EffectiveDate:fmtDate(r.effectiveDate),
      PrevBasic:r.prevBasic, PrevHRA:r.prevHra, PrevConveyance:r.prevConveyance, PrevWashing:r.prevWashing,
      IncrementAmount:r.incrementAmount,
      RevisedBasic:r.revisedBasic, RevisedHRA:r.revisedHra, RevisedConveyance:r.revisedConveyance, RevisedWashing:r.revisedWashing, RevisedGross:r.revisedGross,
      Remarks:r.remarks||'-'
    }));
  if(!rows.length){ alert('No increment records to print.'); return; }
  printSimpleReport('Annual Increment History'+(incHistoryEmpCode?(' — '+incHistoryEmpCode):''), rows);
}

