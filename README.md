# VIPL Payroll ERP

Payroll / HR ERP for Visalam Industries Pvt Ltd (employees, attendance, time entry, payroll,
increments, salary advance, statutory reports, user rights). Data is stored in Supabase.

The app was first built as one HTML file (kept unchanged in `original/VIPL-PAYROLL-ERP.html`
for reference). It is now split into HTML, CSS, React components and JS modules, and behaves
exactly the same.

## Run

```bash
npm install
npm run dev       # development server at http://localhost:5173
npm run build     # production build in dist/ — upload that folder to any static host
npm run preview   # serve the built dist/ locally
```

`npm run dev` does not run the `api/` server function, so adding/editing users only works on
Vercel (or locally with `npx vercel dev`). Signing in and everything else works with `npm run dev`.

## Security setup (Supabase + Vercel)

Logins are Supabase Auth accounts (passwords are hashed by Supabase and never stored in the ERP
data). The database rules only let signed-in staff accounts read or write data.

1. **Supabase → SQL Editor:** run `supabase/setup.sql` (creates the table and the rules).
2. **Supabase → Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up".
3. **First Software Admin:** Authentication → Users → Add user → Create new user with email
   `swadmin@users.vipl-payroll.app`, a strong password and **Auto Confirm User** ticked. Then run
   the `update auth.users ...` statement at the end of `supabase/setup.sql`.
4. **Vercel → Settings → Environment Variables** (Production and Preview):
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the **secret / service_role** key (Supabase → Project
     Settings → API Keys). Never put this key in the browser code or share it.
5. Redeploy. Sign in as `swadmin` and create everyone else from **User Management**.

Usernames map to `<username>@users.vipl-payroll.app` in Supabase Auth (no email is ever sent).
Each account's role is stored in its Auth `app_metadata`, which only `api/users.js` can change.

Limits to know: the whole ERP database is still one JSON row, so any signed-in staff account
can technically read and change all of it (the per-module permissions are enforced by the app's
screens, not by the database). Splitting the data into separate tables is needed to go further.

## Project structure

```
index.html                     Entry page: React root + ordered <script> tags for the modules
api/users.js                   Vercel server function: creates/updates/deletes login accounts
supabase/setup.sql             Database table + security rules (RLS) + first-admin statement
src/
  main.jsx                     Renders the React shell, loads the CSS
  App.jsx                      Login screen + app shell + modal
  components/
    LoginScreen.jsx            Username/password sign-in
    AppShell.jsx               Sidebar + topbar + #pageBody page area
    Sidebar.jsx                Logo and navigation menu
    Topbar.jsx                 Page title, colour theme picker, dark/light, logout
    ModalOverlay.jsx           Shared popup container
  config/
    navigation.js              Sidebar menu items (edit here to add/rename a menu)
    themes.js                  Colour theme list
    brand.js                   App name and logo path
  legacyBridge.js              Lets React call the module functions safely
  styles/
    index.css                  Imports all CSS in the correct order
    shell.css                  Styles of the React shell components
    legacy/01..08-*.css        Original stylesheet, split by module
public/
  assets/vipl-logo.png         Logo (also the favicon)
  legacy/01..30-*.js           ERP business logic, one file per module
original/VIPL-PAYROLL-ERP.html Original single-file version (reference only)
```

### JS modules (`public/legacy/`)

| File | Module |
|---|---|
| 01-supabase-db.js | Supabase config, load/save database, startup data migration |
| 02-permissions.js | Roles and per-module user rights |
| 03-company-logo-status.js | Company logo upload, attendance status constants |
| 04-auth-theme.js | Supabase Auth login/logout, session restore, dark mode and colour theme |
| 05-navigation.js | Sidebar click handling and `render(page)` page router |
| 06-helpers.js | Formatting, dates, salary helpers, amount in words |
| 07-dashboard.js | Dashboard |
| 08-employees.js | Employees, resigned employees, rejoin, employee form |
| 09-departments.js | Departments |
| 10-attendance.js | Attendance (day view, employee-wise monthly, holidays) |
| 11-salary-advance.js | Salary advance and recovery schedule |
| 12-payroll-calc.js | Per-employee payroll calculation |
| 13-time-entry.js, 14-time-entry-grid.js | Employee time entry (date-wise, employee-wise, leave, holidays, summary) |
| 15-payroll.js, 16-payroll-process.js | Payroll screen and payroll constants |
| 17-annual-increment.js | Annual increment and history |
| 18-salary-slip.js | Salary slips and bulk printing |
| 19-reports.js | Report list and report screens |
| 20–24 | Acquittance register, bonus, experience, ESI, PF reports |
| 25-print-reports.js | Print/PDF windows for reports |
| 26-settings.js, 27-software-admin.js | Admin and Software Admin pages |
| 28-user-rights-backup.js | User rights panel, backup/restore, auto-backup |
| 29-user-management.js, 30-modal.js | User management, modal open/close |

## How the pieces fit (read before changing things)

- The module files are classic scripts that share one global scope, exactly like the original
  single `<script>`. Their **order in `index.html` matters** — keep it when adding files.
- Pages are still built by the module code as HTML strings and written into `#pageBody` by
  `render(page)`; buttons inside pages call global functions through `onclick="..."`.
- React renders the shell **once** (login, sidebar, topbar, modal). The module code then controls
  those elements by their ids/classes, so do not rename ids like `loginUser`, `pageBody`,
  `overlay`, `themePicker`, or the `nav-item` / `data-page` attributes.
- To convert a page to React later: build it as a component, mount it into `#pageBody` from
  `render(page)` for that page, and move that page's functions out of `public/legacy/`.

Only one line of logic changed in the original split: the auto-backup start check in
`28-user-rights-backup.js`, because deferred scripts run when `document.readyState` is already
`'interactive'`. Without the change the watcher would start twice.
