import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://nova:nova_dev_password@localhost:5432/nova',
  max: 10,
  idleTimeoutMillis: 30_000,
});

export function q(text, params = []) {
  return pool.query(text, params);
}

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  monthly_credits integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  plan_id text NOT NULL DEFAULT 'free' REFERENCES plans(id),
  credits integer NOT NULL DEFAULT 25,
  locale text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  ref text,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger(user_id, id DESC);

CREATE TABLE IF NOT EXISTS providers (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_keys (
  provider_id text PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module text NOT NULL DEFAULT 'director',
  title text NOT NULL,
  brief text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en',
  style text,
  aspect text NOT NULL DEFAULT '16:9',
  duration_sec integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'draft',
  engine text,
  enhanced_prompt text,
  negative_prompt text,
  provider_id text,
  model_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_public_idx ON projects(is_public) WHERE is_public;

CREATE TABLE IF NOT EXISTS scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  description text NOT NULL DEFAULT '',
  camera_angle text,
  camera_move text,
  lighting text,
  subject_action text,
  environment text,
  style text,
  duration_sec numeric(6,2) NOT NULL DEFAULT 2.5,
  prompt text,
  status text NOT NULL DEFAULT 'planned'
);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_idx ON scenes(project_id, idx);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  model_id text NOT NULL,
  task text NOT NULL DEFAULT 'text_to_video',
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_job_id text,
  scene_id uuid,
  error text,
  credits_charged integer NOT NULL DEFAULT 0,
  refunded boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  finished_at timestamptz,
  next_poll_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status, next_poll_at);
CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  job_id uuid,
  scene_id uuid,
  kind text NOT NULL,
  path text NOT NULL,
  poster_path text,
  mime text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  width integer,
  height integer,
  duration_sec numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_user_idx ON assets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid,
  action text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const PLANS = [
  {
    id: 'free',
    name_en: 'Explorer',
    name_ar: 'مستكشف',
    credits: 25,
    price: 0,
    features: ['25 credits / month', 'Storyboard director', 'Local storyboard render', 'Private library'],
    features_ar: ['٢٥ كريدت شهريًا', 'مخرج القصة المصورة', 'رندر محلي للقصة', 'مكتبة خاصة'],
  },
  {
    id: 'creator',
    name_en: 'Creator',
    name_ar: 'مبدع',
    credits: 400,
    price: 1900,
    features: ['400 credits / month', 'Priority generation queue', 'Provider models (own API key)', 'Commercial usage'],
    features_ar: ['٤٠٠ كريدت شهريًا', 'أولوية في التنفيذ', 'موديلات المزودين (مفتاحك)', 'استخدام تجاري'],
  },
  {
    id: 'studio',
    name_en: 'Studio',
    name_ar: 'استوديو',
    credits: 1500,
    price: 4900,
    features: ['1,500 credits / month', 'Team-ready library', 'All modules unlocked', 'Priority support'],
    features_ar: ['١٥٠٠ كريدت شهريًا', 'مكتبة جاهزة للفريق', 'كل الوحدات مفتوحة', 'دعم أولوية'],
  },
];

const PROVIDERS = ['local', 'google', 'runway', 'kling'];

export async function initDb() {
  // The compose healthcheck gates the app, but keep a short retry window for
  // restarts where the socket is up before the database accepts queries.
  let lastErr;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (lastErr) throw lastErr;

  await pool.query(SCHEMA);

  for (const p of PLANS) {
    await pool.query(
      `INSERT INTO plans (id, name_en, name_ar, monthly_credits, price_cents, features)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name_en=EXCLUDED.name_en, name_ar=EXCLUDED.name_ar,
         monthly_credits=EXCLUDED.monthly_credits, price_cents=EXCLUDED.price_cents, features=EXCLUDED.features`,
      [p.id, p.name_en, p.name_ar, p.credits, p.price, JSON.stringify({ en: p.features, ar: p.features_ar })],
    );
  }

  for (const id of PROVIDERS) {
    await pool.query('INSERT INTO providers (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
  }

  return pool;
}
