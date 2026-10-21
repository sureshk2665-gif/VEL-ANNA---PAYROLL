/* ================= PAYROLL PROCESS (moved here from Admin) ================= */
function renderPayrollProcess(){
  const canEdit = hasPerm('payrollprocess','edit');
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
      <button class="btn" onclick="addHolidayDate(document.getElementById('f_newHoliday').value)">${ico('plus')} Add NOPH Date</button>
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
    <p style="font-size:12px;color:var(--muted);">These apply to every payroll run. NOWD is auto-calculated above and NOPH comes from the Holiday Calendar — neither needs a manual count here. There is no paid leave (NOPL): an absent day is Loss Of Pay.</p>
    <div class="formGrid">
      <div><label>PF Rate — Employee (e.g. 0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfRate" value="${s.pfRate}"></div>
      <div><label>PF Rate — Employer (e.g. 0.12 = 12%)</label><input type="number" step="0.0001" id="s_pfEmployerRate" value="${s.pfEmployerRate}"></div>
      <div><label>ESI Rate — Employee (e.g. 0.0075 = 0.75%)</label><input type="number" step="0.0001" id="s_esiRate" value="${s.esiRate}"></div>
      <div><label>ESI Rate — Employer (e.g. 0.0325 = 3.25%)</label><input type="number" step="0.0001" id="s_esiEmployerRate" value="${s.esiEmployerRate}"></div>
      <div><label>Canteen Token Price (₹ per token)</label><input type="number" step="0.01" min="0" id="s_canteenTokenPrice" value="${s.canteenTokenPrice}"></div>
      <div><label>Late Grace (minutes per month)</label><input type="number" step="1" min="0" id="s_lateGraceMinutes" value="${lateGraceMinutes()}"></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:10px;">Each employee's usual number of canteen tokens per month is set in their Employee form; it can be changed for a single month on the <b>Attendance</b> screen. Tokens × this price is deducted from salary. A new price applies to payroll generated from now on.</p>
    <p style="font-size:12px;color:var(--muted);margin-top:6px;"><b>Wages &amp; OT (daily wage):</b> Basic = 60% and HRA = 40% of each employee's Daily Wage, paid for Present + Half Day × 0.5 + Holidays (no paid leave). OT rate per hour = Daily Wage ÷ 8 × 1.5, worked out here during payroll — OT hours are the month's total from <b>Employee Time Entry</b> (a different figure can be typed for a month on the <b>Attendance</b> screen). GROSS = Basic + OT; Total Earnings = GROSS + HRA.</p>
    <p style="font-size:12px;color:var(--muted);margin-top:6px;"><b>Late Deduction:</b> one minute's salary = Daily Wage (Basic + HRA per day) ÷ 8 ÷ 60. Each employee's Late minutes for the month are added up from <b>Employee Time Entry</b> (a different figure can be typed for a month on the <b>Attendance</b> screen). The first ${lateGraceMinutes()} minutes (${teFmtHM(lateGraceMinutes())} hrs) in the month are free; every minute beyond is deducted.</p>
    <div class="modalActions"><button class="btn" onclick="savePayrollConstants()">Save</button></div>
  </div>` : ''}
  <p class="syncNote">All payroll processing — generating payroll, viewing salary slips and printing — is done from the <b>Payroll</b> screen. This Payroll Process screen only holds the working-day rule and the payroll constants used by that processing.</p>`;
}

