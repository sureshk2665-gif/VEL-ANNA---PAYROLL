// Reads an uploaded .xlsx file for the employee bulk import (for people who fill the sheet
// offline). ExcelJS is large, so it is loaded only when a file is actually uploaded.
import { rowsFromGrid } from './employeeColumns.js';

const SHEET_NAME = 'Employees';
const loadExcelJS = () => import('exceljs').then((m) => m.default || m);

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

// Returns { rows: [{rowNumber, values}], missingHeaders } — same shape as the Google Sheet sync.
export async function readEmployeeRows(arrayBuffer) {
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
  return rowsFromGrid(grid);
}
