'use client';

import { FormEvent, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import BorderGlow from '@/components/react-bits/border-glow';
import Prism from '@/components/react-bits/prism';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type LoginMode = 'login' | 'setup';

export function LoginView({
  mode,
  busy,
  error,
  onLogin,
  onSetup,
}: {
  mode: LoginMode;
  busy: boolean;
  error: string;
  onLogin: (identity: string, password: string) => Promise<void>;
  onSetup: (input: { username: string; email?: string; displayName?: string; password: string }) => Promise<void>;
}) {
  const [identity, setIdentity] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');
    if (mode === 'setup') {
      if (password !== confirmPassword) {
        setLocalError('تکرار رمز عبور با رمز عبور یکسان نیست.');
        return;
      }
      await onSetup({ username, email: email || undefined, displayName: displayName || undefined, password });
      return;
    }
    await onLogin(identity, password);
  };

  const message = localError || error;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#020617] text-slate-100" dir="rtl">
      <div className="absolute inset-0 opacity-80" aria-hidden="true">
        <Prism
          animationType="3drotate"
          height={3.5}
          baseWidth={5.5}
          glow={0.8}
          noise={0.12}
          transparent
          scale={3.7}
          hueShift={-0.18}
          colorFrequency={0.85}
          bloom={0.75}
          timeScale={0.22}
          suspendWhenOffscreen
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,.15),rgba(2,6,23,.86)_72%)]" aria-hidden="true" />

      <div className="relative z-10 grid min-h-[100dvh] place-items-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">
          <BorderGlow
            className="w-full"
            backgroundColor="#020617"
            borderRadius={26}
            edgeSensitivity={34}
            glowRadius={32}
            glowIntensity={0.42}
            coneSpread={18}
            colors={['#38bdf8', '#818cf8', '#c084fc']}
            fillOpacity={0.16}
          >
            <Card variant="dark">
              <CardHeader className="block border-white/10 px-6 pb-4 pt-6 text-center sm:px-7">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                  {mode === 'setup' ? <ShieldCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
                </div>
                <CardTitle className="text-xl font-black text-white">
                  {mode === 'setup' ? 'راه‌اندازی حساب مدیر' : 'ورود به حسابداری'}
                </CardTitle>
                <p className="mt-2 text-xs leading-6 text-slate-400">
                  {mode === 'setup'
                    ? 'اولین اجراست. حساب مدیر این مرورگر را ایجاد کنید.'
                    : 'برای دسترسی به اطلاعات حسابداری وارد شوید.'}
                </p>
              </CardHeader>

              <CardContent className="px-6 pb-7 pt-5 sm:px-7">
                <form className="space-y-4" onSubmit={submit}>
                  {mode === 'setup' ? (
                    <>
                      <Field label="نام نمایشی">
                        <Input
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          autoComplete="name"
                          placeholder="مثلاً مدیر حسابداری"
                          className="border-white/10 bg-white/[.055] text-white placeholder:text-slate-600 focus:border-sky-400 focus:ring-sky-400/10"
                        />
                      </Field>
                      <Field label="نام کاربری *">
                        <Input
                          required
                          minLength={3}
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          autoComplete="username"
                          spellCheck={false}
                          placeholder="نام کاربری"
                          className="border-white/10 bg-white/[.055] text-white placeholder:text-slate-600 focus:border-sky-400 focus:ring-sky-400/10"
                        />
                      </Field>
                      <Field label="ایمیل">
                        <Input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          dir="ltr"
                          placeholder="name@example.com"
                          className="border-white/10 bg-white/[.055] text-left text-white placeholder:text-slate-600 focus:border-sky-400 focus:ring-sky-400/10"
                        />
                      </Field>
                    </>
                  ) : (
                    <Field label="نام کاربری یا ایمیل">
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <Input
                          required
                          value={identity}
                          onChange={(event) => setIdentity(event.target.value)}
                          autoComplete="username"
                          autoFocus
                          spellCheck={false}
                          placeholder="نام کاربری یا ایمیل"
                          className="border-white/10 bg-white/[.055] pr-9 text-white placeholder:text-slate-600 focus:border-sky-400 focus:ring-sky-400/10"
                        />
                      </div>
                    </Field>
                  )}

                  <Field label="رمز عبور">
                    <div className="relative">
                      <Input
                        required
                        minLength={mode === 'setup' ? 8 : undefined}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                        dir="ltr"
                        className="border-white/10 bg-white/[.055] pl-11 text-left text-white focus:border-sky-400 focus:ring-sky-400/10"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>

                  {mode === 'setup' && (
                    <Field label="تکرار رمز عبور">
                      <Input
                        required
                        minLength={8}
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        dir="ltr"
                        className="border-white/10 bg-white/[.055] text-left text-white focus:border-sky-400 focus:ring-sky-400/10"
                      />
                    </Field>
                  )}

                  {message && (
                    <Alert variant="destructive" className="rounded-xl border-rose-400/20 bg-rose-500/10 px-3 py-2.5 text-xs font-bold leading-6 text-rose-200 [&>svg]:text-rose-200">
                      <AlertDescription className="text-xs leading-6">{message}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    disabled={busy || (mode === 'login' ? !identity.trim() || !password : !username.trim() || !password || !confirmPassword)}
                    className="mt-2 w-full bg-sky-500 text-slate-950 hover:bg-sky-400 focus-visible:ring-sky-300"
                  >
                    <LogIn className="h-4 w-4" />
                    {busy ? 'در حال بررسی...' : mode === 'setup' ? 'ایجاد حساب و ورود' : 'ورود'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </BorderGlow>

          <p className="mt-4 text-center text-[10px] leading-5 text-slate-600">
            اطلاعات ورود فقط در همین مرورگر نگهداری می‌شود و رمز عبور به‌صورت خام ذخیره نمی‌شود.
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-bold text-slate-300">{label}</span>{children}</label>;
}
