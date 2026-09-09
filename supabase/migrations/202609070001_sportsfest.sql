-- Run once in Supabase SQL Editor, or apply with `supabase db push`.
-- Private tables are deliberately unavailable through the Data API. Public access
-- is limited to a filtered RPC; every administrative RPC checks current membership.
begin;
create schema if not exists sportsfest_private;
revoke all on schema sportsfest_private from public, anon, authenticated;

create table sportsfest_private.members (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null check (length(display_name) between 1 and 100),
  role text not null default 'admin' check (role in ('admin','owner')),
  active boolean not null default true,
  valid_after timestamptz not null default '-infinity'
);
create table sportsfest_private.dashboard (
  id boolean primary key default true check (id),
  document jsonb not null,
  revision text not null default '0',
  updated_at timestamptz,
  updated_by text not null default '',
  imported boolean not null default false
);
create table sportsfest_private.points_history (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null,
  username text not null,
  administrator text not null,
  team text not null,
  old_points integer not null check (old_points between 0 and 999999),
  new_points integer not null check (new_points between 0 and 999999),
  revision text not null
);
alter table sportsfest_private.members enable row level security;
alter table sportsfest_private.dashboard enable row level security;
alter table sportsfest_private.points_history enable row level security;
revoke all on all tables in schema sportsfest_private from public, anon, authenticated;
revoke all on all sequences in schema sportsfest_private from public, anon, authenticated;

insert into sportsfest_private.dashboard(document) values ('{
  "leaderboard": [],
  "basicEdLeaderboard": [
    {"teamId":"harks","points":0},{"teamId":"cubs","points":0},
    {"teamId":"greenfinches","points":0},{"teamId":"tigers","points":0},
    {"teamId":"vipers","points":0},{"teamId":"wolves","points":0},
    {"teamId":"centaurus","points":0},{"teamId":"stallion","points":0},{"teamId":"griffin","points":0}
  ],
  "specialEvents": [{"eventId":"cheerdance","winnerTeamId":""},{"eventId":"bench","winnerTeamId":""},{"eventId":"pageant","winnerTeamId":""}],
  "displaySettings": {"sections":{"senior":true,"junior":true,"grade":true,"college":false,"awards":true,"matches":true,"matches2":false,"promo":false,"sportsfest":false}},
  "matches":[],"matches2":[],"announcements":[],"media":[]
}'::jsonb);

create function sportsfest_private.snapshot() returns jsonb
language sql stable set search_path = '' as $$
  select document || jsonb_build_object('revision',revision,'updatedAt',coalesce(updated_at::text,''),'updatedBy',updated_by)
  from sportsfest_private.dashboard where id;
$$;

create function sportsfest_private.history(full_history boolean default false) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(row_data order by timestamp desc, id desc),'[]'::jsonb) from (
    select id, timestamp, jsonb_build_object('timestamp',timestamp,'username',username,'administrator',administrator,
      'team',team,'oldPoints',old_points,'newPoints',new_points,'change',new_points-old_points,'revision',revision) row_data
    from sportsfest_private.points_history order by timestamp desc, id desc
    limit case when full_history then null else 200 end
  ) h;
$$;

