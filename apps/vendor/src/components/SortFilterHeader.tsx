'use client';

export function SortableHeaderCell({ label, indicator, onClick }: { label: string; indicator: string; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className="text-left px-6 py-3 font-semibold text-steel cursor-pointer select-none hover:text-lantern-deep transition-colors whitespace-nowrap"
    >
      {label} <span className="text-lantern-deep text-xs">{indicator}</span>
    </th>
  );
}

export function FilterTextCell({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <th className="px-6 pb-3">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Filter…'}
        className="w-full border border-border rounded-lg px-2 py-1 text-xs font-normal focus:border-lantern outline-none"
      />
    </th>
  );
}

export function FilterSelectCell({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <th className="px-6 pb-3">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border rounded-lg px-2 py-1 text-xs font-normal focus:border-lantern outline-none"
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </th>
  );
}
