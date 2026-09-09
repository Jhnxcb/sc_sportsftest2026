// Runs the actual migration and RPCs in embedded PostgreSQL. No live data used.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
const vm = require('node:vm');
const editor = vm.createContext({});
vm.runInContext(fs.readFileSync('basic-ed-data.js', 'utf8') + '\n' + fs.readFileSync('basic-ed-admin.js', 'utf8'), editor);
async function checkEditorSave(db) {
  const original = (await db.query('select document from sportsfest_private.dashboard')).rows[0].document;
  editor.data = clone(original);
  const ids = JSON.parse(vm.runInContext('JSON.stringify(editableAwardEvents(data).map(event => event.id))', editor));
  const draft = clone(original);
  draft.specialEvents = ids.map(eventId => ({ eventId, winnerTeamId: original.specialEvents.find(row => row.eventId === eventId).winnerTeamId }));
  draft.leaderboard = [{ dept: 'SECSA', points: 2 }];
  const validated = (await db.query('select sportsfest_private.validate_document($1::jsonb) as document', [JSON.stringify(draft)])).rows[0].document;
  assert.equal(validated.leaderboard[0].points, draft.leaderboard[0].points);
  assert.deepEqual(validated.specialEvents, original.specialEvents);
}
(async () => {
  const db = new PGlite();
  const owner = '00000000-0000-0000-0000-000000000001';
  const admin = '00000000-0000-0000-0000-000000000002';
  const stranger = '00000000-0000-0000-0000-000000000003';
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated;
    insert into auth.users(id,email) values('${owner}','owner@example.com'),('${admin}','admin@example.com'),('${stranger}','stranger@example.com');`);
  await db.exec(fs.readFileSync('supabase/migrations/202609070001_sportsfest.sql','utf8'));
  await db.exec(`update sportsfest_private.dashboard set document=jsonb_set(document,'{specialEvents,2,winnerTeamId}','"harks"'::jsonb)`);
  await checkEditorSave(db);
  await db.exec(fs.readFileSync('supabase/migrations/202609080001_split_pageant.sql','utf8'));
  const migrated = (await db.query('select document from sportsfest_private.dashboard')).rows[0].document;
  assert.deepEqual(migrated.specialEvents.map(e=>e.eventId),['cheerdance','bench','mr','ms']);
  assert.ok(migrated.specialEvents.slice(2).every(e=>e.winnerTeamId===''));
  assert.equal((await db.query('select special_events from sportsfest_private.pageant_backup')).rows[0].special_events[2].winnerTeamId,'harks');
  await checkEditorSave(db);
  await db.exec(fs.readFileSync('supabase/migrations/202609080001_split_pageant.sql','utf8'));
  assert.deepEqual((await db.query('select document from sportsfest_private.dashboard')).rows[0].document,migrated);

  await db.exec(`insert into sportsfest_private.members(id,username,display_name,role) values
    ('${owner}','owner@example.com','Owner','owner'),('${admin}','admin@example.com','Committee','admin')`);
  await db.exec(`insert into auth.sessions select id,id,now()-interval '1 minute' from auth.users`);
  async function identity(id, iat = Math.floor(Date.now()/1000)) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id || '',JSON.stringify({iat,session_id:id})]);
    await db.exec('set role ' + (id ? 'authenticated' : 'anon'));
  }
  async function rpc(action, data = {}) { return (await db.query('select public.sportsfest_admin($1,$2::jsonb) result',[action,JSON.stringify(data)])).rows[0].result; }
  async function publicData() { return (await db.query('select public.sportsfest_public() result')).rows[0].result; }
  await identity(null);
  assert.equal((await publicData()).ok,false,'No fabricated published results before import/save');
  await assert.rejects(rpc('loadAdmin'),/permission denied/);
  await assert.rejects(db.query('select * from sportsfest_private.members'),/permission denied/);
  await identity(stranger);
  await assert.rejects(rpc('loadAdmin'),/active administrator/);
  await assert.rejects(rpc('saveAll'),/active administrator/);
  await identity(owner);
  const initial = (await rpc('loadAdmin')).data;
  const draft = clone(initial);
  draft.specialEvents.find(e=>e.eventId==='mr').winnerTeamId='harks';
  draft.specialEvents.find(e=>e.eventId==='ms').winnerTeamId='STED';
  draft.leaderboard = [{dept:'STED',points:100}];
  draft.basicEdLeaderboard[0].points = 30;
  draft.announcements = [{message:'Public notice',active:true},{message:'PRIVATE DRAFT',active:false}];
  draft.matches = [
    {date:'',sport:'Basketball',teamA:'STED',teamB:'SBA',time:'10 AM',venue:'Gym',status:'Scheduled',active:true},
    {date:'1999-01-01',sport:'Hidden past match',teamA:'STED',teamB:'SBA',time:'',venue:'',status:'Done',active:true},
    {date:'',sport:'Hidden draft match',teamA:'STED',teamB:'SBA',time:'',venue:'',status:'Draft',active:false}
  ];
  draft.media = [{type:'school-promo',title:'Private video',message:'',url:'https://example.com/a.mp4',poster:'',duration:20,active:false}];
  draft.secret = 'DO NOT PUBLISH';
  // A late import failure must roll back all previously inserted history.
  const importedHistory = [{timestamp:'2026-09-01T00:00:00Z',username:'legacy',administrator:'Legacy',team:'STED',oldPoints:0,newPoints:100,revision:'old'}];
  await assert.rejects(rpc('importRecords',{data:draft,history:[...importedHistory,{...importedHistory[0],timestamp:'bad date'}]}));
  assert.equal((await rpc('loadHistory')).history.length,0);
  assert.equal((await rpc('loadAdmin')).data.revision,'0');
  await rpc('importRecords',{data:draft,history:importedHistory});
  await assert.rejects(rpc('importRecords',{data:draft,history:[]}),/untouched/);
  assert.equal((await rpc('loadHistory')).history[0].username,'legacy');
  await identity(null);
  const published = await publicData();
  assert.equal(published.leaderboard[0].points,100);
  assert.equal(published.specialEvents.find(e=>e.eventId==='mr').winnerTeamId,'harks');
  assert.equal(published.specialEvents.find(e=>e.eventId==='ms').winnerTeamId,'STED');
  assert.equal(published.matches.length,1);
  assert.deepEqual(published.announcements,['Public notice']);
  assert.deepEqual(published.media,[]);
  assert.equal(published.updatedBy,undefined,'Public API excludes administrator identity');
  assert.equal(published.secret,undefined);
  assert.ok(!JSON.stringify(published).includes('PRIVATE'));
  await identity(admin);
  await assert.rejects(rpc('listAdmins'),/Owner/);
  await assert.rejects(rpc('manageAdmin',{operation:'setActive',username:'owner@example.com',active:false}),/Owner/);
  await assert.rejects(rpc('registerAdmin',{id:stranger,username:'stranger@example.com',displayName:'Stranger'}),/Owner/);
  await assert.rejects(db.query('update sportsfest_private.dashboard set revision=\'hacked\''),/permission denied/);
  await assert.rejects(db.query('select sportsfest_private.validate_document(\'{}\'::jsonb)'),/permission denied/);
  const before = (await rpc('loadAdmin')).data;
  const edit = clone(before); edit.leaderboard[0].points=125; edit.basicEdLeaderboard[0].points=35;
  const saved = await rpc('saveAll',edit);
  assert.equal(saved.ok,true);
  const stale = await rpc('saveAll',before);
  assert.equal(stale.code,'CONFLICT');
  assert.equal(stale.data.leaderboard[0].points,125);
  const report = await rpc('exportRecords');
  assert.equal(report.history.length,3);
  assert.equal(report.history[0].username,'admin@example.com');
  assert.equal(report.data.revision,saved.revision);
  for (const mutate of [
    d=>d.leaderboard[0].points=-1, d=>d.leaderboard[0].points=1.5, d=>d.leaderboard[0].points='100',
    d=>d.leaderboard.push(clone(d.leaderboard[0])), d=>d.leaderboard=[],
    d=>d.basicEdLeaderboard.pop(), d=>d.specialEvents[0].winnerTeamId='fake',
    d=>d.displaySettings.sections.grade='true', d=>d.media[0].url='javascript:alert(1)',
    d=>d.matches[0].date='2026-02-31', d=>delete d.matches2
  ]) {
    const invalid=clone(report.data); mutate(invalid);
    await assert.rejects(rpc('saveAll',invalid));
    assert.equal((await rpc('loadAdmin')).data.revision,saved.revision,'Invalid writes leave revision unchanged');
    assert.equal((await rpc('loadHistory')).history.length,3,'Invalid writes leave history unchanged');
  }
  await identity(owner);
  await assert.rejects(rpc('manageAdmin',{operation:'setActive',username:'owner@example.com',active:false}),/protected/);
  await rpc('registerAdmin',{id:stranger,username:'stranger@example.com',displayName:'New committee'});
  await rpc('manageAdmin',{operation:'setActive',username:'admin@example.com',active:false});
  await identity(admin);
  await assert.rejects(rpc('loadAdmin'),/active administrator/);
  await assert.rejects(rpc('saveAll',report.data),/active administrator/);
  await identity(owner);
  await rpc('manageAdmin',{operation:'setActive',username:'admin@example.com',active:true});
  await identity(admin,0);
  await assert.rejects(rpc('loadAdmin'),/active administrator/,'Reactivation does not revive old sessions');
  await identity(admin,Math.floor(Date.now()/1000)+2);
  await assert.rejects(rpc('loadAdmin'),/active administrator/,'A refreshed JWT from an old session remains revoked');
  await db.exec('reset role');
  await db.query('update auth.sessions set created_at=clock_timestamp() where user_id=$1',[admin]);
  await identity(admin);
  assert.equal((await rpc('loadAdmin')).ok,true);
  await db.exec('reset role');
  await db.query('delete from auth.sessions where user_id=$1',[admin]);
  await identity(admin);
  await assert.rejects(rpc('loadAdmin'),/active administrator/,'Signed-out sessions cannot reuse an unexpired JWT');
  await db.exec('reset role');
  const grantTemplate=fs.readFileSync('supabase/add-admin.sql','utf8');
  await assert.rejects(db.exec(grantTemplate),/Replace the email/);
  const grantSQL=grantTemplate.replace("admin_email text := 'REPLACE_WITH_NEW_USER_EMAIL'","admin_email text := 'new@example.com'");
  await assert.rejects(db.exec(grantSQL),/Create and confirm/);
  await db.exec("insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000004','new@example.com',null)");
  await assert.rejects(db.exec(grantSQL),/Create and confirm/);
  await db.exec("update auth.users set email_confirmed_at=now() where email='new@example.com'");
  await db.exec(grantSQL);
  assert.equal((await db.query("select role from sportsfest_private.members where username='new@example.com'")).rows[0].role,'admin');
  await assert.rejects(db.exec(grantSQL),/already has a Sportsfest profile/);
  await db.close();
  console.log('PASS: PostgreSQL permissions, public filtering, import rollback, conflict detection, audit history, validation, and account revocation.');
})().catch(error=>{ console.error(error);process.exitCode=1; });
