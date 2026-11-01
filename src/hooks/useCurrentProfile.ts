import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface CurrentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  avatar_bg?: string | null;
  gender: string | null;
  role: string | null;
  department_label: string | null;
  is_department_head: boolean;
}

interface TeamMembership {
  is_department_head: boolean;
  departments: { label_en: string } | { label_en: string }[] | null;
}

export function useCurrentProfile() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) { setProfile(null); setLoading(false); }
        return;
      }

      const [{ data }, { data: membership }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, phone, avatar_url, avatar_bg, gender, role')
          .eq('id', user.id)
          .single(),
        supabase
          .from('team_members')
          .select('is_department_head, departments(label_en)')
          .eq('profile_id', user.id)
          .maybeSingle(),
      ]);

      if (!mounted) return;
      const team = membership as TeamMembership | null;
      const department = Array.isArray(team?.departments) ? team?.departments[0] : team?.departments;
      setProfile(data ? {
        ...data,
        department_label: department?.label_en ?? null,
        is_department_head: team?.is_department_head ?? false,
      } : null);
      setLoading(false);
    }

    loadProfile();
    return () => { mounted = false; };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { profile, loading, reload };
}
