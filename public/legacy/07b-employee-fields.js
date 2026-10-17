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
    {key:'salary', title:'Salary Details (Monthly ₹ — "Scale")'}
  ];
}
function employeeFields(){
  const opts = list => list.map(v => ({value:v, label:v}));
  const resignedWrap = (e, extra) => (extra||'') + ` style="${e.status==='Resigned'?'':'display:none;'}"`;
  return [
    // ---- Basic Information ----
    {key:'code', label:'Employee Code', section:'basic', input:'text', auto:true, id:'',
      formValue:e=>e.code||'(auto)', width:14},
    {key:'status', label:'Status', section:'basic', input:'select', options:opts(['Active','Resigned']),
      attrs:'onchange="toggleResignationField(this.value)"', formValue:e=>e.status||'Active', sheetOptions:['Active'], width:11},
    {key:'resignationDate', label:'Resignation Date', section:'basic', input:'date', sheet:false,
      wrap:e=>resignedWrap(e,' id="f_resignationWrap"')},
    {key:'resignReason', label:'Reason for Resignation (Optional)', section:'basic', input:'text', sheet:false, full:true,
      wrap:e=>resignedWrap(e,' id="f_resignReasonWrap"'), readValue:v=>String(v).trim()},
    {key:'name', label:'Full Name *', section:'basic', input:'text', required:true, attrs:'required', readValue:v=>String(v).trim(), width:26},
    {key:'gender', label:'Gender', section:'basic', input:'select', options:opts(['Male','Female','Other']), width:10},
    {key:'dob', label:'Date of Birth', section:'basic', input:'date', width:14},
    {key:'relative', label:'Father / Husband Name', section:'basic', input:'text', width:22},
    {key:'mobile', label:'Mobile Number', section:'basic', input:'text', width:15},
    {key:'email', label:'Email', section:'basic', input:'text', width:24},
    {key:'address', label:'Address', section:'basic', input:'text', full:true, width:32},
    {key:'joining', label:'Joining Date', section:'basic', input:'date', width:14},
    {key:'department', label:'Department', section:'basic', input:'select', id:'f_dept',
      options:()=>opts(db.departments||[]), width:16},
    {key:'designation', label:'Designation', section:'basic', input:'text', width:18},
    {key:'empType', label:'Employment Type', section:'basic', input:'select', options:opts(['Full-Time','Part-Time','Contract']), width:15},
    {key:'unit', label:'Working Unit', section:'basic', input:'select',
      // Import also accepts just the unit name ("SUN GROUP") or number ("Unit-1").
      options:()=>getUnits().map(u=>({value:u.code, label:unitDisplayName(u), aliases:u.name?[u.name]:[]})),
      formValue:e=>unitCodeOf(e.unit), width:16},
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
    {key:'basic', label:'Basic Salary', section:'salary', input:'number', width:13},
    {key:'hra', label:'HRA', section:'salary', input:'number', width:10},
    {key:'da', label:'DA', section:'salary', input:'number', width:10},
    {key:'special', label:'Special Allowance', section:'salary', input:'number', width:12},
    {key:'medical', label:'Medical Allowance', section:'salary', input:'number', width:12},
    {key:'conveyance', label:'Conveyance', section:'salary', input:'number', width:12},
    {key:'washing', label:'Washing Allowance', section:'salary', input:'number', width:12},
    {key:'other', label:'Other Allowance', section:'salary', input:'number', width:12},
    {key:'otRate', label:'OT Rate (auto: Basic ÷ 26 ÷ 8 hrs × 2)', section:'salary', input:'number', auto:true,
      title:'OT rate is auto-calculated from Basic salary ÷ 26 ÷ 8 hrs × 2 and is no longer entered manually.', width:16},
    {key:'mode', label:'Payment Mode', section:'salary', input:'select', options:opts(['NEFT','TRANSFER','CASH','CHEQUE']), width:13},
    // Stored as pfDeduction ('yes'|'no'|'nil') plus the pfApplicable flag used by payroll.
    {key:'pfDeduction', label:'PF Deduction', section:'salary', input:'select', id:'f_pfApplicable',
      options:[{value:'yes',label:'Yes'},{value:'no',label:'Exempted'},{value:'nil',label:'Nil'}],
      formValue:e=>e.pfDeduction || (e.pfApplicable===false ? 'no' : 'yes'),
      readValue:v=>({pfDeduction:v, pfApplicable:v==='yes'}), width:13},
    {key:'esiApplicable', label:'ESI Deduction', section:'salary', input:'select',
      options:[{value:'yes',label:'Yes'},{value:'no',label:'Exempted'}],
      formValue:e=>e.esiApplicable===false ? 'no' : 'yes',
      readValue:v=>v==='yes', width:13},
    {key:'pt', label:'Professional Tax / Income Tax', section:'salary', input:'number', width:14},
    {key:'canteenRate', label:'Canteen Rate (per day ₹) — not used in payroll', section:'salary', input:'number', auto:true,
      title:'Fixed per-day canteen deduction has been removed from payroll. Only Lunch/Dinner tokens are deducted now.', width:16},
    {key:'rent', label:'Rent Deduction (monthly)', section:'salary', input:'number', width:13},
    {key:'otherDed', label:'Other Deductions (fixed)', section:'salary', input:'number', width:13},
    {key:'clBalance', label:'CL Balance', section:'salary', input:'number', width:10},
    {key:'noplBalance', label:'NOPL Balance (Opening)', section:'salary', input:'number',
      title:'Opening NOPL (Paid Leave) balance. Paid Leave marked in Attendance is auto-deducted from this to get the balance shown on the Salary Slip.', width:12}
  ];
}
function employeeFieldId(f){ return f.id===undefined ? 'f_'+f.key : f.id; }
function employeeFieldOptions(f){ return typeof f.options==='function' ? f.options() : (f.options||[]); }
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
        control=`<select${idAttr}${extra}>${employeeFieldOptions(f).map(o=>`<option value="${empAttr(o.value)}" ${String(val)===String(o.value)?'selected':''}>${o.label}</option>`).join('')}</select>`;
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
    if(!el) return;
    const raw=el.value;
    const v = f.readValue ? f.readValue(raw) : (f.input==='number' ? (+raw||0) : raw);
    if(v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, v); else out[f.key]=v;
  });
  return out;
}
// Field list for the Bulk Import template (React side): only sheet columns, with resolved options.
function employeeSheetFields(){
  return employeeFields().filter(f=>f.sheet!==false).map(f=>({
    key:f.key, label:f.label, input:f.input, auto:!!f.auto, required:!!f.required, width:f.width||14,
    options: f.input==='select'
      ? employeeFieldOptions(f).filter(o=>!f.sheetOptions || f.sheetOptions.includes(o.value)).map(o=>({value:o.value, label:String(o.label), aliases:o.aliases||[]}))
      : undefined
  }));
}
// Turns one validated sheet row ({key: stored value}) into record fields, exactly like the form
// would for a new employee (auto fields start at 0 / are generated by the caller).
function employeeRecordFromSheet(values){
  const out={};
  employeeFields().forEach(f=>{
    if(f.key==='code') return;
    let raw = f.auto ? (f.input==='number' ? 0 : '') : values[f.key];
    if(raw===undefined || raw===null) raw = f.input==='number' ? 0 : '';
    if(f.input==='number'){ out[f.key]=+raw||0; return; }
    if(f.input==='select'){
      // values hold the option value already (e.g. 'yes'); fall back to the form default.
      const options=employeeFieldOptions(f);
      const val = options.some(o=>String(o.value)===String(raw)) ? raw : employeeFieldFormValue(f,{});
      const v = f.readValue ? f.readValue(val) : val;
      if(v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, v); else out[f.key]=v;
      return;
    }
    out[f.key] = f.readValue ? f.readValue(String(raw)) : String(raw);
  });
  return out;
}
