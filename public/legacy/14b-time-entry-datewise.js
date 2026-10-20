/* ================================================================================
   DATE-WISE TIME ENTRY — every active employee on one date, built for fast entry.
   ---------------------------------------------------------------------------------
   Same store and same rules as the Employee-wise view (db.timeEntries / db.timeLeaves /
   teCompute): times are typed (930, 9:30, 5:30p, 17:30) instead of picked from dropdowns,
   AM/PM is inferred, rows update in place (no full re-render while typing) and saves are
   queued (teEwQueueSave). Extras for a whole roster: Bulk Shift (tick employees, pick a
   shift, apply both times at once), copy-from-row-above, jump-to-employee search, the day's
   totals, and previous / next date without leaving the keyboard.
   ================================================================================ */
let teDwSel=new Set();        // employee codes ticked for Bulk Shift (current date only)
let teDwBulkShift='general';  // TE_SHIFTS key chosen in the Bulk Shift box
let teDwFocus=null;           // {r,c} to re-focus after a full render (e.g. date change)

function teDwCanEdit(){ return hasPerm('timeentry','add')||hasPerm('timeentry','edit'); }
function teDwUnlocked(){ return teDwCanEdit() && teGridEditMode; }
function teDwEmployees(){ return teFilteredEmployees(teGridDate); } // on the roll that day, narrowed by the Unit / Contractor filter

/* ---- Day totals ---- */
function teDwTotals(dt){
  const t={emps:0,present:0,leave:0,missing:0,working:0,late:0,ot:0};
  const nonWorking = teIsHolidayDate(dt); // Sunday, Payroll NOPH or a booked holiday
  teDwEmployees().forEach(e=>{
    const md=teEwRowModel(e.code, dt);
    t.emps++;
    if(md.onLeave){ t.leave++; return; }
    if(md.hasIn){ t.present++; t.working+=md.c.working; t.late+=md.c.late; t.ot+=md.c.ot; if(!md.hasOut) t.missing++; }
    else if(!nonWorking && dt<=todayStr()) t.missing++;
  });
  return t;
}
function teDwStatsHtml(t){
  return `<div class="teStatBox"><b>${t.emps}</b><span>Employees</span></div>
    <div class="teStatBox"><b>${t.present}</b><span>Present</span></div>
    <div class="teStatBox"><b>${t.leave}</b><span>On leave</span></div>
    <div class="teStatBox ${t.missing?'warn':''}"><b>${t.missing}</b><span>Needs entry</span></div>
    <div class="teStatBox"><b>${teFmtHM(t.working)}</b><span>Working hours</span></div>
    <div class="teStatBox ${t.late?'warn':''}"><b>${teFmtHM(t.late)}</b><span>Late</span></div>
    <div class="teStatBox ${t.ot?'danger':''}"><b>${teFmtHM(t.ot)}</b><span>OT hours</span></div>`;
}
function teDwRefreshStats(){ const el=document.getElementById('teDwStats'); if(el) el.innerHTML=teDwStatsHtml(teDwTotals(teGridDate)); }

