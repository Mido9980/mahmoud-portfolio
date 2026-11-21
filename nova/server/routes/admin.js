import { Router } from 'express';
import fs from 'node:fs';
import { q, withTx } from '../db.js';
import { requireAdmin } from '../auth.js';
import { HttpError, asyncHandler } from '../http.js';
import { encryptJson } from '../crypto.js';
import { PROVIDERS, getProvider } from '../providers/registry.js';
import { readiness, resolveCredentials, publicProviderState } from '../providers/keys.js';
import * as google from '../providers/google.js';
import * as runway from '../providers/runway.js';
import * as kling from '../providers/kling.js';
import { jobView, retryJob, tick, workerState } from '../jobs.js';

const router = Router();
router.use(requireAdmin);

const ADAPTERS = { google, runway, kling };

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [stats, byStatus, recent, ready] = await Promise.all([
      q(`SELECT
          (SELECT count(*)::int FROM users) AS users,
          (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new_users,
          (SELECT count(*)::int FROM projects) AS projects,
          (SELECT count(*)::int FROM jobs) AS jobs,
          (SELECT count(*)::int FROM jobs WHERE status='succeeded') AS succeeded,
          (SELECT count(*)::int FROM jobs WHERE status='failed') AS failed,
          (SELECT count(*)::int FROM jobs WHERE status IN ('queued','starting','running')) AS active,
          (SELECT coalesce(sum(-delta),0)::int FROM credit_ledger WHERE reason='generation_charge') AS credits_spent,
          (SELECT coalesce(sum(credits),0)::int FROM users) AS credits_outstanding,
          (SELECT count(*)::int FROM projects WHERE is_public=true) AS public_creations`),
      q('SELECT status, count(*)::int AS count FROM jobs GROUP BY status'),
      q(`SELECT j.id, j.provider_id, j.model_id, j.status, j.error, j.created_at, u.email
         FROM jobs j JOIN users u ON u.id=j.user_id ORDER BY j.created_at DESC LIMIT 10`),
      readiness(),
    ]);
    const providers = PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      requiresKey: p.requiresKey,
      enabled: ready[p.id]?.enabled !== false,
      configured: Boolean(ready[p.id]?.configured),
      verified: Boolean(ready[p.id]?.verified),
      models: p.models.length,
    }));
    let dbOk = true;
    try {
      await q('SELECT 1');
    } catch {
      dbOk = false;
    }
    res.json({
      stats: stats.rows[0],
      jobsByStatus: byStatus.rows,
      recentJobs: recent.rows,
      providers,
      health: {
        db: dbOk ? 'ok' : 'down',
        worker: workerState.lastTick ? 'ok' : 'starting',
        lastTick: workerState.lastTick,
        ffmpeg: fs.existsSync('/usr/bin/ffmpeg'),
      },
    });
  }),
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? `%${req.query.q.trim().slice(0, 80)}%` : '%';
    const { rows } = await q(
      `SELECT u.id, u.email, u.name, u.role, u.plan_id, u.credits, u.status, u.locale,
              u.created_at, u.last_login_at,
        (SELECT count(*)::int FROM projects p WHERE p.user_id=u.id) AS projects,
        (SELECT count(*)::int FROM jobs j WHERE j.user_id=u.id) AS jobs
       FROM users u
       WHERE u.email ILIKE $1 OR u.name ILIKE $1
       ORDER BY u.created_at DESC LIMIT 200`,
      [search],
    );
    res.json({ users: rows });
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (req.params.id === req.user.id && (body.role || body.status)) {
      throw new HttpError('You cannot change your own role or status.', 400, 'self_change');
    }
    const user = await withTx(async (client) => {
      const current = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.params.id]);
      const row = current.rows[0];
      if (!row) throw new HttpError('User not found.', 404, 'not_found');

      if (body.planId) {
        const plan = await client.query('SELECT id FROM plans WHERE id=$1', [body.planId]);
        if (!plan.rows[0]) throw new HttpError('Unknown plan.', 400, 'invalid_plan');
        await client.query('UPDATE users SET plan_id=$1 WHERE id=$2', [body.planId, row.id]);
      }
      if (body.role && ['user', 'admin'].includes(body.role)) {
        await client.query('UPDATE users SET role=$1 WHERE id=$2', [body.role, row.id]);
      }
      if (body.status && ['active', 'suspended'].includes(body.status)) {
        await client.query('UPDATE users SET status=$1 WHERE id=$2', [body.status, row.id]);
      }
      if (body.credits !== undefined) {
        const target = Math.max(0, Math.min(1_000_000, Math.round(Number(body.credits) || 0)));
        const delta = target - row.credits;
        if (delta !== 0) {
          await client.query('UPDATE users SET credits=$1 WHERE id=$2', [target, row.id]);
          await client.query(
            `INSERT INTO credit_ledger (user_id, delta, reason, ref, balance_after)
             VALUES ($1,$2,'admin_adjustment',$3,$4)`,
            [row.id, delta, `admin:${req.user.id}`, target],
          );
        }
      }
      const updated = await client.query('SELECT * FROM users WHERE id=$1', [row.id]);
      return updated.rows[0];
    });
    await q(`INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'admin.user_update',$2)`, [
      req.user.id,
      JSON.stringify({ target: req.params.id, changes: Object.keys(body) }),
    ]);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        planId: user.plan_id,
        credits: user.credits,
        status: user.status,
      },
    });
  }),
);

