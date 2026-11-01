import React from 'react';
import { Link } from 'react-router-dom';
import { ComplianceTriangle, TONE_CLASSES } from '../../components/shared/ComplianceBits';
import type { PendingSummary } from '../../lib/expenseApprovals';
import { cn } from '../../lib/media/badgeColor';
import { formatMoney } from '../../lib/money';

export const PendingExpensesHomeCard: React.FC<{ summary: PendingSummary }> = ({ summary }) => (
  <Link
    to="/dashboard/accounting?tab=custody&filter=pending"
    className={cn('mb-4 flex min-h-[44px] items-center gap-3 rounded-2xl border p-3.5 transition-opacity hover:opacity-90 sm:px-4', TONE_CLASSES.amber.panel)}
  >
    <ComplianceTriangle tone="amber" size={48} />
    <span className="min-w-0 flex-1">
      <span className="block text-[14px] font-semibold leading-snug text-[#92400E]">Expenses waiting for approval</span>
      <span className="mt-0.5 block text-[13px] tabular-nums text-[#92400E]">{summary.count === 1 ? '1 expense' : `${summary.count} expenses`}</span>
    </span>
    <span className="shrink-0 text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#92400E] sm:text-[28px]">{formatMoney(summary.total)}</span>
  </Link>
);
