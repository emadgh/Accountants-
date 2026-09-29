import {
  createSession,
  createUser,
  createUsers,
  findSessionById,
  findUserById,
  findUserByIdentity,
  listUsers,
  revokeSession,
  type StoredAuthUser,
} from './persistence/repositories/auth';
import { createEmptyAccountingData, seedData } from './data';
import { initializeFirstRunAccountingData } from './storage';

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
const LEGACY_USERS_KEY = 'accountants-auth-users-v1';
const LEGACY_SESSION_KEY = 'accountants-auth-session-v1';
const PASSWORD_ITERATIONS = 210_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let authUsersPromise: Promise<StoredAuthUser[]> | null = null;

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

function isLegacyAuthUser(value: unknown): value is StoredAuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<StoredAuthUser>;
  return (
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.normalizedUsername === 'string' &&
    (user.email === undefined || typeof user.email === 'string') &&
    (user.normalizedEmail === undefined || typeof user.normalizedEmail === 'string') &&
    typeof user.displayName === 'string' &&
    (user.role === 'admin' || user.role === 'user') &&
    Array.isArray(user.permissions) &&
    user.permissions.every((permission) => typeof permission === 'string') &&
    typeof user.passwordHash === 'string' &&
    typeof user.passwordSalt === 'string' &&
    typeof user.passwordIterations === 'number' &&
    Number.isInteger(user.passwordIterations) &&
    Number(user.passwordIterations) > 0 &&
    typeof user.createdAt === 'string'
  );
}

async function loadAuthUsers() {
  const users = await listUsers();
  if (users.length) return users;

  let rawUsers: string | null;
  try {
    rawUsers = window.localStorage.getItem(LEGACY_USERS_KEY);
  } catch {
    return users;
  }
  if (!rawUsers) return users;

  let legacyUsers: unknown;
  try {
    legacyUsers = JSON.parse(rawUsers);
  } catch {
    return users;
  }
  if (!Array.isArray(legacyUsers) || !legacyUsers.length || !legacyUsers.every(isLegacyAuthUser)) {
    return users;
  }

  const migratedUsers = legacyUsers as StoredAuthUser[];
  await createUsers(migratedUsers);
  try {
    window.localStorage.removeItem(LEGACY_USERS_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // The SQLite copy is authoritative once the transaction succeeds.
  }
  return listUsers();
}

async function getAuthUsers() {
  if (!authUsersPromise) authUsersPromise = loadAuthUsers();
  try {
    return await authUsersPromise;
  } finally {
    authUsersPromise = null;
  }
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
  const users = await getAuthUsers();
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
  await getAuthUsers();
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
  seedDemoData: boolean;
}) {
  requireBrowser();
  const users = await getAuthUsers();
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

  await initializeFirstRunAccountingData(input.seedDemoData ? seedData : createEmptyAccountingData());
  await createUser(user);
  return issueSession(user);
}

export async function logoutCurrentSession() {
  requireBrowser();
  const browserSession = readBrowserSession();
  if (browserSession) await revokeSession(browserSession.id);
  clearBrowserSession();
}
