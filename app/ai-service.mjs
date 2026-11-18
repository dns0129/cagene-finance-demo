import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { localSubscription } from './local-subscription.mjs';
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime,
  SessionManager, SettingsManager,
} from '@earendil-works/pi-coding-agent';

export const projectDir = fileURLToPath(new URL('.', import.meta.url));
export const agentDir = resolve(process.env.PI_AGENT_DIR || resolve(projectDir, '.pi'));
export const PROVIDERS = ['openai-codex', 'openai'];
export const provider = process.env.PI_PROVIDER || PROVIDERS[0];
const DEFAULT_MODELS = {openai:'gpt-6.1-sol', 'openai-codex':'gpt-6.1-sol', deepseek:'deepseek-flash'};
export const modelFor = (id, env = process.env) => {
  if (id === 'deepseek') return env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODELS[id];
  const override = env.PI_MODEL?.trim();
  return /^(?:gpt|o\d|codex)/i.test(override || '') ? override : DEFAULT_MODELS[id];
};
export const modelId = modelFor(provider);
export const labelFor = id => id === 'deepseek' ? 'DeepSeek' : 'GPT';
const brandFor = id => PROVIDERS.includes(id) ? 'ChatGPT' : labelFor(id);
const SYSTEM_PROMPTS = {
  transaction:'You are an IFRS accounting tutor. Follow the requested JSON schema. Return one JSON object and no other text. Do not call tools.',
  reconcile:'You are a careful bank reconciliation assistant for an accountant. Use only the records given in the request, follow the requested JSON schema, and return one JSON object and no other text. Do not call tools.',
};
export const TASKS = Object.keys(SYSTEM_PROMPTS);

export class AIError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function parseModelJSON(text) {
  const content = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AIError('invalid_json', 'AI 的回答不是有效的 JSON 对象，请再试一次。');
  }
}

