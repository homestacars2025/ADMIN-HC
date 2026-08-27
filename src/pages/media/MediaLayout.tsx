import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import '../../lib/media/tokens.css';
import { getFormats, getGoals } from '../../lib/media/queries';
import type { MediaFormat, MediaGoal } from '../../lib/media/types';
import { MediaToaster } from '../../components/media/MediaToast';

/**
 * The Media shell.
 *
 * Goals and formats are fetched once here rather than per page: Ideas, Calendar
 * and Lists all need them, and three pages each firing their own lookup query
 * would be a waterfall the user pays for on every tab switch.
 */

interface MediaLookupsValue {
  goals: MediaGoal[];
  formats: MediaFormat[];
  loading: boolean;
  /** Re-reads both lookup tables — the Lists page calls this after every edit. */
  reload: () => Promise<void>;
}

const MediaLookupsContext = createContext<MediaLookupsValue>({
  goals: [],
  formats: [],
  loading: true,
  reload: async () => {},
});

export function useMediaLookups(): MediaLookupsValue {
  return useContext(MediaLookupsContext);
}

const MediaLayout: React.FC = () => {
  const [goals, setGoals] = useState<MediaGoal[]>([]);
  const [formats, setFormats] = useState<MediaFormat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const [nextGoals, nextFormats] = await Promise.all([getGoals(), getFormats()]);
    if (signal?.cancelled) return;
    setGoals(nextGoals);
    setFormats(nextFormats);
    setLoading(false);
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const value = useMemo(
    () => ({ goals, formats, loading, reload }),
    [goals, formats, loading, reload],
  );

  return (
    <MediaLookupsContext.Provider value={value}>
      <div className="media-scope media-page px-5 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </div>
      <MediaToaster />
    </MediaLookupsContext.Provider>
  );
};

export default MediaLayout;
