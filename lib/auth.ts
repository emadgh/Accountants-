export type AuthRole = 'admin' | 'user';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: AuthRole;
  permissions: string[];
}

interface StoredAuthUser extends AuthenticatedUser {
  normalizedUsername: string;
  normalizedEmail?: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  sessionHash?: string;
  createdAt: string;
}

interface StoredSession {
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthSnapshot {
  hasUsers: boolean;
  user: AuthenticatedUser | null;
}

const USERS_KEY = 'accountants-auth-users-v1';
const SESSION_KEY = 'accountants-auth-session-v1';
const PASSWORD_ITERATIONS = 210_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function requireBrowser() {
  if (typeof window === 'undefined' || !window.localStorage || !globalThis.crypto?.subtle) {
    throw new Error('Authentication requires a modern browser with Web Crypto and localStorage.');
  }
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

function readJson<T>(key: string, fallback: T): T {
  requireBrowser();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function readUsers() {
  const value = readJson<unknown>(USERS_KEY, []);
  return Array.isArray(value) ? value as StoredAuthUser[] : [];
}

function writeUsers(users: StoredAuthUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function readSession() {
  const value = readJson<StoredSession | null>(SESSION_KEY, null);
  if (!value || typeof value.userId !== 'string' || typeof value.token !== 'string') return null;
  return value;
}

function writeSession(session: StoredSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSessionStorage() {
  window.localStorage.removeItem(SESSION_KEY);
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

async function issueSession(users: StoredAuthUser[], userId: string) {
  const token = bytesToBase64(randomBytes(32));
  const sessionHash = await digestBase64(token);
  const nextUsers = users.map((user) => user.id === userId ? { ...user, sessionHash } : user);
  writeUsers(nextUsers);
  const now = Date.now();
  writeSession({ userId, token, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  const user = nextUsers.find((item) => item.id === userId);
  if (!user) throw new Error('User not found.');
  return publicUser(user);
}

async function clearMatchingSessionHash(session: StoredSession | null) {
  if (!session) return;
  const users = readUsers();
  const index = users.findIndex((user) => user.id === session.userId);
  if (index < 0 || !users[index].sessionHash) return;
  const tokenHash = await digestBase64(session.token);
  if (!safeEqualBase64(tokenHash, users[index].sessionHash || '')) return;
  const next = [...users];
  next[index] = { ...next[index], sessionHash: undefined };
  writeUsers(next);
}

export async function getAuthSnapshot(): Promise<AuthSnapshot> {
  requireBrowser();
  const users = readUsers();
  if (!users.length) {
    clearSessionStorage();
    return { hasUsers: false, user: null };
  }

  const session = readSession();
  if (!session) return { hasUsers: true, user: null };

  if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    await clearMatchingSessionHash(session);
    clearSessionStorage();
    return { hasUsers: true, user: null };
  }

  const user = users.find((item) => item.id === session.userId);
  if (!user?.sessionHash) {
    clearSessionStorage();
    return { hasUsers: true, user: null };
  }

  const tokenHash = await digestBase64(session.token);
  if (!safeEqualBase64(tokenHash, user.sessionHash)) {
    clearSessionStorage();
    return { hasUsers: true, user: null };
  }

  return { hasUsers: true, user: publicUser(user) };
}

export async function loginWithPassword(identity: string, password: string) {
  requireBrowser();
  const normalized = normalizeIdentity(identity);
  const users = readUsers();
  const user = users.find((item) =>
    item.normalizedUsername === normalized ||
    (!!item.normalizedEmail && item.normalizedEmail === normalized)
  );

  // Keep the user-facing error generic so account existence is not disclosed.
  if (!user || !password) throw new Error('نام کاربری/ایمیل یا رمز عبور صحیح نیست.');

  const candidate = await hashPassword(password, user.passwordSalt, user.passwordIterations);
  if (!safeEqualBase64(candidate, user.passwordHash)) {
    throw new Error('نام کاربری/ایمیل یا رمز عبور صحیح نیست.');
  }

  return issueSession(users, user.id);
}

export async function registerFirstAdmin(input: {
  username: string;
  email?: string;
  displayName?: string;
  password: string;
}) {
  requireBrowser();
  const users = readUsers();
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
    id: 'usr_' + Date.now().toString(36) + '_' + bytesToBase64(randomBytes(6)).replace(/[^a-z0-9]/gi, '').slice(0, 8),
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
  writeUsers([user]);
  return issueSession([user], user.id);
}

export async function logoutCurrentSession() {
  requireBrowser();
  const session = readSession();
  await clearMatchingSessionHash(session);
  clearSessionStorage();
}
