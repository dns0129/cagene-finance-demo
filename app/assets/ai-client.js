// Keep the original sample.json contract while model authorization stays on the server.
window.AccountingAI = (() => {
  const key = 'acct2102-ai-connection';
  let config = {base:'', token:''};
  try { config = {...config, ...JSON.parse(sessionStorage.getItem(key) || '{}')}; } catch (e) {}
  let status = {configured:false, message:'正在检查 AI 连接…'};
  const headers = () => ({'Content-Type':'application/json', 'X-Accounting-AI':'1', ...(config.token ? {Authorization:'Bearer ' + config.token} : {})});
  const failure = (code, message) => Object.assign(new Error(message), {code});
  async function request(path, options = {}) {
    if (!config.base && (location.protocol === 'file:' || location.hostname.endsWith('.github.io'))) throw failure('offline', '启动本机财报助手后，点击「连接本机 pi」，无需部署云服务器。');
    try {
      const response = await fetch(config.base + '/api/ai/' + path, {...options, headers:headers()});
      let body;
      try { body = await response.json(); } catch (e) { throw failure('offline', '当前地址没有可用的 AI 服务，请检查「AI 连接」。'); }
      if (!response.ok) throw failure(body.error?.code || 'upstream_error', body.error?.message || 'AI 服务暂时不可用。');
      return body;
    } catch (e) {
      if (options.signal?.aborted) throw failure('cancelled', '已停止请求。');
      if (e.code) throw e;
      throw failure('offline', '无法连接 AI 服务。请先双击启动财报助手；若浏览器阻止本机连接，请打开本机网页版。');
    }
  }
  return {
    get needsLocal(){ return location.hostname.endsWith('.github.io') && !config.base; },
    get status(){ return status; },
    get base(){ return config.base; },
    get token(){ return config.token; },
    save(base, token){
      base = base.trim().replace(/\/+$/, '');
      if (base) {
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw failure('invalid_request', '服务地址应是完整的 HTTP/HTTPS 地址，不包含路径、口令或查询参数。');
        if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw failure('invalid_request', '远程 AI 服务地址需要使用 HTTPS。');
        base = url.origin;
      }
      config = {base, token:token.trim()};
      try { sessionStorage.setItem(key, JSON.stringify(config)); } catch (e) {}
    },
    async refresh(){
      try { status = await request('status', {signal:AbortSignal.timeout(6000)}); }
      catch (e) { status = {configured:false, message:e.code === 'cancelled' ? '检查连接超时，请稍后刷新。' : e.message}; }
      return status;
    },
    loginStatus(){ return request('login', {signal:AbortSignal.timeout(6000)}); },
    startLogin(provider){ return request('login', {method:'POST', body:JSON.stringify(provider ? {provider} : {}), signal:AbortSignal.timeout(25000)}); },
    cancelLogin(id){ return request('login/cancel', {method:'POST', body:JSON.stringify({id}), signal:AbortSignal.timeout(6000)}); },
    async json(prompt, {signal, task = 'transaction'} = {}) {
      const body = await request('json', {method:'POST', signal, body:JSON.stringify({prompt, task})});
      if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result)) throw failure('invalid_json', 'AI 返回的内容无法识别，请再试一次。');
      return body.result;
    },
  };
})();
