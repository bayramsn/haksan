import { describe, expect, it } from 'vitest';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { createTrustedProxy } from '../src/shared/http/trusted-proxy';

describe('Trusted proxy headers', () => {
  it('accepts the private Docker proxy and ignores client-injected extra hops', async () => {
    const app = new FastifyAdapter({ trustProxy: createTrustedProxy(1) }).getInstance();
    app.get('/', (req) => ({ ip: req.ip, host: req.host, protocol: req.protocol }));
    try {
      const response = await app.inject({
        method: 'GET', url: '/', remoteAddress: '172.18.0.3',
        headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.7', 'x-forwarded-host': 'crm.example.com', 'x-forwarded-proto': 'https' },
      });
      expect(response.json()).toEqual({ ip: '203.0.113.7', host: 'crm.example.com', protocol: 'https' });
      const direct = await app.inject({ method: 'GET', url: '/', remoteAddress: '203.0.113.8', headers: { 'x-forwarded-for': '198.51.100.99', 'x-forwarded-host': 'spoofed.example.com', 'x-forwarded-proto': 'https' } });
      expect(direct.json()).toEqual({ ip: '203.0.113.8', host: 'localhost:80', protocol: 'http' });
    } finally {
      await app.close();
    }
  });

  it('handles disabled proxy trust, IPv6 and mapped Docker addresses', () => {
    expect(createTrustedProxy(0)('172.18.0.3', 0)).toBe(false);
    const trust = createTrustedProxy(1);
    expect(trust('::ffff:172.18.0.3', 0)).toBe(true);
    expect(trust('::1', 0)).toBe(true);
    expect(trust('fd00::1', 0)).toBe(true);
    expect(trust('2001:db8::1', 0)).toBe(false);
    expect(trust('172.18.0.3', 1)).toBe(false);
    expect(trust('invalid', 0)).toBe(false);
  });
});
