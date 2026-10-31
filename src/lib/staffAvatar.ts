export interface AvatarProfile {
  avatar_url?: string | null;
  gender?: string | null;
}

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
