-- After adding a user under Supabase Authentication > Users, replace the email
-- below and run this in the project's SQL Editor. No password is entered here.
-- This grants score-editing access only; it does not create another owner.
do $$
declare
  admin_email text := 'REPLACE_WITH_NEW_USER_EMAIL';
  admin_name text := 'Committee Administrator';
  user_id uuid;
begin
  if admin_email='REPLACE_WITH_NEW_USER_EMAIL' then
    raise exception 'Replace the email with the new Supabase user email first.';
  end if;
  select id into user_id from auth.users where lower(email)=lower(admin_email)
    and email_confirmed_at is not null;
  if user_id is null then
    raise exception 'Create and confirm this email under Authentication > Users first.';
  end if;
  if exists(select 1 from sportsfest_private.members where id=user_id) then
    raise exception 'This user already has a Sportsfest profile. Manage activation from the owner dashboard.';
  end if;
  insert into sportsfest_private.members(id,username,display_name,role,active)
    values(user_id,lower(admin_email),admin_name,'admin',true);
end $$;
