/* ================= SCREEN TOOLS — shared by Attendance =================
   Saving (one write at a time), Edit / Save sessions, the grid box sized to the screen, folding
   sections (one contractor open at a time, every bar on screen) and the Holiday Calendar tab.
   Names start with "te" because they came from the former Employee Time Entry module. */
// ---- Small helpers ----
function teEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
// ---- Saving: one write at a time, the latest state last ----
let teEwSaveBusy=false, teEwSavePending=false, teEwSaveState='idle';
// Ordered, coalesced save: saveDB() upserts the whole store, so rapid keystrokes are
// funnelled into one in-flight write at a time; the latest state is always written last.
async function teEwQueueSave(){
  if(typeof teEditActive==='function' && teEditActive()){ teEditTouch(); return true; } // saved with Save
  teEwSetSaveState('saving');
  if(teEwSaveBusy){ teEwSavePending=true; return; }
  teEwSaveBusy=true;
  let ok=true;
  do{ teEwSavePending=false; ok=await saveDB(db); }while(teEwSavePending);
  teEwSaveBusy=false;
  teEwSetSaveState(ok?'saved':'error');
  return ok;
}
function teEwSetSaveState(s){
  teEwSaveState=s;
  const el=document.getElementById('teEwSaveState'); if(!el) return;
  el.className='teEwSave '+s;
  el.innerHTML = s==='saving'?'Saving…' : s==='saved'?ico('check')+' Saved' : s==='error'?ico('alert')+' Not saved — check connection'
    : s==='unsaved'?ico('pencil')+' Not saved':'';
  el.title = s==='unsaved' ? 'Changes since Edit are kept on this screen only — click Save to put them in the database and Payroll' : '';
}
// ---- Edit / Save sessions ----
/* Nothing changed on Attendance (an employee's days and month figures, or the Holiday Calendar tab) reaches the
   database — or Payroll — until Save. Edit opens a session and keeps a copy of the stores below;
   changes show on screen straight away; Save writes them; Cancel puts the copy back. Leaving the
   screen with unsaved changes asks to Save or Discard. While a session is open, anything else that
   saves the database writes these stores as they were before Edit (teDraftSafe), so a half-done
   edit never leaks out. */