-- Validate and project onto known fields, so arbitrary JSON is never published.
create function sportsfest_private.validate_document(input jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  result jsonb := '{}'::jsonb; rows jsonb; item jsonb; cleaned jsonb;
  section text; key_name text; field text; team text; seen text[]; points numeric;
  college constant text[] := array['SECSA','SBA','STED','SHARP','SHTM'];
  basic constant text[] := array['harks','cubs','greenfinches','tigers','vipers','wolves','centaurus','stallion','griffin'];
  awards constant text[] := array['cheerdance','bench','pageant'];
  switches constant text[] := array['senior','junior','grade','college','awards','matches','matches2','promo','sportsfest'];
begin
  if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>2000000 then
    raise exception 'Invalid dashboard or dashboard is too large.';
  end if;
  foreach section in array array['leaderboard','basicEdLeaderboard','specialEvents','matches','matches2','announcements','media'] loop
    if jsonb_typeof(input->section) is distinct from 'array' or jsonb_array_length(input->section)>1000 then
      raise exception 'Invalid section: %',section;
    end if;
    rows := '[]'::jsonb; seen := array[]::text[];
    key_name := case section when 'leaderboard' then 'dept' when 'basicEdLeaderboard' then 'teamId' else 'eventId' end;
    for item in select value from jsonb_array_elements(input->section) loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid row in %',section; end if;
      if section in ('leaderboard','basicEdLeaderboard','specialEvents') then
        team := item->>key_name;
        if team is null or team=any(seen) or not (team=any(case section when 'leaderboard' then college when 'basicEdLeaderboard' then basic else awards end)) then
          raise exception 'Missing, duplicate or invalid team/event in %',section;
        end if;
        seen := array_append(seen,team);
        if section='specialEvents' then
          if jsonb_typeof(item->'winnerTeamId') is distinct from 'string' or not (item->>'winnerTeamId' = any(college||basic||array[''])) then
            raise exception 'Invalid winning team.';
          end if;
          cleaned := jsonb_build_object(key_name,team,'winnerTeamId',item->>'winnerTeamId');
        else
          if jsonb_typeof(item->'points') is distinct from 'number' then raise exception 'Points must be numbers.'; end if;
          points := (item->>'points')::numeric;
          if points<>trunc(points) or points<0 or points>999999 then raise exception 'Points must be whole numbers from 0 to 999999.'; end if;
          cleaned := jsonb_build_object(key_name,team,'points',points::integer);
        end if;
      else
        if jsonb_typeof(item->'active') is distinct from 'boolean' then raise exception 'Invalid active switch.'; end if;
        cleaned := jsonb_build_object('active',item->'active');
        foreach field in array case
          when section in ('matches','matches2') then array['date','sport','teamA','teamB','time','venue','status']
          when section='announcements' then array['message']
          else array['type','title','message','url','poster'] end loop
          if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>4000 then
            raise exception 'Invalid % in %',field,section;
          end if;
          cleaned := cleaned || jsonb_build_object(field,btrim(item->>field));
        end loop;
        if section in ('matches','matches2') then
          if cleaned->>'date'<>'' then
            if cleaned->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid match date.'; end if;
            perform (cleaned->>'date')::date;
          end if;
          if cleaned->>'sport'='' or cleaned->>'teamA'='' or cleaned->>'teamB'='' then raise exception 'Complete the match sport and teams.'; end if;
        elsif section='media' then
          if cleaned->>'type' not in ('school-promo','sportsfest-motion') then raise exception 'Invalid media type.'; end if;
          foreach field in array array['url','poster'] loop
            if cleaned->>field<>'' and cleaned->>field !~* '^https?://' then raise exception 'Media links must use HTTP or HTTPS.'; end if;
          end loop;
          if jsonb_typeof(item->'duration') is distinct from 'number' or (item->>'duration')::numeric<0 or (item->>'duration')::numeric>86400 then
            raise exception 'Invalid media duration.';
          end if;
          cleaned := cleaned || jsonb_build_object('duration',item->'duration');
        end if;
      end if;
      rows := rows || jsonb_build_array(cleaned);
    end loop;
    if (section='basicEdLeaderboard' and cardinality(seen)<>9) or (section='specialEvents' and cardinality(seen)<>3) then
      raise exception 'Provide all teams/events in %',section;
    end if;
    result := result || jsonb_build_object(section,rows);
  end loop;
  cleaned := '{}'::jsonb;
  foreach field in array switches loop
    if jsonb_typeof(input#>array['displaySettings','sections',field]) is distinct from 'boolean' then raise exception 'Invalid TV section: %',field; end if;
    cleaned := cleaned || jsonb_build_object(field,input#>array['displaySettings','sections',field]);
  end loop;
  return result || jsonb_build_object('displaySettings',jsonb_build_object('sections',cleaned));
end;
$$;

create function public.sportsfest_public() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; result jsonb; section text; today text := to_char(now() at time zone 'Asia/Manila','YYYY-MM-DD');
begin
  select document into d from sportsfest_private.dashboard where id;
  if not exists(select 1 from sportsfest_private.dashboard where id and updated_at is not null) then
    return jsonb_build_object('ok',false,'error','Waiting for the first published results or data import.');
  end if;
  result := jsonb_build_object('ok',true,'generatedAt',now(),
    'displaySettings',d->'displaySettings','basicEdLeaderboard',d->'basicEdLeaderboard','specialEvents',d->'specialEvents');
  result := result || (select jsonb_build_object('updatedAt',updated_at) from sportsfest_private.dashboard where id);
  result := result || jsonb_build_object('leaderboard',coalesce((select jsonb_agg(row_data order by points desc,dept) from (
    select value->>'dept' dept, (value->>'points')::integer points,
      value || jsonb_build_object('rank',row_number() over(order by (value->>'points')::integer desc,value->>'dept')) row_data
    from jsonb_array_elements(d->'leaderboard')) l),'[]'::jsonb));
  foreach section in array array['matches','matches2'] loop
    result := result || jsonb_build_object(section,coalesce((select jsonb_agg(value-'active') from jsonb_array_elements(d->section)
      where value->'active'='true'::jsonb and (value->>'date'='' or value->>'date'=today)),'[]'::jsonb));
  end loop;
  result := result || jsonb_build_object('announcements',coalesce((select jsonb_agg(value->>'message') from jsonb_array_elements(d->'announcements')
    where value->'active'='true'::jsonb and value->>'message'<>''),'[]'::jsonb));
  result := result || jsonb_build_object('media',coalesce((select jsonb_agg(value-'active') from jsonb_array_elements(d->'media')
    where value->'active'='true'::jsonb),'[]'::jsonb));
  return result;
end;
$$;

create function public.sportsfest_admin(action text, data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor sportsfest_private.members%rowtype; current_state sportsfest_private.dashboard%rowtype;
  doc jsonb; next_revision text; stamp timestamptz := clock_timestamp(); section text; key_name text;
  item jsonb; old_item jsonb; old_points integer; new_points integer; users jsonb; target uuid;
begin
  -- A new/open-signup Auth account has no membership and therefore no privileges.
  select * into actor from sportsfest_private.members where id=auth.uid() for share;
  if actor.id is null or not actor.active or not exists (
    select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid
      and user_id=actor.id and created_at>=actor.valid_after
  ) then
    raise exception 'Please sign in with an active administrator account.' using errcode='42501';
  end if;
  if action='loadAdmin' then
    return jsonb_build_object('ok',true,'username',actor.username,'user',jsonb_build_object('username',actor.username,'displayName',actor.display_name,'role',actor.role,'active',actor.active,'photoUrl',''),
      'data',sportsfest_private.snapshot());
  elsif action='loadHistory' then
    return jsonb_build_object('ok',true,'history',sportsfest_private.history(false));
  elsif action='exportRecords' then
    -- Prevent a save between the snapshot and history reads.
    perform 1 from sportsfest_private.dashboard where id for share;
    return jsonb_build_object('ok',true,'data',sportsfest_private.snapshot(),'history',sportsfest_private.history(true),'exportedAt',stamp);
  elsif action in ('listAdmins','manageAdmin','registerAdmin') then
    if actor.role<>'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
    if action='registerAdmin' then
      select id into target from auth.users where id=(data->>'id')::uuid and lower(email)=lower(data->>'username');
      if target is null then raise exception 'Create the Auth account first.'; end if;
      insert into sportsfest_private.members(id,username,display_name) values(target,lower(data->>'username'),btrim(data->>'displayName'));
    elsif action='manageAdmin' then
      if data->>'operation' is distinct from 'setActive' or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'Invalid account operation.'; end if;
      update sportsfest_private.members set active=(data->>'active')::boolean,
        valid_after=case when (data->>'active')::boolean then valid_after else stamp end
        where username=data->>'username' and role<>'owner';
      if not found then raise exception 'Administrator not found or owner account is protected.'; end if;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('username',username,'displayName',display_name,'role',role,'active',active) order by username),'[]'::jsonb)
      into users from sportsfest_private.members;
    return jsonb_build_object('ok',true,'users',users);
  elsif action in ('saveAll','importRecords') then
    select * into current_state from sportsfest_private.dashboard where id for update;
    if action='importRecords' then
      if actor.role<>'owner' then raise exception 'Owner access required.' using errcode='42501'; end if;
      if current_state.imported or current_state.revision<>'0' then raise exception 'Import is allowed only into an untouched database.'; end if;
      doc := sportsfest_private.validate_document(data->'data');
      if jsonb_typeof(data->'history') is distinct from 'array' then raise exception 'The complete points history is required.'; end if;
    else
      if data->>'revision' is distinct from current_state.revision then
        return jsonb_build_object('ok',false,'code','CONFLICT','error','Another administrator updated the dashboard. Review the latest changes before saving.','data',sportsfest_private.snapshot());
      end if;
      doc := sportsfest_private.validate_document(data);
      -- Every previously recorded college team must remain in the document.
      if exists(select 1 from jsonb_array_elements(current_state.document->'leaderboard') old
        where not exists(select 1 from jsonb_array_elements(doc->'leaderboard') new where new->>'dept'=old->>'dept')) then
        raise exception 'Previously recorded departments cannot be removed.';
      end if;
    end if;
    next_revision := gen_random_uuid()::text;
    if action='importRecords' then
      for item in select value from jsonb_array_elements(data->'history') loop
        if jsonb_typeof(item->'oldPoints') is distinct from 'number' or jsonb_typeof(item->'newPoints') is distinct from 'number'
          or (item->>'oldPoints')::numeric<>trunc((item->>'oldPoints')::numeric) or (item->>'newPoints')::numeric<>trunc((item->>'newPoints')::numeric) then
          raise exception 'Invalid history points.';
        end if;
        insert into sportsfest_private.points_history(timestamp,username,administrator,team,old_points,new_points,revision)
        values((item->>'timestamp')::timestamptz,item->>'username',item->>'administrator',item->>'team',(item->>'oldPoints')::integer,(item->>'newPoints')::integer,item->>'revision');
      end loop;
    else
      foreach section in array array['leaderboard','basicEdLeaderboard'] loop
        key_name := case section when 'leaderboard' then 'dept' else 'teamId' end;
        for item in select value from jsonb_array_elements(doc->section) loop
          select value into old_item from jsonb_array_elements(current_state.document->section) where value->>key_name=item->>key_name;
          old_points := coalesce((old_item->>'points')::integer,0); new_points := (item->>'points')::integer;
          if old_points<>new_points then
            insert into sportsfest_private.points_history(timestamp,username,administrator,team,old_points,new_points,revision)
            values(stamp,actor.username,actor.display_name,item->>key_name,old_points,new_points,next_revision);
          end if;
        end loop;
      end loop;
    end if;
    update sportsfest_private.dashboard set document=doc, revision=next_revision,updated_at=stamp,updated_by=actor.display_name,
      imported=imported or action='importRecords' where id;
    return jsonb_build_object('ok',true,'updatedAt',stamp,'updatedBy',actor.display_name,'revision',next_revision);
  end if;
  raise exception 'Unknown admin action.';
end;
$$;

revoke execute on all functions in schema sportsfest_private from public, anon, authenticated;
revoke all on function public.sportsfest_public() from public, anon, authenticated;
revoke all on function public.sportsfest_admin(text,jsonb) from public, anon, authenticated;
grant execute on function public.sportsfest_public() to anon, authenticated;
grant execute on function public.sportsfest_admin(text,jsonb) to authenticated;
commit;
