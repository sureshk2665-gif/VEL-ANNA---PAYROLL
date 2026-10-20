// Excel template download + upload reading for the employee bulk import. The columns come from
// the employee field list (buildColumns(ctx.fields)), so the template always matches the Add
// Employee form. ExcelJS is large, so it is loaded only when one of these functions is used.
import { optionsOf, rowsFromGrid } from './employeeColumns.js';

const SHEET_NAME = 'Employees';
const DATA_ROWS = 1000; // rows (2..1001) that get dropdowns / formats
const loadExcelJS = () => import('exceljs').then((m) => m.default || m);

// Excel (and Google Sheets / LibreOffice) turn text that ENDS in a number into a series when it is
// dragged down: "Unit-1" → Unit-2, Unit-3 … An invisible zero-width space after the number keeps
// the dropdown text looking the same ("Unit-1") but makes dragging copy it. Stripped on import.
const NO_SERIES = '\u200B';
const dragSafe = (label) => (/\d$/.test(label) ? label + NO_SERIES : label);

const columnLetter = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Builds the empty template: header row (A1 = "S.No") locked, data rows open for typing, with
// dropdowns for the fixed-choice columns and an Instructions sheet. Columns the Add Employee form
// fills automatically (Employee Code, Basic / day, HRA / day, 1-hour OT rate) are greyed out and ignored on import —
// they are left unlocked so pasting whole rows from another sheet still works.
export async function buildTemplate(columns, ctx = {}) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.companyName || 'Payroll';
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  // Hidden sheet holding the dropdown lists (department names can be long or many).
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });

  ws.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 14,
    style: {
      protection: { locked: false },
      ...(col.auto ? { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }, font: { color: { argb: 'FF6B7280' }, italic: true } } : {}),
      // Text columns are stored as text so mobile / Aadhaar / account numbers keep every digit.
      numFmt: col.type === 'text' ? '@' : col.type === 'date' ? 'dd-mm-yyyy' : col.type === 'number' && !col.serial ? '0.00' : 'General',
    },
  }));

  const header = ws.getRow(1);
  header.height = 30;
  header.eachCell((cell, colNumber) => {
    const auto = columns[colNumber - 1].auto;
    cell.protection = { locked: true };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: auto ? 'FF6B7280' : 'FF0F6B5C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0B4F44' } } };
    cell.numFmt = 'General';
  });

  let listCol = 0;
  columns.forEach((col, i) => {
    const letter = columnLetter(i + 1);
    const range = `${letter}2:${letter}${DATA_ROWS + 1}`;
    if (col.auto) return;
    if (col.type === 'list') {
      const options = optionsOf(col).map(dragSafe);
      if (!options.length) return;
      // A typed "Unit-1" (without the invisible character) is still fine — import accepts it — so
      // those columns only warn instead of blocking typed values.
      const hasDragSafe = options.some((o) => o.endsWith(NO_SERIES));
      // Write the choices straight into the dropdown ("A,B,C") — this shows an arrow in Excel,
      // Google Sheets, WPS and LibreOffice alike. Excel limits that to 255 characters, so very
      // long lists (e.g. many departments) fall back to a range on the hidden Lists sheet.
      const inline = options.join(',');
      let formula;
      if (inline.length <= 250 && !options.some((o) => /[,"]/.test(o))) {
        formula = `"${inline}"`;
      } else {
        listCol += 1;
        const lc = columnLetter(listCol);
        options.forEach((o, r) => { lists.getCell(`${lc}${r + 1}`).value = o; });
        formula = `Lists!$${lc}$1:$${lc}$${options.length}`;
      }
      ws.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showInputMessage: true,
        promptTitle: col.header,
        prompt: 'Choose from the list ▼',
        showErrorMessage: true,
        errorStyle: hasDragSafe ? 'warning' : 'stop',
        errorTitle: col.header,
        error: `Choose a value from the list: ${optionsOf(col).join(', ')}`,
      });
    } else if (col.type === 'date') {
      // DD-MM-YYYY on every cell of the column (not only the column style), so Excel, Google
      // Sheets and LibreOffice all show dates in that format.
      for (let r = 2; r <= DATA_ROWS + 1; r++) ws.getCell(`${letter}${r}`).numFmt = 'dd-mm-yyyy';
      ws.dataValidations.add(range, {
        type: 'date',
        operator: 'between',
        allowBlank: true,
        formulae: [new Date(Date.UTC(1900, 0, 2)), new Date(Date.UTC(2100, 11, 31))],
        // Shown on every cell of the column: the expected format.
        showInputMessage: true,
        promptTitle: 'Format: DD-MM-YYYY',
        prompt: 'Type the date as DD-MM-YYYY, e.g. 25-04-1995. Leave empty if not known.',
        showErrorMessage: true,
        errorTitle: col.header,
        error: 'Enter a date, e.g. 25-04-2024',
      });
    } else if (col.type === 'number' && !col.serial) {
      ws.dataValidations.add(range, {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        errorTitle: col.header,
        error: 'Enter an amount (0 or more).',
      });
    }
  });

  // Calculated columns (e.g. Basic = 60% of Daily Wage): fill every data row with the formula,
  // e.g. "ROUND({dailyWage}*60%,2)" → =IF(P2="","",ROUND(P2*60%,2)). Locked so they can't be typed
  // over; they stay blank until the referenced cell is filled, and are ignored on import.
  const letterOf = Object.fromEntries(columns.map((c, i) => [c.key, columnLetter(i + 1)]));
  columns.forEach((col, i) => {
    if (!col.formula) return;
    const refs = [...col.formula.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => letterOf[k]);
    if (!refs.length) return;
    const letter = columnLetter(i + 1);
    for (let r = 2; r <= DATA_ROWS + 1; r++) {
      const expr = col.formula.replace(/\{(\w+)\}/g, (m, k) => (letterOf[k] ? `${letterOf[k]}${r}` : m));
      const cell = ws.getCell(`${letter}${r}`);
      cell.value = { formula: `IF(${letterOf[refs[0]]}${r}="","",${expr})` };
      cell.protection = { locked: true };
    }
  });

  // Lock the header row: protect the sheet; every other cell is unlocked by the column style.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true, // fill colour / highlighting while editing
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  });

  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 30 }, { width: 90 }];
  help.addRow([(ctx.companyName || 'Payroll') + ' — Employee Bulk Import']).font = { bold: true, size: 14 };
  help.addRow([]);
  [
    ['How to use', 'Fill one employee per row on the "Employees" sheet, starting from row 2. Do not change the header row (it is locked).'],
    ['S.No', 'Serial number (1, 2, 3…). Only used to point you to a row if something needs fixing.'],
    ['Required', 'Only "Full Name" is required. Fill whatever details you have — empty cells are left empty and can be completed later in the Employee form.'],
    ['Dropdowns', 'Status, Gender, Department, Designation, Employment Type, Working Unit, Contractor and Payment Mode have a dropdown in every row — click a cell and use the ▼ arrow. Departments and Designations come from the lists in the app.'],
    ['Daily Wage', 'Enter the TOTAL daily wage (₹ per day). Basic = 60%, HRA = 40% and the 1-hour OT rate (Daily Wage ÷ 8 × 1.5) are calculated by the grey columns automatically. OT hours are not entered here — they come from Employee Time Entry each month (a figure typed on the Attendance screen overrides it) and are paid by Payroll at Daily Wage ÷ 8 × 1.5.'],
    ['Grey columns', 'Employee Code, Basic / day, HRA / day and OT Rate — 1 hour are calculated automatically, exactly as in the Add Employee form. They are locked and ignored on import.'],
    ['PF / ESI', 'Not needed here: new employees start with PF and ESI deduction = Yes, and Payroll calculates the amounts. Change it later in the Employee form if someone is exempted.'],
    ['New employees', 'This sheet is for adding new employees, so Status is always Active. Resignations are recorded later from the Employees page.'],
    ['Dates', 'Date of Birth and Joining Date: DD-MM-YYYY (e.g. 25-04-2024). Selecting a cell in those columns shows the format.'],
    ['None', 'Every dropdown except Status has a "None" choice (Contractor: "Non Contractor") that leaves the field empty — the same as leaving the cell blank.'],
    ['Highlighting', 'You can colour cells (Home → Fill Color) to mark rows while editing; colours are ignored on import.'],
    ['Copying down', 'Dragging a dropdown value (e.g. Unit-1) down copies the same value. To copy the SAME date down, hold Ctrl while dragging — otherwise Excel counts the dates up.'],
    ['Amounts', 'Numbers only. Canteen Tokens = tokens bought per month.'],
    ['Department', 'Must be one of the departments set up in the app: ' + ((ctx.departments || []).join(', ') || '(none yet)')],
    ['Designation', 'Must be one of the designations set up in the app (Admin → Designations): ' + ((ctx.designations || []).join(', ') || '(none yet)')],
    ['After import', 'Every imported employee can be edited later from the Employees page (✏️ Edit).'],
  ].forEach((r) => {
    const row = help.addRow(r);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });

  wb.views = [{ activeTab: 0 }];
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Plain value of a cell (ExcelJS gives objects for formulas, links and rich text). The invisible
// "no series" character added to dropdown values is removed here.
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.replace(/\u200B/g, '');
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('text' in v) return cellValue(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('error' in v) return '';
    return String(v);
  }
  return v;
}

// Returns { rows: [{rowNumber, values}], missingHeaders }.
export async function readEmployeeRows(arrayBuffer, columns) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.getWorksheet(SHEET_NAME) || wb.worksheets.find((s) => s.state === 'visible' && s.name !== 'Instructions' && s.name !== 'Lists');
  if (!ws) throw new Error('No "Employees" sheet found in this file.');
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => { cells[colNumber - 1] = cellValue(cell.value); });
    grid[rowNumber - 1] = cells;
  });
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  return rowsFromGrid(grid, columns);
}
