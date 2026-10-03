import {
  journalForCustomerAdjustment,
  journalForMoneyTransaction,
  reverseActiveSourceEntries
} from '../accounting';
import type {
  Account,
  AccountAdjustment,
  MoneyTransaction
} from '../types';
import {
  uid as randomUid,
  todayFa
} from '../utils';

import type { DomainContext } from './engine';

export function financeActions({ set, get, uid = randomUid }: DomainContext): Pick<import('./shared').AccountingState, 'addAdjustment' | 'upsertAccount' | 'deleteAccount' | 'addMoneyTransaction' | 'voidMoneyTransaction'> {
  return {
    addAdjustment: (adjustment) => {
      const state = get();
      if (!state.customers.some((customer) => customer.id === adjustment.customerId)) {
        return { ok: false, message: 'طرف حساب اصلاحیه پیدا نشد.' };
      }
      if (!Number.isFinite(adjustment.amount) || Math.abs(adjustment.amount) < 0.0001) {
        return { ok: false, message: 'مبلغ اصلاحیه باید بزرگ‌تر از صفر باشد.' };
      }
      if (!adjustment.note.trim()) {
        return { ok: false, message: 'ثبت دلیل اصلاحیه الزامی است.' };
      }
      const normalized: AccountAdjustment = {
        ...adjustment,
        amount: Number(adjustment.amount),
        note: adjustment.note.trim(),
        createdAt: adjustment.createdAt || new Date().toISOString(),
      };
      set({
        adjustments: [normalized, ...(state.adjustments || [])],
        journalEntries: [...state.journalEntries, ...journalForCustomerAdjustment(normalized, state.accounts)],
      });
      return { ok: true };
    },

    upsertAccount: (account) => {
      const state = get();
      const previous = state.accounts.find((item) => item.id === account.id);
      if (previous?.systemKey) return { ok: false, message: 'حساب سیستمی قابل تغییر ساختاری نیست.' };
      if (!account.code.trim() || !account.name.trim()) return { ok: false, message: 'کد و نام حساب الزامی است.' };
      if (state.accounts.some((item) => item.id !== account.id && item.code.trim() === account.code.trim())) {
        return { ok: false, message: 'کد حساب تکراری است.' };
      }
      const normalized: Account = { ...account, systemKey: undefined };
      set({
        accounts: previous
          ? state.accounts.map((item) => item.id === account.id ? normalized : item)
          : [...state.accounts, normalized],
      });
      return { ok: true };
    },

    deleteAccount: (id) => {
      const state = get();
      const account = state.accounts.find((item) => item.id === id);
      if (!account) return { ok: false, message: 'حساب پیدا نشد.' };
      if (account.systemKey) return { ok: false, message: 'حساب سیستمی قابل حذف نیست.' };
      const usedInJournal = state.journalEntries.some((entry) => entry.lines.some((line) => line.accountId === id));
      const usedInMoney = state.moneyTransactions.some((transaction) => transaction.settlementAccountId === id || transaction.categoryAccountId === id);
      if (usedInJournal || usedInMoney) return { ok: false, message: 'حساب دارای گردش است و قابل حذف نیست؛ آن را غیرفعال کنید.' };
      set({ accounts: state.accounts.filter((item) => item.id !== id) });
      return { ok: true };
    },

    addMoneyTransaction: (transaction) => {
      const state = get();
      const amount = Number(transaction.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'مبلغ باید بزرگ‌تر از صفر باشد.' };
      if (!transaction.description.trim()) return { ok: false, message: 'شرح تراکنش الزامی است.' };
      const settlement = state.accounts.find((account) => account.id === transaction.settlementAccountId && account.active);
      const category = state.accounts.find((account) => account.id === transaction.categoryAccountId && account.active);
      if (!settlement || settlement.type !== 'asset') return { ok: false, message: 'حساب صندوق/بانک معتبر انتخاب کنید.' };
      if (!category || (transaction.kind === 'income' ? category.type !== 'revenue' : category.type !== 'expense')) {
        return { ok: false, message: transaction.kind === 'income' ? 'حساب درآمد معتبر انتخاب کنید.' : 'حساب هزینه معتبر انتخاب کنید.' };
      }
      const now = new Date().toISOString();
      const normalized: MoneyTransaction = {
        ...transaction,
        status: 'final',
        amount,
        description: transaction.description.trim(),
        createdAt: transaction.createdAt || now,
        updatedAt: now,
        voidedAt: undefined,
        voidReason: undefined,
      };
      const journal = journalForMoneyTransaction(normalized, state.accounts);
      if (!journal.length) return { ok: false, message: 'ثبت حسابداری تراکنش تراز نشد.' };
      set({
        moneyTransactions: [normalized, ...state.moneyTransactions],
        journalEntries: [...state.journalEntries, ...journal],
      });
      return { ok: true };
    },

    voidMoneyTransaction: (id, reason) => {
      const state = get();
      const previous = state.moneyTransactions.find((item) => item.id === id);
      if (!previous || previous.status !== 'final') return { ok: false, message: 'تراکنش قطعی فعال پیدا نشد.' };
      if (!reason.trim()) return { ok: false, message: 'دلیل ابطال الزامی است.' };
      const now = new Date().toISOString();
      const transaction: MoneyTransaction = {
        ...previous,
        status: 'void',
        voidedAt: now,
        voidReason: reason.trim(),
        updatedAt: now,
      };
      const reversals = reverseActiveSourceEntries(
        state.journalEntries,
        'money-transaction',
        id,
        todayFa(),
        'ابطال ' + previous.description + ' — ' + reason.trim(),
        'void-reversal'
      );
      set({
        moneyTransactions: state.moneyTransactions.map((item) => item.id === id ? transaction : item),
        journalEntries: [...state.journalEntries, ...reversals],
      });
      return { ok: true };
    },

  };
}
