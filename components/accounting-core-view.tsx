'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';

import { AppNavbarContent } from '@/components/app-navbar';
import { MoneyTransactionFields } from '@/components/forms/money-transaction-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card,CardHeader,CardTitle } from '@/components/ui/card';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { usePersistedAction } from '@/hooks/use-persisted-action';
import { accountBalance,isBalancedJournal,journalTotals,systemAccountId } from '@/lib/accounting';
import { confirmDialog,notify,promptDialog } from '@/lib/feedback';
import { persistOperation } from '@/lib/operation-result';
import { formatPersianDate,todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { Account,AccountType,MoneyTransaction } from '@/lib/types';
import { money,uid } from '@/lib/utils';
import { Ban,BookOpenCheck,Landmark,Plus,Scale,WalletCards } from 'lucide-react';
import { useMemo,useState } from 'react';

type Tab = 'accounts' | 'journal' | 'money';

export function AccountingCoreView() {
  const submission = usePersistedAction();
  const { accounts,
    journalEntries,
    moneyTransactions,
    settings,
    upsertAccount,
    deleteAccount,
    addMoneyTransaction,
    voidMoneyTransaction, } = useAccountingStore(useShallow((state) => ({ accounts: state.accounts, journalEntries: state.journalEntries, moneyTransactions: state.moneyTransactions, settings: state.settings, upsertAccount: state.upsertAccount, deleteAccount: state.deleteAccount, addMoneyTransaction: state.addMoneyTransaction, voidMoneyTransaction: state.voidMoneyTransaction })));

  const [tab, setTab] = useState<Tab>('accounts');
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState<Account>(() => blankAccount());
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [moneyDraft, setMoneyDraft] = useState<MoneyTransaction>(() => blankMoney(accounts));

  const activeAccounts = accounts.filter((account) => account.active);
  const settlementAccounts = activeAccounts.filter(
    (account) => account.type === 'asset' && (account.systemKey === 'cash' || account.systemKey === 'bank')
  );
  const incomeAccounts = activeAccounts.filter((account) => account.type === 'revenue');
  const expenseAccounts = activeAccounts.filter((account) => account.type === 'expense');

  const trialBalance = useMemo(
    () => accounts.map((account) => ({ account, balance: accountBalance(account, journalEntries) })),
    [accounts, journalEntries]
  );

  const debitTotal = journalEntries.reduce((sum, entry) => sum + journalTotals(entry).debit, 0);
  const creditTotal = journalEntries.reduce((sum, entry) => sum + journalTotals(entry).credit, 0);
  const allBalanced = journalEntries.every(isBalancedJournal);

  const startAccount = () => {
    setAccountDraft(blankAccount());
    setAccountOpen(true);
  };

  const saveAccount = async () => { await submission.run(() => upsertAccount(accountDraft), () => setAccountOpen(false)); };

  const startMoney = (kind: 'income' | 'expense') => {
    const settlementAccountId = settlementAccounts[0]?.id || systemAccountId(accounts, 'cash');
    const categoryAccountId = kind === 'income'
      ? incomeAccounts.find((account) => account.systemKey === 'other-income')?.id || incomeAccounts[0]?.id || ''
      : expenseAccounts.find((account) => account.systemKey === 'general-expense')?.id || expenseAccounts[0]?.id || '';
    setMoneyDraft({
      ...blankMoney(accounts),
      kind,
      settlementAccountId,
      categoryAccountId,
    });
    setMoneyOpen(true);
  };

  const saveMoney = async () => {
    const settlement = accounts.find((account) => account.id === moneyDraft.settlementAccountId);
    const category = accounts.find((account) => account.id === moneyDraft.categoryAccountId);
    const approved = await confirmDialog(
      `ثبت نهایی ${moneyDraft.kind === 'income' ? 'درآمد' : 'هزینه'} «${moneyDraft.description || 'بدون شرح'}» به مبلغ ${money(moneyDraft.amount)} ${settings.currency} انجام می‌شود و سند روزنامه آن قطعی خواهد شد. حساب صندوق/بانک: ${settlement?.name || '—'} · حساب ${moneyDraft.kind === 'income' ? 'درآمد' : 'هزینه'}: ${category?.name || '—'}. ادامه می‌دهید؟`,
      { title: 'تأیید ثبت قطعی', confirmLabel: 'ثبت قطعی و تراز' }
    );
    if (!approved) return;
    await submission.run(() => addMoneyTransaction(moneyDraft), () => setMoneyOpen(false));
  };

  const voidMoney = async (transaction: MoneyTransaction) => {
    const reason = await promptDialog('دلیل ابطال تراکنش را وارد کنید:', { title: 'ابطال تراکنش', confirmLabel: 'ابطال', danger: true, placeholder: 'دلیل ابطال...' });
    if (!reason?.trim()) return;
    const result = await persistOperation(() => voidMoneyTransaction(transaction.id, reason));
    if (!result.ok) notify(result.message || 'ابطال انجام نشد.', 'error');
  };

  return <div className="space-y-5">
    <AppNavbarContent
      title="حسابداری دوبل"
      subtitle="کدینگ حساب‌ها، دفتر روزنامه تراز و درآمد/هزینه مستقل"
      actions={<>
        <Button variant={tab === 'accounts' ? 'default' : 'outline'} onClick={() => setTab('accounts')}><Landmark className="h-4 w-4" /> حساب‌ها</Button>
        <Button variant={tab === 'journal' ? 'default' : 'outline'} onClick={() => setTab('journal')}><BookOpenCheck className="h-4 w-4" /> دفتر روزنامه</Button>
        <Button variant={tab === 'money' ? 'default' : 'outline'} onClick={() => setTab('money')}><WalletCards className="h-4 w-4" /> درآمد / هزینه</Button>
        {tab === 'accounts' && <Button onClick={startAccount}><Plus className="h-4 w-4" /> حساب جدید</Button>}
        {tab === 'money' && <>
          <Button onClick={() => startMoney('income')}><Plus className="h-4 w-4" /> ثبت درآمد</Button>
          <Button variant="outline" onClick={() => startMoney('expense')}><Plus className="h-4 w-4" /> ثبت هزینه</Button>
        </>}
      </>}
    />

    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard title="تعداد ثبت‌های روزنامه" value={journalEntries.length} />
      <MetricCard title="گردش بدهکار" value={debitTotal} unit={settings.currency} tone="info" />
      <MetricCard title="کنترل تراز" value={allBalanced && Math.abs(debitTotal - creditTotal) < 0.01 ? 'تراز' : 'نیاز به بررسی'} tone={allBalanced && Math.abs(debitTotal - creditTotal) < 0.01 ? 'success' : 'danger'} rolling={false} />
    </div>

    {tab === 'accounts' && <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Chart of Accounts</CardTitle>
          <div className="mt-1 text-xs text-slate-500">مانده‌ها مستقیماً از Journal محاسبه می‌شوند.</div>
        </div>
      </CardHeader>
      <div className="table-wrap"><DataTable className="data-table min-w-[860px]">
        <thead><tr><th>کد</th><th>نام حساب</th><th>گروه</th><th>ماهیت</th><th>مانده</th><th>نوع</th><th>عملیات</th></tr></thead>
        <tbody>
          {trialBalance.map(({ account, balance }) => <tr key={account.id}>
            <td className="font-bold">{account.code}</td>
            <td className="font-bold">{account.name}</td>
            <td>{accountTypeLabel(account.type)}</td>
            <td>{account.normalBalance === 'debit' ? 'بدهکار' : 'بستانکار'}</td>
            <td className={balance < 0 ? 'font-black text-rose-700' : 'font-black'}>{money(Math.abs(balance))} {settings.currency}{balance < 0 ? ' خلاف ماهیت' : ''}</td>
            <td>{account.systemKey ? <Badge className="bg-sky-50 text-sky-700">سیستمی</Badge> : <Badge>تعریف کاربر</Badge>}</td>
            <td>{!account.systemKey ? <Button variant="ghost" size="sm" className="text-rose-600" onClick={async () => { if (!(await confirmDialog('حساب حذف شود؟', { title: 'حذف حساب', confirmLabel: 'حذف', danger: true }))) return; const result = deleteAccount(account.id); if (!result.ok) notify(result.message || 'حذف حساب انجام نشد.', 'error'); }}>حذف</Button> : '—'}</td>
          </tr>)}
        </tbody>
      </DataTable></div>
    </Card>}

    {tab === 'journal' && <Card>
      <CardHeader><div><CardTitle>دفتر روزنامه</CardTitle><div className="mt-1 text-xs text-slate-500">هر ثبت دارای منبع عملیاتی و کنترل Debit = Credit است.</div></div></CardHeader>
      <div className="table-wrap"><DataTable className="data-table min-w-[1000px]">
        <thead><tr><th>تاریخ</th><th>شرح / منبع</th><th>حساب</th><th>بدهکار</th><th>بستانکار</th><th>وضعیت</th></tr></thead>
        <tbody>
          {journalEntries.slice().reverse().flatMap((entry) => {
            const totals = journalTotals(entry);
            return entry.lines.map((line, index) => {
              const account = accounts.find((item) => item.id === line.accountId);
              return <tr key={entry.id + '-' + line.id}>
                <td>{index === 0 ? (entry.date === 'ابتدای دوره' ? entry.date : formatPersianDate(entry.date)) : ''}</td>
                <td>{index === 0 ? <div><div className="font-bold">{entry.description}</div><div className="mt-1 text-[10px] text-slate-500">{entry.sourceType} · {entry.sourceReference || entry.sourceId} · {entry.action}</div></div> : ''}</td>
                <td className="font-bold">{account ? account.code + ' — ' + account.name : line.accountId}</td>
                <td className="font-bold text-rose-700">{line.debit ? money(line.debit) : '—'}</td>
                <td className="font-bold text-emerald-700">{line.credit ? money(line.credit) : '—'}</td>
                <td>{index === 0 ? <Badge className={Math.abs(totals.debit - totals.credit) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{Math.abs(totals.debit - totals.credit) < 0.01 ? 'تراز' : 'نامتوازن'}</Badge> : ''}</td>
              </tr>;
            });
          })}
          {!journalEntries.length && <tr><td colSpan={6} className="!py-14 text-center text-slate-400">ثبت روزنامه‌ای وجود ندارد.</td></tr>}
        </tbody>
      </DataTable></div>
    </Card>}

    {tab === 'money' && <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>درآمد و هزینه مستقل</CardTitle><div className="mt-1 text-xs text-slate-500">هر تراکنش همزمان یک JournalEntry تراز ایجاد می‌کند.</div></div></CardHeader>
        <div className="table-wrap"><DataTable className="data-table min-w-[900px]">
          <thead><tr><th>تاریخ</th><th>نوع</th><th>شرح</th><th>حساب تسویه</th><th>دسته حساب</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead>
          <tbody>
            {moneyTransactions.map((transaction) => {
              const settlement = accounts.find((account) => account.id === transaction.settlementAccountId);
              const category = accounts.find((account) => account.id === transaction.categoryAccountId);
              return <tr key={transaction.id}>
                <td>{formatPersianDate(transaction.date)}</td>
                <td>{transaction.kind === 'income' ? <Badge className="bg-emerald-50 text-emerald-700">درآمد</Badge> : <Badge className="bg-rose-50 text-rose-700">هزینه</Badge>}</td>
                <td><div className="font-bold">{transaction.description}</div>{transaction.reference && <div className="mt-1 text-[10px] text-slate-500">{transaction.reference}</div>}</td>
                <td>{settlement?.name || '—'}</td><td>{category?.name || '—'}</td>
                <td className="font-black">{money(transaction.amount)} {settings.currency}</td>
                <td>{transaction.status === 'final' ? <Badge className="bg-emerald-50 text-emerald-700">قطعی</Badge> : <Badge className="bg-rose-50 text-rose-700">باطل</Badge>}</td>
                <td>{transaction.status === 'final' ? <Button variant="danger" size="sm" onClick={() => voidMoney(transaction)}><Ban className="h-4 w-4" /> ابطال</Button> : '—'}</td>
              </tr>;
            })}
            {!moneyTransactions.length && <tr><td colSpan={8} className="!py-14 text-center text-slate-400">تراکنش مستقلی ثبت نشده است.</td></tr>}
          </tbody>
        </DataTable></div>
      </Card>
    </div>}

    <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">حساب جدید</DialogTitle><DialogDescription className="text-sm text-slate-500">حساب‌های سیستمی ثابت هستند؛ حساب‌های تکمیلی برای درآمد و هزینه یا توسعه کدینگ قابل تعریف‌اند.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">{submission.error && <p role="alert" className="text-sm text-rose-600 sm:col-span-2">{submission.error}</p>}
          <Field label="کد حساب"><Input value={accountDraft.code} onChange={(event) => setAccountDraft({ ...accountDraft, code: event.target.value })} /></Field>
          <Field label="نام حساب"><Input value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></Field>
          <Field label="گروه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={accountDraft.type} onChange={(event) => { const type = event.target.value as AccountType; setAccountDraft({ ...accountDraft, type, normalBalance: type === 'asset' || type === 'expense' ? 'debit' : 'credit' }); }}><option value="asset">دارایی</option><option value="liability">بدهی</option><option value="equity">حقوق مالکانه</option><option value="revenue">درآمد</option><option value="expense">هزینه</option></select></Field>
          <Field label="ماهیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={accountDraft.normalBalance} onChange={(event) => setAccountDraft({ ...accountDraft, normalBalance: event.target.value as 'debit' | 'credit' })}><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAccountOpen(false)}>انصراف</Button><Button disabled={submission.busy} onClick={() => void saveAccount()}>ذخیره حساب</Button></div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={moneyOpen} onOpenChange={setMoneyOpen}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">{moneyDraft.kind === 'income' ? 'ثبت درآمد' : 'ثبت هزینه'}</DialogTitle><DialogDescription className="text-sm text-slate-500">ثبت قطعی است؛ برای اصلاح بعدی از ابطال و سند جدید استفاده کنید.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">{submission.error && <p role="alert" className="text-sm text-rose-600 sm:col-span-2">{submission.error}</p>}
          <MoneyTransactionFields value={moneyDraft} onChange={(draft) => setMoneyDraft({ ...moneyDraft, ...draft })} accounts={accounts} currency={settings.currency} disabled={submission.busy} />
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setMoneyOpen(false)}>انصراف</Button><Button disabled={submission.busy || moneyDraft.amount <= 0 || !moneyDraft.description.trim()} onClick={saveMoney}><Scale className="h-4 w-4" /> ثبت قطعی و تراز</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function blankAccount(): Account {
  return {
    id: uid('acct'),
    code: String(6000 + Math.floor(Math.random() * 900)),
    name: '',
    type: 'expense',
    normalBalance: 'debit',
    active: true,
  };
}

function blankMoney(accounts: Account[]): MoneyTransaction {
  return {
    id: uid('money'),
    kind: 'expense',
    status: 'final',
    date: todayIso(),
    amount: 0,
    settlementAccountId: accounts.find((account) => account.systemKey === 'cash')?.id || '',
    categoryAccountId: accounts.find((account) => account.systemKey === 'general-expense')?.id || '',
    description: '',
    reference: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function accountTypeLabel(type: AccountType) {
  if (type === 'asset') return 'دارایی';
  if (type === 'liability') return 'بدهی';
  if (type === 'equity') return 'حقوق مالکانه';
  if (type === 'revenue') return 'درآمد';
  return 'هزینه';
}