/* ---- One row ---- */
function teDwRowHtml(e, i, dt, unlocked){
  const md=teEwRowModel(e.code, dt), cc=teEwComputedCells(md);
  const dis=(!unlocked||md.onLeave)?'disabled':'';
  const ph=(unlocked&&!md.onLeave)?'hh:mm':'';
  const code=teEsc(e.code);
  return `<tr class="teEwRow teDwRow ${md.onLeave?'onLeave':''}" data-r="${i}" data-code="${code}">
    ${unlocked?`<td class="teDwChk"><input type="checkbox" tabindex="-1" ${md.onLeave?'disabled':''} ${teDwSel.has(e.code)?'checked':''} onchange="teDwToggleSel('${code}',this.checked)" aria-label="Select ${teEsc(e.name)}"></td>`:''}
    <td style="color:var(--muted);">${i+1}</td>
    <td>${code}</td>
    <td style="text-align:left;"><button type="button" tabindex="-1" class="teEmpLink" title="Open ${teEsc(e.name)}'s month in Employee-wise view" onclick="teOpenEmpWise('${code}','${dt}')">${teEsc(e.name)}</button></td>
    <td class="teEwInCell"><input class="teEwTime in" data-r="${i}" data-c="0" value="${md.inTxt}" ${dis} placeholder="${ph}" autocomplete="off" spellcheck="false"
      onmousedown="teEwMouse(this)" onfocus="teEwFocusCell(this)" onkeydown="teDwKey(event,this)" onblur="teDwCommitTime(this)" aria-label="In time ${teEsc(e.name)}"></td>
    <td class="teEwOutCell"><input class="teEwTime out" data-r="${i}" data-c="1" value="${md.outTxt}" ${dis} placeholder="${ph}" autocomplete="off" spellcheck="false"
      onmousedown="teEwMouse(this)" onfocus="teEwFocusCell(this)" onkeydown="teDwKey(event,this)" onblur="teDwCommitTime(this)" aria-label="Out time ${teEsc(e.name)}"></td>
    <td data-k="shift">${cc.shift}</td>
    <td data-k="working">${cc.working}</td>
    <td data-k="late" class="${cc.lateCls}">${cc.late}</td>
    <td data-k="ot" class="${cc.otCls}">${cc.ot}</td>
    <td data-k="total" class="teEwTotal">${cc.total}</td>
    <td data-k="status">${md.status}</td>
    <td><select class="teEwAtt" data-r="${i}" data-c="2" ${unlocked?'':'disabled'} onkeydown="teDwKey(event,this)" onchange="teDwSetAttendance(this)" aria-label="Attendance ${teEsc(e.name)}">
      <option value="" ${!md.leave?'selected':''}>Auto (from time)</option>
      ${TE_LEAVE_TYPES.map(tp=>`<option value="${tp}" ${md.leave&&md.leave.type===tp?'selected':''}>${tp}</option>`).join('')}
    </select></td>
    <td>${unlocked?`<button type="button" tabindex="-1" class="teEwClear" title="Clear In/Out time" onclick="teDwClearRow('${code}')">${ico('x')}</button>`:''}</td>
  </tr>`;
}
function teDwRowEl(code){ return document.querySelector(`#teDwGrid tr.teDwRow[data-code="${CSS.escape(code)}"]`); }
// In-place refresh of one row (no full render → focus and caret are kept).
function teDwUpdateRow(code){
  const tr=teDwRowEl(code); if(!tr) return;
  const md=teEwRowModel(code, teGridDate), cc=teEwComputedCells(md);
  const unlocked=teDwUnlocked();
  tr.classList.toggle('onLeave', md.onLeave);
  const inI=tr.querySelector('input[data-c="0"]'), outI=tr.querySelector('input[data-c="1"]'), sel=tr.querySelector('select[data-c="2"]'), chk=tr.querySelector('.teDwChk input');
  const ph=(unlocked&&!md.onLeave)?'hh:mm':'';
  if(inI){ inI.value=md.inTxt; inI.disabled=!unlocked||md.onLeave; inI.placeholder=ph; inI.classList.remove('bad'); }
  if(outI){ outI.value=md.outTxt; outI.disabled=!unlocked||md.onLeave; outI.placeholder=ph; outI.classList.remove('bad'); }
  if(sel) sel.value=md.leave?md.leave.type:'';
  if(chk){ chk.disabled=md.onLeave; if(md.onLeave){ chk.checked=false; teDwSel.delete(code); teDwRefreshSel(); } }
  const set=(k,v,cls)=>{ const el=tr.querySelector(`[data-k="${k}"]`); if(el){ el.innerHTML=v; if(cls!==undefined) el.className=cls; } };
  set('shift',cc.shift); set('working',cc.working); set('late',cc.late,cc.lateCls); set('ot',cc.ot,cc.otCls); set('total',cc.total); set('status',md.status);
}

