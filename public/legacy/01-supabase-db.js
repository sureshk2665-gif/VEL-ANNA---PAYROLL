/* ================= SUPABASE CONFIG =================
   Fill these in with your project's values (Supabase Dashboard -> Project Settings -> API).
   The anon/public key is safe to expose in client-side code as long as Row Level Security
   (RLS) policies on the `erp_data` table are configured correctly — see supabase/setup.sql,
   which only lets signed-in staff accounts read or write. */
const SUPABASE_URL = 'https://fhpfxpibqvreymhzhdxt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IwJC0VtOf1WXbTJj6yCc4g_RaUbAsWH';
// The Supabase Auth session is kept in sessionStorage, so (as before) a login lasts for this
// browser tab only and closing the tab signs the person out.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
});

/* ================= LOGIN ACCOUNTS (Supabase Auth) =================
   Usernames are mapped to Supabase Auth emails on this internal domain (no mail is ever sent).
   Passwords live only in Supabase Auth (hashed) — never in the erp_data JSON. Each account's
   role is stored in its Auth app_metadata, which only the server (api/users.js) can change.
   Keep USER_EMAIL_DOMAIN identical to the one in api/users.js. */
const USER_EMAIL_DOMAIN='users.vipl-payroll.app';
function usernameToEmail(username){ return String(username||'').trim().toLowerCase()+'@'+USER_EMAIL_DOMAIN; }

