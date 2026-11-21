// Generation job orchestration.
//
// Every generation is a real job row: credits are charged up front, a provider
// adapter (or the built-in renderer) does the work, progress is tracked, and a
// failure refunds the credits. A provider with no verified credentials fails
// loudly instead of pretending to generate.
import fs from 'node:fs/promises';
import path from 'node:path';
import { q, withTx } from './db.js';
import { getProvider, getModel } from './providers/registry.js';
import { resolveCredentials } from './providers/keys.js';
import * as google from './providers/google.js';
import * as runway from './providers/runway.js';
import * as kling from './providers/kling.js';
import * as local from './providers/local.js';

export const DATA_DIR = process.env.NOVA_DATA_DIR || path.join(process.cwd(), 'data');
export const RENDERS_DIR = path.join(DATA_DIR, 'renders');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const ADAPTERS = { google, runway, kling };
const EXPECTED_MS = { google: 90_000, runway: 120_000, kling: 150_000 };

export const workerState = { lastTick: null, busy: false, lastError: null };

export async function ensureDirs() {
  await fs.mkdir(RENDERS_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function snapDuration(durations, wanted) {
  if (!durations || durations.length === 0) return 0;
  const value = Number(wanted) || durations[0];
  return durations.reduce((best, d) => (Math.abs(d - value) < Math.abs(best - value) ? d : best), durations[0]);
}

export function validateRequest({ providerId, modelId, task, aspect, duration, resolution }) {
  const provider = getProvider(providerId);
  if (!provider) return { error: 'Unknown provider.' };
  const model = getModel(providerId, modelId);
  if (!model) return { error: 'Unknown model for this provider.' };
  if (!model.tasks.includes(task)) {
    return { error: `${model.name} does not support ${task.replaceAll('_', ' ')}.` };
  }
  return {
    provider,
    model,
    aspect: model.aspects.includes(aspect) ? aspect : model.aspects[0],
    resolution: model.resolutions.includes(resolution) ? resolution : model.resolutions[0],
    duration: snapDuration(model.durations, duration),
  };
}

export async function createJob({ user, project, providerId, modelId, task, request, sceneId = null }) {
  const validated = validateRequest({
    providerId,
    modelId,
    task,
    aspect: request.aspect,
    duration: request.duration,
    resolution: request.resolution,
  });
  if (validated.error) {
    const err = new Error(validated.error);
    err.status = 400;
    throw err;
  }
  const { model, aspect, duration, resolution } = validated;

  const job = await withTx(async (client) => {
    const userRes = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const row = userRes.rows[0];
    if (!row) {
      const err = new Error('Account not found.');
      err.status = 401;
      throw err;
    }
    if (row.credits < model.cost) {
      const err = new Error(`Not enough credits: ${model.name} costs ${model.cost}, you have ${row.credits}.`);
      err.status = 402;
      throw err;
    }
    const balance = row.credits - model.cost;
    await client.query('UPDATE users SET credits=$1 WHERE id=$2', [balance, row.id]);
    await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, ref, balance_after)
       VALUES ($1,$2,'generation_charge',$3,$4)`,
      [row.id, -model.cost, `${providerId}/${modelId}`, balance],
    );
    const insert = await client.query(
      `INSERT INTO jobs (project_id, user_id, provider_id, model_id, task, status, request, credits_charged, scene_id)
       VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8) RETURNING *`,
      [project.id, row.id, providerId, modelId, task, JSON.stringify({ ...request, aspect, duration, resolution }), model.cost, sceneId],
    );
    await client.query(
      `UPDATE projects SET status='queued', provider_id=$2, model_id=$3, updated_at=now() WHERE id=$1`,
      [project.id, providerId, modelId],
    );
    return insert.rows[0];
  });

  setImmediate(() => tick().catch((err) => console.error('[worker]', err.message)));
  return job;
}

export function jobView(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    task: row.task,
    status: row.status,
    progress: row.progress,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    error: row.error,
    creditsCharged: row.credits_charged,
    refunded: row.refunded,
    sceneId: row.scene_id,
    request: row.request,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    assetId: row.asset_id || null,
  };
}

async function refund(client, job, reason) {
  const res = await client.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [job.user_id]);
  if (!res.rows[0]) return;
  const balance = res.rows[0].credits + job.credits_charged;
  await client.query('UPDATE users SET credits=$1 WHERE id=$2', [balance, job.user_id]);
  await client.query(
    `INSERT INTO credit_ledger (user_id, delta, reason, ref, balance_after)
     VALUES ($1,$2,$3,$4,$5)`,
    [job.user_id, job.credits_charged, reason, job.id, balance],
  );
  await client.query('UPDATE jobs SET refunded=true WHERE id=$1', [job.id]);
}

async function failJob(job, message, { retryable = false } = {}) {
  const canRetry = retryable && job.attempts < job.max_attempts;
  await withTx(async (client) => {
    if (canRetry) {
      await client.query(
        `UPDATE jobs SET status='queued', error=$2, progress=0, next_poll_at=$3, updated_at=now() WHERE id=$1`,
        [job.id, message, new Date(Date.now() + 4000 * job.attempts)],
      );
      return;
    }
    await client.query(
      `UPDATE jobs SET status='failed', error=$2, finished_at=now(), updated_at=now() WHERE id=$1`,
      [job.id, String(message).slice(0, 2000)],
    );
    if (!job.refunded && job.credits_charged > 0) {
      await refund(client, job, 'generation_refund');
    }
    await client.query(`UPDATE projects SET status='failed', updated_at=now() WHERE id=$1`, [job.project_id]);
    await client.query(
      `INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'job.failed',$2)`,
      [job.user_id, JSON.stringify({ jobId: job.id, provider: job.provider_id, error: String(message).slice(0, 500) })],
    );
  });
}

async function saveAsset({ job, filePath, posterPath, mime, kind, width, height, duration, bytes, sceneId }) {
  const stat = await fs.stat(filePath);
  const { rows } = await q(
    `INSERT INTO assets (user_id, project_id, job_id, scene_id, kind, path, poster_path, mime, bytes, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      job.user_id,
      job.project_id,
      job.id,
      sceneId || null,
      kind,
      filePath,
      posterPath || null,
      mime,
      bytes || stat.size,
      width || null,
      height || null,
      duration || null,
    ],
  );
  await q(`UPDATE jobs SET status='succeeded', progress=100, finished_at=now(), updated_at=now(), error=NULL WHERE id=$1`, [job.id]);
  if (sceneId) {
    await q(`UPDATE scenes SET status='done' WHERE id=$1`, [sceneId]);
    await q(`UPDATE projects SET status='ready', updated_at=now() WHERE id=$1`, [job.project_id]);
  } else {
    await q(`UPDATE scenes SET status='done' WHERE project_id=$1`, [job.project_id]);
    await q(`UPDATE projects SET status='ready', updated_at=now() WHERE id=$1`, [job.project_id]);
  }
  await q(
    `INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'job.succeeded',$2)`,
    [job.user_id, JSON.stringify({ jobId: job.id, provider: job.provider_id, assetId: rows[0].id })],
  );
  return rows[0];
}

