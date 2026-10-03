'use client';
import { useRef, useState } from 'react';
import { persistOperation } from '@/lib/operation-result';
import type { OperationResult } from '@/lib/types';

export function usePersistedAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async <T extends OperationResult | void>(operation: () => T, success?: () => void) => {
    if (lock.current) return { ok: false, code: 'BUSY' };
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await persistOperation(operation);
      if (result.ok) success?.(); else setError(result.message || 'ذخیره انجام نشد.');
      return result;
    } finally { lock.current = false; setBusy(false); }
  };
  return { run, busy, error, setError };
}

/** Lock before opening confirmation or preparing dependent records. */
export function useAsyncSubmission() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { return await task(); } finally { lock.current = false; setBusy(false); }
  };
  return { run, busy };
}