router.get(
  '/providers',
  asyncHandler(async (_req, res) => {
    const ready = await readiness();
    const out = [];
    for (const provider of PROVIDERS) {
      const resolved = await resolveCredentials(provider.id);
      out.push({
        ...publicProviderState(provider, ready[provider.id]?.row, resolved),
        keyFields: provider.keyFields,
      });
    }
    res.json({ providers: out });
  }),
);

router.post(
  '/providers/:id/key',
  asyncHandler(async (req, res) => {
    const provider = getProvider(req.params.id);
    if (!provider) throw new HttpError('Unknown provider.', 404, 'not_found');
    if (!provider.requiresKey) throw new HttpError('This provider does not use an API key.', 400, 'no_key_needed');
    const creds = {};
    for (const field of provider.keyFields) {
      const value = req.body?.[field.name];
      if (typeof value !== 'string' || value.trim().length < 4 || value.length > 500) {
        throw new HttpError(`Enter a valid ${field.label}.`, 400, 'invalid_key');
      }
      creds[field.name] = value.trim();
    }
    await q(
      `INSERT INTO provider_keys (provider_id, ciphertext) VALUES ($1,$2)
       ON CONFLICT (provider_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext, updated_at=now()`,
      [provider.id, encryptJson(creds)],
    );
    await q('UPDATE providers SET verified_at=NULL, last_test_ok=NULL, last_test_error=NULL, updated_at=now() WHERE id=$1', [
      provider.id,
    ]);
    await q(`INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'admin.provider_key_set',$2)`, [
      req.user.id,
      JSON.stringify({ provider: provider.id }),
    ]);
    res.json({ ok: true, verified: false, message: 'Key saved encrypted. Run a connection test to verify it.' });
  }),
);

