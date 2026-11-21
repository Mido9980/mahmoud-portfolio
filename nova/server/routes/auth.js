import { Router } from 'express';
import { q } from '../db.js';
import { loginUser, registerUser, destroySession, requireAuth, publicUser } from '../auth.js';
import { hashPassword, verifyPassword } from '../crypto.js';
import { HttpError, asyncHandler, str } from '../http.js';
import { providerStates } from '../providers/keys.js';
import { resolveCredentials } from '../providers/keys.js';
import { PROVIDERS } from '../providers/registry.js';

const router = Router();

async function planFor(planId) {
  const { rows } = await q('SELECT * FROM plans WHERE id=$1', [planId]);
  return rows[0] || null;
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const user = await registerUser(
      {
        email: req.body?.email,
        password: req.body?.password,
        name: req.body?.name,
        locale: req.body?.locale,
      },
      req,
      res,
    );
    res.status(201).json({ user, plan: await planFor(user.planId) });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const user = await loginUser({ email: req.body?.email, password: req.body?.password }, req, res);
    res.json({ user, plan: await planFor(user.planId) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [plan, usage, ledger, states] = await Promise.all([
      planFor(req.user.planId),
      q(
        `SELECT
           (SELECT count(*)::int FROM projects WHERE user_id=$1) AS projects,
           (SELECT count(*)::int FROM assets WHERE user_id=$1 AND kind='video') AS videos,
           (SELECT count(*)::int FROM jobs WHERE user_id=$1 AND status='succeeded') AS generations`,
        [req.user.id],
      ),
      q('SELECT delta, reason, ref, balance_after, created_at FROM credit_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 15', [
        req.user.id,
      ]),
      providerStates(),
    ]);
    const byId = Object.fromEntries(states.map((s) => [s.id, s]));
    const providerSummary = [];
    for (const provider of PROVIDERS) {
      const resolved = await resolveCredentials(provider.id);
      const row = byId[provider.id];
      providerSummary.push({
        id: provider.id,
        name: provider.name,
        requiresKey: provider.requiresKey,
        enabled: row?.enabled !== false,
        configured: Boolean(resolved),
        verified: provider.id === 'local' ? true : Boolean(row?.verified_at),
      });
    }
    res.json({
      user: req.user,
      plan,
      usage: usage.rows[0],
      ledger: ledger.rows,
      providers: providerSummary,
    });
  }),
);

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = str(req.body?.name ?? req.user.name, { max: 80, min: 2 });
    const locale = req.body?.locale === 'ar' ? 'ar' : req.body?.locale === 'en' ? 'en' : req.user.locale;
    const { rows } = await q('UPDATE users SET name=$1, locale=$2 WHERE id=$3 RETURNING *', [name, locale, req.user.id]);
    res.json({ user: publicUser(rows[0]) });
  }),
);

router.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!verifyPassword(String(req.body?.currentPassword || ''), rows[0].password_hash)) {
      throw new HttpError('Current password is incorrect.', 400, 'invalid_password');
    }
    const next = String(req.body?.newPassword || '');
    if (next.length < 8) throw new HttpError('New password must be at least 8 characters.', 400, 'weak_password');
    await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(next), req.user.id]);
    await q('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
    res.json({ ok: true, message: 'Password updated. Please sign in again.' });
  }),
);

export default router;