const loginSources = new WeakMap();
export async function createModelRuntime({useShared = true, loadShared = localSubscription, requestedProvider = process.env.PI_PROVIDER,
  localEnabled = process.env.ACCT_USE_LOCAL_SUBSCRIPTION === '1'
    || (process.platform === 'darwin' && process.env.ACCT_USE_LOCAL_SUBSCRIPTION !== '0')} = {}) {
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  let runtime = await ModelRuntime.create({
    authPath: resolve(agentDir, 'auth.json'),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  if (useShared && localEnabled) {
    const providers = requestedProvider ? [requestedProvider] : PROVIDERS;
    const entries = await runtime.listCredentials();
    const stored = entries.some(c => providers.includes(c.providerId) && c.type === 'oauth');
    const shared = stored ? null : await loadShared({providers});
    const providerId = shared?.providerId || 'openai-codex';
    if (shared && providers.includes(providerId)) {
      const credentials = new InMemoryCredentialStore();
      await credentials.modify(providerId, async () => shared.credential);
      runtime = await ModelRuntime.create({credentials, modelsPath:null, allowModelNetwork:false, refreshOnCreate:false});
      loginSources.set(runtime, {source:shared.source, providerId});
    }
  }
  const sharedProvider = loginSources.get(runtime)?.providerId;
  for (const id of PROVIDERS) {
    const source = runtime.getProvider(id);
    if (!source?.auth.oauth) continue;
    // A shared login is read-only: never refresh another app's token.
    const oauth = sharedProvider === id ? {...source.auth.oauth, refresh:async () => {
      throw new AIError('not_authenticated', '本机共享授权即将过期，请在 Pi／Codex 重新登录，或在财报助手中登录。', 503);
    }} : source.auth.oauth;
    // OpenAI: remove the API-key auth method as well as checking credential metadata. This also
    // prevents a concurrent logout from falling back to an ambient API key mid-request.
    runtime.registerNativeProvider({...source, auth:{oauth}});
  }
  return runtime;
}

export function createPiBackend({ deepseek = false, loadRuntime = createModelRuntime, createSession = createAgentSession, env = process.env } = {}) {
  const requestedProvider = deepseek ? 'deepseek' : env.PI_PROVIDER;
  if (!deepseek && requestedProvider && !PROVIDERS.includes(requestedProvider)) {
    throw new Error('PI_PROVIDER 必须是 openai 或 openai-codex。');
  }

  async function context() {
    const runtime = await loadRuntime({useShared:!deepseek, requestedProvider});
    const credentials = await runtime.listCredentials();
    const has = (id, types) => credentials.some(c => c.providerId === id && types.includes(c.type));
    const ready = id => id === 'deepseek'
      ? has(id, ['api_key']) || !!env.DEEPSEEK_API_KEY?.trim()
      : has(id, ['oauth']);
    const selectedProvider = requestedProvider || PROVIDERS.find(ready) || PROVIDERS[0];
    const configured = ready(selectedProvider);
    const model = runtime.getModel(selectedProvider, modelFor(selectedProvider, env));
    const billing = deepseek ? 'deepseek-api-key' : 'chatgpt-subscription';
    return { runtime, configured, model, selectedProvider, billing };
  }

  return {
    async status() {
      const { runtime, configured, model, selectedProvider, billing } = await context();
      const label = labelFor(selectedProvider), brand = brandFor(selectedProvider), shared = loginSources.get(runtime)?.source;
      const source = shared || '财报助手登录';
      if (deepseek) {
        return {
          app:'accounting-playground', configured:configured && !!model, provider:selectedProvider,
          model:modelFor(selectedProvider, env), label, billing, source:'DeepSeek API Key（按量计费）',
          message: !model ? '所选 DeepSeek 模型不在 Pi 的模型列表中。' : configured
            ? 'DeepSeek API Key 已配置，实际可用性与额度由 DeepSeek 确认。'
            : '请在服务端设置 DEEPSEEK_API_KEY 后启用 DeepSeek。',
        };
      }
      return {
        app:'accounting-playground',
        configured: configured && !!model,
        provider:selectedProvider, model: modelFor(selectedProvider, env), label, billing, source,
        message: !model ? `所选 ${label} 模型不在 pi 的模型列表中。` : configured
          ? `已找到${shared || ` ${brand} 登录`}；实际可用性与额度由模型服务确认。`
          : '请在网页中登录 ChatGPT，或使用本机已有的 Pi／Codex 登录。',
      };
    },

    async sample(prompt, { signal, task = 'transaction' }) {
      signal.throwIfAborted();
      const { runtime, configured, model, selectedProvider } = await context();
      const label = labelFor(selectedProvider), brand = brandFor(selectedProvider);
      if (!configured) throw new AIError('not_authenticated', deepseek
        ? '请在服务端设置 DEEPSEEK_API_KEY。' : `尚未登录 ${brand}，请完成登录后重试。`, 503);
      if (!model) throw new AIError('model_unavailable', `所选 ${label} 模型不可用，请检查模型配置。`, 503);
      const settings = SettingsManager.inMemory({
        compaction: { enabled: false }, retry: { enabled: false },
        cacheWarming: 'off',
      });
      const loader = new DefaultResourceLoader({
        cwd: projectDir, agentDir, settingsManager: settings,
        noExtensions: true, noSkills: true, noPromptTemplates: true,
        noThemes: true, noContextFiles: true,
        systemPromptOverride: () => SYSTEM_PROMPTS[task] || SYSTEM_PROMPTS.transaction,
      });
      await loader.reload();
      signal.throwIfAborted();
      const { session } = await createSession({
        cwd: projectDir, agentDir, modelRuntime: runtime, model,
        tools: [], noTools: 'all', thinkingLevel: 'low',
        resourceLoader: loader, settingsManager: settings,
        sessionManager: SessionManager.inMemory(),
      });
      const abort = () => { void session.abort().catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        await session.prompt(prompt);
        signal.throwIfAborted();
        const reply = [...session.messages].reverse().find(m => m.role === 'assistant');
        if (!reply || reply.stopReason === 'error' || reply.stopReason === 'aborted') {
          const detail = reply?.errorMessage || '';
          if (/429|rate.limit|quota|usage.limit/i.test(detail)) {
            throw new AIError('rate_limited', '已达到请求或订阅用量上限，请稍后再试。', 429);
          }
          if (/401|403|auth|token/i.test(detail)) {
            throw new AIError('not_authenticated', `${brand} 授权失效或模型访问被拒绝，请检查登录和网络配置。`, 503);
          }
          throw new AIError('upstream_error', `${label} 连接失败，请检查网络和模型可用性。`);
        }
        return parseModelJSON(reply.content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
      } catch (error) {
        if (error instanceof AIError || signal.aborted) throw error;
        if (/429|rate.limit|quota|usage.limit/i.test(error.message || '')) {
          throw new AIError('rate_limited', '已达到请求或订阅用量上限，请稍后再试。', 429);
        }
        throw new AIError('upstream_error', `${label} 连接失败，请检查网络和 ${brand} 授权。`);
      } finally {
        signal.removeEventListener('abort', abort);
        session.dispose();
      }
    },
  };
}