/* ================= DATA LAYER (Supabase) =================
   The entire application database is a single JSON object (same shape as before), now
   stored as one row in a Supabase table instead of localStorage.

   Required table (run once in the Supabase SQL editor):

     create table erp_data (
       id text primary key,
       data jsonb not null,
       updated_at timestamptz default now()
     );

   Row Level Security: enable RLS and add a policy allowing your app's role (or anon,
   if you are relying on the app's own login screen for access control) to select/insert/update.
*/
const DB_KEY='hrms_db_v1'; // used as the row id in the erp_data table
function defaultDB(){
  return {
    // User profiles (name, role, active, module permissions). NO passwords — the matching login
    // accounts are in Supabase Auth and are created/changed from User Management (api/users.js).
    users:[
      {username:'swadmin',name:'Software Administrator',role:'Software Admin'}
    ],
    departments:['Accounts','HR','Admin','Sales','Marketing','Production','Design','Stores','Purchase','Management'],
    employees:[],
    attendance:{}, // {date: {empCode: status}}
    payroll:{}, // {monthKey: {empCode: payrollRecord}}
    increments:[], // Annual Increment history — every record ever saved, across all employees
    nextEmpNum:1,
    companyName:'VISALAM INDUSTRIES PVT LTD',
    companyAddress:'No S-48, Sidco Industrial Estate, Kakkalur, Thiruvallur-602003, TAMIL NADU',
    companyGSTIN:'', companyPAN:'', companyCIN:'', companyPhone:'', companyEmail:'', companyLogo:'',
    unit1Name:'Unit-1', unit1Address:'', unit2Name:'Unit-2', unit2Address:'',
    autoBackup:{enabled:false, frequency:'daily', time:'20:00', weekday:1, dayOfMonth:1, lastRun:null, nextRun:null},
    backupHistory:[],
    holidays:[], // Holiday Calendar — array of {date:'YYYY-MM-DD', type:'NOPH'}, deducted from NOWD like Sundays
    // ---- Employee Time Entry (standalone module) ----
    // Completely separate store from `attendance` and `payroll` above. Never read by
    // computeWorkingDays(), generatePayroll(), or any payroll/salary calculation.
    timeEntries:{}, // {date: {empCode: {inH,inM,inAP,outH,outM,outAP}}}
    timeHolidays:[], // [{date:'YYYY-MM-DD', remarks:''}] — booking calendar for this module only
    timeLeaves:[], // [{date:'YYYY-MM-DD', empCode, type, remarks}] — Employee Leave log for this module only
    loginLogs:[] // Login/Logout audit trail — {id, userId (username), name, loginTime (ISO string,
                 // recorded the moment sign-in succeeds), logoutTime (ISO string,
                 // recorded on Logout — '' while the session is still open), sessionDuration
                 // (formatted "Xh Ym", computed and stored once at logout, '' while still open)}
  };
}
async function loadDB(){
  try{
    const {data, error} = await sb.from('erp_data').select('data').eq('id', DB_KEY).maybeSingle();
    if(error){ console.error('Supabase load error:', error); throw new Error('Could not load data from Supabase ('+error.message+'). Check SUPABASE_URL / SUPABASE_ANON_KEY and the RLS policies (supabase/setup.sql).'); }
    if(data && data.data) return data.data;
  }catch(e){
    console.error('Supabase load exception:', e);
    // Never fall back to a blank database here: the startup code below saves the db, which would
    // overwrite the real data in Supabase with that blank copy.
    throw e;
  }
  // No row yet for this app — seed Supabase with the default database.
  const fresh = defaultDB();
  await saveDB(fresh);
  return fresh;
}
async function saveDB(dbToSave){
  // IMPORTANT: this now returns true/false and NEVER swallows errors, so callers
  // (e.g. restoreData()) can tell the user the truth instead of showing a false
  // "success" message when the write was actually rejected by Supabase (e.g. by
  // a missing/incorrect RLS policy).
  try{
    const {error} = await sb.from('erp_data').upsert({ id: DB_KEY, data: dbToSave, updated_at: new Date().toISOString() });
    if(error){
      console.error('Supabase save error:', error);
      alert('Could NOT save to the database: '+error.message+'\n\nYour changes are only visible in this browser tab right now and will be LOST on logout/refresh until this is fixed (check Supabase RLS policies on the erp_data table).');
      return false;
    }
    return true;
  }catch(e){
    console.error('Supabase save exception:', e);
    alert('Could NOT reach the database to save your changes: '+e.message+'\n\nYour changes are only visible in this browser tab right now and will be LOST on logout/refresh.');
    return false;
  }
}
let db = defaultDB(); // placeholder shown only until Supabase data has loaded (after sign-in)
// dbReady resolves the first time the real data has been loaded — which now happens only after a
// successful sign-in, because the RLS policies refuse to return any data to signed-out visitors.
let _dbReadyResolve;
let dbReady = new Promise(resolve=>{ _dbReadyResolve=resolve; });
// Loads the database for the signed-in account and runs the one-time defaulting / migration
// steps. Throws if the data cannot be loaded (nothing is saved in that case).
async function initDB(){
  db = await loadDB();
  // ---------------------------------------------------------------------------------
  // IMPORTANT — ROOT-CAUSE FIX for "imported/saved data disappears after logout+reload":
  // ALL of the one-time defaulting / self-healing / migration logic below (previously
  // sitting as top-level, synchronous statements right after this async IIFE) MUST run
  // only once the real `db = await loadDB()` above has actually completed. It used to run
  // immediately after kicking off loadDB() — i.e. BEFORE the network round-trip to
  // Supabase finished — which meant it operated on the blank `defaultDB()` placeholder and
  // then called saveDB(db) on that blank object, silently overwriting whatever was really
  // saved in Supabase on every single page load/refresh/login. Keeping this code inside
  // the async function guarantees it only ever touches the genuinely loaded data.
  // ---------------------------------------------------------------------------------
  if(!db.companyName){ db.companyName='VISALAM INDUSTRIES PVT LTD'; }
  if(!db.companyAddress){ db.companyAddress='No S-48, Sidco Industrial Estate, Kakkalur, Thiruvallur-602003, TAMIL NADU'; }
  if(db.companyGSTIN===undefined) db.companyGSTIN='';
  if(!db.autoBackup) db.autoBackup={enabled:false, frequency:'daily', time:'20:00', weekday:1, dayOfMonth:1, lastRun:null, nextRun:null};
  if(!db.holidays) db.holidays=[];
  // Migrate legacy holiday entries (plain 'YYYY-MM-DD' strings, or the old 'Holiday' type — now
  // removed) all to {date, type:'NOPH'} objects. NOPH is the only selectable Holiday Calendar type.
  db.holidays = db.holidays.map(h => typeof h==='string' ? {date:h, type:'NOPH'} : {date:h.date, type:'NOPH'});

  if(!db.backupHistory) db.backupHistory=[];
  if(!Array.isArray(db.loginLogs)) db.loginLogs=[]; // back-fill for data saved before the LoginLog feature existed
  if(db.companyPAN===undefined) db.companyPAN='';
  if(db.companyCIN===undefined) db.companyCIN='';
  if(db.companyPhone===undefined) db.companyPhone='';
  if(db.companyEmail===undefined) db.companyEmail='';
  if(db.companyLogo===undefined) db.companyLogo='';
  if(!db.unit1Name) db.unit1Name='Unit-1';
  if(db.unit1Address===undefined) db.unit1Address='';
  if(!db.unit2Name) db.unit2Name='Unit-2';
  if(db.unit2Address===undefined) db.unit2Address='';
  if(!Array.isArray(db.increments)) db.increments=[];
  if(!db.timeEntries || typeof db.timeEntries!=='object') db.timeEntries={};
  if(!Array.isArray(db.timeHolidays)) db.timeHolidays=[];
  if(!Array.isArray(db.timeLeaves)) db.timeLeaves=[];
  if(!Array.isArray(db.users)) db.users=[];
  /* ---- PASSWORD CLEAN-UP ----
     Passwords used to be stored in plain text inside this JSON (and the 'admin' / 'swadmin'
     accounts were force-reset to fixed passwords on every load). Logins are now Supabase Auth
     accounts, so strip any stored passwords — including ones brought back by restoring an old
     backup — and never write them again. */
  delete db.admin;
  db.users.forEach(u=>{ if(u) delete u.password; });
  db.users = db.users.filter(u=>u && u.username);
  // Every profile needs an active flag; the built-in 'admin' profile (if present) can never be
  // left inactive.
  db.users.forEach(u=>{
    if(typeof u.active!=='boolean') u.active=true;
    if(u.username==='admin') u.active=true;
  });
  await saveDB(db);
  _dbReadyResolve();
}

