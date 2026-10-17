// Columns of the bulk-import Excel template. They are NOT defined here: they are built from the
// employee field list in public/legacy/07b-employee-fields.js (employeeFields), the same list that
// draws the Add Employee form. Changing a field there changes the form and the template together.
// The legacy side passes the sheet fields in ctx.fields (employeeImportContext()).
//
// Column shape: { key, header, type: 'text'|'date'|'number'|'list', options (labels), toValue,
//                 accepts, auto, required, serial, width }

const SERIAL = { key: 'serial', header: 'S.No', type: 'number', width: 7, serial: true };

export function buildColumns(fields) {
  return [SERIAL, ...(fields || []).map((f) => {
    const col = { key: f.key, header: f.label, auto: !!f.auto, required: !!f.required, width: f.width || 14 };
    if (f.input === 'select') {
      const opts = f.options || [];
      col.type = 'list';
      col.options = opts.map((o) => o.label);
      // The sheet shows labels (e.g. "Exempted", unit names); the record stores values ('no', 'Unit-2').
      col.accepts = [...new Set([...opts.map((o) => o.label), ...opts.map((o) => String(o.value)), ...opts.flatMap((o) => o.aliases || [])])];
      col.toValue = (v) => {
        const hit = opts.find((o) => String(o.label).toLowerCase() === String(v).toLowerCase())
          || opts.find((o) => String(o.value).toLowerCase() === String(v).toLowerCase())
          || opts.find((o) => (o.aliases || []).some((a) => String(a).toLowerCase() === String(v).toLowerCase()));
        return hit ? hit.value : v;
      };
      col.default = opts.length ? opts[0].label : '';
    } else {
      col.type = f.input === 'date' ? 'date' : f.input === 'number' ? 'number' : 'text';
    }
    return col;
  })];
}

export const optionsOf = (col) => col.options || [];

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

// Turns one sheet row ({columnKey: rawCellValue}) into record values, collecting every problem.
export function validateRow(raw, columns) {
  const errors = [];
  const out = {};
  for (const col of columns) {
    if (col.serial || col.auto) continue;
    let v = raw[col.key];
    if (typeof v === 'string') v = v.trim();
    const blank = v === undefined || v === null || v === '';
    const label = col.header.replace(' *', '');

    if (col.type === 'text') {
      if (blank) {
        if (col.required) errors.push(`${label} is required`);
        out[col.key] = '';
      } else out[col.key] = String(v);
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
      let chosen = blank ? col.default : String(v);
      if (!blank && !col.accepts.some((o) => String(o).toLowerCase() === chosen.toLowerCase())) {
        errors.push(`${label} "${chosen}" is not one of: ${optionsOf(col).join(', ')}`);
        chosen = col.default;
      }
      out[col.key] = col.toValue(chosen);
    }
  }
  return { employee: out, errors };
}

// Validates all rows and flags duplicates (same Aadhaar / PAN / account number) against existing
// employees and against earlier rows in the same file.
export function validateRows(rows, columns, existingEmployees = []) {
  const seen = { aadhaar: new Map(), pan: new Map(), accNo: new Map() };
  const labels = { aadhaar: 'Aadhaar Number', pan: 'PAN Number', accNo: 'Account Number' };
  const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  for (const e of existingEmployees) {
    for (const k of Object.keys(seen)) if (norm(e[k])) seen[k].set(norm(e[k]), `existing employee ${e.code} (${e.name})`);
  }
  return rows.map((r) => {
    const { employee, errors } = validateRow(r.values, columns);
    for (const k of Object.keys(seen)) {
      const key = norm(employee[k]);
      if (!key) continue;
      if (seen[k].has(key)) errors.push(`${labels[k]} already used by ${seen[k].get(key)}`);
      else seen[k].set(key, `row ${r.rowNumber}`);
    }
    return { rowNumber: r.rowNumber, serial: r.values.serial, raw: r.values, employee, errors };
  });
}

// Turns a grid of cells (row 0 = headers, as read from Excel) into
// { rows: [{rowNumber, values}], missingHeaders, columnIndex }. Columns are matched by header
// text, so a moved column still works; a deleted (non-auto) column is reported as missing —
// as is any column of a sheet made before the form changed, so form and sheet always match.
export function rowsFromGrid(grid, columns) {
  const norm = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headerIndex = {};
  (grid[0] || []).forEach((h, i) => {
    const k = norm(h);
    if (k && !(k in headerIndex)) headerIndex[k] = i;
  });
  const columnIndex = {};
  const missingHeaders = [];
  for (const col of columns) {
    const i = headerIndex[norm(col.header)];
    if (i !== undefined) columnIndex[col.key] = i;
    else if (!col.serial && !col.auto) missingHeaders.push(col.header);
  }
  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r] || [];
    const values = {};
    let hasData = false;
    for (const col of columns) {
      const i = columnIndex[col.key];
      if (i === undefined) continue;
      const v = cells[i] ?? '';
      values[col.key] = v;
      if (!col.serial && !col.auto && v !== '' && v !== null) hasData = true;
    }
    if (hasData) rows.push({ rowNumber: r + 1, values });
  }
  return { rows, missingHeaders, columnIndex };
}
