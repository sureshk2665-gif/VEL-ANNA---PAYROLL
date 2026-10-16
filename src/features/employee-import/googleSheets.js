// Google Sheets for the employee bulk import: "Fill in Google Sheets" creates a new, empty sheet
// in the signed-in person's Google Drive (same columns as the Add Employee form, dropdowns,
// calendar date cells, protected header row) and "Sync now" reads it back.
//
// The columns come from the employee field list (columns = buildColumns(ctx.fields)), so the
// sheet always matches the Add Employee form.
//
// Uses Google Identity Services for sign-in and the Sheets REST API directly. The OAuth scope is
// drive.file: the site can only see spreadsheets it created itself, never other Drive files.
// The OAuth Client ID comes from the VITE_GOOGLE_CLIENT_ID environment variable (Vercel).
import { optionsOf } from './employeeColumns.js';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const googleSheetsConfigured = () => !!GOOGLE_CLIENT_ID;

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_TITLE = 'Employees';
const DATA_ROWS = 1000; // rows 2..1001 get dropdowns / formats

const columnLetter = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const rgb = (hex) => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

/* ---------------- Google sign-in (access token) ---------------- */
let gisPromise = null;
export function loadGoogleSignIn() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

let accessToken = '';
let tokenExpiresAt = 0;
export async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Sheets is not set up yet (VITE_GOOGLE_CLIENT_ID is missing).');
  await loadGoogleSignIn();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) { reject(new Error(r.error_description || r.error)); return; }
        accessToken = r.access_token;
        tokenExpiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Google sign-in was closed before finishing.' : (e?.message || 'Google sign-in failed.'))),
    });
    client.requestAccessToken();
  });
}

async function google(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (res.status === 401) { accessToken = ''; tokenExpiresAt = 0; }
  if (!res.ok) throw new Error(json?.error?.message || `Google Sheets error ${res.status}`);
  return json;
}

