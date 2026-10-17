/* ================= WORKING UNITS =================
   The company's working units are one list, db.units = [{code, name, address}], used by the
   employee form, attendance filter, pay slips, acquittance register and reports. Codes
   ('Unit-1', 'Unit-2', …) are what employee records store (employee.unit); names and addresses
   are edited in Software Admin → Company Details. Older data had only unit1Name/unit2Name —
   initDB() builds db.units from those (see ensureUnits()).
*/
const DEFAULT_UNITS = [
  {code:'Unit-1', name:'Unit-1', address:''},
  {code:'Unit-2', name:'Unit-2', address:''},
  {code:'Unit-3', name:'JOY SHREE', address:''},
  {code:'Unit-4', name:'SUN GROUP', address:''}
];
// Makes sure db.units exists and contains every default unit (adds missing ones once; never
// renames or removes a unit that is already there). Keeps the old unit1/unit2 fields in step.
function ensureUnits(){
  if(!Array.isArray(db.units)) db.units=[];
  const legacy={'Unit-1':{name:db.unit1Name, address:db.unit1Address}, 'Unit-2':{name:db.unit2Name, address:db.unit2Address}};
  DEFAULT_UNITS.forEach(d=>{
    if(db.units.some(u=>u && u.code===d.code)) return;
    const old=legacy[d.code]||{};
    db.units.push({code:d.code, name:old.name||d.name, address:old.address||d.address});
  });
  db.units=db.units.filter(u=>u && u.code);
  db.units.sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  syncLegacyUnitFields();
}
function syncLegacyUnitFields(){
  const u1=db.units.find(u=>u.code==='Unit-1'), u2=db.units.find(u=>u.code==='Unit-2');
  if(u1){ db.unit1Name=u1.name; db.unit1Address=u1.address||''; }
  if(u2){ db.unit2Name=u2.name; db.unit2Address=u2.address||''; }
}
function getUnits(){
  return (Array.isArray(db.units) && db.units.length) ? db.units : DEFAULT_UNITS;
}
// The unit code an employee (or a stored code) belongs to — unknown/blank falls back to Unit-1,
// as it always has.
function unitCodeOf(unit){
  const code = unit && typeof unit==='object' ? unit.unit : unit;
  return getUnits().some(u=>u.code===code) ? code : 'Unit-1';
}
function unitLabel(unit){
  const u=getUnits().find(x=>x.code===unitCodeOf(unit));
  return (u && u.name) || unitCodeOf(unit);
}
// Returns the printed address for a Working Unit, falling back to the main company address if
// that unit's address hasn't been set up in Software Admin.
function unitAddress(unit){
  const u=getUnits().find(x=>x.code===unitCodeOf(unit));
  return (u && u.address) || db.companyAddress || 'Company Address, City, State';
}
// <option>s for a unit <select>; `selected` is the chosen code.
function unitOptionsHtml(selected){
  return getUnits().map(u=>`<option value="${u.code}" ${u.code===selected?'selected':''}>${u.name||u.code}</option>`).join('');
}