/* ---- Typing a time ---- */
// Nearest row ABOVE (in the grid's order) that has this time filled on this date.
function teDwTimeAbove(r, kind){
  for(let k=r-1;k>=0;k--){
    const tr=document.querySelector(`#teDwGrid tr.teDwRow[data-r="${k}"]`); if(!tr) continue;
    const pe=db.timeEntries[teGridDate]&&db.timeEntries[teGridDate][tr.dataset.code];
    if(pe && pe[kind+'H']!=='' && pe[kind+'H']!==undefined) return {h:+pe[kind+'H'], m:+pe[kind+'M']||0, ap:pe[kind+'AP']};
  }
  return null;
}
function teDwCommitTime(inp){
  if(!inp || inp.disabled || !inp.isConnected) return true;
  const tr=inp.closest('tr.teDwRow'); if(!tr) return true;
  const code=tr.dataset.code, r=+tr.dataset.r, dt=teGridDate;
  const kind=inp.dataset.c==='0'?'in':'out';
  const md=teEwRowModel(code, dt);
  const storedTxt=kind==='in'?md.inTxt:md.outTxt;
  const raw=inp.value.trim();
  if(raw===storedTxt){ inp.classList.remove('bad'); return true; }
  let val=null;
  if(raw==='='||raw==='"'){ // copy from the row above
    val=teDwTimeAbove(r, kind);
    if(!val){ inp.classList.add('bad'); inp.title='Nothing above to copy.'; return false; }
  } else if(raw!==''){
    const p=teEwParseTime(raw);
    if(!p){ inp.classList.add('bad'); inp.title='Could not read this time. Try 930, 9:30, 5:30p or 17:30.'; return false; }
    if(!p.ap){
      let ref=null;
      if(kind==='in'){
        ref=teEwRecentInMin(code, dt);               // this employee's usual In time…
        if(ref===null){ const a=teDwTimeAbove(r,'in'); if(a) ref=teTimeToMinutes(a.h,a.m,a.ap); } // …or the row above's
      } else if(md.hasIn) ref=teTimeToMinutes(md.entry.inH,md.entry.inM,md.entry.inAP);
      p.ap=teEwResolveAP(p, kind, ref, !!(md.leave&&md.leave.type==='Half Day'));
    }
    val=p;
  }
  if(!val && storedTxt===''){ inp.value=''; inp.classList.remove('bad'); return true; }
  if(val && teEwFmtTime(val.h,val.m,val.ap)===storedTxt){ inp.value=storedTxt; inp.classList.remove('bad'); return true; }
  teWriteTimeFor(dt, code, kind, val);
  inp.title='';
  teDwUpdateRow(code); teDwRefreshStats(); teEwQueueSave();
  return true;
}
function teDwSetAttendance(sel){
  const code=sel.closest('tr.teDwRow').dataset.code;
  const existing=teGetLeave(teGridDate, code);
  if(!teSetLeaveFor(teGridDate, code, sel.value)){ sel.value=existing?existing.type:''; return; }
  teDwUpdateRow(code); teDwRefreshStats(); teEwQueueSave();
}
function teDwClearRow(code){
  if(!teDwUnlocked()) return;
  const e=db.timeEntries[teGridDate]&&db.timeEntries[teGridDate][code];
  if(!e || (e.inH===''&&e.outH==='')) return;
  teWriteTimeFor(teGridDate, code, 'in', null); teWriteTimeFor(teGridDate, code, 'out', null);
  teDwUpdateRow(code); teDwRefreshStats(); teEwQueueSave();
}

