import type { Customer } from '../types';
import { uid } from '../utils';
export function createGuestCustomer(input: Partial<Customer> & { name: string; kind: Customer['kind'] }): Customer {
  return { id: uid('customer'), code: `GUEST-${uid('code')}`, status: 'active', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0, ...input, name: input.name.trim() };
}
