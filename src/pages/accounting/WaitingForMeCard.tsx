import React from 'react';
import { Link } from 'react-router-dom';
import { TONE_CLASSES } from '../../components/shared/ComplianceBits';
import type { CurrencyTotal, WaitingForAdmin } from '../../lib/cashEnvelopes';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';
import { WalletIcon } from '../customers/ui';

const figures = (totals: CurrencyTotal[]) => totals.map((row) => formatMoney(row.total, row.currency)).join(' · ');

export const WaitingForMeCard: React.FC<{ waiting: WaitingForAdmin }> = ({ waiting }) => (
  <Link
    to="/dashboard/accounting?tab=vault"
    className={cn('mb-4 flex min-h-[44px] items-center gap-3 rounded-2xl border p-3.5 transition-opacity hover:opacity-90 sm:px-4', TONE_CLASSES.amber.panel)}
  >
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F59E0B] text-white"><WalletIcon size={20} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold leading-snug text-[#92400E]">Waiting for me</span>
      {waiting.envelopes.count > 0 && (
        <span className="mt-0.5 block text-[13px] tabular-nums text-[#92400E]">
          {waiting.envelopes.count === 1 ? '1 envelope' : `${waiting.envelopes.count} envelopes`} in safes · {figures(waiting.envelopes.totals)}
        </span>
      )}
      {waiting.accounts.length > 0 && <span className="mt-0.5 block text-[13px] tabular-nums text-[#92400E]">Bank and POS · {figures(waiting.accounts)}</span>}
    </span>
  </Link>
);
