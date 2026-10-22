import { randomBytes } from 'node:crypto';

export class Pairing {
  constructor({ now = Date.now, ttlMs = 120000 } = {}) {
    this.now = now; this.ttlMs = ttlMs; this.tickets = new Map();
  }
  issue(port) {
    for (const [ticket, expires] of this.tickets) if (expires <= this.now()) this.tickets.delete(ticket);
    if (this.tickets.size >= 5) this.tickets.delete(this.tickets.keys().next().value);
    const ticket = randomBytes(32).toString('hex');
    const expiresAt = this.now() + this.ttlMs;
    this.tickets.set(ticket, expiresAt);
    return { code: `cr1:${port}:${ticket}`, expiresAt };
  }
  consume(ticket) {
    if (typeof ticket !== 'string') return false;
    const expires = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return expires !== undefined && expires > this.now();
  }
  candidates() {
    for (const [ticket, expires] of this.tickets) if (expires <= this.now()) this.tickets.delete(ticket);
    return [...this.tickets.keys()];
  }
}
