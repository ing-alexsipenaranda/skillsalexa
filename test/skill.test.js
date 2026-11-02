const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSkill}=require('../src');
const {createAgent,createActionExecutor}=require('../src/agent');
const skillId='amzn1.ask.skill.test';
function request({type='IntentRequest',intent='AskEvollIntent',question='cuánto gasté este mes',token='user-token',id=skillId,locale='es-ES',attributes={}}={}) {
  return {version:'1.0',session:{new:true,sessionId:'test-session',application:{applicationId:id},user:{userId:'test-user'},attributes},
    context:{System:{application:{applicationId:id},user:{userId:'test-user',...(token?{accessToken:token}:{})},device:{deviceId:'test-device',supportedInterfaces:{}}}},
    request:{type,requestId:'test-request',timestamp:new Date().toISOString(),locale,...(type==='IntentRequest'?{intent:{name:intent,slots:question?{question:{name:'question',value:question}}:{}}}:{})}};
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
    assert.deepEqual(JSON.parse(options.body),{message:'cuánto gasté este mes',language:'es',channel:'alexa'});
    assert.equal(options.redirect,'error');called=true;
    return Response.json({reply:'Gastaste **20.000** pesos <hoy> & ayer.',actions:[]});
  }});
  const out=await skill(agent).invoke(request());
  assert.equal(called,true);assert.match(out.response.outputSpeech.ssml,/20.000 pesos &lt;hoy&gt; &amp; ayer/);
});
test('proposed writes never claim success or expose an unpersisted proposal',async()=>{
  const out=await skill(async()=>({reply:'Guardado',pendingActions:true})).invoke(request());
  assert.match(out.response.outputSpeech.ssml,/revisar en la aplicación/);assert.doesNotMatch(out.response.outputSpeech.ssml,/Guardado/);
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
test('English locale uses English speech and agent language',async()=>{
  let language;
  const out=await skill(async(_question,_token,lang)=>{language=lang;return{reply:'You have two tasks.'};})
    .invoke(request({intent:'TasksIntent',question:null,locale:'en-US'}));
  assert.equal(language,'en');
  assert.match(out.response.outputSpeech.ssml,/two tasks/);
  assert.match(out.response.reprompt.outputSpeech.ssml,/daily summary/);
});
test('daily summary uses the dedicated prompt',async()=>{
  let question,capability;
  await skill(async(q,_token,_language,_history,feature)=>{question=q;capability=feature;return{reply:'Resumen listo.'};})
    .invoke(request({intent:'DailySummaryIntent',question:null}));
  assert.match(question,/resumen breve de hoy/);
  assert.equal(capability,'daily_summary');
});
test('private mode blocks financial speech without calling the agent',async()=>{
  const out=await skill(()=>{throw Error('must not call');})
    .invoke(request({intent:'SpendingIntent',question:null,attributes:{privateMode:true}}));
  assert.match(out.response.outputSpeech.ssml,/modo privado está activo/);
});
test('more details continues the previous question',async()=>{
  let question;
  await skill(async(q)=>{question=q;return{reply:'Más información.'};})
    .invoke(request({intent:'MoreDetailsIntent',question:null,attributes:{lastQuestion:'Cuáles son mis tareas'}}));
  assert.match(question,/Cuáles son mis tareas/);
  assert.match(question,/Amplía/);
});
test('repeat returns the previous response',async()=>{
  const out=await skill(()=>{throw Error('must not call');})
    .invoke(request({intent:'AMAZON.RepeatIntent',question:null,attributes:{lastSpeech:'Tienes tres tareas.'}}));
  assert.match(out.response.outputSpeech.ssml,/Tienes tres tareas/);
});
test('conversation history is forwarded and kept to four turns',async()=>{
  let received;
  const history=[{role:'user',content:'uno'},{role:'assistant',content:'dos'}];
  const out=await skill(async(_q,_t,_l,h)=>{received=h;return{reply:'Continuación',alexa:{privateMode:false}};})
    .invoke(request({question:'y mañana',attributes:{conversation:history}}));
  assert.deepEqual(received,history);
  assert.equal(out.sessionAttributes.conversation.length,4);
  assert.equal(out.response.card.type,'Simple');
});
test('persistent private mode omits display card and clears conversation history',async()=>{
  const out=await skill(async()=>({reply:'Respuesta privada',alexa:{privateMode:true}}))
    .invoke(request({question:'mis datos',attributes:{conversation:[{role:'user',content:'anterior'}]}}));
  assert.equal(out.response.card,undefined);
  assert.equal(out.sessionAttributes.conversation,undefined);
});
test('confirmed task executes once through the action executor',async()=>{
  let call;
  const instance=createSkill({skillId,agent:async()=>({reply:'Preparé una tarea',pendingActions:true,actions:[{type:'task',title:'Pagar factura',date:'2026-11-02'}],alexa:{allowActions:true}}),actionExecutor:async(...args)=>{call=args;return{status:'created'};}});
  const proposal=await instance.invoke(request({question:'crea una tarea'}));
  assert.match(proposal.response.outputSpeech.ssml,/Quieres guardarla/);
  assert.equal(proposal.sessionAttributes.pendingAction.type,'task');
  const confirmed=await instance.invoke(request({intent:'AMAZON.YesIntent',question:null,attributes:proposal.sessionAttributes}));
  assert.equal(call[0].title,'Pagar factura');assert.equal(call[1],'user-token');
  assert.match(confirmed.response.outputSpeech.ssml,/quedó guardada/);
  assert.equal(confirmed.sessionAttributes.pendingAction,undefined);
});
test('declining an action clears it without executing',async()=>{
  const out=await skill(()=>{throw Error('must not call');}).invoke(request({intent:'AMAZON.NoIntent',question:null,attributes:{pendingAction:{type:'task',title:'No guardar'}}}));
  assert.match(out.response.outputSpeech.ssml,/no guardé/);assert.equal(out.sessionAttributes.pendingAction,undefined);
});
test('action executor sends the idempotency key and user token',async()=>{
  const execute=createActionExecutor({url:'https://example.supabase.co',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://example.supabase.co/functions/v1/alexa-actions');
    assert.equal(options.headers.Authorization,'Bearer user-token');
    assert.deepEqual(JSON.parse(options.body),{action:{type:'task',title:'Comprar leche'},idempotencyKey:'request-12345'});
    return Response.json({status:'created',type:'task'});
  }});
  const result=await execute({type:'task',title:'Comprar leche'},'user-token','request-12345');
  assert.equal(result.status,'created');
});
test('agent metrics contain timing and status but no user content',async()=>{
  const events=[];
  const agent=createAgent({url:'https://example.supabase.co',metrics:event=>events.push(event),fetchImpl:async()=>Response.json({reply:'dato privado',actions:[]})});
  await agent('mi pregunta privada','token-secreto');
  assert.equal(events.length,1);assert.equal(events[0].status,'ok');assert.equal(typeof events[0].durationMs,'number');
  assert.doesNotMatch(JSON.stringify(events),/pregunta privada|token-secreto|dato privado/);
});
test('disabled Alexa capability returns a clear preference message',async()=>{
  const agent=createAgent({url:'https://example.supabase.co',fetchImpl:async()=>new Response(JSON.stringify({error:'disabled'}),{status:409,headers:{'content-type':'application/json'}})});
  const out=await skill(agent).invoke(request({intent:'TasksIntent',question:null}));
  assert.match(out.response.outputSpeech.ssml,/deshabilitada para Alexa/);
  assert.equal(out.response.card,undefined);
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

for(const locale of ['es-ES','es-MX','es-US','en-US']) {
  test(`${locale}: privacy clears old data and pending actions; backend must acknowledge privacy`,async()=>{
    let args;
    const instance=skill(async(...values)=>{args=values;return{reply:'sensitive backend reply',alexa:{privateMode:false}};});
    const enabled=await instance.invoke(request({locale,intent:'EnablePrivateModeIntent',attributes:{lastQuestion:'financial details',lastSpeech:'secret balance',conversation:[{role:'assistant',content:'secret'}],pendingAction:{type:'task'},pendingActionKey:'old'}}));
    for(const key of ['lastQuestion','conversation','pendingAction','pendingActionKey'])assert.equal(enabled.sessionAttributes[key],undefined);
    assert.doesNotMatch(enabled.response.outputSpeech.ssml,/secret/);
    const response=await instance.invoke(request({locale,intent:'TasksIntent',attributes:enabled.sessionAttributes}));
    assert.equal(args[5],true);
    assert.doesNotMatch(response.response.outputSpeech.ssml,/sensitive backend reply/);
    assert.equal(response.response.card,undefined);
  });
  test(`${locale}: repeat rechecks data permissions instead of speaking cached data`,async()=>{
    const instance=skill(async()=>{throw Object.assign(new Error(),{kind:'forbidden'});});
    const response=await instance.invoke(request({locale,intent:'AMAZON.RepeatIntent',attributes:{lastQuestion:'my balance',lastSpeech:'secret balance'}}));
    assert.doesNotMatch(response.response.outputSpeech.ssml,/secret balance/);
    assert.match(response.response.outputSpeech.ssml,locale.startsWith('en')?/disabled/:/deshabilitada/);
  });
  test(`${locale}: help, cancel and expired session use the correct language`,async()=>{
    const instance=skill(async()=>{throw Object.assign(new Error(),{kind:'unauthorized'});});
    const help=await instance.invoke(request({locale,intent:'AMAZON.HelpIntent'}));
    assert.match(help.response.outputSpeech.ssml,locale.startsWith('en')?/You can ask/:/Puedes preguntar/);
    const cancel=await instance.invoke(request({locale,intent:'AMAZON.CancelIntent'}));
    assert.equal(cancel.response.shouldEndSession,true);
    const expired=await instance.invoke(request({locale,attributes:{lastSpeech:'secret',pendingAction:{type:'task'}}}));
    assert.equal(expired.response.card.type,'LinkAccount');
    assert.deepEqual(expired.sessionAttributes,{});
  });
}
test('retrying yes after timeout reuses the proposal key across different request IDs',async()=>{
  const keys=[];
  const instance=createSkill({skillId,agent:async()=>({reply:'proposal',pendingActions:true,actions:[{type:'task',title:'Buy milk'}],alexa:{allowActions:true}}),actionExecutor:async(_a,_t,key)=>{keys.push(key);if(keys.length===1)throw Error('timeout');return{status:'created'};}});
  const proposal=await instance.invoke(request());
  const first=request({intent:'AMAZON.YesIntent',attributes:proposal.sessionAttributes});first.request.requestId='yes-first';
  const failed=await instance.invoke(first);
  const retry=request({intent:'AMAZON.YesIntent',attributes:failed.sessionAttributes});retry.request.requestId='yes-second';
  const success=await instance.invoke(retry);
  assert.deepEqual(keys,['test-request','test-request']);
  assert.equal(success.sessionAttributes.pendingAction,undefined);
});
test('confirmation reads the proposed title and date before saving',async()=>{
  let saves=0;
  const instance=createSkill({skillId,agent:async()=>({pendingActions:true,actions:[{type:'reminder',title:'Llamar al médico',date:'2026-12-01',time:'10:00'}],alexa:{allowActions:true}}),actionExecutor:async()=>{saves++;}});
  const proposal=await instance.invoke(request());
  assert.match(proposal.response.outputSpeech.ssml,/Llamar al médico.*2026-12-01 10:00/);
  assert.equal(saves,0);
  const cancelled=await instance.invoke(request({intent:'AMAZON.CancelIntent',attributes:proposal.sessionAttributes}));
  assert.equal(cancelled.sessionAttributes.pendingAction,undefined);
});
test('session privacy is sent to Supabase and private replies omit cards',async()=>{
  const agent=createAgent({url:'https://example.supabase.co',fetchImpl:async(_url,options)=>{
    assert.equal(JSON.parse(options.body).privateMode,true);
    return Response.json({reply:'Tasks only',alexa:{privateMode:true}});
  }});
  const out=await skill(agent).invoke(request({intent:'TasksIntent',attributes:{privateMode:true}}));
  assert.equal(out.response.card,undefined);
  assert.match(out.response.outputSpeech.ssml,/Tasks only/);
});
