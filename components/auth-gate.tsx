'use client';

import { useEffect, useState } from 'react';
import { AccountingApp } from '@/components/accounting-app';
import { LoginView } from '@/components/login-view';
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

export function AuthGate() {
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
      .catch(() => {
        if (!active) return;
        setError('بررسی وضعیت ورود ممکن نشد. مرورگر باید Web Crypto و Local Storage را پشتیبانی کند.');
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

  const setup = async (input: { username: string; email?: string; displayName?: string; password: string }) => {
    setBusy(true);
    setError('');
    try {
      const user = await registerFirstAdmin(input);
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

  if (state.status === 'checking') {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-950 text-slate-200" dir="rtl">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-sky-400" />
          <div className="mt-4 text-xs font-bold text-slate-500">در حال بررسی وضعیت ورود...</div>
        </div>
      </div>
    );
  }

  if (state.status !== 'authenticated') {
    return (
      <LoginView
        mode={state.hasUsers ? 'login' : 'setup'}
        busy={busy}
        error={error}
        onLogin={login}
        onSetup={setup}
      />
    );
  }

  return <AccountingApp onLogout={logout} />;
}
