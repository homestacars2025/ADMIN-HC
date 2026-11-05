import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';
import StaffAvatar from '../components/shared/StaffAvatar';
import { CustomerAvatar } from '../components/shared/PersonAvatar';
import { Button } from '../components/media/MediaUI';
import { CarThumb } from '../components/shared/CarThumb';
import { COMPANY_EXPENSE_CATEGORIES, fetchPendingSummary, fetchSuggestedExpenses, type PendingSummary } from '../lib/expenseApprovals';
import { CashEnvelopesTab } from './accounting/CashEnvelopesTab';
import { CustomerWalletsTab } from './accounting/CustomerWalletsTab';
import { AddCustomerTxModal, EditTxModal, printLedgerInvoice, type CustomerLedgerEntry } from './accounting/CustomerLedgerForms';
import { MonthlyCloseTab } from './accounting/MonthlyCloseTab';
import { OverviewTiles } from './accounting/OverviewTiles';
import { StaffCustodyTab } from './accounting/StaffCustodyTab';
import { WalletsTab } from './accounting/WalletsTab';
import { SuggestedExpense, SuggestionBanner, SuggestionDialogs, useSuggestions } from './accounting/Suggestions';
import { SupplierSheet } from './accounting/SupplierSheet';
import { SuppliersTab } from './accounting/SuppliersTab';
import { LicensePlate, Segmented } from './bookings/ui';
import { isRecordedPayment } from '../lib/payments';

/** Scrolls the row a link pointed at into view. Pair it with `HIGHLIGHT_ROW` on that row. */
function useScrollToRow(rowId: number | null, ready: boolean) {
  useEffect(() => {
    if (rowId === null || !ready) return;
    document.getElementById(`entry-${rowId}`)?.scrollIntoView({ block: 'center' });
  }, [rowId, ready]);
}

const HIGHLIGHT_ROW = 'rgba(245,158,11,0.14)';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialTransaction {
  id: number;
  created_at: string;
  investor_id: number | null;
  month_key: string;
  sheet_type: string | null;
  car_id: number | null;
  category: string | null;
  amount: number;
  note: string | null;
  direction: string;
  date: string;
  receipt_url: string | null;
}

interface InvestorOption {
  id: string;
  display_name: string;
}

interface CarInfo {
  id: number;
  plate_number: string;
  model_name: string;
}

type PanelKey = 'company' | 'personal' | 'buy_sell' | `car:${number}`;

interface CompanyExpenseRow {
  id: number;
  created_at: string;
  expense_date: string;
  direction: 'IN' | 'OUT';
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  car_id: number | null;
  created_by: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_bg?: string | null;
  gender: string | null;
}

interface AddIfTxForm {
  date:          string;
  direction:     'IN' | 'OUT';
  amount:        string;
  inputCurrency: 'TRY' | 'USD';
  category:      string;
  employee_id:   string;
  note:          string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function moveMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
}

function sumTx(txs: FinancialTransaction[], filter: (t: FinancialTransaction) => boolean): number {
  return txs.filter(filter).reduce((a, t) => a + (t.amount ?? 0), 0);
}

// ─── Transaction receipts ─────────────────────────────────────────────────────

const RECEIPT_BUCKET     = 'transaction-receipts';
const RECEIPT_ACCEPT     = 'image/jpeg,image/jpg,image/png,image/webp,application/pdf';
const RECEIPT_MAX_BYTES  = 10 * 1024 * 1024; // 10 MB

interface ReceiptValue {
  file:        File | null;   // newly picked file (not uploaded yet)
  existingUrl: string | null; // receipt already stored on the transaction
  removed:     boolean;       // user cleared the existing receipt
}

const EMPTY_RECEIPT: ReceiptValue = { file: null, existingUrl: null, removed: false };

function receiptValueFrom(url: string | null | undefined): ReceiptValue {
  return { file: null, existingUrl: url ?? null, removed: false };
}

function isPdfReceipt(url: string): boolean {
  return url.split('?')[0].toLowerCase().endsWith('.pdf');
}

/** Lowercase, space-free folder segment built from a plate number / car id. */
function receiptFolder(key: string | number | null | undefined): string {
  const slug = String(key ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'general';
}

function newReceiptId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** Uploads a receipt and returns its public URL. Throws on failure. */
async function uploadReceipt(file: File, folderKey: string | number | null | undefined): Promise<string> {
  const rawExt = file.name.includes('.') ? file.name.split('.').pop()! : '';
  const ext    = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type === 'application/pdf' ? 'pdf' : 'jpg');
  const path   = `${receiptFolder(folderKey)}/${newReceiptId()}.${ext}`;

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  return supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Resolves the value to store in financial_transactions.receipt_url.
 * Uploads a newly picked file, keeps the existing URL, or clears it.
 */
async function resolveReceiptUrl(value: ReceiptValue, folderKey: string | number | null | undefined): Promise<string | null> {
  if (value.file) return await uploadReceipt(value.file, folderKey);
  if (value.removed) return null;
  return value.existingUrl;
}

/** Full-screen image preview. PDFs are opened in a new tab instead. */
const ReceiptLightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,17,23,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', maxWidth: '100%', maxHeight: '100%' }}>
        <img src={url} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,0.4)', background: '#fff' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href={url} target="_blank" rel="noreferrer"
            style={{ padding: '8px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}
          >
            Open in new tab
          </a>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 9, background: '#fff', border: 'none', color: '#0f1117', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Table-cell receipt indicator — a small button on rows that have a receipt. */
const ReceiptCell: React.FC<{ url: string | null | undefined }> = ({ url }) => {
  const [open, setOpen] = useState(false);

  if (!url) return <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>;

  const pdf = isPdfReceipt(url);

  return (
    <>
      <button
        type="button"
        title="View receipt"
        onClick={() => { if (pdf) window.open(url, '_blank', 'noopener,noreferrer'); else setOpen(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, border: '1px solid rgba(75,166,234,0.35)', background: 'rgba(75,166,234,0.08)', color: '#1d6fa8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(75,166,234,0.16)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(75,166,234,0.08)'; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {pdf ? 'PDF' : 'View'}
      </button>
      {open && <ReceiptLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Receipt picker used inside the Add / Edit Transaction modals. */
const ReceiptField: React.FC<{
  value:    ReceiptValue;
  onChange: (v: ReceiptValue) => void;
  disabled?: boolean;
  compact?:  boolean;
}> = ({ value, onChange, disabled, compact }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.file || value.file.type === 'application/pdf') { setPreview(null); return; }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);

  const pick = (file: File | null) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    const okType = RECEIPT_ACCEPT.split(',').includes(file.type);
    const okExt  = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);
    if (!okType && !okExt) {
      setFileError('Unsupported file — use JPG, PNG, WEBP or PDF.');
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setFileError('File is larger than 10 MB.');
      return;
    }
    setFileError(null);
    onChange({ ...value, file, removed: false });
  };

  const clear = () => {
    setFileError(null);
    // Dropping a newly picked file falls back to the stored receipt (if any);
    // dropping a stored receipt marks it for removal on save.
    if (value.file) onChange({ ...value, file: null });
    else onChange({ ...value, file: null, removed: true });
  };

  const showExisting = !value.file && !!value.existingUrl && !value.removed;
  const existingPdf  = showExisting && isPdfReceipt(value.existingUrl!);
  const thumb        = value.file ? preview : (showExisting && !existingPdf ? value.existingUrl : null);
  const hasSomething = !!value.file || showExisting;

  const chip: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff',
    fontSize: 11.5, fontWeight: 600, color: '#374151', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', transition: 'all 140ms ease',
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        disabled={disabled}
        style={{ display: 'none' }}
        onChange={e => pick(e.target.files?.[0] ?? null)}
      />

      {hasSomething ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: compact ? '6px 8px' : '10px 12px', opacity: disabled ? 0.6 : 1 }}>
          {thumb ? (
            <img
              src={thumb} alt="Receipt"
              onClick={() => { if (!value.file && value.existingUrl) setLightbox(true); }}
              style={{ width: compact ? 34 : 46, height: compact ? 34 : 46, objectFit: 'cover', borderRadius: 7, flexShrink: 0, cursor: !value.file && value.existingUrl ? 'zoom-in' : 'default', background: '#f3f4f6' }}
            />
          ) : (
            <div style={{ width: compact ? 34 : 46, height: compact ? 34 : 46, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>PDF</div>
          )}

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value.file ? value.file.name : 'Current receipt'}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              {value.file ? `${(value.file.size / 1024).toFixed(0)} KB · not uploaded yet` : 'Saved with this transaction'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {showExisting && (
              <button
                type="button"
                onClick={() => { if (existingPdf) window.open(value.existingUrl!, '_blank', 'noopener,noreferrer'); else setLightbox(true); }}
                style={{ ...chip, color: '#1d6fa8', borderColor: 'rgba(75,166,234,0.35)', cursor: 'pointer' }}
              >
                View
              </button>
            )}
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} style={chip}>Replace</button>
            <button
              type="button" disabled={disabled} onClick={clear}
              style={{ ...chip, color: '#dc2626', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', display: 'block', border: '1.5px dashed #e5e7eb', borderRadius: 10,
            padding: compact ? '8px 12px' : '18px 14px', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
            textAlign: 'center', fontFamily: 'inherit', transition: 'border-color 140ms ease', opacity: disabled ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
        >
          <div style={{ fontSize: 12.5, color: '#6b7280' }}>
            {value.removed && value.existingUrl ? 'Receipt will be removed on save' : 'Click to attach a receipt'}
          </div>
          {!compact && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>JPG, PNG, WEBP or PDF · max 10 MB</div>}
        </button>
      )}

      {fileError && (
        <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6 }}>{fileError}</div>
      )}

      {lightbox && value.existingUrl && <ReceiptLightbox url={value.existingUrl} onClose={() => setLightbox(false)} />}
    </div>
  );
};

// ─── Month Navigator ──────────────────────────────────────────────────────────

const MonthNavigator: React.FC<{ monthKey: string; onChange: (k: string) => void }> = ({ monthKey, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <button
      onClick={() => onChange(moveMonth(monthKey, -1))}
      style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', minWidth: 120, textAlign: 'center' }}>{monthLabel(monthKey)}</span>
    <button
      onClick={() => onChange(moveMonth(monthKey, 1))}
      style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  </div>
);

// ─── Mini Stat Card ───────────────────────────────────────────────────────────

const MiniStatCard: React.FC<{
  title: string;
  amount: number;
  label: string;
  color: string;
  bg: string;
  loading?: boolean;
  onClick?: () => void;
}> = ({ title, amount, label, color, bg, loading, onClick }) => {
  const { fmt } = useCurrency();
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)',
        padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; } }}
      onMouseLeave={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; } }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>{title}</div>
      {loading ? (
        <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 10 }} />
      ) : (
        <div style={{ fontSize: 22, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.5px', marginBottom: 10 }}>{fmt(amount)}</div>
      )}
      <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 20, padding: '2px 8px' }}>{label}</span>
    </div>
  );
};

// ─── Sheet Card (clickable, for All Sheets view) ───────────────────────────────

const SheetCard: React.FC<{
  title: string;
  subtitle?: string;
  count: number;
  balance: number;
  onClick: () => void;
}> = ({ title, subtitle, count, balance, onClick }) => {
  const { fmt } = useCurrency();
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)',
        padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: 'pointer', transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', marginBottom: subtitle ? 2 : 10 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>{subtitle}</div>}
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{count} records</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: balance < 0 ? '#dc2626' : '#0f1117', letterSpacing: '-0.5px' }}>
        {balance < 0 ? '-' : ''}{fmt(balance)}
      </div>
    </div>
  );
};

// ─── Summary View ─────────────────────────────────────────────────────────────

