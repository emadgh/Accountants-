'use client';

import { useMemo, useState } from 'react';
import { Ban, BookOpenCheck, Landmark, Plus, Scale, WalletCards } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { Account, AccountType, MoneyTransaction } from '@/lib/types';
import { accountBalance, isBalancedJournal, journalTotals, systemAccountId } from '@/lib/accounting';
import { money, uid } from '@/lib/utils';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { PersianDateInput } from '@/components/persian-date-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { confirmDialog, notify, promptDialog } from '@/lib/feedback';

type Tab = 'accounts' | 'journal' | 'money';

export function AccountingCoreView() {
  const {
    accounts,
    journalEntries,
    moneyTransactions,
    settings,
    upsertAccount,
    deleteAccount,
    addMoneyTransaction,
    voidMoneyTransaction,
  } = useAccountingStore();

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

  const saveAccount = () => {
    const result = upsertAccount(accountDraft);
    if (!result.ok) {
      notify(result.message || 'ثبت حساب انجام نشد.', 'error');
      return;
    }
    setAccountOpen(false);
  };

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

  const saveMoney = () => {
    const result = addMoneyTransaction(moneyDraft);
    if (!result.ok) {
      notify(result.message || 'ثبت تراکنش انجام نشد.', 'error');
      return;
    }
    setMoneyOpen(false);
  };

  const voidMoney = async (transaction: MoneyTransaction) => {
    const reason = await promptDialog('دلیل ابطال تراکنش را وارد کنید:', { title: 'ابطال تراکنش', confirmLabel: 'ابطال', danger: true, placeholder: 'دلیل ابطال...' });
    if (!reason?.trim()) return;
    const result = voidMoneyTransaction(transaction.id, reason);
    if (!result.ok) notify(result.message || 'ابطال انجام نشد.', 'error');
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-slate-950">حسابداری دوبل</h1>
        <p className="mt-1 text-sm text-slate-500">کدینگ حساب‌ها، دفتر روزنامه تراز و درآمد/هزینه مستقل</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'accounts' ? 'default' : 'outline'} onClick={() => setTab('accounts')}><Landmark className="h-4 w-4" /> حساب‌ها</Button>
        <Button variant={tab === 'journal' ? 'default' : 'outline'} onClick={() => setTab('journal')}><BookOpenCheck className="h-4 w-4" /> دفتر روزنامه</Button>
        <Button variant={tab === 'money' ? 'default' : 'outline'} onClick={() => setTab('money')}><WalletCards className="h-4 w-4" /> درآمد / هزینه</Button>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <Metric title="تعداد ثبت‌های روزنامه" value={String(journalEntries.length)} />
      <Metric title="گردش بدهکار" value={money(debitTotal) + ' ' + settings.currency} />
      <Metric title="کنترل تراز" value={allBalanced && Math.abs(debitTotal - creditTotal) < 0.01 ? 'تراز' : 'نیاز به بررسی'} danger={!allBalanced || Math.abs(debitTotal - creditTotal) >= 0.01} />
    </div>

    {tab === 'accounts' && <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Chart of Accounts</CardTitle>
          <div className="mt-1 text-xs text-slate-500">مانده‌ها مستقیماً از Journal محاسبه می‌شوند.</div>
        </div>
        <Button onClick={startAccount}><Plus className="h-4 w-4" /> حساب جدید</Button>
      </CardHeader>
      <div className="table-wrap"><table className="data-table min-w-[860px]">
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
      </table></div>
    </Card>}

    {tab === 'journal' && <Card>
      <CardHeader><div><CardTitle>دفتر روزنامه</CardTitle><div className="mt-1 text-xs text-slate-500">هر ثبت دارای منبع عملیاتی و کنترل Debit = Credit است.</div></div></CardHeader>
      <div className="table-wrap"><table className="data-table min-w-[1000px]">
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
      </table></div>
    </Card>}

    {tab === 'money' && <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => startMoney('income')}><Plus className="h-4 w-4" /> ثبت درآمد</Button>
        <Button variant="outline" onClick={() => startMoney('expense')}><Plus className="h-4 w-4" /> ثبت هزینه</Button>
      </div>
      <Card>
        <CardHeader><div><CardTitle>درآمد و هزینه مستقل</CardTitle><div className="mt-1 text-xs text-slate-500">هر تراکنش همزمان یک JournalEntry تراز ایجاد می‌کند.</div></div></CardHeader>
        <div className="table-wrap"><table className="data-table min-w-[900px]">
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
        </table></div>
      </Card>
    </div>}

    <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">حساب جدید</DialogTitle><DialogDescription className="text-sm text-slate-500">حساب‌های سیستمی ثابت هستند؛ حساب‌های تکمیلی برای درآمد و هزینه یا توسعه کدینگ قابل تعریف‌اند.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="کد حساب"><Input value={accountDraft.code} onChange={(event) => setAccountDraft({ ...accountDraft, code: event.target.value })} /></Field>
          <Field label="نام حساب"><Input value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></Field>
          <Field label="گروه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={accountDraft.type} onChange={(event) => { const type = event.target.value as AccountType; setAccountDraft({ ...accountDraft, type, normalBalance: type === 'asset' || type === 'expense' ? 'debit' : 'credit' }); }}><option value="asset">دارایی</option><option value="liability">بدهی</option><option value="equity">حقوق مالکانه</option><option value="revenue">درآمد</option><option value="expense">هزینه</option></select></Field>
          <Field label="ماهیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={accountDraft.normalBalance} onChange={(event) => setAccountDraft({ ...accountDraft, normalBalance: event.target.value as 'debit' | 'credit' })}><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAccountOpen(false)}>انصراف</Button><Button onClick={saveAccount}>ذخیره حساب</Button></div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={moneyOpen} onOpenChange={setMoneyOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">{moneyDraft.kind === 'income' ? 'ثبت درآمد' : 'ثبت هزینه'}</DialogTitle><DialogDescription className="text-sm text-slate-500">ثبت قطعی است؛ برای اصلاح بعدی از ابطال و سند جدید استفاده کنید.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={moneyDraft.kind} onChange={(event) => { const kind = event.target.value as 'income' | 'expense'; const categories = kind === 'income' ? incomeAccounts : expenseAccounts; setMoneyDraft({ ...moneyDraft, kind, categoryAccountId: categories[0]?.id || '' }); }}><option value="income">درآمد</option><option value="expense">هزینه</option></select></Field>
          <Field label="تاریخ"><PersianDateInput value={moneyDraft.date} onChange={(date) => setMoneyDraft({ ...moneyDraft, date })} /></Field>
          <Field label="حساب صندوق / بانک"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={moneyDraft.settlementAccountId} onChange={(event) => setMoneyDraft({ ...moneyDraft, settlementAccountId: event.target.value })}>{settlementAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></Field>
          <Field label="حساب درآمد / هزینه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={moneyDraft.categoryAccountId} onChange={(event) => setMoneyDraft({ ...moneyDraft, categoryAccountId: event.target.value })}>{(moneyDraft.kind === 'income' ? incomeAccounts : expenseAccounts).map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></Field>
          <Field label={'مبلغ (' + settings.currency + ')'}><Input type="number" min="0" value={moneyDraft.amount} onChange={(event) => setMoneyDraft({ ...moneyDraft, amount: Number(event.target.value) })} /></Field>
          <Field label="مرجع"><Input value={moneyDraft.reference || ''} onChange={(event) => setMoneyDraft({ ...moneyDraft, reference: event.target.value })} /></Field>
          <Field label="شرح *" className="sm:col-span-2"><Textarea value={moneyDraft.description} onChange={(event) => setMoneyDraft({ ...moneyDraft, description: event.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setMoneyOpen(false)}>انصراف</Button><Button disabled={moneyDraft.amount <= 0 || !moneyDraft.description.trim()} onClick={saveMoney}><Scale className="h-4 w-4" /> ثبت قطعی و تراز</Button></div>
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

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={'space-y-1.5 ' + className}><span className="block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}

function Metric({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return <Card><CardContent><div className="text-xs font-bold text-slate-500">{title}</div><div className={danger ? 'mt-2 text-xl font-black text-rose-700' : 'mt-2 text-xl font-black'}>{value}</div></CardContent></Card>;
}
