// No live services: exercise Apps Script operations with in-memory Sheets and sessions.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), crypto = require('crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const props = {}, cache = {}, sheets = {};
let locked = false, failHistory = false;
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return {getValues: () => clone(this.rows)}; }
  getRange(r, c, h, w) { return {
    getValues: () => Array.from({length:h}, (_,i) => Array.from({length:w}, (_,j) => this.rows[r+i-1]?.[c+j-1] ?? '')),
    setValues: values => { if (failHistory && this.name === 'PointsHistory') { failHistory = false; throw Error('Simulated history write failure'); } values.forEach((row,i) => { this.rows[r+i-1] ||= []; row.forEach((value,j) => this.rows[r+i-1][c+j-1] = value); }); }
  }; }
  appendRow(row) { this.rows.push(clone(row)); }
  clearContents() { this.rows = []; }
  setFrozenRows() {} autoResizeColumns() {}
}
const spreadsheet = {getSheetByName: name => sheets[name], insertSheet: name => sheets[name] = new Sheet(name), deleteSheet: sheet => delete sheets[sheet.name]};
const context = vm.createContext({
  PropertiesService: {getScriptProperties: () => ({getProperty:key=>props[key] || null, setProperty:(k,v)=>props[k]=v, setProperties: values=>Object.assign(props,values)})},
  CacheService: {getScriptCache: () => ({get:key=>cache[key], put:(key,value)=>cache[key]=value, remove:key=>delete cache[key]})},
  SpreadsheetApp: {getActiveSpreadsheet:()=>spreadsheet, flush:()=>{}},
  LockService: {getScriptLock:()=>({waitLock:()=>{ assert.equal(locked,false); locked=true; }, releaseLock:()=>locked=false})},
  Utilities: {getUuid:()=>crypto.randomUUID(), computeDigest:(_,value)=>crypto.createHash('sha256').update(value).digest(), base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'), DigestAlgorithm:{SHA_256:'sha256'}, Charset:{UTF_8:'utf8'}},
  Logger: {log:()=>{}}
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
context.json_ = value => clone(value);
context.readObjects_ = (_,name) => { const rows = sheets[name]?.rows || []; return rows.slice(1).map(row=>Object.fromEntries(rows[0].map((key,i)=>[key.toLowerCase(),row[i]]))); };
const base = {leaderboard:[{dept:'STED',points:100}], matches:[], matches2:[], announcements:[],media:[]};
context.saveAdminData_(spreadsheet,base);
context.saveAdminUsers_([{username:'owner',displayName:'Owner',role:'owner',active:true,salt:'s',passwordHash:context.hashAdminPassword_('password123','s')},{username:'admin',displayName:'Admin',active:true,salt:'s',passwordHash:context.hashAdminPassword_('password123','s')}]);
const post = (action,data,token,extra={}) => context.doPost({parameter:{payload:JSON.stringify({action,data,sessionToken:token,...extra})}});
const owner = post('login',null,null,{username:'owner',password:'password123'});
const admin = post('login',null,null,{username:'admin',password:'password123'});
assert.equal(owner.user.role,'owner'); assert.equal(admin.user.role,'admin');
assert.equal(owner.data.revision,'0');
const draft = clone(owner.data); draft.leaderboard[0].points=120;
const saved = post('saveAll',draft,owner.sessionToken); assert.equal(saved.ok,true);
const stale = post('saveAll',admin.data,admin.sessionToken); assert.equal(stale.code,'CONFLICT');
assert.equal(stale.data.leaderboard[0].points,120);
assert.equal(post('saveAll',base,admin.sessionToken).code,'CONFLICT','Old clients cannot bypass version checks');
let history = post('loadHistory',null,admin.sessionToken).history;
assert.equal(history.length,1); assert.equal(history[0].oldPoints,100); assert.equal(history[0].newPoints,120); assert.equal(history[0].username,'owner');
const retry = clone(stale.data); retry.leaderboard[0].points=125;
failHistory=true;
assert.equal(post('saveAll',retry,owner.sessionToken).ok,false);
assert.equal(context.readAdminData_(spreadsheet).leaderboard[0].points,120,'History failure rolls back score writes');
assert.equal(post('loadHistory',null,owner.sessionToken).history.length,1);
const refreshed = post('loadAdmin',null,owner.sessionToken).data;
refreshed.leaderboard[0].points=125;
assert.equal(post('saveAll',refreshed,owner.sessionToken).ok,true);
assert.equal(post('listAdmins',null,admin.sessionToken).ok,false);
assert.equal(post('manageAdmin',{operation:'create',username:'intruder',password:'password123'},admin.sessionToken).ok,false);
let users = post('manageAdmin',{operation:'create',username:'newadmin',displayName:'New Admin',password:'password123'},owner.sessionToken);
assert.equal(users.ok,true); assert.equal(users.users.length,3); assert.ok(users.users.every(user=>!('passwordHash' in user) && !('salt' in user)));
assert.equal(post('manageAdmin',{operation:'create',username:'NEWADMIN',password:'password123'},owner.sessionToken).ok,false);
assert.equal(post('manageAdmin',{operation:'setActive',username:'owner',active:false},owner.sessionToken).ok,false);
assert.equal(post('manageAdmin',{operation:'setActive',username:'admin',active:false},owner.sessionToken).ok,true);
assert.equal(post('loadAdmin',null,admin.sessionToken).ok,false,'Deactivated account loses existing session access');
assert.equal(post('login',null,null,{username:'admin',password:'password123'}).ok,false);
assert.equal(post('manageAdmin',{operation:'setActive',username:'admin',active:true},owner.sessionToken).ok,true);
assert.equal(post('loadAdmin',null,admin.sessionToken).ok,false,'Reactivation does not revive revoked sessions');
assert.equal(post('login',null,null,{username:'admin',password:'password123'}).ok,true);
assert.equal(locked,false);
for (let i=0;i<205;i++) sheets.PointsHistory.appendRow(['2026-09-07T00:00:00Z','admin','Admin','STED',i,i+1,1,'test-'+i]);
assert.equal(post('loadHistory',null,owner.sessionToken).history.length,200);
const exported = post('exportRecords',null,owner.sessionToken);
assert.equal(exported.ok,true);
assert.equal(exported.history.length,207,'Export includes history beyond the recent 200');
assert.equal(exported.data.leaderboard[0].points,125);
assert.equal(post('exportRecords',null,'invalid-session').ok,false);
// Parse every inline script and shared helper, and exercise the actual client merge logic.
for (const file of ['admin.html','index.html']) {
  for (const match of fs.readFileSync(file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:file});
}
function element() { return {children:[],append(...items){this.children.push(...items);},textContent:'',value:''}; }
const client = vm.createContext({document:{addEventListener:()=>{},createElement:element},TEAMS:{STED:{team:'Golden Hawks'}},Option:function(label,value){this.value=value;},toast:()=>{},renderAll:()=>{},setDirty:()=>{}});
vm.runInContext(fs.readFileSync('admin-safety.js','utf8'),client);
async function mergeTests() {
  client.base = {revision:'a',leaderboard:[{dept:'STED',points:100},{dept:'SBA',points:50}]};
  client.latest = {revision:'b',leaderboard:[{dept:'STED',points:120},{dept:'SBA',points:50}]};
  client.mine = {revision:'a',leaderboard:[{dept:'STED',points:100},{dept:'SBA',points:70}]};
  vm.runInContext('savedDashboard = safetyCopy(base); safetyDialog = async () => true;',client);
  await client.safetyResolve(client.latest,client.mine);
  const merged = vm.runInContext('dashboardData',client);
  assert.equal(merged.leaderboard[0].points,120); assert.equal(merged.leaderboard[1].points,70); assert.equal(merged.revision,'b');
  vm.runInContext('savedDashboard = safetyCopy(base); safetyDialog = async (_,content) => { content.children.forEach(row => row.children?.forEach(label => label.children?.forEach(select => { select.value = "mine"; }))); return true; };',client);
  client.mine.leaderboard[0].points=130;
  await client.safetyResolve(client.latest,client.mine);
  assert.equal(vm.runInContext('dashboardData.leaderboard[0].points',client),130,'Conflicting scores require and honor explicit choice');
  assert.equal(vm.runInContext('savedDashboard.leaderboard[0].points',client),120);
  client.document.querySelector = () => null;
  client.document.querySelectorAll = () => [];
  client.document.getElementById = () => null;
  client.collectData = () => {};
  client.renderOverview = () => {};
  client.setStatus = () => {};
  client.formatUpdated = value => value;
  let publishes = 0;
  client.apiRequest = async () => { publishes++; return {revision:'c',updatedAt:'now',updatedBy:'Owner'}; };
  vm.runInContext('connected = true; savedDashboard = safetyCopy(base); dashboardData = safetyCopy(mine); safetyDialog = async () => false;',client);
  await client.safetySave(); assert.equal(publishes,0,'Canceling review never sends a save');
  vm.runInContext('safetyDialog = async () => true;',client);
  await client.safetySave(); assert.equal(publishes,1,'Publishing requires accepted review');
  assert.equal(vm.runInContext('savedDashboard.revision',client),'c');
  await client.safetySave(); assert.equal(publishes,1,'Unchanged forms are not published');
  const displaySource = fs.readFileSync('index.html','utf8');
  const nodes = Object.fromEntries(['#last-received','#sync-label','#sync-dot'].map(id=>[id,{textContent:'',classList:{toggle:()=>{}}}]));
  const display = vm.createContext({CONFIG:{STORAGE_KEY:'test',DATA_ENDPOINT:'https://example.test'},localStorage:{getItem:()=>null},navigator:{onLine:true},window:{addEventListener:()=>{}},$:id=>nodes[id]});
  vm.runInContext(displaySource.slice(displaySource.indexOf('    let lastReceivedAt'),displaySource.indexOf('    function setLastUpdated')),display);
  vm.runInContext('lastReceivedAt = Date.now(); updateConnectionHealth();',display);
  assert.equal(nodes['#sync-label'].textContent,'Connected');
  vm.runInContext('lastReceivedAt = Date.now() - 100000; updateConnectionHealth();',display);
  assert.match(nodes['#sync-label'].textContent,/Delayed/);
  display.navigator.onLine=false; display.updateConnectionHealth(); assert.match(nodes['#sync-label'].textContent,/Offline/);
  display.navigator.onLine=true;
  vm.runInContext('lastReceivedAt = Date.now(); connectionFailed = false; updateConnectionHealth();',display);
  assert.equal(nodes['#sync-label'].textContent,'Connected');
  assert.match(nodes['#last-received'].textContent,/Received 0s ago/);
  console.log('PASS: stale saves blocked; score history and rollback; owner authorization; create/deactivate/reactivate; session revocation; review cancel/publish and conflict merge; TV connected/delayed/offline/recovery; local scripts parse.');
}
mergeTests().catch(error=>{console.error(error);process.exitCode=1;});
