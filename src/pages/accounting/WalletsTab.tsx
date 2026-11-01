import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/media/ConfirmDialog';
import { AlertTriangle } from '../../components/media/MediaIcons';
import { MediaToaster, toast } from '../../components/media/MediaToast';
import { Button } from '../../components/media/MediaUI';
import { useShell } from '../../components/shell/shellContext';
import { MonthNav } from '../../components/shared/MonthNav';
import StaffAvatar from '../../components/shared/StaffAvatar';
import { cn } from '../../lib/media/badgeColor';
import {
  currentMonth,
  fetchPayroll,
  formatTry,
  monthLabel,
  monthTotals,
  postSalaries,
  salariesToPost,
  saveMonthlySalary,
  shiftMonth,
  staffMonth,
  type PayrollData,
  type PayrollStaff,
} from '../../lib/payroll';
import { useConfirm } from '../media/useConfirm';
import { StaffDrawer } from '../payroll/StaffDrawer';

const CARD = 'rounded-2xl border border-subtle bg-surface';
const TH = 'whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-[0.06em] text-black/45';
const TD = 'whitespace-nowrap px-4 py-3 text-[13px]';
const MONEY = 'font-mono tabular-nums';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const SalaryCell: React.FC<{
  staff: PayrollStaff;
  onSave: (staff: PayrollStaff, value: number) => Promise<void>;
}> = ({ staff, onSave }) => {
  const [draft, setDraft] = useState(String(staff.monthly_salary || ''));

  useEffect(() => { setDraft(String(staff.monthly_salary || '')); }, [staff.monthly_salary]);

  const commit = async () => {
    const value = draft.trim() === '' ? 0 : Number(draft);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a salary of zero or more.');
      setDraft(String(staff.monthly_salary || ''));
      return;
    }
    if (value !== staff.monthly_salary) await onSave(staff, value);
  };

  return (
    <div onClick={(event) => event.stopPropagation()} className="flex items-center gap-1">
      <span className="text-black/40">₺</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={draft}
        placeholder="0"
        aria-label={`Monthly salary for ${staff.full_name ?? staff.email ?? 'employee'}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(String(staff.monthly_salary || ''));
            event.currentTarget.blur();
          }
        }}
        className={cn(
          'h-11 w-[108px] rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors',
          'hover:border-subtle focus:border-brand-strong md:h-9',
          MONEY,
        )}
      />
    </div>
  );
};

/** Salaries and bonuses: the employee's own money, not the custody they hold for the company. */
export const WalletsTab: React.FC = () => {
  const { profile } = useShell();
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const confirm = useConfirm();
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    // Quick month changes can finish out of order; only the latest may land.
    const request = ++requestRef.current;
    setError(null);
    try {
      const fresh = await fetchPayroll(month);
      if (request === requestRef.current) setData(fresh);
    } catch (e) {
      if (request === requestRef.current) setError(errorText(e));
    }
  }, [month]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const totals = useMemo(() => monthTotals(data?.entries ?? []), [data]);
  const toPost = useMemo(() => (data ? salariesToPost(data.staff, data.entries) : []), [data]);
  const drawerStaff = data?.staff.find((staff) => staff.id === drawerId) ?? null;
  const label = monthLabel(month);
  const adminId = profile?.id ?? '';

  const updateSalary = useCallback(async (staff: PayrollStaff, value: number) => {
    const patch = (monthly_salary: number) =>
      setData((current) => current && ({
        ...current,
        staff: current.staff.map((s) => (s.id === staff.id ? { ...s, monthly_salary } : s)),
      }));

    patch(value);
    try {
      await saveMonthlySalary(staff.id, value, adminId);
    } catch (e) {
      patch(staff.monthly_salary);
      toast.error(`Couldn't save the salary: ${errorText(e)}`);
    }
  }, [adminId]);

  const askPost = () => {
    const total = toPost.reduce((sum, staff) => sum + staff.monthly_salary, 0);
    confirm.ask({
      title: `Post salaries for ${label}?`,
      description: `This adds ${formatTry(total)} across ${toPost.length} ${toPost.length === 1 ? 'employee' : 'employees'}.`,
      consequence: 'A posted salary can only be undone by voiding it.',
      confirmLabel: 'Post salaries',
      onConfirm: async () => {
        try {
          const count = await postSalaries(month);
          toast.success(`Posted ${count} ${count === 1 ? 'salary' : 'salaries'} for ${label}`);
          await load();
        } catch (e) {
          toast.error(`Couldn't post salaries: ${errorText(e)}`);
        }
      },
    });
  };

  const summary = [
    { label: 'Salaries posted', value: totals.salaries },
    { label: 'Bonuses', value: totals.bonuses },
    { label: 'Advances', value: totals.advances },
    { label: 'Deductions', value: totals.deductions },
    { label: 'Paid out', value: totals.paidOut },
    { label: 'Remaining owed', value: data?.remainingOwed ?? 0, hint: 'All staff, all months' },
  ];

  const anySalarySet = data?.staff.some((staff) => staff.monthly_salary > 0) ?? false;

  return (
    <div className="media-scope">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13.5px] text-black/50">Staff salaries, bonuses and payouts. Always in Turkish lira.</p>
        <MonthNav
          label={label}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          justify="flex-start"
        />
      </div>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn't load payroll: {error}</span>
          <Button variant="outline" size="lg" className="!h-11 px-4 md:!h-10" onClick={load}>Try again</Button>
        </div>
      ) : !data ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {summary.map((item) => (
              <div key={item.label} className={cn(CARD, 'min-w-0 p-4')}>
                <div className="truncate text-[12px] text-black/50">{item.label}</div>
                <div className={cn('mt-1 truncate text-[17px] font-semibold text-foreground', MONEY)}>{formatTry(item.value)}</div>
                {item.hint && <div className="mt-0.5 truncate text-[11px] text-black/40">{item.hint}</div>}
              </div>
            ))}
          </div>

          <div className={cn(CARD, 'mt-4 flex flex-wrap items-center justify-between gap-3 p-4')}>
            <p className="text-[13px] text-black/55">
              {toPost.length > 0
                ? `${toPost.length} ${toPost.length === 1 ? 'salary' : 'salaries'} ready to post for ${label}.`
                : anySalarySet
                  ? `All salaries for ${label} are posted.`
                  : 'Set a monthly salary below to post salaries.'}
            </p>
            <Button
              size="lg"
              disabled={toPost.length === 0}
              onClick={askPost}
              className="!h-11 px-4 hover:/90 md:!h-10"
            >
              Post salaries for {label}
            </Button>
          </div>

          <section className={cn(CARD, 'mt-4 overflow-hidden')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-subtle text-left">
                    <th className={TH}>Staff</th>
                    <th className={TH}>Department</th>
                    <th className={TH}>Monthly salary</th>
                    <th className={cn(TH, 'text-right')}>Earned this month</th>
                    <th className={cn(TH, 'text-right')}>Paid this month</th>
                    <th className={cn(TH, 'text-right')}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((staff) => {
                    const { earned, paid } = staffMonth(data.entries, staff.id);
                    return (
                      <tr
                        key={staff.id}
                        onClick={() => setDrawerId(staff.id)}
                        className="cursor-pointer border-b border-subtle transition-colors last:border-b-0 hover:bg-black/[0.02]"
                      >
                        <td className={TD}>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setDrawerId(staff.id); }}
                            className="flex min-h-[44px] items-center gap-2.5 text-left font-medium text-foreground"
                          >
                            <StaffAvatar profile={staff} size={32} />
                            {staff.full_name || staff.email}
                            {staff.status !== 'active' && (
                              <span className="inline-flex h-[18px] items-center rounded-full bg-red-500/10 px-1.5 text-[10.5px] font-medium text-red-600">Disabled</span>
                            )}
                          </button>
                        </td>
                        <td className={cn(TD, 'text-black/55')}>{staff.department ?? '—'}</td>
                        <td className={TD}><SalaryCell staff={staff} onSave={updateSalary} /></td>
                        <td className={cn(TD, MONEY, 'text-right text-foreground')}>{formatTry(earned)}</td>
                        <td className={cn(TD, MONEY, 'text-right text-black/60')}>{formatTry(paid)}</td>
                        <td className={cn(TD, MONEY, 'text-right font-semibold', staff.balance < 0 ? 'text-red-600' : 'text-foreground')}>
                          {formatTry(staff.balance)}
                        </td>
                      </tr>
                    );
                  })}
                  {data.staff.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-[13px] text-black/40">No staff yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {drawerStaff && (
        <StaffDrawer
          staff={drawerStaff}
          month={month}
          adminId={adminId}
          onClose={() => setDrawerId(null)}
          onChanged={load}
        />
      )}

      <ConfirmDialog state={confirm.state} pending={confirm.pending} onCancel={confirm.cancel} onConfirm={confirm.confirm} />
      <MediaToaster />
    </div>
  );
};

