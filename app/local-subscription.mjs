import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// Shared logins are read-only. Never copy or refresh another app's credentials.
export async function localSubscription({
  home = homedir(), codexHome = process.env.CODEX_HOME || resolve(home, '.codex'),
  read = readFile, now = Date.now(), providers = ['openai-codex', 'openai'],
} = {}) {
  async function readAuth(path){
    try { return JSON.parse(await read(path, 'utf8')) || {}; }
    catch { return {}; }
  }
  function validCredential(access, expiresAt){
    if (typeof access !== 'string' || !access) return null;
    let jwtExpiry = 0;
    try {
      jwtExpiry = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString()).exp * 1000;
    } catch { /* Some Pi providers use opaque access tokens. */ }
    const expires = jwtExpiry || Number(expiresAt || 0);
    if (!Number.isFinite(expires) || expires <= now + 300000) return null;
    return {type:'oauth', access, refresh:'', expires};
  }
  const pi = await readAuth(resolve(home, '.pi/agent/auth.json'));
  for (const providerId of providers.filter(id => ['openai-codex','openai'].includes(id))) {
    const entry = pi[providerId];
    if (entry?.type !== 'oauth') continue;
    const credential = validCredential(entry.access, entry.expires);
    if (credential) return {providerId, source:'本机 Pi 登录', credential};
  }
  if (providers.includes('openai-codex')) {
    const codex = await readAuth(resolve(codexHome, 'auth.json'));
    const credential = validCredential(codex.auth_mode === 'apikey' ? null : codex.tokens?.access_token);
    if (credential) return {providerId:'openai-codex', source:'本机 Codex 登录', credential};
  }
  return null;
}
