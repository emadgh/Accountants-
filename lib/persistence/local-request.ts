import type { NextRequest } from 'next/server';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isLocalRequest(request: NextRequest, requireOrigin = false) {
  const host = request.headers.get('host') || '';
  if (!LOCAL_HOST.test(host)) return false;

  const origin = request.headers.get('origin');
  if (!origin) return !requireOrigin;

  try {
    const originUrl = new URL(origin);
    return (
      LOCAL_HOST.test(originUrl.host) &&
      originUrl.host.toLowerCase() === host.toLowerCase() &&
      originUrl.protocol === request.nextUrl.protocol
    );
  } catch {
    return false;
  }
}
