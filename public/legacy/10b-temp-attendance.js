/* ================= ATTENDANCE — every employee on one page, month totals =================
   One row per employee on the roll, with the boxes the client fills in for the month —
     Present days · LOP · OT (hours:minutes) · Late (minutes) · Canteen tokens · one-off Allowance ₹ /
     Deduction ₹.
   Saved to db.tempAtt[ym][code] = {present, lop, ot (minutes), late (minutes), tokens}; the one-off
   allowance / deduction go to db.payrollAdjustments[ym][code] (otherAllowanceOneOff / otherDedOneOff).
   Payroll (tempAttFor, 12-payroll-calc.js): a blank box counts 0, a blank Present counts the working
   days − LOP, Paid days = Present + paid holidays (Holiday Calendar and the contractor's paid leave),
   and Late beyond the free minutes comes off OT first. Nothing entered for the month → nothing paid.
   Months entered day by day before this page: an employee with no month totals shows the figures
   from those days (what Payroll uses); typing over any of them saves all five as month totals.
   Month, Unit / Contractor filters, Edit / Save / Cancel (nothing reaches Payroll until Save),
   Enter / arrows between boxes, a column pasted from Excel fills down. */
// The month and the Unit / Contractor filters (attMonth, attUnitFilter, attContractorFilter,
// 10-attendance.js) are shared with the Month Summary, Holidays and Contractor Paid Leave tabs.
let tmpTab='grid';           // 'grid' | 'summary' | 'holidays' | 'cleave'
let tmpEditMode=false;
const TMP_COLS=[
  {k:'present', h:'Present days', title:'Present days this month (half days as .5) — blank = working days − LOP'},
  {k:'lop',     h:'LOP',          title:'Loss of Pay days this month'},
  {k:'ot',      h:'OT (h:mm)',    title:'OT this month as hours:minutes, e.g. 12:30'},
  {k:'late',    h:'Late (min)',   title:'Late minutes this month'},
  {k:'tokens',  h:'Canteen tokens', title:'Canteen tokens bought this month'},
  {k:'otherAllowanceOneOff', h:'Allowance ₹', title:'One-off allowance this month (added to Total Earnings)', adj:true},
  {k:'otherDedOneOff',       h:'Deduction ₹', title:'One-off deduction this month', adj:true}
];
const TMP_FIG_KEYS=['present','lop','ot','late','tokens'];
function tmpCanEdit(){ return hasPerm('attendance','edit') || hasPerm('attendance','add'); }
function tmpEditable(){ return tmpCanEdit() && tmpEditMode; }
function tmpEmployees(){
  return payrollEmployeesFor(attMonth).filter(e=>(!attUnitFilter || unitCodeOf(e.unit)===attUnitFilter) && contractorFilterMatches(e, attContractorFilter));
}
function tmpGet(code){ return (db.tempAtt && db.tempAtt[attMonth] && db.tempAtt[attMonth][code]) || null; }
// An employee with no month totals here but days entered the old way (or month totals typed on the
// former monthly screen): the five figures Payroll counts from them, or null. Cached per render.
let tmpDayCache={};
function tmpFromDays(e){
  const key=attMonth+'|'+e.code;
  if(key in tmpDayCache) return tmpDayCache[key];
  let out=null;
  if(!tempAttFor(attMonth, e.code)){
    const r=computePayrollForEmployee(e, attMonth);
    if(attIsMonthly(attMonth) || (+r.presentDays||0)+(+r.halfDayCount||0)+(+r.lopMarked||0)>0 || +r.otHoursWorked>0 || +r.lateMinutes>0)
      out={present:attN(r.presentPlusHalf), lop:attN(r.lopMarked), ot:Math.round((+r.otHoursWorked||0)*60), late:Math.round(+r.lateMinutes||0), tokens:Math.round(+r.canteenTokens||0)};
  }
  return tmpDayCache[key]=out;
}
// A box's value as shown: OT as h:mm, the rest as numbers; blank when not entered.
function tmpBoxVal(code, k){
  const c=TMP_COLS.find(x=>x.k===k);
  if(c && c.adj){ const v=+adjFor(attMonth, code)[k]||0; return v ? String(attN(v)) : ''; }
  let t=tmpGet(code);
  if(!tempAttFor(attMonth, code)){ const e=(db.employees||[]).find(x=>x.code===code); t=e && tmpFromDays(e); }
  if(!t || !tempAttSet(t[k])) return '';
  if(k!=='present' && !+t[k] && !tmpGet(code)) return ''; // days entered the old way: show only what is there
  return k==='ot' ? Math.floor(t.ot/60)+':'+String(Math.round(t.ot)%60).padStart(2,'0') : String(attN(t[k]));
}
function tmpSetMonth(v){ if(!v || v===attMonth) return; tmpCommitActive(); attMonth=v; render('attendance'); }
function tmpStepMonth(k){ tmpSetMonth(nextMonthKey(attMonth, k)); }
function tmpSetUnit(v){ attUnitFilter=v||''; render('attendance'); }
function tmpSetCon(v){ attContractorFilter=v||''; render('attendance'); }
function tmpClearFilters(){ attUnitFilter=''; attContractorFilter=''; render('attendance'); }

