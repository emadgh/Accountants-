import {
  createSession,
  createUser,
  findSessionById,
  findUserById,
  findUserByIdentity,
  listUsers,
  revokeSession,
  type StoredAuthUser,
} from './persistence/repositories/auth';

export type AuthRole = 'admin' | 'user';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: AuthRole;
  permissions: string[];
}

interface BrowserSession {
  id: string;
  token: string;
  expiresAt: number;
}

export interface AuthSnapshot {
  hasUsers: boolean;
  user: AuthenticatedUser | null;
}

const SESSION_KEY = 'accountants-auth-session-v2';
const PASSWORD_ITERATIONS = 210_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function requireBrowser() {
  if (
    typeof window === 'undefined' ||
    !window.sessionStorage ||
    !globalThis.crypto?.subtle
  ) {
    throw new Error('Authentication requires a modern browser with Web Crypto and sessionStorage.');
  }
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

function readBrowserSession(): BrowserSession | null {
  requireBrowser();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserSession;
    if (!parsed.id || !parsed.token || !Number.isFinite(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowserSession(session: BrowserSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearBrowserSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

function randomBytes(length: number) {
  requireBrowser();
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digestBase64(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function hashPassword(password: string, saltBase64: string, iterations: number) {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(saltBase64),
      iterations,
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function safeEqualBase64(left: string, right: string) {
  try {
    const a = base64ToBytes(left);
    const b = base64ToBytes(right);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
    return diff === 0;
  } catch {
    return false;
  }
}

function publicUser(user: StoredAuthUser): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions || [],
  };
}

function makeId(prefix: string) {
  return (
    prefix +
    '_' +
    Date.now().toString(36) +
    '_' +
    bytesToBase64(randomBytes(8)).replace(/[^a-z0-9]/gi, '').slice(0, 10)
  );
}

async function issueSession(user: StoredAuthUser) {
  const token = bytesToBase64(randomBytes(32));
  const tokenHash = await digestBase64(token);
  const now = Date.now();
  const session = {
    id: makeId('ses'),
    userId: user.id,
    tokenHash,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  await createSession(session);
  writeBrowserSession({ id: session.id, token, expiresAt: session.expiresAt });
  return publicUser(user);
}

export async function getAuthSnapshot(): Promise<AuthSnapshot> {
  requireBrowser();
  const users = await listUsers();
  if (!users.length) {
    clearBrowserSession();
    return { hasUsers: false, user: null };
  }

  const browserSession = readBrowserSession();
  if (!browserSession) return { hasUsers: true, user: null };

  if (browserSession.expiresAt <= Date.now()) {
    await revokeSession(browserSession.id);
    clearBrowserSession();
    return { hasUsers: true, user: null };
  }

  const storedSession = await findSessionById(browserSession.id);
  if (
    !storedSession ||
    storedSession.revokedAt ||
    storedSession.expiresAt <= Date.now()
  ) {
    clearBrowserSession();
    return { hasUsers: true, user: null };
  }

  const tokenHash = await digestBase64(browserSession.token);
  if (!safeEqualBase64(tokenHash, storedSession.tokenHash)) {
    await revokeSession(browserSession.id);
    clearBrowserSession();
    return { hasUsers: true, user: null };
  }

  const user = await findUserById(storedSession.userId);
  if (!user) {
    clearBrowserSession();
    return { hasUsers: true, user: null };
  }

  return { hasUsers: true, user: publicUser(user) };
}

export async function loginWithPassword(identity: string, password: string) {
  requireBrowser();
  const normalized = normalizeIdentity(identity);
  const user = await findUserByIdentity(normalized);

  if (!user || !password) throw new Error('نام کاربری/ایمیل یا رمز عبور صحیح نیست.');

  const candidate = await hashPassword(password, user.passwordSalt, user.passwordIterations);
  if (!safeEqualBase64(candidate, user.passwordHash)) {
    throw new Error('نام کاربری/ایمیل یا رمز عبور صحیح نیست.');
  }

  return issueSession(user);
}

export async function registerFirstAdmin(input: {
  username: string;
  email?: string;
  displayName?: string;
  password: string;
}) {
  requireBrowser();
  const users = await listUsers();
  if (users.length) throw new Error('حساب مدیر قبلاً ایجاد شده است.');

  const username = input.username.trim();
  const email = input.email?.trim() || undefined;
  const normalizedUsername = normalizeIdentity(username);
  const normalizedEmail = email ? normalizeIdentity(email) : undefined;

  if (username.length < 3) throw new Error('نام کاربری باید حداقل ۳ کاراکتر باشد.');
  if (input.password.length < 8) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('ایمیل معتبر وارد کنید.');

  const salt = bytesToBase64(randomBytes(16));
  const passwordHash = await hashPassword(input.password, salt, PASSWORD_ITERATIONS);
  const user: StoredAuthUser = {
    id: makeId('usr'),
    username,
    normalizedUsername,
    email,
    normalizedEmail,
    displayName: input.displayName?.trim() || username,
    role: 'admin',
    permissions: ['*'],
    passwordHash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    createdAt: new Date().toISOString(),
  };

  await createUser(user);
  return issueSession(user);
}

export async function logoutCurrentSession() {
  requireBrowser();
  const browserSession = readBrowserSession();
  if (browserSession) await revokeSession(browserSession.id);
  clearBrowserSession();
}
