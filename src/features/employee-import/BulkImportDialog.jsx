import { useEffect, useRef, useState } from 'react';
import { callLegacy } from '../../legacyBridge.js';
import { buildColumns, rowsFromGrid, validateRows } from './employeeColumns.js';
import { readEmployeeRows } from './excel.js';
import {
  createImportSheet,
  googleSheetsConfigured,
  loadGoogleSignIn,
  readImportSheet,
  writeEmployeeCodes,
} from './googleSheets.js';

const showDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
// What the person typed (so a row with a wrong department shows that value, not the default).
const typed = (v) => (v === undefined || v === null ? '' : v instanceof Date ? '' : String(v));
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// The current import sheet is remembered per user in this browser (it also stays in their Drive).
const sheetKey = (username) => 'vipl_import_sheet_' + (username || '');
function loadSheet(username) {
  try { return JSON.parse(localStorage.getItem(sheetKey(username)) || 'null'); } catch { return null; }
}
function storeSheet(username, sheet) {
  try { localStorage.setItem(sheetKey(username), JSON.stringify(sheet)); } catch { /* storage unavailable */ }
}

// "Bulk Import" dialog for NEW employees only:
//   Fill in Google Sheets -> creates a new empty sheet (same columns as the Add Employee form)
//   Sync now              -> reads it, shows every row checked, imports the ready rows and writes
//                            their Employee Code back so they are never imported twice.
// Existing employees are never changed from here — only through the Edit form.
// An offline-filled .xlsx can also be uploaded. Opened through the 'vipl:open-bulk-import'
// event (openBulkImport() in public/legacy/08-employees.js).
export default function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('start'); // 'start' | 'review' | 'done'
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(null);
  const [source, setSource] = useState(null); // {type:'sheet'|'file', name, codeColumn}
  const [results, setResults] = useState([]);
  const [alreadyImported, setAlreadyImported] = useState([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [imported, setImported] = useState(null);
  const fileInput = useRef(null);
  const sheetsOn = googleSheetsConfigured();

  useEffect(() => {
    const onOpen = () => {
      const ctx = callLegacy('employeeImportContext') || {};
      setSheet(loadSheet(ctx.username));
      setStep('start'); setBusy(''); setError(''); setSource(null);
      setResults([]); setAlreadyImported([]); setShowErrorsOnly(false); setImported(null);
      setOpen(true);
      if (googleSheetsConfigured()) loadGoogleSignIn().catch(() => {});
    };
    window.addEventListener('vipl:open-bulk-import', onOpen);
    return () => window.removeEventListener('vipl:open-bulk-import', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!open) return null;

  const close = () => { if (!busy) setOpen(false); };

  const run = async (label, fn) => {
    setError(''); setBusy(label);
    try { await fn(); } catch (e) { setError(e && e.message ? e.message : String(e)); } finally { setBusy(''); }
  };

  const fillInSheets = () => run('Creating a new Google Sheet…', async () => {
    const ctx = callLegacy('employeeImportContext');
    const created = await createImportSheet(buildColumns(ctx.fields));
    storeSheet(ctx.username, created);
    setSheet(created);
  });

  // Checks the rows (from the sheet or a file) and opens the review step.
  const review = (parsed, src) => {
    if (parsed.missingHeaders.length) {
      throw new Error('These columns do not match the Add Employee form: ' + parsed.missingHeaders.join(', ') +
        '. A column was deleted or renamed, or the form changed after this sheet was made — click "New empty sheet" for a sheet that matches the form.');
    }
    const done = parsed.rows.filter((r) => !blank(r.values.code));
    const todo = parsed.rows.filter((r) => blank(r.values.code));
    if (!todo.length) {
      throw new Error(done.length
        ? `All ${done.length} row(s) in this sheet were already imported. Click "Fill in Google Sheets" for a new sheet.`
        : 'No employee rows found. Fill the sheet from row 2, then click Sync now.');
    }
    const ctx = callLegacy('employeeImportContext');
    setResults(validateRows(todo, buildColumns(ctx.fields), ctx.employees));
    setAlreadyImported(done);
    setSource(src);
    setShowErrorsOnly(false);
    setStep('review');
  };

  const syncNow = () => run('Reading the Google Sheet…', async () => {
    if (!sheet) throw new Error('Click "Fill in Google Sheets" first.');
    const grid = await readImportSheet(sheet.id);
    const parsed = rowsFromGrid(grid, buildColumns(callLegacy('employeeImportContext').fields));
    review(parsed, { type: 'sheet', name: sheet.title, codeColumn: parsed.columnIndex.code });
  });

  const onFileChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setError('Please upload an Excel .xlsx file.'); return; }
    run('Reading ' + file.name + '…', async () => {
      review(await readEmployeeRows(await file.arrayBuffer(), buildColumns(callLegacy('employeeImportContext').fields)), { type: 'file', name: file.name });
    });
  };

  const ready = results.filter((r) => !r.errors.length);
  const withErrors = results.length - ready.length;

  const doImport = () => run('Adding ' + ready.length + ' employees…', async () => {
    if (!ready.length) return;
    const res = await callLegacy('importEmployees', ready.map((r) => r.employee));
    if (!res) return;
    let codesWritten = false;
    let writeError = '';
    if (source && source.type === 'sheet' && source.codeColumn !== undefined) {
      try {
        await writeEmployeeCodes(sheet.id, source.codeColumn, ready.map((r, i) => ({ rowNumber: r.rowNumber, code: res.codes[i] })));
        codesWritten = true;
      } catch (e) {
        writeError = e.message;
      }
    }
    setImported({ ...res, codesWritten, writeError });
    setStep('done');
  });

  const visible = showErrorsOnly ? results.filter((r) => r.errors.length) : results;
  const fileButton = (label, cls) => (
    <>
      <button type="button" className={cls} onClick={() => fileInput.current && fileInput.current.click()} disabled={!!busy}>{label}</button>
      <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onFileChosen} />
    </>
  );

  return (
    <div className="overlay show" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal bulkImportModal" role="dialog" aria-modal="true" aria-labelledby="bulkImportTitle">
        <div className="bulkImportHead">
          <h3 id="bulkImportTitle">📥 Bulk Import New Employees</h3>
          <button type="button" className="bulkImportClose" onClick={close} aria-label="Close" disabled={!!busy}>×</button>
        </div>

        {step === 'start' && (
          <>
            {!sheetsOn && (
              <p className="bulkImportNotice">
                Google Sheets is not connected yet — the site needs a Google Client ID
                (<code>VITE_GOOGLE_CLIENT_ID</code> in Vercel, see README). Until then you can upload a filled Excel file below.
              </p>
            )}
            <ol className="bulkImportSteps">
              <li>
                <div>
                  <b>Fill in Google Sheets</b>
                  <small>Creates a new, empty sheet in your Google Drive with every field of the Add Employee form — dropdowns and a calendar for dates included.</small>
                  {sheet && (
                    <span className="bulkSheetCard">
                      📄 {sheet.title}
                      <a href={sheet.url} target="_blank" rel="noopener noreferrer">Open sheet ↗</a>
                    </span>
                  )}
                </div>
                <button type="button" className={sheet ? 'btn secondary' : 'btn'} onClick={fillInSheets} disabled={!!busy || !sheetsOn}>
                  📝 {sheet ? 'New empty sheet' : 'Fill in Google Sheets'}
                </button>
              </li>
              <li>
                <div><b>Enter the new employees</b><small>One per row, or paste rows from Excel. Only Full Name is required. Leave the grey columns empty. Rows can be added, edited or deleted — do not change the header row.</small></div>
              </li>
              <li>
                <div><b>Sync now</b><small>Every row is checked and shown before anything is added. Imported rows get their Employee Code in the sheet and are never imported twice.</small></div>
                <button type="button" className="btn" onClick={syncNow} disabled={!!busy || !sheet || !sheetsOn}>🔄 Sync now</button>
              </li>
            </ol>
            <p className="bulkImportAlt">Filled the details offline? {fileButton('Upload an Excel file (.xlsx)', 'linkBtn')}</p>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="bulkImportSummary">
              <span className="bulkChip">{source && source.type === 'sheet' ? '📄' : '📁'} {source && source.name}</span>
              <span className="bulkChip">{results.length} new row{results.length === 1 ? '' : 's'}</span>
              <span className="bulkChip ok">✓ {ready.length} ready</span>
              {withErrors > 0 && <span className="bulkChip bad">⚠ {withErrors} need fixing</span>}
              {alreadyImported.length > 0 && <span className="bulkChip">↩ {alreadyImported.length} already imported (skipped)</span>}
              {withErrors > 0 && (
                <label className="bulkImportFilter">
                  <input type="checkbox" checked={showErrorsOnly} onChange={(e) => setShowErrorsOnly(e.target.checked)} /> Show only rows with problems
                </label>
              )}
            </div>
            {withErrors > 0 && (
              <p className="bulkImportNote">Rows with problems are skipped. Fix them {source && source.type === 'sheet' ? 'in the sheet and click Sync now again' : 'and upload again'}, or import the ready rows now.</p>
            )}
            <div className="bulkImportTableWrap">
              <table className="bulkImportTable">
                <thead>
                  <tr><th>Row</th><th>S.No</th><th>Name</th><th>Department</th><th>Joining</th><th>Basic</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.rowNumber} className={r.errors.length ? 'bad' : ''}>
                      <td>{r.rowNumber}</td>
                      <td>{blank(r.serial) ? '' : String(r.serial)}</td>
                      <td>{r.employee.name || <i>(no name)</i>}</td>
                      <td>{typed(r.raw.department) || r.employee.department}</td>
                      <td>{showDate(r.employee.joining)}</td>
                      <td>{r.employee.basic ? r.employee.basic.toLocaleString('en-IN') : ''}</td>
                      <td>{r.errors.length ? <ul>{r.errors.map((m) => <li key={m}>{m}</li>)}</ul> : <span className="bulkOk">✓ Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modalActions">
              <button type="button" className="btn secondary" onClick={() => { setStep('start'); setError(''); }} disabled={!!busy}>← Back</button>
              {source && source.type === 'sheet'
                ? <button type="button" className="btn secondary" onClick={syncNow} disabled={!!busy}>🔄 Sync again</button>
                : fileButton('Upload another file', 'btn secondary')}
              <button type="button" className="btn" onClick={doImport} disabled={!!busy || !ready.length}>
                Import {ready.length} employee{ready.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && imported && (
          <>
            <div className="bulkImportDone">
              <div className="bulkImportDoneIcon">✅</div>
              <p><b>{imported.codes.length} employee{imported.codes.length === 1 ? '' : 's'} added</b>
                {imported.codes.length > 0 && <> — codes {imported.codes[0]}{imported.codes.length > 1 ? ' to ' + imported.codes[imported.codes.length - 1] : ''}</>}.</p>
              {!imported.saved && <p className="bulkImportError">They could not be saved to the database — see the message shown, and do not log out until it is fixed.</p>}
              {imported.codesWritten && <p><small>The Employee Codes were written into the sheet, so these rows will not be imported again.</small></p>}
              {imported.writeError && <p className="bulkImportError">Could not write the codes into the sheet ({imported.writeError}). Do not click Sync now again for this sheet — start a new sheet for the next employees.</p>}
              <small>From now on, change these employees only from the Employees page (✏️ Edit).</small>
            </div>
            <div className="modalActions">
              <button type="button" className="btn" onClick={close}>Done</button>
            </div>
          </>
        )}

        {busy && <p className="bulkImportBusy">{busy}</p>}
        {error && <p className="bulkImportError">{error}</p>}
      </div>
    </div>
  );
}
