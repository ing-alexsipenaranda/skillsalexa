'use strict';
const Alexa = require('ask-sdk-core');
const {createAgent} = require('./agent');
const COPY = {
  es: {
    link:'Para consultar tus datos, vincula tu cuenta de Evoll desde la tarjeta en la app Alexa.', welcome:'Bienvenido a Evoll. Puedes consultar tareas, gastos, metas, deudas y notas. También puedes pedir tu resumen diario o activar el modo privado.', reprompt:'Di, por ejemplo, cuáles son mis tareas, o dame mi resumen diario.', ask:'¿Qué quieres consultar?', help:'Puedes preguntar por tus tareas, gastos, presupuesto, metas o deudas. También puedes decir resumen diario, repite, más detalles o activa el modo privado.', privateOn:'Modo privado activado durante esta sesión. No leeré información financiera sensible.', privateOff:'Modo privado desactivado durante esta sesión.', privateBlocked:'El modo privado está activo. Desactívalo si quieres escuchar información financiera.', noRepeat:'Todavía no hay una respuesta para repetir.', noDetails:'Primero hazme una consulta y después podrás pedirme más detalles.', writeBlocked:'Evoll preparó una propuesta, pero esta skill todavía no puede confirmarla ni guardarla. Abre Evoll para revisarla.', quota:'Alcanzaste el límite de consultas de Evoll. Intenta más tarde.', unavailable:'Evoll no pudo responder a tiempo. Intenta nuevamente en un momento.', error:'No pude completar la consulta. Intenta de nuevo.', bye:'Hasta luego.', tasks:'¿Cuáles son mis tareas pendientes? Responde de forma breve y prioriza las más próximas.', spending:'¿Cuánto he gastado este mes? Resume el total y las categorías principales.', daily:'Dame un resumen breve de hoy con tareas, compromisos, metas y alertas financieras importantes.', detailSuffix:' Amplía la respuesta con detalles útiles, sin inventar datos.'
  },
  en: {
    link:'To access your data, link your Evoll account from the card in the Alexa app.', welcome:'Welcome to Evoll. You can ask about tasks, spending, goals, debts, and notes. You can also request your daily summary or enable private mode.', reprompt:'For example, say what are my tasks, or give me my daily summary.', ask:'What would you like to know?', help:'You can ask about tasks, spending, budgets, goals, or debts. You can also say daily summary, repeat, more details, or enable private mode.', privateOn:'Private mode is enabled for this session. I will not read sensitive financial information.', privateOff:'Private mode is disabled for this session.', privateBlocked:'Private mode is active. Disable it if you want to hear financial information.', noRepeat:'There is no previous response to repeat yet.', noDetails:'Ask me something first, and then you can request more details.', writeBlocked:'Evoll prepared a proposal, but this skill cannot confirm or save it yet. Open Evoll to review it.', quota:'You have reached the Evoll query limit. Try again later.', unavailable:'Evoll could not respond in time. Please try again in a moment.', error:'I could not complete that request. Please try again.', bye:'Goodbye.', tasks:'What are my pending tasks? Keep the answer brief and prioritize upcoming tasks.', spending:'How much have I spent this month? Summarize the total and main categories.', daily:'Give me a brief summary for today with tasks, appointments, goals, and important financial alerts.', detailSuffix:' Expand the answer with useful details without inventing information.'
  }
};
function language(h) { return String(h.requestEnvelope.request?.locale || '').toLowerCase().startsWith('en') ? 'en' : 'es'; }
function copy(h) { return COPY[language(h)]; }
function speechText(text) { return text.replace(/```[\s\S]*?```/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_#`]/g,'').replace(/\s+/g,' ').trim().slice(0,2200); }
function escapeXml(text) { return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
function remember(h,text,question) { const a=h.attributesManager.getSessionAttributes(); a.lastSpeech=speechText(text); if(question)a.lastQuestion=question; h.attributesManager.setSessionAttributes(a); }
function say(h,text,keepOpen=true,question,card=false) { remember(h,text,question); const clean=speechText(text); const b=h.responseBuilder.speak(`<speak>${escapeXml(clean)}</speak>`); if(card)b.withSimpleCard('Evoll',clean); return keepOpen?b.reprompt(copy(h).reprompt).getResponse():b.withShouldEndSession(true).getResponse(); }
function link(h) { return h.responseBuilder.speak(copy(h).link).withLinkAccountCard().withShouldEndSession(true).getResponse(); }
function sensitive(q) { return /gast|saldo|deuda|presupuesto|movimiento|ingreso|spend|spent|balance|debt|budget|transaction|income/i.test(q); }
function createSkill({skillId,agent,verifySkillId=true}) {
  if(verifySkillId&&!skillId)throw new Error('ALEXA_SKILL_ID is required');
  const builder=Alexa.SkillBuilders.custom(); if(skillId)builder.withSkillId(skillId);
  const askAgent=async(h,question)=>{
    const token=h.requestEnvelope.context?.System?.user?.accessToken; if(!token)return link(h);
    if(h.attributesManager.getSessionAttributes().privateMode&&sensitive(question))return say(h,copy(h).privateBlocked);
    try {
      const attributes=h.attributesManager.getSessionAttributes();
      const history=Array.isArray(attributes.conversation)?attributes.conversation:[];
      const result=await agent(question,token,language(h),history);
      if(result.pendingActions)return say(h,copy(h).writeBlocked);
      const persistentPrivate=result.alexa?.privateMode===true;
      if(!persistentPrivate) {
        attributes.conversation=[...history,{role:'user',content:question},{role:'assistant',content:speechText(result.reply)}].slice(-4);
        h.attributesManager.setSessionAttributes(attributes);
      } else {
        delete attributes.conversation;
        h.attributesManager.setSessionAttributes(attributes);
      }
      return say(h,result.reply,true,question,!persistentPrivate);
    }
    catch(e) { if(e.kind==='unauthorized')return link(h); return say(h,e.kind==='quota'?copy(h).quota:copy(h).unavailable); }
  };
  return builder.addRequestHandlers(
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='LaunchRequest',handle:h=>h.requestEnvelope.context?.System?.user?.accessToken?say(h,copy(h).welcome):link(h)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='AskEvollIntent',handle:h=>{const q=Alexa.getSlotValue(h.requestEnvelope,'question')?.trim();return q?askAgent(h,q):say(h,copy(h).ask);}},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='TasksIntent',handle:h=>askAgent(h,copy(h).tasks)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='SpendingIntent',handle:h=>askAgent(h,copy(h).spending)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='DailySummaryIntent',handle:h=>askAgent(h,copy(h).daily)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='MoreDetailsIntent',handle:h=>{const q=h.attributesManager.getSessionAttributes().lastQuestion;return q?askAgent(h,q+copy(h).detailSuffix):say(h,copy(h).noDetails);}},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='AMAZON.RepeatIntent',handle:h=>say(h,h.attributesManager.getSessionAttributes().lastSpeech||copy(h).noRepeat)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='EnablePrivateModeIntent',handle:h=>{const a=h.attributesManager.getSessionAttributes();a.privateMode=true;h.attributesManager.setSessionAttributes(a);return say(h,copy(h).privateOn);}},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='DisablePrivateModeIntent',handle:h=>{const a=h.attributesManager.getSessionAttributes();a.privateMode=false;h.attributesManager.setSessionAttributes(a);return say(h,copy(h).privateOff);}},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&Alexa.getIntentName(h.requestEnvelope)==='AMAZON.HelpIntent',handle:h=>say(h,copy(h).help)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest'&&['AMAZON.CancelIntent','AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),handle:h=>say(h,copy(h).bye,false)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='IntentRequest',handle:h=>say(h,copy(h).help)},
    {canHandle:h=>Alexa.getRequestType(h.requestEnvelope)==='SessionEndedRequest',handle:h=>h.responseBuilder.getResponse()}
  ).addErrorHandlers({canHandle:()=>true,handle:h=>say(h,copy(h).error,false)}).create();
}
let skill;
exports.handler=async event=>{skill??=createSkill({skillId:process.env.ALEXA_SKILL_ID,agent:createAgent({url:process.env.SUPABASE_URL||'https://melhdrdiesgeotzhkazg.supabase.co',provider:process.env.AGENT_PROVIDER})});return skill.invoke(event);};
exports.createSkill=createSkill; exports.speechText=speechText;
