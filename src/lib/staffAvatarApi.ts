import { supabase } from './supabase';
import type { AvatarBg } from './staffAvatar';

/** RLS rejects an update by matching no rows, not with an error, so the row has to come back. */
export async function saveAvatarBg(profileId: string, bg: AvatarBg): Promise<void> {
  const { data, error } = await supabase.from('profiles').update({ avatar_bg: bg }).eq('id', profileId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('You can\'t change this person\'s color.');
}