/* ---- Keyboard ---- */
function teDwCell(r,c){ return document.querySelector(`#teDwGrid [data-r="${r}"][data-c="${c}"]`); }
function teDwRowCount(){ return document.querySelectorAll('#teDwGrid tr.teDwRow').length; }
function teDwMove(r,c,dr,dc){
  const n=teDwRowCount();
  if(dc){ let cc=c+dc; while(cc>=0&&cc<=2){ const el=teDwCell(r,cc); if(el&&!el.disabled){ el.focus(); return; } cc+=dc; } return; }
  let rr=r+dr;
  while(rr>=0&&rr<n){ const el=teDwCell(rr,c); if(el&&!el.disabled){ el.focus(); el.closest('tr').scrollIntoView({block:'nearest'}); return; } rr+=dr; }
}
function teDwKey(ev, el){
  const r=+el.dataset.r, c=+el.dataset.c, isSel=el.tagName==='SELECT';
  // Alt+PageUp / Alt+PageDown = previous / next date (same row and column)
  if(ev.altKey && (ev.key==='PageUp'||ev.key==='PageDown')){
    ev.preventDefault();
    if(!isSel && !teDwCommitTime(el)) return;
    teDwFocus={r,c};
    teDwStepDate(ev.key==='PageUp'?-1:1);
    return;
  }
  if(!isSel && (ev.ctrlKey||ev.metaKey) && (ev.key==='d'||ev.key==='D')){ ev.preventDefault(); el.value='='; if(teDwCommitTime(el)) teDwMove(r,c,1,0); return; }
  if(!isSel && ev.key==='Escape'){ const md=teEwRowModel(el.closest('tr').dataset.code, teGridDate); el.value=c===0?md.inTxt:md.outTxt; el.classList.remove('bad'); el.select(); return; }
  let dr=0, dc=0;
  if(ev.key==='Enter') dr=ev.shiftKey?-1:1;
  else if(ev.key==='ArrowDown') dr=1;
  else if(ev.key==='ArrowUp') dr=-1;
  else if(ev.key==='F2' && !isSel){ ev.preventDefault(); el.dataset.edit='1'; const n=el.value.length; el.setSelectionRange(n,n); return; }
  else if(ev.key==='ArrowRight' && (isSel || el.dataset.edit!=='1' || el.selectionEnd===el.value.length)) dc=1;
  else if(ev.key==='ArrowLeft' && (isSel || el.dataset.edit!=='1' || el.selectionStart===0)) dc=-1;
  else return;
  ev.preventDefault();
  if(!isSel && !teDwCommitTime(el)) return;
  teDwMove(r,c,dr,dc);
}
function teDwRestoreFocus(){
  if(!teDwFocus) return;
  const f=teDwFocus; teDwFocus=null;
  let el=teDwCell(f.r,f.c);
  if(!el||el.disabled){ const n=teDwRowCount(); for(let k=0;k<n;k++){ const x=teDwCell(k,f.c); if(x&&!x.disabled){ el=x; break; } } }
  if(el&&!el.disabled){ el.focus(); el.closest('tr').scrollIntoView({block:'nearest'}); }
}
// First row with no In Time yet (not on leave) — where entry usually continues.
function teDwFirstEmptyRow(){
  const emps=teDwEmployees();
  for(let i=0;i<emps.length;i++){ const md=teEwRowModel(emps[i].code, teGridDate); if(!md.onLeave && !md.hasIn) return i; }
  return 0;
}

/* ---- Date, lock, search ---- */
function teDwStepDate(k){ teDwSel.clear(); teSetGridDate(teEwShiftDate(teGridDate,k)); }
function teDwGoDate(v){ if(!v) return; teDwSel.clear(); teSetGridDate(v); }
function teDwUnlock(){
  if(!teDwCanEdit()){ alert('You do not have permission to edit time entries.'); return; }
  teGridEditMode=true; teDwFocus={r:teDwFirstEmptyRow(),c:0}; render('timeentry');
}
function teDwLock(){
  const a=document.activeElement; if(a && a.closest && a.closest('#teDwGrid') && a.tagName==='INPUT') teDwCommitTime(a);
  teGridEditMode=false; teDwSel.clear(); render('timeentry');
}
// "Search employee, Enter to jump": moves to that employee's row (In Time when unlocked).
function teDwJump(v){
  v=String(v||'').trim().toLowerCase(); if(!v) return;
  const emps=teDwEmployees();
  const i=[e=>e.code.toLowerCase()===v, e=>e.name.toLowerCase().startsWith(v), e=>(`${e.code} ${e.name}`).toLowerCase().includes(v)]
    .map(f=>emps.findIndex(f)).find(x=>x>=0);
  const box=document.getElementById('teDwFind');
  if(i===undefined){ if(box){ box.classList.add('bad'); box.title='No employee matches that.'; } return; }
  if(box){ box.classList.remove('bad'); box.title=''; }
  const tr=document.querySelector(`#teDwGrid tr.teDwRow[data-r="${i}"]`); if(!tr) return;
  tr.scrollIntoView({block:'center'});
  tr.classList.remove('teDwFlash'); void tr.offsetWidth; tr.classList.add('teDwFlash');
  const inp=teDwCell(i,0); if(inp && !inp.disabled) inp.focus();
}

