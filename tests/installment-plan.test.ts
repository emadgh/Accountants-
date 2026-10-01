import { describe, expect, it } from 'vitest';
import { calculateAutomaticInstallments, existingAutomaticInstallmentOptions } from '../lib/installment-plan';
import { jalaliDateParts } from '../lib/standards';
import { invoiceTotal } from '../lib/utils';
import type { Invoice } from '../lib/types';

const invoice: Invoice = {
  id: 'sale-1', number: 'S-1', businessProfileId: 'business_default', templateId: 'classic', kind: 'sale', status: 'draft',
  date: '2026-03-21', customerId: 'customer-1', customerName: 'مشتری', customerPhone: '', customerAddress: '',
  items: [{ id: 'service-1', description: 'طراحی', unit: 'مورد', qty: 1, unitPrice: 1_000_000 }],
  discount: 0, tax: 0, shipping: 0, notes: '', createdAt: '2026-03-21', updatedAt: '2026-03-21',
};

describe('automatic installment plan', () => {
  it('adds a visible financing line and balances down payment plus monthly installments', () => {
    const options = { downPayment: 200_000, count: 3, profitPercent: 10, firstDueDate: '2026-03-21' };
    const plan = calculateAutomaticInstallments(invoice, options, '2026-03-20');
    expect(plan.baseAmount).toBe(1_000_000);
    expect(plan.financed).toBe(800_000);
    expect(plan.financeCharge).toBe(80_000);
    expect(plan.grandTotal).toBe(1_080_000);
    expect(plan.installments.map((item) => item.amount)).toEqual([200_000, 293_333, 293_333, 293_334]);
    expect(plan.installments.reduce((sum, item) => sum + item.amount, 0)).toBe(invoiceTotal(plan.invoice));
    expect(plan.installments.slice(1).map((item) => jalaliDateParts(item.dueDate))).toEqual([
      { jy: 1405, jm: 1, jd: 1 }, { jy: 1405, jm: 2, jd: 1 }, { jy: 1405, jm: 3, jd: 1 },
    ]);
    expect(existingAutomaticInstallmentOptions(plan.invoice)).toMatchObject(options);

    const recalculated = calculateAutomaticInstallments(plan.invoice, { ...options, profitPercent: 5 }, '2026-03-20');
    expect(recalculated.invoice.items).toHaveLength(2);
    expect(recalculated.financeCharge).toBe(40_000);
    expect(recalculated.installments.reduce((sum, item) => sum + item.amount, 0)).toBe(invoiceTotal(recalculated.invoice));
  });

  it('rejects an excessive down payment and invalid installment count', () => {
    expect(() => calculateAutomaticInstallments(invoice, { downPayment: 1_000_000, count: 3, profitPercent: 10, firstDueDate: '2026-03-21' })).toThrow();
    expect(() => calculateAutomaticInstallments(invoice, { downPayment: 0, count: 0, profitPercent: 10, firstDueDate: '2026-03-21' })).toThrow();
  });
});
