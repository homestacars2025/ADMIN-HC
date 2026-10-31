import React, { useEffect, useState } from 'react';
import { useShell } from '../components/shell/shellContext';
import { PageHeader } from '../components/media/MediaShared';
import { Switch } from '../components/media/MediaUI';
import { CURRENCIES, CURRENCY_SYMBOLS, useCurrency, type Currency } from '../lib/CurrencyContext';
import { cn } from '../lib/media/badgeColor';
import { playNotificationSound } from '../lib/notificationSound';
import { loadUserSettings, saveUserSettings } from '../lib/userSettings';

const ROW = 'flex min-h-[64px] items-center justify-between gap-4 border-b border-subtle px-5 py-3 last:border-b-0 sm:px-6';
const HIT_AREA = "after:absolute after:-inset-[13px] after:content-['']";

const RowText: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <div className="min-w-0">
    <div className="text-[14px] text-foreground">{title}</div>
    <div className="mt-0.5 text-[12.5px] text-black/45">{hint}</div>
  </div>
);

const SettingsPage: React.FC = () => {
  const { profile } = useShell();
  const { currency, setCurrency } = useCurrency();
  const [sound, setSound] = useState(false);
  const [startCollapsed, setStartCollapsed] = useState(false);

  const userId = profile?.id;

  useEffect(() => {
    if (!userId) return;
    const saved = loadUserSettings(userId);
    setSound(saved.notificationSound);
    setStartCollapsed(saved.startCollapsed);
  }, [userId]);

  const chooseCurrency = (next: Currency) => {
    setCurrency(next);
    if (userId) saveUserSettings(userId, { currency: next });
  };

  const toggleSound = (next: boolean) => {
    setSound(next);
    if (userId) saveUserSettings(userId, { notificationSound: next });
    if (next) playNotificationSound();
  };

  const toggleCollapsed = (next: boolean) => {
    setStartCollapsed(next);
    if (userId) saveUserSettings(userId, { startCollapsed: next });
  };

  return (
    <div className="media-scope mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-6 sm:px-6 lg:py-9">
      <PageHeader eyebrow="Account" title="Settings" subtitle="Saved on this device for your account." />

      <section className="rounded-2xl border border-subtle bg-surface">
        <div className={cn(ROW, 'flex-wrap')}>
          <RowText title="Currency" hint="Amounts across the dashboard are shown in this currency." />
          <div role="group" aria-label="Currency" className="flex gap-1.5">
            {CURRENCIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={currency === option}
                title={option}
                onClick={() => chooseCurrency(option)}
                className={cn(
                  'h-11 min-w-[48px] rounded-lg border px-3 text-[13px] font-medium transition-colors md:h-9',
                  currency === option
                    ? 'border-brand-strong bg-brand-strong/10 text-brand-strong'
                    : 'border-subtle text-black/60 hover:bg-black/[0.03]',
                )}
              >
                {CURRENCY_SYMBOLS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className={ROW}>
          <RowText title="Notification sound" hint="Play a short chime when a new notification arrives." />
          <Switch checked={sound} onChange={toggleSound} ariaLabel="Notification sound" activeClass="bg-brand-strong" className={HIT_AREA} />
        </div>

        <div className={ROW}>
          <RowText title="Start with sidebar collapsed" hint="Open the dashboard with the narrow icon sidebar." />
          <Switch checked={startCollapsed} onChange={toggleCollapsed} ariaLabel="Start with sidebar collapsed" activeClass="bg-brand-strong" className={HIT_AREA} />
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
