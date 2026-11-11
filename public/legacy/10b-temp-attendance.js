/* ================= TEMP ATTENDANCE — every employee on one page, month totals =================
   For a quick month: one row per employee on the roll, with five boxes the client fills in —
     Present days · LOP · OT (hours:minutes) · Late (minutes) · Canteen tokens.
   Saved to db.tempAtt[ym][code] = {present, lop, ot (minutes), late (minutes), tokens}. Once an
   employee has any figure here for a month, Payroll uses only these for that month instead of the
   days on Attendance (tempAttFor, 12-payroll-calc.js): a blank box counts 0, a blank Present counts
   the working days − LOP, and Paid days = Present + paid holidays (Holiday Calendar and the
   contractor's paid leave). Late beyond the free minutes comes off OT first, as on Attendance.
   Clearing all of an employee's boxes goes back to their Attendance days.
   Same tools as Attendance: month, Unit / Contractor filters, Edit / Save / Cancel (nothing reaches
   Payroll until Save), Enter / arrows between boxes, a column pasted from Excel fills down. */
let tmpMonth=monthKey(todayStr());
let tmpUnit='', tmpCon='';
let tmpEditMode=false;
const TMP_COLS=[
  {k:'present', h:'Present days', title:'Present days this month (half days as .5) — blank = working days − LOP'},
  {k:'lop',     h:'LOP',          title:'Loss of Pay days this month'},
  {k:'ot',      h:'OT (h:mm)',    title:'OT this month as hours:minutes, e.g. 12:30'},
  {k:'late',    h:'Late (min)',   title:'Late minutes this month'},
  {k:'tokens',  h:'Canteen tokens', title:'Canteen tokens bought this month'}
];
function tmpCanEdit(){ return hasPerm('tempattendance','edit') || hasPerm('tempattendance','add'); }
function tmpEditable(){ return tmpCanEdit() && tmpEditMode && !attIsMonthly(tmpMonth); }
function tmpEmployees(){
  return payrollEmployeesFor(tmpMonth).filter(e=>(!tmpUnit || unitCodeOf(e.unit)===tmpUnit) && contractorFilterMatches(e, tmpCon));
}
function tmpGet(code){ return (db.tempAtt && db.tempAtt[tmpMonth] && db.tempAtt[tmpMonth][code]) || null; }
// A box's value as shown: OT as h:mm, the rest as numbers; blank when not entered.
function tmpBoxVal(code, k){
  const t=tmpGet(code); if(!t || !tempAttSet(t[k])) return '';
  return k==='ot' ? Math.floor(t.ot/60)+':'+String(Math.round(t.ot)%60).padStart(2,'0') : String(attN(t[k]));
}
function tmpSetMonth(v){ if(!v || v===tmpMonth) return; tmpCommitActive(); tmpMonth=v; render('tempattendance'); }
function tmpStepMonth(k){ tmpSetMonth(nextMonthKey(tmpMonth, k)); }
function tmpSetUnit(v){ tmpUnit=v||''; render('tempattendance'); }
function tmpSetCon(v){ tmpCon=v||''; render('tempattendance'); }
function tmpClearFilters(){ tmpUnit=''; tmpCon=''; render('tempattendance'); }

