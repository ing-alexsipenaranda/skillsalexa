'use strict';
class AgentError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}
function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SUPABASE_URL must be an HTTPS origin');
  }
  return url.origin;
}
function createAgent({url, provider, fetchImpl = globalThis.fetch, timeoutMs = 5500, metrics = ()=>{}}) {
  const origin = validateUrl(url);
  if (provider && !['openai', 'anthropic'].includes(provider)) throw new Error('Invalid AGENT_PROVIDER');
  return async (message, token, language = 'es', history = []) => {
    const started=Date.now();
    const record=status=>metrics({event:'evoll_agent_request',status,durationMs:Date.now()-started});
    if (!token) throw new AgentError('unauthorized');
    let res;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetchImpl(`${origin}/functions/v1/agent`, {
        method:'POST', redirect:'error', signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
        body:JSON.stringify({message, language:language === 'en' ? 'en' : 'es', channel:'alexa',
          ...(Array.isArray(history) && history.length ? {history:history.slice(-4)} : {}),
          ...(provider ? {provider} : {})})
      });
    } catch { record('network_error');throw new AgentError('unavailable'); }
    finally { clearTimeout(timeout); }
    if (res.status === 401 || res.status === 403) {record('unauthorized');throw new AgentError('unauthorized');}
    if (res.status === 429) {record('quota');throw new AgentError('quota');}
    if (!res.ok) {record('upstream_error');throw new AgentError('unavailable');}
    let data;
    try { data = await res.json(); } catch {record('invalid_response');throw new AgentError('unavailable');}
    if (typeof data.reply !== 'string' || !data.reply.trim()) {record('invalid_response');throw new AgentError('unavailable');}
    const actions=Array.isArray(data.actions)?data.actions.filter(action=>action&&['task','reminder'].includes(action.type)).slice(0,2):[];
    record('ok');return {
      reply:data.reply,
      pendingActions:Array.isArray(data.actions) ? data.actions.length > 0 : Boolean(data.action),
      actions,
      alexa:data.alexa && typeof data.alexa === 'object' ? {
        privateMode:data.alexa.privateMode === true,
        dailySummary:data.alexa.dailySummary !== false,
        allowActions:data.alexa.allowActions === true,
      } : null,
    };
  };
}
function createActionExecutor({url,fetchImpl=globalThis.fetch,timeoutMs=5500,metrics=()=>{}}) {
  const origin=validateUrl(url);
  return async(action,token,idempotencyKey)=>{
    const started=Date.now();const record=status=>metrics({event:'evoll_alexa_action',status,durationMs:Date.now()-started,actionType:action?.type||'invalid'});
    if(!token)throw new AgentError('unauthorized');
    if(!action||!['task','reminder'].includes(action.type))throw new AgentError('invalid');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
    let res;
    try { res=await fetchImpl(`${origin}/functions/v1/alexa-actions`,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,idempotencyKey})}); }
    catch {record('network_error');throw new AgentError('unavailable');}
    finally { clearTimeout(timeout); }
    if(res.status===401){record('unauthorized');throw new AgentError('unauthorized');}
    if(res.status===403){record('forbidden');throw new AgentError('forbidden');}
    if(!res.ok){record('upstream_error');throw new AgentError('unavailable');}
    record('ok');return res.json();
  };
}
module.exports = {createAgent,createActionExecutor,AgentError};
