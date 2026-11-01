import { useSyncExternalStore } from 'react';

export interface AvatarProfile {
  id?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  avatar_bg?: string | null;
}

export const AVATAR_BGS = ['sky', 'mint', 'peach', 'lavender'] as const;
export type AvatarBg = typeof AVATAR_BGS[number];

const PALETTE: Record<AvatarBg, { label: string; center: string; edge: string }> = {
  sky:      { label: 'Sky',      center: '#EAF3FD', edge: '#CFE2F7' },
  mint:     { label: 'Mint',     center: '#E9F8EF', edge: '#C9EBD8' },
  peach:    { label: 'Peach',    center: '#FDF0E7', edge: '#F6D5BF' },
  lavender: { label: 'Lavender', center: '#F1ECFD', edge: '#DCD2F6' },
};

const AVATAR_DIR = `${process.env.PUBLIC_URL}/avatars`;

/** The Homesta character for this gender, or the neutral silhouette when it's unset. */
export function defaultStaffAvatar(gender?: string | null): string {
  if (gender === 'male') return `${AVATAR_DIR}/staff-male.webp`;
  if (gender === 'female') return `${AVATAR_DIR}/staff-female.webp`;
  return `${AVATAR_DIR}/staff-neutral.webp`;
}

/** A person's own photo if they have one, otherwise their default character. */
export function getStaffAvatar(profile: AvatarProfile | null | undefined): string {
  return profile?.avatar_url || defaultStaffAvatar(profile?.gender);
}

export function toAvatarBg(value: string | null | undefined): AvatarBg {
  return AVATAR_BGS.find((bg) => bg === value) ?? 'sky';
}

export const avatarBgLabel = (bg: AvatarBg): string => PALETTE[bg].label;

/** The fill behind a character. `closest-side` puts the edge color on the circle itself. */
export function avatarBgGradient(bg: AvatarBg): string {
  const { center, edge } = PALETTE[bg];
  return `radial-gradient(circle closest-side, ${center}, ${edge})`;
}

/** The ring around a photo, which keeps its own background. */
export const avatarBgRing = (bg: AvatarBg): string => PALETTE[bg].edge;

// ─── Colors changed in this tab ───────────────────────────────────────────────

/**
 * Lists are fetched page by page and `profiles` isn't on Realtime, so a color saved
 * here is kept by person and wins over whatever each list loaded.
 */
const changedBgs = new Map<string, AvatarBg>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function publishAvatarBg(profileId: string, bg: AvatarBg): void {
  changedBgs.set(profileId, bg);
  listeners.forEach((listener) => listener());
}

export function useAvatarBg(profile: AvatarProfile | null | undefined): AvatarBg {
  const id = profile?.id;
  const changed = useSyncExternalStore(subscribe, () => (id ? changedBgs.get(id) : undefined));
  return changed ?? toAvatarBg(profile?.avatar_bg);
}
