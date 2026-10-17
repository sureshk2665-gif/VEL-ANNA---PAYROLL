/* ================= WORKING UNITS =================
   The company's working units are one list, db.units = [{code, name, address}], used by the
   employee form, attendance filter, pay slips, acquittance register and reports. Codes
   ('Unit-1', 'Unit-2', …) are what employee records store (employee.unit); names and addresses
   are edited in Software Admin → Company Details. Older data had only unit1Name/unit2Name —
   initDB() builds db.units from those (see ensureUnits()).
*/
// The company's units. Every unit is always shown WITH its number — "Unit-1 - SUN GROUP" — or
// just "Unit-2" while it has no name yet (names are added later in Software Admin).
const DEFAULT_UNITS = [
  {code:'Unit-1', name:'SUN GROUP', address:''},
  {code:'Unit-2', name:'', address:''},
  {code:'Unit-3', name:'JOY SHREE ENTERPRISES', address:''},
  {code:'Unit-4', name:'S M S CONT', address:''},
  {code:'Unit-5', name:'', address:''},
  {code:'Unit-6', name:'', address:''}
];
const UNITS_VERSION = 3;
// Names given by earlier versions of this list (placeholders like "Unit-2", and the first
// guesses JOY SHREE / SUN GROUP). They are replaced by the names above once — a name that was
// typed by hand in Software Admin is never changed.
const UNIT_OLD_DEFAULT_NAMES = {
  'Unit-1': ['Unit-1', ''],
  'Unit-2': ['Unit-2'],
  'Unit-3': ['JOY SHREE', 'Unit-3'],
  'Unit-4': ['SUN GROUP', 'Unit-4'],
  'Unit-5': ['Unit-5'],
  'Unit-6': ['Unit-6']
};
// Makes sure db.units exists and contains every default unit (adds missing ones once; never
// removes a unit, and only replaces the earlier default names once — see UNIT_OLD_DEFAULT_NAMES).
// Keeps the old unit1/unit2 fields in step.
function ensureUnits(){
  if(!Array.isArray(db.units)) db.units=[];
  const legacy={'Unit-1':{name:db.unit1Name, address:db.unit1Address}, 'Unit-2':{name:db.unit2Name, address:db.unit2Address}};
  DEFAULT_UNITS.forEach(d=>{
    if(db.units.some(u=>u && u.code===d.code)) return;
    const old=legacy[d.code]||{};
    db.units.push({code:d.code, name:old.name||d.name, address:old.address||d.address});
  });
  db.units=db.units.filter(u=>u && u.code);
  if(!(db.unitsVersion>=UNITS_VERSION)){
    db.units.forEach(u=>{
      const old=UNIT_OLD_DEFAULT_NAMES[u.code];
      const final=DEFAULT_UNITS.find(d=>d.code===u.code);
      if(old && final && old.includes(String(u.name||'').trim())) u.name=final.name;
    });
    db.unitsVersion=UNITS_VERSION;
  }
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
// "Unit-1 - SUN GROUP", or just "Unit-2" while the unit has no name. Used everywhere a unit is
// shown: form and template dropdowns, employee list, slips, registers and reports.
function unitDisplayName(u){
  const name=String((u && u.name) || '').trim();
  return name && name!==u.code ? `${u.code} - ${name}` : u.code;
}
function unitLabel(unit){
  const code=unitCodeOf(unit);
  return unitDisplayName(getUnits().find(x=>x.code===code) || {code});
}
// Returns the printed address for a Working Unit, falling back to the main company address if
// that unit's address hasn't been set up in Software Admin.
function unitAddress(unit){
  const u=getUnits().find(x=>x.code===unitCodeOf(unit));
  return (u && u.address) || db.companyAddress || 'Company Address, City, State';
}
// <option>s for a unit <select>; `selected` is the chosen code.
function unitOptionsHtml(selected){
  return getUnits().map(u=>`<option value="${u.code}" ${u.code===selected?'selected':''}>${unitDisplayName(u)}</option>`).join('');
}
