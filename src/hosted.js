'use strict';
const {createSkill} = require('./index');
const {createAgent} = require('./agent');
const hostedFetch = globalThis.fetch || require('node-fetch');

// Alexa-hosted invokes this Lambda only through the managed skill endpoint.
// Unlike a self-managed Lambda, its editor does not provide ALEXA_SKILL_ID.
const skill = createSkill({
  verifySkillId: false,
  agent: createAgent({url: 'https://melhdrdiesgeotzhkazg.supabase.co', fetchImpl: hostedFetch}),
});

exports.handler = event => skill.invoke(event);
