/* ================= PAYROLL PROCESS (moved here from Admin) ================= */
function renderPayrollProcess(){
  const canEdit = hasPerm('payroll','edit');
  const s=getSettings();
  const nowd=computeWorkingDays(payMonth);
  const totalDays=daysInMonth(payMonth);
  const sundays=sundaysInMonth(payMonth);
  const holidayCount=holidaysInMonth(payMonth);
  const monthHolidays=(db.holidays||[]).filter(h=>h.date.startsWith(payMonth)).sort((a,b)=>a.date.localeCompare(b.date));
  return `
  <div class="panel"><h3>Working Days (NOWD) — Auto-Calculated</h3>
    <p style="font-size:12px;color:var(--muted);">Number Of Working Days is calculated automatically every month as <b>Total Days − Sundays − NOPH = Working Days</b>. It is no longer entered manually.</p>
    <div class="toolbar">
      <input type="month" value="${payMonth}" onchange="payMonth=this.value;render('payrollprocess')">
    </div>
    <div class="grid">
      <div class="stat" style="--stat-color:#2563eb;"><div class="n">${totalDays}</div><div class="l">Total Days — ${monthLabel(payMonth)}</div></div>
      <div class="stat" style="--stat-color:#dc2626;"><div class="n">${sundays}</div><div class="l">Sundays</div></div>
      <div class="stat" style="--stat-color:#b45309;"><div class="n">${holidayCount}</div><div class="l">NOPH</div></div>
      <div class="stat" style="--stat-color:#0f6b5c;"><div class="n">${nowd}</div><div class="l">NOWD (Working Days)</div></div>
    </div>
  </div>
  <div class="panel"><h3>Holiday Calendar</h3>
    <p style="font-size:12px;color:var(--muted);">Select a date here to mark it as <b>NOPH</b>. It's deducted from NOWD the same way Sundays are, and it automatically appears — locked — as NOPH for every employee in Attendance (Quick Mark, Monthly Calendar and Month Grid). NOWD recalculates instantly whenever you add or remove a date. A date that falls on a Sunday is not double-deducted.</p>
    ${canEdit ? `
    <div class="toolbar">
      <input type="date" id="f_newHoliday" value="${payMonth}-01">
      <button class="btn" onclick="addHolidayDate(document.getElementById('f_newHoliday').value)">+ Add NOPH Date</button>
    </div>` : ''}
    ${monthHolidays.length ? `
    <table>
      <thead><tr><th>Date</th><th>Day</th><th>Type</th>${canEdit?'<th></th>':''}</tr></thead>
      <tbody>
        ${monthHolidays.map(h=>{
          const dt=h.date;
          const day=Number(dt.slice(8,10));
          const dName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(dt+'T00:00:00').getDay()];
          return `<tr><td>${dt}</td><td>${dName}${isSunday(payMonth,day)?' (also a Sunday — not double-counted)':''}</td><td><span class="tag ${h.type}">${STATUS_LABEL[h.type]||h.type}</span></td>${canEdit?`<td><button class="btn danger" onclick="removeHolidayDate('${dt}')">Remove</button></td>`:''}</tr>`;
        }).join('')}
      </tbody>
    </table>` : `<p style="font-size:12px;color:var(--muted);">No holidays added for ${monthLabel(payMonth)} yet.</p>`}
  </div>
  ${canEdit ? `
  <div class="panel"><h3>Payroll Constants</h3>
    <p style="font-size:12px;color:var(--muted);">These apply to every payroll run. NOWD is auto-calculated above, NOPH comes from the Holiday Calendar, and NOPL is taken directly from what's marked in Attendance — none of them need a manual count here.</p>
    <div class="formGrid">
      <div><label>PF Rate — Employee (e.g. 0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfRate" value="${s.pfRate}"></div>
      <div><label>PF Rate — Employer (e.g. 0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfEmployerRate" value="${s.pfEmployerRate}"></div>
      <div><label>ESI Rate — Employee (e.g. 0.0075 = 0.75%)</label><input type="number" step="0.0001" id="s_esiRate" value="${s.esiRate}"></div>
      <div><label>ESI Rate — Employer (e.g. 0.0325 = 3.25%)</label><input type="number" step="0.0001" id="s_esiEmployerRate" value="${s.esiEmployerRate}"></div>
      <div><label>Canteen — Lunch Rate (per token ₹)</label><input type="number" step="0.01" id="s_canteenLunchRate" value="${s.canteenLunchRate}"></div>
      <div><label>Canteen — Dinner Rate (per token ₹)</label><input type="number" step="0.01" id="s_canteenDinnerRate" value="${s.canteenDinnerRate}"></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:10px;">Lunch and Dinner token counts are entered per employee, per month, on the <b>Attendance</b> screen, and are automatically deducted from salary at the rates above.</p>
    <div class="modalActions"><button class="btn" onclick="savePayrollConstants()">Save</button></div>
  </div>` : ''}
  <p class="syncNote">All payroll processing — generating payroll, viewing salary slips and printing — is done from the <b>Payroll</b> screen. This Payroll Process screen only holds the working-day rule and the payroll constants used by that processing.</p>`;
}

