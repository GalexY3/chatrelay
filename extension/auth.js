/* Mutual loopback authentication. The bridge credential is never sent in plaintext. */
(() => {
  if (globalThis.ChatRelayAuth) return;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const validHex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
  const hex = value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
  function bytes(value) {
    if (typeof value !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(value)) throw new Error('Invalid authentication bytes.');
    return Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
  }
  function context(value) {
    if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 ||
        !/^chrome-extension:\/\/[a-p]{32}$/.test(value.origin) ||
        !validHex(value.serverNonce, 64) || !validHex(value.clientNonce, 64)) throw new Error('Invalid authentication context.');
    return [2, value.port, value.origin, value.serverNonce, value.clientNonce];
  }
  const payload = (domain, value, extra = []) => JSON.stringify([domain, ...context(value), ...extra]);
  function credentialBytes(secret) {
    if (!validHex(secret, 64)) throw new Error('Invalid local credential.');
    return bytes(secret);
  }
  async function hmacKey(secret) { return crypto.subtle.importKey('raw', credentialBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
  const sign = async (secret, value) => hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(value)));
  const verify = async (secret, value, proof) => validHex(proof, 64) && await crypto.subtle.verify('HMAC', await hmacKey(secret), bytes(proof), encoder.encode(value));
  async function derive(secret, value, domain, algorithm, usages) {
    const material = await crypto.subtle.importKey('raw', credentialBytes(secret), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: bytes(value.serverNonce + value.clientNonce), info: encoder.encode(payload(domain, value)) }, material, algorithm, false, usages);
  }
  const clientProof = (secret, value) => sign(secret, payload('chatrelay.ws.client.v2', value));
  const ackProof = (secret, value) => sign(secret, payload('chatrelay.ws.ack.v2', value));
  const verifyServerProof = (secret, value, proof, box) => verify(secret, payload('chatrelay.ws.server.v2', value, [box?.iv ?? '', box?.ciphertext ?? '']), proof);
  async function decryptCredential(secret, value, box) {
    if (!validHex(box?.iv, 24) || !validHex(box?.ciphertext, 160)) throw new Error('Invalid encrypted pairing credential.');
    const key = await derive(secret, value, 'chatrelay.ws.pairing.v2', { name: 'AES-GCM', length: 256 }, ['decrypt']);
    const credential = decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(box.iv), additionalData: encoder.encode(payload('chatrelay.ws.credential.v2', value)), tagLength: 128 }, key, bytes(box.ciphertext)));
    credentialBytes(credential);
    return credential;
  }
  globalThis.ChatRelayAuth = {
    newNonce: () => hex(crypto.getRandomValues(new Uint8Array(32))),
    clientProof, ackProof, verifyServerProof, decryptCredential,
  };
})();
