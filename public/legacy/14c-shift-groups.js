/* ================================================================================
   SHIFT GROUPS — employees work in fixed groups, and each group works one shift a week.
   ---------------------------------------------------------------------------------
   Data (in the same erp_data row):
     db.shiftPresets   [{key,label,inMin,outMin}]  shift timings (minutes from midnight; an out
                                                   time earlier than the in time is the next day)
     db.shiftGroups    [{key,label}]               Shift A Group / Shift B Group / General Group …
     db.groupMap       {empCode: groupKey}         which group each employee is in
     db.groupWeekShift {monday: {groupKey: presetKey}}  the shift a group works that week (Mon–Sun)
     db.shiftOverrides {date: {empCode: presetKey}}     one person's shift changed for one day
   A week without its own choice is suggested from the week before, with First and Second
   swapped (the usual rotation); the planner shows it dashed until someone confirms it.
   Late, Working and OT are still measured by teCompute() from the times entered; a shift here
   only decides which times are filled in.
   ================================================================================ */
const TE_DEFAULT_GROUPS=[{key:'A',label:'Shift A Group'},{key:'B',label:'Shift B Group'},{key:'G',label:'General Group'}];
const TE_SWAP={first:'second', firstOT:'secondOT', second:'first', secondOT:'firstOT'};
let teSmSearch='';

function teShiftPresets(){
  if(!Array.isArray(db.shiftPresets) || !db.shiftPresets.length) db.shiftPresets=TE_SHIFTS.map(s=>({key:s.key, label:s.label, inMin:s.inMin, outMin:s.outMin%1440}));
  return db.shiftPresets;
}
function teShiftByKey(k){ return k ? teShiftPresets().find(p=>p.key===k)||null : null; }
// Out minutes on the in time's own clock (an earlier out time is the next day).
function tePresetOut(p){ return p.outMin>p.inMin ? p.outMin : p.outMin+1440; }
function tePresetTimes(p){ return `${teMinLabel(p.inMin)} – ${teMinLabel(p.outMin)}`; }
function teGroups(){
  if(!Array.isArray(db.shiftGroups) || !db.shiftGroups.length) db.shiftGroups=TE_DEFAULT_GROUPS.map(g=>({...g}));
  return db.shiftGroups;
}
function teGroupMap(){ if(!db.groupMap || typeof db.groupMap!=='object') db.groupMap={}; return db.groupMap; }
function teGroupByKey(k){ return k ? teGroups().find(g=>g.key===k)||null : null; }
function teEmpGroup(code){ const k=teGroupMap()[code]; return teGroupByKey(k) ? k : ''; }
function teGroupLabel(k){ const g=teGroupByKey(k); return g ? g.label : 'No group'; }
// Pale tint per group, so a group reads the same everywhere (identity, not status).
function teGroupTone(k){ const i=teGroups().findIndex(g=>g.key===k); return i<0 ? 'x' : String(i%5); }
function teGroupBadge(k){ return `<span class="teGrpBadge t${teGroupTone(k)}">${teEsc(teGroupLabel(k))}</span>`; }

/* ---- Weeks and the rotation ---- */
function teWeekStart(dt){ const [y,m,d]=dt.split('-').map(Number); const x=new Date(y,m-1,d); x.setDate(x.getDate()-((x.getDay()+6)%7)); return teEwDateStr(x.getFullYear(), x.getMonth()+1, x.getDate()); }
function teWeekMap(){ if(!db.groupWeekShift || typeof db.groupWeekShift!=='object') db.groupWeekShift={}; return db.groupWeekShift; }
// {key, suggested}: the week's own choice, else last week's with First and Second swapped.
function teGroupWeekShift(dt, g){
  const w=teWeekMap(), ws=teWeekStart(dt);
  if(w[ws] && teShiftByKey(w[ws][g])) return {key:w[ws][g], suggested:false};
  for(let back=1; back<=8; back++){
    const prev=w[teEwShiftDate(ws,-7*back)], pk=prev&&prev[g];
    if(!teShiftByKey(pk)) continue;
    let k=pk; for(let i=0;i<back;i++) k=TE_SWAP[k]||k;
    return {key:teShiftByKey(k)?k:pk, suggested:true};
  }
  return {key:'', suggested:false};
}
function teOverrides(){ if(!db.shiftOverrides || typeof db.shiftOverrides!=='object') db.shiftOverrides={}; return db.shiftOverrides; }
function teOverrideShift(dt, code){ const o=teOverrides()[dt]; return o && teShiftByKey(o[code]) ? o[code] : ''; }
function teSetOverride(dt, code, key){
  const o=teOverrides();
  if(!key){ if(o[dt]){ delete o[dt][code]; if(!Object.keys(o[dt]).length) delete o[dt]; } return; }
  (o[dt]=o[dt]||{})[code]=key;
}
// The shift an employee is planned to work on a date: a change for that day, else the group's.
function teEmpShiftKey(code, dt){ return teOverrideShift(dt, code) || (teEmpGroup(code) ? teGroupWeekShift(dt, teEmpGroup(code)).key : ''); }
function teEmpShift(code, dt){ return teShiftByKey(teEmpShiftKey(code, dt)); }

