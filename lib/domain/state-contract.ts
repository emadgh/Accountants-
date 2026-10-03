import type {
  Account,
  AccountAdjustment,
  AccountingData,
  AttachmentMetadata,
  BusinessProfile,
  BusinessSettings,
  CheckRecord,
  Customer,
  DocumentSequenceKey,
  Invoice,
  InvoicePaperSize,
  MoneyTransaction,
  OperationResult,
  Payment,
  Product,
  Project,
  Quote,
  ReturnDocument,
  ReturnOperationResult,
  StockAdjustmentInput,
  StoreOperationResult
} from '../types';

export type AccountingState = AccountingData & {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  reserveDocumentNumber: (key: DocumentSequenceKey) => string;
  upsertQuote: (quote: Quote) => OperationResult;
  setQuoteStatus: (id: string, status: Quote['status']) => OperationResult;
  convertQuoteToInvoice: (id: string) => StoreOperationResult;
  upsertProject: (project: Project) => OperationResult;
  addAttachment: (attachment: AttachmentMetadata) => OperationResult;
  removeAttachment: (id: string) => void;
  createBusinessProfile: (profile: BusinessProfile) => OperationResult & { profile?: BusinessProfile };
  upsertBusinessProfile: (profile: BusinessProfile) => OperationResult;
  deleteBusinessProfile: (id: string) => OperationResult;
  setDefaultBusinessProfile: (id: string) => OperationResult;
  upsertCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => OperationResult;
  upsertProduct: (product: Product) => OperationResult;
  deleteProduct: (id: string) => OperationResult;
  saveInvoiceDraft: (invoice: Invoice) => StoreOperationResult;
  setInvoiceTemplate: (id: string, templateId: Invoice['templateId']) => StoreOperationResult;
  setInvoicePaperSize: (id: string, paperSize: InvoicePaperSize) => StoreOperationResult;
  finalizeInvoice: (invoice: Invoice) => StoreOperationResult;
  finalizeInvoiceWithPayment: (invoice: Invoice, payment?: Payment) => StoreOperationResult;
  reviseInvoice: (invoice: Invoice, reason: string) => StoreOperationResult;
  voidInvoice: (id: string, reason: string) => StoreOperationResult;
  deleteInvoice: (id: string) => StoreOperationResult;
  saveReturnDraft: (document: ReturnDocument) => ReturnOperationResult;
  finalizeReturn: (document: ReturnDocument) => ReturnOperationResult;
  voidReturn: (id: string, reason: string) => ReturnOperationResult;
  deleteReturn: (id: string) => OperationResult;
  addPayment: (payment: Payment) => OperationResult;
  repairPaymentInvoiceLinks: (links: Array<{ paymentId: string; invoiceId: string }>) => OperationResult & { updated?: number };
  deletePayment: (id: string, reason: string) => OperationResult;
  addAdjustment: (adjustment: AccountAdjustment) => OperationResult;
  addStockAdjustment: (input: StockAdjustmentInput) => OperationResult;
  upsertAccount: (account: Account) => OperationResult;
  deleteAccount: (id: string) => OperationResult;
  addMoneyTransaction: (transaction: MoneyTransaction) => OperationResult;
  voidMoneyTransaction: (id: string, reason: string) => OperationResult;
  upsertCheck: (check: CheckRecord) => OperationResult;
  deleteCheck: (id: string) => OperationResult;
  setSettings: (settings: BusinessSettings) => void;
  replaceAll: (data: AccountingData) => void;
  resetAll: () => void;
};

