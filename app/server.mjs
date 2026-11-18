import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIError, createPiBackend, TASKS } from './ai-service.mjs';
import { createWebLogin } from './web-login.mjs';
import { createWorkspace } from './workspace-store.mjs';
import { createDemoWorkspaces } from './demo-workspace.mjs';

// Deliberate allowlist: never expose the project directory or credential files.
const publicFiles = new Map([
  ['/', ['index.html','text/html']], ['/index.html', ['index.html','text/html']],
  ...['base.css','workspace.css','console.css','opencc-cn2t.js','locale.js','ai-client.js','personal-space.js','report-editor.js','enterprise.js','bank-reconciliation.js','bank-workspace.js','membership.js','business-workflows.js','sales-invoices.js','company.js','inventory.js','fixed-assets.js','chart.js','ledger-guide.js','payroll.js','payroll.css','tutorial-content.js','tutorial.js','tutorial.css','training-content.js','training.js','training.css','app.js'].map(name => ['/assets/'+name, ['assets/'+name,name.endsWith('.css') ? 'text/css' : 'text/javascript']]),
]);

function sameToken(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readJSON(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) throw new AIError('invalid_request', '请求内容过长。', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AIError('invalid_request', '请求必须是 JSON。', 400); }
}

export function createApp({
  backend = createPiBackend(), token = process.env.AI_GATEWAY_TOKEN || '',
  deepseekBackend = createPiBackend({deepseek:true}),
  login = createWebLogin(),
  appOrigin = process.env.APP_ORIGIN || '', timeoutMs = 150000, workspace = null,
} = {}) {
  let busy = false;
  const demos=workspace?createDemoWorkspaces(workspace.publicOrigin):null;
  const allowedOrigin = appOrigin ? new URL(appOrigin).origin : '';
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const send = (status, value) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    try {
      const ownOrigin = `http://${req.headers.host}`;
      const url = new URL(req.url, ownOrigin);
      const isAPI = url.pathname.startsWith('/api/');
      if (!isAPI) {
        if (['GET','HEAD'].includes(req.method) && url.pathname === '/practice.html') {
          res.writeHead(308, {Location:'./index.html#reports'}); res.end();
        } else if (req.method === 'GET' && publicFiles.has(url.pathname)) {
          const [file,mime] = publicFiles.get(url.pathname);
          let content = await readFile(new URL('./'+file, import.meta.url));
          if (file==='index.html' && workspace) {
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
            const demoMode=url.searchParams.get('demo')==='1';
            content=content.toString().replace('<body>', `<body data-account-workspace="required"${demoMode?' data-demo-workspace':''}>`);
          }
          res.writeHead(200, { 'Content-Type': mime+'; charset=utf-8' });
          res.end(content);
        } else if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); }
        else send(404, { error: { code: 'not_found', message: '未找到此页面。' } });
        return;
      }

      if(url.pathname.startsWith('/api/demo/')&&demos){
        await demos.handle(req,res,url,send,readJSON);
        return;
      }
      if (url.pathname.startsWith('/api/workspace/')) {
        if (workspace) await workspace.handle(req,res,url,send);
        else send(404,{error:{code:'not_found',message:'个人空间服务未开启。'}});
        return;
      }

      const origin = req.headers.origin;
      const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!token && !localHost && url.origin !== allowedOrigin) {
        throw new AIError('forbidden', '访问地址未获授权。', 403);
      }
      if (origin && origin !== ownOrigin && origin !== allowedOrigin) {
        throw new AIError('forbidden', '此网页未获准访问 AI 服务。', 403);
      }
      if (origin === allowedOrigin && allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        if (origin === allowedOrigin && allowedOrigin && req.headers['access-control-request-private-network'] === 'true') {
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Accounting-AI');
        res.writeHead(204); res.end(); return;
      }
      if (token && !sameToken(req.headers.authorization || '', `Bearer ${token}`)) {
        throw new AIError('gateway_auth', '请输入正确的 AI 连接口令。', 401);
      }
      if (req.method === 'GET' && url.pathname === '/api/ai/status') {
        send(200, await backend.status()); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/ai/deepseek/status') {
        send(200, await deepseekBackend.status()); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/ai/login') {
        send(200, login.status()); return;
      }
      if (req.method !== 'POST' || !['/api/ai/json', '/api/ai/deepseek/json', '/api/ai/login', '/api/ai/login/cancel'].includes(url.pathname)) {
        send(404, { error: { code: 'not_found', message: '未找到此接口。' } }); return;
      }
      if (req.headers['x-accounting-ai'] !== '1' || !/^application\/json\b/i.test(req.headers['content-type'] || '')) {
        throw new AIError('invalid_request', '请通过本页 AI 功能发送请求。', 400);
      }
      const body = await readJSON(req);
      if (url.pathname === '/api/ai/login') { send(200, await login.start(body?.provider)); return; }
      if (url.pathname === '/api/ai/login/cancel') { send(200, login.cancel(body?.id)); return; }
      // A month of bank rows and vouchers is longer than one transaction description.
      const limit = body?.task === 'reconcile' ? 120000 : 50000;
      if (typeof body?.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > limit || !TASKS.includes(body.task)) {
        throw new AIError('invalid_request', 'AI 请求内容或任务类型不正确。', 400);
      }
      if (busy) throw new AIError('rate_limited', '已有一个 AI 请求正在处理，请稍后再试。', 429);
      busy = true;
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(new AIError('cancelled', '已停止请求。', 499)); };
      res.on('close', disconnected);
      const timer = setTimeout(() => controller.abort(new AIError('timeout', 'AI 请求超时，请稍后再试。', 504)), timeoutMs);
      timer.unref();
      try {
        const channel = url.pathname === '/api/ai/deepseek/json' ? deepseekBackend : backend;
        const result = await channel.sample(body.prompt, { signal: controller.signal, task: body.task });
        controller.signal.throwIfAborted();
        send(200, { result });
      } catch (error) {
        throw controller.signal.aborted ? controller.signal.reason : error;
      } finally {
        clearTimeout(timer); res.off('close', disconnected); busy = false;
      }
    } catch (error) {
      const known = error instanceof AIError;
      send(known ? error.status : 500, { error: {
        code: known ? error.code : 'server_error',
        message: known ? error.message : 'AI 服务暂时不可用，请检查云端配置。',
      } });
    }
  });
  server.on('close', () => { login.close(); demos?.close(); workspace?.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8800);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.AI_GATEWAY_TOKEN) {
    throw new Error('对外监听时必须设置 AI_GATEWAY_TOKEN；请在 HTTPS 反向代理后运行。');
  }
  const publicOrigin=process.env.ACCOUNT_PUBLIC_ORIGIN || '';
  if (!['127.0.0.1','localhost','::1'].includes(host) && !publicOrigin) throw new Error('对外监听时必须设置 ACCOUNT_PUBLIC_ORIGIN，并通过 HTTPS 反向代理访问。');
  const workspace=createWorkspace({
    file:process.env.ACCOUNT_DB || fileURLToPath(new URL('./.accounting/workspace.sqlite',import.meta.url)),
    publicOrigin, ownerReadOnly:process.env.ACCOUNT_OWNER_CAN_POST!=='1', allowSignup:process.env.ACCOUNT_ALLOW_SIGNUP==null ? !publicOrigin : process.env.ACCOUNT_ALLOW_SIGNUP==='1',
  });
  const server = createApp({workspace});
  server.listen(port, host, () => console.log(`Accounting Playground listening on http://${host}:${port}`));
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
