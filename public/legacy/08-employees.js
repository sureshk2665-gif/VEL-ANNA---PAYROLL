/* ================= EMPLOYEES =================
   The list of employees on the roll (Active and Inactive — resigned employees are on Resigned
   Employees), kept to the essentials: search, Unit / Contractor / Status filters, and one row per
   employee with Code, Name, Contractor, Working Unit, Designation, Daily Wage and Status. Click a
   row to open the employee form. Every employee must be under a contractor: those without one are
   flagged above the list. Employees are never deleted (history is kept) — mark them Inactive or
   Resigned instead. */
let empFilter={search:'',status:'',unit:'',contractor:'',dept:'',missing:false}; // dept: set from the Departments page
// Search keeps the cursor in the box while the list redraws.
function empSetSearch(el){ const pos=el.selectionStart; empFilter.search=el.value; render('employees'); const i=document.getElementById('empSearch'); if(i){ i.focus(); i.setSelectionRange(pos,pos); } }
// An employee with at least one empty form field (same rule as Software Admin → Download All
// Employee Details).
function empHasMissing(e){
  if(typeof employeeDetailIsMissing!=='function') return false;
  return employeeFields().some(f=>employeeDetailIsMissing(f, e, employeeDetailValue(f, e)));
}
function empSet(k, v){ empFilter[k]=v; render('employees'); }
function empClearFilters(){ empFilter={search:'',status:'',unit:'',contractor:'',dept:'',missing:false}; render('employees'); }
function empOpen(code){ if(hasPerm('employees','edit')) openEmployeeModal(code); }
function renderEmployees(){
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const onRoll=db.employees.filter(e=>e.status!=='Resigned');
  const known=new Set(getContractors().map(c=>c.code));
  const base=onRoll.filter(e=>{
    if(empFilter.status && (e.status||'Active')!==empFilter.status) return false;
    if(empFilter.search && !(`${e.name} ${e.code}`.toLowerCase().includes(empFilter.search.toLowerCase()))) return false;
    if(empFilter.unit && unitCodeOf(e.unit)!==empFilter.unit) return false;
    if(empFilter.contractor && (e.contractor||'')!==(empFilter.contractor==='-'?'':empFilter.contractor)) return false;
    if(empFilter.dept && e.department!==empFilter.dept) return false;
    return true;
  });
  const missingCount=base.filter(empHasMissing).length;
  const list=empFilter.missing ? base.filter(empHasMissing) : base;
  const noCon=onRoll.filter(e=>!known.has(e.contractor)).length;
  const anyFilter=!!(empFilter.search||empFilter.status||empFilter.unit||empFilter.contractor||empFilter.dept||empFilter.missing);
  const canEdit=hasPerm('employees','edit');
  const sel=(on, k, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="empSet('${k}',this.value)" aria-label="${label}">${opts}</select>`;
  return `
  <div class="panel empPanel">
    <div class="empTop">
      <div class="searchWrap"><span class="sIcon">${ico('search')}</span><input id="empSearch" placeholder="Search name or code…" aria-label="Search name or code" oninput="empSetSearch(this)" value="${esc(empFilter.search)}"></div>
      ${hasPerm('employees','add') ? `<button class="btn" onclick="openEmployeeModal()">${ico('plus')} Add Employee</button>` : ''}
    </div>
    <div class="teFiltRow">
      <span class="teFiltLbl">${ico('filter')} Filter</span>
      ${sel(empFilter.unit, 'unit', 'Unit', `<option value="" ${!empFilter.unit?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${empFilter.unit===u.code?'selected':''}>${esc(unitTabLabel(u))}</option>`).join(''))}
      ${sel(empFilter.contractor, 'contractor', 'Contractor', contractorFilterOptionsHtml(empFilter.contractor)+`<option value="-" ${empFilter.contractor==='-'?'selected':''}>Contractor not set</option>`)}
      ${sel(empFilter.status, 'status', 'Status', `<option value="" ${!empFilter.status?'selected':''}>Active &amp; Inactive</option>`+['Active','Inactive'].map(s=>`<option ${empFilter.status===s?'selected':''}>${s}</option>`).join(''))}
      <button type="button" class="empChip ${empFilter.missing?'on':''}" aria-pressed="${empFilter.missing}" onclick="empSet('missing',${!empFilter.missing})" title="Employees with at least one empty field in the employee form">${ico('alert')} Details missing <b>${missingCount}</b></button>
      ${empFilter.dept?`<button type="button" class="empChip on" onclick="empSet('dept','')" title="From the Departments page — click to show every department">Department: ${esc(empFilter.dept)} ${ico('x')}</button>`:''}
      <span class="teFiltCount">${list.length===onRoll.length?`${onRoll.length} employees`:`<b>${list.length}</b> of ${onRoll.length} employees`}</span>
      ${anyFilter?`<button type="button" class="teFiltClear" onclick="empClearFilters()">${ico('filter-x')} Clear filters</button>`:''}
    </div>
    ${noCon && empFilter.contractor!=='-' ? `<div class="payWarn">${ico('alert')} <span>${noCon} employee${noCon===1?' has':'s have'} no contractor — every employee must be under one (Attendance, Payroll and the Contractors Bill work by contractor).</span><button type="button" class="btn secondary" onclick="empSet('contractor','-')">Show them</button></div>` : ''}
    ${list.length? `<div class="tableScrollWrap empScroll"><table class="empTable"><thead><tr>
      <th>Code</th><th>Name</th><th>Contractor</th><th>Working Unit</th><th>Designation</th><th class="num">Daily Wage</th><th>Status</th>${canEdit?'<th></th>':''}
    </tr></thead><tbody>
      ${list.map(e=>`<tr ${canEdit?`class="empRow" onclick="empOpen('${esc(e.code)}')" title="Click to open ${esc(e.name)}"`:''}>
        <td class="empCode">${esc(e.code)}</td><td class="empNameCell"><b>${esc(e.name)}</b></td>
        <td>${contractorName(e)?esc(contractorName(e)):'<span class="empNoCon">Not set</span>'}</td><td>${esc(unitLabel(e.unit))}</td><td>${esc(e.designation||'-')}</td>
        <td class="num"><b>${fmt(e.dailyWage||0)}</b></td>
        <td>${(e.status||'Active')==='Active' ? '<span class="empActive">Active</span>' : `<span class="tag ${e.status}">${e.status}</span>${e.status==='Inactive'&&e.inactiveFrom?`<span class="empSince">from ${fmtDate(e.inactiveFrom)}</span>`:''}`}</td>
        ${canEdit?`<td class="rowActions"><span class="empEditIco" aria-hidden="true">${ico('pencil')}</span></td>`:''}
      </tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">'+ico('search-x')+' No employees found. Try adjusting your search or filters.</div>'}
  </div>`;
}

/* ================= RESIGNED EMPLOYEES ================= */
// Same layout as the Employees list: unit tabs, filters on one line, the figures strip, and a
// compact list that scrolls inside its panel. Rejoin / Edit work as before.
let resignedFilter={search:'',unit:'',contractor:'',period:''};
function resSetSearch(el){ const pos=el.selectionStart; resignedFilter.search=el.value; render('resigned'); const i=document.getElementById('resSearch'); if(i){ i.focus(); i.setSelectionRange(pos,pos); } }
// Period filter on the resignation date: '' any time, 'month' this month, '3m' last 3 months, 'fy' this financial year.
function resInPeriod(e, period){
  const d=e.resignationDate||''; if(!period) return true; if(!d) return false;
  const today=todayStr();
  if(period==='month') return d.slice(0,7)===today.slice(0,7);
  if(period==='3m') return d>=nextMonthKey(today.slice(0,7),-2)+'-01' && d<=today;
  if(period==='fy') return financialYearOf(d)===financialYearOf(today);
  return true;
}
// Time with the company for the last stint: joining → resignation, in years and months.
function resTenure(e){
  if(!e.joining || !e.resignationDate || e.resignationDate<e.joining) return '-';
  const [y1,m1,d1]=e.joining.split('-').map(Number), [y2,m2,d2]=e.resignationDate.split('-').map(Number);
  let m=(y2-y1)*12+(m2-m1); if(d2<d1) m--; if(m<0) m=0;
  const y=Math.floor(m/12); m=m%12;
  return y ? `${y}y ${m}m` : `${m}m`;
}
function renderResigned(){
  const all=db.employees.filter(e=>e.status==='Resigned');
  const list=all.filter(e=>{
    if(resignedFilter.search && !(`${e.name} ${e.code}`.toLowerCase().includes(resignedFilter.search.toLowerCase()))) return false;
    if(resignedFilter.unit && unitCodeOf(e.unit)!==resignedFilter.unit) return false;
    if(resignedFilter.contractor && (e.contractor||'')!==(resignedFilter.contractor==='-'?'':resignedFilter.contractor)) return false;
    if(!resInPeriod(e, resignedFilter.period)) return false;
    return true;
  }).sort((a,b)=>(b.resignationDate||'').localeCompare(a.resignationDate||''));
  const canEdit=hasPerm('employees','edit');
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const unitTab=(code,label)=>`<button type="button" role="tab" class="attUnitTab ${resignedFilter.unit===code?'active':''}" aria-selected="${resignedFilter.unit===code}" onclick="resignedFilter.unit='${code}';render('resigned')">${label}</button>`;
  const period=(v,l)=>`<option value="${v}" ${resignedFilter.period===v?'selected':''}>${l}</option>`;
  const before=all.filter(e=>(e.employmentHistory||[]).length).length;
  return `
  <div class="attUnitTabs empUnitTabs" role="tablist" aria-label="Working unit">
    ${unitTab('','All Units')}${getUnits().map(u=>unitTab(u.code, unitTabLabel(u))).join('')}
  </div>
  <div class="toolbar empBar">
    <div class="empBarGrp">
      <div class="searchWrap"><span class="sIcon">${ico('search')}</span><input id="resSearch" placeholder="Search name or code..." aria-label="Search name or code" oninput="resSetSearch(this)" value="${esc(resignedFilter.search)}"></div>
      <select onchange="resignedFilter.contractor=this.value;render('resigned')" aria-label="Contractor">
        <option value="">All Contractors</option>
        ${getContractors().map(c=>`<option value="${c.code}" ${resignedFilter.contractor===c.code?'selected':''}>${c.name||c.code}</option>`).join('')}
        <option value="-" ${resignedFilter.contractor==='-'?'selected':''}>Contractor not set</option>
      </select>
      <select onchange="resignedFilter.period=this.value;render('resigned')" aria-label="Resigned when">
        ${period('','Resigned any time')}${period('month','Resigned this month')}${period('3m','Last 3 months')}${period('fy','This financial year')}
      </select>
    </div>
  </div>
  <div class="teStatRow empStrip">
    <div class="teStatBox"><b>${list.length}</b><span>Shown${list.length!==all.length?' of '+all.length:''}</span></div>
    <div class="teStatBox"><b>${all.filter(e=>resInPeriod(e,'month')).length}</b><span>Resigned this month</span></div>
    <div class="teStatBox"><b>${all.filter(e=>resInPeriod(e,'3m')).length}</b><span>Last 3 months</span></div>
    <div class="teStatBox"><b>${all.filter(e=>resInPeriod(e,'fy')).length}</b><span>This financial year (${financialYearOf(todayStr())})</span></div>
    <div class="teStatBox" title="Resigned employees who had already left and rejoined once before"><b>${before}</b><span>Worked here before</span></div>
  </div>
  <div class="panel empPanel">
    ${list.length? `<div class="tableScrollWrap empScroll"><table class="empTable resTable"><thead><tr>
      <th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Working Unit</th><th>Contractor</th><th>Joined</th><th>Resigned</th><th title="Joining date to resignation date">Time with us</th><th>Reason</th><th></th>
    </tr></thead><tbody>
      ${list.map(e=>`<tr>
        <td class="empCode">${e.code}</td><td class="empNameCell"><b>${e.name}</b></td><td>${e.department||'-'}</td><td>${e.designation||'-'}</td>
        <td>${unitLabel(e.unit)}</td><td>${contractorName(e)||'-'}</td>
        <td>${e.joining?fmtDate(e.joining):'-'}</td><td><b>${e.resignationDate?fmtDate(e.resignationDate):'-'}</b></td><td>${resTenure(e)}</td>
        <td class="resReason" title="${esc(e.resignReason||'')}">${e.resignReason?esc(e.resignReason):'-'}</td>
        <td class="rowActions">
          ${canEdit ? `<button onclick="openRejoinModal('${e.code}')" title="Bring this employee back on the roll">${ico('undo')} Rejoin</button>` : ''}
          ${canEdit ? `<button onclick="openEmployeeModal('${e.code}')">${ico('pencil')} Edit</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">${ico('search-x')} ${all.length?'No resigned employees match these filters.':'No resigned employees.'}</div>`}
  </div>
  <p class="syncNote">Resigned employees are kept with their full history and are not on the roll after their resignation date. <b>Rejoin</b> brings an employee back from a date you choose; their earlier stint is kept in their history.</p>`;
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
/* ---- Employee codes ----
   New employees get the next free code (EMP001, EMP002 …): db.nextEmpNum, skipping any code already
   in use (a code can be typed or changed by hand). A code may be changed later on Edit; it must stay
   unique, and every record kept under the old code moves to the new one (renameEmployeeCode). */
function empCodeNorm(v){ return String(v==null?'':v).trim().toUpperCase(); }
function empCodeInUse(code, exceptCode){
  const c=empCodeNorm(code);
  return (db.employees||[]).find(e=>empCodeNorm(e.code)===c && e.code!==exceptCode) || null;
}
function peekNextEmpCode(){
  let n=Math.max(1, +db.nextEmpNum||1);
  while(empCodeInUse('EMP'+String(n).padStart(3,'0'))) n++;
  return 'EMP'+String(n).padStart(3,'0');
}
// Takes the suggested code: the counter moves past it. A code typed by hand leaves the counter alone
// (no gap in the numbering) — the suggestion simply skips it when it comes round.
function takeNextEmpCode(){ const c=peekNextEmpCode(); db.nextEmpNum=+c.slice(3)+1; return c; }
// Letters, digits and - _ / . only (codes are used in links and file names), up to 20 characters.
function empCodeProblem(code, exceptCode){
  const c=empCodeNorm(code);
  if(!c) return 'Please enter the Employee Code.';
  if(exceptCode && c===empCodeNorm(exceptCode)) return ''; // an existing employee keeping their code
  if(!/^[A-Z0-9][A-Z0-9_\-\/.]{0,19}$/.test(c)) return 'The Employee Code can use letters, numbers and - _ / . only (up to 20 characters).';
  const other=empCodeInUse(c, exceptCode);
  if(other) return `Employee Code ${c} is already allocated to ${other.name||other.code}${other.status==='Resigned'?' (resigned)':''}. Please use a different code.`;
  return '';
}
// While typing: the browser shows the problem on Save (and the box is marked).
function empCodeCheck(inp){
  const editing=inp.form && inp.form.dataset.code || '';
  inp.setCustomValidity(empCodeProblem(inp.value, editing));
}
// Moves everything kept under an employee's code to a new code (Edit → Employee Code changed).
function renameEmployeeCode(oldCode, newCode){
  const move=obj=>{ if(obj && typeof obj==='object' && Object.prototype.hasOwnProperty.call(obj, oldCode)){ obj[newCode]=obj[oldCode]; delete obj[oldCode]; } };
  ['attendance','timeEntries','dayFigs','shiftOverrides','payrollAdjustments','tempAtt'].forEach(k=>Object.values(db[k]||{}).forEach(move));
  Object.values(db.payroll||{}).forEach(m=>{ move(m); if(m && m[newCode] && m[newCode].code===oldCode) m[newCode]={...m[newCode], code:newCode}; });
  move(db.groupMap);
  ['timeLeaves','salaryAdvances','increments'].forEach(k=>(db[k]||[]).forEach(r=>{ if(r && r.empCode===oldCode) r.empCode=newCode; }));
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
    employees: (db.employees||[]).map(e=>({code:e.code, name:e.name, aadhaar:e.aadhaar||'', pan:e.pan||''}))
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
    const code=takeNextEmpCode();
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
    <form id="empForm" class="empFormTabbed" data-code="${editing?empAttr(editing.code):''}">
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
// The form shows one section at a time (Basic / Statutory / Salary); every field stays in
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
  let code=empCodeNorm(f.code);
  if(existingCode && code===empCodeNorm(existingCode)) code=existingCode; // unchanged (kept exactly as stored)
  const tookSuggested=!existingCode && code===peekNextEmpCode();
  const codeProblem=empCodeProblem(code, existingCode);
  if(codeProblem){ alert(codeProblem); return; }
  if(!f.contractor){ alert('Please choose the Contractor — every employee must be under a contractor.'); return; }
  if(existingCode && code!==existingCode){
    if(typeof teEditActive==='function' && teEditActive()){ alert('Save or cancel the edit open on Attendance first, then change the code.'); return; }
    if(!confirm(`Change the Employee Code from ${existingCode} to ${code}?\n\nTheir attendance, payroll, salary advances and other records move to the new code.`)) return;
  }
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
  // Values that are no longer on the form (bank details, usual canteen tokens, payment mode, e-mail,
  // employment type) are kept as they were, so saving never drops stored data — or changes payroll.
  const data={
    ...(prior||{}),
    ...f,
    code,
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
  if(existingCode && code!==existingCode) renameEmployeeCode(existingCode, code);
  if(tookSuggested) takeNextEmpCode();
  const idx=db.employees.findIndex(e=>e.code===(existingCode||code));
  if(idx>-1) db.employees[idx]=data; else db.employees.push(data);
  saveDB(db);
  closeModal();
  render(data.status==='Resigned' ? 'resigned' : 'employees');
}
