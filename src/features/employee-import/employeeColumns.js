// Columns of the bulk-import Excel template, in order. They are the same fields, in the same
// order and with the same labels, as the "Add Employee" form (openEmployeeModal in
// public/legacy/08-employees.js) — keep the two in step when changing fields. S.No comes first.
// Fields the form shows but does not let you type in (Employee Code, OT Rate, Canteen Rate) are
// greyed-out `auto` columns that the import ignores. The template is for NEW employees, so the
// form's Resignation Date / Reason (shown there only when Status is Resigned) are left out and
// Status can only be Active.
//
// type:    'text' | 'date' | 'number' | 'list'
// auto:    shown for reference only — greyed out in the template and ignored on import
// aliases: older header texts still accepted on upload
// options: allowed values for 'list' columns (a function gets the import context)
// toValue: maps the chosen option to the stored value

export const STATUS_OPTIONS = ['Active']; // new employees only
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
export const EMP_TYPE_OPTIONS = ['Full-Time', 'Part-Time', 'Contract'];
export const PAY_MODE_OPTIONS = ['NEFT', 'TRANSFER', 'CASH', 'CHEQUE'];
export const PF_OPTIONS = { Yes: 'yes', Exempted: 'no', Nil: 'nil' };
export const ESI_OPTIONS = { Yes: true, Exempted: false };

const unitOptions = (ctx) => [ctx.unit1Name || 'Unit-1', ctx.unit2Name || 'Unit-2'];

export const EMPLOYEE_COLUMNS = [
  { key: 'serial', header: 'S.No', type: 'number', width: 7, serial: true },
  { key: 'code', header: 'Employee Code', type: 'text', width: 14, auto: true },
  { key: 'status', header: 'Status', type: 'list', width: 11, options: STATUS_OPTIONS, default: 'Active' },
  { key: 'name', header: 'Full Name *', type: 'text', width: 26, required: true },
  { key: 'gender', header: 'Gender', type: 'list', width: 10, options: GENDER_OPTIONS, default: 'Male' },
  { key: 'dob', header: 'Date of Birth', type: 'date', width: 14 },
  { key: 'relative', header: 'Father / Husband Name', type: 'text', width: 22 },
  { key: 'mobile', header: 'Mobile Number', type: 'text', width: 15 },
  { key: 'email', header: 'Email', type: 'text', width: 24 },
  { key: 'address', header: 'Address', type: 'text', width: 32 },
  { key: 'joining', header: 'Joining Date', type: 'date', width: 14 },
  { key: 'department', header: 'Department', type: 'list', width: 16, options: (ctx) => ctx.departments || [], default: (ctx) => (ctx.departments || [])[0] || '' },
  { key: 'designation', header: 'Designation', type: 'text', width: 18 },
  { key: 'empType', header: 'Employment Type', type: 'list', width: 15, options: EMP_TYPE_OPTIONS, default: 'Full-Time' },
  {
    key: 'unit', header: 'Working Unit', type: 'list', width: 16, options: unitOptions,
    default: 'Unit-1',
    // The dropdown shows the unit names set in Software Admin; the stored value is Unit-1 / Unit-2.
    toValue: (v, ctx) => (v === unitOptions(ctx)[1] || v === 'Unit-2' ? 'Unit-2' : 'Unit-1'),
    accepts: (ctx) => [...unitOptions(ctx), 'Unit-1', 'Unit-2'],
  },
  { key: 'bankName', header: 'Bank Name', type: 'text', width: 18 },
  { key: 'branch', header: 'Branch', type: 'text', width: 16 },
  { key: 'accNo', header: 'Account Number', type: 'text', width: 20 },
  { key: 'ifsc', header: 'IFSC', type: 'text', width: 14 },
  { key: 'pan', header: 'PAN Number', type: 'text', width: 14 },
  { key: 'aadhaar', header: 'Aadhaar Number', type: 'text', width: 16 },
  { key: 'pfNo', header: 'PF Number', type: 'text', width: 16 },
  { key: 'esiNo', header: 'ESI Number', type: 'text', width: 16 },
  { key: 'uan', header: 'UAN Number', type: 'text', width: 16 },
  { key: 'basic', header: 'Basic Salary', type: 'number', width: 13 },
  { key: 'hra', header: 'HRA', type: 'number', width: 10 },
  { key: 'da', header: 'DA', type: 'number', width: 10 },
  { key: 'special', header: 'Special Allowance', type: 'number', width: 12 },
  { key: 'medical', header: 'Medical Allowance', type: 'number', width: 12 },
  { key: 'conveyance', header: 'Conveyance', type: 'number', width: 12 },
  { key: 'washing', header: 'Washing Allowance', type: 'number', width: 12 },
  { key: 'other', header: 'Other Allowance', type: 'number', width: 12 },
  { key: 'otRate', header: 'OT Rate (auto: Basic ÷ 26 ÷ 8 hrs × 2)', type: 'number', width: 16, auto: true },
  { key: 'mode', header: 'Payment Mode', type: 'list', width: 13, options: PAY_MODE_OPTIONS, default: 'NEFT' },
  { key: 'pfDeduction', header: 'PF Deduction', type: 'list', width: 13, options: Object.keys(PF_OPTIONS), default: 'Yes', toValue: (v) => PF_OPTIONS[v] },
  { key: 'esiApplicable', header: 'ESI Deduction', type: 'list', width: 13, options: Object.keys(ESI_OPTIONS), default: 'Yes', toValue: (v) => ESI_OPTIONS[v] },
  { key: 'pt', header: 'Professional Tax / Income Tax', type: 'number', width: 14 },
  { key: 'canteenRate', header: 'Canteen Rate (per day ₹) — not used in payroll', type: 'number', width: 16, auto: true },
  { key: 'rent', header: 'Rent Deduction (monthly)', type: 'number', width: 13 },
  { key: 'otherDed', header: 'Other Deductions (fixed)', type: 'number', width: 13 },
  { key: 'clBalance', header: 'CL Balance', type: 'number', width: 10 },
  { key: 'noplBalance', header: 'NOPL Balance (Opening)', type: 'number', width: 12 },
];

