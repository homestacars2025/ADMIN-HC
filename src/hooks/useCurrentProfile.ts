import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface CurrentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
}

export function useCurrentProfile() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) { setProfile(null); setLoading(false); }
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role')
        .eq('id', user.id)
        .single();

      if (mounted) {
        setProfile(data ?? null);
        setLoading(false);
      }
    }

    loadProfile();
    return () => { mounted = false; };
  }, []);

  return { profile, loading };
}
