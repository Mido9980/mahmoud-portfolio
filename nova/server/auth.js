import { q, withTx } from './db.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';

export const SESSION_COOKIE = 'nova_sid';
const SESSION_DAYS = 30;

const loginAttempts = new Map();

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isSecure(req) {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

export function setSessionCookie(res, req, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res, req) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    planId: row.plan_id,
    credits: row.credits,
    locale: row.locale,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function createSession(req, res, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, sha256(token), expires, req.ip || null, (req.get('user-agent') || '').slice(0, 300)],
  );
  setSessionCookie(res, req, token);
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await q('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
  clearSessionCookie(res, req);
}

export async function attachUser(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return next();
    const { rows } = await q(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash=$1 AND s.expires_at > now() LIMIT 1`,
      [sha256(token)],
    );
    if (rows[0] && rows[0].status === 'active') req.user = publicUser(rows[0]);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.' } });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue.' } });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Administrator access required.' } });
  }
  next();
}

export function checkLoginThrottle(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.until > Date.now()) {
    return { allowed: false, retryInSec: Math.ceil((entry.until - Date.now()) / 1000) };
  }
  loginAttempts.delete(key);
  return { allowed: true };
}

export function noteLoginFailure(key) {
  const entry = loginAttempts.get(key) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 8) {
    entry.until = Date.now() + 10 * 60_000;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

export function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function registerUser({ email, password, name, locale }, req, res) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!EMAIL_RE.test(cleanEmail)) {
    const err = new Error('Enter a valid email address.');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    const err = new Error('Password must be at least 8 characters.');
    err.status = 400;
    throw err;
  }
  if (cleanName.length < 2) {
    const err = new Error('Enter your name.');
    err.status = 400;
    throw err;
  }

  const hash = hashPassword(password);
  const user = await withTx(async (client) => {
    // Serialize the very first registration so exactly one bootstrap admin wins.
    await client.query('SELECT pg_advisory_xact_lock(918273645)');
    const countRes = await client.query('SELECT count(*)::int AS n FROM users');
    const role = countRes.rows[0].n === 0 ? 'admin' : 'user';
    const insert = await client.query(
      `INSERT INTO users (email, name, password_hash, role, locale, credits)
       VALUES ($1,$2,$3,$4,$5,25) RETURNING *`,
      [cleanEmail, cleanName, hash, role, locale === 'ar' ? 'ar' : 'en'],
    );
    const row = insert.rows[0];
    await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, ref, balance_after)
       VALUES ($1, 25, 'welcome_bonus', 'signup', 25)`,
      [row.id],
    );
    await client.query(`INSERT INTO audit_log (user_id, action, meta) VALUES ($1,'user.register',$2)`, [
      row.id,
      JSON.stringify({ email: cleanEmail }),
    ]);
    return row;
  }).catch((err) => {
    if (err.code === '23505') {
      const e = new Error('An account with this email already exists.');
      e.status = 409;
      throw e;
    }
    throw err;
  });

  await createSession(req, res, user.id);
  await q('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
  return publicUser(user);
}

export async function loginUser({ email, password }, req, res) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const throttle = checkLoginThrottle(cleanEmail);
  if (!throttle.allowed) {
    const err = new Error(`Too many attempts. Try again in ${throttle.retryInSec}s.`);
    err.status = 429;
    throw err;
  }
  const { rows } = await q('SELECT * FROM users WHERE lower(email)=$1 LIMIT 1', [cleanEmail]);
  const row = rows[0];
  const ok = row && verifyPassword(String(password || ''), row.password_hash);
  if (!ok) {
    noteLoginFailure(cleanEmail);
    const err = new Error('Email or password is incorrect.');
    err.status = 401;
    throw err;
  }
  if (row.status !== 'active') {
    const err = new Error('This account is suspended. Contact the administrator.');
    err.status = 403;
    throw err;
  }
  clearLoginFailures(cleanEmail);
  await createSession(req, res, row.id);
  await q('UPDATE users SET last_login_at=now() WHERE id=$1', [row.id]);
  return publicUser(row);
}