async function loadProjectAndScenes(projectId) {
  const [projectRes, sceneRes] = await Promise.all([
    q('SELECT * FROM projects WHERE id=$1', [projectId]),
    q('SELECT * FROM scenes WHERE project_id=$1 ORDER BY idx', [projectId]),
  ]);
  return { project: projectRes.rows[0], scenes: sceneRes.rows };
}

async function readImageBase64(assetId, userId) {
  const { rows } = await q('SELECT * FROM assets WHERE id=$1 AND user_id=$2', [assetId, userId]);
  const asset = rows[0];
  if (!asset) throw new Error('The uploaded image could not be found.');
  const buffer = await fs.readFile(asset.path);
  if (buffer.length > 12 * 1024 * 1024) throw new Error('Uploaded image is too large for the provider (max 12 MB).');
  return { base64: buffer.toString('base64'), mime: asset.mime };
}

async function downloadToFile(url, filePath, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Video download failed (HTTP ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return buffer.length;
  } finally {
    clearTimeout(timer);
  }
}

async function execute(job) {
  const { project, scenes } = await loadProjectAndScenes(job.project_id);
  if (!project) throw new Error('Project no longer exists.');

  if (job.provider_id === 'local') {
    const outFile = path.join(RENDERS_DIR, `${job.id}.mp4`);
    let imagePath = null;
    if (job.request.imageAssetId) {
      const { rows } = await q('SELECT path FROM assets WHERE id=$1 AND user_id=$2', [job.request.imageAssetId, job.user_id]);
      imagePath = rows[0]?.path || null;
      if (!imagePath) throw new Error('The uploaded image could not be found.');
    }
    const sceneList = (job.scene_id ? scenes.filter((s) => s.id === job.scene_id) : scenes).map((s) => ({
      id: s.id,
      description: s.description,
      durationSec: Number(s.duration_sec),
    }));
    if (!sceneList.length) throw new Error('This project has no scenes to render.');
    const result = await local.renderStoryboard({
      title: project.title,
      aspect: project.aspect,
      style: project.style,
      scenes: sceneList,
      imagePath,
      outFile,
      onProgress: async (progress) => {
        await q('UPDATE jobs SET progress=$2, updated_at=now() WHERE id=$1', [job.id, Math.min(95, progress)]);
      },
    });
    const asset = await saveAsset({
      job,
      filePath: result.path,
      posterPath: result.posterPath,
      mime: 'video/mp4',
      kind: 'video',
      width: result.width,
      height: result.height,
      duration: result.duration,
      bytes: result.bytes,
      sceneId: job.scene_id,
    });
    return asset;
  }

  const resolved = await resolveCredentials(job.provider_id);
  if (!resolved) {
    const provider = getProvider(job.provider_id);
    throw new Error(`${provider?.name || job.provider_id} is not configured. Add an API key in Admin → Providers, then test the connection.`);
  }
  const adapter = ADAPTERS[job.provider_id];
  if (!adapter) throw new Error(`No adapter for provider ${job.provider_id}.`);
  const model = getModel(job.provider_id, job.model_id);
  if (!model) throw new Error('Model no longer available.');

  const request = { ...job.request, task: job.task };
  if (request.imageAssetId) {
    const image = await readImageBase64(request.imageAssetId, job.user_id);
    request.imageBase64 = image.base64;
    request.imageMime = image.mime;
  }

  if (job.provider_job_id) {
    return null;
  }

  const created = await adapter.createJob({ creds: resolved.creds, model, request });

  if (created.immediate) {
    const ext = created.immediate.ext || 'png';
    const filePath = path.join(RENDERS_DIR, `${job.id}.${ext}`);
    await fs.writeFile(filePath, created.immediate.buffer);
    const kind = created.immediate.mime.startsWith('image/') ? 'image' : 'video';
    const asset = await saveAsset({
      job,
      filePath,
      mime: created.immediate.mime,
      kind,
      bytes: created.immediate.buffer.length,
      sceneId: job.scene_id,
    });
    return asset;
  }

  await q(
    `UPDATE jobs SET status='running', provider_job_id=$2, progress=10, next_poll_at=$3, updated_at=now() WHERE id=$1`,
    [job.id, created.providerJobId, new Date(Date.now() + 5000)],
  );
  if (created.meta) {
    await q('UPDATE jobs SET request = request || $2::jsonb WHERE id=$1', [job.id, JSON.stringify({ providerMeta: created.meta })]);
  }
  return null;
}