const SummaryView: React.FC<{ txs: FinancialTransaction[]; loading: boolean; monthKey: string; belowHero?: React.ReactNode }> = ({ txs, loading, monthKey, belowHero }) => {
  const { fmt } = useCurrency();
  const [carsMap, setCarsMap] = useState<Map<number, { plate: string; model: string }>>(new Map());
  const [ifData,  setIfData]  = useState<Pick<CompanyExpenseRow, 'amount' | 'direction'>[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase.from('cars').select('id, plate_number, model_group(name)').eq('is_active', true).then(({ data }) => {
      if (cancelled || !data) return;
      const m = new Map<number, { plate: string; model: string }>();
      (data as any[]).forEach(c => {
        const mg = c.model_group;
        const model = Array.isArray(mg) ? (mg[0]?.name ?? '—') : ((mg as { name: string } | null)?.name ?? '—');
        m.set(c.id, { plate: c.plate_number, model });
      });
      setCarsMap(m);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch company_expenses for this month — same source as CompanyExpensesTab
  useEffect(() => {
    let cancelled = false;
    const { start, end } = monthDateRange(monthKey);
    supabase.from('company_expenses')
      .select('amount, direction')
      .gte('expense_date', start)
      .lt('expense_date', end)
      .then(({ data }) => {
        if (cancelled) return;
        setIfData((data ?? []) as Pick<CompanyExpenseRow, 'amount' | 'direction'>[]);
      });
    return () => { cancelled = true; };
  }, [monthKey]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const income      = sumTx(txs, t => t.direction?.toLowerCase() === 'in');
  const expenses    = sumTx(txs, t => t.direction?.toLowerCase() === 'out');
  const rentIncome  = sumTx(txs, t => t.category === 'Rent Collection' && t.direction?.toLowerCase() === 'in');
  const net         = income - expenses;
  const commission  = sumTx(txs, t => t.category === 'Commission');

  const fuel        = sumTx(txs, t => t.category === 'Petrol'           && t.direction?.toLowerCase() === 'out');
  const oil         = sumTx(txs, t => t.category === 'Oil'              && t.direction?.toLowerCase() === 'out');
  const wash        = sumTx(txs, t => t.category === 'Wash'             && t.direction?.toLowerCase() === 'out');
  const maint       = sumTx(txs, t => t.category === 'Maintenance'      && t.direction?.toLowerCase() === 'out');
  const companyExp  = sumTx(txs, t => t.category === 'Company Expenses' && t.direction?.toLowerCase() === 'out');
  const personalExp = sumTx(txs, t => t.category === 'Personal'         && t.direction?.toLowerCase() === 'out');

  // ── Treasury values ───────────────────────────────────────────────────────
  // Green card: commission — positive income value
  const homestaCommission = commission;
  // Red card: same query as CompanyExpensesTab (company_expenses OUT rows) — positive display value
  const homestaExpenses = ifData.filter(r => r.direction === 'OUT').reduce((a, r) => a + (r.amount ?? 0), 0);
  // Hero: signed sum — expenses are outflows so carry a negative sign;
  // adding the signed value avoids any hardcoded +/− on the card values themselves
  const homestaExpensesSigned = -homestaExpenses;
  const treasuryTotal = homestaCommission + homestaExpensesSigned;

  const expenseTotal = expenses;
  const other = Math.max(0, expenses - (fuel + oil + wash + maint));

  const expenseItems = [
    { label: 'Fuel',             value: fuel,        color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
    { label: 'Oil',              value: oil,         color: '#eab308', bg: 'rgba(234,179,8,0.1)'   },
    { label: 'Washing',          value: wash,        color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
    { label: 'Maintenance',      value: maint,       color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
    { label: 'Other',            value: other,       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  ].filter(e => e.value > 0).sort((a, b) => {
    if (a.label === 'Other') return 1;
    if (b.label === 'Other') return -1;
    return b.value - a.value;
  });

  const carNetMap = new Map<number, number>();
  txs
    .filter(t => t.car_id != null)
    .forEach(t => {
      const delta = t.direction?.toUpperCase() === 'IN' ? (t.amount ?? 0) : -(t.amount ?? 0);
      carNetMap.set(t.car_id!, (carNetMap.get(t.car_id!) ?? 0) + delta);
    });
  const topCars = Array.from(carNetMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([carId, net]) => ({
      carId, amount: net,
      plate: carsMap.get(carId)?.plate ?? `#${carId}`,
      model: carsMap.get(carId)?.model ?? '—',
    }));
  const maxCarAmount = Math.max(...topCars.map(c => Math.abs(c.amount)), 1);

  const metrics = [
    {
      label: 'Homesta Commission Total',
      value: homestaCommission,
      color: '#22c55e', iconBg: 'rgba(34,197,94,0.08)',
      badge: 'Commission', badgeColor: '#16a34a', badgeBg: 'rgba(34,197,94,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="2" stroke="#22c55e" strokeWidth="1.8"/>
          <path d="M2 10h20" stroke="#22c55e" strokeWidth="1.8"/>
          <circle cx="12" cy="15" r="2" stroke="#22c55e" strokeWidth="1.6"/>
        </svg>
      ),
    },
    {
      label: 'Homesta Expenses Total',
      value: homestaExpenses,
      color: '#ef4444', iconBg: 'rgba(239,68,68,0.08)',
      badge: 'Expenses', badgeColor: '#dc2626', badgeBg: 'rgba(239,68,68,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Net Profit', value: net,
      color: net >= 0 ? '#22c55e' : '#ef4444',
      iconBg: net >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      badge: net >= 0 ? 'Profit' : 'Loss',
      badgeColor: net >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: net >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke={net >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 7 22 7 22 13" stroke={net >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Commission', value: commission,
      color: '#3A74C2', iconBg: 'rgba(75,166,234,0.08)',
      badge: 'Revenue', badgeColor: '#0369a1', badgeBg: 'rgba(75,166,234,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="2" stroke="#4ba6ea" strokeWidth="1.8"/>
          <path d="M2 10h20" stroke="#4ba6ea" strokeWidth="1.8"/>
          <path d="M6 15h4M14 15h4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Hero commission card (unchanged) ── */}
      {loading ? (
        <div style={{ height: 140, borderRadius: 16, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{ background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)', borderRadius: 16, padding: '28px 32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Treasury Total - {monthLabel(monthKey)}</div>
            <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-2px', lineHeight: 1 }}>{fmt(treasuryTotal)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Total Income</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(income)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Total Expenses</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(expenses)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Cars Rent Income</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(rentIncome)}</div>
            </div>
          </div>
        </div>
      )}

      {belowHero}

      {/* ── Key Metrics Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map(m => (
          <div key={m.label} style={{
            background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)',
            padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${m.color} 0%, ${m.color}00 100%)`,
              borderRadius: '14px 14px 0 0',
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', lineHeight: 1.35, paddingRight: 8 }}>{m.label}</div>
              <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: m.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.icon}
              </div>
            </div>
            {loading ? (
              <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
            ) : (
              <div style={{ fontSize: 24, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>{fmt(m.value)}</div>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: m.badgeColor, background: m.badgeBg, borderRadius: 20, padding: '2px 9px' }}>{m.badge}</span>
          </div>
        ))}
      </div>

      {/* ── Expenses Breakdown + Top Earning Cars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Expenses Breakdown */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f8f9fa' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117' }}>Expenses Breakdown</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 32, borderRadius: 8, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : expenseItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 13 }}>No expense data this month.</div>
            ) : expenseItems.map(item => {
              const pct = expenseTotal > 0 ? (item.value / expenseTotal) * 100 : 0;
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{item.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>{fmt(item.value)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: item.color, background: item.bg, borderRadius: 20, padding: '1px 7px', minWidth: 42, textAlign: 'center' }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}bb 100%)`,
                      width: `${pct}%`,
                      transition: 'width 500ms ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Earning Cars */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f8f9fa' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117' }}>Top Earning Cars</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: 72, height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              ))
            ) : topCars.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px', color: '#9ca3af', fontSize: 13 }}>No car transactions this month.</div>
            ) : topCars.map((car, idx) => (
              <div key={car.carId} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '13px 24px',
                borderBottom: idx < topCars.length - 1 ? '1px solid #f8f9fa' : 'none',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: idx === 0 ? 'rgba(234,179,8,0.12)' : idx === 1 ? 'rgba(148,163,184,0.12)' : idx === 2 ? 'rgba(180,120,80,0.1)' : '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600,
                  color: idx === 0 ? '#ca8a04' : idx === 1 ? '#64748b' : idx === 2 ? '#92400e' : '#9ca3af',
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-mono tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', letterSpacing: '0.2px' }}>{car.plate}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{car.model}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, minWidth: 100 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.3px', color: car.amount >= 0 ? '#0f1117' : '#dc2626' }}>
                    {car.amount < 0 ? '-' : ''}{fmt(Math.abs(car.amount))}
                  </div>
                  <div style={{ width: 80, height: 4, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: car.amount >= 0
                        ? 'linear-gradient(90deg, #4ba6ea 0%, #2e8fd4 100%)'
                        : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                      width: `${(Math.abs(car.amount) / maxCarAmount) * 100}%`,
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Select Investor Modal ────────────────────────────────────────────────────

const SelectInvestorModal: React.FC<{
  investors: InvestorOption[];
  onSelect: (inv: InvestorOption) => void;
  onClose: () => void;
}> = ({ investors, onSelect, onClose }) => {
  const [selectedId, setSelectedId] = useState('');

  const handleConfirm = () => {
    const inv = investors.find(i => i.id === selectedId);
    if (inv) onSelect(inv);
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117' }}>Select Investor</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', color: '#0f1117', background: '#fff', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }}
          >
            <option value="">Select investor…</option>
            {investors.map(inv => <option key={inv.id} value={String(inv.id)}>{inv.display_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 14, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedId} style={{ padding: '9px 20px', fontSize: 14, fontFamily: 'inherit' }}
            >
              View Report
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Transaction Panel Modal ──────────────────────────────────────────────────

const TransactionPanelModal: React.FC<{
  title: string;
  transactions: FinancialTransaction[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ title, transactions, loading, onClose, onRefresh }) => {
  const { fmt, symbol } = useCurrency();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; direction: string; category: string; amount: string; note: string }>({ date: '', direction: 'out', category: '', amount: '', note: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (t: FinancialTransaction) => {
    setEditingId(t.id);
    setEditForm({ date: t.date ?? '', direction: t.direction ?? 'out', category: t.category ?? '', amount: String(t.amount ?? ''), note: t.note ?? '' });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await supabase.from('financial_transactions').update({
      date:      editForm.date      || null,
      direction: editForm.direction,
      category:  editForm.category  || null,
      amount:    parseFloat(editForm.amount) || 0,
      note:      editForm.note      || null,
    }).eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    await supabase.from('financial_transactions').delete().eq('id', id);
    setConfirmDeleteId(null);
    onRefresh();
  };

  const cancelBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
  const editInput: React.CSSProperties = { padding: '4px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117' }}>{title}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    {['Date', 'Direction', 'Category', `Amount (${symbol})`, 'Description', 'Receipt', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => editingId === t.id ? (
                    <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: 'rgba(75,166,234,0.03)' }}>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={{ ...editInput, width: 120 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <select value={editForm.direction} onChange={e => setEditForm(f => ({ ...f, direction: e.target.value }))} style={{ ...editInput }}>
                          <option value="in">IN</option>
                          <option value="out">OUT</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="text" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ ...editInput, width: 120 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} style={{ ...editInput, width: 90 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="text" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} style={{ ...editInput, width: '100%', boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <ReceiptCell url={t.receipt_url} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            style={{ padding: '4px 10px', fontSize: 12 }}>{saving ? '…' : 'Save'}</Button>
                          <button onClick={() => setEditingId(null)} style={cancelBtn}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{t.date ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {t.direction?.toLowerCase() === 'in'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{t.category ?? t.sheet_type ?? '—'}</td>
                      <td className="font-mono tabular-nums" style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0f1117', whiteSpace: 'nowrap' }}>{fmt(t.amount)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{t.note ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}><ReceiptCell url={t.receipt_url} /></td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => startEdit(t)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${confirmDeleteId === t.id ? '#ef4444' : '#e5e7eb'}`, background: confirmDeleteId === t.id ? '#ef4444' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmDeleteId === t.id ? '#fff' : '#9ca3af', transition: 'all 140ms ease' }}
                            onMouseEnter={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; } }}
                            onMouseLeave={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; } }}
                          >
                            {confirmDeleteId === t.id
                              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Investor Sheet View (transactions list for one sheet_type) ──────────────

const InvestorSheetView: React.FC<{
  investorId: string;
  sheetType: string;
  sheetLabel: string;
  monthKey: string;
  onBack: () => void;
}> = ({ investorId, sheetType, sheetLabel, monthKey, onBack }) => {
  const { fmt, symbol } = useCurrency();
  const [txs,             setTxs]             = useState<FinancialTransaction[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [editingId,       setEditingId]       = useState<number | null>(null);
  const [editForm,        setEditForm]        = useState({ date: '', direction: 'out', amount: '', note: '' });
  const [editReceipt,     setEditReceipt]     = useState<ReceiptValue>(EMPTY_RECEIPT);
  const [receiptError,    setReceiptError]    = useState<string | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAdd,         setShowAdd]         = useState(false);
  const [addForm,         setAddForm]         = useState({ date: new Date().toISOString().slice(0, 10), direction: 'out', amount: '', note: '' });
  const [addSaving,       setAddSaving]       = useState(false);

  const fetchTxs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('investor_id', investorId)
      .eq('sheet_type', sheetType)
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    setTxs((data ?? []) as FinancialTransaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchTxs(); }, [investorId, sheetType, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (t: FinancialTransaction) => {
    setEditingId(t.id);
    setEditForm({ date: t.date ?? '', direction: t.direction ?? 'out', amount: String(t.amount ?? ''), note: t.note ?? '' });
    setEditReceipt(receiptValueFrom(t.receipt_url));
    setReceiptError(null);
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setReceiptError(null);

    // Receipt is optional — an upload failure must never block the update.
    const current = txs.find(t => t.id === editingId)?.receipt_url ?? null;
    let receipt_url = current;
    let uploadError: string | null = null;
    try {
      receipt_url = await resolveReceiptUrl(editReceipt, sheetType);
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Unknown error';
      receipt_url = current;
    }

    await supabase.from('financial_transactions').update({
      date:      editForm.date || null,
      direction: editForm.direction,
      amount:    parseFloat(editForm.amount) || 0,
      note:      editForm.note || null,
      receipt_url,
    }).eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    if (uploadError) setReceiptError(`Changes saved, but the receipt upload failed: ${uploadError}`);
    fetchTxs();
  };

  const handleDelete = async (id: number) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    await supabase.from('financial_transactions').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchTxs();
  };

  const handleAdd = async () => {
    if (!addForm.amount) return;
    setAddSaving(true);
    await supabase.from('financial_transactions').insert({
      investor_id: investorId,
      sheet_type:  sheetType,
      month_key:   monthKey,
      date:        addForm.date || null,
      direction:   addForm.direction,
      amount:      parseFloat(addForm.amount) || 0,
      note:        addForm.note || null,
    });
    setAddSaving(false);
    setShowAdd(false);
    setAddForm({ date: new Date().toISOString().slice(0, 10), direction: 'out', amount: '', note: '' });
    fetchTxs();
  };

  const backBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb',
    background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151',
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const inp: React.CSSProperties = { padding: '5px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };
  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={backBtnStyle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0f1117' }}>{sheetLabel}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
        </div>
      </div>

      {receiptError && (
        <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '9px 14px' }}>{receiptError}</div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
            </svg>
          </div>
        ) : txs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  {['Date', 'Direction', `Amount (${symbol})`, 'Note', 'Receipt', 'Actions'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((t, i) => editingId === t.id ? (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: 'rgba(75,166,234,0.03)' }}>
                    <td style={td}><input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, width: 130 }} /></td>
                    <td style={td}>
                      <select value={editForm.direction} onChange={e => setEditForm(f => ({ ...f, direction: e.target.value }))} style={inp}>
                        <option value="in">IN</option>
                        <option value="out">OUT</option>
                      </select>
                    </td>
                    <td style={td}><input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, width: 90 }} /></td>
                    <td style={td}><input type="text" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ ...td, minWidth: 220 }}>
                      <ReceiptField value={editReceipt} onChange={setEditReceipt} disabled={saving} compact />
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          style={{ padding: '4px 12px', fontSize: 12, fontFamily: 'inherit' }}>{saving ? '…' : 'Save'}</Button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #EBEBEB', background: '#fff', color: 'var(--foreground)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td style={td}>
                      {t.direction?.toLowerCase() === 'in'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>
                      }
                    </td>
                    <td className="font-mono tabular-nums" style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(Number(t.amount))}</td>
                    <td style={{ ...td, color: '#6b7280', maxWidth: 220 }}>{t.note ?? '—'}</td>
                    <td style={td}><ReceiptCell url={t.receipt_url} /></td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => startEdit(t)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${confirmDeleteId === t.id ? '#ef4444' : '#e5e7eb'}`, background: confirmDeleteId === t.id ? '#ef4444' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmDeleteId === t.id ? '#fff' : '#9ca3af', transition: 'all 140ms ease' }}
                          onMouseEnter={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; } }}
                          onMouseLeave={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; } }}
                        >
                          {confirmDeleteId === t.id
                            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Edit Financial Transaction Modal ────────────────────────────────────────

const CAR_TX_CATEGORIES: Record<'IN' | 'OUT', string[]> = {
  IN:  ['Rent Collection', 'Commission', 'Other'],
  OUT: ['Petrol', 'Oil', 'Wash', 'Maintenance', 'Commission', 'Other'],
};

interface EditFinTxForm {
  date:      string;
  direction: 'IN' | 'OUT';
  category:  string;
  amount:    string;
  note:      string;
}

const EditFinancialTxModal: React.FC<{
  entry:      FinancialTransaction;
  /** Storage folder for a newly attached receipt — plate number when available. */
  receiptKey?: string | number | null;
  onClose:    () => void;
  onSaved:    () => void;
}> = ({ entry, receiptKey, onClose, onSaved }) => {
  const { symbol } = useCurrency();
  const [form,   setForm]   = useState<EditFinTxForm>({
    date:      entry.date ?? '',
    direction: (entry.direction?.toUpperCase() === 'IN' ? 'IN' : 'OUT') as 'IN' | 'OUT',
    category:  entry.category ?? '',
    amount:    String(entry.amount ?? ''),
    note:      entry.note ?? '',
  });
  const [receipt, setReceipt] = useState<ReceiptValue>(() => receiptValueFrom(entry.receipt_url));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const set = <K extends keyof EditFinTxForm>(k: K, v: EditFinTxForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const categories = CAR_TX_CATEGORIES[form.direction];

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setWarning(null);

    // Receipt is optional — an upload failure must never block the update.
    let receipt_url: string | null = entry.receipt_url ?? null;
    let uploadError: string | null = null;
    try {
      receipt_url = await resolveReceiptUrl(receipt, receiptKey ?? entry.car_id ?? entry.sheet_type);
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Unknown error';
      receipt_url = entry.receipt_url ?? null;
    }

    const { error: err } = await supabase
      .from('financial_transactions')
      .update({
        date:      form.date,
        direction: form.direction,
        category:  form.category || null,
        amount,
        note:      form.note || null,
        receipt_url,
      })
      .eq('id', entry.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (uploadError) {
      setWarning(`Changes saved, but the receipt upload failed: ${uploadError}`);
      return;
    }
    onSaved();
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117' }}>Edit Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>ID #{entry.id}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date + Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <label style={lbl}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button key={d} onClick={() => { set('direction', d); set('category', ''); }}
                    style={{ flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`, background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff', color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}>
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={lbl}>Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}>
              <option value="">— Select —</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              {form.category && !categories.includes(form.category) && (
                <option value={form.category}>{form.category}</option>
              )}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label style={lbl}>Amount ({symbol})</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {/* Note */}
          <div>
            <label style={lbl}>Note</label>
            <input type="text" placeholder="Optional note…" value={form.note} onChange={e => set('note', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {/* Receipt */}
          <div>
            <label style={lbl}>Receipt (optional)</label>
            <ReceiptField value={receipt} onChange={setReceipt} disabled={saving || !!warning} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          {warning && (
            <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px' }}>{warning}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            {warning ? (
              <Button
                onClick={() => { onSaved(); onClose(); }}
                style={{ padding: '9px 20px', fontSize: 13, fontFamily: 'inherit' }}>Close</Button>
            ) : (
              <>
                <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: '9px 20px', fontSize: 13, fontFamily: 'inherit' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Investor Car Sheet View (transactions for one car) ──────────────────────

interface CarOption { id: number; plate_number: string; model_name: string; }

const InvestorCarSheetView: React.FC<{
  investorId: string;
  car: CarOption;
  monthKey: string;
  onBack: () => void;
}> = ({ investorId, car, monthKey, onBack }) => {
  const { fmt, symbol } = useCurrency();
  const [txs,       setTxs]       = useState<FinancialTransaction[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editModal, setEditModal] = useState<FinancialTransaction | null>(null);

  const fetchTxs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('investor_id', investorId)
      .eq('sheet_type', 'car')
      .eq('car_id', car.id)
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    setTxs((data ?? []) as FinancialTransaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchTxs(); }, [investorId, car.id, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    await supabase.from('financial_transactions').delete().eq('id', id);
    fetchTxs();
  };

  const bBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
  const inp: React.CSSProperties = { padding: '5px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };
  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' };

  const total = txs.reduce((sum, t) => t.direction?.toLowerCase() === 'in' ? sum + Number(t.amount) : sum - Number(t.amount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={bBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div>
            <div className="font-mono tabular-nums" style={{ fontSize: 18, fontWeight: 600, color: '#0f1117' }}>{car.plate_number}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{car.model_name} · {monthLabel(monthKey)}</div>
            {!loading && txs.length > 0 && (
              <div style={{ fontSize: 15, fontWeight: 600, color: total >= 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
                {total >= 0 ? '+' : '-'}{fmt(total)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/></svg>
          </div>
        ) : txs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>{['Date', 'Direction', 'Category', `Amount (${symbol})`, 'Note', 'Receipt', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {txs.map((t, i) => (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td style={td}>{t.direction?.toUpperCase() === 'IN' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{t.category ?? '—'}</td>
                    <td className="font-mono tabular-nums" style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap', color: t.direction?.toUpperCase() === 'IN' ? '#16a34a' : '#dc2626' }}>{fmt(Number(t.amount))}</td>
                    <td style={{ ...td, color: '#6b7280', maxWidth: 180 }}>{t.note ?? '—'}</td>
                    <td style={td}><ReceiptCell url={t.receipt_url} /></td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditModal(t)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', transition: 'all 140ms ease' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && (
        <EditFinancialTxModal
          entry={editModal}
          receiptKey={car.plate_number}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); fetchTxs(); }}
        />
      )}
    </div>
  );
};

// ─── Investor Car List View (grid of cars for this investor) ──────────────────

const InvestorCarListView: React.FC<{
  investorId: string;
  monthKey: string;
  txs: FinancialTransaction[];
  onBack: () => void;
}> = ({ investorId, monthKey, txs, onBack }) => {
  const { fmt } = useCurrency();
  const [cars,        setCars]        = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState<CarOption | null>(null);
  const [search,      setSearch]      = useState('');

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .eq('investor_id', investorId)
      .eq('is_active', true)
      .then(({ data }) => {
        const raw = (data ?? []) as unknown as { id: number; plate_number: string; model_group: { name: string } | null }[];
        setCars(raw
          .map(c => ({ id: c.id, plate_number: c.plate_number, model_name: c.model_group?.name ?? '—' }))
          .sort((a, b) => a.model_name.localeCompare(b.model_name) || a.plate_number.localeCompare(b.plate_number)));
        setCarsLoading(false);
      });
  }, [investorId]);

  if (selectedCar) {
    return <InvestorCarSheetView investorId={investorId} car={selectedCar} monthKey={monthKey} onBack={() => setSelectedCar(null)} />;
  }

  const carTxs = txs.filter(t => t.sheet_type === 'car');

  // Pre-compute per-car stats and sort: active first
  const carsWithStats = cars
    .map(car => ({
      car,
      total: carTxs.filter(t => t.car_id === car.id).reduce((s, t) => t.direction?.toUpperCase() === 'IN' ? s + Number(t.amount) : s - Number(t.amount), 0),
      count: carTxs.filter(t => t.car_id === car.id).length,
    }))
    .sort((a, b) => b.total - a.total);

  // Summary bar totals — always computed from ALL cars, unaffected by the search filter
  const totalIncome   = carsWithStats.reduce((s, c) => s + c.total, 0);
  const activeCars    = carsWithStats.filter(c => c.count > 0).length;
  const totalRecords  = carsWithStats.reduce((s, c) => s + c.count, 0);

  // Client-side filter: plate number or model group name, case-insensitive partial match
  const q = search.trim().toLowerCase();
  const visibleCars = q
    ? carsWithStats.filter(({ car }) =>
        car.plate_number.toLowerCase().includes(q) || car.model_name.toLowerCase().includes(q))
    : carsWithStats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#EBEBEB'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.4px' }}>Cars Rental Income</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>{monthLabel(monthKey)}</div>
        </div>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginLeft: 'auto', width: '100%', maxWidth: 320, flex: '1 1 220px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="2"/>
            <path d="M20 20l-3-3" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by plate or model..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 40, padding: '0 34px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, outline: 'none', fontFamily: 'inherit', background: '#fff', color: '#0f1117', boxSizing: 'border-box', transition: 'border-color 140ms ease' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 5, border: 'none', background: '#e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {!carsLoading && cars.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Income',   value: fmt(totalIncome),      mono: true  },
            { label: 'Active Cars',    value: String(activeCars),    mono: false },
            { label: 'Total Records',  value: String(totalRecords),  mono: false },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#0f1117', letterSpacing: stat.mono ? '-0.5px' : '-0.3px', marginBottom: 6 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cars grid */}
      {carsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '20px', height: 140, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : cars.length === 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No cars found for this investor.
        </div>
      ) : visibleCars.length === 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No cars found
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {visibleCars.map(({ car, total, count }) => {
            const active    = count > 0;
            const negative  = active && total < 0;
            const accentClr = !active ? '#9ca3af' : negative ? '#dc2626' : '#16a34a';
            const accentBg  = !active ? 'rgba(156,163,175,0.1)' : negative ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
            const iconColor = accentClr;
            const iconBg    = accentBg;
            const borderLeft = `4px solid ${!active ? '#e5e7eb' : negative ? '#dc2626' : '#16a34a'}`;
            return (
              <div
                key={car.id}
                onClick={() => setSelectedCar(car)}
                style={{
                  background: 'var(--surface)', borderRadius: 12,
                  border: '1px solid var(--border-subtle)', borderLeft,
                  padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  cursor: 'pointer', opacity: active ? 1 : 0.7,
                  transition: 'transform 160ms ease, box-shadow 160ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
              >
                {/* Icon */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><rect x="9" y="11" width="14" height="10" rx="2" stroke={iconColor} strokeWidth="1.8"/><circle cx="12" cy="16" r="1.2" fill={iconColor}/><circle cx="20" cy="16" r="1.2" fill={iconColor}/></svg>
                </div>
                {/* Plate */}
                <div className="font-mono tabular-nums" style={{ fontSize: 16, fontWeight: 600, color: '#0f1117', marginBottom: 3, letterSpacing: '0.2px' }}>{car.plate_number}</div>
                {/* Model */}
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>{car.model_name}</div>
                {/* Amount */}
                <div style={{ fontSize: 18, fontWeight: 600, color: accentClr, letterSpacing: '-0.3px', marginBottom: 10 }}>{fmt(total)}</div>
                {/* Records badge */}
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 20,
                  color: active ? '#2563eb' : '#9ca3af',
                  background: active ? 'rgba(37,99,235,0.08)' : 'rgba(156,163,175,0.1)',
                }}>
                  {count} record{count !== 1 ? 's' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Investor Summary View (self-contained: fetches, back button, month nav) ──

const InvestorSummaryView: React.FC<{
  investorId: string;
  onBack: () => void;
  hideBackButton?: boolean;
}> = ({ investorId, onBack, hideBackButton = false }) => {
  const { fmt } = useCurrency();
  const [monthKey,        setMonthKey]        = useState(currentMonthKey());
  const [txs,             setTxs]             = useState<FinancialTransaction[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [sheetView,       setSheetView]       = useState<{ type: string; label: string } | null>(null);
  const [showCarsList,    setShowCarsList]    = useState(false);
  const [carCount,        setCarCount]        = useState<number | null>(null);
  const [commissionRate,  setCommissionRate]  = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('financial_transactions').select('*').eq('investor_id', investorId).eq('month_key', monthKey),
      supabase.from('cars').select('id', { count: 'exact', head: true }).eq('investor_id', investorId).eq('is_active', true),
      supabase.from('investors').select('commission_rate').eq('id', investorId).single(),
    ]).then(([txRes, carsRes, invRes]) => {
      if (cancelled) return;
      setTxs((txRes.data ?? []) as FinancialTransaction[]);
      setCarCount(carsRes.count ?? 0);
      setCommissionRate((invRes.data as { commission_rate: number | null } | null)?.commission_rate ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [investorId, monthKey]);

  const sumBy = (type: string) =>
    txs.filter(t => t.sheet_type === type).reduce((sum, t) =>
      t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0);

  const carsRentalIncome = sumBy('car');
  const companyExpenses  = sumBy('company_expenses');
  const personalExpenses = sumBy('personal_expenses');
  const buySell          = sumBy('buy_sell');

  const totalTreasury = carsRentalIncome + companyExpenses + personalExpenses + buySell;

  const fuelTotal = Math.abs(txs
    .filter(t => t.category === 'Petrol')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const oilTotal = Math.abs(txs
    .filter(t => t.category === 'Oil')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const washTotal = Math.abs(txs
    .filter(t => t.category === 'Wash')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const maintenanceTotal = Math.abs(txs
    .filter(t => t.category === 'Maintenance')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  if (showCarsList) {
    return (
      <InvestorCarListView
        investorId={investorId}
        monthKey={monthKey}
        txs={txs}
        onBack={() => setShowCarsList(false)}
      />
    );
  }

  if (sheetView) {
    return (
      <InvestorSheetView
        investorId={investorId}
        sheetType={sheetView.type}
        sheetLabel={sheetView.label}
        monthKey={monthKey}
        onBack={() => setSheetView(null)}
      />
    );
  }

  const backBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb',
    background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151',
    cursor: 'pointer', fontFamily: 'inherit',
  };

  const heroBreakdown = [
    { label: 'Cars Rental Income', value: carsRentalIncome, positive: true },
    { label: 'Company Expenses',   value: companyExpenses,  positive: companyExpenses >= 0 },
    { label: 'Personal Expenses',  value: personalExpenses, positive: personalExpenses >= 0 },
  ];

  const summaryCards: Array<{ title: string; amount: number; customDisplay?: string; badge: string; badgeColor: string; badgeBg: string; accentColor: string; onClick?: () => void; icon: React.ReactNode }> = [
    {
      title: 'Cars Rental Income',
      amount: carsRentalIncome,
      badge: 'Income',
      badgeColor: '#16a34a',
      badgeBg: 'rgba(34,197,94,0.1)',
      accentColor: '#22c55e',
      onClick: () => setShowCarsList(true),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M5 17H3a1 1 0 01-1-1v-5l2.76-5.52A1 1 0 015.65 5h12.7a1 1 0 01.89.55L22 11v5a1 1 0 01-1 1h-2" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="7.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
          <circle cx="16.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
        </svg>
      ),
    },
    {
      title: 'Company Expenses',
      amount: companyExpenses,
      badge: companyExpenses >= 0 ? 'Income' : 'Expense',
      badgeColor: companyExpenses >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: companyExpenses >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: companyExpenses >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'company_expenses', label: 'Company Expenses' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={companyExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12h6v10" stroke={companyExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      title: 'Personal Expenses',
      amount: personalExpenses,
      badge: personalExpenses >= 0 ? 'Income' : 'Expense',
      badgeColor: personalExpenses >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: personalExpenses >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: personalExpenses >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'personal_expenses', label: 'Personal Expenses' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={personalExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="7" r="4" stroke={personalExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      title: 'Buy & Sell',
      amount: buySell,
      badge: buySell >= 0 ? 'Gain' : 'Loss',
      badgeColor: buySell >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: buySell >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: buySell >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'buy_sell', label: 'Buy & Sell' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M7 16V4M7 4L4 7M7 4l3 3M17 8v12M17 20l3-3M17 20l-3-3" stroke={buySell >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  const runningCostCards = [
    {
      title: 'Fuel',
      amount: fuelTotal,
      color: '#22c55e',
      iconBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
      badgeBg: 'rgba(34,197,94,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M3 22V8.5L7.5 4H14L18 8v2" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 13h11M14 22V8" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M18 10h1a2 2 0 012 2v5a1 1 0 01-1 1h-1" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Oil',
      amount: oilTotal,
      color: '#eab308',
      iconBg: 'rgba(234,179,8,0.1)',
      badgeColor: '#ca8a04',
      badgeBg: 'rgba(234,179,8,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C12 2 5 9.5 5 14a7 7 0 0014 0C19 9.5 12 2 12 2z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 15a3 3 0 003 3" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Washing',
      amount: washTotal,
      color: '#3b82f6',
      iconBg: 'rgba(59,130,246,0.1)',
      badgeColor: '#2563eb',
      badgeBg: 'rgba(59,130,246,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14M5 12a7 7 0 0014 0M5 12a7 7 0 0114 0" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M12 5V3M8 6L7 4M16 6l1-4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M5 19h14" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Maintenance',
      amount: maintenanceTotal,
      color: '#64748b',
      iconBg: 'rgba(100,116,139,0.1)',
      badgeColor: '#475569',
      badgeBg: 'rgba(100,116,139,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!hideBackButton && (
            <>
              <button onClick={onBack} style={backBtnStyle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
              <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />
            </>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>
              Investor Report
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.4px', lineHeight: 1.1 }}>
              Financial Overview
            </div>
          </div>
        </div>
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
      </div>

      {/* ── Fleet info chips ── */}
      {!loading && (carCount !== null || commissionRate !== null) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: -16 }}>
          {carCount !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a1 1 0 01-1-1v-5l2.76-5.52A1 1 0 015.65 5h12.7a1 1 0 01.89.55L22 11v5a1 1 0 01-1 1h-2" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="#7c3aed" strokeWidth="2"/><circle cx="16.5" cy="17.5" r="2.5" stroke="#7c3aed" strokeWidth="2"/></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{carCount} {carCount === 1 ? 'car' : 'cars'}</span>
            </div>
          )}
          {commissionRate !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, background: 'rgba(8,145,178,0.07)', border: '1px solid rgba(8,145,178,0.18)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0891b2' }}>{commissionRate}% commission</span>
            </div>
          )}
        </div>
      )}

      {/* ── Hero card ── */}
      {loading ? (
        <div style={{ height: 184, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1a2744 55%, #0f1f30 100%)',
          borderRadius: 20,
          padding: '36px 40px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: totalTreasury >= 0
            ? '0 20px 60px rgba(22,163,74,0.18), 0 4px 20px rgba(0,0,0,0.28)'
            : '0 20px 60px rgba(220,38,38,0.18), 0 4px 20px rgba(0,0,0,0.28)',
          border: `1px solid ${totalTreasury >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}`,
        }}>
          {/* Radial glow — top right */}
          <div style={{
            position: 'absolute', top: -100, right: -80, width: 380, height: 380,
            borderRadius: '50%',
            background: totalTreasury >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            filter: 'blur(80px)', pointerEvents: 'none',
          }} />
          {/* Radial glow — bottom left */}
          <div style={{
            position: 'absolute', bottom: -80, left: 60, width: 240, height: 240,
            borderRadius: '50%',
            background: 'rgba(75,166,234,0.06)',
            filter: 'blur(60px)', pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40 }}>

            {/* Left: net profit */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: totalTreasury >= 0 ? '#22c55e' : '#ef4444',
                  boxShadow: `0 0 10px ${totalTreasury >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)'}`,
                }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>
                    Total Treasury
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 500, color: 'rgba(255,255,255,0.26)', letterSpacing: '0.3px', marginTop: 3 }}>
                    All sheets combined
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-2.5px', lineHeight: 1, color: '#fff' }}>
                {totalTreasury < 0 ? '-' : ''}{fmt(totalTreasury)}
              </div>
              <div style={{ marginTop: 18 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 20,
                  background: totalTreasury >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: totalTreasury >= 0 ? '#4ade80' : '#f87171',
                  border: `1px solid ${totalTreasury >= 0 ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {monthLabel(monthKey)}
                </span>
              </div>
            </div>

            {/* Right: breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 250, alignSelf: 'center' }}>
              {heroBreakdown.map((item, i) => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
                  padding: '13px 0',
                  borderBottom: i < heroBreakdown.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', color: item.positive ? '#4ade80' : '#f87171' }}>
                    {'display' in item ? (item as { display: string }).display : fmt(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Summary
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {summaryCards.map(card => (
            <div
              key={card.title}
              onClick={card.onClick}
              style={{
                background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)',
                padding: '20px 22px', cursor: card.onClick ? 'pointer' : 'default',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={card.onClick ? e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(-3px)';
                el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.09)';
                el.style.borderColor = card.accentColor + '35';
              } : undefined}
              onMouseLeave={card.onClick ? e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.04)';
                el.style.borderColor = 'var(--border-subtle)';
              } : undefined}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${card.accentColor} 0%, ${card.accentColor}00 100%)`,
                borderRadius: '14px 14px 0 0',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', lineHeight: 1.35, paddingRight: 8 }}>{card.title}</div>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: card.badgeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon}
                </div>
              </div>
              {loading ? (
                <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>
                  {'customDisplay' in card ? (card as { customDisplay: string }).customDisplay : fmt(card.amount)}
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: card.badgeColor, background: card.badgeBg, borderRadius: 20, padding: '2px 9px' }}>
                {card.badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Vehicle Running Costs ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Vehicle Running Costs
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {runningCostCards.map(card => (
            <div
              key={card.title}
              style={{
                background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)',
                padding: '20px 22px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${card.color} 0%, ${card.color}00 100%)`,
                borderRadius: '14px 14px 0 0',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', paddingRight: 8 }}>{card.title}</div>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: card.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon(card.color)}
                </div>
              </div>
              {loading ? (
                <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>
                  {fmt(card.amount)}
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: card.badgeColor, background: card.badgeBg, borderRadius: 20, padding: '2px 9px' }}>
                Expense
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

// ─── Overview ─────────────────────────────────────────────────────────────────

function monthDateRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const endDate = new Date(y, m, 1);
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`,
  };
}

const OverviewTab: React.FC = () => {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [txs, setTxs]           = useState<FinancialTransaction[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('financial_transactions').select('*').eq('month_key', monthKey).then(({ data }) => {
      if (cancelled) return;
      setTxs((data ?? []) as FinancialTransaction[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [monthKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
      </div>
      <SummaryView txs={txs} loading={loading} monthKey={monthKey} belowHero={<OverviewTiles />} />
    </div>
  );
};

// ─── Investors: one row per car ───────────────────────────────────────────────

interface SheetCar {
  id: number;
  plate_number: string;
  investor_id: string | null;
  model_group: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
}

const validMonth = (value: string | null) => (value && /^\d{4}-\d{2}$/.test(value) ? value : null);

const CarSheetsList: React.FC<{ onExpensesChanged: () => void }> = ({ onExpensesChanged }) => {
  const { fmt } = useCurrency();
  const [params] = useSearchParams();
  const linkedCar = Number(params.get('car')) || null;
  const linkedEntry = Number(params.get('entry')) || null;
  const [monthKey,  setMonthKey]  = useState(validMonth(params.get('month')) ?? currentMonthKey());
  const [txs,       setTxs]       = useState<FinancialTransaction[]>([]);
  const [cars,      setCars]      = useState<SheetCar[]>([]);
  const [investors, setInvestors] = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [reload,    setReload]    = useState(0);
  const [search,    setSearch]    = useState('');
  const [open,      setOpen]      = useState<Set<number>>(() => new Set(linkedCar ? [linkedCar] : []));
  const [editing,   setEditing]   = useState<FinancialTransaction | null>(null);
  const [fresh,     setFresh]     = useState<Set<number>>(new Set());
  const shownMonth = useRef<string | null>(null);

  const suggestions = useSuggestions('car', monthKey, useCallback((posting) => {
    if (posting?.car_tx_id) setFresh(current => new Set(current).add(posting.car_tx_id as number));
    setReload(value => value + 1);
    onExpensesChanged();
  }, [onExpensesChanged]));

  // Every car with something waiting opens the first time it's seen.
  const seenSuggestions = useRef(new Set<number>());
  useEffect(() => {
    const ids = suggestions.rows.flatMap(row => (row.car_id !== null && !seenSuggestions.current.has(row.car_id) ? [row.car_id] : []));
    if (ids.length === 0) return;
    ids.forEach(id => seenSuggestions.current.add(id));
    setOpen(current => new Set([...Array.from(current), ...ids]));
  }, [suggestions.rows]);

  useEffect(() => {
    let cancelled = false;
    // A skeleton on a refresh would wipe the list while a posted row is arriving.
    if (shownMonth.current !== monthKey) setLoading(true);
    setError(null);
    Promise.all([
      supabase.from('financial_transactions').select('*').eq('month_key', monthKey).eq('sheet_type', 'car').order('date', { ascending: false }),
      supabase.from('cars').select('id, plate_number, investor_id, model_group:model_group_id(name, image_url)'),
      supabase.from('investors').select('id, company_name, profiles!fk_investor_profile(full_name)'),
    ]).then(([txRes, carRes, investorRes]) => {
      if (cancelled) return;
      const failed = txRes.error ?? carRes.error ?? investorRes.error;
      if (failed) { setError(failed.message); setLoading(false); return; }
      setTxs((txRes.data ?? []) as FinancialTransaction[]);
      setCars((carRes.data ?? []) as unknown as SheetCar[]);
      const rows = (investorRes.data ?? []) as unknown as { id: string; company_name: string | null; profiles: { full_name: string | null } | null }[];
      setInvestors(Object.fromEntries(rows.map(r => [String(r.id), r.company_name || r.profiles?.full_name || '—'])));
      shownMonth.current = monthKey;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [monthKey, reload]);

  useScrollToRow(linkedEntry, !loading);

  const rows = useMemo(() => {
    const byCar = new Map(cars.map(car => [car.id, car]));
    const groups = new Map<number, FinancialTransaction[]>();
    txs.forEach(t => {
      if (t.car_id !== null) groups.set(t.car_id, [...(groups.get(t.car_id) ?? []), t]);
    });
    // A car with only a suggestion this month still needs its row.
    suggestions.rows.forEach(row => {
      if (row.car_id !== null && !groups.has(row.car_id)) groups.set(row.car_id, []);
    });
    const q = search.trim().toLowerCase();
    return Array.from(groups, ([id, own]) => {
      const car = byCar.get(id);
      const group = Array.isArray(car?.model_group) ? car?.model_group[0] : car?.model_group;
      const income = sumTx(own, t => t.direction?.toLowerCase() === 'in');
      const spent = sumTx(own, t => t.direction?.toLowerCase() === 'out');
      return {
        id,
        plate: car?.plate_number ?? '—',
        model: group?.name ?? null,
        image: group?.image_url ?? null,
        investor: car?.investor_id ? investors[String(car.investor_id)] ?? null : null,
        income,
        spent,
        own,
      };
    })
      .filter(row => !q || [row.plate, row.model, row.investor].some(text => text?.toLowerCase().includes(q)))
      .sort((a, b) => (a.model ?? '').localeCompare(b.model ?? '') || a.plate.localeCompare(b.plate));
  }, [txs, cars, investors, search, suggestions.rows]);

  const totalIn = rows.reduce((sum, row) => sum + row.income, 0);
  const totalOut = rows.reduce((sum, row) => sum + row.spent, 0);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    const { error: failure } = await supabase.from('financial_transactions').delete().eq('id', id);
    if (failure) { setError(failure.message); return; }
    setReload(value => value + 1);
  };

  const toggle = (id: number) => setOpen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="media-scope flex max-w-[1100px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
        <p className="text-[13.5px] tabular-nums text-black/55">
          In <span className="font-semibold text-[#15803D]">{fmt(totalIn)}</span> · Out <span className="font-semibold text-[#B91C1C]">{fmt(totalOut)}</span> · Net <span className="font-semibold text-foreground">{fmt(totalIn - totalOut)}</span>
        </p>
      </div>

      <SuggestionBanner suggestions={suggestions} />

      <input
        type="search"
        aria-label="Search plate, model or investor"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search plate, model or investor…"
        className="h-11 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[14px] outline-none focus:border-[#6EA4E7] md:h-10"
      />

      {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-700">Couldn't load the car sheets: {error}</p>}

      {loading ? (
        <div style={{ height: 160, borderRadius: 12, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-subtle bg-surface px-4 py-10 text-center text-[13.5px] text-black/45">
          {search ? 'No cars match your search.' : `Nothing on the car sheets in ${monthLabel(monthKey)}.`}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-subtle bg-surface">
          {rows.map(row => {
            const expanded = open.has(row.id);
            const waiting = suggestions.rows.filter(suggestion => suggestion.car_id === row.id);
            return (
              <li key={row.id} className="border-b border-subtle last:border-b-0">
                <button type="button" aria-expanded={expanded} onClick={() => toggle(row.id)} className="flex min-h-[44px] w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-start transition-colors hover:bg-black/[0.02] sm:px-4">
                  <span className="flex min-w-[190px] flex-1 items-center gap-2.5">
                    <CarThumb src={row.image} />
                    <span className="min-w-0">
                      <LicensePlate plate={row.plate} />
                      <span className="mt-1 block truncate text-[12.5px] text-black/55">{[row.model, row.investor].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-4 text-[13px] tabular-nums sm:gap-6">
                    {waiting.length > 0 && <span className="rounded-full bg-[#F59E0B]/[0.16] px-2 py-0.5 text-[12px] font-medium text-[#92400E]">{waiting.length} suggested</span>}
                    <span className="text-[#15803D]">{fmt(row.income)}</span>
                    <span className="text-[#B91C1C]">{fmt(row.spent)}</span>
                    <span className="min-w-[84px] text-end font-semibold text-foreground">{fmt(row.income - row.spent)}</span>
                  </span>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : undefined, color: '#9ca3af' }}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {expanded && (
                  <div className="flex justify-end border-t border-subtle px-3 sm:px-4">
                    <Link to={`/dashboard/accounting/customer-sheet/${row.id}`} className="inline-flex min-h-[44px] items-center text-[12.5px] font-medium text-brand-strong hover:underline md:min-h-[36px]">
                      Customer sheet for this car →
                    </Link>
                  </div>
                )}
                {expanded && waiting.length > 0 && (
                  <ul className="flex flex-col gap-2 border-t border-subtle p-2 sm:p-3">
                    {waiting.map(suggestion => <SuggestedExpense key={suggestion.id} row={suggestion} suggestions={suggestions} />)}
                  </ul>
                )}
                {expanded && row.own.length > 0 && (
                  <div className="overflow-x-auto border-t border-subtle">
                    <table className="w-full min-w-[620px] text-[13px]">
                      <thead>
                        <tr className="text-[11.5px] text-black/45">
                          {['Date', 'Category', 'Note', 'Receipt'].map(label => <th key={label} scope="col" className="px-3 py-1.5 text-start font-medium">{label}</th>)}
                          <th scope="col" className="px-3 py-1.5 text-end font-medium">Amount</th>
                          <th scope="col"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.own.map(t => (
                          <tr key={t.id} id={`entry-${t.id}`} className={fresh.has(t.id) ? 'sheet-row-new border-t border-subtle' : 'border-t border-subtle'} style={{ background: t.id === linkedEntry ? HIGHLIGHT_ROW : undefined }}>
                            <td className="whitespace-nowrap px-3 py-1.5 text-black/60">{fmtDate(t.date)}</td>
                            <td className="px-3 py-1.5 text-black/60">{t.category ?? '—'}</td>
                            <td className="max-w-[260px] px-3 py-1.5 text-black/60"><span className="block truncate" title={t.note ?? undefined}>{t.note ?? '—'}</span></td>
                            <td className="px-3 py-1.5"><ReceiptCell url={t.receipt_url} /></td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-end font-semibold tabular-nums" style={{ color: t.direction?.toLowerCase() === 'in' ? '#15803D' : '#B91C1C' }}>
                              {t.direction?.toLowerCase() === 'in' ? '+' : '-'}{fmt(Number(t.amount))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-end">
                              <button type="button" onClick={() => setEditing(t)} className="min-h-[32px] px-1.5 text-[12.5px] font-medium text-primary hover:underline">Edit</button>
                              <button type="button" onClick={() => handleDelete(t.id)} className="min-h-[32px] px-1.5 text-[12.5px] font-medium text-[#B91C1C] hover:underline">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditFinancialTxModal
          entry={editing}
          receiptKey={rows.find(row => row.id === editing.car_id)?.plate}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setReload(value => value + 1); }}
        />
      )}
      <SuggestionDialogs suggestions={suggestions} />
    </div>
  );
};

// ─── Tab 2: Investor Sheets ───────────────────────────────────────────────────

const InvestorSheetsTab: React.FC = () => {
  const [investors,        setInvestors]        = useState<InvestorOption[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorOption | null>(null);
  const [autoSelectDone,   setAutoSelectDone]   = useState(false);

  // Load investors + current-month txs in parallel, auto-select top earner
  useEffect(() => {
    let cancelled = false;
    const mk = currentMonthKey();
    Promise.all([
      supabase.from('investors').select('id, company_name, profiles!fk_investor_profile(full_name)'),
      supabase.from('financial_transactions').select('investor_id, amount, direction').eq('month_key', mk),
    ]).then(([invRes, txRes]) => {
      if (cancelled) return;
      const raw = (invRes.data ?? []) as unknown as { id: string; company_name: string | null; profiles: { full_name: string } | null }[];
      const invList: InvestorOption[] = raw.map(r => ({
        id:           String(r.id),
        display_name: r.company_name || r.profiles?.full_name || `Investor #${r.id}`,
      }));
      setInvestors(invList);

      const incomeMap = new Map<string, number>();
      (txRes.data ?? []).forEach((t: { investor_id: string | null; amount: number; direction: string | null }) => {
        if (!t.investor_id || t.direction?.toLowerCase() !== 'in') return;
        const id = String(t.investor_id);
        incomeMap.set(id, (incomeMap.get(id) ?? 0) + (t.amount ?? 0));
      });

      let topId: string | null = null;
      let topAmt = -1;
      incomeMap.forEach((amt, id) => { if (amt > topAmt) { topAmt = amt; topId = id; } });
      const autoSelect = invList.find(i => i.id === topId) ?? invList[0] ?? null;
      if (autoSelect) setSelectedInvestor(autoSelect);
      setAutoSelectDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!autoSelectDone) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Investor dropdown ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
          Investor
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={selectedInvestor?.id ?? ''}
            onChange={e => {
              const inv = investors.find(i => i.id === e.target.value);
              if (inv) setSelectedInvestor(inv);
            }}
            style={{
              appearance: 'none', WebkitAppearance: 'none',
              padding: '10px 38px 10px 14px',
              fontSize: 15, fontWeight: 600, color: '#0f1117',
              background: '#fff', border: '1.5px solid #e5e7eb',
              borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              outline: 'none', minWidth: 240,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'border-color 140ms ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#4ba6ea'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
          >
            {investors.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.display_name}</option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Full investor report rendered inline ── */}
      {selectedInvestor && (
        <InvestorSummaryView
          key={selectedInvestor.id}
          investorId={selectedInvestor.id}
          onBack={() => {}}
          hideBackButton
        />
      )}

    </div>
  );
};

// ─── Add Customer Transaction Modal ──────────────────────────────────────────

// ─── Investor Report Page (routed: /dashboard/accounting/report?investor_id=X) ─

export const InvestorReportPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const investorId     = String(searchParams.get('investor_id') ?? '');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '44px 40px' }}>
      <InvestorSummaryView
        investorId={investorId}
        onBack={() => navigate('/dashboard/accounting')}
      />
      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ─── Car Customer Sheet Detail Page ──────────────────────────────────────────

// One sheet per booking: the same customer can rent the same car more than once,
// and each rental is a separate sheet keyed by booking_id.
interface BookingGroup {
  bookingId:     number;
  bookingNumber: string;
  startDate:     string | null;
  endDate:       string | null;
  status:        string | null;
  customerId:    string;
  first_name:    string;
  last_name:     string;
  phone:         string | null;
  nationality:   string | null;
  id_number:     string | null;
  entries:       CustomerLedgerEntry[];
  totalIn:       number;
  totalOut:      number;
  balance:       number;
}

// A booking joined with its customer, as fetched from the bookings table.
interface CarBookingRow {
  id:             number;
  booking_number: string;
  customer_id:    string | null;
  car_id:         number | null;
  start_date:     string | null;
  end_date:       string | null;
  status:         string | null;
  customers: {
    id:          string;
    first_name:  string;
    last_name:   string;
    phone:       string | null;
    nationality: string | null;
    id_number:   string | null;
  } | null;
}

export const CarCustomerSheetPage: React.FC = () => {
  const { carId: carIdParam } = useParams<{ carId: string }>();
  const carId    = Number(carIdParam);
  const navigate = useNavigate();
  const { fmt }  = useCurrency();

  const [car,           setCar]           = useState<CarInfo | null>(null);
  const [ledger,        setLedger]        = useState<CustomerLedgerEntry[]>([]);
  const [bookings,      setBookings]      = useState<CarBookingRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [openBookings,  setOpenBookings]  = useState<Set<number>>(new Set());
  const [addModal,      setAddModal]      = useState<{ bookingId: number; customerId: string; customerName: string; bookingLabel: string } | null>(null);
  const [editModal,     setEditModal]     = useState<CustomerLedgerEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  const loadData = async () => {
    const [carRes, bookingsRes, ledgerRes] = await Promise.all([
      supabase.from('cars')
        .select('id, plate_number, model_group:model_group_id(name)')
        .eq('id', carId)
        .single(),
      // Customers appear because they BOOKED this car — regardless of any transactions.
      supabase.from('bookings')
        .select('id, booking_number, customer_id, car_id, start_date, end_date, status, customers(id, first_name, last_name, phone, nationality, id_number)')
        .eq('car_id', carId)
        .not('customer_id', 'is', null)
        .order('start_date', { ascending: false }),
      supabase.from('customer_accounting_ledger')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: false }),
    ]);
    const raw = carRes.data as any;
    const mg  = raw?.model_group;
    setCar({ id: raw?.id ?? carId, plate_number: raw?.plate_number ?? '—', model_name: Array.isArray(mg) ? (mg[0]?.name ?? '—') : (mg?.name ?? '—') });

    setLedger((ledgerRes.data ?? []) as CustomerLedgerEntry[]);
    setBookings((bookingsRes.data ?? []) as unknown as CarBookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  // Build one group per booking; attach the ledger entries whose booking_id matches.
  // Bookings with no ledger entries still appear as an empty, openable sheet.
  const bookingGroups = useMemo((): BookingGroup[] =>
    bookings.map(b => {
      const entries  = ledger.filter(e => e.booking_id === b.id);
      const totalIn  = entries.filter(e => e.direction?.toUpperCase() === 'IN' ).reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = entries.filter(e => e.direction?.toUpperCase() === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const c = b.customers;
      return {
        bookingId:     b.id,
        bookingNumber: b.booking_number,
        startDate:     b.start_date,
        endDate:       b.end_date,
        status:        b.status,
        customerId:    b.customer_id as string,
        first_name:    c?.first_name  ?? '',
        last_name:     c?.last_name   ?? '',
        phone:         c?.phone       ?? null,
        nationality:   c?.nationality ?? null,
        id_number:     c?.id_number   ?? null,
        entries, totalIn, totalOut, balance: totalIn - totalOut,
      };
    }),
  [bookings, ledger]);

  const heroTotalIn  = useMemo(() => ledger.filter(e => e.direction?.toUpperCase() === 'IN' ).reduce((s, e) => s + e.amount, 0), [ledger]);
  const heroTotalOut = useMemo(() => ledger.filter(e => e.direction?.toUpperCase() === 'OUT').reduce((s, e) => s + e.amount, 0), [ledger]);
  const heroBalance  = heroTotalIn - heroTotalOut;

  const toggleBooking = (id: number) =>
    setOpenBookings(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDelete = async (id: number) => {
    setDeleting(true);
    await supabase.from('customer_accounting_ledger').delete().eq('id', id);
    setDeleting(false);
    setDeleteConfirm(null);
    await loadData();
  };

  const printInvoice = (cust: BookingGroup) => printLedgerInvoice(cust, car, fmt);

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    height: 32, padding: '0 12px', borderRadius: 8,
    border: '1.5px solid #e5e7eb', background: '#fff',
    fontSize: 12, fontWeight: 600, color: '#374151',
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    transition: 'all 140ms ease',
  };

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        <div style={{ height: 56, borderRadius: 12, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 24 }} />
        <div style={{ height: 110, borderRadius: 14, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 20 }} />
        {[0, 1, 2].map(i => <div key={i} style={{ height: 72, borderRadius: 12, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />)}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 40px 60px' }}>
      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => navigate('/dashboard/accounting?tab=investors&view=cars')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all 140ms ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#3A74C2'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#EBEBEB'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Car sheets
        </button>
        <div>
          <h1 className="font-mono tabular-nums" style={{ fontSize: 22, fontWeight: 500, color: '#0f1117', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.1 }}>{car?.plate_number}</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '3px 0 0' }}>{car?.model_name}</p>
        </div>
      </div>

      {/* ── Hero stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total IN',  value: heroTotalIn,  color: '#16a34a', signed: false },
          { label: 'Total OUT', value: heroTotalOut, color: '#dc2626', signed: false },
          { label: 'Balance',   value: heroBalance,  color: heroBalance >= 0 ? '#16a34a' : '#dc2626', signed: true },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: stat.color, letterSpacing: '-0.5px' }}>
              {stat.signed && stat.value < 0 ? '−' : ''}{fmt(Math.abs(stat.value))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Booking sheets list ── */}
      {bookingGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontSize: 14, background: '#fff', borderRadius: 14, border: '1.5px dashed #e5e7eb' }}>
          No bookings for this car yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookingGroups.map(cust => {
            const isOpen      = openBookings.has(cust.bookingId);
            const custName    = `${cust.first_name} ${cust.last_name}`.trim() || 'Unnamed customer';
            const dateRange   = cust.startDate ? `${fmtDate(cust.startDate)}${cust.endDate ? ` → ${fmtDate(cust.endDate)}` : ''}` : '';
            const bookingLine = [cust.bookingNumber, dateRange].filter(Boolean).join(' · ');

            return (
              <div key={cust.bookingId} style={{
                background: '#fff', borderRadius: 14,
                border: isOpen ? '1.5px solid #4ba6ea' : '1px solid #e5e7eb',
                boxShadow: isOpen ? '0 4px 20px rgba(75,166,234,0.1)' : '0 1px 4px rgba(0,0,0,0.06)',
                overflow: 'hidden', transition: 'box-shadow 180ms ease, border-color 180ms ease',
              }}>
                {/* Booking header (clickable) */}
                <div
                  onClick={() => toggleBooking(cust.bookingId)}
                  style={{ padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}
                  onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = '#fafafa'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    {/* Name + booking */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <CustomerAvatar size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', letterSpacing: '0.2px' }}>{custName.toUpperCase()}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bookingLine || (cust.phone ?? '—')}</div>
                      </div>
                    </div>

                    {/* Stats + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      <div style={{ display: 'flex', gap: 14, textAlign: 'right' }}>
                        <div>
                          <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>IN</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>{fmt(cust.totalIn)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>OUT</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>{fmt(cust.totalOut)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Balance</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: cust.balance >= 0 ? '#16a34a' : '#dc2626' }}>
                            {cust.balance < 0 ? '−' : ''}{fmt(Math.abs(cust.balance))}
                          </div>
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        style={{ transition: 'transform 200ms ease', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: isOpen ? '#3A74C2' : '#9ca3af', flexShrink: 0 }}>
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded: actions + transactions */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0f0f0' }}>
                    {/* Action buttons */}
                    <div style={{ padding: '10px 20px', display: 'flex', gap: 8, borderBottom: '1px solid #f5f5f5' }}>
                      <button
                        onClick={() => printInvoice(cust)}
                        style={btnBase}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#3A74C2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1h-2M6 14h12v7H6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Invoice
                      </button>
                      <button
                        onClick={() => setAddModal({ bookingId: cust.bookingId, customerId: cust.customerId, customerName: custName, bookingLabel: bookingLine })}
                        style={btnBase}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#3A74C2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                        Add Transaction
                      </button>
                    </div>

                    {/* Transactions */}
                    {cust.entries.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No transactions yet.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                          <thead>
                            <tr>
                              {['Date', 'Type', 'Description', 'Amount', ''].map((h, hi) => (
                                <th key={hi} style={{ padding: '9px 16px', fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: h === '' ? 'right' : 'left', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cust.entries.map((e, i) => {
                              const isPendingDelete = deleteConfirm === e.id;
                              const isIn = e.direction?.toUpperCase() === 'IN';
                              return (
                                <tr key={e.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: isPendingDelete ? 'rgba(239,68,68,0.03)' : undefined }}>
                                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(e.created_at.slice(0, 10))}</td>
                                  <td style={{ padding: '10px 16px', fontSize: 12 }}>
                                    {e.type
                                      ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', background: '#f3f4f6', color: '#374151' }}>{e.type}</span>
                                      : <span style={{ color: '#d1d5db' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description ?? '—'}</td>
                                  <td className="font-mono tabular-nums" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: isIn ? '#16a34a' : '#dc2626' }}>
                                    {isIn ? '+' : '−'}{fmt(e.amount)}
                                  </td>
                                  <td style={{ padding: '7px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                    {isPendingDelete ? (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Delete?</span>
                                        <Button
                                          variant="danger"
                                          onClick={() => handleDelete(e.id)}
                                          disabled={deleting}
                                          style={{ padding: '0 10px', fontSize: 11, fontFamily: 'inherit' }}>
                                          {deleting ? '…' : 'Yes'}
                                        </Button>
                                        <button onClick={() => setDeleteConfirm(null)} style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid #EBEBEB', background: '#fff', color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      isRecordedPayment(e) ? (
                                        <span title="Recorded with an envelope or account. Reverse it in Cash & Envelopes." style={{ fontSize: 11.5, color: '#9ca3af', whiteSpace: 'nowrap' }}>Recorded</span>
                                      ) : (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <button onClick={() => setEditModal(e)} title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                                          onMouseEnter={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e2.currentTarget as HTMLButtonElement).style.color = '#3A74C2'; (e2.currentTarget as HTMLButtonElement).style.background = 'rgba(75,166,234,0.06)'; }}
                                          onMouseLeave={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e2.currentTarget as HTMLButtonElement).style.color = '#6b7280'; (e2.currentTarget as HTMLButtonElement).style.background = '#fff'; }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </button>
                                        <button onClick={() => setDeleteConfirm(e.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                                          onMouseEnter={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#fca5a5'; (e2.currentTarget as HTMLButtonElement).style.color = '#dc2626'; (e2.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.06)'; }}
                                          onMouseLeave={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e2.currentTarget as HTMLButtonElement).style.color = '#6b7280'; (e2.currentTarget as HTMLButtonElement).style.background = '#fff'; }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </button>
                                      </div>
                                      )
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addModal && (
        <AddCustomerTxModal
          customerName={addModal.customerName}
          customerId={addModal.customerId}
          carId={carId}
          bookingId={addModal.bookingId}
          bookingLabel={addModal.bookingLabel}
          carPlate={car?.plate_number}
          onClose={() => setAddModal(null)}
          onSaved={() => { setAddModal(null); loadData(); }}
        />
      )}
      {editModal && (
        <EditTxModal
          entry={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); loadData(); }}
        />
      )}
    </div>
  );
};

// ─── Global Add Transaction Modal ─────────────────────────────────────────────

interface AddFinTxForm {
  investor_id:  string;
  sheet_target: string;   // 'company_expenses' | 'personal_expenses' | 'buy_sell' | `car:${id}`
  direction:    'IN' | 'OUT';
  category:     string;
  amount:       string;
  date:         string;
  note:         string;
}

const EMPTY_FIN_TX: AddFinTxForm = {
  investor_id:  '',
  sheet_target: '',
  direction:    'IN',
  category:     '',
  amount:       '',
  date:         new Date().toISOString().slice(0, 10),
  note:         '',
};

// Maps sheet_type (or 'car') + direction → category options
const FIN_TX_CATEGORIES: Record<string, Partial<Record<'IN' | 'OUT', string[]>>> = {
  company_expenses: {
    IN:  ['Other'],
    OUT: ['MTV', 'MÜŞAVIR MALİ', 'Rent', 'Other'],
  },
  personal_expenses: {
    IN:  ['Other'],
    OUT: ['Other'],
  },
  buy_sell: {
    IN:  ['Deposit', 'Car Sale', 'Other'],
    OUT: ['Car Purchase', 'Noter', 'Sigorta', 'Kasko', 'Other'],
  },
  car: {
    IN:  ['Rent Collection', 'Other'],
    OUT: ['Petrol', 'Oil', 'Wash', 'Maintenance', 'Other'],
  },
};

function getCategoryOptions(sheetTarget: string, direction: 'IN' | 'OUT'): string[] {
  const sheetType = sheetTarget.startsWith('car:') ? 'car' : sheetTarget;
  return FIN_TX_CATEGORIES[sheetType]?.[direction] ?? ['Other'];
}

const AddFinancialTxModal: React.FC<{
  onClose:  () => void;
  onSaved:  () => void;
}> = ({ onClose, onSaved }) => {
  const [form,           setForm]           = useState<AddFinTxForm>(EMPTY_FIN_TX);
  const [saving,         setSaving]         = useState(false);
  const [saveStep,       setSaveStep]       = useState('');
  const [error,          setError]          = useState<string | null>(null);
  const [warning,        setWarning]        = useState<string | null>(null);
  const [investors,      setInvestors]      = useState<{ id: string; company_name: string }[]>([]);
  const [cars,           setCars]           = useState<{ id: number; label: string; plate: string }[]>([]);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [receipt,        setReceipt]        = useState<ReceiptValue>(EMPTY_RECEIPT);

  // Fetch investors once on mount
  useEffect(() => {
    supabase.from('investors').select('id, company_name').order('company_name').then(({ data }) => {
      setInvestors((data ?? []) as { id: string; company_name: string }[]);
    });
  }, []);

  // When investor changes: reset sheet + category, reload filtered cars + commission rate
  useEffect(() => {
    if (!form.investor_id) {
      setCommissionRate(null);
      setCars([]);
      return;
    }
    // Reset target sheet and category so stale car selections are cleared
    setForm(prev => ({ ...prev, sheet_target: '', category: '' }));
    Promise.all([
      supabase.from('investors').select('commission_rate').eq('id', form.investor_id).single(),
      supabase.from('cars').select('id, plate_number, model_group:model_group_id(name)').eq('investor_id', form.investor_id).eq('is_active', true),
    ]).then(([invRes, carsRes]) => {
      setCommissionRate((invRes.data as { commission_rate: number | null } | null)?.commission_rate ?? null);
      const raw = (carsRes.data ?? []) as unknown as { id: number; plate_number: string; model_group: { name: string } | null }[];
      setCars(
        raw
          // Group by model, then plate within each model
          .sort((a, b) =>
            (a.model_group?.name ?? '—').localeCompare(b.model_group?.name ?? '—') ||
            a.plate_number.localeCompare(b.plate_number))
          .map(c => ({ id: c.id, label: `${c.plate_number} — ${c.model_group?.name ?? '—'}`, plate: c.plate_number })),
      );
    });
  }, [form.investor_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset category whenever sheet or direction changes
  useEffect(() => {
    setForm(prev => ({ ...prev, category: '' }));
  }, [form.sheet_target, form.direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof AddFinTxForm>(k: K, v: AddFinTxForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.investor_id)  { setError('Select an investor.'); return; }
    if (!form.sheet_target) { setError('Select a target sheet.'); return; }
    if (!form.date)         { setError('Date is required.'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount.'); return; }

    const month_key  = form.date.slice(0, 7);
    const isCarSheet = form.sheet_target.startsWith('car:');
    const sheet_type = isCarSheet ? 'car' : form.sheet_target;
    const car_id     = isCarSheet ? parseInt(form.sheet_target.replace('car:', ''), 10) : null;

    setSaving(true);
    setError(null);
    setWarning(null);

    // Receipt is optional — an upload failure must never block the transaction.
    let receipt_url: string | null = null;
    let uploadError: string | null = null;
    if (receipt.file) {
      setSaveStep('Uploading receipt…');
      const folderKey = isCarSheet
        ? (cars.find(c => c.id === car_id)?.plate ?? car_id)
        : sheet_type;
      try {
        receipt_url = await resolveReceiptUrl(receipt, folderKey);
      } catch (e) {
        uploadError = e instanceof Error ? e.message : 'Unknown error';
      }
    }

    // Insert only the main transaction row. For car-sheet Rent Collection entries
    // the database trigger automatically creates the matching commission row, so
    // the frontend must not insert it (would double up).
    const row = {
      investor_id: form.investor_id,
      sheet_type,
      car_id:      car_id ?? null,
      month_key,
      date:        form.date,
      note:        form.note || null,
      direction:   form.direction,
      category:    form.category || null,
      amount,
      receipt_url,
    };

    setSaveStep('Saving…');
    const { error: err } = await supabase.from('financial_transactions').insert(row);
    setSaving(false);
    setSaveStep('');
    if (err) { setError(err.message); return; }
    if (uploadError) {
      // The transaction itself is saved; only the receipt failed. Keep the modal
      // open (as a "saved" state) so the user sees why the receipt is missing.
      setWarning(`Transaction saved, but the receipt upload failed: ${uploadError}`);
      return;
    }
    onSaved();
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const blurGray  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5,
    display: 'block',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#0f1117' }}>Add Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Insert into financial_transactions</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1. Investor */}
          <div>
            <label style={lbl}>Investor / Company</label>
            <select value={form.investor_id} onChange={e => set('investor_id', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray}>
              <option value="">— Select investor —</option>
              {investors.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.company_name}</option>
              ))}
            </select>
          </div>

          {/* 2. Target Sheet */}
          <div>
            <label style={lbl}>Target Sheet</label>
            <select value={form.sheet_target} onChange={e => set('sheet_target', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray}>
              <option value="">— Select sheet —</option>
              <optgroup label="Fixed Sheets">
                <option value="company_expenses">Company Expenses</option>
                <option value="personal_expenses">Personal Expenses</option>
                <option value="buy_sell">Buy &amp; Sell</option>
              </optgroup>
              {cars.length > 0 && (
                <optgroup label="Car Sheets">
                  {cars.map(c => (
                    <option key={c.id} value={`car:${c.id}`}>{c.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* 3. Direction + 6. Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => set('direction', d)}
                    style={{
                      flex: 1, height: 40, borderRadius: 9, fontFamily: 'inherit', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, transition: 'all 140ms ease',
                      border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                      background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                      color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280',
                    }}
                  >
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* 4. Category + 5. Amount row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                disabled={!form.sheet_target}
                style={{ ...inp, color: form.category ? '#0f1117' : '#9ca3af', cursor: form.sheet_target ? 'pointer' : 'not-allowed', opacity: form.sheet_target ? 1 : 0.6 }}
                onFocus={focusBlue}
                onBlur={blurGray}
              >
                <option value="">{form.sheet_target ? '— Select category —' : '— Select sheet first —'}</option>
                {getCategoryOptions(form.sheet_target, form.direction).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount (TRY)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* Commission preview banner */}
          {(() => {
            const isCarRentCollection =
              form.sheet_target.startsWith('car:') &&
              form.category === 'Rent Collection' &&
              commissionRate != null;
            if (!isCarRentCollection) return null;
            const amt     = parseFloat(form.amount);
            const hasAmt  = !isNaN(amt) && amt > 0;
            const commAmt = hasAmt ? parseFloat((amt * (commissionRate / 100)).toFixed(2)) : null;
            const isZero  = commissionRate === 0;
            return (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 14px', borderRadius: 10,
                background: isZero ? 'rgba(107,114,128,0.07)' : 'rgba(75,166,234,0.07)',
                border: isZero ? '1.5px solid rgba(107,114,128,0.2)' : '1.5px solid rgba(75,166,234,0.25)',
                animation: 'fadeIn 180ms ease',
              }}>
                <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>{isZero ? 'ℹ️' : '⚡'}</span>
                <div style={{ fontSize: 12.5, color: isZero ? '#6b7280' : '#1d6fa8', lineHeight: 1.55 }}>
                  {isZero ? (
                    <span style={{ fontWeight: 500 }}>No commission for this investor (0%) — only the main transaction row will be inserted.</span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>Commission will be auto-deducted: </span>
                      <span style={{ fontWeight: 600 }}>{commissionRate}%</span>
                      {commAmt !== null && (
                        <span> = <span style={{ fontWeight: 600 }}>{commAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY</span></span>
                      )}
                      <div style={{ fontSize: 11, color: '#3A74C2', marginTop: 3, fontWeight: 500 }}>
                        A separate Commission row will be inserted automatically.
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 7. Note */}
          <div>
            <label style={lbl}>Note</label>
            <textarea placeholder="Optional note…" value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical', minHeight: 58 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {/* 8. Receipt */}
          <div>
            <label style={lbl}>Receipt (optional)</label>
            <ReceiptField value={receipt} onChange={setReceipt} disabled={saving || !!warning} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          {warning && (
            <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px' }}>{warning}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          {warning ? (
            <Button
              onClick={() => { onSaved(); onClose(); }}
              style={{ padding: '9px 22px', fontSize: 13, fontFamily: 'inherit' }}>Close</Button>
          ) : (
            <>
              <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <Button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '9px 22px', fontSize: 13, fontFamily: 'inherit' }}>
                {saving ? (saveStep || 'Saving…') : 'Add Transaction'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};


// ─── Internal Finance: Add Transaction Modal ─────────────────────────────────

// One modal for two jobs: a company expense from Company expenses, or money moved
// in or out of someone's custody from Staff custody.
const AddInternalFinanceTxModal: React.FC<{
  /** Staff to choose from. Passing them makes this a custody entry. */
  profiles?: ProfileRow[];
  onClose:  () => void;
  onSaved:  () => void;
}> = ({ profiles = [], onClose, onSaved }) => {
  const walletOnly = profiles.length > 0;
  const { rates } = useCurrency();
  const [form, setForm] = useState<AddIfTxForm>(() => ({
    date:          new Date().toISOString().slice(0, 10),
    direction:     'OUT',
    amount:        '',
    inputCurrency: 'TRY',
    category:      walletOnly ? 'employee_account' : '',
    employee_id:   '',
    note:          '',
  }));
  const [receiptFile,    setReceiptFile]    = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [saveStep,       setSaveStep]       = useState('');
  const [error,          setError]          = useState<string | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);
  const [empSearch,      setEmpSearch]      = useState('');
  const [empOpen,        setEmpOpen]        = useState(false);
  const empDropRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!receiptFile || receiptFile.type === 'application/pdf') { setReceiptPreview(null); return; }
    const url = URL.createObjectURL(receiptFile);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!empOpen) return;
    const handler = (e: MouseEvent) => {
      if (empDropRef.current && !empDropRef.current.contains(e.target as Node)) setEmpOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [empOpen]);

  const set = <K extends keyof AddIfTxForm>(k: K, v: AddIfTxForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.date)     { setError('Date is required.');      return; }
    if (!form.category) { setError('Category is required.');  return; }
    const rawAmount = parseFloat(form.amount);
    if (isNaN(rawAmount) || rawAmount <= 0) { setError('Enter a valid positive amount.'); return; }

    const isWallet = form.category === 'employee_account';
    if (isWallet && !form.employee_id) {
      setError('Choose the employee holding this custody.');
      return;
    }

    setSaving(true); setError(null);

    // Convert to TRY if entry was in USD
    let amountTRY = rawAmount;
    if (form.inputCurrency === 'USD') {
      const usdRate = rates.find(r => r.currency === 'USD')?.rate_to_try;
      if (!usdRate) { setSaving(false); setError('USD exchange rate unavailable — try again.'); return; }
      amountTRY = rawAmount * usdRate;
    }

    // Receipt upload — bucket matches the target table
    const bucket = isWallet ? 'employee_wallets' : 'company_expenses';
    let receiptUrl: string | null = null;
    if (receiptFile) {
      setSaveStep('Uploading receipt…');

      // Build filename: {category}-{DD-MM-YY}-{seq}.{ext}
      const cat = (form.category || 'general').replace(/[^a-zA-Z0-9_]/g, '_');
      const [y, m, d] = form.date.split('-').map(Number);
      const dd  = String(d).padStart(2, '0');
      const mm  = String(m).padStart(2, '0');
      const yy  = String(y).slice(-2);
      const prefix = `${cat}-${dd}-${mm}-${yy}`;

      // Count existing files with this prefix to get seq
      const { data: existingFiles } = await supabase.storage
        .from(bucket)
        .list('', { search: prefix });
      const seq = (existingFiles?.length ?? 0) + 1;

      const ext = receiptFile.name.includes('.') ? receiptFile.name.split('.').pop()!.toLowerCase() : 'jpg';
      const filePath = `${prefix}-${seq}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, receiptFile, { upsert: true });

      if (upErr) {
        setSaving(false); setSaveStep('');
        setToast(`Upload failed: ${upErr.message}`);
        return;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      receiptUrl = urlData.publicUrl;
    }

    setSaveStep('Saving…');
    const { error: err } = isWallet
      ? await supabase.from('employee_wallets').insert({
          employee_id:      form.employee_id,
          transaction_date: form.date,
          direction:        form.direction,
          category:         null,
          amount:           amountTRY,
          description:      form.note || null,
          receipt_url:      receiptUrl,
          // An admin's own entry, not a staff claim. It must not wait for approval, or post anywhere.
          review_status:    'approved',
        })
      : await supabase.from('company_expenses').insert({
          expense_date: form.date,
          direction:    form.direction,
          category:     form.category || null,
          amount:       amountTRY,
          description:  form.note || null,
          receipt_url:  receiptUrl,
          car_id:       null,
        });
    setSaving(false); setSaveStep('');
    if (err) { setError(err.message); return; }
    setToast('Transaction saved!');
    setTimeout(() => { onSaved(); onClose(); }, 800);
  };

  const usdRate    = rates.find(r => r.currency === 'USD')?.rate_to_try;
  const previewTRY = form.inputCurrency === 'USD' && usdRate && !isNaN(parseFloat(form.amount))
    ? parseFloat(form.amount) * usdRate : null;

  const filteredProfiles = profiles.filter(p =>
    (p.full_name ?? '').toLowerCase().includes(empSearch.toLowerCase())
  );
  const selectedEmpName = profiles.find(p => p.id === form.employee_id)?.full_name ?? '';

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const focusB = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const blurG  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 520, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#0f1117' }}>New Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{form.category === 'employee_account' ? 'Staff custody' : 'Company expenses'}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Date + Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Date <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} onFocus={focusB} onBlur={blurG} />
            </div>
            <div>
              <label style={lbl}>Direction <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button key={d} onClick={() => set('direction', d)} style={{
                    flex: 1, height: 38, borderRadius: 9,
                    border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                    background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                    color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease',
                  }}>
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Amount + Currency toggle */}
          <div>
            <label style={lbl}>Amount <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)}
                style={{ ...inp, flex: 1 }} onFocus={focusB} onBlur={blurG}
              />
              <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                {(['TRY', 'USD'] as const).map(c => (
                  <button key={c} onClick={() => set('inputCurrency', c)} style={{
                    padding: '0 14px', height: 38, border: 'none',
                    background: form.inputCurrency === c ? '#4ba6ea' : '#fff',
                    color: form.inputCurrency === c ? '#fff' : '#6b7280',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease',
                  }}>
                    {c === 'TRY' ? '₺ TRY' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>
            {previewTRY !== null && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
                ≈ ₺{previewTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will be stored
              </div>
            )}
          </div>

          {/* Category */}
          {!walletOnly && (
            <div>
              <label style={lbl}>Category <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inp} onFocus={focusB} onBlur={blurG}>
                <option value="">— Select category —</option>
                {COMPANY_EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          {/* Employee — searchable dropdown */}
          {walletOnly && (
          <div>
            <label style={lbl}>Employee <span style={{ color: '#ef4444' }}> *</span></label>
            <div ref={empDropRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setEmpOpen(o => !o)}
                style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderColor: empOpen ? '#4ba6ea' : '#e5e7eb', userSelect: 'none' }}
              >
                <span style={{ color: form.employee_id ? '#0f1117' : '#9ca3af' }}>
                  {form.employee_id ? selectedEmpName : 'Search employee…'}
                </span>
                {form.employee_id
                  ? <span onClick={e => { e.stopPropagation(); set('employee_id', ''); setEmpSearch(''); }} style={{ color: '#9ca3af', cursor: 'pointer', fontSize: 16, lineHeight: 1, marginLeft: 4 }}>×</span>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                }
              </div>
              {empOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
                    <input
                      autoFocus type="text" placeholder="Search…"
                      value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ ...inp, padding: '6px 10px', fontSize: 12 }}
                      onFocus={focusB} onBlur={blurG}
                    />
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {filteredProfiles.length === 0
                      ? <div style={{ padding: '12px 14px', color: '#9ca3af', fontSize: 12 }}>No employees found</div>
                      : filteredProfiles.map(p => (
                          <div
                            key={p.id}
                            onClick={() => { set('employee_id', p.id); setEmpOpen(false); setEmpSearch(''); }}
                            style={{
                              padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                              background: form.employee_id === p.id ? 'rgba(75,166,234,0.06)' : '#fff',
                              color: form.employee_id === p.id ? '#3A74C2' : '#0f1117',
                              fontWeight: form.employee_id === p.id ? 600 : 400,
                            }}
                            onMouseEnter={e => { if (form.employee_id !== p.id) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                            onMouseLeave={e => { if (form.employee_id !== p.id) (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <StaffAvatar profile={p} size={24} />
                              {p.full_name ?? p.id}
                            </span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Receipt upload */}
          <div>
            <label style={lbl}>Receipt (image or PDF)</label>
            <label
              style={{ display: 'block', border: '1.5px dashed #e5e7eb', borderRadius: 10, padding: receiptFile ? '12px 14px' : '20px 14px', cursor: 'pointer', textAlign: 'center', transition: 'border-color 140ms ease' }}
              onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = '#4ba6ea'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = '#e5e7eb'; }}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} />
              {receiptFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {receiptPreview
                    ? <img src={receiptPreview} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                    : <div style={{ width: 48, height: 48, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>PDF</div>
                  }
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117' }}>{receiptFile.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{(receiptFile.size / 1024).toFixed(0)} KB · Click to change</div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Click to upload receipt</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>JPG, PNG, or PDF</div>
                </>
              )}
            </label>
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>Notes</label>
            <textarea
              placeholder="Optional note…"
              value={form.note} onChange={e => set('note', e.target.value)}
              rows={2} style={{ ...inp, resize: 'vertical', minHeight: 60 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '9px 22px', fontSize: 13, fontFamily: 'inherit', minWidth: 140 }}
          >
            {saving ? (saveStep || 'Saving…') : 'Save Transaction'}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100, animation: 'slideUp 200ms ease', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>,
    document.body,
  );
};

// ─── Transaction List Modal (category expenses) ──────────────────────────────

interface TxDisplayRow {
  id:          number | string;
  date:        string;
  direction:   string;
  amount:      number;
  category?:   string | null;
  description: string | null;
  receipt_url: string | null;
}

const DirBadge: React.FC<{ dir: string }> = ({ dir }) => {
  const isIn = dir?.toUpperCase() === 'IN';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: isIn ? '#16a34a' : '#dc2626',
      background: isIn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    }}>
      {isIn ? '↓ IN' : '↑ OUT'}
    </span>
  );
};

const TransactionListModal: React.FC<{
  title:       string;
  subtitle?:   string;
  statLabel:   string;
  statValue:   number;
  showCategory: boolean;
  loading?:    boolean;
  rows:        TxDisplayRow[];
  onClose:     () => void;
}> = ({ title, subtitle, statLabel, statValue, showCategory, loading = false, rows, onClose }) => {
  const { fmt } = useCurrency();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted    = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const statColor = statValue > 0 ? '#16a34a' : statValue < 0 ? '#dc2626' : '#6b7280';

  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #f0f0f0' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151', verticalAlign: 'middle' };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#0f1117' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Running total */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{statLabel}</div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.6px', color: statColor }}>
            {statValue < 0 ? '-' : ''}{fmt(Math.abs(statValue))}
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Direction</th>
                  {showCategory && <th style={th}>Category</th>}
                  <th style={th}>Amount</th>
                  <th style={th}>Description</th>
                  <th style={th}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const isIn = r.direction?.toUpperCase() === 'IN';
                  return (
                    <tr key={r.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid #f7f7f7' : 'none' }}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                      <td style={td}><DirBadge dir={r.direction} /></td>
                      {showCategory && <td style={{ ...td, textTransform: 'capitalize' }}>{r.category || '—'}</td>}
                      <td className="font-mono tabular-nums" style={{ ...td, fontWeight: 600, color: isIn ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
                        {isIn ? '+' : '-'}{fmt(r.amount ?? 0)}
                      </td>
                      <td style={{ ...td, color: r.description ? '#374151' : '#d1d5db', maxWidth: 220 }}>{r.description || '—'}</td>
                      <td style={td}>
                        {r.receipt_url
                          ? <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ color: '#3A74C2', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>View</a>
                          : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Edit modal for a single company_expenses row ─────────────────────────────

const EditCompanyExpenseModal: React.FC<{
  entry:   CompanyExpenseRow;
  onClose: () => void;
  onSaved: () => void;
}> = ({ entry, onClose, onSaved }) => {
  const { symbol } = useCurrency();
  const [form, setForm] = useState({
    date:        entry.expense_date ?? '',
    direction:   (entry.direction?.toUpperCase() === 'IN' ? 'IN' : 'OUT') as 'IN' | 'OUT',
    category:    entry.category ?? '',
    amount:      String(entry.amount ?? ''),
    description: entry.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('company_expenses')
      .update({
        expense_date: form.date,
        direction:    form.direction,
        category:     form.category || null,
        amount,
        description:  form.description || null,
      })
      .eq('id', entry.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };
  const knownCategory = COMPANY_EXPENSE_CATEGORIES.some(c => c.value === form.category);

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117' }}>Edit Expense</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>ID #{entry.id}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <label style={lbl}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button key={d} onClick={() => set('direction', d)}
                    style={{ flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`, background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff', color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}>
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={lbl}>Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}>
              <option value="">— Select —</option>
              {COMPANY_EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              {form.category && !knownCategory && <option value={form.category}>{form.category}</option>}
            </select>
          </div>

          <div>
            <label style={lbl}>Amount ({symbol})</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          <div>
            <label style={lbl}>Description</label>
            <input type="text" placeholder="Optional description…" value={form.description} onChange={e => set('description', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '9px 20px', fontSize: 13, fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const CompanyExpensesTab: React.FC<{ onExpensesChanged: () => void }> = ({ onExpensesChanged }) => {
  const { fmt } = useCurrency();
  const [linkParams] = useSearchParams();
  const linkedMonth = linkParams.get('month');
  const linkedEntry = Number(linkParams.get('entry')) || null;
  const [monthKey,       setMonthKey]       = useState(linkedMonth && /^\d{4}-\d{2}$/.test(linkedMonth) ? linkedMonth : currentMonthKey());
  const [refreshKey,     setRefreshKey]     = useState(0);
  const [showAddTx,      setShowAddTx]      = useState(false);
  const [ifMonthData,    setIfMonthData]    = useState<CompanyExpenseRow[]>([]);
  const [ifMonthLoading, setIfMonthLoading] = useState(true);
  const [openCategory,   setOpenCategory]   = useState<{ value: string; label: string } | null>(null);
  const [editExpense,    setEditExpense]    = useState<CompanyExpenseRow | null>(null);
  const [fresh,          setFresh]          = useState<Set<number>>(new Set());
  const shownMonth = useRef<string | null>(null);

  const suggestions = useSuggestions('company', monthKey, useCallback((posting) => {
    if (posting?.company_expense_id) setFresh(current => new Set(current).add(posting.company_expense_id as number));
    setRefreshKey(k => k + 1);
    onExpensesChanged();
  }, [onExpensesChanged]));

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    await supabase.from('company_expenses').delete().eq('id', id);
    setRefreshKey(k => k + 1);
  };

  useScrollToRow(linkedEntry, !ifMonthLoading);

  useEffect(() => {
    let cancelled = false;
    // A skeleton on a refresh would wipe the table while a posted row is arriving.
    if (shownMonth.current !== monthKey) setIfMonthLoading(true);
    const { start, end } = monthDateRange(monthKey);
    supabase.from('company_expenses').select('*').gte('expense_date', start).lt('expense_date', end)
      .then(({ data }) => {
        if (cancelled) return;
        setIfMonthData((data ?? []) as CompanyExpenseRow[]);
        shownMonth.current = monthKey;
        setIfMonthLoading(false);
      });
    return () => { cancelled = true; };
  }, [monthKey, refreshKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
        <Button
          onClick={() => setShowAddTx(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', fontSize: 13, fontFamily: 'inherit' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
          Add Transaction
        </Button>
      </div>

      <SuggestionBanner suggestions={suggestions} />

      {/* ── Company Expenses: Section 1 — Hero summary card ────────────── */}
      {(() => {
        const ifIncome   = ifMonthData.filter(r => r.direction === 'IN').reduce((a, r) => a + (r.amount ?? 0), 0);
        const ifExpenses = ifMonthData.filter(r => r.direction === 'OUT').reduce((a, r) => a + (r.amount ?? 0), 0);
        const ifNet      = ifIncome - ifExpenses;
        const ifPositive = ifNet >= 0;
        const shimmer = { borderRadius: 8, background: 'rgba(255,255,255,0.25)', animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;
        return (
          <div style={{
            borderRadius: 20,
            background: ifPositive
              ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
              : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            padding: '32px 36px',
            boxShadow: ifPositive
              ? '0 8px 32px rgba(22,163,74,0.28)'
              : '0 8px 32px rgba(220,38,38,0.28)',
            color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.85 }}>
                {monthLabel(monthKey)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 12px' }}>
                Company Expenses
              </div>
            </div>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Net</div>
              {ifMonthLoading
                ? <div style={{ ...shimmer, height: 52, width: 220 }} />
                : <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-1.5px', lineHeight: 1 }}>
                    {ifNet < 0 ? '-' : ''}{fmt(Math.abs(ifNet))}
                  </div>
              }
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Total Income</div>
                {ifMonthLoading
                  ? <div style={{ ...shimmer, height: 28, width: 120 }} />
                  : <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px' }}>{fmt(ifIncome)}</div>
                }
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Total Expenses</div>
                {ifMonthLoading
                  ? <div style={{ ...shimmer, height: 28, width: 120 }} />
                  : <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px' }}>{fmt(ifExpenses)}</div>
                }
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Company Expenses: Section 2 — Category breakdown ────────────── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 16 }}>
          Expenses by Category
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {COMPANY_EXPENSE_CATEGORIES.map(cat => {
            const total = ifMonthData.filter(r => r.category === cat.value && r.direction === 'OUT').reduce((a, r) => a + (r.amount ?? 0), 0);
            return (
              <div
                key={cat.value}
                onClick={() => setOpenCategory({ value: cat.value, label: cat.label })}
                style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'box-shadow 160ms ease, border-color 160ms ease, transform 140ms ease' }}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow = '0 6px 20px rgba(75,166,234,0.13)'; d.style.borderColor = '#4ba6ea'; d.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; d.style.borderColor = 'var(--border-subtle)'; d.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{cat.label}</span>
                </div>
                {ifMonthLoading
                  ? <div style={{ height: 26, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  : <div style={{ fontSize: 22, fontWeight: 600, color: total > 0 ? '#0f1117' : '#d1d5db', letterSpacing: '-0.5px' }}>{fmt(total)}</div>
                }
              </div>
            );
          })}
        </div>
      </div>

      {suggestions.rows.length > 0 && (
        <ul className="media-scope flex flex-col gap-2">
          {suggestions.rows.map(row => <SuggestedExpense key={row.id} row={row} suggestions={suggestions} />)}
        </ul>
      )}

      {/* ── Company Expenses: Section 3 — Transactions table ────────────── */}
      {(() => {
        const rows = [...ifMonthData].sort((a, b) =>
          (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : b.id - a.id));
        const net = rows.reduce((a, r) =>
          a + (r.direction?.toUpperCase() === 'IN' ? (r.amount ?? 0) : -(r.amount ?? 0)), 0);

        const th: React.CSSProperties = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' };
        const td: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#374151', verticalAlign: 'middle' };

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Transactions
              </div>
              {!ifMonthLoading && rows.length > 0 && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {rows.length} transaction{rows.length !== 1 ? 's' : ''} · Total{' '}
                  <span style={{ fontWeight: 600, color: net < 0 ? '#dc2626' : '#16a34a' }}>
                    {net < 0 ? '-' : ''}{fmt(Math.abs(net))}
                  </span>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              {ifMonthLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#3A74C2' }}>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
                  </svg>
                </div>
              ) : rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af', fontSize: 13 }}>
                  No expenses recorded for this month
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th style={th}>Date</th>
                        <th style={th}>Direction</th>
                        <th style={th}>Category</th>
                        <th style={th}>Amount</th>
                        <th style={th}>Description</th>
                        <th style={th}>Receipt</th>
                        <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const isIn = r.direction?.toUpperCase() === 'IN';
                        const catLabel = COMPANY_EXPENSE_CATEGORIES.find(c => c.value === r.category)?.label ?? r.category;
                        return (
                          <tr key={r.id} id={`entry-${r.id}`} className={fresh.has(r.id) ? 'sheet-row-new' : undefined} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f7f7f7' : 'none', background: r.id === linkedEntry ? HIGHLIGHT_ROW : undefined }}>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.expense_date)}</td>
                            <td style={td}><DirBadge dir={r.direction} /></td>
                            <td style={{ ...td, whiteSpace: 'nowrap', color: catLabel ? '#374151' : '#d1d5db' }}>{catLabel || '—'}</td>
                            <td className="font-mono tabular-nums" style={{ ...td, fontWeight: 600, color: isIn ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
                              {isIn ? '+' : '-'}{fmt(r.amount ?? 0)}
                            </td>
                            <td style={{ ...td, color: r.description ? '#374151' : '#d1d5db', maxWidth: 260 }}>{r.description || '—'}</td>
                            <td style={td}>
                              {r.receipt_url
                                ? <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ color: '#3A74C2', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>View</a>
                                : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setEditExpense(r)}
                                  title="Edit"
                                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', transition: 'all 140ms ease' }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(r.id)}
                                  title="Delete"
                                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', transition: 'all 140ms ease' }}
                                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; }}
                                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {showAddTx && (
        <AddInternalFinanceTxModal
          onClose={() => setShowAddTx(false)}
          onSaved={() => { setShowAddTx(false); setRefreshKey(k => k + 1); }}
        />
      )}

      <SuggestionDialogs suggestions={suggestions} />

      {editExpense && (
        <EditCompanyExpenseModal
          entry={editExpense}
          onClose={() => setEditExpense(null)}
          onSaved={() => { setEditExpense(null); setRefreshKey(k => k + 1); }}
        />
      )}

      {/* Category detail — current month, from already-loaded rows */}
      {openCategory && (() => {
        const catRows = ifMonthData.filter(r => r.category === openCategory.value);
        const net = catRows.reduce((a, r) => a + (r.direction?.toUpperCase() === 'IN' ? (r.amount ?? 0) : -(r.amount ?? 0)), 0);
        return (
          <TransactionListModal
            title={openCategory.label}
            subtitle={`${monthLabel(monthKey)} · Company expenses`}
            statLabel="Net Total"
            statValue={net}
            showCategory={false}
            loading={ifMonthLoading}
            rows={catRows.map(r => ({
              id: r.id, date: r.expense_date, direction: r.direction,
              amount: r.amount, description: r.description, receipt_url: r.receipt_url,
            }))}
            onClose={() => setOpenCategory(null)}
          />
        );
      })()}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Tabs with more than one view ─────────────────────────────────────────────

const ViewSwitch: React.FC<{ views: ReadonlyArray<{ value: string; label: string }>; current: string }> = ({ views, current }) => {
  const [params, setParams] = useSearchParams();
  return (
    <div className="media-scope mb-4">
      <Segmented
        ariaLabel="View"
        value={current}
        options={views}
        onChange={(view) => {
          const next = new URLSearchParams();
          next.set('tab', params.get('tab') ?? '');
          if (view !== views[0].value) next.set('view', view);
          setParams(next);
        }}
      />
    </div>
  );
};

/** The count sits on the toggle, so suggested rows aren't missed from the default view. */
const InvestorsTab: React.FC<{ view: string | null; onExpensesChanged: () => void }> = ({ view, onExpensesChanged }) => {
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestedExpenses('car', currentMonthKey())
      .then((rows) => { if (!cancelled) setWaiting(rows.length); })
      .catch(() => { /* Only the count goes missing. */ });
    return () => { cancelled = true; };
  }, []);

  const current = view === 'cars' ? 'cars' : 'investors';
  const views = [
    { value: 'investors', label: 'By investor' },
    { value: 'cars', label: waiting > 0 ? `By car (${waiting})` : 'By car' },
  ];
  return (
    <>
      <ViewSwitch views={views} current={current} />
      {current === 'investors' ? <InvestorSheetsTab /> : <CarSheetsList onExpensesChanged={onExpensesChanged} />}
    </>
  );
};

// The wallet is the customer's, across their bookings. The per-car customer sheet
// is reached from Investors › By car, never from here.
/** Staff custody, plus the admin's own way to put money in or take it out of someone's custody. */
const CustodyTab: React.FC<{ onPending: (summary: PendingSummary) => void }> = ({ onPending }) => {
  const [adding, setAdding] = useState(false);
  const [staff,  setStaff]  = useState<ProfileRow[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.from('profiles').select('id, full_name, avatar_url, avatar_bg, gender').eq('role', 'staff').order('full_name').then(({ data }) => {
      if (!cancelled) setStaff((data ?? []) as ProfileRow[]);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <StaffCustodyTab
        onPending={onPending}
        refresh={refresh}
        action={<Button variant="outline" size="lg" className="!h-11 px-4 md:!h-10" disabled={staff.length === 0} onClick={() => setAdding(true)}>Add to custody</Button>}
      />
      {adding && (
        <AddInternalFinanceTxModal
          profiles={staff}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); setRefresh(value => value + 1); }}
        />
      )}
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type AccountingTab = 'overview' | 'close' | 'investors' | 'expenses' | 'custody' | 'wallets' | 'customers' | 'suppliers' | 'vault';

const TABS: ReadonlyArray<{ key: AccountingTab; label: string }> = [
  { key: 'overview',  label: 'Overview'         },
  { key: 'close',     label: 'Monthly close'    },
  { key: 'investors', label: 'Investors'        },
  { key: 'expenses',  label: 'Company expenses' },
  { key: 'custody',   label: 'Staff custody'    },
  { key: 'wallets',   label: 'Wallets'          },
  { key: 'customers', label: 'Customer wallets' },
  { key: 'suppliers', label: 'Suppliers'        },
  { key: 'vault',     label: 'Cash & Envelopes' },
];

/** Links from before the tabs moved. Anything else on the link, like its month, carries over. */
function movedTab(params: URLSearchParams): URLSearchParams | null {
  const tab = params.get('tab');
  const view = params.get('view');
  const next = new URLSearchParams(params);
  next.delete('view');
  if (tab === 'cars' && view === 'summary') return new URLSearchParams();
  if (tab === 'cars' && view === 'investors') next.set('tab', 'investors');
  else if (tab === 'cars') { next.set('tab', 'investors'); next.set('view', 'cars'); }
  else if (tab === 'investor') next.set('tab', 'investors');
  else if (tab === 'customer') next.set('tab', 'customers');
  else if (tab === 'bookings') next.set('tab', 'customers');
  else if (tab === 'cash') next.set('tab', 'vault');
  else return null;
  return next;
}

const AccountingPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const activeTab: AccountingTab = TABS.find(tab => tab.key === requested)?.key ?? 'overview';
  const supplierId = Number(params.get('supplier')) || null;
  // Each tab keeps its own filters in the URL, so they don't carry over.
  const openTab = useCallback((tab: AccountingTab) => {
    setParams(tab === 'overview' ? {} : { tab });
  }, [setParams]);
  const [pending,    setPending]    = useState<PendingSummary | null>(null);
  const [showAddTx,  setShowAddTx]  = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingCheck, setPendingCheck] = useState(0);
  const recheckPending = useCallback(() => setPendingCheck(value => value + 1), []);

  useEffect(() => {
    const moved = movedTab(params);
    if (moved) setParams(moved, { replace: true });
  }, [params, setParams]);

  // On a phone the row scrolls, and a link can land on a tab that's out of view.
  const tabBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabBar.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    fetchPendingSummary()
      .then((summary) => { if (!cancelled) setPending(summary); })
      .catch(() => { /* Only the badge goes missing. The tab shows its own error. */ });
    return () => { cancelled = true; };
  }, [pendingCheck]);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-11" style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Finance</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>Accounting</h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Sheets, expenses, custody and what we owe.</p>
        </div>
        <Button
          onClick={() => setShowAddTx(true)}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', fontSize: 13, fontFamily: 'inherit' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          Add Transaction
        </Button>
      </div>

      {/* Tabs */}
      <div ref={tabBar} role="tablist" aria-label="Accounting views" style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f3f4f6', padding: 4, borderRadius: 12, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => openTab(tab.key)}
            style={{
              padding: '8px 13px', minHeight: 40, flexShrink: 0, whiteSpace: 'nowrap',
              borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? '#0f1117' : '#6b7280',
              background: activeTab === tab.key ? '#fff' : 'transparent',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 140ms ease',
            }}
          >
            {tab.label}
            {tab.key === 'custody' && !!pending?.count && (
              <span aria-label={`${pending.count} waiting`} style={{ marginInlineStart: 6, minWidth: 18, height: 18, padding: '0 5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: '#F59E0B', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {pending.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'  && <OverviewTab key={refreshKey} />}
      {activeTab === 'close'     && <MonthlyCloseTab key={refreshKey} />}
      {activeTab === 'investors' && <InvestorsTab key={refreshKey} view={params.get('view')} onExpensesChanged={recheckPending} />}
      {activeTab === 'expenses'  && <CompanyExpensesTab key={refreshKey} onExpensesChanged={recheckPending} />}
      {activeTab === 'custody'   && <CustodyTab onPending={setPending} />}
      {activeTab === 'wallets'   && <WalletsTab />}
      {activeTab === 'customers' && <CustomerWalletsTab key={refreshKey} />}
      {activeTab === 'suppliers' && (supplierId ? <SupplierSheet key={supplierId} supplierId={supplierId} /> : <SuppliersTab />)}
      {activeTab === 'vault'     && <CashEnvelopesTab key={refreshKey} />}

      {/* Global Add Transaction */}
      {showAddTx && (
        <AddFinancialTxModal
          onClose={() => setShowAddTx(false)}
          onSaved={() => { setShowAddTx(false); setRefreshKey(k => k + 1); }}
        />
      )}

      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AccountingPage;
