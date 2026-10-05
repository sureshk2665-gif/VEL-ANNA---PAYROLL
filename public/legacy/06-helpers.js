/* ================= HELPERS ================= */
function fmt(n){ return '₹'+(Math.round((n||0)*100)/100).toLocaleString('en-IN'); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function monthKey(d){ return d.slice(0,7); }
function daysInMonth(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0).getDate(); }
/* Display helper: converts a YYYY-MM-DD (or Date object) value into DD-MM-YYYY for
   on-screen/printed display. Underlying stored values stay in YYYY-MM-DD (ISO) since
   that's what <input type="date"> and all date comparisons/sorting need. */
function fmtDate(d){
  if(!d) return '';
  let y,mo,da;
  if(d instanceof Date){ y=d.getFullYear(); mo=d.getMonth()+1; da=d.getDate(); }
  else{
    const s=String(d).slice(0,10);
    const parts=s.split('-');
    if(parts.length!==3) return s;
    [y,mo,da]=parts.map(Number);
  }
  return String(da).padStart(2,'0')+'-'+String(mo).padStart(2,'0')+'-'+y;
}

/* ================= RESIGNATION-AWARE ELIGIBILITY =================
   An employee counts as "on the books" for a given day/month if they are Active,
   or Resigned but the day/month in question is on or before their Resignation Date.
   This keeps resigned employees fully visible in historical attendance/payroll/reports
   up to their resignation date, while automatically dropping them from anything
   generated for a later date/month. */
function isEmpOnRollOn(e, dateStr){
  // Past, closed stints (previous employment periods ended by an earlier resignation
  // and later reopened by a rejoin) still count for their own date range.
  if(e.employmentHistory && e.employmentHistory.some(h=>h.joinDate && h.resignDate && dateStr>=h.joinDate && dateStr<=h.resignDate)) return true;
  // Current stint.
  if(e.joining && dateStr<e.joining) return false;
  if(e.status!=='Resigned') return true;
  if(!e.resignationDate) return true;
  return dateStr <= e.resignationDate;
}
function isEmpOnRollInMonth(e, ym){
  if(e.employmentHistory && e.employmentHistory.some(h=>h.joinDate && h.resignDate && ym>=monthKey(h.joinDate) && ym<=monthKey(h.resignDate))) return true;
  if(e.joining && ym<monthKey(e.joining)) return false;
  if(e.status!=='Resigned') return true;
  if(!e.resignationDate) return true;
  return ym <= monthKey(e.resignationDate);
}
function calcGross(e){
  return (Number(e.basic)||0)+(Number(e.hra)||0)+(Number(e.da)||0)+(Number(e.special)||0)+(Number(e.medical)||0)+(Number(e.conveyance)||0)+(Number(e.washing)||0)+(Number(e.other)||0);
}
function calcNet(e){
  const gross=calcGross(e);
  const esiWages=gross-(Number(e.washing)||0);
  const esi = e.esiApplicable ? Math.round(esiWages*getSettings().esiRate) : 0;
  const pfWages=(Number(e.basic)||0)+(Number(e.da)||0);
  const pf = e.pfApplicable ? Math.round(pfWages*getSettings().pfRate) : 0;
  const ded=pf+esi+(Number(e.pt)||0)+(Number(e.otherDed)||0)+(Number(e.rent)||0);
  return gross-ded;
}
function amountInWords(num){
  num=Math.round(num);
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n){ if(n<20) return a[n]; return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:''); }
  function three(n){ if(n>99) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+two(n%100):''); return two(n); }
  if(num===0) return 'Zero Rupees Only';
  let str='';
  const crore=Math.floor(num/10000000); num%=10000000;
  const lakh=Math.floor(num/100000); num%=100000;
  const thousand=Math.floor(num/1000); num%=1000;
  if(crore) str+=three(crore)+' Crore ';
  if(lakh) str+=three(lakh)+' Lakh ';
  if(thousand) str+=three(thousand)+' Thousand ';
  if(num) str+=three(num);
  return str.trim()+' Rupees Only';
}

