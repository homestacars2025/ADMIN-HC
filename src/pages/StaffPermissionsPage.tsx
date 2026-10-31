import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../lib/media/badgeColor';
import { supabase } from '../lib/supabase';
import type { AccessData } from '../lib/staffAccess';
import { fetchAccessData } from '../lib/staffAccessApi';
import { AlertTriangle, Info } from '../components/media/MediaIcons';
import { PageHeader } from '../components/media/MediaShared';
import { MediaToaster } from '../components/media/MediaToast';
import { Button, Skeleton } from '../components/media/MediaUI';
import { DepartmentsTab } from './staffPermissions/DepartmentsTab';
import { StaffAccessTab } from './staffPermissions/StaffAccessTab';
import { errorMessage } from './staffPermissions/shared';

type Tab = 'staff' | 'departments';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'staff', label: 'Staff' },
  { key: 'departments', label: 'Departments' },
];

const StaffPermissionsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('staff');
  const [data, setData] = useState<AccessData | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    Promise.all([fetchAccessData(), supabase.auth.getSession()])
      .then(([access, { data: session }]) => {
        if (cancelled) return;
        setData(access);
        setAdminId(session.session?.user.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const updateData = useCallback((update: (current: AccessData) => AccessData) => {
    setData((current) => (current ? update(current) : current));
  }, []);

  return (
    <div className="media-scope min-h-screen bg-surface px-4 py-6 sm:px-6 lg:px-10 lg:py-11">
      <PageHeader
        eyebrow="Admin"
        title="Staff Permissions"
        subtitle="Choose each employee's department and exactly which pages appear in their Team sidebar."
      />

      <div role="tablist" aria-label="Permissions views" className="mt-6 flex gap-1 overflow-x-auto border-b border-subtle">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px min-h-[44px] shrink-0 border-b-2 px-3 text-[13.5px] transition-colors',
              tab === key ? 'border-primary font-medium text-primary' : 'border-transparent text-black/55 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[12px] text-black/45">
        <Info size={13} className="mt-0.5 shrink-0" />
        Changes reach the Team app within 5 minutes, or the next time the employee returns to its window.
      </p>

      <div className="mt-4">
        {loadError ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">Couldn't load permissions: {loadError}</span>
            <Button variant="outline" size="lg" onClick={() => setReloadCount((count) => count + 1)}>Try again</Button>
          </div>
        ) : !data || !adminId ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : tab === 'staff' ? (
          <StaffAccessTab data={data} adminId={adminId} setData={updateData} />
        ) : (
          <DepartmentsTab data={data} setData={updateData} />
        )}
      </div>

      <MediaToaster />
    </div>
  );
};

export default StaffPermissionsPage;
