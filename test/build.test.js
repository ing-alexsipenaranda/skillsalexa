const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
test('bundled Lambda executes an authenticated agent request',async()=>{
  const originalFetch=global.fetch, originalId=process.env.ALEXA_SKILL_ID;
  process.env.ALEXA_SKILL_ID='amzn1.ask.skill.built';
  global.fetch=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer linked-token');
    return Response.json({reply:'Tienes tres tareas pendientes.',actions:[]});
  };
  try {
    const {handler}=require('../dist/lambda');
    const out=await handler({version:'1.0',session:{new:true,sessionId:'session',application:{applicationId:process.env.ALEXA_SKILL_ID},user:{userId:'user'}},context:{System:{application:{applicationId:process.env.ALEXA_SKILL_ID},user:{userId:'user',accessToken:'linked-token'},device:{deviceId:'device',supportedInterfaces:{}}}},request:{type:'IntentRequest',requestId:'request',timestamp:new Date().toISOString(),locale:'es-MX',intent:{name:'AskEvollIntent',slots:{question:{name:'question',value:'cuáles son mis tareas'}}}}});
    assert.match(out.response.outputSpeech.ssml,/tres tareas/);
  }finally{global.fetch=originalFetch;if(originalId===undefined)delete process.env.ALEXA_SKILL_ID;else process.env.ALEXA_SKILL_ID=originalId;}
});
test('Alexa-hosted bundle runs without ALEXA_SKILL_ID',async()=>{
  const originalFetch=global.fetch, originalId=process.env.ALEXA_SKILL_ID;
  delete process.env.ALEXA_SKILL_ID;
  global.fetch=async()=>Response.json({reply:'Respuesta desde Evoll.',actions:[]});
  try {
    const {handler}=require('../dist/alexa-hosted/lambda');
    const id='amzn1.ask.skill.hosted-test';
    const out=await handler({version:'1.0',session:{new:true,sessionId:'session',application:{applicationId:id},user:{userId:'user'}},context:{System:{application:{applicationId:id},user:{userId:'user',accessToken:'linked-token'},device:{deviceId:'device',supportedInterfaces:{}}}},request:{type:'IntentRequest',requestId:'request',timestamp:new Date().toISOString(),locale:'es-ES',intent:{name:'AskEvollIntent',slots:{question:{name:'question',value:'qué tareas tengo'}}}}});
    assert.match(out.response.outputSpeech.ssml,/Respuesta desde Evoll/);
  }finally{
    global.fetch=originalFetch;
    if(originalId===undefined)delete process.env.ALEXA_SKILL_ID;else process.env.ALEXA_SKILL_ID=originalId;
  }
});
test('built linking page signs in directly to Supabase and sends only refresh token to broker',async()=>{
  const nodes={};for(const name of ['status','details','login','consent','email','password','approve','deny'])nodes[name]={hidden:true,textContent:'',value:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const requests=[],redirects=[];
  const payload=Buffer.from(JSON.stringify({sub:'user-a',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const browserFetch=async(input,options={})=>{
    const url=String(input);requests.push({url,options});
    if(url==='/session')return Response.json({csrf:'csrf-test',supabaseUrl:'https://example.supabase.co',publicKey:'public-test-key'});
    if(url==='https://example.supabase.co/auth/v1/token?grant_type=password')return Response.json({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.signature`,refresh_token:'browser-refresh',token_type:'bearer',expires_in:3600,user:{id:'user-a',aud:'authenticated',role:'authenticated'}});
    if(url==='/approve')return Response.json({redirect:'https://alexa.amazon.com/api/skill/link/test?code=code'});
    throw Error('unexpected URL: '+url);
  };
  const context={document:{getElementById:id=>nodes[id]},location:{replace:url=>redirects.push(url)},fetch:browserFetch,URL,URLSearchParams,Headers,Request,Response,AbortController,AbortSignal,TextEncoder,TextDecoder,crypto:webcrypto,console,setTimeout,clearTimeout,setInterval,clearInterval,atob,btoa,Blob,WebSocket:class{},navigator:{}};
  context.window=context;
  vm.runInNewContext(readFileSync('dist/linking/app.js','utf8'),context);
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(nodes.login.hidden,false);
  nodes.email.value='test@example.com';nodes.password.value='local-test-password';
  await nodes.login.listeners.submit({preventDefault(){}});
  assert.equal(nodes.password.value,'');assert.equal(nodes.consent.hidden,false);
  await nodes.approve.listeners.click();
  assert.equal(redirects.length,1);
  const authRequest=requests.find(r=>r.url.includes('grant_type=password'));
  assert.equal(JSON.parse(authRequest.options.body).password,'local-test-password');
  const brokerRequest=requests.find(r=>r.url==='/approve');
  assert.deepEqual(JSON.parse(brokerRequest.options.body),{refresh_token:'browser-refresh'});
  assert.equal(brokerRequest.options.headers['X-CSRF-Token'],'csrf-test');
});
