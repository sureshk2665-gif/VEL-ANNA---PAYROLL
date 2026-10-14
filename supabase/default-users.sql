-- VIPL Payroll — create (or reset) the default login accounts.
-- Run in Supabase -> SQL Editor AFTER supabase/setup.sql. Safe to run again: it resets these
-- five accounts to the passwords below (and re-activates them); no other account is touched.
--
--   Username     Password        Role
--   swadmin      SoftAdmin@123   Software Admin
--   admin        admin123        Admin
--   hr.manager   hr@1234         HR
--   accounts     acc@1234        Accounts
--   viewer       view@1234       Viewer
--
-- These passwords are publicly known (they were in the original file). Change them after the
-- first login: Admin -> Change Password, or User Management -> Edit for other users.

do $$
declare
  acc record;
  uid uuid;
  mail text;
begin
  for acc in
    select * from (values
      ('swadmin',    'SoftAdmin@123', 'Software Admin'),
      ('admin',      'admin123',      'Admin'),
      ('hr.manager', 'hr@1234',       'HR'),
      ('accounts',   'acc@1234',      'Accounts'),
      ('viewer',     'view@1234',     'Viewer')
    ) as t(username, pw, role)
  loop
    mail := acc.username || '@users.vipl-payroll.app';
    select id into uid from auth.users where email = mail;

    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
        extensions.crypt(acc.pw, extensions.gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                           'role', acc.role, 'username', acc.username),
        '{}'::jsonb, now(), now(),
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text, 'email',
        jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
        now(), now(), now()
      );
    else
      update auth.users
      set encrypted_password = extensions.crypt(acc.pw, extensions.gen_salt('bf')),
          raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('role', acc.role, 'username', acc.username),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          banned_until       = null,
          updated_at         = now()
      where id = uid;
    end if;
  end loop;
end $$;

-- Check: should list the five accounts with their roles.
select email, raw_app_meta_data ->> 'role' as role, banned_until
from auth.users
where email like '%@users.vipl-payroll.app'
order by email;
