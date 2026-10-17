// Excel template download + upload reading for the employee bulk import. The columns come from
// the employee field list (buildColumns(ctx.fields)), so the template always matches the Add
// Employee form. ExcelJS is large, so it is loaded only when one of these functions is used.
import { optionsOf, rowsFromGrid } from './employeeColumns.js';

const SHEET_NAME = 'Employees';
const DATA_ROWS = 1000; // rows (2..1001) that get dropdowns / formats
const loadExcelJS = () => import('exceljs').then((m) => m.default || m);

const columnLetter = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Builds the empty template: header row (A1 = "S.No") locked, data rows open for typing, with
// dropdowns for the fixed-choice columns and an Instructions sheet. Columns the Add Employee form
// fills automatically (Employee Code, OT Rate, Canteen Rate) are greyed out and ignored on import —
// they are left unlocked so pasting whole rows from another sheet still works.
export async function buildTemplate(columns, ctx = {}) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VIPL Payroll';
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
      const options = optionsOf(col);
      if (!options.length) return;
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
        errorTitle: col.header,
        error: `Choose a value from the list: ${options.join(', ')}`,
      });
    } else if (col.type === 'date') {
      ws.dataValidations.add(range, {
        type: 'date',
        operator: 'between',
        allowBlank: true,
        formulae: [new Date(Date.UTC(1900, 0, 2)), new Date(Date.UTC(2100, 11, 31))],
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

  // Lock the header row: protect the sheet; every other cell is unlocked by the column style.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  });

  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 30 }, { width: 90 }];
  help.addRow(['VIPL Payroll — Employee Bulk Import']).font = { bold: true, size: 14 };
  help.addRow([]);
  [
    ['How to use', 'Fill one employee per row on the "Employees" sheet, starting from row 2. Do not change the header row (it is locked).'],
    ['S.No', 'Serial number (1, 2, 3…). Only used to point you to a row if something needs fixing.'],
    ['Required', 'Only "Full Name" is required. Empty dropdown cells use the same default as the Add Employee form.'],
    ['Dropdowns', 'Status, Gender, Department, Employment Type, Working Unit, Payment Mode, PF Deduction and ESI Deduction have a dropdown in every row — click a cell and use the ▼ arrow.'],
    ['Grey columns', 'Employee Code, OT Rate and Canteen Rate are filled automatically, exactly as in the Add Employee form. Leave them empty — anything typed there is ignored.'],
    ['New employees', 'This sheet is for adding new employees, so Status is always Active. Resignations are recorded later from the Employees page.'],
    ['Dates', 'Use DD-MM-YYYY (e.g. 25-04-2024).'],
    ['Amounts', 'Monthly amounts in ₹, numbers only.'],
    ['Department', 'Must be one of the departments already set up in the app: ' + (ctx.departments || []).join(', ')],
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

// Plain value of a cell (ExcelJS gives objects for formulas, links and rich text).
function cellValue(v) {
  if (v === null || v === undefined) return '';
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
