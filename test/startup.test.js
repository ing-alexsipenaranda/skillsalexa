const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomBytes}=require('node:crypto');
const http=require('node:http');
test('standalone service starts with private config and serves health and linking page',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'evoll-startup-'));
  const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['broker/server.js'],{cwd:join(__dirname,'..'),env:{...process.env,BROKER_ORIGIN:'https://link.example.com',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',OAUTH_CLIENT_ID:'test-client',OAUTH_CLIENT_SECRET:randomBytes(32).toString('base64url'),TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64'),ALEXA_REDIRECT_URIS:'https://alexa.amazon.com/api/skill/link/test',BROKER_DB:join(dir,'test.sqlite'),BIND_HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('startup timed out')),10000);
      child.once('exit',()=>{clearTimeout(timer);reject(Error('startup failed'));});
      child.stdout.once('data',()=>{clearTimeout(timer);resolve();});
    });
    const base=`http://127.0.0.1:${port}`;
    const res=await fetch(base+'/health');assert.equal(res.status,200);assert.deepEqual(await res.json(),{status:'ok'});
    const page=await fetch(base+'/login.html');assert.equal(page.status,200);assert.match(await page.text(),/Vincular Evoll con Alexa/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await fetch(base+'/session')).status,400);
  }finally{
    child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));rmSync(dir,{recursive:true,force:true});
  }
});
