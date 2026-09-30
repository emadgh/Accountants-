import { describe, expect, it } from 'vitest';
import { requestIsSameOrigin } from '../lib/persistence/request-security';

describe('requestIsSameOrigin', () => {
  it('accepts a request whose origin matches the host and protocol', () => {
    expect(requestIsSameOrigin({
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      protocol: 'http:',
    })).toBe(true);
  });

  it('rejects missing, malformed, cross-host, and cross-protocol origins', () => {
    expect(requestIsSameOrigin({ origin: null, host: 'localhost:3000', protocol: 'http:' })).toBe(false);
    expect(requestIsSameOrigin({ origin: 'not a url', host: 'localhost:3000', protocol: 'http:' })).toBe(false);
    expect(requestIsSameOrigin({ origin: 'https://attacker.example', host: 'localhost:3000', protocol: 'http:' })).toBe(false);
    expect(requestIsSameOrigin({ origin: 'https://localhost:3000', host: 'localhost:3000', protocol: 'http:' })).toBe(false);
  });

  it('uses forwarded host and protocol when running behind a TLS reverse proxy', () => {
    expect(requestIsSameOrigin({
      origin: 'https://accounts.example.com',
      host: 'internal:3000',
      forwardedHost: 'accounts.example.com',
      forwardedProtocol: 'https',
      protocol: 'http:',
    })).toBe(true);
  });
});
