import { createSeedData, type SeedPresetId } from './data';
import { initializeFirstRunAccountingData } from './storage';
import { migrateLegacyBrowserDatabaseIfNeeded } from './persistence/database';

export type AuthRole = 'admin' | 'user';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: AuthRole;
  permissions: string[];
}

export interface AuthSnapshot {
  hasUsers: boolean;
  user: AuthenticatedUser | null;
}

async function requestAuth<T>(init?: RequestInit): Promise<T> {
  const response = await fetch('/api/auth', {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.headers || {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'درخواست احراز هویت انجام نشد.');
  return payload;
}

export async function getAuthSnapshot(): Promise<AuthSnapshot> {
  await migrateLegacyBrowserDatabaseIfNeeded();
  return requestAuth<AuthSnapshot>();
}

export async function loginWithPassword(identity: string, password: string) {
  const result = await requestAuth<{ user: AuthenticatedUser }>({
    method: 'POST',
    body: JSON.stringify({ action: 'login', identity, password }),
  });
  return result.user;
}

export async function registerFirstAdmin(input: {
  username: string;
  email?: string;
  displayName?: string;
  password: string;
  seedPreset: SeedPresetId;
}) {
  const result = await requestAuth<{ user: AuthenticatedUser }>({
    method: 'POST',
    body: JSON.stringify({ action: 'setup', ...input }),
  });
  await initializeFirstRunAccountingData(createSeedData(input.seedPreset));
  return result.user;
}

export async function logoutCurrentSession() {
  await requestAuth({ method: 'POST', body: JSON.stringify({ action: 'logout' }) });
}
