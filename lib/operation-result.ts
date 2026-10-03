import { AccountingApiError, accountingRevision, flushAccountingPersistence } from './storage';
import type { OperationResult } from './types';

export async function persistOperation<T extends OperationResult | void>(operation: () => T): Promise<OperationResult & { result?: T }> {
  try {
    const result = operation();
    if (result && !result.ok) return result;
    await flushAccountingPersistence();
    return { ok: true, result, revision: accountingRevision() };
  } catch (error) {
    return { ok: false, code: error instanceof AccountingApiError ? error.code || 'SAVE_FAILED' : 'SAVE_FAILED',
      fieldErrors: error instanceof AccountingApiError ? error.fieldErrors : undefined,
      message: error instanceof Error ? error.message : 'ذخیره انجام نشد؛ ورودی فرم حفظ شده است.' };
  }
}
