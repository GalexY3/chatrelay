import { randomBytes, createHmac, timingSafeEqual, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto';

export const WS_PROTOCOL = 2;
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
function context(value) {
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 ||
      !/^chrome-extension:\/\/[a-p]{32}$/.test(value.origin) ||
      !hex(value.serverNonce, 64) || !hex(value.clientNonce, 64)) throw new Error('Invalid authentication context.');
  return [WS_PROTOCOL, value.port, value.origin, value.serverNonce, value.clientNonce];
}
function key(secret) {
  if (!hex(secret, 64)) throw new Error('Invalid local credential.');
  return Buffer.from(secret, 'hex');
}
function payload(domain, value, extra = []) { return JSON.stringify([domain, ...context(value), ...extra]); }
function sign(secret, value) { return createHmac('sha256', key(secret)).update(value).digest('hex'); }
function verify(secret, value, proof) {
  return hex(proof, 64) && timingSafeEqual(Buffer.from(sign(secret, value), 'hex'), Buffer.from(proof, 'hex'));
}
function derive(secret, value, domain) {
  return Buffer.from(hkdfSync('sha256', key(secret), Buffer.from(value.serverNonce + value.clientNonce, 'hex'), Buffer.from(payload(domain, value)), 32));
}
export const newNonce = () => randomBytes(32).toString('hex');
export const clientProof = (secret, value) => sign(secret, payload('chatrelay.ws.client.v2', value));
export const verifyClientProof = (secret, value, proof) => verify(secret, payload('chatrelay.ws.client.v2', value), proof);
export const ackProof = (secret, value) => sign(secret, payload('chatrelay.ws.ack.v2', value));
export const verifyAckProof = (secret, value, proof) => verify(secret, payload('chatrelay.ws.ack.v2', value), proof);
const boxFields = box => [box?.iv ?? '', box?.ciphertext ?? ''];
export const serverProof = (secret, value, box) => sign(secret, payload('chatrelay.ws.server.v2', value, boxFields(box)));
export const verifyServerProof = (secret, value, proof, box) => verify(secret, payload('chatrelay.ws.server.v2', value, boxFields(box)), proof);

export function encryptCredential(secret, value, credential) {
  key(credential);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(secret, value, 'chatrelay.ws.pairing.v2'), iv);
  cipher.setAAD(Buffer.from(payload('chatrelay.ws.credential.v2', value)));
  const encrypted = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { iv: iv.toString('hex'), ciphertext: encrypted.toString('hex') };
}
export function decryptCredential(secret, value, box) {
  if (!hex(box?.iv, 24) || !hex(box?.ciphertext, 160)) throw new Error('Invalid encrypted pairing credential.');
  const encrypted = Buffer.from(box.ciphertext, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', derive(secret, value, 'chatrelay.ws.pairing.v2'), Buffer.from(box.iv, 'hex'));
  decipher.setAAD(Buffer.from(payload('chatrelay.ws.credential.v2', value)));
  decipher.setAuthTag(encrypted.subarray(-16));
  const credential = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8');
  key(credential);
  return credential;
}
