import { AuthGate } from '@/components/auth-gate';

export default function AccountingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthGate>{children}</AuthGate>;
}
