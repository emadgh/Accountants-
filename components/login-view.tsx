'use client';

import { FormEvent, useState } from 'react';
import { Building2, CircleOff, Eye, EyeOff, LockKeyhole, LogIn, Palette, ShieldCheck, ShoppingBasket, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import BorderGlow from '@/components/react-bits/border-glow';
import Prism from '@/components/react-bits/prism';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  authFormCascadeVariants,
  authFormItemVariants,
  authFormOptionsVariants,
  authFormPanelVariants,
  authFormSetupActionVariants,
} from '@/lib/animation-config';
import { cn } from '@/lib/utils';
import { SEED_PRESETS, type SeedPresetId } from '@/lib/data';

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
  onSetup: (input: {
    username: string;
    email?: string;
    displayName?: string;
    password: string;
    seedPreset: SeedPresetId;
  }) => Promise<void>;
}) {
  const [identity, setIdentity] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [seedPreset, setSeedPreset] = useState<SeedPresetId>('empty');
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
      await onSetup({
        username,
        email: email || undefined,
        displayName: displayName || undefined,
        password,
        seedPreset,
      });
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
        <div className={cn('w-full', mode === 'setup' ? 'max-w-2xl' : 'max-w-md')}>
          <motion.div
            variants={authFormPanelVariants}
            initial="initial"
            animate="animate"
            className="w-full"
          >
            <BorderGlow
              className="w-full"
              edgeSensitivity={30}
              glowColor="40 80 80"
              backgroundColor="#120F17"
              borderRadius={28}
              glowRadius={40}
              glowIntensity={1.0}
              coneSpread={25}
              animated={false}
              colors={['#c084fc', '#f472b6', '#38bdf8']}
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
                <motion.form
                  className="space-y-4"
                  onSubmit={submit}
                  variants={authFormCascadeVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {mode === 'setup' ? (
                    <>
                      <motion.div variants={authFormItemVariants}>
                        <Field label="نام نمایشی">
                          <Input
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            autoComplete="name"
                            placeholder="مثلاً مدیر حسابداری"
                            className="border-white/10 bg-white/[.055] text-white placeholder:text-slate-600 focus:border-sky-400 focus:ring-sky-400/10"
                          />
                        </Field>
                      </motion.div>
                      <motion.div variants={authFormItemVariants}>
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
                      </motion.div>
                      <motion.div variants={authFormItemVariants}>
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
                      </motion.div>
                    </>
                  ) : (
                    <motion.div variants={authFormItemVariants}>
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
                    </motion.div>
                  )}

                  <motion.div variants={authFormItemVariants}>
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
                  </motion.div>

                  {mode === 'setup' && (
                    <motion.div variants={authFormItemVariants}>
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
                    </motion.div>
                  )}

                  {mode === 'setup' && (
                    <motion.fieldset variants={authFormItemVariants} className="rounded-xl border border-white/10 bg-white/[.025] p-3">
                      <legend className="px-1 text-xs font-bold text-slate-300">داده‌های شروع</legend>
                      <p className="mb-2 text-[10px] leading-5 text-slate-500">
                        یک الگوی متناسب با نوع کارتان انتخاب کنید. اطلاعات هر الگو نمونه است و بعداً قابل ویرایش است.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {SEED_PRESETS.map((preset) => {
                          const Icon = preset.id === 'empty'
                            ? CircleOff
                            : preset.id === 'supermarket'
                              ? ShoppingBasket
                              : preset.id === 'creative-studio'
                                ? Palette
                                : Building2;
                          const selected = seedPreset === preset.id;
                          return (
                            <motion.label
                              key={preset.id}
                              variants={authFormItemVariants}
                              className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                                selected
                                  ? 'border-sky-400/50 bg-sky-400/10'
                                  : 'border-white/10 bg-white/[.025] hover:border-white/20'
                              )}
                            >
                              <input
                                type="radio"
                                name="seed-preset"
                                value={preset.id}
                                checked={selected}
                                onChange={() => setSeedPreset(preset.id)}
                                className="mt-1 accent-sky-400"
                              />
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[.06] text-sky-300">
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-xs font-bold text-slate-200">{preset.title}</span>
                                <span className="mt-1 block text-[10px] leading-5 text-slate-500">{preset.description}</span>
                              </span>
                            </motion.label>
                          );
                        })}
                      </div>
                    </motion.fieldset>
                  )}

                  {message && (
                    <motion.div variants={authFormItemVariants}>
                      <Alert variant="destructive" className="rounded-xl border-rose-400/20 bg-rose-500/10 px-3 py-2.5 text-xs font-bold leading-6 text-rose-200 [&>svg]:text-rose-200">
                        <AlertDescription className="text-xs leading-6">{message}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  <motion.div variants={mode === 'setup' ? authFormSetupActionVariants : authFormItemVariants}>
                    <Button
                      type="submit"
                      disabled={busy || (mode === 'login' ? !identity.trim() || !password : !username.trim() || !password || !confirmPassword)}
                      className="mt-2 w-full bg-sky-500 text-slate-950 hover:bg-sky-400 focus-visible:ring-sky-300"
                    >
                      <LogIn className="h-4 w-4" />
                      {busy ? 'در حال راه‌اندازی...' : mode === 'setup' ? 'ایجاد حساب مدیر و ادامه' : 'ورود'}
                    </Button>
                  </motion.div>
                </motion.form>
              </CardContent>
            </Card>
            </BorderGlow>
          </motion.div>

          <p className="mt-4 text-center text-[10px] leading-5 text-slate-600">
            اطلاعات برنامه در فایل SQLite همین رایانه ذخیره می‌شود و رمز عبور به‌صورت خام ذخیره نمی‌شود.
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-bold text-slate-300">{label}</span>{children}</label>;
}
