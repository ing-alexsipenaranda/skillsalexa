'use strict';
const Alexa = require('ask-sdk-core');
const {createAgent} = require('./agent');
function speechText(text) {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 2200);
}
function escapeXml(text) {
  return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
function say(h, text, keepOpen = true) {
  const b = h.responseBuilder.speak(`<speak>${escapeXml(speechText(text))}</speak>`);
  return keepOpen ? b.reprompt('Di, por ejemplo, pregunta cuánto gasté este mes.').getResponse() : b.withShouldEndSession(true).getResponse();
}
function link(h) {
  return h.responseBuilder.speak('Para consultar tus datos, vincula tu cuenta de Evoll desde la tarjeta en la app Alexa.')
    .withLinkAccountCard().withShouldEndSession(true).getResponse();
}
function createSkill({skillId, agent, verifySkillId = true}) {
  if (verifySkillId && !skillId) throw new Error('ALEXA_SKILL_ID is required');
  const builder = Alexa.SkillBuilders.custom();
  if (skillId) builder.withSkillId(skillId);
  return builder.addRequestHandlers(
    {canHandle:h => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest', handle:h => {
      if (!h.requestEnvelope.context?.System?.user?.accessToken) return link(h);
      return say(h, 'Bienvenido a Evoll. Puedes consultar gastos, metas, deudas, tareas y notas. Di pregunta, seguido de tu consulta.');
    }},
    {canHandle:h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === 'AskEvollIntent', handle:async h => {
      const token = h.requestEnvelope.context?.System?.user?.accessToken;
      if (!token) return link(h);
      const question = Alexa.getSlotValue(h.requestEnvelope, 'question')?.trim();
      if (!question) return say(h, '¿Qué quieres consultar? Di pregunta, seguido de tu consulta.');
      try {
        const result = await agent(question, token);
        // Proposed actions are not persisted by the agent and this skill never executes them.
        if (result.pendingActions) return say(h, 'Evoll preparó una propuesta, pero esta skill todavía no puede confirmarla ni guardarla. Abre Evoll y vuelve a solicitarla allí para confirmarla.');
        return say(h, result.reply);
      } catch (e) {
        if (e.kind === 'unauthorized') return link(h);
        return say(h, e.kind === 'quota' ? 'Alcanzaste el límite de consultas de Evoll. Intenta más tarde.' : 'Evoll no pudo responder a tiempo. Intenta nuevamente en un momento.');
      }
    }},
    {canHandle:h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && ['AMAZON.CancelIntent','AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope)), handle:h => say(h,'Hasta luego.',false)},
    {canHandle:h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest', handle:h => say(h,'Di, por ejemplo, pregunta cuánto gasté este mes, o pregunta cuáles son mis tareas pendientes.')},
    {canHandle:h => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest', handle:h => h.responseBuilder.getResponse()}
  ).addErrorHandlers({canHandle:() => true, handle:h => say(h,'No pude completar la consulta. Intenta de nuevo.',false)}).create();
}
let skill;
exports.handler = async event => {
  skill ??= createSkill({skillId:process.env.ALEXA_SKILL_ID, agent:createAgent({
    url:process.env.SUPABASE_URL || 'https://melhdrdiesgeotzhkazg.supabase.co', provider:process.env.AGENT_PROVIDER
  })});
  return skill.invoke(event);
};
exports.createSkill = createSkill;
exports.speechText = speechText;
