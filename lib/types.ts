export type CustomerKind = 'customer' | 'supplier' | 'both';
export type ProductKind = 'product' | 'service';
export type InvoiceKind = 'sale' | 'purchase';
export type ReturnKind = 'sale-return' | 'purchase-return';
export type ReturnStatus = 'draft' | 'final' | 'void';
export type InvoiceStatus = 'draft' | 'final' | 'partial' | 'settled' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'check';
export type PaymentDirection = 'receipt' | 'payment';
export type CheckStatus = 'pending' | 'cleared' | 'bounced';

export interface Customer {
  id: string;
  code: string;
  name: string;
  kind: CustomerKind;
  phone: string;
  address: string;
  nationalId: string;
  economicCode: string;
  postalCode: string;
  openingBalance: number;
  notes?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  kind: ProductKind;
  unit: string;
  salePrice: number;
  buyPrice: number;
  averageCost: number;
  stock: number;
  minStock: number;
  notes?: string;
}

export interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  details?: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

export type InvoiceAuditAction = 'created' | 'draft_saved' | 'finalized' | 'revised' | 'voided';

export interface InvoiceAuditEntry {
  id: string;
  action: InvoiceAuditAction;
  at: string;
  revision: number;
  note?: string;
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  date: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNationalId?: string;
  customerEconomicCode?: string;
  customerPostalCode?: string;
  items: InvoiceItem[];
  discount: number;
  tax: number;
  shipping: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
  finalizedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  auditTrail?: InvoiceAuditEntry[];
}

export interface ReturnItem {
  id: string;
  originalItemId: string;
  productId?: string;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

export type ReturnAuditAction = 'created' | 'draft_saved' | 'finalized' | 'voided';

export interface ReturnAuditEntry {
  id: string;
  action: ReturnAuditAction;
  at: string;
  note?: string;
}

export interface ReturnDocument {
  id: string;
  number: string;
  kind: ReturnKind;
  status: ReturnStatus;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  items: ReturnItem[];
  totalAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  auditTrail?: ReturnAuditEntry[];
}

export interface Payment {
  id: string;
  invoiceId?: string;
  customerId: string;
  direction: PaymentDirection;
  method: PaymentMethod;
  checkId?: string;
  amount: number;
  date: string;
  reference?: string;
  notes?: string;
}

export interface CheckRecord {
  id: string;
  direction: 'received' | 'issued';
  customerId: string;
  amount: number;
  dueDate: string;
  number: string;
  bank: string;
  owner: string;
  status: CheckStatus;
  notes?: string;
}

export type StockMovementType = 'opening' | 'purchase' | 'sale' | 'sale-return' | 'purchase-return' | 'reversal' | 'adjustment';
export type StockMovementAction =
  | 'migration-opening'
  | 'product-opening'
  | 'finalize'
  | 'revision-reversal'
  | 'revision'
  | 'void-reversal'
  | 'return-finalize'
  | 'return-void-reversal'
  | 'count'
  | 'manual-adjustment';

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  date: string;
  createdAt: string;
  quantity: number;
  balanceAfter: number;
  averageCostAfter: number;
  unitCost: number;
  type: StockMovementType;
  action: StockMovementAction;
  sourceType: 'invoice' | 'return' | 'adjustment' | 'system';
  sourceId: string;
  sourceReference?: string;
  sourceKind?: InvoiceKind | ReturnKind;
  note?: string;
}

export interface StockAdjustmentInput {
  productId: string;
  date: string;
  mode: 'count' | 'delta';
  quantity: number;
  note: string;
}

export interface AccountAdjustment {
  id: string;
  customerId: string;
  date: string;
  amount: number;
  note: string;
  createdAt: string;
}

export type LedgerEntryKind =
  | 'opening'
  | 'sale'
  | 'purchase'
  | 'sale-return'
  | 'purchase-return'
  | 'receipt'
  | 'payment'
  | 'check'
  | 'adjustment'
  | 'void';

export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  date: string;
  sortKey: string;
  kind: LedgerEntryKind;
  title: string;
  reference?: string;
  debit: number;
  credit: number;
  balance: number;
  nominalAmount?: number;
  effective: boolean;
  status?: string;
  note?: string;
  invoiceId?: string;
  invoiceKind?: InvoiceKind;
  returnId?: string;
  returnKind?: ReturnKind;
}

export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  nationalId: string;
  economicCode: string;
  postalCode: string;
  cardNumber: string;
  iban: string;
  bankName: string;
  invoiceTitle: string;
  footer: string;
  currency: 'تومان' | 'ریال';
  defaultTax: number;
}

export interface AccountingData {
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  returns: ReturnDocument[];
  payments: Payment[];
  checks: CheckRecord[];
  adjustments: AccountAdjustment[];
  stockMovements: StockMovement[];
  settings: BusinessSettings;
}

export interface OperationResult {
  ok: boolean;
  message?: string;
}

export interface StoreOperationResult extends OperationResult {
  invoice?: Invoice;
}

export interface ReturnOperationResult extends OperationResult {
  returnDocument?: ReturnDocument;
}
