import type { AccountingData, OperationResult } from '../types';
import { executeDomainOperation } from './engine';

export const DOMAIN_ACTIONS = [
  'reserveDocumentNumber', 'upsertCustomer', 'deleteCustomer',
  'saveInvoiceDraft', 'setInvoiceTemplate', 'setInvoicePaperSize', 'finalizeInvoice',
  'finalizeInvoiceWithPayment', 'reviseInvoice', 'voidInvoice', 'deleteInvoice',
  'saveReturnDraft', 'finalizeReturn', 'voidReturn', 'deleteReturn', 'addPayment',
  'deletePayment', 'upsertCheck', 'deleteCheck', 'repairPaymentInvoiceLinks',
  'addAdjustment', 'addStockAdjustment', 'upsertProduct', 'deleteProduct',
  'upsertAccount', 'deleteAccount', 'addMoneyTransaction', 'voidMoneyTransaction',
  'convertQuoteToInvoice',
] as const;
export type DomainAction = typeof DOMAIN_ACTIONS[number];
export type DomainCommand = { type: 'domain.execute'; action: DomainAction; args: unknown[]; seed: string };

export function isDomainCommand(value: unknown): value is DomainCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as DomainCommand;
  return command.type === 'domain.execute' && DOMAIN_ACTIONS.includes(command.action)
    && Array.isArray(command.args) && command.args.length <= 3
    && typeof command.seed === 'string' && /^[A-Za-z0-9_-]{12,100}$/.test(command.seed);
}

export class DomainCommandError extends Error {
  readonly code: string;
  readonly fieldErrors?: OperationResult['fieldErrors'];
  constructor(result: OperationResult) {
    super(result.message || 'فرمان مالی معتبر نیست.');
    this.code = result.code || 'VALIDATION_FAILED';
    this.fieldErrors = result.fieldErrors;
  }
}

export function applyDomainCommand(data: AccountingData, command: DomainCommand) {
  const execution = executeDomainOperation(data, command.action, command.args, command.seed);
  const result = execution.result as OperationResult | undefined;
  if (result?.ok === false) throw new DomainCommandError(result);
  return execution.data;
}
