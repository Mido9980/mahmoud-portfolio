import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { q } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, asyncHandler } from '../http.js';
import { UPLOADS_DIR } from '../jobs.js';
import { streamFile } from '../files.js';
import { projectView, sceneView } from './projects.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(UPLOADS_DIR, { recursive: true })
      .then(() => cb(null, UPLOADS_DIR))
      .catch(cb);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '.png';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new HttpError('Upload a JPG, PNG or WebP image.', 400, 'invalid_file'));
    }
    cb(null, true);
  },
});

router.post(
  '/uploads',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError('No file was uploaded.', 400, 'no_file');
    const { rows } = await q(
      `INSERT INTO assets (user_id, kind, path, mime, bytes) VALUES ($1,'image',$2,$3,$4) RETURNING *`,
      [req.user.id, req.file.path, req.file.mimetype, req.file.size],
    );
    const asset = rows[0];
    res.status(201).json({
      asset: {
        id: asset.id,
        kind: 'image',
        mime: asset.mime,
        bytes: Number(asset.bytes),
        url: `/api/assets/${asset.id}`,
      },
    });
  }),
);

async function ownedAsset(req) {
  const { rows } = await q('SELECT * FROM assets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  return rows[0] || null;
}

router.get(
  '/assets/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const asset = await ownedAsset(req);
    if (!asset) throw new HttpError('Asset not found.', 404, 'not_found');
    streamFile(req, res, asset.path, asset.mime);
  }),
);

router.get(
  '/assets/:id/poster',
  requireAuth,
  asyncHandler(async (req, res) => {
    const asset = await ownedAsset(req);
    if (!asset?.poster_path) throw new HttpError('Poster not found.', 404, 'not_found');
    streamFile(req, res, asset.poster_path, 'image/jpeg');
  }),
);

router.get(
  '/assets/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const asset = await ownedAsset(req);
    if (!asset) throw new HttpError('Asset not found.', 404, 'not_found');
    const ext = path.extname(asset.path) || (asset.kind === 'video' ? '.mp4' : '.png');
    streamFile(req, res, asset.path, asset.mime, { download: true, filename: `nova-${asset.kind}-${asset.id}${ext}` });
  }),
);

// Public share pages. Only projects explicitly published by their owner are
// readable here; everything else stays behind the session cookie.
router.get(
  '/public/creations/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await q(
      `SELECT p.*, u.name AS author_name FROM projects p JOIN users u ON u.id=p.user_id
       WHERE p.id=$1 AND p.is_public=true`,
      [req.params.id],
    );
    const project = rows[0];
    if (!project) throw new HttpError('This creation is not public.', 404, 'not_found');
    const [scenes, assets] = await Promise.all([
      q('SELECT * FROM scenes WHERE project_id=$1 ORDER BY idx', [project.id]),
      q(`SELECT * FROM assets WHERE project_id=$1 AND kind='video' ORDER BY created_at DESC LIMIT 1`, [project.id]),
    ]);
    const video = assets.rows[0];
    res.json({
      creation: {
        id: project.id,
        title: project.title,
        style: project.style,
        aspect: project.aspect,
        duration: Number(project.duration_sec),
        enhancedPrompt: project.enhanced_prompt,
        author: project.author_name,
        createdAt: project.created_at,
        videoUrl: video ? `/api/public/creations/${project.id}/video` : null,
        posterUrl: video?.poster_path ? `/api/public/creations/${project.id}/poster` : null,
        scenes: scenes.rows.map(sceneView),
      },
    });
  }),
);

async function publicVideo(req) {
  const { rows } = await q(
    `SELECT a.* FROM assets a JOIN projects p ON p.id=a.project_id
     WHERE p.id=$1 AND p.is_public=true AND a.kind='video' ORDER BY a.created_at DESC LIMIT 1`,
    [req.params.id],
  );
  return rows[0] || null;
}

router.get(
  '/public/creations/:id/video',
  asyncHandler(async (req, res) => {
    const asset = await publicVideo(req);
    if (!asset) throw new HttpError('Video not found.', 404, 'not_found');
    streamFile(req, res, asset.path, asset.mime);
  }),
);

router.get(
  '/public/creations/:id/poster',
  asyncHandler(async (req, res) => {
    const asset = await publicVideo(req);
    if (!asset?.poster_path) throw new HttpError('Poster not found.', 404, 'not_found');
    streamFile(req, res, asset.poster_path, 'image/jpeg');
  }),
);

export default router;
