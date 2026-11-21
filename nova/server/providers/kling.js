// Kling AI adapter. Endpoints follow the Kling developer docs:
// POST /v1/videos/text2video, POST /v1/videos/image2video,
// GET /v1/videos/{kind}/{task_id}; auth is an HS256 JWT signed with the secret.
import crypto from 'node:crypto';
import { ProviderError, jsonFetch, providerMessage } from './http.js';

const BASE = process.env.KLING_API_BASE || 'https://api-singapore.klingai.com';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function token(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: creds.accessKey, exp: now + 1800, nbf: now - 5 }));
  const signature = crypto.createHmac('sha256', creds.secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function headers(creds) {
  return { Authorization: `Bearer ${token(creds)}`, 'content-type': 'application/json' };
}

export async function testConnection(creds) {
  const res = await jsonFetch(
    `${BASE}/v1/videos/text2video?pageNum=1&pageSize=1`,
    { headers: headers(creds) },
    20_000,
  );
  if (res.ok) return { ok: true, detail: 'Kling accepted the access key.' };
  return { ok: false, error: providerMessage(res.body, res.status) };
}

export async function createJob({ creds, model, request }) {
  const isImage = request.task === 'image_to_video' && request.imageBase64;
  const body = {
    model_name: model.id,
    prompt: request.prompt,
    negative_prompt: request.negativePrompt || undefined,
    duration: String(request.duration >= 10 ? 10 : 5),
    aspect_ratio: request.aspect || '16:9',
    mode: request.resolution === '1080p' ? 'pro' : 'std',
  };
  if (isImage) body.image = request.imageBase64;

  const url = isImage ? `${BASE}/v1/videos/image2video` : `${BASE}/v1/videos/text2video`;
  const res = await jsonFetch(url, { method: 'POST', headers: headers(creds), body: JSON.stringify(body) }, 60_000);
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  const taskId = res.body?.data?.task_id;
  if (!taskId) throw new ProviderError('Kling did not return a task id.');
  return { providerJobId: taskId, meta: { kind: isImage ? 'image2video' : 'text2video' } };
}

export async function pollJob({ creds, providerJobId, meta }) {
  const kind = meta?.kind === 'image2video' ? 'image2video' : 'text2video';
  const res = await jsonFetch(
    `${BASE}/v1/videos/${kind}/${encodeURIComponent(providerJobId)}`,
    { headers: headers(creds) },
    30_000,
  );
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  const data = res.body?.data || {};
  if (data.task_status === 'failed') {
    return { status: 'failed', error: data.task_status_msg || 'Kling task failed.' };
  }
  if (data.task_status !== 'succeed') return { status: 'running' };
  const url = data.task_result?.videos?.[0]?.url;
  if (!url) return { status: 'failed', error: 'Kling finished without a video URL.' };
  return { status: 'succeeded', video: { url } };
}
