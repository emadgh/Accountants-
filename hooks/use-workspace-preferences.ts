'use client';
import { useSyncExternalStore } from 'react';

export type MenuPreset = 'services' | 'individual' | 'retail';
export type WorkspacePreferences = { menuPreset: MenuPreset; reducedEffects: boolean };
const key = 'accountants:workspace-preferences';
const eventName = 'accounting:workspace-preferences';
const defaults: WorkspacePreferences = { menuPreset: 'services', reducedEffects: false };
const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify); window.addEventListener(eventName, notify);
  return () => { window.removeEventListener('storage', notify); window.removeEventListener(eventName, notify); };
};
function read() { try { return window.localStorage.getItem(key) || ''; } catch { return ''; } }
export function useWorkspacePreferences() {
  const raw = useSyncExternalStore(subscribe, read, () => '');
  let preferences = defaults;
  try { const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>; preferences = { menuPreset: ['services', 'individual', 'retail'].includes(parsed.menuPreset || '') ? parsed.menuPreset! : defaults.menuPreset, reducedEffects: parsed.reducedEffects === true }; } catch { /* Use safe defaults. */ }
  const update = (value: Partial<WorkspacePreferences>) => {
    try { window.localStorage.setItem(key, JSON.stringify({ ...preferences, ...value })); window.dispatchEvent(new Event(eventName)); } catch { /* Storage may be disabled. */ }
  };
  return { preferences, update };
}