const TE_EDIT_KEYS=['timeEntries','timeLeaves','payrollAdjustments','attendance','holidays','timeHolidays'];
let teEdit=null; // {area:'attendance'|'holidays', page, snap:JSON, dirty:boolean}
function teEditActive(area){ return !!teEdit && (!area || teEdit.area===area); }
// The page an Edit session belongs to (the Holiday Calendar is a tab of Attendance).
let teHostPage='attendance';
function teEditBegin(area){
  if(teEdit) return teEdit.area===area;
  teEdit={area, page:area==='attendance'?'attendance':teHostPage, snap:JSON.stringify(Object.fromEntries(TE_EDIT_KEYS.map(k=>[k, db[k]===undefined?null:db[k]]))), dirty:false};
  return true;
}
// A change made inside a session: shown on screen, saved only with Save.
function teEditTouch(){ if(teEdit){ teEdit.dirty=true; if(typeof teEwSetSaveState==='function') teEwSetSaveState('unsaved'); } }
// Every screen's Edit flag, closed together when a session ends.
function teEditEndModes(){
  if(typeof attEditMode!=='undefined') attEditMode=false;
}
async function teEditSave(){
  if(!teEdit) return true;
  teEdit=null; teEditEndModes();
  return teEwQueueSave();
}
function teEditDiscard(){
  if(!teEdit) return;
  const snap=JSON.parse(teEdit.snap);
  TE_EDIT_KEYS.forEach(k=>{ if(snap[k]===null) delete db[k]; else db[k]=snap[k]; });
  teEdit=null; teEditEndModes();
  if(typeof teEwSetSaveState==='function') teEwSetSaveState('idle');
}
// Cancel button: back to the saved figures.
function teEditCancel(page){
  if(teEdit && teEdit.dirty && !confirm('Discard the changes you made since Edit?')) return;
  teEditDiscard(); render(page||teHostPage);
}
// Before leaving a screen that has an open session. true = go on, false = stay.
function teEditConfirmLeave(){
  if(!teEdit) return true;
  if(!teEdit.dirty){ teEditDiscard(); return true; } // opened but nothing changed: just close it
  if(confirm('You have changes that are not saved yet.\n\nOK = Save them now\nCancel = choose to discard them or keep editing')){ teEditSave(); return true; }
  if(confirm('Discard the changes?\n\nOK = Discard them\nCancel = stay here and keep editing')){ teEditDiscard(); return true; }
  return false;
}
// What saveDB writes while a session is open: the edited stores as they were before Edit.
function teDraftSafe(d){
  if(!teEdit) return d;
  const snap=JSON.parse(teEdit.snap), out={...d};
  TE_EDIT_KEYS.forEach(k=>{ if(snap[k]===null) delete out[k]; else out[k]=snap[k]; });
  return out;
}
// Edit / Save / Cancel bar for a tab whose whole content is one edit area (the Holiday Calendar).
function teAreaEdit(area){ if(!teEditBegin(area)){ alert('Save or cancel the other edit first.'); return; } render(teHostPage); }
function teAreaSave(){ teEditSave(); render(teHostPage); }
function teEditBarHtml(area, allowed, offNote, onNote, below){
  const on=allowed && teEditActive(area);
  return `<div class="teSmEditBar ${below?'teHasFilt':''}">
    <span class="teSmEditNote">${on?onNote:allowed?offNote:'View only.'}</span>
    <span id="teEwSaveState" class="teEwSave ${typeof teEwSaveState!=='undefined'?teEwSaveState:''}"></span>
    ${!allowed ? '' : on
      ? `<button class="btn secondary" onclick="teEditCancel()" title="Discard the changes made since Edit">${ico('x')} Cancel</button><button class="btn" onclick="teAreaSave()">${ico('save')} Save</button>`
      : `<button class="btn btnEditAtt" onclick="teAreaEdit('${area}')">${ico('pencil')} Edit</button>`}
    ${below||''}
  </div>`;
}
// ---- Grid box sized to the screen ----
/* ---- Keep a grid's frozen headings in sight (the Attendance table) ----
   A grid scrolls inside its own box; its column headings (and its section bars, and a total row at
   the bottom) freeze at the edges of that box. The page around it scrolls too, so the
   two are kept in step:
     - the box is as tall as the room left under the toolbar (at least 360px, at most the window),
       so the whole grid — headings included — is on screen;
     - scrolling down over the grid first moves the page just enough to show the whole box, then
       the rows scroll under the frozen headings;
     - whenever the rows scroll while the top of the box is above the window (the page was scrolled
       further), the page brings it back down. */
