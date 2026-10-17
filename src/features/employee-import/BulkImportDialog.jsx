import { useEffect, useRef, useState } from 'react';
import { callLegacy } from '../../legacyBridge.js';
import { buildColumns, rowsFromGrid, validateRows } from './employeeColumns.js';
import { buildTemplate, readEmployeeRows } from './excel.js';

const TEMPLATE_FILE_NAME = 'VIPL-Employee-Import-Template.xlsx';

const showDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
// What the person typed (so a row with a wrong department shows that value, not the default).
const typed = (v) => (v === undefined || v === null ? '' : v instanceof Date ? '' : String(v));
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// "Bulk Import" dialog for NEW employees only: download the Excel template (same columns as the
// Add Employee form), upload a filled copy, review every row, then add the ready rows.
// Existing employees are never changed from here — only through the Edit form.
// Opened through the 'vipl:open-bulk-import' event (openBulkImport() in 08-employees.js).
export default function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('start'); // 'start' | 'review' | 'done'
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState(null); // {name}
  const [results, setResults] = useState([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [imported, setImported] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    const onOpen = () => {
      setStep('start'); setBusy(''); setError(''); setSource(null);
      setResults([]); setShowErrorsOnly(false); setImported(null);
      setOpen(true);
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

  const downloadTemplate = () => run('Preparing template…', async () => {
    const ctx = callLegacy('employeeImportContext');
    const blob = await buildTemplate(buildColumns(ctx.fields), ctx);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = TEMPLATE_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Checks the uploaded rows and opens the review step.
  const review = (parsed, src) => {
    if (parsed.missingHeaders.length) {
      throw new Error('These columns do not match the Add Employee form: ' + parsed.missingHeaders.join(', ') +
        '. A column was deleted or renamed, or the form changed after this template was downloaded — download a new template.');
    }
    const todo = parsed.rows;
    if (!todo.length) throw new Error('No employee rows found. Fill the "Employees" sheet from row 2 and upload again.');
    const ctx = callLegacy('employeeImportContext');
    setResults(validateRows(todo, buildColumns(ctx.fields), ctx.employees));
    setSource(src);
    setShowErrorsOnly(false);
    setStep('review');
  };

  const onFileChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setError('Please upload an Excel .xlsx file.'); return; }
    run('Reading ' + file.name + '…', async () => {
      review(await readEmployeeRows(await file.arrayBuffer(), buildColumns(callLegacy('employeeImportContext').fields)), { name: file.name });
    });
  };

  const ready = results.filter((r) => !r.errors.length);
  const withErrors = results.length - ready.length;

  const doImport = () => run('Adding ' + ready.length + ' employees…', async () => {
    if (!ready.length) return;
    const res = await callLegacy('importEmployees', ready.map((r) => r.employee));
    if (!res) return;
    setImported(res);
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
          <ol className="bulkImportSteps">
            <li>
              <div><b>Download the template</b><small>An Excel sheet with every field of the Add Employee form as columns. The header row is locked.</small></div>
              <button type="button" className="btn secondary" onClick={downloadTemplate} disabled={!!busy}>⬇️ Download Template</button>
            </li>
            <li>
              <div><b>Fill one new employee per row</b><small>Only Full Name is required. Use the dropdowns for Status, Gender, Department, Employment Type, Unit, Payment Mode, PF and ESI. Dates as DD-MM-YYYY. Leave the grey columns empty.</small></div>
            </li>
            <li>
              <div><b>Upload the filled file</b><small>Every row is checked and shown before anything is added.</small></div>
              {fileButton('⬆️ Upload Excel', 'btn')}
            </li>
          </ol>
        )}

        {step === 'review' && (
          <>
            <div className="bulkImportSummary">
              <span className="bulkChip">📄 {source && source.name}</span>
              <span className="bulkChip">{results.length} new row{results.length === 1 ? '' : 's'}</span>
              <span className="bulkChip ok">✓ {ready.length} ready</span>
              {withErrors > 0 && <span className="bulkChip bad">⚠ {withErrors} need fixing</span>}
              {withErrors > 0 && (
                <label className="bulkImportFilter">
                  <input type="checkbox" checked={showErrorsOnly} onChange={(e) => setShowErrorsOnly(e.target.checked)} /> Show only rows with problems
                </label>
              )}
            </div>
            {withErrors > 0 && (
              <p className="bulkImportNote">Rows with problems are skipped. Fix them in Excel and upload again, or import the ready rows now.</p>
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
              {fileButton('Upload another file', 'btn secondary')}
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
