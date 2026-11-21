import { q } from '../db.js';
import { decryptJson } from '../crypto.js';
import { getProvider, PROVIDERS } from './registry.js';

const ENV_MAP = {
  google: { apiKey: 'GEMINI_API_KEY' },
  runway: { apiKey: 'RUNWAY_API_KEY' },
  kling: { accessKey: 'KLING_ACCESS_KEY', secretKey: 'KLING_SECRET_KEY' },
};

// Credentials are resolved server-side only. Environment secrets from the
// platform win; a key saved in the admin dashboard is stored encrypted and used
// when the environment does not provide one. Never returned to a client.
export async function resolveCredentials(providerId) {
  const provider = getProvider(providerId);
  if (!provider) return null;
  if (!provider.requiresKey) return { creds: {}, source: 'builtin' };

  const envMap = ENV_MAP[providerId] || {};
  const fields = Object.keys(envMap);
  const fromEnv = {};
  for (const field of fields) {
    const value = process.env[envMap[field]];
    if (value) fromEnv[field] = value;
  }
  if (fields.length && fields.every((f) => fromEnv[f])) {
    return { creds: fromEnv, source: 'env' };
  }

  const { rows } = await q('SELECT ciphertext FROM provider_keys WHERE provider_id=$1', [providerId]);
  if (!rows[0]) return null;
  try {
    const stored = decryptJson(rows[0].ciphertext);
    const required = provider.keyFields.map((f) => f.name);
    if (required.every((f) => stored[f])) return { creds: stored, source: 'dashboard' };
  } catch {
    return null;
  }
  return null;
}

export async function providerStates() {
  const { rows } = await q('SELECT * FROM providers');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, byId: undefined }));
}

// Readiness map used by the model router: a key-requiring provider is only
// routable once it has credentials AND a passing connection test.
export async function readiness() {
  const { rows } = await q('SELECT * FROM providers');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const out = {};
  for (const provider of PROVIDERS) {
    const row = byId[provider.id];
    const resolved = await resolveCredentials(provider.id);
    out[provider.id] = {
      enabled: row?.enabled !== false,
      configured: Boolean(resolved),
      verified: provider.id === 'local' ? true : Boolean(row?.verified_at),
      row: row || null,
    };
  }
  return out;
}

export function publicProviderState(provider, row, resolved) {
  return {
    id: provider.id,
    name: provider.name,
    vendor: provider.vendor,
    requiresKey: provider.requiresKey,
    docs: provider.docs,
    summary: provider.summary,
    tasks: provider.tasks,
    aspects: provider.aspects,
    durations: provider.durations,
    resolutions: provider.resolutions,
    models: provider.models,
    enabled: row?.enabled !== false,
    configured: Boolean(resolved),
    keySource: resolved?.source || null,
    verified: Boolean(row?.verified_at),
    verifiedAt: row?.verified_at || null,
    lastTestAt: row?.last_test_at || null,
    lastTestOk: row?.last_test_ok ?? null,
    lastTestError: row?.last_test_error || null,
  };
}
