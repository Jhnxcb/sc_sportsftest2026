// Local integration checks. Uses mocked API responses; never writes to live Sheets.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.SPORTSFEST_NODE_MODULES || 'C:/Users/tamon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const defs = vm.runInNewContext(fs.readFileSync('basic-ed-data.js','utf8') + ';({departments,events,DISPLAY_SECTIONS})');
const backend = vm.createContext({});
vm.runInContext(fs.readFileSync('Code.gs','utf8'), backend);
let data = {
  revision:'0',
  displaySettings:{sections:Object.fromEntries(defs.DISPLAY_SECTIONS.map(s=>[s.id,s.enabled]))},
  leaderboard: [{dept:'STED',points:200}], matches:[], matches2:[], announcements:[], media:[],
  basicEdLeaderboard:Object.values(defs.departments).flatMap(d=>d.teams).map(t=>({teamId:t.id,points:0})),
  specialEvents:defs.events.map(e=>({eventId:e.id,winnerTeamId:''})), updatedAt:new Date().toISOString(), updatedBy:'Test admin'
};
const testAdmins = [{username:'tester@example.com',displayName:'Test admin',role:'owner',active:true}];
let accountAttempts = 0;
assert.equal(backend.validateBasicEd_(data).scores.length,9);
assert.equal(Object.keys(backend.validateBasicEd_({})).length,0,'Older clients preserve new sheets');
const invalid=JSON.parse(JSON.stringify(data)); invalid.basicEdLeaderboard[0].points=-1;
assert.throws(()=>backend.validateBasicEd_(invalid));
// Exercise the actual read/write entry points with an in-memory spreadsheet.
const sheets = {};
const spreadsheet = { getSheetByName:name=>sheets[name] || null };
backend.writeSheet_ = (_, name, headers, rows) => { sheets[name] = rows.map(row=>Object.fromEntries(headers.map((header,i)=>[header.toLowerCase(),row[i]]))); };
backend.readObjects_ = (_,name)=>sheets[name] || [];
backend.SpreadsheetApp = { getActiveSpreadsheet:()=>spreadsheet };
backend.PropertiesService = { getScriptProperties:()=>({getProperty:()=>''}) };
backend.json_ = value=>value;
backend.isToday_ = ()=>true;
backend.saveAdminData_(spreadsheet,data);
assert.equal(sheets.BasicEdLeaderboard.length,9);
assert.equal(sheets.SpecialEvents.length,4);
assert.ok(sheets.Matches2);
assert.equal(sheets.DisplaySettings.find(row=>row.setting==='college').value,false);
assert.equal(backend.readAdminData_(spreadsheet).matches2.length,0);
assert.equal(backend.doGet().ok,true);
assert.equal(backend.doGet().displaySettings.sections.college,false);
invalid.basicEdLeaderboard[0].points=1.5;
assert.throws(()=>backend.validateBasicEd_(invalid));
invalid.basicEdLeaderboard[0].points=0; invalid.specialEvents[0].winnerTeamId='unknown';
assert.throws(()=>backend.validateBasicEd_(invalid));
const server=http.createServer((req,res)=>{
  const file=path.resolve('.',decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html');
  if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(bytes);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    await context.route('https://*.supabase.co/**',async route=>{
      const url=route.request().url();
      if(route.request().method()==='OPTIONS') {await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST, OPTIONS'}});return;}
      let result;
      if(url.includes('/auth/v1/token')) result={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600};
      else if(url.includes('/functions/v1/manage-admins')) {
        accountAttempts++;
        if(accountAttempts===1) {await route.fulfill({status:400,json:{error:'An account with this email already exists.'},headers:{'Access-Control-Allow-Origin':'*'}});return;}
        const input=JSON.parse(route.request().postData());
        assert.equal(input.username,'committee@example.com');
        testAdmins.push({username:input.username,displayName:input.displayName,role:'admin',active:true});
        result={ok:true,users:testAdmins};
      }
      else if(url.includes('sportsfest_public')) result={ok:true,...data,announcements:data.announcements.filter(r=>r.active).map(r=>r.message)};
      else {
        const request=JSON.parse(route.request().postData() || '{}');
        if(request.action==='saveAll') {backend.validateBasicEd_(request.data);data={...request.data,revision:String(Number(data.revision)+1)};}
        result={ok:true,data,history:[],revision:data.revision,username:'tester@example.com',user:{username:'tester@example.com',displayName:'Test admin',role:'owner'},updatedAt:new Date().toISOString(),updatedBy:'Test admin'};
        if(request.action==='listAdmins') result={ok:true,users:testAdmins};
      }
      await route.fulfill({json:result,headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await context.route('https://script.google.com/**',route=>{throw new Error('App must not call Google Sheets.');});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/admin.html');
    await page.locator('#login-password').fill('test-only');
    await page.locator('#toggle-password').click();
    assert.equal(await page.locator('#login-password').getAttribute('type'),'text');
    await page.locator('#toggle-password').click();
    assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
    await page.screenshot({path:'admin-login-preview.png',animations:'disabled'});
    const passwordBox = await page.locator('#login-password').boundingBox();
    assert.ok(passwordBox.width > 250, 'Password field retains usable width');
    await page.locator('#login-username').fill('tester@example.com');
    await page.locator('#login-button').click();
    await page.locator('#manage-admins-button').click();
    const accountForm=page.locator('.safety-dialog form');
    await accountForm.locator('[name="username"]').fill('committee@example.com');
    await accountForm.locator('[name="displayName"]').fill('Committee');
    await accountForm.locator('[name="password"]').fill('short');
    await accountForm.locator('[type="submit"]').click();
    await accountForm.locator('[role="status"]').filter({hasText:'12–128 characters'}).waitFor();
    assert.equal(accountAttempts,0,'Invalid passwords display an error without creating accounts');
    await accountForm.locator('[name="password"]').fill('test-password-123');
    await accountForm.locator('[type="submit"]').click();
    await accountForm.locator('[role="status"]').filter({hasText:'This email already has a sign-in account.'}).waitFor();
    assert.equal(await accountForm.locator('[type="submit"]').isEnabled(),true);
    await accountForm.locator('[type="submit"]').click();
    await accountForm.locator('[role="status"]').filter({hasText:'Administrator created. Sign in with committee@example.com'}).waitFor();
    assert.equal(await accountForm.locator('[name="password"]').inputValue(),'');
    assert.equal(await page.locator('.safety-dialog article').filter({hasText:'committee@example.com'}).count(),1);
    await page.locator('.safety-dialog [data-proceed]').click();
    await page.locator('[data-tab="tv"]').click();
    assert.equal(await page.locator('.tabs-strip [data-screen-section]').count(),0);
    assert.equal(await page.locator('#panel-tv [data-screen-section]').count(),9);
    await page.screenshot({path:'admin-tv-controls-preview.png',fullPage:true,animations:'disabled'});
    await page.locator('[data-tab="grade"]').click();
    assert.equal(await page.locator('#basic-admin-grade tbody tr').count(),2);
    const adminOrder = () => page.locator('[data-basic-team], [data-leader-dept]').evaluateAll(nodes => nodes.map(node => node.dataset.basicTeam || node.dataset.leaderDept));
    const initialOrder = await adminOrder();
    assert.deepEqual(await page.locator('[data-leader-dept]').evaluateAll(nodes => nodes.map(node => node.dataset.leaderDept)), await page.evaluate(() => TEAM_CODES));
    await page.locator('[data-basic-team="harks"]').fill('42');
    await page.locator('[data-basic-team="harks"]').press('Tab');
    await page.locator('#basic-admin-grade tr').filter({has:page.locator('[data-basic-team="harks"]')}).locator('[data-points-step="1"]').click();
    assert.equal(await page.locator('[data-basic-team="harks"]').inputValue(),'43');
    assert.deepEqual(await adminOrder(), initialOrder, 'Score edits and steppers keep admin rows in place');
    await page.locator('[data-tab="junior"]').click();
    assert.equal(await page.locator('#basic-admin-junior tbody tr').count(),4);
    await page.locator('[data-basic-team="wolves"]').fill('27');
    await page.locator('[data-tab="awards"]').click();
    await page.locator('[data-basic-event="cheerdance"]').selectOption('harks');
    assert.equal(await page.locator('[data-basic-event="bench"] optgroup[label="College"] option').count(), 5);
    await page.locator('[data-basic-event="bench"]').selectOption('STED');
    await page.locator('[data-basic-event="mr"]').selectOption('cubs');
    await page.locator('[data-basic-event="ms"]').selectOption('wolves');
    await page.locator('[data-tab="matches"]').click();
    await page.locator('[data-add="match"]').click();
    await page.locator('#matches-editor .m-sport').fill('Basketball');
    await page.locator('[data-tab="matches2"]').click();
    await page.locator('[data-add="match2"]').click();
    await page.locator('#matches2-editor .m-sport').fill('Volleyball');
    await page.locator('#matches2-editor .m-team-a').selectOption('HARKS');
    await page.locator('#save-top').click();
    await page.locator('.safety-dialog [data-proceed]').click();
    await page.waitForFunction(()=>!safetyBusy && !dirty);
    assert.equal(data.basicEdLeaderboard.find(t=>t.teamId==='harks').points,43);
    backend.saveAdminData_(spreadsheet, data);
    assert.equal(backend.readBasicEd_(spreadsheet).specialEvents.find(event=>event.eventId==='bench').winnerTeamId, 'STED');
    assert.deepEqual(await adminOrder(), initialOrder, 'Saving keeps admin rows in place');
    await page.locator('[data-tab="grade"]').click();
    await page.screenshot({path:'admin-departments-preview.png',fullPage:true,animations:'disabled'});
    const display=await context.newPage();display.on('pageerror',e=>errors.push(e.message));
    await display.goto(base+'/index.html');
    await display.waitForFunction(()=>document.querySelector('#leaderboard').textContent.includes('Ethereal Centaurus'));
    assert.equal(await display.locator('#department-heading').textContent(),'Senior High School Department');
    const announcementRefresh = await display.evaluate(async () => {
      const row = document.querySelector('#leaderboard .leader-row');
      const index = state.viewIndex;
      const timer = state.rotationTimer;
      const original = window.SportsfestAPI.publicData;
      const scores = JSON.stringify([state.data.leaderboard,state.data.basicEdLeaderboard]);
      window.SportsfestAPI.publicData = async () => ({...state.data,announcements:['Updated scrolling text']});
      try {
        await syncData();
        return {
          sameRow: row === document.querySelector('#leaderboard .leader-row'),
          sameView: index === state.viewIndex,
          sameTimer: timer === state.rotationTimer,
          sameScores: scores === JSON.stringify([state.data.leaderboard,state.data.basicEdLeaderboard]),
          textUpdated: state.data.announcements[0] === 'Updated scrolling text'
        };
      } finally { window.SportsfestAPI.publicData = original; }
    });
    assert.deepEqual(announcementRefresh,{sameRow:true,sameView:true,sameTimer:true,sameScores:true,textUpdated:true},
      'Scrolling text refresh preserves leaderboard rows, scores, department and rotation timer');

    assert.equal(await display.locator('[data-department]').count(),0);
    async function selectPublicView(id) {
      await page.evaluate(id=>document.querySelectorAll('[data-screen-section]').forEach(input=>{input.checked=input.dataset.screenSection===id;input.dispatchEvent(new Event('change',{bubbles:true}));}),id);
      if(Object.entries(data.displaySettings.sections).some(([key,value])=>value!==(key===id))) {
        await page.locator('#save-top').click();
        await page.locator('.safety-dialog [data-proceed]').click();
        await page.waitForFunction(()=>!safetyBusy && !dirty);
      }
      await display.waitForFunction(()=>!syncInFlight);
      await display.evaluate(()=>syncData());
    }
    await selectPublicView('junior');
    assert.equal(await display.locator('.leader-row').count(),4);
    assert.equal(await display.locator('.leader-points').first().getAttribute('data-final-points'),'27');
    assert.equal(await display.evaluate(()=>CONFIG.VIEW_DURATIONS_MS.leaderboard),30000);
    assert.equal(await display.evaluate(()=>CONFIG.VIEW_DURATIONS_MS.matches),30000);
    await display.emulateMedia({reducedMotion:'reduce'});
    for (const viewport of [{width:3840,height:2160},{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720},{width:1280,height:600}]) {
      await display.setViewportSize(viewport);
      const layout = await display.evaluate(()=>{
        const rows=[...document.querySelectorAll('.leader-row')].map(el=>el.getBoundingClientRect());
        return {gaps:rows.slice(1).map((row,i)=>row.top-rows[i].bottom),lefts:rows.map(row=>row.left),bottom:rows.at(-1).bottom,stageBottom:document.querySelector('.main-stage').getBoundingClientRect().bottom};
      });
      assert.ok(layout.gaps.every(gap=>Math.abs(gap-8)<1),'TV rows keep consistent 8px gaps at '+JSON.stringify(viewport));
      assert.ok(layout.lefts.every(left=>Math.abs(left-layout.lefts[0])<1),'TV rows align');
      assert.ok(layout.bottom<=layout.stageBottom,'All rows stay above the ticker');
      assert.ok(await display.locator('.leader-row h3').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)) >= viewport.height * .032, 'Team names scale with TV resolution');
      assert.ok(await display.locator('.leader-points').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)) >= viewport.height * .053, 'Scores scale with TV resolution');
      assert.ok(await display.locator('.leader-row').evaluateAll(rows=>rows.every(row=>[...row.querySelectorAll('h3,.leader-points')].every(el=>{const r=el.getBoundingClientRect(), parent=row.getBoundingClientRect();return r.top>=parent.top && r.bottom<=parent.bottom && r.right<=parent.right;}))), 'TV names and scores stay inside their rows');
      if(viewport.width===1920) await display.screenshot({path:'leaderboard-tv-preview.png',animations:'disabled'});
    }
    await display.setViewportSize({width:1440,height:900});
    await display.emulateMedia({reducedMotion:'no-preference'});
    await selectPublicView('awards');
    assert.match(await display.locator('#public-awards').textContent(),/Mighty Sharks/);
    assert.match(await display.locator('#public-awards').textContent(),/Golden Hawks/);
    assert.ok(await display.locator('#public-awards img[alt="Golden Hawks logo"]').evaluate(img=>img.complete && img.naturalWidth > 0), 'College award logo loads');
    assert.equal(await display.locator('.public-award').count(),4);
    assert.match(await display.locator('.public-award').filter({hasText:'Mr. Sportsfest'}).textContent(),/Fearless Cubs/);
    assert.match(await display.locator('.public-award').filter({hasText:'Ms. Sportsfest'}).textContent(),/Azura Wolves/);
    await display.screenshot({path:'separate-awards-preview.png',animations:'disabled'});
    await selectPublicView('college');
    assert.match(await display.locator('#leaderboard').textContent(),/Golden Hawks/);
    await selectPublicView('matches');
    assert.match(await display.locator('#matches-grid').textContent(),/Basketball/);
    assert.doesNotMatch(await display.locator('#matches-grid').textContent(),/Volleyball/);
    await selectPublicView('matches2');
    assert.match(await display.locator('#matches-grid').textContent(),/Volleyball/);
    assert.match(await display.locator('#matches-grid').textContent(),/Mighty Sharks/);
    await selectPublicView('none');
    assert.equal(await display.locator('#view-idle').evaluate(el=>el.classList.contains('active')),true);
    await selectPublicView('grade');
    await display.waitForFunction(()=>document.querySelector('.leader-points').textContent==='43');
    assert.equal(await display.locator('#progress-bar').evaluate(el=>getComputedStyle(el).animationName),'tickerProgress');
    const before=await display.locator('#progress-bar').evaluate(el=>el.getAnimations()[0].currentTime);
    await display.waitForFunction(t=>document.querySelector('#progress-bar').getAnimations()[0].currentTime>t+100,before);
    assert.ok(await display.locator('#ticker-message').evaluate(el=>el.getAnimations().length>0),'Announcement ticker animates');
    await display.evaluate(()=>{CONFIG.VIEW_DURATIONS_MS.leaderboard=120;state.data.displaySettings.sections={senior:true,junior:true,grade:true,college:false};applyDisplaySettings();});
    await display.waitForFunction(()=>document.querySelector('#department-heading').textContent==='Senior High School Department');
    await display.waitForFunction(()=>document.querySelector('#department-heading').textContent==='Junior High School Department');
    await display.evaluate(()=>{CONFIG.VIEW_DURATIONS_MS.leaderboard=60000;});
    await selectPublicView('grade');
    await display.waitForFunction(()=>document.querySelector('.leader-points').textContent==='43');
    await display.screenshot({path:'index-departments-preview.png',fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await display.setViewportSize({width:390,height:844});
    for(const p of [page,display]) assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No mobile horizontal overflow');
    const migrationContext=await browser.newContext();
    const migrationReport={data:JSON.parse(JSON.stringify(data)),history:[{timestamp:'2026-09-01T00:00:00Z',username:'legacy',administrator:'Legacy admin',team:'harks',oldPoints:0,newPoints:43,change:43,revision:'legacy-revision'}],exportedAt:'2026-09-07T00:00:00Z'};
    let importedReport=null;
    await migrationContext.route('https://script.google.com/**',async route=>{
      const request=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));
      const result=request.action==='login'?{ok:true,sessionToken:'legacy-test'}:request.action==='exportRecords'?{ok:true,...migrationReport}:{ok:true};
      await route.fulfill({json:result,headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await migrationContext.route('https://*.supabase.co/**',async route=>{
      if(route.request().method()==='OPTIONS') {await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST, OPTIONS'}});return;}
      const request=JSON.parse(route.request().postData() || '{}');
      let result={ok:true};
      if(route.request().url().includes('/auth/v1/token')) result={access_token:'test-owner',refresh_token:'test-refresh',expires_in:3600};
      else if(request.action==='loadAdmin') result={ok:true,user:{role:'owner'},data:{revision:'0'}};
      else if(request.action==='importRecords') { importedReport=request.data; result={ok:true,revision:'imported'}; }
      else if(request.action==='exportRecords') result={ok:true,...importedReport};
      await route.fulfill({json:result,headers:{'Access-Control-Allow-Origin':'*'}});
    });
    const migration=await migrationContext.newPage();migration.on('pageerror',e=>errors.push(e.message));
    await migration.goto(base+'/migrate-to-supabase.html');
    assert.equal(await migration.locator('#import').isEnabled(),false);
    await migration.locator('#legacy-username').fill('legacy');
    await migration.locator('#legacy-password').fill('test-only');
    await migration.locator('#legacy-form button').click();
    await migration.locator('#preview').filter({hasText:'Points history: 1 records'}).waitFor();
    assert.equal(await migration.locator('#legacy-password').inputValue(),'');
    const backupPromise=migration.waitForEvent('download');
    await migration.locator('#download').click();
    const backup=await backupPromise;
    assert.match(backup.suggestedFilename(),/^sportsfest-complete-backup-/);
    await migration.locator('#email').fill('owner@example.com');
    await migration.locator('#password').fill('test-only');
    await migration.locator('#supabase-form button').click();
    await migration.locator('#auth-status').filter({hasText:'Owner verified'}).waitFor();
    assert.equal(await migration.locator('#import').isEnabled(),false);
    await migration.locator('#reviewed').check();
    await migration.locator('#import').click();
    await migration.locator('#import-status').filter({hasText:'Import verified: 1 history records'}).waitFor();
    assert.deepEqual(importedReport,{data:migrationReport.data,history:migrationReport.history});
    assert.equal(await migration.locator('#password').inputValue(),'');
    await migrationContext.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: backend reads/writes, password eye toggle and width, section switches, separate Matches 1/2, College activation, all-off standby, automatic rotation, animated yellow progress line, scrolling ticker, scores, award logos, and mobile overflow.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
