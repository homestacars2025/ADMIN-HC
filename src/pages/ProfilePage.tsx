import React, { useEffect, useRef, useState } from 'react';
import { useShell } from '../components/shell/shellContext';
import { MediaToaster, toast } from '../components/media/MediaToast';
import { Button, Field, Input } from '../components/media/MediaUI';
import { PageHeader } from '../components/media/MediaShared';
import StaffAvatar from '../components/shared/StaffAvatar';
import { COUNTRIES, parsePhone } from '../lib/phone';
import { supabase } from '../lib/supabase';

const CARD = 'rounded-2xl border border-subtle bg-surface p-5 sm:p-6';
const BUTTON = 'h-11 bg-brand-strong px-4 text-white hover:bg-brand-strong/90 md:h-9';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIN_PASSWORD_LENGTH = 8;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const ReadOnly: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[12px] text-black/45">{label}</div>
    <div className="mt-0.5 truncate text-[14px] capitalize text-foreground">{value}</div>
  </div>
);

const ProfilePage: React.FC = () => {
  const { profile, reloadProfile } = useShell();
  const [fullName, setFullName] = useState('');
  const [dial, setDial] = useState('+90');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    const parsed = parsePhone(profile.phone);
    setFullName(profile.full_name ?? '');
    setDial(parsed.dial);
    setPhone(parsed.number);
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
      toast.success('Photo removed');
    } catch (error) {
      toast.error(`Couldn't remove the photo: ${errorText(error)}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error('Enter your full name.');
      return;
    }

    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() ? `${dial}${phone.trim()}` : null })
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

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error('The two passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (error) {
      toast.error(`Couldn't change the password: ${errorText(error)}`);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="media-scope mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-6 sm:px-6 lg:py-9">
      <PageHeader eyebrow="Account" title="My profile" subtitle="Your photo, contact details and password." />

      <section className={`${CARD} flex flex-wrap items-center gap-5`}>
        <StaffAvatar profile={profile} alt={profile.full_name ?? ''} size={88} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-medium tracking-[-0.014em] text-foreground">
            {profile.full_name || profile.email}
          </h2>
          <p className="truncate text-[13px] text-black/45">{profile.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} onChange={uploadPhoto} className="hidden" aria-label="Upload a photo" />
            <Button variant="outline" size="lg" className="h-11 px-3 md:h-9" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {profile.avatar_url ? 'Replace photo' : 'Upload photo'}
            </Button>
            {profile.avatar_url && (
              <Button variant="ghost" size="lg" className="h-11 px-3 md:h-9" disabled={photoBusy} onClick={removePhoto}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={saveDetails} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="text-[14px] font-medium text-foreground">Details</h2>
        <Field label="Full name">
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-11 md:h-9" autoComplete="name" />
        </Field>
        <Field label="Phone">
          <div className="flex gap-2">
            <select
              value={dial}
              onChange={(event) => setDial(event.target.value)}
              aria-label="Country code"
              className="h-11 w-[116px] shrink-0 rounded-lg border border-input bg-surface px-2 text-[13px] text-foreground md:h-9"
            >
              {COUNTRIES.map((country) => (
                <option key={`${country.code}-${country.dial}`} value={country.dial}>{country.flag} {country.dial}</option>
              ))}
            </select>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, ''))}
              inputMode="tel"
              autoComplete="tel-national"
              className="h-11 min-w-0 flex-1 md:h-9"
            />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-4 border-t border-subtle pt-4 sm:grid-cols-2">
          <ReadOnly label="Email" value={profile.email ?? '—'} />
          <ReadOnly label="Role" value={profile.role ?? '—'} />
          <ReadOnly label="Department" value={`${profile.department_label ?? '—'}${profile.is_department_head ? ' · Head' : ''}`} />
          <ReadOnly label="Gender" value={profile.gender ?? 'Not set'} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={savingDetails} className={BUTTON}>
            {savingDetails ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <form onSubmit={changePassword} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="text-[14px] font-medium text-foreground">Change password</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="New password">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 md:h-9" autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 md:h-9" autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={savingPassword || !password} className={BUTTON}>
            {savingPassword ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>

      <MediaToaster />
    </div>
  );
};

export default ProfilePage;