/* ---- Edits ---- */
function teSmCanEdit(){ return hasPerm('timeentry','add')||hasPerm('timeentry','edit'); }
function teSmDeny(){ alert('You do not have permission to change shift groups.'); }
function teRotSet(ws, g, k){ if(!teSmCanEdit()) return teSmDeny(); const w=teWeekMap(); w[ws]=w[ws]||{}; if(k) w[ws][g]=k; else delete w[ws][g]; if(!Object.keys(w[ws]).length) delete w[ws]; saveDB(db); render('timeentry'); }
function teSmMap(code, key){ if(!teSmCanEdit()) return teSmDeny(); if(key) teGroupMap()[code]=key; else delete teGroupMap()[code]; saveDB(db); render('timeentry'); }
function teSmBulkMap(){
  if(!teSmCanEdit()) return teSmDeny();
  const key=document.getElementById('teSmBulkKey').value;
  const codes=[...document.querySelectorAll('.teSmCb:checked')].map(c=>c.value);
  if(!codes.length){ alert('Tick the employees to assign first.'); return; }
  codes.forEach(c=>{ if(key) teGroupMap()[c]=key; else delete teGroupMap()[c]; });
  saveDB(db); render('timeentry');
}
function teSmFilter(v){ teSmSearch=v; const q=v.trim().toLowerCase(); document.querySelectorAll('#teSmEmp tbody tr[data-s]').forEach(tr=>{ tr.hidden=!!q && !tr.dataset.s.includes(q); }); }
function teSmToggleAll(on){ document.querySelectorAll('#teSmEmp tbody tr:not([hidden]) .teSmCb').forEach(c=>{ c.checked=on; }); }
function teSmRenameGroup(i, v){ if(!teSmCanEdit()) return teSmDeny(); v=String(v).trim(); if(!v){ render('timeentry'); return; } teGroups()[i].label=v; saveDB(db); render('timeentry'); }
function teSmAddGroup(){ if(!teSmCanEdit()) return teSmDeny(); const l=prompt('Name of the new group (e.g. Shift C Group):',''); if(!l||!l.trim()) return; teGroups().push({key:'g'+Date.now(), label:l.trim()}); saveDB(db); render('timeentry'); }
function teSmDelGroup(i){
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to delete a group.'); return; }
  const g=teGroups()[i]; if(!g) return;
  const n=Object.values(teGroupMap()).filter(k=>k===g.key).length;
  if(!confirm(`Delete ${g.label}?${n?` Its ${n} employee(s) will have no group.`:''}`)) return;
  teGroups().splice(i,1);
  const m=teGroupMap(); Object.keys(m).forEach(c=>{ if(m[c]===g.key) delete m[c]; });
  Object.values(teWeekMap()).forEach(w=>{ delete w[g.key]; });
  saveDB(db); render('timeentry');
}
function teSmTo24(min){ min=((min%1440)+1440)%1440; return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }
function teSmSetShift(i, field, v){
  if(!teSmCanEdit()) return teSmDeny();
  const p=teShiftPresets()[i]; if(!p) return;
  if(field==='label'){ v=String(v).trim(); if(v) p.label=v; }
  else { const [h,m]=String(v).split(':').map(Number); if(!isNaN(h)&&!isNaN(m)) p[field]=h*60+m; }
  saveDB(db); render('timeentry');
}
function teSmAddShift(){ if(!teSmCanEdit()) return teSmDeny(); const l=prompt('Name of the new shift timing:',''); if(!l||!l.trim()) return; teShiftPresets().push({key:'sh'+Date.now(), label:l.trim(), inMin:9*60, outMin:17*60+30}); saveDB(db); render('timeentry'); }
function teSmDelShift(i){
  if(!hasPerm('timeentry','delete')){ alert('You do not have permission to delete a shift timing.'); return; }
  const p=teShiftPresets()[i]; if(!p || !confirm(`Delete ${p.label}? Weeks and days set to it will have no shift.`)) return;
  teShiftPresets().splice(i,1); saveDB(db); render('timeentry');
}