const TE_FIT_GAP=8;
function teFitOuter(box){
  for(let q=box.parentElement; q; q=q.parentElement){ const o=getComputedStyle(q).overflowY; if((o==='auto'||o==='scroll') && q.scrollHeight>q.clientHeight+1) return q; }
  return document.scrollingElement || document.documentElement;
}
// The page scroller and the visible part of it (top / bottom on screen).
function teFitView(box){
  const outer=teFitOuter(box), win=outer===document.scrollingElement || outer===document.documentElement;
  const r=win ? {top:0, bottom:window.innerHeight} : outer.getBoundingClientRect();
  return {outer, top:r.top, bottom:r.bottom};
}
function teFitGridBox(gridId){
  const g=document.getElementById(gridId), box=g && g.closest('.teEwWrap'); if(!box) return;
  const v=teFitView(box), viewH=v.bottom-v.top;
  const topInPage=box.getBoundingClientRect().top - v.top + v.outer.scrollTop; // where the box starts with the page at the top
  const room=viewH - topInPage - TE_FIT_GAP;
  box.classList.add('teFit');
  box.style.setProperty('--teBoxH', Math.round(Math.min(viewH-2*TE_FIT_GAP, Math.max(360, room)))+'px');
  if(!box.dataset.fit){
    box.dataset.fit='1';
    box.addEventListener('wheel', teFitBoxWheel, {passive:false});
    box.addEventListener('scroll', teFitBoxScroll, {passive:true});
  }
}
function teFitBoxWheel(ev){
  if(ev.deltaY<=0 || ev.ctrlKey || ev.shiftKey) return;
  const box=ev.currentTarget;
  if(box.scrollTop+box.clientHeight >= box.scrollHeight-1) return; // rows at the end: the page scrolls on as usual
  const v=teFitView(box), below=box.getBoundingClientRect().bottom - (v.bottom-TE_FIT_GAP);
  if(below<=1) return; // the whole box is on screen: the rows scroll
  ev.preventDefault();
  const px=ev.deltaY*(ev.deltaMode===1 ? 16 : ev.deltaMode===2 ? v.bottom-v.top : 1);
  v.outer.scrollTop+=Math.min(below, px);
}
function teFitBoxScroll(ev){
  const box=ev.currentTarget; if(box.scrollTop<=0) return;
  const v=teFitView(box), above=box.getBoundingClientRect().top - (v.top+TE_FIT_GAP);
  if(above < -1) v.outer.scrollTop+=above; // the headings went above the window: bring them back
}
// ---- Folding sections ----
/* ---- Folding sections of a grid, one open at a time (Attendance: one section per contractor) ----
   A section is <tbody class="teSec" data-sec="id"> whose first row is its bar (tr.teSecHead, with a
   .teDwFold button). Every section starts folded — only its bar shows. Click a bar to open it;
   opening another folds the one before; click the open bar again to fold it. The corner button
   (<gridId>FoldAll) opens every section or folds them all. The bar stays at the top of the grid
   (under the column headings) while its rows scroll. Folding only changes what is shown. */
