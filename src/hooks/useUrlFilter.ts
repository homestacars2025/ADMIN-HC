import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The active stat tile, kept in the URL as `?filter=unpaid` so a refresh, the back
 * button and a shared link all keep it. Anything unknown there just means "all".
 */
export function useUrlFilter<T extends string>(allowed: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('filter') as T | null;
  const filter: T | 'all' = raw && allowed.includes(raw) ? raw : 'all';

  const set = useCallback((next: T | 'all') => {
    const updated = new URLSearchParams(params);
    if (next === 'all') updated.delete('filter');
    else updated.set('filter', next);
    setParams(updated);
  }, [params, setParams]);

  const clear = useCallback(() => set('all'), [set]);
  const toggle = useCallback((next: T) => set(filter === next ? 'all' : next), [filter, set]);

  return { filter, toggle, clear };
}
