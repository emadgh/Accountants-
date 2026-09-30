import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import {
  findSessionById,
  findUserById,
  revokeSession,
  type StoredAuthUser,
} from './repositories/auth';
import { getServerDatabase } from './server-database';
import { requestIsSameOrigin } from './request-security';

export const AUTH_COOKIE_NAME = 'accountants_session';
export const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthPrincipal = Pick<StoredAuthUser, 'id' | 'username' | 'email' | 'displayName' | 'role' | 'permissions'>;

function toPrincipal(user: StoredAuthUser): AuthPrincipal {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions || [],
  };
}

export async function authenticateRequest(request: NextRequest): Promise<AuthPrincipal | null> {
  getServerDatabase();
  const value = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!value) return null;

  const separator = value.indexOf('.');
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (!token) return null;

  const session = await findSessionById(id);
  if (!session || session.revokedAt) return null;
  if (session.expiresAt <= Date.now()) {
    await revokeSession(id);
    return null;
  }

  const actualHash = createHash('sha256').update(token).digest();
  let storedHash: Buffer;
  try {
    storedHash = Buffer.from(session.tokenHash, 'base64');
  } catch {
    return null;
  }
  if (actualHash.length !== storedHash.length || !timingSafeEqual(actualHash, storedHash)) return null;

  const user = await findUserById(session.userId);
  return user ? toPrincipal(user) : null;
}

export function isSameOriginRequest(request: NextRequest) {
  return requestIsSameOrigin({
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProtocol: request.headers.get('x-forwarded-proto'),
    protocol: request.nextUrl.protocol,
  });
}

export function setSessionCookie(response: NextResponse, id: string, token: string, expiresAt: number) {
  response.cookies.set(AUTH_COOKIE_NAME, `${id}.${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}
