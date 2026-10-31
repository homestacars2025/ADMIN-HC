import React from 'react';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { relativeDue, type TaskPriority } from '../../lib/tasks';

/** Team's stripe colours. Normal has none there too. */
const STRIPE: Partial<Record<TaskPriority, string>> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-400',
  low: 'bg-gray-300',
};

/** The same card Team's Tasks page draws. */
export const PhonePreview: React.FC<{
  title: string;
  description: string;
  priority: TaskPriority;
  dueIso: string | null;
  recurring: boolean;
  requiresProof: boolean;
  from: { full_name: string | null; avatar_url?: string | null; gender?: string | null } | null;
}> = ({ title, description, priority, dueIso, recurring, requiresProof, from }) => {
  const stripe = STRIPE[priority];

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[28px] bg-black/[0.03] p-3">
      <article
        data-testid="phone-preview"
        className="relative flex gap-3 overflow-hidden rounded-2xl border border-subtle bg-surface p-4"
      >
        {stripe && <span data-priority={priority} className={`absolute inset-y-0 start-0 w-1 ${stripe}`} />}

        <span aria-hidden="true" className="relative mt-0.5 h-[26px] w-[26px] shrink-0 rounded-full border-2 border-gray-300">
          {requiresProof && (
            <span className="absolute -bottom-1.5 -end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-strong text-white ring-2 ring-[var(--surface)]">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                <path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" fill="currentColor" />
              </svg>
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-semibold leading-snug text-[#0f1117]">{title.trim() || 'Task title'}</h4>
          {description.trim() && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-gray-600">{description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-gray-500">
            {dueIso && (
              <span className="inline-flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {relativeDue(dueIso)}
              </span>
            )}
            {recurring && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11.5px] font-medium text-gray-600">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Recurring
              </span>
            )}
            {requiresProof && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11.5px] font-medium text-gray-600">📷 Photo</span>
            )}
            {from?.full_name && (
              <span className="inline-flex items-center gap-1.5">
                <StaffAvatar profile={from} size={18} />
                From {from.full_name}
              </span>
            )}
          </div>
        </div>
      </article>
    </div>
  );
};
