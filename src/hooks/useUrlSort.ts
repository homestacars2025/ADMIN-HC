import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDirection = 'asc' | 'desc';

/**
 * The sorted column, kept in the URL as `?sort=km&dir=desc` so a refresh, the back
 * button and a shared link all keep it. The default order leaves the URL clean.
 */
export function useUrlSort<T extends string>(
  allowed: readonly T[],
  fallback: { key: T; direction: SortDirection },
  firstDirection: (key: T) => SortDirection,
) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('sort') as T | null;
  const key = raw && allowed.includes(raw) ? raw : fallback.key;
  const dir = params.get('dir');
  const direction: SortDirection = dir === 'asc' || dir === 'desc'
    ? dir
    : key === fallback.key ? fallback.direction : firstDirection(key);

  const apply = useCallback((nextKey: T, nextDirection: SortDirection) => {
    const updated = new URLSearchParams(params);
    if (nextKey === fallback.key && nextDirection === fallback.direction) {
      updated.delete('sort');
      updated.delete('dir');
    } else {
      updated.set('sort', nextKey);
      updated.set('dir', nextDirection);
    }
    setParams(updated);
  }, [params, setParams, fallback.key, fallback.direction]);

  /** A new column opens its useful way round, and a second click reverses it. */
  const sortBy = useCallback((next: T) => {
    if (next === key) apply(next, direction === 'asc' ? 'desc' : 'asc');
    else apply(next, firstDirection(next));
  }, [key, direction, apply, firstDirection]);

  const reverse = useCallback(() => apply(key, direction === 'asc' ? 'desc' : 'asc'), [apply, key, direction]);

  return { key, direction, sortBy, reverse };
}
