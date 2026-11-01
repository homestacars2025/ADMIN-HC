import React, { useRef } from 'react';
import { Check } from '../media/MediaIcons';
import { toast } from '../media/MediaToast';
import { cn } from '../../lib/media/badgeColor';
import { saveAvatarBg } from '../../lib/staffAvatarApi';
import {
  AVATAR_BGS,
  avatarBgLabel,
  publishAvatarBg,
  useAvatarBg,
  type AvatarBg,
  type AvatarProfile,
} from '../../lib/staffAvatar';
import StaffAvatar from './StaffAvatar';

/** Four previews of this person's own picture, one in each color. */
export const AvatarBgSwatches: React.FC<{
  profile: AvatarProfile;
  value: AvatarBg;
  onChange: (bg: AvatarBg) => void;
  className?: string;
}> = ({ profile, value, onChange, className }) => (
  <div className={className}>
    <p className="text-[12.5px] font-medium text-black/60">Background color</p>
    <div className="mt-1 flex flex-wrap gap-0.5">
      {AVATAR_BGS.map((bg) => (
        <button
          key={bg}
          type="button"
          aria-pressed={value === bg}
          aria-label={avatarBgLabel(bg)}
          title={avatarBgLabel(bg)}
          onClick={() => onChange(bg)}
          className="grid h-11 w-11 place-items-center rounded-full"
        >
          <span className={cn('relative block rounded-full', value === bg && 'ring-2 ring-primary ring-offset-1')}>
            {/* Without the id the preview shows this color, not the person's saved one. */}
            <StaffAvatar profile={{ ...profile, id: null, avatar_bg: bg }} size={36} />
            {value === bg && (
              <span className="absolute -bottom-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-white">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  </div>
);

/**
 * The same swatches for a place with no Save button. The color changes on the click.
 * Saves run one at a time and only the latest choice goes next, so a quick second
 * click can't lose to the first one landing late. Key it by person.
 */
export const AvatarBgPicker: React.FC<{
  profile: AvatarProfile & { id: string };
  className?: string;
}> = ({ profile, className }) => {
  const value = useAvatarBg(profile);
  const nextBg = useRef<AvatarBg | null>(null);
  const saving = useRef(false);

  const pick = async (bg: AvatarBg) => {
    if (bg === value) return;
    publishAvatarBg(profile.id, bg);
    nextBg.current = bg;
    if (saving.current) return;

    saving.current = true;
    let saved = value;
    while (nextBg.current) {
      const choice: AvatarBg = nextBg.current;
      nextBg.current = null;
      try {
        await saveAvatarBg(profile.id, choice);
        saved = choice;
      } catch (error) {
        if (nextBg.current) continue;
        publishAvatarBg(profile.id, saved);
        toast.error(`Couldn't save the color: ${error instanceof Error ? error.message : 'try again'}`);
      }
    }
    saving.current = false;
  };

  return <AvatarBgSwatches profile={profile} value={value} onChange={pick} className={className} />;
};
