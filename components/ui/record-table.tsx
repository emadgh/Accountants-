'use client';
import { useState, type ReactNode } from 'react';
import { DataTable } from './data-table';
import { Button } from './button';

export interface RecordColumn<T> {
  id: string; title: string; cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number; className?: string;
}
export function RecordTable<T>({ rows, columns, rowId, pageSize = 25, loading = false, emptyText = 'رکوردی مطابق فیلتر پیدا نشد.', actions }: {
  rows: readonly T[]; columns: readonly RecordColumn<T>[]; rowId: (row: T) => string;
  pageSize?: number; loading?: boolean; emptyText?: string; actions?: (row: T) => ReactNode;
}) {
  const [sort, setSort] = useState<{ column: string; descending: boolean }>();
  const [page, setPage] = useState(0);
  const size = Math.max(1, pageSize);
  const sortColumn = columns.find((column) => column.id === sort?.column);
  const ordered = sortColumn?.sortValue ? [...rows].sort((a, b) => {
    const left = sortColumn.sortValue!(a); const right = sortColumn.sortValue!(b);
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'fa', { numeric: true });
    return sort?.descending ? -result : result;
  }) : rows;
  const pages = Math.max(1, Math.ceil(ordered.length / size));
  const currentPage = Math.min(page, pages - 1);
  return <div><div className="table-wrap"><DataTable className="data-table">
    <thead><tr>{columns.map((column) => <th key={column.id} aria-sort={sort?.column === column.id ? sort.descending ? 'descending' : 'ascending' : column.sortValue ? 'none' : undefined}>
      {column.sortValue ? <button type="button" onClick={() => { setSort({ column: column.id, descending: sort?.column === column.id && !sort.descending }); setPage(0); }}>{column.title}{sort?.column === column.id ? sort.descending ? ' ↓' : ' ↑' : ''}</button> : column.title}
    </th>)}{actions && <th>عملیات</th>}</tr></thead>
    <tbody>{!loading && ordered.slice(currentPage * size, (currentPage + 1) * size).map((row) => <tr key={rowId(row)}>{columns.map((column) => <td key={column.id} className={column.className}>{column.cell(row)}</td>)}{actions && <td>{actions(row)}</td>}</tr>)}
      {(loading || !rows.length) && <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="!py-12 text-center text-slate-500" role="status">{loading ? 'در حال بارگذاری…' : emptyText}</td></tr>}
    </tbody>
  </DataTable></div><div className="flex items-center justify-between gap-2 p-3 text-xs text-slate-500"><span>{rows.length} رکورد · صفحه {currentPage + 1} از {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>قبلی</Button><Button size="sm" variant="outline" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>بعدی</Button></div></div></div>;
}
