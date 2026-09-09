-- First create your account under Authentication > Users > Add user.
-- Replace both values below, then run this in SQL Editor as the project owner.
do $$
declare owner_email text := 'REPLACE_WITH_YOUR_EMAIL'; owner_name text := 'Sportsfest Owner'; user_id uuid;
begin
  if owner_email='REPLACE_WITH_YOUR_EMAIL' then raise exception 'Enter your owner email before running this script.'; end if;
  select id into user_id from auth.users where lower(email)=lower(owner_email);
  if user_id is null then raise exception 'Create this email under Authentication > Users first.'; end if;
  if exists(select 1 from sportsfest_private.members where role='owner') then raise exception 'An owner already exists. This bootstrap script is one-time only.'; end if;
  insert into sportsfest_private.members(id,username,display_name,role) values(user_id,lower(owner_email),owner_name,'owner');
end $$;
