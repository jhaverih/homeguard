'use client';
import { useMemo, useState } from 'react';

export type ColumnAccessors<T> = Record<string, (row: T) => string>;

export function useTableSortFilter<T>(rows: T[], accessors: ColumnAccessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
    }
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const rowsFilteredSorted = useMemo(() => {
    let result = rows;

    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      const accessor = accessors[key];
      if (!accessor) continue;
      const needle = value.toLowerCase();
      result = result.filter((row) => accessor(row).toLowerCase().includes(needle));
    }

    if (sortKey) {
      const accessor = accessors[sortKey];
      if (accessor) {
        result = [...result].sort((a, b) => {
          const cmp = accessor(a).localeCompare(accessor(b), undefined, { numeric: true, sensitivity: 'base' });
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [rows, filters, sortKey, sortDir, accessors]);

  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '');

  return { rows: rowsFilteredSorted, sortKey, sortDir, toggleSort, filters, setFilter, sortIndicator };
}
