const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSkill}=require('../src');
const {createAgent}=require('../src/agent');
const skillId='amzn1.ask.skill.test';
function request({type='IntentRequest',intent='AskEvollIntent',question='cuánto gasté este mes',token='user-token',id=skillId}={}) {
  return {version:'1.0',session:{new:true,sessionId:'test-session',application:{applicationId:id},user:{userId:'test-user'},attributes:{}},
    context:{System:{application:{applicationId:id},user:{userId:'test-user',...(token?{accessToken:token}:{})},device:{deviceId:'test-device',supportedInterfaces:{}}}},
    request:{type,requestId:'test-request',timestamp:new Date().toISOString(),locale:'es-ES',...(type==='IntentRequest'?{intent:{name:intent,slots:question?{question:{name:'question',value:question}}:{}}}:{})}};
}
function skill(agent) {return createSkill({skillId,agent});}
test('no token: linking card and no backend request',async()=>{
  const out=await skill(()=>{throw Error('must not call');}).invoke(request({token:null}));
  assert.equal(out.response.card.type,'LinkAccount');assert.equal(out.response.shouldEndSession,true);
});
test('launch explains usage without querying financial data',async()=>{
  const out=await skill(()=>{throw Error('must not call');}).invoke(request({type:'LaunchRequest'}));
  assert.match(out.response.outputSpeech.ssml,/Bienvenido/);
});
test('complete SDK to HTTP adapter path forwards user token and question',async()=>{
  let called=false;
  const agent=createAgent({url:'https://melhdrdiesgeotzhkazg.supabase.co',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://melhdrdiesgeotzhkazg.supabase.co/functions/v1/agent');
    assert.equal(options.headers.Authorization,'Bearer user-token');
    assert.deepEqual(JSON.parse(options.body),{message:'cuánto gasté este mes',language:'es'});
    assert.equal(options.redirect,'error');called=true;
    return Response.json({reply:'Gastaste **20.000** pesos <hoy> & ayer.',actions:[]});
  }});
  const out=await skill(agent).invoke(request());
  assert.equal(called,true);assert.match(out.response.outputSpeech.ssml,/20.000 pesos &lt;hoy&gt; &amp; ayer/);
});
test('proposed writes never claim success or expose an unpersisted proposal',async()=>{
  const out=await skill(async()=>({reply:'Guardado',pendingActions:true})).invoke(request());
  assert.match(out.response.outputSpeech.ssml,/no puede confirmarla ni guardarla/);assert.doesNotMatch(out.response.outputSpeech.ssml,/Guardado/);
});
for(const [code,expected] of [[401,'LinkAccount'],[403,'LinkAccount'],[429,'límite'],[500,'no pudo']])test(`HTTP ${code} handled`,async()=>{
  const agent=createAgent({url:'https://example.supabase.co',fetchImpl:async()=>new Response('',{status:code})});
  const out=await skill(agent).invoke(request());
  if(expected==='LinkAccount')assert.equal(out.response.card.type,expected);else assert.match(out.response.outputSpeech.ssml,new RegExp(expected));
});
test('wrong skill id cannot call Evoll',async()=>{
  let called=false;
  await skill(async()=>{called=true;return{reply:'no'};}).invoke(request({id:'wrong-skill'})).catch(()=>{});
  assert.equal(called,false);
});
test('missing question is clarified',async()=>{
  const out=await skill(()=>{throw Error('must not call');}).invoke(request({question:null}));
  assert.match(out.response.outputSpeech.ssml,/consultar/);
});
test('stop ends the session',async()=>{
  const out=await skill(()=>{}).invoke(request({intent:'AMAZON.StopIntent'}));assert.equal(out.response.shouldEndSession,true);
});
test('malformed agent output is rejected',async()=>{
  const agent=createAgent({url:'https://example.supabase.co',fetchImpl:async()=>Response.json({actions:[]})});
  await assert.rejects(agent('hola','token'),{kind:'unavailable'});
});
test('abort becomes an availability error',async()=>{
  const agent=createAgent({url:'https://example.supabase.co',timeoutMs:5,fetchImpl:async(_,o)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(Response.json({reply:'late'})),100);
    o.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(o.signal.reason);});
  })});
  await assert.rejects(agent('hola','token'),{kind:'unavailable'});
});
test('reject unsafe Supabase endpoint and missing skill id',()=>{
  assert.throws(()=>createAgent({url:'http://example.com'}));assert.throws(()=>createSkill({agent:()=>{}}));
});
