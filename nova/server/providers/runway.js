// Runway API adapter. Endpoints follow https://docs.dev.runwayml.com
// (POST /v1/text_to_video, POST /v1/image_to_video, GET /v1/tasks/{id}).
import { ProviderError, jsonFetch, providerMessage } from './http.js';

const BASE = process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com/v1';
const VERSION = '2024-11-06';

const RATIO = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
};

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-Runway-Version': VERSION,
    'content-type': 'application/json',
  };
}

export async function testConnection(creds) {
  // There is no zero-cost listing endpoint. A signed request to a known task id
  // distinguishes an accepted key (404) from a rejected one (401/403).
  const res = await jsonFetch(
    `${BASE}/tasks/00000000-0000-0000-0000-000000000000`,
    { headers: headers(creds.apiKey) },
    20_000,
  );
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: providerMessage(res.body, res.status) };
  }
  return { ok: true, detail: 'Runway accepted the API key.' };
}

export async function createJob({ creds, model, request }) {
  const duration = request.duration >= 10 ? 10 : 5;
  const ratio = RATIO[request.aspect] || '1280:720';
  const isImage = request.task === 'image_to_video' && request.imageBase64;

  const url = isImage ? `${BASE}/image_to_video` : `${BASE}/text_to_video`;
  const body = isImage
    ? {
        model: model.id,
        promptImage: `data:${request.imageMime || 'image/png'};base64,${request.imageBase64}`,
        promptText: request.prompt,
        ratio,
        duration,
      }
    : { model: model.id, promptText: request.prompt, ratio, duration };

  const res = await jsonFetch(url, { method: 'POST', headers: headers(creds.apiKey), body: JSON.stringify(body) }, 60_000);
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  if (!res.body?.id) throw new ProviderError('Runway did not return a task id.');
  return { providerJobId: res.body.id };
}

export async function pollJob({ creds, providerJobId }) {
  const res = await jsonFetch(`${BASE}/tasks/${encodeURIComponent(providerJobId)}`, { headers: headers(creds.apiKey) }, 30_000);
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  const body = res.body || {};
  if (body.status === 'FAILED') {
    return { status: 'failed', error: body.failure || body.failureCode || 'Runway task failed.' };
  }
  if (body.status !== 'SUCCEEDED') {
    return { status: 'running', progress: Number(body.progress) || undefined };
  }
  const url = Array.isArray(body.output) ? body.output[0] : null;
  if (!url) return { status: 'failed', error: 'Runway finished without an output URL.' };
  return { status: 'succeeded', video: { url } };
}
