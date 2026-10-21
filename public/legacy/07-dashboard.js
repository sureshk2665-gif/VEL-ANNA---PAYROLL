/* ================= DASHBOARD =================
   Greeting, an app launcher (one tile per module the signed-in user may open), KPI cards with
   small trend charts, and birthdays / recent joiners. Numbers count up and charts draw in when
   the page opens (see animatePageEnter() in 05-navigation.js); all motion is skipped for
   people who ask their system for reduced motion. */
// Launcher tiles, in menu order. `hue` picks the tile gradient (see .appTile[data-hue] in CSS).
const DASHBOARD_APPS = [
  {page:'employees',      label:'Employees',           icon:'users',         hue:'blue'},
  {page:'attendance',     label:'Attendance',          icon:'calendar-days', hue:'green'},
  {page:'timeentry',      label:'Employee Time Entry', icon:'timer',         hue:'cyan'},
  {page:'payroll',        label:'Payroll',             icon:'wallet',        hue:'violet'},
  {page:'payrollprocess', label:'Payroll Process',     icon:'calculator',    hue:'indigo'},
  {page:'salaryadvance',  label:'Salary Advance',      icon:'landmark',      hue:'orange'},
  {page:'contractorbill', label:'Contractors Bill',    icon:'receipt',       hue:'amber'},
  {page:'reports',        label:'Reports',             icon:'chart',         hue:'rose'},
  {page:'departments',    label:'Departments',         icon:'tag',           hue:'teal'},
  {page:'resigned',       label:'Resigned Employees',  icon:'door-open',     hue:'slate'},
  {page:'settings',       label:'Admin',               icon:'settings',      hue:'graphite'},
  {page:'softwareadmin',  label:'Software Admin',      icon:'shield-check',  hue:'graphite'}
];
function dashGreeting(){
  const h=new Date().getHours();
  return h<12 ? 'Good morning' : h<17 ? 'Good afternoon' : 'Good evening';
}
function dashEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// The last n months (oldest first) as 'YYYY-MM', ending with the current month.
function dashLastMonths(n){
  const d=new Date(), out=[];
  for(let i=n-1;i>=0;i--){ const x=new Date(d.getFullYear(), d.getMonth()-i, 1); out.push(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')); }
  return out;
}
// The last n working days (oldest first, no Sundays / holidays) up to today.
function dashLastWorkingDays(n){
  const out=[]; const d=new Date();
  for(let guard=0; out.length<n && guard<60; guard++){
    const ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if(d.getDay()!==0 && !isHolidayDate(ds)) out.unshift(ds);
    d.setDate(d.getDate()-1);
  }
  return out;
}
// Small area chart (inline SVG) for a KPI card. Draws in via CSS (.spark path.line).
function sparklineSvg(values, color){
  const w=240, h=56, pad=4;
  if(!values.length) values=[0];
  if(values.length===1) values=[values[0], values[0]];
  const max=Math.max(...values), min=Math.min(...values), span=(max-min)||1;
  const pts=values.map((v,i)=>[pad+i*(w-2*pad)/(values.length-1), h-pad-((v-min)/span)*(h-2*pad-6)-(max===min?(h-2*pad)/2-3:0)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+` L ${pts[pts.length-1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const id='sg'+Math.random().toString(36).slice(2,8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d="${area}" fill="url(#${id})"/>
    <path class="line" d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
  </svg>`;
}
function renderDashboard(){
  const emps=db.employees;
  const today=todayStr();
  const active=emps.filter(e=>isEmpOnRollOn(e,today));
  const counts={Present:0,Absent:0,HalfDay:0,LossOfPay:0,NOPH:0};
  active.forEach(e=>{
    const s=getAttStatus(today, e.code);
    if(!s) counts.Absent++;
    else if(counts[s]!==undefined) counts[s]++;
  });
  const marked=active.length-counts.Absent;
  const attPct = active.length ? Math.round((marked/active.length)*100) : 0;
  const isSundayToday=new Date().getDay()===0;

  // Trends
  const months=dashLastMonths(6);
  const headTrend=months.map(ym=>emps.filter(e=>isEmpOnRollInMonth(e,ym)).length);
  // Net pay per month from the live payroll (the same figures as the Payroll screen and slips).
  const payTrend=months.map(ym=>(payrollMonthRecords(ym)||[]).reduce((s,r)=>s+(r.netSalary||0),0));
  const days=dashLastWorkingDays(7);
  const dayStats=days.map(d=>{
    const onRoll=emps.filter(e=>isEmpOnRollOn(e,d));
    let present=0, absent=0, markedN=0;
    onRoll.forEach(e=>{ const s=getAttStatus(d,e.code); if(s) markedN++; if(s==='Present'||s==='HalfDay') present++; if(!s||s==='LossOfPay') absent++; });
    return {present, absent, pct: onRoll.length ? Math.round(markedN/onRoll.length*100) : 0};
  });
  const thisMonthPay=payTrend[payTrend.length-1];
  const lastPayMonth=[...months].reverse().find(ym=>payrollGenerated(ym));
  const payShown = thisMonthPay || (lastPayMonth ? payTrend[months.indexOf(lastPayMonth)] : 0);
  const payNote = thisMonthPay ? 'Net pay, this month' : (lastPayMonth ? 'Net pay, '+monthLabel(lastPayMonth) : 'No payroll generated yet');

  const now=new Date();
  const upcoming=active.filter(e=>e.dob).map(e=>{
    const d=new Date(e.dob); d.setFullYear(now.getFullYear());
    if(d<new Date(now.getFullYear(),now.getMonth(),now.getDate())) d.setFullYear(now.getFullYear()+1);
    return {...e,nextBday:d};
  }).sort((a,b)=>a.nextBday-b.nextBday).slice(0,6);
  const recent=[...emps].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,6);
  const firstName=String((currentUser&&(currentUser.name||currentUser.username))||'').trim().split(/\s+/)[0];
  const apps=DASHBOARD_APPS.filter(a=>a.page==='softwareadmin' ? isSoftwareAdmin() : canOpenModule(a.page));
  const dateText=now.toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const ringC=2*Math.PI*30;

  const kpi=(i, color, iconName, label, valueHtml, note, chart)=>`
    <div class="kpiCard" style="--i:${i};--kpi:${color};">
      <div class="kpiTop"><span class="kpiLabel">${label}</span><span class="kpiIcon">${ico(iconName)}</span></div>
      <div class="kpiValue">${valueHtml}</div>
      <div class="kpiNote">${note}</div>
      ${chart||''}
    </div>`;

  return `
  <section class="dashHero">
    <div>
      <h2 class="dashGreeting">${dashGreeting()}${firstName?', '+dashEsc(firstName):''}</h2>
      <p class="dashLead">${isSundayToday ? 'It\'s Sunday — no attendance is due today.' : 'Open an app below, or pick up where you left off.'}</p>
    </div>
    <div class="dashDate">${dashEsc(dateText)}</div>
  </section>

  <section class="appLauncher">
    ${apps.map((a,i)=>`<button type="button" class="appTile" data-hue="${a.hue}" style="--i:${i};" onclick="${a.page==='reports'?'reportView=null;':''}render('${a.page}')">
      <span class="appTileIcon">${ico(a.icon)}</span>
      <span class="appTileLabel">${a.label}</span>
    </button>`).join('')}
  </section>

  <section class="kpiGrid">
    ${kpi(0,'#3b6fd8','users','Active Employees',`<span data-count="${active.length}">${active.length}</span>`,'Headcount, last 6 months',sparklineSvg(headTrend,'#3b6fd8'))}
    ${kpi(1,'#1f9d6b','circle-check','Present Today',`<span data-count="${counts.Present+counts.HalfDay}">${counts.Present+counts.HalfDay}</span>`,'Last 7 working days',sparklineSvg(dayStats.map(d=>d.present),'#1f9d6b'))}
    ${kpi(2,'#d94848','circle-x','Absent Today',`<span data-count="${counts.Absent+counts.LossOfPay}">${counts.Absent+counts.LossOfPay}</span>`,'Unmarked or LOP, last 7 days',sparklineSvg(dayStats.map(d=>d.absent),'#d94848'))}
    ${kpi(3,'#7c5bd6','wallet','Salary Expense',`<span data-count="${Math.round(payShown)}" data-format="money">${fmt(payShown)}</span>`,payNote+' · last 6 months',sparklineSvg(payTrend,'#7c5bd6'))}
    <div class="kpiCard kpiRingCard" style="--i:4;--kpi:#1a9bb5;">
      <div class="kpiTop"><span class="kpiLabel">Attendance Today</span><span class="kpiIcon">${ico('percent')}</span></div>
      <div class="kpiNote">${marked} of ${active.length} accounted for</div>
      <div class="kpiRingRow">
        <svg class="kpiRing" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="30" class="track"/>
          <circle cx="36" cy="36" r="30" class="bar" style="--c:${ringC.toFixed(2)};--off:${(ringC*(1-attPct/100)).toFixed(2)};"/>
        </svg>
        <span class="kpiRingPct"><span data-count="${attPct}">${attPct}</span>%</span>
        <div class="kpiRingTrend">${sparklineSvg(dayStats.map(d=>d.pct),'#1a9bb5')}<span>7-day trend</span></div>
      </div>
    </div>
  </section>

  <section class="dashTwoCol">
    <div class="panel dashPanel" style="--i:0;">
      <div class="panelHead"><h3>${ico('cake')} Upcoming Birthdays</h3><span class="dashMeta">Next ${upcoming.length||0}</span></div>
      ${upcoming.length? `<ul class="dashList">${upcoming.map(e=>`<li><span class="avatarChip">${initials(e.name)}</span><span class="dlMain"><b>${dashEsc(e.name)}</b><small>${e.code}${e.department?' · '+dashEsc(e.department):''}</small></span><span class="dlSide">${fmtDate(e.nextBday)}</span></li>`).join('')}</ul>`
        : '<div class="empty">No birthday data yet.</div>'}
    </div>
    <div class="panel dashPanel" style="--i:1;">
      <div class="panelHead"><h3>${ico('user-plus')} Recent Employees</h3>${canOpenModule('employees')?`<button type="button" class="linkBtn" onclick="render('employees')">View all</button>`:''}</div>
      ${recent.length? `<ul class="dashList">${recent.map(e=>`<li><span class="avatarChip">${initials(e.name)}</span><span class="dlMain"><b>${dashEsc(e.name)}</b><small>${e.code}${e.department?' · '+dashEsc(e.department):''}${contractorName(e)?' · '+dashEsc(contractorName(e)):''}</small></span><span class="dlSide"><span class="tag ${e.status}">${e.status}</span></span></li>`).join('')}</ul>`
        : '<div class="empty">No employees yet. Add your first employee.</div>'}
    </div>
  </section>`;
}
function initials(name){
  if(!name) return '?';
  const parts=name.trim().split(/\s+/);
  return ((parts[0]?.[0]||'')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}