const teOpenSecs={attGrid:new Set()};
const TE_SEC_WORD={attGrid:'contractor'};
function teSecGridId(el){ const t=el && el.closest('table'); return t ? t.id : ''; }
function teSecApply(gridId){
  const open=teOpenSecs[gridId], word=TE_SEC_WORD[gridId]||'section';
  document.querySelectorAll(`#${gridId} tbody.teSec`).forEach(tb=>{
    const on=open.has(tb.dataset.sec);
    tb.classList.toggle('folded', !on);
    const b=tb.querySelector('.teDwFold'); if(b){ b.setAttribute('aria-expanded', String(on)); b.title=on?`Fold this ${word}`:`Click to expand this ${word}`; }
    const a=document.activeElement; if(!on && a && tb.contains(a) && !a.closest('tr.teSecHead')) a.blur();
  });
  teSecRefreshAll(gridId);
}
// Open only this section (the others fold); with toTop, bring its bar to the top of the grid.
function teSecOpenOnly(tb, toTop){
  const gridId=teSecGridId(tb); if(!teOpenSecs[gridId]) return;
  teOpenSecs[gridId]=new Set([tb.dataset.sec]); teSecApply(gridId);
  if(toTop){
    const box=tb.closest('.teEwWrap'), head=document.querySelector(`#${gridId} thead`), bar=tb.querySelector('tr.teSecHead td');
    const stick=bar ? parseFloat(getComputedStyle(bar).top) : NaN; // where its bar freezes
    if(box) box.scrollTop+=tb.getBoundingClientRect().top - box.getBoundingClientRect().top - (isFinite(stick) ? stick : (head?head.offsetHeight:0));
  }
}
function teSecFold(btn){
  const tb=btn.closest('tbody.teSec'), gridId=teSecGridId(tb); if(!tb || !teOpenSecs[gridId]) return;
  const open=teOpenSecs[gridId];
  if(open.size===1 && open.has(tb.dataset.sec)){ open.clear(); teSecApply(gridId); } // the open one: fold it
  else teSecOpenOnly(tb, true);
}
// Scroll a grid's box just enough to show this row clear of what is frozen over it: the column
// headings, its own bar (and the bars stacked above it), the next bar (and the bars stacked below
// it) and a frozen total row. scrollIntoView does not know about those and leaves rows under them.
function teSecKeepInView(tr){
  const box=tr && tr.closest('.teEwWrap'), table=tr && tr.closest('table'); if(!box || !table) return;
  const rect=el=>el ? el.getBoundingClientRect() : null, b=rect(box);
  let top=b.top+box.clientTop, bottom=top+box.clientHeight;
  const th=table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells[0]; if(th) top=Math.max(top, rect(th).bottom);
  const tb=tr.closest('tbody.teSec');
  if(tb){
    const own=tb.querySelector('tr.teSecHead td:last-child'); if(own) top=Math.max(top, rect(own).bottom);
    let nx=tb.nextElementSibling; while(nx && !(nx.tagName==='TBODY' && nx.classList.contains('teSec'))) nx=nx.nextElementSibling;
    const next=nx && nx.querySelector('tr.teSecHead td:last-child'); if(next) bottom=Math.min(bottom, rect(next).top);
  }
  const ft=table.tFoot && table.tFoot.rows[0] && table.tFoot.rows[0].cells[0]; if(ft) bottom=Math.min(bottom, rect(ft).top);
  const r=rect(tr);
  if(r.top<top) box.scrollTop-=top-r.top; else if(r.bottom>bottom) box.scrollTop+=r.bottom-bottom;
}
// Focus a cell and keep its row in sight (see teSecKeepInView).
function teSecFocus(el){ el.focus({preventScroll:true}); teSecKeepInView(el.closest('tr')); }
// A cell in a folded section (keyboard move / jump): open that section, the others fold.
function teSecReveal(el){ const tb=el && el.closest('tbody.teSec'); if(tb && tb.classList.contains('folded')) teSecOpenOnly(tb, false); }
function teSecFoldAll(gridId){
  const secs=[...document.querySelectorAll(`#${gridId} tbody.teSec`)];
  teOpenSecs[gridId] = secs.some(tb=>!tb.classList.contains('folded')) ? new Set() : new Set(secs.map(tb=>tb.dataset.sec));
  teSecApply(gridId);
}
function teSecRefreshAll(gridId){
  const b=document.getElementById(gridId+'FoldAll'); if(!b) return;
  const word=TE_SEC_WORD[gridId]||'section', secs=[...document.querySelectorAll(`#${gridId} tbody.teSec`)], all=!!secs.length && secs.every(tb=>tb.classList.contains('folded'));
  b.classList.toggle('folded', all); b.setAttribute('aria-expanded', String(!all));
  b.title=all?`Expand every ${word}`:`Fold every ${word} — only the bars stay`;
}
// The frozen bars sit just under the column headings: tell them their height.
// Exact (fractional) heights, half a pixel under, so frozen bars sit flush with no sliver of rows between.
function teSetHeadHeight(gridId){
  const g=document.getElementById(gridId), h=g && g.tHead && g.tHead.rows[0]; if(h) g.style.setProperty('--teHeadH', (h.getBoundingClientRect().height-0.5)+'px');
  const bar=g && g.querySelector('tr.teSecHead'); if(bar) g.style.setProperty('--teBarH', (bar.getBoundingClientRect().height-0.5)+'px'); // one bar's height (Date-wise stacks them)
}
// ---- Holiday Calendar ----
let teCalMonth=monthKey(todayStr());
/* ---------------- Holiday Calendar tab — every holiday in one month calendar:
   - Paid holiday (NOPH, db.holidays): paid to every employee, taken off NOWD, time worked = OT;
   - Holiday without pay (db.timeHolidays): not a paid day; time worked on it = full-day OT.
   Sundays are always off (time worked = OT). Click a date to set or change it. ---------------- */
