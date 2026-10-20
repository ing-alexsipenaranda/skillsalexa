const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {Store,digest}=require('../broker/store');
const {createBroker,configFromEnv}=require('../broker/server');
const key=randomBytes(32);
const config={origin:'https://link.example.com',supabaseUrl:'https://example.supabase.co',publicKey:'public-test-key',clientId:'evoll-alexa',clientSecret:'test-secret-that-is-over-32-characters',key,redirects:['https://alexa.amazon.com/api/skill/link/test'],db:':memory:'};
function jwt(user='user-a') {return ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'signature'].join('.');}
function authResult(user='user-a') {return {access_token:jwt(user),refresh_token:'refreshed-supabase-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',role:'authenticated'}};}
async function fixture(t,{fetchImpl=async()=>Response.json(authResult())}={}) {
  const store=new Store(':memory:',key);
  const {handler}=createBroker(config,{store,fetchImpl});
  const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  return {store,call:(path,options={})=>fetch(base+path,{...options,redirect:'manual'})};
}
async function begin(f) {
  const p=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.redirects[0],state:'unchanged-amazon-state',scope:'evoll'});
  const res=await f.call('/authorize?'+p);assert.equal(res.status,302);
  assert.match(res.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  const session=await (await f.call('/session',{headers:{cookie}})).json();
  return {cookie,csrf:session.csrf};
}
function approvalHeaders(s) {return{cookie:s.cookie,origin:config.origin,'Content-Type':'application/json','X-CSRF-Token':s.csrf};}
async function approve(f,s) {
  const res=await f.call('/approve',{method:'POST',headers:approvalHeaders(s),body:JSON.stringify({refresh_token:'browser-supabase-refresh'})});
  assert.equal(res.status,200);return new URL((await res.json()).redirect);
}
async function token(f,params,secret=config.clientSecret) {
  return f.call('/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${config.clientId}:${secret}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
}
test('full linking, code exchange, token refresh, single-use and encrypted persistence',async t=>{
  const f=await fixture(t), s=await begin(f), redirect=await approve(f,s);
  assert.equal(redirect.origin,'https://alexa.amazon.com');assert.equal(redirect.searchParams.get('state'),'unchanged-amazon-state');
  const code=redirect.searchParams.get('code');
  const params={grant_type:'authorization_code',code,redirect_uri:config.redirects[0]};
  const res=await token(f,params);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
  const data=await res.json();assert.equal(data.access_token,jwt());assert.ok(data.expires_in>3500);assert.notEqual(data.refresh_token,'refreshed-supabase-token');
  const rows=f.store.db.prepare('SELECT id,payload FROM items').all();
  assert.ok(rows.length);assert.ok(rows.every(r=>!r.payload.includes('supabase-token') && !r.payload.includes('user-a') && r.id!==data.refresh_token));
  assert.equal((await token(f,params)).status,400);
  const refreshed=await token(f,{grant_type:'refresh_token',refresh_token:data.refresh_token});assert.equal(refreshed.status,200);
  assert.equal((await refreshed.json()).access_token,jwt());
});
test('unregistered callback rejected without redirect',async t=>{
  const f=await fixture(t);
  const res=await f.call('/authorize?'+new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:'https://attacker.example/',state:'state'}));
  assert.equal(res.status,400);assert.equal(res.headers.get('location'),null);
});
test('CSRF and cross-origin requests rejected',async t=>{
  const f=await fixture(t),s=await begin(f);
  for (const extra of [{'X-CSRF-Token':'wrong'},{origin:'https://attacker.example'}]) {
    const res=await f.call('/approve',{method:'POST',headers:{...approvalHeaders(s),...extra},body:'{}'});assert.equal(res.status,403);
  }
});
test('deny preserves state and never issues a code',async t=>{
  const f=await fixture(t),s=await begin(f);
  const res=await f.call('/deny',{method:'POST',headers:approvalHeaders(s),body:'{}'});
  const target=new URL((await res.json()).redirect);assert.equal(target.searchParams.get('error'),'access_denied');assert.equal(target.searchParams.get('state'),'unchanged-amazon-state');assert.equal(target.searchParams.get('code'),null);
  assert.equal((await f.call('/session',{headers:{cookie:s.cookie}})).status,400);
});
test('wrong OAuth client secret cannot exchange a code',async t=>{
  const f=await fixture(t),s=await begin(f),redirect=await approve(f,s);
  const res=await token(f,{grant_type:'authorization_code',code:redirect.searchParams.get('code'),redirect_uri:config.redirects[0]},'wrong');assert.equal(res.status,401);
});
test('wrong callback cannot consume another authorization code',async t=>{
  const f=await fixture(t),s=await begin(f),redirect=await approve(f,s),code=redirect.searchParams.get('code');
  assert.equal((await token(f,{grant_type:'authorization_code',code,redirect_uri:'https://attacker.example'})).status,400);
  assert.equal((await token(f,{grant_type:'authorization_code',code,redirect_uri:config.redirects[0]})).status,200);
});
test('invalid Supabase session cannot authorize Alexa',async t=>{
  const f=await fixture(t,{fetchImpl:async()=>Response.json({error:'invalid_grant',error_description:'invalid refresh token'},{status:400})}),s=await begin(f);
  const res=await f.call('/approve',{method:'POST',headers:approvalHeaders(s),body:JSON.stringify({refresh_token:'invalid'})});
  assert.equal(res.status,400);assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM items WHERE kind='code'").get().n,0);
});
test('tokens are isolated by user and refresh cannot change identity',async t=>{
  const f=await fixture(t,{fetchImpl:async()=>Response.json(authResult('other-user'))});
  f.store.put('refresh','broker-token',{refresh_token:'supabase-token',user_id:'user-a'},Date.now()+60000);
  assert.equal((await token(f,{grant_type:'refresh_token',refresh_token:'broker-token'})).status,400);
  assert.equal(f.store.get('refresh','broker-token'),null);
});
test('expired records cannot be used and ciphertext detects tampering',()=>{
  const s=new Store(':memory:',key);
  try {
    s.put('code','expired',{secret:'secret'},Date.now()-1);assert.equal(s.get('code','expired'),null);
    s.put('code','valid',{secret:'secret'},Date.now()+60000);
    const row=s.db.prepare('SELECT payload FROM items WHERE id=?').get(digest('valid'));
    const bytes=Buffer.from(row.payload,'base64');bytes[15]^=1;
    s.db.prepare('UPDATE items SET payload=? WHERE id=?').run(bytes.toString('base64'),digest('valid'));
    assert.throws(()=>s.get('code','valid'));
  }finally{s.close();}
});
test('deployment config requires HTTPS and an encryption key',()=>{
  assert.throws(()=>configFromEnv({}),/Missing/);
  const env={BROKER_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:'public',OAUTH_CLIENT_ID:config.clientId,OAUTH_CLIENT_SECRET:config.clientSecret,TOKEN_ENCRYPTION_KEY:key.toString('base64'),ALEXA_REDIRECT_URIS:config.redirects[0],BROKER_DB:':memory:'};
  assert.equal(configFromEnv(env).origin,config.origin);
  assert.throws(()=>configFromEnv({...env,BROKER_ORIGIN:'http://example.com'}),/HTTPS/);
});
