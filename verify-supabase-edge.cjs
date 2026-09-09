// Execute the Edge Function handler with mocked Auth clients; no live accounts.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/manage-admins/index.ts','utf8').replace(/^import .*\n/,''));
function setup({valid=true,owner=true,register=true}={}) {
  let handler;const calls=[];
  const admin={auth:{getUser:async()=>({data:{user:valid?{id:'owner'}:null},error:valid?null:{message:'bad token'}}),admin:{
    createUser:async input=>{calls.push(['create',input]);return {data:{user:{id:'new-user'}},error:null};},
    deleteUser:async id=>{calls.push(['delete',id]);return {error:null};}
  }}};
  const caller={rpc:async(name,input)=>{
    calls.push(['rpc',input]);
    return input.action==='listAdmins'?{data:owner?{ok:true}:null,error:owner?null:{message:'denied'}}:
      {data:register?{ok:true,users:[{username:input.data.username}]}:null,error:register?null:{message:'registration failed'}};
  }};
  vm.runInNewContext(source,{Request,Response,Deno:{env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public-key'})[key]},serve:fn=>handler=fn},
    createClient:(url,key,options)=>{assert.equal(url,'https://test.supabase.co');if(key==='server-secret') return admin;assert.equal(key,'public-key');assert.equal(options.global.headers.Authorization,'Bearer test-token');return caller;}});
  return {calls,run:(body,token='test-token',method='POST')=>handler(new Request('https://test.supabase.co/functions/v1/manage-admins',{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}
(async()=>{
  const input={operation:'create',username:'committee@example.com',displayName:'Committee',password:'test-password-123'};
  let env=setup();assert.equal((await env.run(input,'')).status,401);assert.equal(env.calls.length,0);
  env=setup({valid:false});assert.equal((await env.run(input)).status,401);assert.equal(env.calls.length,0);
  env=setup({owner:false});assert.equal((await env.run(input)).status,403);assert.ok(!env.calls.some(c=>c[0]==='create'));
  env=setup();assert.equal((await env.run({...input,password:'short'})).status,400);assert.ok(!env.calls.some(c=>c[0]==='create'));
  env=setup();const response=await env.run(input);assert.equal(response.status,200);assert.equal((await response.json()).users[0].username,input.username);
  assert.deepEqual(env.calls.map(c=>c[0]),['rpc','create','rpc']);
  assert.equal(env.calls[2][1].action,'registerAdmin');assert.equal(env.calls[2][1].data.id,'new-user');
  env=setup({register:false});assert.equal((await env.run(input)).status,400);assert.equal(env.calls.at(-1)[0],'delete');
  env=setup();assert.equal((await env.run(null,'','OPTIONS')).status,200);assert.equal(env.calls.length,0);
  assert.equal((await env.run(null,'','GET')).status,405);
  console.log('PASS: Edge Function JWT validation, owner gate, input validation, account registration, and failure cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
