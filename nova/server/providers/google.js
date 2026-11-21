// Google Gemini API adapter: Veo (video), Imagen (stills) and Gemini (text).
// Endpoints follow https://ai.google.dev/gemini-api/docs/video and
// https://ai.google.dev/gemini-api/docs/imagen. Nothing is reported as
// connected until testConnection() succeeds with the user's own key.
import { ProviderError, jsonFetch, providerMessage } from './http.js';

const BASE = process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';

function headers(apiKey) {
  return { 'x-goog-api-key': apiKey, 'content-type': 'application/json' };
}

export async function testConnection(creds) {
  const res = await jsonFetch(`${BASE}/models?pageSize=1`, { headers: headers(creds.apiKey) }, 20_000);
  if (res.ok) return { ok: true, detail: 'Gemini API key accepted.' };
  return { ok: false, error: providerMessage(res.body, res.status) };
}

export async function createJob({ creds, model, request }) {
  if (request.task === 'text_to_image') {
    const res = await jsonFetch(
      `${BASE}/models/${encodeURIComponent(model.id)}:predict`,
      {
        method: 'POST',
        headers: headers(creds.apiKey),
        body: JSON.stringify({
          instances: [{ prompt: request.prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: request.aspect || '16:9',
            personGeneration: 'allow_adult',
          },
        }),
      },
      90_000,
    );
    if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
    const prediction = res.body?.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      throw new ProviderError('Imagen returned no image bytes.');
    }
    return {
      immediate: {
        buffer: Buffer.from(prediction.bytesBase64Encoded, 'base64'),
        mime: prediction.mimeType || 'image/png',
        ext: prediction.mimeType === 'image/jpeg' ? 'jpg' : 'png',
      },
    };
  }

  const instance = { prompt: request.prompt };
  if (request.imageBase64) {
    instance.image = {
      bytesBase64Encoded: request.imageBase64,
      mimeType: request.imageMime || 'image/png',
    };
  }
  const parameters = {
    aspectRatio: request.aspect || '16:9',
    resolution: request.resolution === '1080p' ? '1080p' : '720p',
    durationSeconds: Math.round(request.duration || 4),
    personGeneration: 'allow_adult',
  };
  if (request.negativePrompt) parameters.negativePrompt = request.negativePrompt;

  const res = await jsonFetch(
    `${BASE}/models/${encodeURIComponent(model.id)}:predictLongRunning`,
    {
      method: 'POST',
      headers: headers(creds.apiKey),
      body: JSON.stringify({ instances: [instance], parameters }),
    },
    60_000,
  );
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  if (!res.body?.name) throw new ProviderError('Veo did not return an operation id.');
  return { providerJobId: res.body.name };
}

export async function pollJob({ creds, providerJobId }) {
  const res = await jsonFetch(`${BASE}/${providerJobId}`, { headers: headers(creds.apiKey) }, 30_000);
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  const body = res.body || {};
  if (body.error) return { status: 'failed', error: body.error.message || 'Veo operation failed.' };
  if (!body.done) return { status: 'running' };

  const samples =
    body.response?.generateVideoResponse?.generatedSamples ||
    body.response?.generatedVideos ||
    [];
  const uri = samples[0]?.video?.uri || samples[0]?.video?.videoUri;
  if (!uri) return { status: 'failed', error: 'Veo finished without a video file.' };

  const download = await fetch(uri, { headers: { 'x-goog-api-key': creds.apiKey } });
  if (!download.ok) {
    return { status: 'failed', error: `Veo video download failed (HTTP ${download.status}).` };
  }
  return {
    status: 'succeeded',
    video: {
      buffer: Buffer.from(await download.arrayBuffer()),
      mime: download.headers.get('content-type') || 'video/mp4',
    },
  };
}

// Real Gemini call used to upgrade a deterministic plan. Returns parsed JSON or
// throws; callers fall back to the built-in director and label the engine.
export async function generateJson(creds, prompt) {
  const res = await jsonFetch(
    `${BASE}/models/gemini-2.5-flash:generateContent`,
    {
      method: 'POST',
      headers: headers(creds.apiKey),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      }),
    },
    60_000,
  );
  if (!res.ok) throw new ProviderError(providerMessage(res.body, res.status), res.status);
  const text = res.body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new ProviderError('Gemini returned an empty response.');
  return JSON.parse(text);
}
