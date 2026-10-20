/* ================= EMPLOYEE FIELDS — single source of truth =================
   Every field of the Add / Edit Employee form is defined ONCE here, in form order. The same list
   drives:
     - the form itself (employeeFormHtml)              — public/legacy/08-employees.js
     - saving the form (readEmployeeFormFields)        — saveEmployee()
     - the Bulk Import Excel template columns + checks — src/features/employee-import/
     - creating employees from the sheet               — importEmployees()
   So adding, renaming, reordering or removing a field here changes the form AND the template together.

   Field properties:
     key        record property (e.g. 'basic' -> employee.basic)
     label      label in the form = column header in the sheet
     section    'basic' | 'bank' | 'salary' (fieldset in the form)
     input      'text' | 'date' | 'number' | 'select'
     id         form element id (default 'f_' + key)
     options    select choices: [{value, label}] (or a function returning them)
     formValue  (employee) => value shown in the form (default employee[key] or '' / 0)
     readValue  (rawValue) => value stored (default: text as typed, numbers +value||0)
     auto       shown in the form but not editable (filled automatically) — grey, ignored on import
     sheet      false = not a template column (e.g. resignation details: the sheet is for new employees)
     sheetOptions  limit the template dropdown to these values (e.g. Status: only Active)
     required, full (full-width row), title (tooltip), attrs (extra HTML), wrap (wrapper div attrs),
     width      sheet column width (characters)
*/
function employeeFieldSections(){
  return [
    {key:'basic',  title:'Basic Information'},
    {key:'bank',   title:'Bank &amp; Statutory Details'},
    {key:'salary', title:'Salary Details (Daily Wage ₹)'}
  ];
}
function employeeFields(){
  const opts = list => list.map(v => ({value:v, label:v}));
  // Dropdowns that may stay empty: a blank first choice (left out of the Excel dropdown — an empty
  // cell means "not given", and import keeps it empty).
  const blankOpt = list => [{value:'', label:'— Select —'}, ...opts(list)];
  // The employee's current value stays selectable even if it was later removed from the list.
  const withCurrent = (list, cur) => (cur && !list.includes(cur)) ? [...list, cur] : list;
  const resignedWrap = (e, extra) => (extra||'') + ` style="${e.status==='Resigned'?'':'display:none;'}"`;
  const inactiveWrap = (e, extra) => (extra||'') + ` style="${e.status==='Inactive'?'':'display:none;'}"`;
  return [
    // ---- Basic Information ----
    {key:'code', label:'Employee Code', section:'basic', input:'text', auto:true, id:'',
      formValue:e=>e.code||'(auto)', width:14},
    {key:'status', label:'Status', section:'basic', input:'select', options:opts(['Active','Inactive','Resigned']),
      attrs:'onchange="toggleResignationField(this.value)"', formValue:e=>e.status||'Active', sheetOptions:['Active'], blankDefault:true, width:11},
    {key:'inactiveFrom', label:'Inactive From', section:'basic', input:'date', sheet:false,
      wrap:e=>inactiveWrap(e,' id="f_inactiveWrap"')},
    {key:'resignationDate', label:'Resignation Date', section:'basic', input:'date', sheet:false,
      wrap:e=>resignedWrap(e,' id="f_resignationWrap"')},
    {key:'resignReason', label:'Reason for Resignation (Optional)', section:'basic', input:'text', sheet:false, full:true,
      wrap:e=>resignedWrap(e,' id="f_resignReasonWrap"'), readValue:v=>String(v).trim()},
    {key:'name', label:'Full Name *', section:'basic', input:'text', required:true, attrs:'required', readValue:v=>String(v).trim(), width:26},
    {key:'gender', label:'Gender', section:'basic', input:'select', options:blankOpt(['Male','Female','Other']), width:10},
    {key:'dob', label:'Date of Birth', sheetLabel:'Date of Birth (DD-MM-YYYY)', section:'basic', input:'date', width:16},
    {key:'relative', label:'Father / Husband Name', section:'basic', input:'text', width:22},
    {key:'mobile', label:'Mobile Number', section:'basic', input:'text', width:15},
    {key:'email', label:'Email', section:'basic', input:'text', width:24},
    {key:'address', label:'Address', section:'basic', input:'text', full:true, width:32},
    {key:'joining', label:'Joining Date', sheetLabel:'Joining Date (DD-MM-YYYY)', section:'basic', input:'date', width:16},
    {key:'department', label:'Department', section:'basic', input:'select', id:'f_dept',
      options:e=>blankOpt(withCurrent(db.departments||[], e&&e.department)), width:16},
    // Managed list (Admin → Designations), like Departments.
    {key:'designation', label:'Designation', section:'basic', input:'select',
      options:e=>blankOpt(withCurrent(designationList(), e&&e.designation)), width:18},
    {key:'empType', label:'Employment Type', section:'basic', input:'select', options:blankOpt(['Full-Time','Part-Time','Contract']), width:15},
    {key:'unit', label:'Working Unit', section:'basic', input:'select',
      // Import also accepts just the unit name or number ("Unit-1").
      options:()=>getUnits().map(u=>({value:u.code, label:unitDisplayName(u), aliases:[u.code].concat(u.name?[u.name]:[])})),
      formValue:e=>unitCodeOf(e.unit), width:16},
    // Who supplied the employee — independent of the unit (see 06c-contractors.js).
    {key:'contractor', label:'Contractor', section:'basic', input:'select',
      options:()=>[{value:'', label:'Non Contractor'}, ...getContractors().map(c=>({value:c.code, label:c.name||c.code, aliases:[c.code]}))],
      formValue:e=>e.contractor||'', width:22},
    // ---- Bank & Statutory Details ----
    {key:'bankName', label:'Bank Name', section:'bank', input:'text', width:18},
    {key:'branch', label:'Branch', section:'bank', input:'text', width:16},
    {key:'accNo', label:'Account Number', section:'bank', input:'text', width:20},
    {key:'ifsc', label:'IFSC', section:'bank', input:'text', width:14},
    {key:'pan', label:'PAN Number', section:'bank', input:'text', width:14},
    {key:'aadhaar', label:'Aadhaar Number', section:'bank', input:'text', width:16},
    {key:'pfNo', label:'PF Number', section:'bank', input:'text', width:16},
    {key:'esiNo', label:'ESI Number', section:'bank', input:'text', width:16},
    {key:'uan', label:'UAN Number', section:'bank', input:'text', width:16},
    // ---- Salary Details ----
    // Daily wage (TOTAL per day). Basic and HRA follow from it automatically — see
    // dailyWageSplit(); the Excel template carries the same formulas (sheetFormula). The 1-hour OT
    // rate is only SHOWN (displayOnly — never stored): Payroll works it out itself (Daily Wage ÷ 8 × 1.5).
    {key:'dailyWage', label:'Daily Wage — TOTAL (₹ per day)', section:'salary', input:'number',
      attrs:'oninput="updateWageSplit(this.value)"', formValue:e=>e.dailyWage||0, width:16},
    {key:'basic', label:'Basic / day (60%)', section:'salary', input:'number', auto:true,
      title:'Basic = 60% of the Daily Wage', sheetFormula:'ROUND({dailyWage}*60%,2)', width:13},
    {key:'hra', label:'HRA / day (40%)', section:'salary', input:'number', auto:true,
      title:'HRA = 40% of the Daily Wage', sheetFormula:'ROUND({dailyWage}*40%,2)', width:13},
    {key:'otRate', label:'OT Rate — 1 hour (₹)', section:'salary', input:'number', auto:true, displayOnly:true,
      title:'1-hour OT rate = Daily Wage ÷ 8 × 1.5 (shown for reference; Payroll calculates OT from the monthly OT hours in Employee Time Entry (or a figure typed on Attendance))',
      formValue:e=>dailyWageSplit(e.dailyWage).otRate, sheetFormula:'ROUND({dailyWage}/8*1.5,0)', width:13},
    {key:'mode', label:'Payment Mode', section:'salary', input:'select', options:blankOpt(['NEFT','TRANSFER','CASH','CHEQUE']), width:13},
    // Stored as pfDeduction ('yes'|'no'|'nil') plus the pfApplicable flag used by payroll.
    // PF / ESI Deduction are set in the form only — not in the bulk-import sheet (new employees
    // start at Yes; Payroll calculates the amounts).
    {key:'pfDeduction', label:'PF Deduction', section:'salary', input:'select', id:'f_pfApplicable', sheet:false,
      options:[{value:'yes',label:'Yes'},{value:'no',label:'Exempted'},{value:'nil',label:'Nil'}],
      formValue:e=>e.pfDeduction || (e.pfApplicable===false ? 'no' : 'yes'),
      readValue:v=>({pfDeduction:v, pfApplicable:v==='yes'}), width:13},
    {key:'esiApplicable', label:'ESI Deduction', section:'salary', input:'select', sheet:false,
      options:[{value:'yes',label:'Yes'},{value:'no',label:'Exempted'}],
      formValue:e=>e.esiApplicable===false ? 'no' : 'yes',
      readValue:v=>v==='yes', width:13},
    // Canteen tokens bought each month — deducted at the Canteen Token Price (Payroll Process).
    // This is the usual monthly count; it can be changed for a single month on the Attendance screen.
    {key:'canteenTokens', label:'Canteen Tokens (per month)', section:'salary', input:'number',
      title:'Number of canteen tokens this employee buys each month. Deducted from salary at the Canteen Token Price set in Payroll Process.', width:14}
  ];
}
// Daily wage → Basic (60%), HRA (40%) and OT rate per hour (wage ÷ 8 × 1.5), same as the sheet.
// The OT rate is used by Payroll only; employee records store dailyWage / basic / hra
// (employeeWageFields()).
function dailyWageSplit(wage){
  const w=Math.max(0, +wage||0);
  return { dailyWage:w, basic:Math.round(w*0.6*100)/100, hra:Math.round(w*0.4*100)/100, otRate:Math.round(w/8*1.5) };
}
function employeeWageFields(wage){
  const s=dailyWageSplit(wage);
  return { dailyWage:s.dailyWage, basic:s.basic, hra:s.hra };
}
// Live update of the read-only Basic / HRA / 1-hour OT rate while the Daily Wage is typed in the form.
function updateWageSplit(v){
  const s=dailyWageSplit(v);
  [['f_basic',s.basic],['f_hra',s.hra],['f_otRate',s.otRate]].forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.value=val; });
}
function employeeFieldId(f){ return f.id===undefined ? 'f_'+f.key : f.id; }
function employeeFieldOptions(f, e){ return typeof f.options==='function' ? f.options(e) : (f.options||[]); }
// Designations (Admin → Designations); the dropdown in the form and the Excel template.
function designationList(){ return Array.isArray(db.designations) ? db.designations : []; }
function employeeFieldFormValue(f, e){
  if(f.formValue) return f.formValue(e);
  const v=e[f.key];
  if(f.input==='number') return v||0;
  return v===undefined || v===null ? '' : v;
}
function empAttr(s){ return String(s===undefined||s===null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

// HTML of the form's fieldsets for employee `e` (an existing employee, or {code:'', status:'Active'}).
function employeeFormHtml(e){
  const fields=employeeFields();
  return employeeFieldSections().map(sec=>{
    const items=fields.filter(f=>f.section===sec.key).map(f=>{
      const id=employeeFieldId(f);
      const val=employeeFieldFormValue(f,e);
      const idAttr=id ? ` id="${id}"` : '';
      const extra=(f.attrs?' '+f.attrs:'')+(f.auto?' disabled':'')+(f.title?` title="${empAttr(f.title)}"`:'');
      let control;
      if(f.input==='select'){
        control=`<select${idAttr}${extra}>${employeeFieldOptions(f,e).map(o=>`<option value="${empAttr(o.value)}" ${String(val)===String(o.value)?'selected':''}>${o.label}</option>`).join('')}</select>`;
      }else{
        const type=f.input==='text' ? '' : ` type="${f.input}"`;
        control=`<input${type}${idAttr} value="${empAttr(val)}"${extra}>`;
      }
      const wrapAttrs=(f.full?' class="full"':'')+(f.wrap?f.wrap(e):'');
      return `<div${wrapAttrs}><label>${f.label}</label>${control}</div>`;
    }).join('\n      ');
    return `<fieldset><legend>${sec.title}</legend>
    <div class="formGrid">
      ${items}
    </div></fieldset>`;
  }).join('\n\n    ');
}
// Reads every editable field from the open form into a plain object (record fields).
function readEmployeeFormFields(){
  const out={};
  employeeFields().forEach(f=>{
    const id=employeeFieldId(f);
    const el=id ? document.getElementById(id) : null;
    if(!el || f.displayOnly) return; // displayOnly fields (1-hour OT rate) are shown, never saved
    const raw=el.value;
    const v = f.readValue ? f.readValue(raw) : (f.input==='number' ? (+raw||0) : raw);
    if(v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, v); else out[f.key]=v;
  });
  return out;
}
// Field list for the Bulk Import template (React side): only sheet columns, with resolved options.
function employeeSheetFields(){
  return employeeFields().filter(f=>f.sheet!==false).map(f=>({
    key:f.key, label:f.sheetLabel||f.label, altLabels:f.sheetLabel?[f.label]:[], input:f.input, auto:!!f.auto, required:!!f.required,
    blankDefault:!!f.blankDefault, width:f.width||14, formula:f.sheetFormula||'',
    // Every dropdown (except Status) ends with a "None" choice that leaves the field empty — the
    // Contractor dropdown calls it "Non Contractor". An empty cell means the same.
    options: f.input==='select'
      ? employeeFieldOptions(f).filter(o=>o.value!=='' && (!f.sheetOptions || f.sheetOptions.includes(o.value))).map(o=>({value:o.value, label:String(o.label), aliases:o.aliases||[]}))
          .concat(f.key==='status' ? [] : [f.key==='contractor' ? {value:'', label:'Non Contractor', aliases:['None']} : {value:'', label:'None', aliases:[]}])
      : undefined
  }));
}
// Turns one validated sheet row ({key: stored value}) into record fields, exactly like the form
// would for a new employee (auto fields start at 0 / are generated by the caller).
function employeeRecordFromSheet(values){
  const out={};
  employeeFields().forEach(f=>{
    if(f.key==='code' || f.displayOnly) return;
    let raw = f.auto ? (f.input==='number' ? 0 : '') : values[f.key];
    if(raw===undefined || raw===null) raw = f.input==='number' ? 0 : '';
    if(f.input==='number'){ out[f.key]=+raw||0; return; }
    if(f.input==='select'){
      // values hold the option value already (e.g. 'yes'). An empty cell stays empty — except Status
      // (always Active) and the fields not in the sheet (PF/ESI Deduction), which take the form default.
      const options=employeeFieldOptions(f);
      const val = options.some(o=>String(o.value)===String(raw)) ? raw
        : (raw==='' && !f.blankDefault && f.sheet!==false) ? '' : employeeFieldFormValue(f,{});
      const v = f.readValue ? f.readValue(val) : val;
      if(v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, v); else out[f.key]=v;
      return;
    }
    out[f.key] = f.readValue ? f.readValue(String(raw)) : String(raw);
  });
  return out;
}
