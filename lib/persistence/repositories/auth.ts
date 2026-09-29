import { sqliteQuery, sqliteTransaction } from '../database';

export type StoredAuthUser = {
  id: string;
  username: string;
  normalizedUsername: string;
  email?: string;
  normalizedEmail?: string;
  displayName: string;
  role: 'admin' | 'user';
  permissions: string[];
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  createdAt: string;
};

export type StoredAuthSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
};

type UserRow = {
  id: string;
  username: string;
  normalized_username: string;
  email: string | null;
  normalized_email: string | null;
  display_name: string;
  role: 'admin' | 'user';
  permissions_json: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

function mapUser(row: UserRow): StoredAuthUser {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    email: row.email || undefined,
    normalizedEmail: row.normalized_email || undefined,
    displayName: row.display_name,
    role: row.role,
    permissions: JSON.parse(row.permissions_json) as string[],
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: Number(row.password_iterations),
    createdAt: row.created_at,
  };
}

function mapSession(row: SessionRow): StoredAuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at == null ? undefined : Number(row.revoked_at),
  };
}

export async function listUsers() {
  const rows = await sqliteQuery<UserRow>('SELECT * FROM users ORDER BY created_at');
  return rows.map(mapUser);
}

export async function findUserByIdentity(normalizedIdentity: string) {
  const rows = await sqliteQuery<UserRow>(
    'SELECT * FROM users WHERE normalized_username = ? OR normalized_email = ? LIMIT 1',
    [normalizedIdentity, normalizedIdentity]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(id: string) {
  const rows = await sqliteQuery<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUser(user: StoredAuthUser) {
  await sqliteTransaction([
    {
      sql: 'INSERT INTO users(id, username, normalized_username, email, normalized_email, display_name, role, permissions_json, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      bind: [
        user.id,
        user.username,
        user.normalizedUsername,
        user.email || null,
        user.normalizedEmail || null,
        user.displayName,
        user.role,
        JSON.stringify(user.permissions),
        user.passwordHash,
        user.passwordSalt,
        user.passwordIterations,
        user.createdAt,
      ],
    },
  ]);
}

export async function createSession(session: StoredAuthSession) {
  const now = Date.now();
  await sqliteTransaction([
    {
      sql: 'INSERT INTO auth_sessions(id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
      bind: [
        session.id,
        session.userId,
        session.tokenHash,
        session.createdAt,
        session.expiresAt,
      ],
    },
    {
      sql: 'DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at < ?)',
      bind: [now, now - 30 * 24 * 60 * 60 * 1000],
    },
  ]);
}

export async function findSessionById(id: string) {
  const rows = await sqliteQuery<SessionRow>('SELECT * FROM auth_sessions WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function revokeSession(id: string) {
  await sqliteTransaction([
    {
      sql: 'UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      bind: [Date.now(), id],
    },
  ]);
}
