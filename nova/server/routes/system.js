import { Router } from 'express';
import fs from 'node:fs';
import { q, withTx } from '../db.js';
import { asyncHandler } from '../http.js';
import { workerState } from '../jobs.js';
import { MODULES } from '../modules.js';
import { ASPECTS, STYLES } from '../director.js';
import { PROVIDERS } from '../providers/registry.js';
import { readiness } from '../providers/keys.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let dbOk = true;
    try {
      await q('SELECT 1');
    } catch {
      dbOk = false;
    }
    const lastTick = workerState.lastTick ? new Date(workerState.lastTick).getTime() : 0;
    const workerOk = lastTick > 0 && Date.now() - lastTick < 30_000;
    const ok = dbOk && workerOk;
    res.status(ok ? 200 : 503).json({
      ok,
      db: dbOk ? 'ok' : 'down',
      worker: workerOk ? 'ok' : 'stalled',
      lastTick: workerState.lastTick,
      version: '1.0.0',
    });
  }),
);

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      app: 'NOVA AI VIDEO AGENT ULTRA',
      version: '1.0.0',
      modules: MODULES,
      styles: Object.entries(STYLES).map(([id, s]) => ({ id, en: s.en, ar: s.ar, palette: s.palette })),
      aspects: ASPECTS,
      providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, requiresKey: p.requiresKey, tasks: p.tasks })),
      billingEnabled: false,
    });
  }),
);

router.get(
  '/models',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const ready = await readiness();
    res.json({
      providers: PROVIDERS.map((p) => ({
        id: p.id,
        name: p.name,
        vendor: p.vendor,
        requiresKey: p.requiresKey,
        docs: p.docs,
        summary: p.summary,
        tasks: p.tasks,
        aspects: p.aspects,
        durations: p.durations,
        resolutions: p.resolutions,
        models: p.models,
        enabled: ready[p.id]?.enabled !== false,
        configured: Boolean(ready[p.id]?.configured),
        verified: Boolean(ready[p.id]?.verified),
      })),
    });
  }),
);

export default router;
