/* ================= SUPABASE CONFIG =================
   Fill these in with your project's values (Supabase Dashboard -> Project Settings -> API).
   The anon/public key is safe to expose in client-side code as long as Row Level Security
   (RLS) policies on the `erp_data` table are configured correctly. */
const SUPABASE_URL = 'https://jvzmwqlezubiwbsougnc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_frk8eNXcYraeqFTfu0iLeA_LsRTaoPn';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    admin:{username:'admin',password:'admin123'},
    users:[
      {username:'admin',password:'admin123',name:'Administrator',role:'Admin'},
      {username:'swadmin',password:'SoftAdmin@123',name:'Software Administrator',role:'Software Admin'},
      {username:'hr.manager',password:'hr@1234',name:'HR Manager',role:'HR'},
      {username:'accounts',password:'acc@1234',name:'Accounts User',role:'Accounts'},
      {username:'viewer',password:'view@1234',name:'Viewer',role:'Viewer'}
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
                 // recorded the moment 4-digit OTP verification succeeds), logoutTime (ISO string,
                 // recorded on Logout — '' while the session is still open), sessionDuration
                 // (formatted "Xh Ym", computed and stored once at logout, '' while still open)}
  };
}
async function loadDB(){
  try{
    const {data, error} = await sb.from('erp_data').select('data').eq('id', DB_KEY).maybeSingle();
    if(error){ console.error('Supabase load error:', error); alert('Could not load data from Supabase. Check your SUPABASE_URL / SUPABASE_ANON_KEY and RLS policies. Falling back to a blank database for this session.'); return defaultDB(); }
    if(data && data.data) return data.data;
  }catch(e){
    console.error('Supabase load exception:', e);
    alert('Could not reach Supabase. Check your internet connection and SUPABASE_URL. Falling back to a blank database for this session.');
    return defaultDB();
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
let db = defaultDB(); // placeholder shown only until Supabase data has loaded
let dbReady = (async()=>{
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
  if(!Array.isArray(db.users) || db.users.length===0){
    db.users=[
      {username:'admin',password:(db.admin&&db.admin.password)||'admin123',name:'Administrator',role:'Admin'},
      {username:'swadmin',password:'SoftAdmin@123',name:'Software Administrator',role:'Software Admin'},
      {username:'hr.manager',password:'hr@1234',name:'HR Manager',role:'HR'},
      {username:'accounts',password:'acc@1234',name:'Accounts User',role:'Accounts'},
      {username:'viewer',password:'view@1234',name:'Viewer',role:'Viewer'}
    ];
  }
  /* ---- SELF-HEALING LOGIN MIGRATION ----
     Runs on every load, against whatever db.users already exists in this browser's saved data
     (including older/pre-existing databases saved before Software Admin existed as a role).
     The two known default accounts ('admin' and 'swadmin') are force-reset below to guarantee
     they always work. No other username, and no other field on any other user, is ever touched. */
  if(!Array.isArray(db.users)) db.users=[];
  // HARD RESET for the two known default accounts: whatever is currently stored for the
  // usernames 'admin' and 'swadmin' — correct, corrupted, mistyped, or deactivated — is forced
  // back to the known-good password/role/active state below on every load. This guarantees these
  // two logins always work. No other username, and no other field on these two accounts (name,
  // permissions, etc.), is touched.
  (function forceResetKnownAccounts(){
    let adminUser = db.users.find(u=>u && u.username==='admin');
    if(adminUser){
      adminUser.password='admin123';
      adminUser.role='Admin';
      adminUser.active=true;
    } else {
      db.users.push({username:'admin', password:'admin123', name:'Administrator', role:'Admin', active:true});
    }
    if(db.admin) db.admin.password='admin123'; else db.admin={username:'admin',password:'admin123'};

    let swAdminUser = db.users.find(u=>u && u.username==='swadmin');
    if(swAdminUser){
      swAdminUser.password='SoftAdmin@123';
      swAdminUser.role='Software Admin';
      swAdminUser.active=true;
    } else {
      db.users.push({username:'swadmin', password:'SoftAdmin@123', name:'Software Administrator', role:'Software Admin', active:true});
    }
  })();
  // Every user must have a password and username string, and must not be left accidentally
  // deactivated in a way nobody can undo (the built-in 'admin' account can never be inactive).
  db.users.forEach(u=>{
    if(!u.username) return;
    if(typeof u.active!=='boolean') u.active=true;
    if(u.username==='admin') u.active=true;
  });
  await saveDB(db);
})();

