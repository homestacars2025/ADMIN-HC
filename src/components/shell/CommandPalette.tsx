import { CustomerAvatar } from '../shared/PersonAvatar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { searchRecords, type SearchGroup, type SearchResult } from '../../lib/globalSearch';
import { cn } from '../../lib/media/badgeColor';
import { Search } from '../media/MediaIcons';
import { NAV_PAGES } from '../Sidebar';

const DEBOUNCE_MS = 200;
const GROUP_ORDER: SearchGroup[] = ['Pages', 'Cars', 'Bookings', 'Customers'];

function matchPages(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  const pages = q
    ? NAV_PAGES.filter((page) => `${page.label} ${page.group}`.toLowerCase().includes(q))
    : NAV_PAGES;
  return pages.slice(0, q ? 6 : 8).map((page) => ({
    id: `page-${page.path}`,
    group: 'Pages',
    title: page.label,
    subtitle: page.group,
    to: page.path,
  }));
}

export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setRecords([]);
      setSearching(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchRecords(term);
        if (cancelled) return;
        setRecords(found);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Listed in display order, so the arrow keys follow what's on screen.
  const results = useMemo(() => {
    const all = [...matchPages(query), ...records];
    return GROUP_ORDER.flatMap((group) => all.filter((result) => result.group === group));
  }, [query, records]);

  useEffect(() => { setActiveIndex(0); }, [results]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const open = (result: SearchResult) => {
    onClose();
    navigate(result.to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      open(results[activeIndex]);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[3100] flex items-start justify-center bg-[rgba(15,17,23,0.35)] px-3 pt-[10vh]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
        className="flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-center gap-3 border-b border-subtle px-4">
          <Search size={17} className="shrink-0 text-black/40" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cars, bookings, customers or pages"
            aria-label="Search"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-black/35"
          />
          <kbd className="hidden rounded-md border border-subtle px-1.5 py-0.5 text-[11px] text-black/45 sm:block">esc</kbd>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {error && <p className="px-3 py-3 text-[13px] text-red-600">Search failed: {error}</p>}

          {GROUP_ORDER.map((group) => {
            const items = results.filter((result) => result.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-black/40">{group}</div>
                {items.map((result) => {
                  const active = results[activeIndex]?.id === result.id;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      data-active={active}
                      onMouseMove={() => setActiveIndex(results.indexOf(result))}
                      onClick={() => open(result)}
                      className={cn(
                        'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left',
                        active && 'bg-brand-strong/[0.08]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {group === 'Customers' && <CustomerAvatar size={28} />}
                        <span className={cn('truncate text-[13.5px] text-foreground', (group === 'Cars' || group === 'Bookings') && 'font-mono tabular-nums')}>
                          {result.title}
                        </span>
                      </span>
                      <span className="shrink-0 truncate text-[12px] text-black/45">{result.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {searching && <p className="px-3 py-3 text-[13px] text-black/45">Searching…</p>}
          {!searching && !error && results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-black/45">Nothing matches "{query.trim()}"</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
