import React, { useEffect, useRef, useState } from 'react';
import { useShell } from '../components/shell/shellContext';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button } from '../components/media/MediaUI';
import { PageHeader } from '../components/media/MediaShared';
import { AvatarBgPicker } from '../components/shared/AvatarBgPicker';
import StaffAvatar from '../components/shared/StaffAvatar';
import { COUNTRIES, parsePhone } from '../lib/phone';
import { supabase } from '../lib/supabase';
import { INPUT } from './bookings/ui';

/**
 * Team's profile page in Admin's look: who you are on top with your picture and its
 * color, your details, and your password. The picture is the Homesta character for
 * your gender until you upload a photo, and comes back when the photo is removed.
 */

const CARD = 'rounded-2xl border border-subtle bg-surface p-5 sm:p-6';
const BUTTON = '!h-11 px-4 md:!h-10';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MIN_PASSWORD_LENGTH = 8;

const GENDERS = [
  { value: '', label: 'Not set' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', staff: 'Staff', investor: 'Investor', customer: 'Customer' };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

/** What still stops the new password, or null when it can be saved. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (!password) return null;
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (confirm && confirm !== password) return "The two passwords don't match.";
  return null;
}

const Label: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-black/65">{children}</label>
);

const ReadOnly: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="mb-1.5 text-[12.5px] font-medium text-black/65">{label}</div>
    <div className="flex h-11 items-center truncate rounded-[10px] bg-black/[0.035] px-3 text-[14px] text-black/60 md:h-10">{value}</div>
  </div>
);

const Chip: React.FC<{ tone?: 'brand'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium ${tone === 'brand' ? 'bg-brand-strong/10 text-brand-strong' : 'bg-black/[0.05] text-black/60'}`}>
    {children}
  </span>
);

const PasswordCard: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const problem = passwordProblem(password, confirm);
  const valid = password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setPassword('');
      setConfirm('');
      toast.success('Password changed');
    } catch (error) {
      toast.error(`Couldn't change the password: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="text-[15px] font-medium text-foreground">Change password</h2>
        <p className="mt-0.5 text-[12.5px] text-black/45">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="profile-new-password">New password</Label>
          <input id="profile-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={INPUT} />
        </div>
        <div>
          <Label htmlFor="profile-confirm-password">Confirm new password</Label>
          <input id="profile-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={INPUT} />
        </div>
      </div>
      {problem && <p role="alert" className="-mt-1 text-[12.5px] text-[#B91C1C]">{problem}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={saving || !valid} className={BUTTON}>
          {saving ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
};

const ProfilePage: React.FC = () => {
  const { profile, reloadProfile } = useShell();
  const [fullName, setFullName] = useState('');
  const [dial, setDial] = useState('+90');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The form starts from the loaded profile once, and is the user's after that.
  const seeded = useRef(false);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    const parsed = parsePhone(profile.phone);
    setFullName(profile.full_name ?? '');
    setDial(parsed.dial);
    setPhone(parsed.number);
    setGender(profile.gender === 'male' || profile.gender === 'female' ? profile.gender : '');
  }, [profile]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 lg:py-9">
        <div className="h-48 animate-pulse rounded-2xl bg-black/[0.04]" />
      </div>
    );
  }

  const saveAvatar = async (avatar_url: string | null) => {
    const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', profile.id);
    if (error) throw new Error(error.message);
    reloadProfile();
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('The photo must be 5 MB or smaller.');
      return;
    }

    setPhotoBusy(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      // A new name each time: the bucket won't overwrite, and the browser would keep the old one cached.
      const path = `${profile.id}-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      await saveAvatar(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
      toast.success('Photo updated');
    } catch (error) {
      toast.error(`Couldn't update the photo: ${errorText(error)}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await saveAvatar(null);
      toast.success('Photo removed. Your character is back.');
    } catch (error) {
      toast.error(`Couldn't remove the photo: ${errorText(error)}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = fullName.trim();
    if (!name) {
      toast.error('Enter your full name.');
      return;
    }
    const digits = phone.replace(/^0+/, '');

    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: name, phone: digits ? `${dial}${digits}` : null, gender: gender || null })
        .eq('id', profile.id);
      if (error) throw new Error(error.message);
      reloadProfile();
      toast.success('Profile saved');
    } catch (error) {
      toast.error(`Couldn't save: ${errorText(error)}`);
    } finally {
      setSavingDetails(false);
    }
  };

  const hasPhoto = Boolean(profile.avatar_url);
  const role = profile.role ? ROLE_LABELS[profile.role] ?? profile.role : null;

  return (
    <div className="media-scope mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-6 sm:px-6 lg:py-9">
      <PageHeader eyebrow="Account" title="My profile" subtitle="Your picture, contact details and password." />

      <section className={`${CARD} flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-start`}>
        <StaffAvatar profile={profile} alt={profile.full_name ?? ''} size={104} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[19px] font-medium tracking-[-0.014em] text-foreground">{profile.full_name || profile.email}</h2>
          <p className="truncate text-[13px] text-black/45">{profile.email}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {role && <Chip tone="brand">{role}</Chip>}
            {profile.department_label && <Chip>{profile.department_label}</Chip>}
            {profile.is_department_head && <Chip>Department head</Chip>}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} onChange={uploadPhoto} className="hidden" aria-label="Upload a photo" />
            <Button variant="outline" size="lg" className="!h-11 px-3 md:!h-10" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {hasPhoto ? 'Replace photo' : 'Upload photo'}
            </Button>
            {hasPhoto && (
              <Button variant="ghost" size="lg" className="!h-11 px-3 text-[#B91C1C] md:!h-10" disabled={photoBusy} onClick={removePhoto}>
                Remove photo
              </Button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-black/40">
            {hasPhoto ? 'Remove the photo to go back to your Homesta character.' : 'Your Homesta character shows until you upload a photo. JPG, PNG or WebP, up to 5 MB.'}
          </p>
          <AvatarBgPicker key={profile.id} profile={profile} className="mt-3 flex flex-col items-center sm:items-start" />
        </div>
      </section>

      <form onSubmit={saveDetails} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="text-[15px] font-medium text-foreground">Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="profile-full-name">Full name</Label>
            <input id="profile-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className={INPUT} />
          </div>
          <div>
            <Label htmlFor="profile-phone">Phone</Label>
            <div className="flex gap-2">
              <select
                value={dial}
                onChange={(event) => setDial(event.target.value)}
                aria-label="Country code"
                className={`${INPUT} !w-[112px] shrink-0 px-2`}
              >
                {COUNTRIES.map((country) => (
                  <option key={`${country.code}-${country.dial}`} value={country.dial}>{country.flag} {country.dial}</option>
                ))}
              </select>
              <input
                id="profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, ''))}
                inputMode="tel"
                autoComplete="tel-national"
                className={`${INPUT} min-w-0 flex-1`}
              />
            </div>
          </div>
          <ReadOnly label="Email" value={profile.email ?? '—'} />
          <ReadOnly label="Department" value={`${profile.department_label ?? '—'}${profile.is_department_head ? ' · Head' : ''}`} />
          <div>
            <Label htmlFor="profile-gender">Gender</Label>
            <select id="profile-gender" value={gender} onChange={(event) => setGender(event.target.value)} className={INPUT}>
              {GENDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={savingDetails} className={BUTTON}>
            {savingDetails ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <PasswordCard />

      <MediaToaster />
    </div>
  );
};

export default ProfilePage;