/* ---- Bulk Shift ---- */
function teDwRefreshSel(){
  const n=teDwSel.size;
  const cnt=document.getElementById('teDwSelCount'); if(cnt) cnt.textContent=n+' selected';
  const btn=document.getElementById('teDwApply'); if(btn) btn.disabled=!n;
  const all=document.getElementById('teDwAll');
  if(all){ const boxes=[...document.querySelectorAll('#teDwGrid tbody .teDwChk input:not(:disabled)')]; all.checked=!!boxes.length && boxes.every(b=>b.checked); all.indeterminate=n>0 && !all.checked; }
}
function teDwToggleSel(code, on){ if(on) teDwSel.add(code); else teDwSel.delete(code); teDwRefreshSel(); }
function teDwToggleAll(on){
  document.querySelectorAll('#teDwGrid tbody .teDwChk input:not(:disabled)').forEach(b=>{ b.checked=on; const code=b.closest('tr').dataset.code; if(on) teDwSel.add(code); else teDwSel.delete(code); });
  teDwRefreshSel();
}
function teDwApplyShift(){
  if(!teDwUnlocked()) return;
  const s=TE_SHIFTS.find(x=>x.key===teDwBulkShift); if(!s){ alert('Choose a shift first.'); return; }
  const codes=[...teDwSel].filter(code=>code && (db.employees||[]).some(e=>e.code===code) && !teEwRowModel(code, teGridDate).onLeave);
  if(!codes.length) return;
  const filled=codes.filter(code=>{ const md=teEwRowModel(code, teGridDate); return md.hasIn||md.hasOut; }).length;
  if(filled && !confirm(`${filled} of the ${codes.length} selected employee(s) already have a time on ${fmtDate(teGridDate)}. Replace it with ${teShiftLabel(s)}?`)) return;
  const tin=teMinToHMAP(s.inMin), tout=teMinToHMAP(s.outMin);
  codes.forEach(code=>{ teWriteTimeFor(teGridDate, code, 'in', tin); teWriteTimeFor(teGridDate, code, 'out', tout); teDwUpdateRow(code); });
  teDwSel.clear();
  document.querySelectorAll('#teDwGrid .teDwChk input').forEach(b=>{ b.checked=false; });
  teDwRefreshSel(); teDwRefreshStats(); teEwQueueSave();
  const note=document.getElementById('teDwBulkNote'); if(note){ note.textContent=`${s.label} applied to ${codes.length} employee(s). Adjust any row by hand.`; note.classList.add('ok'); }
}