/* ---- The tab ---- */
function renderTEShiftGroupsTab(){
  const can=teSmCanEdit(), canDel=hasPerm('timeentry','delete');
  const groups=teGroups(), shifts=teShiftPresets(), emps=activeEmployeesForTE().filter(teEmpMatchesFilter);
  const q=teSmSearch.trim().toLowerCase();
  const thisWk=teWeekStart(todayStr()), weeks=[0,1,2,3].map(i=>teEwShiftDate(thisWk,7*i));
  const wkLabel=ws=>{ const e=teEwShiftDate(ws,6); const f=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); return `${f(ws)} – ${f(e)}`; };
  const gOpts=sel=>`<option value="">— No group —</option>`+groups.map(g=>`<option value="${g.key}" ${sel===g.key?'selected':''}>${teEsc(g.label)}</option>`).join('');
  const order=k=>{ const i=groups.findIndex(g=>g.key===k); return i<0?99:i; };
  const sorted=emps.slice().sort((a,b)=>order(teEmpGroup(a.code))-order(teEmpGroup(b.code)) || a.code.localeCompare(b.code,undefined,{numeric:true}));
  const count=k=>emps.filter(e=>teEmpGroup(e.code)===k).length;
  let lastG=null;
  const rows=sorted.map(e=>{
    const k=teEmpGroup(e.code), s=`${e.code} ${e.name} ${e.department||''}`.toLowerCase();
    const head=k!==lastG ? `<tr class="teGrpHead"><td colspan="6">${teGroupBadge(k)} <span>${count(k)} employee${count(k)===1?'':'s'}</span></td></tr>` : '';
    lastG=k;
    return head+`<tr data-s="${teEsc(s)}" ${q&&!s.includes(q)?'hidden':''}>
      <td class="teSmChk"><input type="checkbox" class="teSmCb" value="${teEsc(e.code)}" ${can?'':'disabled'} aria-label="Select ${teEsc(e.name)}"></td>
      <td>${teEsc(e.code)}</td><td style="text-align:left;">${teEsc(e.name)}</td><td>${teEsc(e.department||'-')}</td><td>${teEsc(unitLabel(e.unit))}</td>
      <td><select ${can?'':'disabled'} onchange="teSmMap('${teEsc(e.code)}',this.value)" aria-label="Group for ${teEsc(e.name)}">${gOpts(k)}</select></td></tr>`;
  }).join('');
  return `<div class="panel">
    <div class="teCalHead"><div><h3 style="margin:0;">${ico('calendar-range')} Weekly Rotation Planner</h3>
      <p class="teSmSub">Set this week once — the next weeks are suggested as the swap (First ↔ Second) until you confirm them. Employee Time Entry fills these shifts.</p></div>
      <span class="teSmKey"><span class="teSmKeyBox"></span> Confirmed <span class="teSmKeyBox dashed"></span> Suggested</span></div>
    <div class="tableScrollWrap teSmWrap"><table class="teSmTable">
      <thead><tr><th style="text-align:left;">Week (Mon – Sun)</th>${groups.map(g=>`<th>${teGroupBadge(g.key)}</th>`).join('')}</tr></thead>
      <tbody>${weeks.map(ws=>`<tr class="${ws===thisWk?'teSmThisWk':''}"><td style="text-align:left;"><b>${wkLabel(ws)}</b> <span class="teSmYear">${ws.slice(0,4)}</span>${ws===thisWk?' <span class="teSmNow">This week</span>':''}</td>
        ${groups.map(g=>{ const r=teGroupWeekShift(ws,g.key); return `<td><select class="${r.suggested?'suggested':''}" ${can?'':'disabled'} onchange="teRotSet('${ws}','${g.key}',this.value)" aria-label="${teEsc(g.label)}, week of ${ws}" title="${r.suggested?'Suggested — choose to confirm':''}">
          <option value="">—</option>${shifts.map(p=>`<option value="${p.key}" ${r.key===p.key?'selected':''}>${teEsc(p.label)}${r.suggested&&r.key===p.key?' (suggested)':''}</option>`).join('')}</select></td>`; }).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>
  <div class="panel">
    <div class="teCalHead"><div><h3 style="margin:0;">${ico('users')} Employee → Group</h3>
      <p class="teSmSub">Tick employees and assign them to a group, or change one row directly.</p></div></div>
    <div class="teStatRow" style="margin-top:4px;">${groups.map(g=>`<div class="teStatBox"><b>${count(g.key)}</b><span>${teEsc(g.label)}</span></div>`).join('')}
      <div class="teStatBox ${count('')?'warn':''}"><b>${count('')}</b><span>No group</span></div></div>
    <div class="teSmBar">
      <input type="search" placeholder="Search employee, code or department" value="${teEsc(teSmSearch)}" oninput="teSmFilter(this.value)" aria-label="Search employee">
      ${can?`<span style="margin-left:auto;display:flex;gap:8px;"><select id="teSmBulkKey" aria-label="Group to assign">${gOpts('')}</select><button class="btn" onclick="teSmBulkMap()">${ico('check')} Assign to selected</button></span>`:''}
    </div>
    <div class="tableScrollWrap teSmEmpWrap"><table class="teSmTable" id="teSmEmp">
      <thead><tr><th class="teSmChk"><input type="checkbox" ${can?'':'disabled'} onchange="teSmToggleAll(this.checked)" aria-label="Select all shown"></th><th>Emp Code</th><th style="text-align:left;">Employee</th><th>Department</th><th>Unit</th><th>Group</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty">No active employees${teFilterText()?' in '+teEsc(teFilterText()):''}.</td></tr>`}</tbody>
    </table></div>
  </div>
  <div class="teSmTwo">
    <div class="panel">
      <div class="teCalHead"><h3 style="margin:0;">${ico('tag')} Groups</h3>${can?`<button class="btn secondary" style="margin-left:auto;" onclick="teSmAddGroup()">${ico('plus')} Add Group</button>`:''}</div>
      <table class="teSmTable"><tbody>${groups.map((g,i)=>`<tr><td style="width:24px;">${teGroupBadge(g.key).replace(teEsc(g.label),'&nbsp;')}</td>
        <td><input value="${teEsc(g.label)}" ${can?'':'disabled'} onchange="teSmRenameGroup(${i},this.value)" aria-label="Group name"></td>
        <td style="width:70px;">${canDel?`<button class="btn danger" onclick="teSmDelGroup(${i})">Delete</button>`:''}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="panel">
      <div class="teCalHead"><div><h3 style="margin:0;">${ico('clock')} Shift Timings</h3><p class="teSmSub">Out earlier than In = the next day.</p></div>${can?`<button class="btn secondary" style="margin-left:auto;" onclick="teSmAddShift()">${ico('plus')} Add Timing</button>`:''}</div>
      <table class="teSmTable"><thead><tr><th style="text-align:left;">Name</th><th>In</th><th>Out</th>${canDel?'<th></th>':''}</tr></thead><tbody>
      ${shifts.map((p,i)=>`<tr><td><input value="${teEsc(p.label)}" ${can?'':'disabled'} onchange="teSmSetShift(${i},'label',this.value)" aria-label="Shift name"></td>
        <td><input type="time" value="${teSmTo24(p.inMin)}" ${can?'':'disabled'} onchange="teSmSetShift(${i},'inMin',this.value)" aria-label="In time"></td>
        <td><input type="time" value="${teSmTo24(p.outMin)}" ${can?'':'disabled'} onchange="teSmSetShift(${i},'outMin',this.value)" aria-label="Out time"></td>
        ${canDel?`<td style="width:44px;"><button class="teEwClear" title="Delete ${teEsc(p.label)}" onclick="teSmDelShift(${i})">${ico('x')}</button></td>`:''}</tr>`).join('')}</tbody></table>
      <p class="syncNote" style="margin-bottom:0;">Late, Working and OT are worked out from the times entered (8 working hours + a 30-minute break; time after that is OT).</p>
    </div>
  </div>`;
}
