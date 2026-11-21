import { Router } from 'express';
import fs from 'node:fs/promises';
import { q, withTx } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, asyncHandler, oneOf, str } from '../http.js';
import { ASPECTS, STYLES } from '../director.js';
import { createJob, jobView } from '../jobs.js';
import { readiness } from '../providers/keys.js';
import { getModel, modelsForTask, getProvider } from '../providers/registry.js';

const router = Router();
router.use(requireAuth);

export function assetView(row) {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    bytes: Number(row.bytes),
    width: row.width,
    height: row.height,
    duration: row.duration_sec != null ? Number(row.duration_sec) : null,
    sceneId: row.scene_id,
    createdAt: row.created_at,
    url: `/api/assets/${row.id}`,
    posterUrl: row.poster_path ? `/api/assets/${row.id}/poster` : null,
  };
}

export function projectView(row) {
  return {
    id: row.id,
    title: row.title,
    module: row.module,
    brief: row.brief,
    language: row.language,
    style: row.style,
    aspect: row.aspect,
    duration: Number(row.duration_sec),
    status: row.status,
    engine: row.engine,
    enhancedPrompt: row.enhanced_prompt,
    negativePrompt: row.negative_prompt,
    providerId: row.provider_id,
    modelId: row.model_id,
    settings: row.settings || {},
    analysis: row.analysis || null,
    isPublic: row.is_public,
    favorite: row.favorite ?? false,
    videoAssetId: row.video_asset_id || null,
    coverAssetId: row.cover_asset_id || null,
    coverKind: row.cover_kind || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sceneView(row) {
  return {
    id: row.id,
    idx: row.idx,
    description: row.description,
    cameraAngle: row.camera_angle,
    cameraMove: row.camera_move,
    lighting: row.lighting,
    subjectAction: row.subject_action,
    environment: row.environment,
    style: row.style,
    durationSec: Number(row.duration_sec),
    prompt: row.prompt,
    status: row.status,
  };
}

async function loadProject(id, userId) {
  const { rows } = await q('SELECT * FROM projects WHERE id=$1 AND user_id=$2', [id, userId]);
  return rows[0] || null;
}

async function bundle(id, userId) {
  const project = await loadProject(id, userId);
  if (!project) return null;
  const [scenes, assets, jobs, fav] = await Promise.all([
    q('SELECT * FROM scenes WHERE project_id=$1 ORDER BY idx', [id]),
    q('SELECT * FROM assets WHERE project_id=$1 ORDER BY created_at DESC', [id]),
    q('SELECT j.*, (SELECT a.id FROM assets a WHERE a.job_id=j.id LIMIT 1) AS asset_id FROM jobs j WHERE j.project_id=$1 ORDER BY j.created_at DESC LIMIT 20', [id]),
    q('SELECT 1 FROM favorites WHERE project_id=$1 AND user_id=$2', [id, userId]),
  ]);
  const assetRows = assets.rows;
  const video = assetRows.find((a) => a.kind === 'video' && !a.scene_id) || assetRows.find((a) => a.kind === 'video');
  const cover = assetRows.find((a) => a.kind === 'video') || assetRows[0];
  return {
    project: projectView({
      ...project,
      favorite: fav.rows.length > 0,
      video_asset_id: video?.id || null,
      cover_asset_id: cover?.id || null,
      cover_kind: cover?.kind || null,
    }),
    scenes: scenes.rows.map(sceneView),
    assets: assetRows.map(assetView),
    jobs: jobs.rows.map(jobView),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await q(
      `SELECT p.*,
        (SELECT a.id FROM assets a WHERE a.project_id=p.id AND a.kind='video' ORDER BY a.created_at DESC LIMIT 1) AS video_asset_id,
        (SELECT a.id FROM assets a WHERE a.project_id=p.id ORDER BY a.created_at DESC LIMIT 1) AS cover_asset_id,
        (SELECT a.kind FROM assets a WHERE a.project_id=p.id ORDER BY a.created_at DESC LIMIT 1) AS cover_kind,
        EXISTS(SELECT 1 FROM favorites f WHERE f.project_id=p.id AND f.user_id=$1) AS favorite
       FROM projects p WHERE p.user_id=$1 ORDER BY p.updated_at DESC LIMIT 200`,
      [req.user.id],
    );
    res.json({ projects: rows.map(projectView) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const title = str(body.title || 'Untitled project', { max: 120, min: 1 });
    const module = str(body.module || 'director', { max: 40 });
    const aspect = oneOf(body.aspect, ASPECTS, '16:9');
    const style = STYLES[body.style] ? body.style : 'cinematic';
    const duration = Math.max(5, Math.min(60, Number(body.duration) || 10));
    const language = body.language === 'ar' ? 'ar' : 'en';
    const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 20) : [];
    if (!scenes.length) throw new HttpError('A project needs at least one scene.', 400, 'scenes_required');

    const project = await withTx(async (client) => {
      const insert = await client.query(
        `INSERT INTO projects (user_id, module, title, brief, language, style, aspect, duration_sec, status,
           engine, enhanced_prompt, negative_prompt, provider_id, model_id, settings, analysis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          req.user.id,
          module,
          title,
          String(body.brief || '').slice(0, 2000),
          language,
          style,
          aspect,
          duration,
          String(body.engine || 'built-in').slice(0, 60),
          String(body.enhancedPrompt || '').slice(0, 2000),
          String(body.negativePrompt || '').slice(0, 800),
          body.providerId || null,
          body.modelId || null,
          JSON.stringify(body.settings || {}),
          body.analysis ? JSON.stringify(body.analysis) : null,
        ],
      );
      const row = insert.rows[0];
      for (let i = 0; i < scenes.length; i += 1) {
        const s = scenes[i];
        await client.query(
          `INSERT INTO scenes (project_id, idx, description, camera_angle, camera_move, lighting, subject_action, environment, style, duration_sec, prompt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            row.id,
            i + 1,
            String(s.description || '').slice(0, 1000),
            String(s.cameraAngle || '').slice(0, 160),
            String(s.cameraMove || '').slice(0, 160),
            String(s.lighting || '').slice(0, 160),
            String(s.subjectAction || '').slice(0, 240),
            String(s.environment || '').slice(0, 240),
            String(s.style || ''),
            Number(s.durationSec) || 2.5,
            String(s.prompt || '').slice(0, 2000),
          ],
        );
      }
      return row;
    });

    res.status(201).json(await bundle(project.id, req.user.id));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await bundle(req.params.id, req.user.id);
    if (!data) throw new HttpError('Project not found.', 404, 'not_found');
    res.json(data);
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.id, req.user.id);
    if (!project) throw new HttpError('Project not found.', 404, 'not_found');
    const body = req.body || {};

    if (body.scenes) {
      if (!Array.isArray(body.scenes) || body.scenes.length === 0 || body.scenes.length > 20) {
        throw new HttpError('A project needs between 1 and 20 scenes.', 400, 'invalid_scenes');
      }
      await withTx(async (client) => {
        const existing = await client.query('SELECT id FROM scenes WHERE project_id=$1', [project.id]);
        const existingIds = new Set(existing.rows.map((r) => r.id));
        await client.query('UPDATE scenes SET idx = idx + 1000 WHERE project_id=$1', [project.id]);
        const kept = new Set();
        for (let i = 0; i < body.scenes.length; i += 1) {
          const s = body.scenes[i];
          if (s.id && existingIds.has(s.id)) {
            kept.add(s.id);
            await client.query(
              `UPDATE scenes SET idx=$2, description=$3, camera_angle=$4, camera_move=$5, lighting=$6,
                 subject_action=$7, environment=$8, style=$9, duration_sec=$10, prompt=$11
               WHERE id=$1 AND project_id=$12`,
              [
                s.id,
                i + 1,
                String(s.description || '').slice(0, 1000),
                String(s.cameraAngle || '').slice(0, 160),
                String(s.cameraMove || '').slice(0, 160),
                String(s.lighting || '').slice(0, 160),
                String(s.subjectAction || '').slice(0, 240),
                String(s.environment || '').slice(0, 240),
                String(s.style || ''),
                Number(s.durationSec) || 2.5,
                String(s.prompt || '').slice(0, 2000),
                project.id,
              ],
            );
          } else {
            await client.query(
              `INSERT INTO scenes (project_id, idx, description, camera_angle, camera_move, lighting, subject_action, environment, style, duration_sec, prompt)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [
                project.id,
                i + 1,
                String(s.description || '').slice(0, 1000),
                String(s.cameraAngle || '').slice(0, 160),
                String(s.cameraMove || '').slice(0, 160),
                String(s.lighting || '').slice(0, 160),
                String(s.subjectAction || '').slice(0, 240),
                String(s.environment || '').slice(0, 240),
                String(s.style || ''),
                Number(s.durationSec) || 2.5,
                String(s.prompt || '').slice(0, 2000),
              ],
            );
          }
        }
        const removed = [...existingIds].filter((id) => !kept.has(id));
        if (removed.length) await client.query('DELETE FROM scenes WHERE id = ANY($1::uuid[])', [removed]);
      });
    }

    const updates = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      updates.push(`${column}=$${values.length}`);
    };
    if (typeof body.title === 'string') set('title', str(body.title, { max: 120, min: 1 }));
    if (typeof body.enhancedPrompt === 'string') set('enhanced_prompt', body.enhancedPrompt.slice(0, 2000));
    if (typeof body.negativePrompt === 'string') set('negative_prompt', body.negativePrompt.slice(0, 800));
    if (typeof body.isPublic === 'boolean') set('is_public', body.isPublic);
    if (body.settings && typeof body.settings === 'object') set('settings', JSON.stringify(body.settings));
    if (updates.length) {
      values.push(project.id);
      await q(`UPDATE projects SET ${updates.join(', ')}, updated_at=now() WHERE id=$${values.length}`, values);
    }

    res.json(await bundle(project.id, req.user.id));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.id, req.user.id);
    if (!project) throw new HttpError('Project not found.', 404, 'not_found');
    const { rows } = await q('SELECT path, poster_path FROM assets WHERE project_id=$1', [project.id]);
    for (const asset of rows) {
      if (asset.path) await fs.rm(asset.path, { force: true }).catch(() => {});
      if (asset.poster_path) await fs.rm(asset.poster_path, { force: true }).catch(() => {});
    }
    await q('DELETE FROM assets WHERE project_id=$1', [project.id]);
    await q('DELETE FROM projects WHERE id=$1', [project.id]);
    res.json({ ok: true });
  }),
);

async function pickModel(task, ready) {
  const candidates = modelsForTask(task);
  const usable = candidates.filter(
    (m) => ready[m.providerId]?.enabled && (!m.requiresKey || (ready[m.providerId].configured && ready[m.providerId].verified)),
  );
  return usable.find((m) => m.providerId !== 'local') || usable.find((m) => m.providerId === 'local') || null;
}

router.post(
  '/:id/generate',
  asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.id, req.user.id);
    if (!project) throw new HttpError('Project not found.', 404, 'not_found');
    const body = req.body || {};
    const task = oneOf(body.task, ['text_to_video', 'image_to_video', 'text_to_image', 'extend'], 'text_to_video');

    let providerId = body.providerId || project.provider_id;
    let modelId = body.modelId || project.model_id;
    let model = providerId && modelId ? getModel(providerId, modelId) : null;
    if (!model || !model.tasks.includes(task)) {
      const ready = await readiness();
      const picked = await pickModel(task, ready);
      if (!picked) {
        throw new HttpError(
          'No provider is available for this task. Connect and verify a provider in Admin → Providers, or use the built-in local render.',
          409,
          'no_provider',
        );
      }
      providerId = picked.providerId;
      modelId = picked.id;
      model = picked;
    }
    if (getProvider(providerId)?.requiresKey) {
      const ready = await readiness();
      const state = ready[providerId];
      if (!state?.configured || !state?.verified) {
        throw new HttpError(
          `${getProvider(providerId).name} is not connected and verified yet. Add its API key and run a connection test in Admin → Providers.`,
          409,
          'provider_not_ready',
        );
      }
    }

    const imageAssetId = body.imageAssetId || project.settings?.imageAssetId || null;
    if (task === 'image_to_video' && !imageAssetId) {
      throw new HttpError('Upload a source image first for image-to-video.', 400, 'image_required');
    }

    const job = await createJob({
      user: req.user,
      project,
      providerId,
      modelId,
      task,
      request: {
        prompt: project.enhanced_prompt || project.brief,
        negativePrompt: project.negative_prompt,
        aspect: project.aspect,
        duration: Number(project.duration_sec),
        resolution: body.resolution || model.resolutions[0],
        imageAssetId,
      },
    });
    res.status(202).json({ job: jobView(job), providerId, modelId });
  }),
);

router.post(
  '/:id/scenes/:sceneId/generate',
  asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.id, req.user.id);
    if (!project) throw new HttpError('Project not found.', 404, 'not_found');
    const sceneRes = await q('SELECT * FROM scenes WHERE id=$1 AND project_id=$2', [req.params.sceneId, project.id]);
    const scene = sceneRes.rows[0];
    if (!scene) throw new HttpError('Scene not found.', 404, 'not_found');

    const task = project.settings?.imageAssetId ? 'image_to_video' : 'text_to_video';
    const ready = await readiness();
    const body = req.body || {};
    let providerId = body.providerId;
    let modelId = body.modelId;
    let model = providerId && modelId ? getModel(providerId, modelId) : null;
    if (!model || !model.tasks.includes(task)) {
      const picked = await pickModel(task, ready);
      if (!picked) throw new HttpError('No provider is available for this task.', 409, 'no_provider');
      providerId = picked.providerId;
      modelId = picked.id;
      model = picked;
    }
    if (getProvider(providerId)?.requiresKey && (!ready[providerId]?.configured || !ready[providerId]?.verified)) {
      throw new HttpError(`${getProvider(providerId).name} is not connected and verified yet.`, 409, 'provider_not_ready');
    }

    const job = await createJob({
      user: req.user,
      project,
      providerId,
      modelId,
      task,
      sceneId: scene.id,
      request: {
        prompt: scene.prompt || scene.description,
        negativePrompt: project.negative_prompt,
        aspect: project.aspect,
        duration: Number(scene.duration_sec),
        resolution: body.resolution || model.resolutions[0],
        imageAssetId: project.settings?.imageAssetId || null,
      },
    });
    res.status(202).json({ job: jobView(job) });
  }),
);

router.post(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.id, req.user.id);
    if (!project) throw new HttpError('Project not found.', 404, 'not_found');
    await q('INSERT INTO favorites (user_id, project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, project.id]);
    res.json({ ok: true, favorite: true });
  }),
);

router.delete(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    await q('DELETE FROM favorites WHERE user_id=$1 AND project_id=$2', [req.user.id, req.params.id]);
    res.json({ ok: true, favorite: false });
  }),
);

export default router;
