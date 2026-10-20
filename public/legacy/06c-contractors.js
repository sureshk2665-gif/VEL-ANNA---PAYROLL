/* ================= CONTRACTORS =================
   Contractors supply employees; units are the places they work. The two lists are separate
   and independent — any contractor can provide employees to any unit, and the number of
   contractors and units need not match. db.contractors = [{code, name, address, phone}];
   employee.contractor stores the code ('C-1', …) so renaming a contractor in Software Admin
   changes it everywhere. Earlier versions kept the contractor names (SUN GROUP, …) as unit
   names — ensureContractors() moves them over once (see initDB()). */
const DEFAULT_CONTRACTORS = [
  {code:'C-1', name:'SUN GROUP'},
  {code:'C-2', name:'JOY SHREE ENTERPRISES'},
  {code:'C-3', name:'SMS CONTRACTORS'},
  {code:'C-4', name:'MANO ENTERPRISES'}
];
// Old unit names that were really contractors → contractor code (compared without spaces).
const CONTRACTOR_FROM_UNIT_NAME = {SUNGROUP:'C-1', JOYSHREE:'C-2', JOYSHREEENTERPRISES:'C-2', SMSCONT:'C-3', SMSCONTRACTORS:'C-3', MANOENTERPRISES:'C-4'};
function contractorKeyOf(name){ return String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
// Runs before ensureUnits(): creates the contractor list once and gives every existing employee
// the contractor their old unit name stood for. Unit names are cleared afterwards by ensureUnits().
function ensureContractors(){
  if(Array.isArray(db.contractors)){ db.contractors=db.contractors.filter(c=>c && c.code); return; }
  db.contractors=DEFAULT_CONTRACTORS.map(c=>({...c, address:'', phone:''}));
  const units=Array.isArray(db.units) ? db.units : [];
  (db.employees||[]).forEach(e=>{
    if(e.contractor) return;
    const code=e.unit || 'Unit-1';
    const u=units.find(x=>x && x.code===code);
    const name=u ? u.name : (code==='Unit-1' ? db.unit1Name : code==='Unit-2' ? db.unit2Name : '');
    e.contractor=CONTRACTOR_FROM_UNIT_NAME[contractorKeyOf(name)]||'';
  });
}
function getContractors(){ return Array.isArray(db.contractors) ? db.contractors : []; }
// Contractor name for a code (or an employee); '' when none is set.
function contractorName(c){
  const code = c && typeof c==='object' ? c.contractor : c;
  const hit=getContractors().find(x=>x.code===code);
  return hit ? String(hit.name||hit.code) : '';
}
// Does employee e match a contractor filter? '' = all, '-' = no contractor, else a contractor code.
function contractorFilterMatches(e, filter){
  if(!filter) return true;
  return (e && e.contractor || '') === (filter==='-' ? '' : filter);
}
// <option>s for a contractor filter <select>: All Contractors, each contractor, and "Non Contractor"
// (employees the company employs directly — no contractor).
function contractorFilterOptionsHtml(selected){
  return `<option value="" ${!selected?'selected':''}>All Contractors</option>`
    + getContractors().map(c=>`<option value="${c.code}" ${selected===c.code?'selected':''}>${c.name||c.code}</option>`).join('')
    + `<option value="-" ${selected==='-'?'selected':''}>Non Contractor</option>`;
}
// How many employees (any status — active, inactive or resigned) a contractor has supplied.
function contractorEmployeeCount(code){
  return (db.employees||[]).filter(e=>e.contractor===code).length;
}
