import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler } from '../http.js';
import { PROMPT_TEMPLATES } from '../director.js';
import { projectView } from './projects.js';

const router = Router();

router.get(
  '/creations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [req.user.id];
    let where = 'p.user_id=$1';
    if (req.query.type === 'video') {
      where += ` AND EXISTS(SELECT 1 FROM assets a WHERE a.project_id=p.id AND a.kind='video')`;
    } else if (req.query.type === 'image') {
      where += ` AND EXISTS(SELECT 1 FROM assets a WHERE a.project_id=p.id AND a.kind='image' AND a.job_id IS NOT NULL)`;
    }
    if (req.query.favorite === '1') {
      where += ` AND EXISTS(SELECT 1 FROM favorites f WHERE f.project_id=p.id AND f.user_id=$1)`;
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      params.push(`%${req.query.q.trim().slice(0, 80)}%`);
      where += ` AND (p.title ILIKE $${params.length} OR p.brief ILIKE $${params.length})`;
    }
    const { rows } = await q(
      `SELECT p.*,
        (SELECT a.id FROM assets a WHERE a.project_id=p.id AND a.kind='video' ORDER BY a.created_at DESC LIMIT 1) AS video_asset_id,
        (SELECT a.id FROM assets a WHERE a.project_id=p.id ORDER BY a.created_at DESC LIMIT 1) AS cover_asset_id,
        (SELECT a.kind FROM assets a WHERE a.project_id=p.id ORDER BY a.created_at DESC LIMIT 1) AS cover_kind,
        EXISTS(SELECT 1 FROM favorites f WHERE f.project_id=p.id AND f.user_id=$1) AS favorite
       FROM projects p WHERE ${where} ORDER BY p.updated_at DESC LIMIT 200`,
      params,
    );
    res.json({ projects: rows.map(projectView) });
  }),
);

router.get(
  '/discover',
  asyncHandler(async (_req, res) => {
    const { rows } = await q(
      `SELECT p.id, p.title, p.style, p.aspect, p.duration_sec, p.created_at, u.name AS author_name,
        (SELECT a.id FROM assets a WHERE a.project_id=p.id AND a.kind='video' ORDER BY a.created_at DESC LIMIT 1) AS video_id
       FROM projects p JOIN users u ON u.id=p.user_id
       WHERE p.is_public=true ORDER BY p.created_at DESC LIMIT 12`,
    );
    res.json({
      templates: PROMPT_TEMPLATES,
      creations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        style: r.style,
        aspect: r.aspect,
        duration: Number(r.duration_sec),
        author: r.author_name,
        createdAt: r.created_at,
        videoUrl: r.video_id ? `/api/public/creations/${r.id}/video` : null,
        posterUrl: r.video_id ? `/api/public/creations/${r.id}/poster` : null,
      })),
    });
  }),
);

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const { rows } = await q('SELECT * FROM plans WHERE active=true ORDER BY price_cents');
    res.json({ plans: rows, billingEnabled: false });
  }),
);

export default router;
