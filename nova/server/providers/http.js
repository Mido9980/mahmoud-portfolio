export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export async function jsonFetch(url, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } catch (err) {
    if (err.name === 'AbortError') throw new ProviderError('Provider request timed out.', 504);
    throw new ProviderError(`Provider request failed: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

export function providerMessage(body, status) {
  const message =
    body?.error?.message ||
    body?.error ||
    body?.message ||
    body?.detail ||
    (typeof body === 'string' ? body.slice(0, 300) : null);
  return message ? `${message} (HTTP ${status})` : `Provider returned HTTP ${status}`;
}
