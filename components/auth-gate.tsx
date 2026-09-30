'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AccountingApp } from '@/components/accounting-app';
import { LoginView } from '@/components/login-view';
import { useAccountingStore } from '@/lib/store';
import type { SeedPresetId } from '@/lib/data';
import { pageTransitionVariants } from '@/lib/animation-config';
import {
  getAuthSnapshot,
  loginWithPassword,
  logoutCurrentSession,
  registerFirstAdmin,
  type AuthenticatedUser,
} from '@/lib/auth';

type GateState =
  | { status: 'checking'; hasUsers: boolean; user: null }
  | { status: 'anonymous'; hasUsers: boolean; user: null }
  | { status: 'authenticated'; hasUsers: true; user: AuthenticatedUser };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking', hasUsers: false, user: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getAuthSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setState(snapshot.user
          ? { status: 'authenticated', hasUsers: true, user: snapshot.user }
          : { status: 'anonymous', hasUsers: snapshot.hasUsers, user: null });
      })
      .catch((reason) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : '';
        setError(message.includes('Web Crypto') || message.includes('sessionStorage')
          ? 'مرورگر باید Web Crypto و Session Storage را پشتیبانی کند.'
          : `بررسی دیتابیس SQLite ناموفق بود: ${message || 'خطای ناشناخته'}`);
        setState({ status: 'anonymous', hasUsers: true, user: null });
      });
    return () => { active = false; };
  }, []);

  const login = async (identity: string, password: string) => {
    setBusy(true);
    setError('');
    try {
      const user = await loginWithPassword(identity, password);
      setState({ status: 'authenticated', hasUsers: true, user });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ورود انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const setup = async (input: {
    username: string;
    email?: string;
    displayName?: string;
    password: string;
    seedPreset: SeedPresetId;
  }) => {
    setBusy(true);
    setError('');
    try {
      const user = await registerFirstAdmin(input);
      await useAccountingStore.persist.rehydrate();
      setState({ status: 'authenticated', hasUsers: true, user });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ایجاد حساب انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await logoutCurrentSession();
    } finally {
      setError('');
      setBusy(false);
      setState({ status: 'anonymous', hasUsers: true, user: null });
    }
  };

  const screenKey = state.status === 'checking'
    ? 'checking'
    : state.status === 'authenticated'
      ? 'accounting'
      : state.hasUsers ? 'login' : 'setup';

  return (
    <div className={`min-h-[100dvh] ${state.status === 'authenticated' ? 'bg-transparent' : 'bg-[#020617]'}`}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={screenKey}
          variants={pageTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-[100dvh]"
        >
          {state.status === 'checking' ? (
            <div className="grid min-h-[100dvh] place-items-center bg-slate-950 text-slate-200" dir="rtl">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-sky-400" />
                <div className="mt-4 text-xs font-bold text-slate-500">در حال بررسی وضعیت ورود...</div>
              </div>
            </div>
          ) : state.status !== 'authenticated' ? (
            <LoginView
              mode={state.hasUsers ? 'login' : 'setup'}
              busy={busy}
              error={error}
              onLogin={login}
              onSetup={setup}
            />
          ) : (
            <AccountingApp onLogout={logout}>{children}</AccountingApp>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
