-- Run this update on the existing database. Do not rerun the initial schema.
begin;
-- Preserve the old combined result without assigning it to either title.
create table if not exists sportsfest_private.pageant_backup (
  id boolean primary key,
  special_events jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table sportsfest_private.pageant_backup enable row level security;
revoke all on sportsfest_private.pageant_backup from public, anon, authenticated;
insert into sportsfest_private.pageant_backup(id,special_events)
select id,document->'specialEvents' from sportsfest_private.dashboard
where exists (select 1 from jsonb_array_elements(document->'specialEvents') e where e->>'eventId'='pageant')
on conflict (id) do nothing;
update sportsfest_private.dashboard
set document=jsonb_set(document,'{specialEvents}',
  (select coalesce(jsonb_agg(e),'[]'::jsonb) from jsonb_array_elements(document->'specialEvents') e
    where e->>'eventId' not in ('pageant','mr','ms'))
  || jsonb_build_array(
    coalesce((select e from jsonb_array_elements(document->'specialEvents') e where e->>'eventId'='mr'), '{"eventId":"mr","winnerTeamId":""}'::jsonb),
    coalesce((select e from jsonb_array_elements(document->'specialEvents') e where e->>'eventId'='ms'), '{"eventId":"ms","winnerTeamId":""}'::jsonb))),
  revision=case when revision='0' then '0' else revision || '-split-pageant' end
where exists (select 1 from jsonb_array_elements(document->'specialEvents') e where e->>'eventId'='pageant');
create or replace function sportsfest_private.validate_document(input jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  result jsonb := '{}'::jsonb; rows jsonb; item jsonb; cleaned jsonb;
  section text; key_name text; field text; team text; seen text[]; points numeric;
  college constant text[] := array['SECSA','SBA','STED','SHARP','SHTM'];
  basic constant text[] := array['harks','cubs','greenfinches','tigers','vipers','wolves','centaurus','stallion','griffin'];
  awards constant text[] := array['cheerdance','bench','mr','ms'];
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
    if (section='basicEdLeaderboard' and cardinality(seen)<>9) or (section='specialEvents' and cardinality(seen)<>4) then
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
commit;
