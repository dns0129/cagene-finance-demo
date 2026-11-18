import { randomBytes } from 'node:crypto';
import { createApp } from './server.mjs';
import { createWorkspace } from './workspace-store.mjs';

const publicOrigin = process.env.RENDER_EXTERNAL_URL;
if (!publicOrigin) throw new Error('RENDER_EXTERNAL_URL is required.');
const workspace = createWorkspace({publicOrigin, allowSignup:false, ownerReadOnly:true});
const backend = {status:async () => ({configured:false, provider:'openai-codex', label:'GPT', message:'AI 对账尚未配置。'})};
const server = createApp({workspace, backend, token:randomBytes(32).toString('hex')});
server.listen(Number(process.env.PORT || 10000), '0.0.0.0');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
