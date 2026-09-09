const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('supabase-client.js','utf8');
function environment(saved, handler) {
  const memory = new Map(saved ? [['sportsfestSupabaseSession:https://test.supabase.co',JSON.stringify(saved)]] : []);
  const calls=[];
  const window={SPORTSFEST_CONFIG:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}};
  const context=vm.createContext({window,AbortSignal,Date,JSON,sessionStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    fetch:async(url,options)=>{calls.push({url,options});const result=await handler(url,JSON.parse(options.body),options);return {ok:result.status<400,status:result.status,json:async()=>result.body};}});
  vm.runInContext(source,context);
  return {api:window.SportsfestAPI,calls,memory};
}
(async()=>{
  let failLogout=false;
  const env=environment(null,async(url,body,options)=>{
    if(url.includes('grant_type=password')) {assert.equal(body.email,'owner@example.com');return {status:200,body:{access_token:'access',refresh_token:'refresh',expires_in:3600}};}
    if(url.includes('/logout')) return {status:failLogout?500:200,body:{}};
    if(url.includes('sportsfest_public')) {assert.equal(options.headers.Authorization,undefined);return {status:200,body:{ok:true,leaderboard:[]}};}
    assert.equal(options.headers.Authorization,'Bearer access');
    if(body.action==='saveAll') return {status:200,body:{ok:false,code:'CONFLICT',error:'Review changes',data:{revision:'new'}}};
    if(url.includes('/functions/')) return {status:200,body:{ok:true,users:[]}};
    return {status:200,body:{ok:true,data:{revision:'0'},user:{role:'owner'}}};
  });
  assert.equal(env.api.configured(),true);
  await assert.rejects(env.api.admin('loadAdmin'),/sign in/);
  assert.equal((await env.api.admin('login',null,{username:'owner@example.com',password:'test-only'})).sessionToken,'supabase');
  assert.equal(env.api.hasSession(),true);
  assert.ok(![...env.memory.values()].join().includes('test-only'),'Password is not stored');
  await env.api.publicData();
  await assert.rejects(env.api.admin('saveAll',{revision:'old'}),e=>e.code==='CONFLICT'&&e.data.revision==='new');
  await env.api.admin('manageAdmin',{operation:'create',username:'admin@example.com'});
  assert.ok(env.calls.at(-1).url.endsWith('/functions/v1/manage-admins'));
  failLogout=true;
  await assert.rejects(env.api.admin('logout'));
  assert.equal(env.api.hasSession(),false,'Logout clears local tokens even when network fails');
  const expired={access_token:'old',refresh_token:'refresh',expires_at:1};
  let refreshes=0;
  const refresh=environment(expired,async(url,body,options)=>{
    if(url.includes('grant_type=refresh_token')) {refreshes++;await new Promise(r=>setTimeout(r,10));return {status:200,body:{access_token:'new',refresh_token:'rotated',expires_in:3600}};}
    assert.equal(options.headers.Authorization,'Bearer new');return {status:200,body:{ok:true}};
  });
  await Promise.all([refresh.api.admin('loadAdmin'),refresh.api.admin('loadHistory')]);
  assert.equal(refreshes,1,'Concurrent calls share a single refresh');
  const denied=environment(expired,async()=>({status:400,body:{message:'Refresh expired'}}));
  await assert.rejects(denied.api.admin('loadAdmin'),/expired/);
  assert.equal(denied.api.hasSession(),false);
  const transient=environment(expired,async()=>({status:503,body:{message:'Unavailable'}}));
  await assert.rejects(transient.api.admin('loadAdmin'));
  assert.equal(transient.api.hasSession(),true,'Temporary outages preserve refresh credentials');
  console.log('PASS: Supabase email login, password non-persistence, token refresh, conflict payloads, owner function routing, and logout cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