/* ---- The tab ---- */
function renderTEDateGrid(){
  const dt=teGridDate;
  const canEdit=teDwCanEdit(), unlocked=teDwUnlocked();
  const emps=teDwEmployees();
  // Selection belongs to the date on screen; drop codes no longer listed.
  [...teDwSel].forEach(c=>{ if(!emps.some(e=>e.code===c)) teDwSel.delete(c); });
  const dayName=new Date(dt+'T00:00:00').toLocaleDateString('en-US',{weekday:'long'});
  const hol=db.timeHolidays.find(h=>h.date===dt);
  const dayTag = new Date(dt+'T00:00:00').getDay()===0 ? `<span class="tag NOPH" style="margin-left:8px;">Sunday · full-day OT</span>`
    : getHolidayType(dt)==='NOPH' ? `<span class="tag NOPH" style="margin-left:8px;">Paid holiday (NOPH) · time worked is OT</span>`
    : hol ? `<span class="tag NOPH" style="margin-left:8px;">${teEsc(hol.remarks||'Holiday')} · full-day OT</span>` : '';
  const t=teDwTotals(dt);
  if(teDwFocus) setTimeout(teDwRestoreFocus,0);
  return `<div class="panel teDwPanel">
    <div class="teDwTop">
      <div class="teDwGroup">
        <label class="teDwLbl">${ico('calendar')} Date <input type="date" value="${dt}" onchange="teDwGoDate(this.value)"></label>
        <button class="btn secondary teDwNav" title="Previous date (Alt+PgUp)" onclick="teDwStepDate(-1)">‹</button>
        <button class="btn secondary teDwNav" title="Next date (Alt+PgDn)" onclick="teDwStepDate(1)">›</button>
        ${dt!==todayStr()?`<button class="btn secondary" onclick="teDwGoDate('${todayStr()}')">Today</button>`:`<button class="btn secondary" disabled>Today</button>`}
        <span class="teDwFindWrap">${ico('search')}<input id="teDwFind" placeholder="Search employee, Enter to jump" autocomplete="off"
          onkeydown="if(event.key==='Enter'){event.preventDefault();teDwJump(this.value);}" oninput="this.classList.remove('bad')"></span>
      </div>
      <div class="teDwGroup">
        <span id="teEwSaveState" class="teEwSave ${teEwSaveState}"></span>
        ${!unlocked
          ? `<button class="btn btnEditAtt" ${canEdit?'':'disabled'} onclick="teDwUnlock()">${ico('pencil')} Edit</button>`
          : `<button class="btn" onclick="teDwLock()">${ico('save')} Save</button>`}
        <button class="btn secondary" onclick="printTEDay('${dt}')">${ico('printer')} Print</button>
      </div>
    </div>
    <div class="teDwBanner">
      <div><b>Time entries — ${fmtDate(dt)}</b> <span style="color:var(--muted);">${dayName}</span>${dayTag}${teFilterText()?` <span class="teDwFilterTag">${ico('building')} ${teEsc(teFilterText())}</span>`:''}</div>
      <div style="font-size:12px;color:var(--muted);">${unlocked?'Unlocked for editing · click a name to open that employee\'s month':'Locked — click '+ico('pencil')+' Edit to enter time'}</div>
    </div>
    <div class="teStatRow" id="teDwStats">${teDwStatsHtml(t)}</div>
    ${unlocked?`<div class="teDwBulk">
      <b>${ico('zap')} Bulk Shift</b>
      <select onchange="teDwBulkShift=this.value" aria-label="Shift to apply">
        ${TE_SHIFTS.map(s=>`<option value="${s.key}" ${teDwBulkShift===s.key?'selected':''}>${teShiftLabel(s)}</option>`).join('')}
      </select>
      <button class="btn" id="teDwApply" ${teDwSel.size?'':'disabled'} onclick="teDwApplyShift()">Apply to selected</button>
      <span id="teDwSelCount" class="teDwSelCount">${teDwSel.size} selected</span>
      <span id="teDwBulkNote" class="teDwBulkNote">Tick employees, pick a shift, apply — then adjust any row by hand.</span>
    </div>
    <div class="teEwKeys">
      <span><kbd>930</kbd> <kbd>9:30</kbd> <kbd>5:30p</kbd> <kbd>17:30</kbd> type a time</span>
      <span><kbd>Enter</kbd> / <kbd>↓</kbd> next employee</span>
      <span><kbd>←</kbd> <kbd>→</kbd> In · Out · Attendance</span>
      <span><kbd>Ctrl</kbd>+<kbd>D</kbd> or <kbd>=</kbd> copy from row above</span>
      <span><kbd>F2</kbd> edit inside a cell</span>
      <span><kbd>Esc</kbd> undo cell</span>
      <span><kbd>Alt</kbd>+<kbd>PgUp</kbd>/<kbd>PgDn</kbd> previous / next date</span>
    </div>`:''}
    <div class="tableScrollWrap teEwWrap"><table class="teEwGrid teDwGrid" id="teDwGrid">
      <thead><tr>
        ${unlocked?`<th class="teDwChk"><input type="checkbox" id="teDwAll" title="Select all" onchange="teDwToggleAll(this.checked)"></th>`:''}
        <th>Sl No</th><th>Emp Code</th><th style="text-align:left;">Name</th>
        <th class="teEwInHead">${ico('log-in')} In Time</th><th class="teEwOutHead">${ico('log-out')} Out Time</th>
        <th>Shift</th><th title="Standard working hours (max 8:00 after the 30-minute break)">Working</th><th>Late</th><th>OT</th><th title="Working + OT">Total</th>
        <th>Status</th><th>Attendance</th><th></th>
      </tr></thead>
      <tbody>${emps.map((e,i)=>teDwRowHtml(e,i,dt,unlocked)).join('') || `<tr><td colspan="14"><div class="empty">${teFilterText()?'No active employees in '+teEsc(teFilterText())+'.':'No active employees.'}</div></td></tr>`}</tbody>
    </table></div>
    <p class="syncNote">Shifts: <b>First</b> 7:00 AM – 3:30 PM · <b>General</b> 9:00 AM – 5:30 PM · <b>Second</b> 3:30 PM – 12:00 AM (8 working hours + 30-minute break; time beyond that is OT). Sundays and booked holidays count as full-day OT. Setting <b>Attendance</b> to Loss of Pay or Half Day records an Employee Leave; set it back to <b>Auto</b> to remove it. This is the same data as the Employee-wise view.</p>
  </div>`;
}
