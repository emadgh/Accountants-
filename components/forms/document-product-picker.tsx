'use client';
import type { ComponentProps } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import type { Product } from '@/lib/types';
export function DocumentProductPicker({ products, ...props }: Omit<ComponentProps<typeof SearchableSelect>, 'options'> & { products: readonly Product[] }) {
  const options: SearchableOption[] = [{value:'',label:'شرح دستی',description:'ردیف بدون اتصال به کالا/خدمت'}, ...products.filter(product => !product.archived || product.id === props.value).map(product => ({value:product.id,label:product.name,description:[product.code,product.kind === 'product' ? 'کالا' : 'خدمت',product.unit].join(' · '),keywords:[product.code,product.name,product.sku,product.barcode,product.notes].filter(Boolean).join(' ')}))];
  return <SearchableSelect {...props} options={options} placeholder={props.placeholder || 'انتخاب کالا / خدمت…'} searchPlaceholder="جستجوی نام، کد یا بارکد…" />;
}
