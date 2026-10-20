/* ================= WORKING UNITS =================
   The company's working units are one list, db.units = [{code, name, address}], used by the
   employee form, attendance filter, pay slips, acquittance register and reports. Codes
   ('Unit-1', 'Unit-2', …) are what employee records store (employee.unit); names and addresses
   are edited in Software Admin → Company Details. Older data had only unit1Name/unit2Name —
   initDB() builds db.units from those (see ensureUnits()).
*/
// The company's units: plain numbered units (Unit-1, Unit-2, …), shown with the company's short
// name in front ("MF Unit-1" — unitDisplayName).
// Contractors are a separate list (06c-contractors.js).
const DEFAULT_UNITS = [
  {code:'Unit-1', name:'', address:''},
  {code:'Unit-2', name:'', address:''},
  {code:'Unit-3', name:'', address:''},
  {code:'Unit-4', name:'', address:''},
  {code:'Unit-5', name:'', address:''},
  {code:'Unit-6', name:'', address:''}
];
const UNITS_VERSION = 4;
// Names given by earlier versions of this list — placeholders ("Unit-2") and the contractor names
// that used to be stored as unit names (now in db.contractors). They are cleared once; a name
// typed by hand in Software Admin is never changed.
const UNIT_OLD_DEFAULT_NAMES = ['UNIT1','UNIT2','UNIT3','UNIT4','UNIT5','UNIT6',
  'SUNGROUP','JOYSHREE','JOYSHREEENTERPRISES','SMSCONT','SMSCONTRACTORS','MANOENTERPRISES'];
// Makes sure db.units exists and contains every default unit (adds missing ones once, except
// units the Software Admin deleted — db.removedUnits; never removes a unit itself, and only
// clears the earlier default names once — see UNIT_OLD_DEFAULT_NAMES).
// Keeps the old unit1/unit2 fields in step.
function ensureUnits(){
  if(!Array.isArray(db.units)) db.units=[];
  const legacy={'Unit-1':{name:db.unit1Name, address:db.unit1Address}, 'Unit-2':{name:db.unit2Name, address:db.unit2Address}};
  if(!Array.isArray(db.removedUnits)) db.removedUnits=[];
  DEFAULT_UNITS.forEach(d=>{
    if(db.units.some(u=>u && u.code===d.code)) return;
    if(db.removedUnits.includes(d.code)) return; // deleted in Software Admin — never re-add
    const old=legacy[d.code]||{};
    db.units.push({code:d.code, name:old.name||d.name, address:old.address||d.address});
  });
  db.units=db.units.filter(u=>u && u.code);
  if(!(db.unitsVersion>=UNITS_VERSION)){
    db.units.forEach(u=>{
      if(UNIT_OLD_DEFAULT_NAMES.includes(String(u.name||'').toUpperCase().replace(/[^A-Z0-9]/g,''))) u.name='';
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
// The unit code an employee (or a stored code) belongs to — unknown/blank falls back to Unit-1
// (or the first unit, if Unit-1 was deleted), as it always has.
function unitCodeOf(unit){
  const code = unit && typeof unit==='object' ? unit.unit : unit;
  const units=getUnits();
  if(units.some(u=>u.code===code)) return code;
  return units.some(u=>u.code==='Unit-1') ? 'Unit-1' : units[0].code;
}
// How many employees (any status — active, inactive or resigned) belong to a unit.
function unitEmployeeCount(code){
  return (db.employees||[]).filter(e=>unitCodeOf(e.unit)===code).length;
}
// A unit is shown with the company's short name in front: "MF Unit-1" (the first word of the
// Company Name set in Software Admin). Used everywhere a unit is shown: form and template
// dropdowns, employee list, attendance / time entry tabs, slips, registers, reports and Excel.
function unitPrefix(){ return String(db.companyName||'').trim().split(/\s+/)[0] || ''; }
function unitDisplayName(u){
  const p=unitPrefix();
  return p ? `${p} ${u.code}` : u.code;
}
// Short label for the unit tabs: "MF UNIT 1".
function unitTabLabel(u){ return unitDisplayName(u).replace(/-/g,' ').toUpperCase(); }
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