async function pollProviderJob(job) {
  const resolved = await resolveCredentials(job.provider_id);
  if (!resolved) {
    await failJob(job, `${job.provider_id} credentials are no longer available.`, { retryable: false });
    return;
  }
  const adapter = ADAPTERS[job.provider_id];
  const model = getModel(job.provider_id, job.model_id);
  const result = await adapter.pollJob({
    creds: resolved.creds,
    model,
    providerJobId: job.provider_job_id,
    meta: job.request?.providerMeta,
    request: job.request,
  });

  if (result.status === 'running') {
    const elapsed = Date.now() - new Date(job.started_at || job.created_at).getTime();
    const expected = EXPECTED_MS[job.provider_id] || 120_000;
    const progress = Math.min(92, Math.max(12, Math.round((elapsed / expected) * 85)));
    await q('UPDATE jobs SET progress=$2, next_poll_at=$3, updated_at=now() WHERE id=$1', [
      job.id,
      result.progress ? Math.min(92, Math.max(progress, result.progress)) : progress,
      new Date(Date.now() + 4000),
    ]);
    return;
  }

  if (result.status === 'failed') {
    await failJob(job, result.error || 'Provider reported a failed generation.', { retryable: false });
    return;
  }

  const ext = 'mp4';
  const filePath = path.join(RENDERS_DIR, `${job.id}.${ext}`);
  if (result.video.buffer) {
    await fs.writeFile(filePath, result.video.buffer);
  } else if (result.video.url) {
    await downloadToFile(result.video.url, filePath);
  } else {
    await failJob(job, 'Provider returned no downloadable video.', { retryable: false });
    return;
  }
  let posterPath = null;
  try {
    const ff = await import('./providers/local.js');
    posterPath = await ff.extractPoster(filePath);
  } catch {
    posterPath = null;
  }
  await saveAsset({
    job,
    filePath,
    posterPath,
    mime: 'video/mp4',
    kind: 'video',
    duration: job.request?.duration || null,
    sceneId: job.scene_id,
  });
}

