'use strict';
const http = require('node:http');
const {randomBytes,createHmac,timingSafeEqual} = require('node:crypto');
const {readFileSync,mkdirSync,chmodSync} = require('node:fs');
const {join,dirname} = require('node:path');
const {Store,digest} = require('./store');
const {createClient} = require('@supabase/supabase-js');
const random = () => randomBytes(32).toString('base64url');
const equal = (a,b) => timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
function configFromEnv(env=process.env) {
  const required = ['BROKER_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','OAUTH_CLIENT_ID','OAUTH_CLIENT_SECRET','TOKEN_ENCRYPTION_KEY','ALEXA_REDIRECT_URIS','BROKER_DB'];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
  const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY,'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must encode 32 bytes');
  if (env.OAUTH_CLIENT_SECRET.length < 32) throw new Error('OAUTH_CLIENT_SECRET must contain at least 32 characters');
  function origin(value) {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Expected HTTPS origin');
    return u.origin;
  }
  const redirects = env.ALEXA_REDIRECT_URIS.split(',').map(s => s.trim());
  for (const value of redirects) {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('Invalid redirect URI');
  }
  return {origin:origin(env.BROKER_ORIGIN),supabaseUrl:origin(env.SUPABASE_URL),publicKey:env.SUPABASE_PUBLISHABLE_KEY,clientId:env.OAUTH_CLIENT_ID,clientSecret:env.OAUTH_CLIENT_SECRET,key,redirects,db:env.BROKER_DB};
}
function createBroker(config,{store,fetchImpl=fetch,staticDir=join(__dirname,'../dist/linking')}={}) {
  if (!store) {
    mkdirSync(dirname(config.db),{recursive:true,mode:0o700});
    store = new Store(config.db,config.key);
    chmodSync(config.db,0o600);
  }
  const locks = new Set();
  const cookieName='__Host-evoll-link';
  const csrfFor = id => createHmac('sha256',config.key).update(`csrf:${id}`).digest('base64url');
  function session(req) {
    const cookie = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`));
    const id = cookie?.slice(cookieName.length+1);
    if (!id || !/^[\w-]{43}$/.test(id)) return null;
    const item = store.get('transaction',id);
    return item ? {id,...item.value} : null;
  }
  function headers(res) {
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Strict-Transport-Security','max-age=31536000');
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; connect-src 'self' ${config.supabaseUrl}; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  }
  function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
  function redirect(res,url) {res.writeHead(302,{Location:url});res.end();}
  async function body(req) {
    let data=''; for await (const chunk of req) {
      data+=chunk.toString(); if (Buffer.byteLength(data)>16384) throw new Error('body_too_large');
    }
    return data;
  }
  async function refresh(refreshToken) {
    // New client per call: no shared user sessions or persisted tokens.
    const client = createClient(config.supabaseUrl,config.publicKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:(url,options) => fetchImpl(url,{...options,signal:AbortSignal.timeout(10000),redirect:'error'})}
    });
    const {data,error} = await client.auth.refreshSession({refresh_token:refreshToken});
    if (error || !data.session?.access_token || !data.session?.refresh_token || !data.user?.id) throw new Error('invalid_session');
    return {access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at,user_id:data.user.id};
  }
  function tokens(data,refreshToken) {
    return {access_token:data.access_token,refresh_token:refreshToken,token_type:'Bearer',expires_in:Math.max(1,Math.floor(data.expires_at-Date.now()/1000)),scope:'evoll'};
  }
  function clearCookie(res) {res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
  const handler = async (req,res) => {
    headers(res);
    try {
      store.clean();
      const url = new URL(req.url,config.origin);
      if (req.method==='GET' && url.pathname==='/authorize') {
        const p=url.searchParams;
        if (p.get('client_id')!==config.clientId || !config.redirects.includes(p.get('redirect_uri')) || p.get('response_type')!=='code' || !p.get('state') || p.get('state').length>2048 || (p.get('scope') && p.get('scope')!=='evoll')) return json(res,400,{error:'invalid_request'});
        const id=random();
        store.put('transaction',id,{redirect:p.get('redirect_uri'),state:p.get('state')},Date.now()+600000);
        res.setHeader('Set-Cookie',`${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
        return redirect(res,'/login.html');
      }
      if (req.method==='GET' && url.pathname==='/session') {
        const s=session(req); if (!s) return json(res,400,{error:'expired_request'});
        return json(res,200,{csrf:csrfFor(s.id),supabaseUrl:config.supabaseUrl,publicKey:config.publicKey});
      }
      if (req.method==='POST' && ['/approve','/deny'].includes(url.pathname)) {
        const s=session(req);
        if (!s || req.headers.origin!==config.origin || req.headers['content-type']?.split(';')[0]!=='application/json' || !equal(req.headers['x-csrf-token'] || '',csrfFor(s.id))) return json(res,403,{error:'invalid_request'});
        const target=new URL(s.redirect);target.searchParams.set('state',s.state);
        if (url.pathname==='/deny') {
          store.remove('transaction',s.id);clearCookie(res);
          target.searchParams.set('error','access_denied');return json(res,200,{redirect:target.href});
        }
        if (locks.has(s.id)) return json(res,409,{error:'request_in_progress'});
        locks.add(s.id);
        try {
          const input=JSON.parse(await body(req));
          if (typeof input.refresh_token!=='string' || !input.refresh_token) return json(res,400,{error:'invalid_session'});
          const data=await refresh(input.refresh_token);
          // Consume only after Supabase validates the session. Never trust a submitted user id.
          if (!store.get('transaction',s.id,true)) return json(res,400,{error:'expired_request'});
          const code=random();store.put('code',code,{...data,redirect:s.redirect},Date.now()+60000);
          clearCookie(res);target.searchParams.set('code',code);
          return json(res,200,{redirect:target.href});
        } finally {locks.delete(s.id);}
      }
      if (req.method==='POST' && url.pathname==='/token') {
        if (req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded') return json(res,400,{error:'invalid_request'});
        const auth=req.headers.authorization || '';
        if (!auth.startsWith('Basic ')) {res.setHeader('WWW-Authenticate','Basic');return json(res,401,{error:'invalid_client'});}
        const raw=Buffer.from(auth.slice(6),'base64').toString(), sep=raw.indexOf(':');
        if (sep<0 || !equal(raw.slice(0,sep),config.clientId) || !equal(raw.slice(sep+1),config.clientSecret)) return json(res,401,{error:'invalid_client'});
        const p=new URLSearchParams(await body(req));
        if (p.get('grant_type')==='authorization_code') {
          const code=p.get('code') || '', item=store.get('code',code);
          if (!item || p.get('redirect_uri')!==item.value.redirect) return json(res,400,{error:'invalid_grant'});
          store.remove('code',code);
          const r=random();store.put('refresh',r,item.value,Date.now()+90*86400000);
          return json(res,200,tokens(item.value,r));
        }
        if (p.get('grant_type')==='refresh_token') {
          const r=p.get('refresh_token') || '', item=store.get('refresh',r);
          if (!item || locks.has(r)) return json(res,400,{error:'invalid_grant'});
          locks.add(r);
          try {
            const data=await refresh(item.value.refresh_token);
            if (data.user_id!==item.value.user_id) {store.remove('refresh',r);return json(res,400,{error:'invalid_grant'});}
            store.put('refresh',r,data,item.expires);
            return json(res,200,tokens(data,r));
          } catch {return json(res,400,{error:'invalid_grant'});} finally {locks.delete(r);}
        }
        return json(res,400,{error:'unsupported_grant_type'});
      }
      if (req.method==='GET' && ['/login.html','/app.js'].includes(url.pathname)) {
        const name=url.pathname==='/login.html' ? 'index.html' : 'app.js';
        const data=readFileSync(join(staticDir,name));
        res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});return res.end(data);
      }
      if (req.method==='GET' && url.pathname==='/health') return json(res,200,{status:'ok'});
      return json(res,404,{error:'not_found'});
    } catch {return json(res,400,{error:'request_failed'});}
  };
  return {handler,store};
}
if (require.main===module) {
  const {handler}=createBroker(configFromEnv());
  const server=http.createServer(handler);
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT || 3000),process.env.BIND_HOST || '127.0.0.1',()=>console.log('Evoll account-linking service started'));
}
module.exports={createBroker,configFromEnv};