/* ---- Rendering ---- */
function tmpRowHtml(e, i, editable){
  const r=computePayrollForEmployee(e, attMonth), t=tempAttFor(attMonth, e.code), old=!t && tmpFromDays(e), nowd=attNowdParts(e, attMonth).nowd;
  const over=t && (tempAttSet(t.present) ? +t.present : 0)+(+t.lop||0) > nowd;
  const boxes=TMP_COLS.map((c,ci)=>`<td><input class="attIn tmpIn" data-r="${i}" data-c="${ci}" data-k="${c.k}" value="${tmpBoxVal(e.code, c.k)}" ${editable?'':'disabled'}
      placeholder="${c.k==='present' && t && !tempAttSet(t.present) ? attN(Math.max(0, nowd-(+t.lop||0))) : ''}" inputmode="decimal" autocomplete="off" spellcheck="false"
      title="${attEsc(c.title)}" aria-label="${attEsc(c.h)} — ${attEsc(e.name)}" onfocus="this.select()" onkeydown="tmpKey(event,this)" onblur="tmpCommit(this)" onpaste="tmpPaste(event,this)"></td>`).join('');
  return `<tr class="tmpRow ${t||old?'on':''} ${old?'tmpOld':''} ${over?'tmpOver':''}" data-code="${attEsc(e.code)}" data-r="${i}" ${old?'title="From the days entered before — type over any box to change them"':''}>
    <td class="num tmpSl">${i+1}</td><td class="tmpCode">${attEsc(e.code)}</td><td class="tmpName">${attEsc(e.name)}</td>
    <td class="num" title="Working days on the roll: not Sundays or holidays">${nowd}</td>
    ${boxes}
    <td class="num tmpCalc" data-k="paid" title="Paid days = Present + paid holidays">${t||old?attN(r.daysWorking):'<span class="teEwMuted">–</span>'}</td>
    <td class="num tmpNet" data-k="net">${t||old?fmt(r.netSalary):'<span class="teEwMuted">–</span>'}</td>
  </tr>`;
}
function tmpStatsHtml(emps){
  const on=emps.filter(e=>tempAttFor(attMonth, e.code) || tmpFromDays(e));
  const fig=e=>tempAttFor(attMonth, e.code) || tmpFromDays(e) || {};
  const sum=k=>on.reduce((s,e)=>s+(+fig(e)[k]||0),0);
  return `<div class="teStatBox"><b>${emps.length}</b><span>Employees</span></div>
    <div class="teStatBox ${on.length<emps.length?'warn':''}"><b>${on.length}<small> / ${emps.length}</small></b><span>Entered</span></div>
    <div class="teStatBox"><b>${attN(on.reduce((s,e)=>s+computePayrollForEmployee(e, attMonth).presentDays,0))}</b><span>Present days</span></div>
    <div class="teStatBox"><b>${attN(sum('lop'))}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${fmtMinHM(sum('ot'))}</b><span>OT</span></div>
    <div class="teStatBox"><b>${attN(sum('late'))}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${attN(sum('tokens'))}</b><span>Canteen tokens</span></div>`;
}
function tmpSetTab(t){
  if(t===tmpTab) return;
  if(typeof teEditConfirmLeave==='function' && !teEditConfirmLeave()) return;
  tmpTab=t; render('attendance');
}
// From the Month Summary, the Dashboard or Payroll: that employee's row in the Attendance list.
function tmpOpenEmp(code){
  if(tmpTab!=='grid' && typeof teEditConfirmLeave==='function' && !teEditConfirmLeave()) return;
  tmpTab='grid'; render('attendance');
  setTimeout(()=>{ const tr=document.querySelector(`#tmpGrid tr.tmpRow[data-code="${CSS.escape(code)}"]`); if(!tr) return;
    tr.scrollIntoView({block:'center'}); tr.classList.remove('teDwFlash'); void tr.offsetWidth; tr.classList.add('teDwFlash');
    const i=tr.querySelector('input.tmpIn:not(:disabled)'); if(i){ i.focus(); i.select(); } },0);
}
function renderTempAttendance(){
  teHostPage='attendance'; tmpDayCache={};
  const tab=(k, icon, label)=>`<div class="teTab ${tmpTab===k?'active':''}" role="tab" onclick="tmpSetTab('${k}')">${ico(icon)} ${label}</div>`;
  const tabs=`<div class="teTabs attPageTabs" role="tablist">${tab('grid','users','Attendance')}${tab('summary','clipboard','Month Summary')}${tab('holidays','calendar','Holidays')}${tab('cleave','calendar-range','Contractor Paid Leave')}</div>`;
  if(tmpTab==='summary') return tabs+renderAttSummary();
  if(tmpTab==='holidays') return tabs+renderTEHolidayTab();
  if(tmpTab==='cleave') return tabs+renderAttConLeave();
  return tabs+renderTempGrid();
}
function renderTempGrid(){
  const ym=attMonth, emps=tmpEmployees(), all=payrollEmployeesFor(ym).length, canEdit=tmpCanEdit();
  const editable=tmpEditable(), thisM=monthKey(todayStr());
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  let i=0;
  const groups=attGroups(emps).map(g=>`<tr class="tmpGroup"><td colspan="${6+TMP_COLS.length}">${attEsc(g.name)} <span>${g.emps.length} employee${g.emps.length===1?'':'s'}</span></td></tr>${g.emps.map(e=>tmpRowHtml(e, i++, editable)).join('')}`).join('');
  return `<div class="panel attPanel tmpPanel">
    <div class="teDwTop teBar attTop">
      <div class="teDwGroup">
        <span class="teBarLbl">${ico('calendar-days')} Month</span>
        <button class="btn secondary teDwNav" title="Previous month" aria-label="Previous month" onclick="tmpStepMonth(-1)">‹</button>
        <input type="month" value="${ym}" onchange="tmpSetMonth(this.value)" aria-label="Month">
        <button class="btn secondary teDwNav" title="Next month" aria-label="Next month" onclick="tmpStepMonth(1)">›</button>
        ${ym!==thisM?`<button class="btn secondary" onclick="tmpSetMonth('${thisM}')">This month</button>`:''}
        <span class="teBarSep"></span>
        <span class="attFiltInline">${ico('filter')}
          ${sel(attUnitFilter, 'tmpSetUnit', 'Unit', `<option value="" ${!attUnitFilter?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${attUnitFilter===u.code?'selected':''}>${attEsc(unitTabLabel(u))}</option>`).join(''))}
          ${sel(attContractorFilter, 'tmpSetCon', 'Contractor', contractorFilterOptionsHtml(attContractorFilter))}
          <span class="teFiltCount">${emps.length===all?`${all} employees`:`<b>${emps.length}</b> of ${all}`}</span>
          ${attUnitFilter||attContractorFilter?`<button type="button" class="teFiltClear" onclick="tmpClearFilters()" title="Clear filters">${ico('filter-x')}</button>`:''}</span>
      </div>
      <div class="teDwGroup">
        <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
        ${!canEdit ? '' : tmpEditMode
          ? `<button class="btn secondary" onclick="tmpCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn" onclick="tmpSave()">${ico('save')} Save</button>`
          : `<button class="btn btnEditAtt" onclick="tmpEdit()">${ico('pencil')} Edit</button>`}
      </div>
    </div>
    <p class="attNote">Type each employee's month: <b>Present days</b>, <b>LOP</b>, <b>OT</b> (hours:minutes), <b>Late</b> (minutes), <b>Canteen tokens</b>, and any one-off <b>Allowance</b> / <b>Deduction</b>. Paid days = Present + paid holidays; a blank Present counts the working days − LOP. Late beyond the free minutes comes off OT first. Nothing entered = not paid.${editable?' <b>Enter</b> / <b>↓</b> next employee, <b>←</b> <b>→</b> next box; a column copied from Excel pastes down.':''}</p>
    <div class="teStatRow" id="tmpStats">${tmpStatsHtml(emps)}</div>
    <div class="tableScrollWrap tmpWrap"><table class="tmpTable" id="tmpGrid">
      <thead><tr><th>Sl</th><th>Code</th><th style="text-align:left;">Employee</th><th title="Working days on the roll">NOWD</th>
        ${TMP_COLS.map(c=>`<th class="tmpInHead" title="${attEsc(c.title)}">${c.h}</th>`).join('')}
        <th>Paid days</th><th>Net pay</th></tr></thead>
      <tbody>${groups || `<tr><td colspan="${6+TMP_COLS.length}"><div class="empty">${attUnitFilter||attContractorFilter?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></td></tr>`}</tbody>
    </table></div>
  </div>`;
}

/* ---- Edit / Save ---- */
function tmpEdit(){
  if(!tmpCanEdit()){ alert('You do not have permission to edit Attendance.'); return; }
  teHostPage='attendance';
  if(!teEditBegin('tempatt')){ alert('Save or cancel the other edit first.'); return; }
  tmpEditMode=true; render('attendance');
  setTimeout(()=>{ const i=document.querySelector('#tmpGrid input.tmpIn:not(:disabled)'); if(i){ i.focus(); i.select(); } },0);
}
function tmpSave(){ tmpCommitActive(); teEditSave(); tmpEditMode=false; render('attendance'); }
function tmpCancel(){ teEditCancel('attendance'); }

/* ---- Typing ---- */
function tmpCommit(inp){
  if(!inp || !inp.isConnected || inp.disabled || !tmpEditable()) return true;
  const tr=inp.closest('tr.tmpRow'), code=tr.dataset.code, k=inp.dataset.k;
  const raw=String(inp.value).trim().replace(/,/g,'');
  if(raw===tmpBoxVal(code, k)){ inp.classList.remove('bad'); return true; }
  let v=null;
  if(raw!==''){
    if(k==='ot'){ v=attParseOt(raw); }
    else { const n=Number(raw); v=isFinite(n) && n>=0 ? (k==='late'||k==='tokens' ? Math.round(n) : Math.round(n*100)/100) : null; }
    if(v!==null && (k==='present'||k==='lop') && v>31) v=null;
    if(v===null){ inp.classList.add('bad'); inp.title=k==='ot'?'Enter OT as hours:minutes, e.g. 12:30':'Enter a number (0 or more)'; return false; }
  }
  const col=TMP_COLS.find(c=>c.k===k);
  if(col.adj){ const a=getAdj(attMonth, code); if(v===null) delete a[k]; else a[k]=v; }
  else {
    if(!db.tempAtt) db.tempAtt={};
    if(!db.tempAtt[attMonth]) db.tempAtt[attMonth]={};
    // Days entered the old way: the first change saves all five figures as month totals.
    const e=(db.employees||[]).find(x=>x.code===code), seed=!tmpGet(code) && e && tmpFromDays(e);
    const t={...(seed||{}), ...(db.tempAtt[attMonth][code]||{})};
    if(v===null) delete t[k]; else t[k]=v;
    TMP_FIG_KEYS.forEach(x=>{ if(!tempAttSet(t[x])) delete t[x]; });
    if(Object.keys(t).length) db.tempAtt[attMonth][code]=t; else delete db.tempAtt[attMonth][code];
    delete tmpDayCache[attMonth+'|'+code];
  }
  inp.classList.remove('bad'); inp.title=(TMP_COLS.find(c=>c.k===k)||{}).title||'';
  teEditTouch();
  tmpUpdateRow(tr);
  const st=document.getElementById('tmpStats'); if(st) st.innerHTML=tmpStatsHtml(tmpEmployees());
  return true;
}
function tmpCommitActive(){ const a=document.activeElement; if(a && a.classList && a.classList.contains('tmpIn')) tmpCommit(a); }
// Redraws one row in place (its boxes stay, so the cursor is never lost).
function tmpUpdateRow(tr){
  const e=(db.employees||[]).find(x=>x.code===tr.dataset.code); if(!e) return;
  const tmp=document.createElement('tbody'); tmp.innerHTML=tmpRowHtml(e, +tr.dataset.r, tmpEditable());
  const nr=tmp.firstElementChild;
  tr.className=nr.className;
  ['paid','net'].forEach(k=>{ tr.querySelector(`[data-k="${k}"]`).innerHTML=nr.querySelector(`[data-k="${k}"]`).innerHTML; });
  tr.querySelectorAll('input.tmpIn').forEach(inp=>{ const n=nr.querySelector(`input[data-c="${inp.dataset.c}"]`); if(n){ inp.value=n.value; inp.placeholder=n.placeholder; } });
}
function tmpCell(r, c){ return document.querySelector(`#tmpGrid input.tmpIn[data-r="${r}"][data-c="${c}"]`); }
function tmpKey(ev, inp){
  const r=+inp.dataset.r, c=+inp.dataset.c;
  if(ev.key==='Escape'){ inp.value=tmpBoxVal(inp.closest('tr').dataset.code, inp.dataset.k); inp.classList.remove('bad'); inp.select(); return; }
  let dr=0, dc=0;
  if(ev.key==='Enter') dr=ev.shiftKey?-1:1;
  else if(ev.key==='ArrowDown') dr=1;
  else if(ev.key==='ArrowUp') dr=-1;
  else if(ev.key==='ArrowRight' && inp.selectionEnd===inp.value.length) dc=1;
  else if(ev.key==='ArrowLeft' && inp.selectionStart===0) dc=-1;
  else return;
  ev.preventDefault();
  if(!tmpCommit(inp)) return;
  const el=dc ? tmpCell(r, c+dc) : tmpCell(r+dr, c);
  if(el && !el.disabled){ el.focus(); el.select(); el.scrollIntoView({block:'nearest'}); }
}
// Paste: lines go down the rows, tab-separated values across the boxes.
function tmpPaste(ev, inp){
  if(!tmpEditable()) return;
  const text=(ev.clipboardData || window.clipboardData).getData('text') || '';
  if(!/[\t\n]/.test(text.replace(/\s+$/,''))) return; // one value: normal paste
  ev.preventDefault();
  const lines=text.replace(/\r/g,'').replace(/\n+$/,'').split('\n');
  const r0=+inp.dataset.r, c0=+inp.dataset.c;
  let filled=0, extra=0;
  lines.forEach((ln, i)=>{
    const first=tmpCell(r0+i, c0); if(!first){ extra++; return; }
    ln.split('\t').forEach((v, j)=>{ const el=tmpCell(r0+i, c0+j); if(el && !el.disabled){ el.value=String(v).trim(); tmpCommit(el); } });
    filled++;
  });
  if(extra) alert(`${filled} row(s) filled. ${extra} more line(s) were not used — there are no more employees below.`);
}
