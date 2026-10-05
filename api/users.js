// Vercel serverless function: creates, updates and deletes Supabase Auth login accounts.
//
// This needs the Supabase service-role (secret) key, so it runs on the server only. Set these
// in Vercel -> Project -> Settings -> Environment Variables:
//   SUPABASE_URL               e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  the secret / service_role key (never put it in the browser code)
//
// The caller must send their own session token (Authorization: Bearer <access token>). Only
// accounts whose server-assigned role is Admin or Software Admin may use this, and an Admin can
// never manage, create or assign Admin / Software Admin accounts — the same rules the app's
// User Management screen shows.
import { createClient } from '@supabase/supabase-js';

// Keep identical to USER_EMAIL_DOMAIN in public/legacy/01-supabase-db.js.
const USER_EMAIL_DOMAIN = 'users.vipl-payroll.app';
const ROLES = ['Admin', 'Software Admin', 'HR', 'Accounts', 'Viewer'];
const PRIVILEGED = ['Admin', 'Software Admin'];
const USERNAME_PATTERN = /^[a-z0-9._-]{2,40}$/;
const MIN_PASSWORD_LENGTH = 6;
const BANNED_FOREVER = '876000h'; // ~100 years

const usernameToEmail = (username) => `${username}@${USER_EMAIL_DOMAIN}`;

async function findAccount(admin, username) {
  const email = usernameToEmail(username);
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find(
      (u) => (u.email || '').toLowerCase() === email || u.app_metadata?.username === username
    );
    if (found || users.length < 1000) return found || null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({
      error: 'The server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (Vercel environment variables).',
    });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is calling? Verify their session token with Supabase.
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  const callerRole = caller.app_metadata?.role;
  if (!PRIVILEGED.includes(callerRole)) {
    return res.status(403).json({ error: 'Only an Admin or Software Admin can manage user accounts.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const action = body.action;
  const username = String(body.username || '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({ error: 'Invalid username (use 2–40 lowercase letters, numbers, dot, dash or underscore).' });
  }

  try {
    const account = await findAccount(admin, username);
    const accountRole = account?.app_metadata?.role;
    if (callerRole === 'Admin' && PRIVILEGED.includes(accountRole)) {
      return res.status(403).json({ error: 'Admin cannot manage Admin or Software Admin accounts. Only a Software Admin can do this.' });
    }
    const isSelf = account && account.id === caller.id;

    if (action === 'delete') {
      if (isSelf) return res.status(400).json({ error: 'You cannot delete your own account.' });
      if (account) {
        const { error } = await admin.auth.admin.deleteUser(account.id);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'save') {
      const role = body.role;
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
      if (callerRole === 'Admin' && PRIVILEGED.includes(role)) {
        return res.status(403).json({ error: 'Admin cannot assign the Admin or Software Admin role. Only a Software Admin can do this.' });
      }
      const password = body.password ? String(body.password) : '';
      if (password && password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      }
      const active = body.active !== false;
      if (isSelf && (!active || role !== callerRole)) {
        return res.status(400).json({ error: 'You cannot deactivate your own account or change your own role.' });
      }
      const app_metadata = { ...(account?.app_metadata || {}), role, username };

      if (!account) {
        // No login account yet: one can only be created together with a password.
        if (!password) return res.status(200).json({ ok: true, missing: true });
        const { error } = await admin.auth.admin.createUser({
          email: usernameToEmail(username),
          password,
          email_confirm: true,
          app_metadata,
          ban_duration: active ? 'none' : BANNED_FOREVER,
        });
        if (error) throw error;
        return res.status(200).json({ ok: true, created: true });
      }

      const update = { app_metadata, ban_duration: active ? 'none' : BANNED_FOREVER };
      if (password) update.password = password;
      const { error } = await admin.auth.admin.updateUserById(account.id, update);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('api/users error:', e);
    return res.status(500).json({ error: e?.message || 'Unexpected server error.' });
  }
}