function teCalPrevMonth(){ const [y,m]=teCalMonth.split('-').map(Number); const d=new Date(y,m-2,1); teCalMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render(teHostPage); }
function teCalNextMonth(){ const [y,m]=teCalMonth.split('-').map(Number); const d=new Date(y,m,1); teCalMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); render(teHostPage); }
function teCalGoMonth(v){ if(v){ teCalMonth=v; render(teHostPage); } }
function teHolCanEdit(){ return hasPerm('attendance','edit'); }
// 'paid' | 'unpaid' | '' for a date, with its name.
function teHolKind(dt){
  const p=(db.holidays||[]).find(h=>h.date===dt); if(p) return {kind:'paid', name:p.name||''};
  const u=(db.timeHolidays||[]).find(h=>h.date===dt); if(u) return {kind:'unpaid', name:u.remarks||''};
  return {kind:'', name:''};
}
function teHolOpen(dt){
  if(!teHolCanEdit()) return;
  if(!teEditActive('holidays')){ alert('Click Edit first.'); return; }
  const cur=teHolKind(dt);
  const opt=(v,label,sub)=>`<label class="teHolOpt"><input type="radio" name="teHolKind" value="${v}" ${cur.kind===v?'checked':''} onchange="teHolKindChanged()"><span><b>${label}</b><small>${sub}</small></span></label>`;
  document.getElementById('modalContent').innerHTML=`
    <h3>${fmtDate(dt)} · ${new Date(dt+'T00:00:00').toLocaleDateString('en-US',{weekday:'long'})}</h3>
    <div class="teHolOpts">
      ${opt('','Working day','A normal day.')}
      ${opt('paid','Paid holiday (NOPH)','Paid to every employee and taken off the working days (NOWD). Time worked is OT.')}
      ${opt('unpaid','Holiday without pay','Not a working day and not paid. Hours worked that day go in OT.')}
    </div>
    <div class="formGrid teHolNameWrap" style="margin-top:14px;" ${cur.kind?'':'hidden'}><div class="full"><label>Holiday name <span class="teReq">*</span></label><input id="teHolName" value="${teEsc(cur.name)}" placeholder="e.g. Diwali, Ayudha Pooja" onkeydown="if(event.key==='Enter')teHolSave('${dt}')"><small class="teHolNameHint">Shown in Attendance and the calendar for this day.</small></div></div>
    <div class="modalActions"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn" onclick="teHolSave('${dt}')">${ico('check')} Apply</button></div>`;
  showModal();
}
// The name box shows only when the day is a holiday (paid or without pay).
function teHolKindChanged(){
  const sel=document.querySelector('input[name="teHolKind"]:checked');
  const w=document.querySelector('.teHolNameWrap'); if(!w) return;
  w.hidden=!(sel && sel.value);
  if(sel && sel.value){ const i=document.getElementById('teHolName'); if(i) i.focus(); }
}
function teHolSave(dt){
  if(!teHolCanEdit()){ alert('You do not have permission to change the Holiday Calendar.'); return; }
  if(!teEditActive('holidays')){ alert('Click Edit first.'); return; }
  const sel=document.querySelector('input[name="teHolKind"]:checked');
  const kind=sel?sel.value:'';
  const name=String((document.getElementById('teHolName')||{}).value||'').trim();
  if(kind && !name){
    alert('Please enter the name of this holiday (e.g. Diwali, Ayudha Pooja).');
    const i=document.getElementById('teHolName'); if(i) i.focus();
    return;
  }
  const cur=teHolKind(dt);
  if(cur.kind && !kind && !hasPerm('attendance','delete')){ alert('You do not have permission to remove a holiday.'); return; }
  db.holidays=(db.holidays||[]).filter(h=>h.date!==dt);
  db.timeHolidays=(db.timeHolidays||[]).filter(h=>h.date!==dt);
  if(kind==='paid') db.holidays.push({date:dt, type:'NOPH', name});
  if(kind==='unpaid') db.timeHolidays.push({date:dt, remarks:name});
  db.holidays.sort((a,b)=>a.date.localeCompare(b.date));
  teEditTouch(); closeModal(); render(teHostPage); // used by Attendance / Payroll after Save
}
function renderTEHolidayTab(){
  const allowed=teHolCanEdit(), canEdit=allowed && teEditActive('holidays');
  const ym=teCalMonth, [y,m]=ym.split('-').map(Number);
  const dim=new Date(y,m,0).getDate();
  const lead=(new Date(y,m-1,1).getDay()+6)%7; // Monday first
  const today=todayStr();
  const cells=[];
  for(let i=0;i<lead;i++) cells.push('<div class="teCalCell empty"></div>');
  for(let d=1; d<=dim; d++){
    const dt=ym+'-'+String(d).padStart(2,'0');
    const isSun=new Date(y,m-1,d).getDay()===0;
    const h=teHolKind(dt);
    const cls='teCalCell'+(isSun?' sunday':'')+(h.kind==='paid'?' paid':'')+(h.kind==='unpaid'?' unpaid':'')+(dt===today?' today':'')+(canEdit&&!isSun?' editable':'');
    const tag=isSun?'<span class="teHolTag sun">Sunday</span>':h.kind==='paid'?'<span class="teHolTag paid">Paid holiday</span>':h.kind==='unpaid'?'<span class="teHolTag unpaid">No pay</span>':'';
    cells.push(`<div class="${cls}" ${canEdit&&!isSun?`role="button" tabindex="0" onclick="teHolOpen('${dt}')" onkeydown="if(event.key==='Enter')teHolOpen('${dt}')" title="Click to set this day"`:''}>
      <div class="teCalTop"><b>${d}</b>${dt===today?'<span class="teCalToday">Today</span>':''}</div>${tag}${h.name?`<span class="teHolName">${teEsc(h.name)}</span>`:''}</div>`);
  }
  const sundays=sundaysInMonth(ym), paid=holidaysInMonth(ym);
  const unpaid=(db.timeHolidays||[]).filter(h=>h.date.startsWith(ym) && new Date(h.date+'T00:00:00').getDay()!==0).length;
  return `${teEditBarHtml('holidays', allowed, 'Click Edit to set holidays.', 'Editing — click a date to set it, then Save. Attendance and Payroll use the calendar only after Save.')}
    <div class="teStatRow">
      <div class="teStatBox"><b>${dim}</b><span>Total days</span></div>
      <div class="teStatBox"><b>${sundays}</b><span>Sundays</span></div>
      <div class="teStatBox"><b>${paid}</b><span>Paid holidays (NOPH)</span></div>
      <div class="teStatBox"><b>${computeWorkingDays(ym)}</b><span>NOWD = ${dim} − ${sundays} − ${paid}</span></div>
      <div class="teStatBox"><b>${unpaid}</b><span>Holidays without pay</span></div>
    </div>
    <div class="panel">
    <div class="teCalHead">
      <h3 style="margin:0;">${ico('calendar')} Holiday Calendar</h3>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto;">
        <button class="btn secondary" onclick="teCalPrevMonth()" aria-label="Previous month">‹</button>
        <b style="min-width:120px;text-align:center;">${new Date(y,m-1,1).toLocaleString('en-US',{month:'long',year:'numeric'})}</b>
        <button class="btn secondary" onclick="teCalNextMonth()" aria-label="Next month">›</button>
        <input type="month" value="${ym}" onchange="teCalGoMonth(this.value)">
      </div>
    </div>
    <div class="teCalGrid">
      ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="teCalDow">${d}</div>`).join('')}
      ${cells.join('')}
    </div>
    <p class="syncNote">${canEdit?'Click a date to mark it as a <b>Paid holiday (NOPH)</b> or a <b>Holiday without pay</b>, or set it back to a working day. ':''}Paid holidays are paid to every employee, show as NOPH in Attendance and are taken off the working days (NOWD) used by Payroll. Time worked on a Sunday or any holiday is OT.</p>
  </div>`;
}
window.addEventListener('beforeunload',e=>{ if(teEwSaveBusy || (teEdit && teEdit.dirty)){ e.preventDefault(); e.returnValue=''; } });
window.addEventListener('resize', ()=>{ ['attGrid','attDayGrid'].forEach(id=>{ if(document.getElementById(id)) teFitGridBox(id); }); });