/* ---- Rendering ---- */
function tmpRowHtml(e, i, editable){
  const r=computePayrollForEmployee(e, tmpMonth), t=tempAttFor(tmpMonth, e.code), nowd=attNowdParts(e, tmpMonth).nowd;
  const over=t && (tempAttSet(t.present) ? +t.present : 0)+(+t.lop||0) > nowd;
  const boxes=TMP_COLS.map((c,ci)=>`<td><input class="attIn tmpIn" data-r="${i}" data-c="${ci}" data-k="${c.k}" value="${tmpBoxVal(e.code, c.k)}" ${editable?'':'disabled'}
      placeholder="${c.k==='present' && t && !tempAttSet(t.present) ? attN(Math.max(0, nowd-(+t.lop||0))) : ''}" inputmode="decimal" autocomplete="off" spellcheck="false"
      title="${attEsc(c.title)}" aria-label="${attEsc(c.h)} — ${attEsc(e.name)}" onfocus="this.select()" onkeydown="tmpKey(event,this)" onblur="tmpCommit(this)" onpaste="tmpPaste(event,this)"></td>`).join('');
  return `<tr class="tmpRow ${t?'on':''} ${over?'tmpOver':''}" data-code="${attEsc(e.code)}" data-r="${i}">
    <td class="num tmpSl">${i+1}</td><td class="tmpCode">${attEsc(e.code)}</td><td class="tmpName">${attEsc(e.name)}</td>
    <td class="num" title="Working days on the roll: not Sundays or holidays">${nowd}</td>
    ${boxes}
    <td class="num tmpCalc" data-k="paid" title="Paid days = Present + paid holidays">${attN(r.daysWorking)}</td>
    <td class="num tmpNet" data-k="net">${fmt(r.netSalary)}</td>
    <td class="tmpFrom" data-k="from">${t?'<span class="tmpTag">Temp</span>':'<span class="teEwMuted" title="No figures here — Payroll uses the Attendance days">Attendance</span>'}</td>
  </tr>`;
}
function tmpStatsHtml(emps){
  const on=emps.filter(e=>tempAttFor(tmpMonth, e.code));
  const sum=k=>on.reduce((s,e)=>s+(+(tmpGet(e.code)||{})[k]||0),0);
  return `<div class="teStatBox"><b>${emps.length}</b><span>Employees</span></div>
    <div class="teStatBox ${on.length<emps.length?'warn':''}"><b>${on.length}<small> / ${emps.length}</small></b><span>Entered here</span></div>
    <div class="teStatBox"><b>${attN(on.reduce((s,e)=>s+computePayrollForEmployee(e, tmpMonth).presentDays,0))}</b><span>Present days</span></div>
    <div class="teStatBox"><b>${attN(sum('lop'))}</b><span>LOP days</span></div>
    <div class="teStatBox"><b>${fmtMinHM(sum('ot'))}</b><span>OT</span></div>
    <div class="teStatBox"><b>${attN(sum('late'))}</b><span>Late minutes</span></div>
    <div class="teStatBox"><b>${attN(sum('tokens'))}</b><span>Canteen tokens</span></div>`;
}
function renderTempAttendance(){
  teHostPage='tempattendance';
  const ym=tmpMonth, emps=tmpEmployees(), all=payrollEmployeesFor(ym).length, canEdit=tmpCanEdit(), monthly=attIsMonthly(ym);
  if(tmpEditMode && monthly) tmpEditMode=false;
  const editable=tmpEditable(), thisM=monthKey(todayStr());
  const sel=(on, fn, label, opts)=>`<select class="teFiltSel ${on?'on':''}" onchange="${fn}(this.value)" aria-label="${label}">${opts}</select>`;
  let i=0;
  const groups=attGroups(emps).map(g=>`<tr class="tmpGroup"><td colspan="13">${attEsc(g.name)} <span>${g.emps.length} employee${g.emps.length===1?'':'s'}</span></td></tr>${g.emps.map(e=>tmpRowHtml(e, i++, editable)).join('')}`).join('');
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
          ${sel(tmpUnit, 'tmpSetUnit', 'Unit', `<option value="" ${!tmpUnit?'selected':''}>All Units</option>`+getUnits().map(u=>`<option value="${u.code}" ${tmpUnit===u.code?'selected':''}>${attEsc(unitTabLabel(u))}</option>`).join(''))}
          ${sel(tmpCon, 'tmpSetCon', 'Contractor', contractorFilterOptionsHtml(tmpCon))}
          <span class="teFiltCount">${emps.length===all?`${all} employees`:`<b>${emps.length}</b> of ${all}`}</span>
          ${tmpUnit||tmpCon?`<button type="button" class="teFiltClear" onclick="tmpClearFilters()" title="Clear filters">${ico('filter-x')}</button>`:''}</span>
      </div>
      <div class="teDwGroup">
        <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
        ${!canEdit||monthly ? '' : tmpEditMode
          ? `<button class="btn secondary" onclick="tmpCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn" onclick="tmpSave()">${ico('save')} Save</button>`
          : `<button class="btn btnEditAtt" onclick="tmpEdit()">${ico('pencil')} Edit</button>`}
      </div>
    </div>
    <p class="attNote">${monthly
      ? `<b>${attEsc(attMonthName(ym))}</b> was entered as month totals on Attendance — switch it to day entry there first.`
      : `Type each employee's month: <b>Present days</b>, <b>LOP</b>, <b>OT</b> (hours:minutes), <b>Late</b> (minutes) and <b>Canteen tokens</b>. After Save, Payroll uses these figures for that employee instead of the Attendance days — Paid days = Present + paid holidays; a blank Present counts the working days − LOP. Clear all of an employee's boxes to go back to Attendance.${editable?' <b>Enter</b> / <b>↓</b> next employee, <b>←</b> <b>→</b> next box; a column copied from Excel pastes down.':''}`}</p>
    <div class="teStatRow" id="tmpStats">${tmpStatsHtml(emps)}</div>
    <div class="tableScrollWrap tmpWrap"><table class="tmpTable" id="tmpGrid">
      <thead><tr><th>Sl</th><th>Code</th><th style="text-align:left;">Employee</th><th title="Working days on the roll">NOWD</th>
        ${TMP_COLS.map(c=>`<th class="tmpInHead" title="${attEsc(c.title)}">${c.h}</th>`).join('')}
        <th>Paid days</th><th>Net pay</th><th>From</th></tr></thead>
      <tbody>${groups || `<tr><td colspan="13"><div class="empty">${tmpUnit||tmpCon?'No employees match these filters.':'No employees on the roll in '+attEsc(attMonthName(ym))+'.'}</div></td></tr>`}</tbody>
    </table></div>
  </div>`;
}

/* ---- Edit / Save ---- */
function tmpEdit(){
  if(!tmpCanEdit()){ alert('You do not have permission to edit Temp Attendance.'); return; }
  teHostPage='tempattendance';
  if(!teEditBegin('tempatt')){ alert('Save or cancel the other edit first.'); return; }
  tmpEditMode=true; render('tempattendance');
  setTimeout(()=>{ const i=document.querySelector('#tmpGrid input.tmpIn:not(:disabled)'); if(i){ i.focus(); i.select(); } },0);
}
function tmpSave(){ tmpCommitActive(); teEditSave(); tmpEditMode=false; render('tempattendance'); }
function tmpCancel(){ teEditCancel('tempattendance'); }

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
    if(v===null){ inp.classList.add('bad'); inp.title=k==='ot'?'Enter OT as hours:minutes, e.g. 12:30':'Enter a number (0 or more)'; return false; }
  }
  if(!db.tempAtt) db.tempAtt={};
  if(!db.tempAtt[tmpMonth]) db.tempAtt[tmpMonth]={};
  const t={...(db.tempAtt[tmpMonth][code]||{})};
  if(v===null) delete t[k]; else t[k]=v;
  if(Object.keys(t).length) db.tempAtt[tmpMonth][code]=t; else delete db.tempAtt[tmpMonth][code];
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
  ['paid','net','from'].forEach(k=>{ tr.querySelector(`[data-k="${k}"]`).innerHTML=nr.querySelector(`[data-k="${k}"]`).innerHTML; });
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
