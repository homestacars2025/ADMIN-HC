import React, { useEffect, useRef, useState } from 'react';
import { Plus, Search } from '../../components/media/MediaIcons';
import { Input, Spinner } from '../../components/media/MediaUI';
import { CustomerAvatar } from '../../components/shared/PersonAvatar';
import { formatDate, searchCustomers, type CustomerSearchResult } from '../../lib/customers';
import { cn } from '../../lib/media/badgeColor';
import { BalancePill, BannedBadge, Flag } from './ui';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

const isExact = (row: CustomerSearchResult) => row.match_type !== 'name';

const ResultRow: React.FC<{ row: CustomerSearchResult; onSelect: (row: CustomerSearchResult) => void }> = ({ row, onSelect }) => (
  <li title={row.is_banned ? `Banned: ${row.ban_reason ?? 'no reason given'}` : undefined}>
    <button
      type="button"
      disabled={row.is_banned}
      onClick={() => onSelect(row)}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30',
        row.is_banned
          ? 'cursor-not-allowed border-[#DC2626]/30 bg-[#DC2626]/[0.06]'
          : 'border-subtle bg-surface hover:bg-black/[0.02]',
      )}
    >
      <CustomerAvatar size={38} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">{row.full_name}</span>
          <Flag nationality={row.nationality} />
          {isExact(row) && !row.is_banned && (
            <span className="whitespace-nowrap rounded-full bg-[#16A34A]/10 px-2 py-0.5 text-[11px] font-semibold leading-none text-[#15803D]">Exact match</span>
          )}
          {row.is_banned && <BannedBadge reason={row.ban_reason} className="uppercase" />}
        </span>
        <span className="mt-0.5 block truncate text-[12px] tabular-nums text-black/50" dir="ltr">
          {[row.phone, row.id_number].filter(Boolean).join(' · ') || 'No phone or ID on file'}
        </span>
        {row.is_banned && row.ban_reason && (
          <span className="mt-0.5 block text-[12px] font-medium text-[#B91C1C]">{row.ban_reason}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <BalancePill balance={row.balance} />
        <span className="whitespace-nowrap text-[11.5px] tabular-nums text-black/45">
          {row.bookings_count} {row.bookings_count === 1 ? 'booking' : 'bookings'}
          {row.last_booking ? ` · ${formatDate(row.last_booking)}` : ''}
        </span>
      </span>
    </button>
  </li>
);

/** Finds an existing customer for a booking. Banned people show up, but can't be picked. */
export const CustomerPicker: React.FC<{
  onSelect: (row: CustomerSearchResult) => void;
  /** Left out where a new customer can't be created, like when editing a booking. */
  onNew?: (query: string) => void;
}> = ({ onSelect, onNew }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searched, setSearched] = useState('');
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const term = query.trim();
  const ready = term.length >= MIN_QUERY;

  useEffect(() => {
    if (!ready) {
      setResults([]);
      setSearched('');
      setSearching(false);
      setFailed(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchCustomers(term)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setSearched(term);
          setFailed(false);
        })
        .catch(() => { if (!cancelled) setFailed(true); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, ready]);

  const focusable = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusable()[0]?.focus();
    }
    if (event.key !== 'Enter') return;
    // Enter here must never submit the booking form around it.
    event.preventDefault();
    const exact = results.find((row) => isExact(row) && !row.is_banned);
    if (exact) onSelect(exact);
  };

  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = focusable();
    const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowDown' ? 1 : -1);
    if (next >= 0 && next < buttons.length) buttons[next].focus();
  };

  return (
    <div className="media-scope flex flex-col gap-2.5" style={{ gridColumn: 'span 2' }}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search by ID / passport, phone or name"
          aria-label="Search by ID / passport, phone or name"
          className="!h-11 ps-9 pe-9"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size={14} /></span>}
      </div>

      {failed && <p role="alert" className="text-[12.5px] text-[#B91C1C]">Search failed. Check your connection and try again.</p>}

      {results.length > 0 && (
        <ul ref={listRef} onKeyDown={onListKey} className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
          {results.map((row) => <ResultRow key={row.id} row={row} onSelect={onSelect} />)}
        </ul>
      )}

      {ready && !searching && !failed && searched === term && results.length === 0 && (
        <p className="text-[13px] text-black/50">No customer matches “{term}”.</p>
      )}

      {onNew && (
        <button
          type="button"
          onClick={() => onNew(query)}
          className="inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] border border-subtle bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-black/[0.03]"
        >
          <Plus size={14} /> New customer
        </button>
      )}
    </div>
  );
};