router.delete(
  '/providers/:id/key',
  asyncHandler(async (req, res) => {
    await q('DELETE FROM provider_keys WHERE provider_id=$1', [req.params.id]);
    await q('UPDATE providers SET verified_at=NULL, last_test_ok=NULL, last_test_error=NULL, updated_at=now() WHERE id=$1', [
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);

router.post(
  '/providers/:id/test',
  asyncHandler(async (req, res) => {
    const provider = getProvider(req.params.id);
    if (!provider) throw new HttpError('Unknown provider.', 404, 'not_found');
    if (!provider.requiresKey) {
      throw new HttpError('The built-in renderer does not need a connection test.', 400, 'builtin');
    }
    const resolved = await resolveCredentials(provider.id);
    if (!resolved) throw new HttpError('Save an API key for this provider first.', 400, 'no_credentials');
    const adapter = ADAPTERS[provider.id];
    if (!adapter) throw new HttpError('No adapter for this provider.', 400, 'no_adapter');

    let result;
    try {
      result = await adapter.testConnection(resolved.creds);
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    await q(
      `UPDATE providers SET last_test_at=now(), last_test_ok=$2, last_test_error=$3,
         verified_at = CASE WHEN $2 THEN now() ELSE NULL END, updated_at=now() WHERE id=$1`,
      [provider.id, Boolean(result.ok), result.ok ? null : String(result.error || 'Connection test failed.').slice(0, 500)],
    );
    await q(`INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'admin.provider_test',$2)`, [
      req.user.id,
      JSON.stringify({ provider: provider.id, ok: Boolean(result.ok), source: resolved.source }),
    ]);
    res.json({ ok: Boolean(result.ok), detail: result.detail || null, error: result.ok ? null : result.error });
  }),
);

router.patch(
  '/providers/:id',
  asyncHandler(async (req, res) => {
    const provider = getProvider(req.params.id);
    if (!provider) throw new HttpError('Unknown provider.', 404, 'not_found');
    if (typeof req.body?.enabled === 'boolean') {
      await q('UPDATE providers SET enabled=$2, updated_at=now() WHERE id=$1', [provider.id, req.body.enabled]);
    }
    res.json({ ok: true });
  }),
);

router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '1=1';
    if (typeof req.query.status === 'string' && req.query.status) {
      params.push(req.query.status);
      where = `j.status=$${params.length}`;
    }
    const { rows } = await q(
      `SELECT j.*, u.email, p.title AS project_title,
              (SELECT a.id FROM assets a WHERE a.job_id=j.id LIMIT 1) AS asset_id
       FROM jobs j JOIN users u ON u.id=j.user_id JOIN projects p ON p.id=j.project_id
       WHERE ${where} ORDER BY j.created_at DESC LIMIT 100`,
      params,
    );
    res.json({ jobs: rows.map((r) => ({ ...jobView(r), email: r.email, projectTitle: r.project_title })) });
  }),
);

router.post(
  '/jobs/:id/retry',
  asyncHandler(async (req, res) => {
    const { rows } = await q('SELECT * FROM jobs WHERE id=$1', [req.params.id]);
    if (!rows[0]) throw new HttpError('Job not found.', 404, 'not_found');
    const job = await retryJob({ user: { id: rows[0].user_id }, jobId: req.params.id });
    setImmediate(() => tick().catch(() => {}));
    res.status(202).json({ job: jobView(job) });
  }),
);

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const { rows } = await q('SELECT * FROM plans ORDER BY price_cents');
    res.json({ plans: rows });
  }),
);

router.patch(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const updates = [];
    const values = [];
    if (body.monthlyCredits !== undefined) {
      values.push(Math.max(0, Math.min(1_000_000, Math.round(Number(body.monthlyCredits) || 0))));
      updates.push(`monthly_credits=$${values.length}`);
    }
    if (body.priceCents !== undefined) {
      values.push(Math.max(0, Math.min(10_000_000, Math.round(Number(body.priceCents) || 0))));
      updates.push(`price_cents=$${values.length}`);
    }
    if (typeof body.active === 'boolean') {
      values.push(body.active);
      updates.push(`active=$${values.length}`);
    }
    if (!updates.length) throw new HttpError('Nothing to update.', 400, 'no_changes');
    values.push(req.params.id);
    const { rows } = await q(`UPDATE plans SET ${updates.join(', ')} WHERE id=$${values.length} RETURNING *`, values);
    if (!rows[0]) throw new HttpError('Plan not found.', 404, 'not_found');
    res.json({ plan: rows[0] });
  }),
);

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let dbOk = true;
    try {
      await q('SELECT 1');
    } catch {
      dbOk = false;
    }
    res.json({
      db: dbOk ? 'ok' : 'down',
      worker: workerState.lastTick ? 'ok' : 'starting',
      lastTick: workerState.lastTick,
      lastError: workerState.lastError,
      ffmpeg: fs.existsSync('/usr/bin/ffmpeg'),
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
    });
  }),
);

export default router;
