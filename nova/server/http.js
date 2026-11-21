export class HttpError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function str(value, { max = 500, min = 0 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min) throw new HttpError(`This field needs at least ${min} characters.`, 400, 'invalid_input');
  return s.slice(0, max);
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function int(value, { min = 0, max = 1_000_000, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
