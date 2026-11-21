import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, asyncHandler } from '../http.js';
import { jobView, retryJob, tick } from '../jobs.js';
import { assetView } from './projects.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const params = [req.user.id];
    let where = 'j.user_id=$1';
    if (status) {
      params.push(status);
      where += ` AND j.status=$${params.length}`;
    }
    const { rows } = await q(
      `SELECT j.*, (SELECT a.id FROM assets a WHERE a.job_id=j.id LIMIT 1) AS asset_id,
              p.title AS project_title
       FROM jobs j JOIN projects p ON p.id=j.project_id
       WHERE ${where} ORDER BY j.created_at DESC LIMIT 50`,
      params,
    );
    res.json({ jobs: rows.map((r) => ({ ...jobView(r), projectTitle: r.project_title })) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await q(
      `SELECT j.*, (SELECT a.id FROM assets a WHERE a.job_id=j.id LIMIT 1) AS asset_id,
              p.title AS project_title, p.status AS project_status
       FROM jobs j JOIN projects p ON p.id=j.project_id
       WHERE j.id=$1 AND j.user_id=$2`,
      [req.params.id, req.user.id],
    );
    const job = rows[0];
    if (!job) throw new HttpError('Job not found.', 404, 'not_found');
    let asset = null;
    if (job.asset_id) {
      const assetRes = await q('SELECT * FROM assets WHERE id=$1', [job.asset_id]);
      if (assetRes.rows[0]) asset = assetView(assetRes.rows[0]);
    }
    res.json({ job: { ...jobView(job), projectTitle: job.project_title, projectStatus: job.project_status }, asset });
  }),
);

router.post(
  '/:id/retry',
  asyncHandler(async (req, res) => {
    const job = await retryJob({ user: req.user, jobId: req.params.id });
    setImmediate(() => tick().catch(() => {}));
    res.status(202).json({ job: jobView(job) });
  }),
);

export default router;
