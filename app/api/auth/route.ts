import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSession, findUserByIdentity, listUsers, revokeSession, type StoredAuthUser } from '@/lib/persistence/repositories/auth';
import { authenticateRequest, AUTH_SESSION_TTL_MS, clearSessionCookie, isSameOriginRequest, setSessionCookie } from '@/lib/persistence/server-auth';
import { getServerDatabase } from '@/lib/persistence/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PASSWORD_ITERATIONS = 210_000;

function publicUser(user: StoredAuthUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions,
  };
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

function createPasswordHash(password: string, salt: Buffer, iterations: number) {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

function cookieSession(response: NextResponse, user: StoredAuthUser, id: string, token: string, expiresAt: number) {
  setSessionCookie(response, id, token, expiresAt);
  return response;
}

export async function GET(request: NextRequest) {
  getServerDatabase();
  const users = await listUsers();
  const user = await authenticateRequest(request);
  const response = NextResponse.json({ hasUsers: users.length > 0, user });
  if (!user && request.cookies.has('accountants_session')) clearSessionCookie(response);
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'درخواست از مبدا معتبر ارسال نشده است.' }, { status: 403 });
  getServerDatabase();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'درخواست معتبر نیست.' }, { status: 400 });
  }

  const action = body.action;
  if (action === 'logout') {
    const principal = await authenticateRequest(request);
    if (principal) {
      const sessionId = request.cookies.get('accountants_session')?.value.split('.')[0];
      if (sessionId) await revokeSession(sessionId);
    }
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  }

  if (action === 'setup') {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (username.length < 3 || password.length < 8 || password.length > 256) {
      return NextResponse.json({ error: 'نام کاربری باید حداقل ۳ و رمز عبور بین ۸ تا ۲۵۶ کاراکتر باشد.' }, { status: 400 });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'ایمیل معتبر وارد کنید.' }, { status: 400 });

    const normalizedUsername = normalizeIdentity(username);
    const normalizedEmail = email ? normalizeIdentity(email) : null;
    const salt = randomBytes(16);
    const now = Date.now();
    const user: StoredAuthUser = {
      id: `usr_${randomUUID()}`,
      username,
      normalizedUsername,
      email: email || undefined,
      normalizedEmail: normalizedEmail || undefined,
      displayName: displayName || username,
      role: 'admin',
      permissions: ['*'],
      passwordHash: createPasswordHash(password, salt, PASSWORD_ITERATIONS).toString('base64'),
      passwordSalt: salt.toString('base64'),
      passwordIterations: PASSWORD_ITERATIONS,
      createdAt: new Date(now).toISOString(),
    };
    const sessionId = `ses_${randomUUID()}`;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('base64');
    const expiresAt = now + AUTH_SESSION_TTL_MS;
    const db = getServerDatabase();
    try {
      db.exec('BEGIN IMMEDIATE;');
      const count = Number((db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count);
      if (count !== 0) {
        db.exec('ROLLBACK;');
        return NextResponse.json({ error: 'حساب مدیر قبلاً ایجاد شده است.' }, { status: 409 });
      }
      db.prepare('INSERT INTO users(id, username, normalized_username, email, normalized_email, display_name, role, permissions_json, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(user.id, user.username, user.normalizedUsername, user.email || null, user.normalizedEmail || null, user.displayName, user.role, JSON.stringify(user.permissions), user.passwordHash, user.passwordSalt, user.passwordIterations, user.createdAt);
      db.prepare('INSERT INTO auth_sessions(id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)')
        .run(sessionId, user.id, tokenHash, now, expiresAt);
      db.exec('COMMIT;');
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch { /* transaction may already be closed */ }
      const message = error instanceof Error ? error.message : '';
      const status = message.includes('UNIQUE') ? 409 : 500;
      return NextResponse.json({ error: status === 409 ? 'نام کاربری یا ایمیل قبلاً استفاده شده است.' : 'ایجاد حساب انجام نشد.' }, { status });
    }

    return cookieSession(NextResponse.json({ user: publicUser(user) }), user, sessionId, token, expiresAt);
  }

  if (action === 'login') {
    const identity = typeof body.identity === 'string' ? normalizeIdentity(body.identity) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!identity || !password || password.length > 256) return NextResponse.json({ error: 'نام کاربری/ایمیل یا رمز عبور صحیح نیست.' }, { status: 401 });
    const user = await findUserByIdentity(identity);
    if (!user) return NextResponse.json({ error: 'نام کاربری/ایمیل یا رمز عبور صحیح نیست.' }, { status: 401 });

    let valid = false;
    try {
      const actual = createPasswordHash(password, Buffer.from(user.passwordSalt, 'base64'), user.passwordIterations);
      const expected = Buffer.from(user.passwordHash, 'base64');
      valid = actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      valid = false;
    }
    if (!valid) return NextResponse.json({ error: 'نام کاربری/ایمیل یا رمز عبور صحیح نیست.' }, { status: 401 });

    const now = Date.now();
    const sessionId = `ses_${randomUUID()}`;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + AUTH_SESSION_TTL_MS;
    await createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('base64'),
      createdAt: now,
      expiresAt,
    });
    return cookieSession(NextResponse.json({ user: publicUser(user) }), user, sessionId, token, expiresAt);
  }

  return NextResponse.json({ error: 'عملیات شناخته‌شده نیست.' }, { status: 400 });
}