/* ---------------- Create a new, empty import sheet ---------------- */
export async function createImportSheet(columns) {
  const COLS = columns.length;
  const now = new Date();
  const stamp = now.toLocaleDateString('en-GB').replace(/\//g, '-') + ' ' + now.toTimeString().slice(0, 5);
  const headerCells = columns.map((col) => ({
    userEnteredValue: { stringValue: col.header },
    userEnteredFormat: {
      backgroundColor: rgb(col.auto ? '#6B7280' : '#0F6B5C'),
      textFormat: { bold: true, foregroundColor: rgb('#FFFFFF') },
      horizontalAlignment: 'CENTER',
      verticalAlignment: 'MIDDLE',
      wrapStrategy: 'WRAP',
    },
  }));
  const help = [
    ['VIPL Payroll — New Employee Bulk Import'],
    [''],
    ['1. Fill one NEW employee per row on the "Employees" tab, from row 2 (or paste rows copied from Excel).'],
    ['2. Only "Full Name" is required. Dropdown cells: click and pick. Date cells: double-click for the calendar.'],
    ['3. Leave the grey columns (Employee Code, OT Rate, Canteen Rate) empty — they are filled automatically.'],
    ['4. Do not change or delete the header row / columns. You can add, edit and delete rows.'],
    ['5. Go back to the site and click "Sync now". Imported rows get their Employee Code here and are never imported twice.'],
    ['6. After import, change employee details only from the site (Employees → ✏️ Edit).'],
  ];
  const created = await google('', {
    method: 'POST',
    body: {
      properties: { title: `VIPL Employee Import ${stamp}`, locale: 'en_IN', timeZone: 'Asia/Kolkata' },
      sheets: [
        {
          properties: { sheetId: 0, title: SHEET_TITLE, gridProperties: { rowCount: DATA_ROWS + 1, columnCount: COLS, frozenRowCount: 1 } },
          data: [{ startRow: 0, startColumn: 0, rowData: [{ values: headerCells }] }],
        },
        {
          properties: { sheetId: 1, title: 'Instructions', gridProperties: { rowCount: help.length + 2, columnCount: 1 } },
          data: [{ startRow: 0, startColumn: 0, rowData: help.map((r, i) => ({ values: [{ userEnteredValue: { stringValue: r[0] }, userEnteredFormat: i === 0 ? { textFormat: { bold: true, fontSize: 14 } } : {} }] })) }],
        },
      ],
    },
  });
  const spreadsheetId = created.spreadsheetId;

  const requests = [];
  const body = (c) => ({ sheetId: 0, startRowIndex: 1, endRowIndex: DATA_ROWS + 1, startColumnIndex: c, endColumnIndex: c + 1 });
  columns.forEach((col, c) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 },
        properties: { pixelSize: Math.round((col.width || 14) * 7.5) },
        fields: 'pixelSize',
      },
    });
    if (col.auto) {
      requests.push({ repeatCell: { range: body(c), cell: { userEnteredFormat: { backgroundColor: rgb('#E5E7EB') } }, fields: 'userEnteredFormat.backgroundColor' } });
      return;
    }
    if (col.type === 'list') {
      const options = optionsOf(col);
      if (options.length) {
        requests.push({
          setDataValidation: {
            range: body(c),
            rule: {
              condition: { type: 'ONE_OF_LIST', values: options.map((o) => ({ userEnteredValue: String(o) })) },
              strict: true,
              showCustomUi: true,
              inputMessage: 'Choose from the list',
            },
          },
        });
      }
    } else if (col.type === 'date') {
      requests.push({ repeatCell: { range: body(c), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd-mm-yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } });
      // A date rule makes Google Sheets show a calendar when the cell is double-clicked.
      requests.push({ setDataValidation: { range: body(c), rule: { condition: { type: 'DATE_IS_VALID' }, strict: true, inputMessage: 'Double-click for the calendar, or type DD-MM-YYYY' } } });
    } else if (col.type === 'text') {
      // Text format keeps every digit of mobile / Aadhaar / account numbers.
      requests.push({ repeatCell: { range: body(c), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } });
    } else if (col.type === 'number' && !col.serial) {
      requests.push({ setDataValidation: { range: body(c), rule: { condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] }, strict: true, inputMessage: 'Amount (0 or more)' } } });
    }
  });
  requests.push({ updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 44 }, fields: 'pixelSize' } });
  requests.push({ updateDimensionProperties: { range: { sheetId: 1, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 900 }, fields: 'pixelSize' } });
  // Header row: editing it (or deleting a column, which edits it) shows a warning first. Google
  // always lets the sheet's owner edit protected cells, so a warning is the strongest option;
  // Sync also refuses to import if a column is missing.
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
        description: 'Header row — do not change or delete columns',
        warningOnly: true,
      },
    },
  });
  await google(`/${spreadsheetId}:batchUpdate`, { method: 'POST', body: { requests } });

  return {
    id: spreadsheetId,
    url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    title: created.properties?.title || 'VIPL Employee Import',
    createdAt: now.toISOString(),
  };
}

/* ---------------- Read the sheet / write codes back ---------------- */
// Returns the sheet as a grid (row 0 = headers). Dates come back as serial numbers.
export async function readImportSheet(spreadsheetId) {
  const range = encodeURIComponent(`${SHEET_TITLE}!A1:${columnLetter(120)}${DATA_ROWS + 1}`);
  const res = await google(`/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  return res.values || [];
}

// Writes the new employee codes into the Employee Code column of the imported rows.
export async function writeEmployeeCodes(spreadsheetId, codeColumnIndex, entries) {
  if (!entries.length) return;
  const letter = columnLetter(codeColumnIndex + 1);
  await google(`/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: {
      valueInputOption: 'RAW',
      data: entries.map((e) => ({ range: `${SHEET_TITLE}!${letter}${e.rowNumber}`, values: [[e.code]] })),
    },
  });
}