let ticking = false;

export async function tick() {
  if (ticking) return;
  ticking = true;
  workerState.busy = true;
  try {
    // One local render at a time keeps CPU predictable; provider jobs are I/O.
    for (;;) {
      const { rows } = await q(
        `UPDATE jobs SET status='starting', attempts=attempts+1, started_at=now(), updated_at=now()
         WHERE id = (
           SELECT id FROM jobs
           WHERE status='queued' AND (next_poll_at IS NULL OR next_poll_at <= now())
           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
         ) RETURNING *`,
      );
      if (!rows[0]) break;
      const job = rows[0];
      try {
        await q('UPDATE jobs SET status=\'running\', progress=5, updated_at=now() WHERE id=$1', [job.id]);
        await execute(job);
      } catch (err) {
        const retryable = /timed out|fetch failed|ECONNRESET|HTTP 5\d\d|HTTP 429/i.test(err.message || '');
        await failJob(job, err.message || 'Generation failed.', { retryable });
      }
    }

    const { rows: running } = await q(
      `SELECT * FROM jobs
       WHERE status='running' AND provider_job_id IS NOT NULL
         AND (next_poll_at IS NULL OR next_poll_at <= now())
       ORDER BY updated_at LIMIT 5`,
    );
    for (const job of running) {
      try {
        await pollProviderJob(job);
      } catch (err) {
        const retryable = /timed out|fetch failed|ECONNRESET|HTTP 5\d\d|HTTP 429/i.test(err.message || '');
        await failJob(job, err.message || 'Polling failed.', { retryable });
      }
    }
    workerState.lastTick = new Date().toISOString();
    workerState.lastError = null;
  } catch (err) {
    workerState.lastError = err.message;
  } finally {
    ticking = false;
    workerState.busy = false;
  }
}

export function startWorker() {
  const interval = setInterval(() => {
    tick().catch((err) => {
      workerState.lastError = err.message;
    });
  }, 3000);
  interval.unref?.();
  tick().catch(() => {});
  return interval;
}

export async function retryJob({ user, jobId }) {
  const { rows } = await q('SELECT * FROM jobs WHERE id=$1 AND user_id=$2', [jobId, user.id]);
  const job = rows[0];
  if (!job) {
    const err = new Error('Job not found.');
    err.status = 404;
    throw err;
  }
  if (job.status !== 'failed') {
    const err = new Error('Only failed jobs can be retried.');
    err.status = 400;
    throw err;
  }
  const projectRes = await q('SELECT * FROM projects WHERE id=$1', [job.project_id]);
  const project = projectRes.rows[0];
  if (!project) {
    const err = new Error('Project no longer exists.');
    err.status = 404;
    throw err;
  }
  return createJob({
    user,
    project,
    providerId: job.provider_id,
    modelId: job.model_id,
    task: job.task,
    request: job.request,
    sceneId: job.scene_id,
  });
}