export const optionsOf = (col, ctx) => (typeof col.options === 'function' ? col.options(ctx) : col.options || []);
const defaultOf = (col, ctx) => (typeof col.default === 'function' ? col.default(ctx) : col.default);

// Dates are stored as 'YYYY-MM-DD' (same as the form's date inputs). Accepts real Excel dates,
// Excel serial numbers, YYYY-MM-DD and the Indian DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY.
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const pad = (n) => String(n).padStart(2, '0');
  const fromParts = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    if (y < 1900 || y > 2100) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  if (value instanceof Date) {
    if (isNaN(value)) return null;
    // Excel dates come through as midnight UTC.
    return fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number') {
    const dt = new Date(Math.round((value - 25569) * 86400000));
    return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return fromParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return fromParts(+m[3], +m[2], +m[1]);
  return null;
}

// Turns one spreadsheet row ({columnKey: rawCellValue}) into the fields of an employee record,
// collecting every problem found. `ctx` = { departments, unit1Name, unit2Name }.
export function validateRow(raw, ctx) {
  const errors = [];
  const out = {};
  for (const col of EMPLOYEE_COLUMNS) {
    if (col.serial || col.auto) continue;
    let v = raw[col.key];
    if (typeof v === 'string') v = v.trim();
    const blank = v === undefined || v === null || v === '';
    const label = col.header.replace(' *', '');

    if (col.type === 'text') {
      if (blank) {
        if (col.required) errors.push(`${label} is required`);
        out[col.key] = '';
      } else {
        // Numbers typed into general cells (mobile, Aadhaar…) arrive as numbers.
        out[col.key] = String(v);
      }
    } else if (col.type === 'number') {
      if (blank) out[col.key] = 0;
      else {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s]/g, ''));
        if (!isFinite(n)) { errors.push(`${label} must be a number`); out[col.key] = 0; }
        else if (n < 0) { errors.push(`${label} cannot be negative`); out[col.key] = 0; }
        else out[col.key] = n;
      }
    } else if (col.type === 'date') {
      const d = parseDate(v);
      if (d === null) { errors.push(`${label} is not a valid date (use DD-MM-YYYY)`); out[col.key] = ''; }
      else out[col.key] = d;
    } else if (col.type === 'list') {
      const allowed = col.accepts ? col.accepts(ctx) : optionsOf(col, ctx);
      let chosen = blank ? defaultOf(col, ctx) : String(v);
      if (!blank) {
        const match = allowed.find((o) => String(o).toLowerCase() === chosen.toLowerCase());
        if (!match) {
          errors.push(`${label} "${chosen}" is not one of: ${optionsOf(col, ctx).join(', ')}`);
          chosen = defaultOf(col, ctx);
        } else chosen = match;
      }
      out[col.key] = col.toValue ? col.toValue(chosen, ctx) : chosen;
    }
  }
  out.resignationDate = '';
  out.resignReason = '';
  return { employee: out, errors };
}

// Validates all rows and flags duplicates (same Aadhaar / PAN / account number) against existing
// employees and against earlier rows in the same file.
export function validateRows(rows, ctx, existingEmployees = []) {
  const seen = { aadhaar: new Map(), pan: new Map(), accNo: new Map() };
  const labels = { aadhaar: 'Aadhaar Number', pan: 'PAN Number', accNo: 'Account Number' };
  const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  for (const e of existingEmployees) {
    for (const k of Object.keys(seen)) if (norm(e[k])) seen[k].set(norm(e[k]), `existing employee ${e.code} (${e.name})`);
  }
  return rows.map((r) => {
    const { employee, errors } = validateRow(r.values, ctx);
    for (const k of Object.keys(seen)) {
      const key = norm(employee[k]);
      if (!key) continue;
      if (seen[k].has(key)) errors.push(`${labels[k]} already used by ${seen[k].get(key)}`);
      else seen[k].set(key, `row ${r.rowNumber}`);
    }
    return { rowNumber: r.rowNumber, serial: r.values.serial, raw: r.values, employee, errors };
  });
}
