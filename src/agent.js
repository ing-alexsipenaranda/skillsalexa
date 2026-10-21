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
function createAgent({url, provider, fetchImpl = globalThis.fetch, timeoutMs = 5500}) {
  const origin = validateUrl(url);
  if (provider && !['openai', 'anthropic'].includes(provider)) throw new Error('Invalid AGENT_PROVIDER');
  return async (message, token) => {
    if (!token) throw new AgentError('unauthorized');
    let res;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetchImpl(`${origin}/functions/v1/agent`, {
        method:'POST', redirect:'error', signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
        body:JSON.stringify({message, language:'es', ...(provider ? {provider} : {})})
      });
    } catch { throw new AgentError('unavailable'); }
    finally { clearTimeout(timeout); }
    if (res.status === 401 || res.status === 403) throw new AgentError('unauthorized');
    if (res.status === 429) throw new AgentError('quota');
    if (!res.ok) throw new AgentError('unavailable');
    let data;
    try { data = await res.json(); } catch { throw new AgentError('unavailable'); }
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new AgentError('unavailable');
    return {reply:data.reply, pendingActions:Array.isArray(data.actions) ? data.actions.length > 0 : Boolean(data.action)};
  };
}
module.exports = {createAgent, AgentError};
