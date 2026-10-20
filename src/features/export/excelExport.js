// Excel (.xlsx) download for the legacy screens and reports. The legacy scripts build the rows from
// the same live payroll figures as the screen and PDF, then call window.downloadExcel(spec):
//
//   downloadExcel({
//     fileName: 'Payroll-Register-Oct-2026.xlsx',
//     sheets: [{
//       name: 'Payroll',                       // sheet tab (max 31 chars)
//       title: 'MF GROUP — Payroll Register',  // optional heading rows above the table
//       subtitle: 'Oct-2026 · Unit-1',
//       columns: [{ header: 'Code', key: 'code', width: 10, type: 'text' | 'number' | 'money' }],
//       rows: [{ code: 'EMP001', ... }],
//       totals: true,                          // TOTAL row summing the number / money columns
//     }],
//   })
//
// ExcelJS is large, so it is loaded only when a download is asked for.
const loadExcelJS = () => import('exceljs').then((m) => m.default || m);

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F6B5C' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F2EE' } };
const THIN = { style: 'thin', color: { argb: 'FFD8D6CD' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const columnLetter = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const isNumeric = (c) => c.type === 'money' || c.type === 'number';
const numberFormat = (c) => (c.type === 'money' ? '#,##0.00' : c.type === 'number' ? '#,##0.##' : undefined);
const cellValue = (c, v) => {
  if (v === undefined || v === null || v === '') return isNumeric(c) ? 0 : '';
  if (isNumeric(c)) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return String(v);
};
const safeSheetName = (name, used) => {
  let base = String(name || 'Sheet').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

function addSheet(wb, sheet, used) {
  const cols = sheet.columns || [];
  const ws = wb.addWorksheet(safeSheetName(sheet.name, used));
  let r = 1;
  if (sheet.title) {
    ws.getCell(r, 1).value = sheet.title;
    ws.getCell(r, 1).font = { bold: true, size: 14 };
    r++;
  }
  if (sheet.subtitle) {
    ws.getCell(r, 1).value = sheet.subtitle;
    ws.getCell(r, 1).font = { size: 11, color: { argb: 'FF555555' } };
    r++;
  }
  if (sheet.title || sheet.subtitle) r++;
  const headRow = r;
  cols.forEach((c, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEAD_FILL;
    cell.border = BORDER;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getColumn(i + 1).width = c.width || Math.max(10, Math.min(40, String(c.header).length + 4));
  });
  ws.getRow(headRow).height = 30;
  ws.views = [{ state: 'frozen', ySplit: headRow }];

  const rows = sheet.rows || [];
  rows.forEach((row, ri) => {
    const rr = headRow + 1 + ri;
    cols.forEach((c, i) => {
      const cell = ws.getCell(rr, i + 1);
      cell.value = cellValue(c, row[c.key]);
      cell.border = BORDER;
      if (numberFormat(c)) { cell.numFmt = numberFormat(c); cell.alignment = { horizontal: 'right' }; }
    });
  });

  if (sheet.totals && rows.length) {
    const tr = headRow + rows.length + 1;
    const keys = Array.isArray(sheet.totals) ? sheet.totals : null;
    cols.forEach((c, i) => {
      const cell = ws.getCell(tr, i + 1);
      cell.font = { bold: true };
      cell.fill = TOTAL_FILL;
      cell.border = BORDER;
      if (i === 0) cell.value = 'TOTAL';
      const sum = keys ? keys.includes(c.key) : isNumeric(c) && !c.noTotal;
      if (i > 0 && sum) {
        const L = columnLetter(i + 1);
        const result = rows.reduce((s, row) => s + (Number(row[c.key]) || 0), 0);
        cell.value = { formula: `SUM(${L}${headRow + 1}:${L}${tr - 1})`, result: Math.round(result * 100) / 100 };
        if (numberFormat(c)) { cell.numFmt = numberFormat(c); cell.alignment = { horizontal: 'right' }; }
      }
    });
  }
  return ws;
}

export async function downloadExcel(spec) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.creator || 'Payroll';
  wb.created = new Date();
  const used = new Set();
  const sheets = (spec.sheets || []).length ? spec.sheets : [{ name: 'Sheet', columns: [], rows: [] }];
  sheets.forEach((s) => addSheet(wb, s, used));
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = /\.xlsx$/i.test(spec.fileName || '') ? spec.fileName : `${spec.fileName || 'export'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// For the legacy scripts (classic, non-module). Errors are shown, not swallowed.
window.downloadExcel = (spec) =>
  downloadExcel(spec).catch((err) => {
    console.error('Excel export failed', err);
    alert('Could not create the Excel file: ' + (err && err.message ? err.message : err));
  });
