import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = text => createHash('sha256').update(text).digest('hex');
const mac = (token, fields) => createHmac('sha256', Buffer.from(token, 'hex')).update(JSON.stringify(fields)).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export function signRequest(config, method, path, body = '', { now = Date.now(), nonce = randomBytes(32).toString('hex') } = {}) {
  const timestamp = String(now), bodyHash = digest(body);
  const signature = mac(config.token, ['chatrelay.http.request.v1', config.port, method, path, timestamp, nonce, bodyHash]);
  return { timestamp, nonce, bodyHash, signature, authorization: `ChatRelay-HMAC ${timestamp}.${nonce}.${bodyHash}.${signature}` };
}

export function verifyRequest(config, method, path, authorization, { now = Date.now() } = {}) {
  const match = /^ChatRelay-HMAC (\d{13})\.([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(authorization || '');
  if (!match) return null;
  const [, timestamp, nonce, bodyHash, signature] = match;
  if (Math.abs(now - Number(timestamp)) > 30000) return null;
  const expected = mac(config.token, ['chatrelay.http.request.v1', config.port, method, path, timestamp, nonce, bodyHash]);
  return equal(signature, expected) ? { timestamp, nonce, bodyHash, signature } : null;
}

export const verifyBody = (auth, body) => equal(auth.bodyHash, digest(body));
export const signResponse = (token, auth, status, body) => mac(token, ['chatrelay.http.response.v1', auth.nonce, auth.signature, status, digest(body)]);
export const verifyResponse = (token, auth, status, body, signature) => equal(signResponse(token, auth, status, body), signature);

export class ReplayGuard {
  constructor({ now = Date.now, limit = 4096 } = {}) { this.now = now; this.limit = limit; this.nonces = new Map(); }
  accept(nonce) {
    const now = this.now();
    for (const [key, expires] of this.nonces) if (expires <= now) this.nonces.delete(key);
    if (this.nonces.has(nonce)) return false;
    if (this.nonces.size >= this.limit) throw new Error('Local authentication request capacity reached.');
    this.nonces.set(nonce, now + 90000);
    return true;
  }
}
