import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Button } from '../../components/media/MediaUI';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import { brandImgHtml, brandLockupHtml, writeBrandedDocument } from '../../lib/brand';
import { useCurrency } from '../../lib/CurrencyContext';
import { groupInvoiceEntries } from '../../lib/customerWallet';
import { envelopeReceipt, equivalentLabel, NEW_PAYMENT, paymentProblem, recordCustomerPayment, showEnvelopes, type PaymentChoice } from '../../lib/payments';
import { standaloneFontCss } from '../../lib/standaloneFonts';
import { supabase } from '../../lib/supabase';
import { CurrencyField, PaymentMethod, usePaymentAccounts } from '../bookings/PaymentFields';

// The customer ledger's Add and Edit forms and its printed invoice, as the car
// customer sheet has always had them. The customer wallet uses the same ones.

export interface CustomerLedgerEntry {
  id: number;
  booking_id: number | null;
  customer_id: string | null;
  car_id: number | null;
  type: string | null;
  description: string | null;
  amount: number;
  direction: string;
  created_at: string;
  created_by: string | null;
  transaction_type: string | null;
  pay_method?: string | null;
  // joined via FK
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    nationality: string | null;
    id_number: string | null;
  } | null;
  bookings: {
    id: number;
    booking_number: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
}

/** Who and what the invoice is for: one booking's lines. */
export interface InvoiceCustomer {
  bookingNumber: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  nationality: string | null;
  id_number: string | null;
  entries: Array<Pick<CustomerLedgerEntry, 'created_at' | 'type' | 'description' | 'direction' | 'amount'>>;
  totalIn: number;
  totalOut: number;
}

export interface InvoiceCar {
  plate_number: string;
  model_name: string;
}

/** `hgsDetails` prints the HGS passes under their one line, as they were open in the wallet. */
export function printLedgerInvoice(cust: InvoiceCustomer, car: InvoiceCar | null, fmt: (amount: number) => string, options: { hgsDetails?: boolean } = {}): void {
  const invNum = `HC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const today  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalCharged = cust.totalOut;
  const totalPaid    = cust.totalIn;
  const balance      = totalCharged - totalPaid;
  const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const badge = (inbound: boolean) => `<span class="${inbound ? 'badge-in' : 'badge-out'}">${inbound ? '↓ IN' : '↑ OUT'}</span>`;
  // HGS prints as one line, its passes underneath behind "Show HGS details".
  const grouped = groupInvoiceEntries(cust.entries);
  const hasHgs = grouped.some((row) => row.kind === 'hgs');
  const rows = grouped.map((row) => {
    if (row.kind === 'line') {
      const e = row.entry;
      return `
    <tr>
      <td>${esc((e.created_at ?? '').slice(0, 10))}</td>
      <td>${esc(e.type ?? '—')}</td>
      <td style="color:#6b7280;max-width:200px">${esc(e.description ?? '—')}</td>
      <td>${badge(e.direction?.toUpperCase() === 'IN')}</td>
      <td>${fmt(e.amount)}</td>
    </tr>`;
    }
    const passes = row.passes.map(({ entry, info }) => `
    <tr class="hgs-detail">
      <td class="hgs-indent">${esc([info.day ?? '', info.time ?? ''].filter(Boolean).join(' '))}</td>
      <td></td>
      <td class="hgs-indent">${esc([info.route ?? 'HGS', info.toll].filter(Boolean).join(' · '))}</td>
      <td>${badge(entry.direction?.toUpperCase() === 'IN')}</td>
      <td>${fmt(entry.amount)}</td>
    </tr>`).join('');
    return `
    <tr class="hgs-sum">
      <td>${esc(row.first ?? '—')}</td>
      <td>hgs</td>
      <td style="color:#6b7280;max-width:200px">HGS · ${esc(row.summary)}</td>
      <td>${badge(row.net > 0)}</td>
      <td>${fmt(Math.abs(row.net))}</td>
    </tr>${passes}`;
  }).join('');
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>Invoice ${invNum} — Homesta Cars</title>
<style>
${standaloneFontCss()}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-sans);background:#f0f2f5;color:#0f1117;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.print-bar{text-align:center;padding:24px 0 16px;background:#f0f2f5}
.print-btn{padding:11px 32px;background:#4ba6ea;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:.3px;box-shadow:0 4px 12px rgba(75,166,234,.35)}
.print-btn:hover{background:#3a95d9}
.page{max-width:800px;margin:0 auto 48px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.10)}
.hdr{background:#fff;padding:36px 48px 32px;display:flex;justify-content:space-between;align-items:flex-start}
.brand-tag{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;padding-left:10px;margin-top:4px}
.inv-meta{text-align:right}
.inv-label{font-size:10px;font-weight:600;color:#4ba6ea;text-transform:uppercase;letter-spacing:2px}
.inv-number{font-size:28px;font-weight:600;color:#0f1117;margin-top:4px;letter-spacing:-.5px}
.inv-date{font-size:12px;color:#6b7280;margin-top:5px}
.accent{height:3px;background:linear-gradient(90deg,#4ba6ea 0%,#93d2ff 100%)}
.body{padding:40px 48px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:36px}
.info-section h4{font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
.info-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;gap:12px}
.info-key{font-size:11px;color:#9ca3af;white-space:nowrap}
.info-val{font-size:12px;font-weight:600;color:#0f1117;text-align:right}
.info-val.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.sec-title{font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
table{width:100%;border-collapse:collapse}
th{padding:9px 12px;font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;text-align:left;border-bottom:1.5px solid #f0f0f0}
th:last-child{text-align:right}
td{padding:11px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f9f9f9;vertical-align:middle}
td:last-child{text-align:right;font-weight:600;color:#0f1117;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.badge-in{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:600;color:#16a34a;background:rgba(34,197,94,.1)}
.badge-out{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:600;color:#dc2626;background:rgba(239,68,68,.1)}
.totals{margin-top:28px;display:flex;justify-content:flex-end}
.totals-box{width:280px;background:#f8f9fb;border-radius:12px;padding:20px 24px}
.t-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px;border-bottom:1px solid #eef0f2}
.t-row:last-child{border-bottom:none;border-top:2px solid #e5e7eb;margin-top:8px;padding-top:12px}
.t-lbl{color:#6b7280}
.t-val{font-weight:600;color:#0f1117;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.t-row.balance .t-lbl{font-weight:600;font-size:14px;color:#0f1117}
.t-row.balance .t-val{font-weight:600;font-size:16px;color:#4ba6ea}
.footer{padding:22px 48px;background:#f8f9fb;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0}
.footer-info{font-size:11px;color:#9ca3af;line-height:1.9;text-align:right}
.hgs-toggle{display:inline-flex;align-items:center;gap:8px;margin-left:16px;font-size:13px;color:#374151;cursor:pointer;vertical-align:middle}
.hgs-toggle input{width:16px;height:16px;accent-color:#4ba6ea}
.hgs-detail{display:none}
.show-hgs .hgs-detail{display:table-row}
.hgs-detail td{padding-top:6px;padding-bottom:6px;font-size:11px;color:#6b7280;background:#fafbfc}
.hgs-detail td:last-child{font-weight:500;color:#374151}
.hgs-indent{padding-left:28px!important}
@media print{body{background:#fff}.page{box-shadow:none;border-radius:0;margin:0;max-width:100%}.print-bar{display:none}}
</style>
</head>
<body${hasHgs && options.hgsDetails ? ' class="show-hgs"' : ''}>
<div class="print-bar"><button class="print-btn" onclick="window.print()">🖨&nbsp; Print Invoice</button>${hasHgs ? `<label class="hgs-toggle"><input type="checkbox"${options.hgsDetails ? ' checked' : ''} onchange="document.body.classList.toggle('show-hgs', this.checked)"> Show HGS details</label>` : ''}</div>
<div class="page">
<div class="hdr">
  <div>
    ${brandLockupHtml(36)}
    <div class="brand-tag">Premium Car Rental · Istanbul</div>
  </div>
  <div class="inv-meta">
    <div class="inv-label">Invoice</div>
    <div class="inv-number">${invNum}</div>
    <div class="inv-date">Issued ${today}</div>
  </div>
</div>
<div class="accent"></div>
<div class="body">
  <div class="info-grid">
    <div class="info-section">
      <h4>Billed To</h4>
      <div class="info-row"><span class="info-key">Full Name</span><span class="info-val">${`${cust.first_name} ${cust.last_name}`.trim()}</span></div>
      ${cust.nationality ? `<div class="info-row"><span class="info-key">Nationality</span><span class="info-val">${cust.nationality}</span></div>` : ''}
      ${cust.id_number   ? `<div class="info-row"><span class="info-key">ID / Passport</span><span class="info-val">${cust.id_number}</span></div>` : ''}
      ${cust.phone       ? `<div class="info-row"><span class="info-key">Phone</span><span class="info-val">${cust.phone}</span></div>` : ''}
    </div>
    <div class="info-section">
      <h4>Vehicle</h4>
      <div class="info-row"><span class="info-key">Plate Number</span><span class="info-val mono">${car?.plate_number ?? '—'}</span></div>
      <div class="info-row"><span class="info-key">Model</span><span class="info-val">${car?.model_name ?? '—'}</span></div>
      <div class="info-row"><span class="info-key">Booking</span><span class="info-val mono">${cust.bookingNumber}</span></div>
      <div class="info-row"><span class="info-key">Transactions</span><span class="info-val">${cust.entries.length} item${cust.entries.length !== 1 ? 's' : ''}</span></div>
    </div>
  </div>
  <div class="sec-title">Transaction Details</div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Direction</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="totals-box">
      <div class="t-row"><span class="t-lbl">Total Charged</span><span class="t-val">${fmt(totalCharged)}</span></div>
      <div class="t-row"><span class="t-lbl">Total Paid</span><span class="t-val">${fmt(totalPaid)}</span></div>
      <div class="t-row balance"><span class="t-lbl">Balance Due</span><span class="t-val">${fmt(Math.abs(balance))}</span></div>
    </div>
  </div>
</div>
<div class="footer">
  ${brandImgHtml('icon', '28px')}
  <div class="footer-info">
    Şişli &amp; Kayaşehir, Istanbul, Turkey<br>
    Premium Car Rental Since 2025<br>
    This document serves as an official invoice.
  </div>
</div>
</div>
</body></html>`;
  // Opened inside the click, before the logo is embedded, or the browser blocks it.
  const win = window.open('', '_blank', 'width=920,height=780');
  if (win) void writeBrandedDocument(win, html);
}

const TX_TYPE_PRESETS = ['deposit', 'rental', 'payment', 'hgs', 'delivery'] as const;
type TxTypePreset = typeof TX_TYPE_PRESETS[number];

const TX_TYPE_DIRECTION: Record<TxTypePreset, 'in' | 'out'> = {
  deposit:  'in',
  rental:   'out',
  payment:  'in',
  hgs:      'out',
  delivery: 'out',
};

interface AddCustomerTxForm {
  date:        string;
  typePreset:  string;  // '' | TxTypePreset | 'other'
  typeCustom:  string;  // used when typePreset === 'other'
  description: string;
  amount:      string;
  direction:   'in' | 'out';
}

const EMPTY_CUST_TX_FORM: AddCustomerTxForm = {
  date:        new Date().toISOString().slice(0, 10),
  typePreset:  '',
  typeCustom:  '',
  description: '',
  amount:      '',
  direction:   'in',
};

export const AddCustomerTxModal: React.FC<{
  customerName: string;
  customerId:   string;
  carId:        number;
  bookingId:    number;
  bookingLabel?: string;
  carPlate?:    string;
  onClose:      () => void;
  onSaved:      () => void;
}> = ({ customerName, customerId, carId, bookingId, bookingLabel, carPlate, onClose, onSaved }) => {
  const [form,   setForm]   = useState<AddCustomerTxForm>(EMPTY_CUST_TX_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentChoice>(NEW_PAYMENT);
  const accounts = usePaymentAccounts();
  const { rates } = useCurrency();
  // An admin may record the amount alone. The database lets only admins skip the method.
  const { profile } = useCurrentProfile();
  const methodOptional = profile?.role === 'admin';
  // Money coming in has its own form. Charges and refunds stay as they were.
  // Typed by hand as "Other" it's still money received, so it takes the same road.
  const typedType = (form.typePreset === 'other' ? form.typeCustom : form.typePreset).trim().toLowerCase();
  const paymentType = typedType === 'payment' || typedType === 'deposit' ? typedType : null;
  const paymentIssue = paymentType ? paymentProblem(payment, accounts.list, rates, methodOptional) : null;

  const set = (k: keyof AddCustomerTxForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleTypePresetChange = (preset: string) => {
    const dir = TX_TYPE_DIRECTION[preset as TxTypePreset];
    setForm(prev => ({ ...prev, typePreset: preset, direction: dir ?? prev.direction }));
  };

  const canSave = !saving && !paymentIssue;

  const handleSave = async () => {
    const amount    = parseFloat(form.amount);
    const typeValue = form.typePreset === 'other' ? (form.typeCustom.trim() || null) : (form.typePreset || null);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    if (paymentType) {
      if (paymentIssue) { setError(paymentIssue); return; }
      setSaving(true);
      setError(null);
      try {
        const result = await recordCustomerPayment({ bookingId, type: paymentType, amount, choice: payment, note: form.description });
        showEnvelopes(envelopeReceipt(result));
        onSaved();
        onClose();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The payment was not saved.');
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    // booking_id, customer_id and car_id are all NOT NULL on customer_accounting_ledger
    // and come straight from the booking this sheet represents — no manual picking.
    const { error: err } = await supabase.from('customer_accounting_ledger').insert({
      booking_id:   bookingId,
      customer_id:  customerId,
      car_id:       carId,
      type:         typeValue,
      amount,
      direction:    form.direction.toUpperCase(),
      description:  form.description || null,
      created_at:   form.date,                // date column on this table
      created_by:   user?.id ?? null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const selectArrow = `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f1117' }}>Add Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{customerName}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Booking context (auto-filled from the sheet — not editable) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Booking</div>
            <div style={{ fontSize: 12, color: '#374151', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '9px 12px' }}>
              {bookingLabel ?? '—'}
              {carPlate ? <span className="font-mono tabular-nums" style={{ color: '#9ca3af' }}>{` · ${carPlate}`}</span> : null}
            </div>
          </div>

          {/* Date + Direction row */}
          <div style={{ display: paymentType ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Direction</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'out'] as const).map(d => (
                  <button key={d} onClick={() => set('direction', d)} style={{
                    flex: 1, height: 38, borderRadius: 9,
                    border: `1.5px solid ${form.direction === d ? (d === 'in' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                    background: form.direction === d ? (d === 'in' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                    color: form.direction === d ? (d === 'in' ? '#16a34a' : '#dc2626') : '#6b7280',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease',
                  }}>
                    {d === 'in' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
            <select
              value={form.typePreset}
              onChange={e => handleTypePresetChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as React.CSSProperties['appearance'], backgroundImage: selectArrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32, color: form.typePreset ? '#0f1117' : '#9ca3af' }}
              onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
            >
              <option value="" disabled>Select transaction type...</option>
              <option value="deposit">Deposit</option>
              <option value="rental">Rental</option>
              <option value="payment">Payment</option>
              <option value="hgs">HGS</option>
              <option value="delivery">Delivery</option>
              <option value="other">Other</option>
            </select>
            {form.typePreset === 'other' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom type</div>
                <input type="text" placeholder="Enter custom type…" value={form.typeCustom} onChange={e => set('typeCustom', e.target.value)} style={inputStyle}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount ({paymentType ? payment.currency : 'TRY'})</div>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inputStyle}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {paymentType && (
            <div className="media-scope grid grid-cols-1 gap-3">
              <div><CurrencyField value={payment.currency} onChange={(currency) => setPayment({ ...payment, currency })} /></div>
              {equivalentLabel(parseFloat(form.amount) || 0, payment.currency, rates) && (
                <p className="text-[12.5px] tabular-nums text-black/55">{equivalentLabel(parseFloat(form.amount) || 0, payment.currency, rates)}</p>
              )}
              <PaymentMethod choice={payment} accounts={accounts} onChange={setPayment} optional={methodOptional} />
            </div>
          )}

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
            <textarea placeholder="Optional note…" value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB', background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              style={{ padding: '9px 20px', fontSize: 13, fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Add Transaction'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const EditTxModal: React.FC<{
  entry:   CustomerLedgerEntry;
  onClose: () => void;
  onSaved: () => void;
}> = ({ entry, onClose, onSaved }) => {
  const savedType    = entry.type ?? '';
  const initPreset   = (TX_TYPE_PRESETS as readonly string[]).includes(savedType) ? savedType : (savedType ? 'other' : '');
  const initCustom   = initPreset === 'other' ? savedType : '';

  const [form,   setForm]   = useState<AddCustomerTxForm>({
    date:        entry.created_at.slice(0, 10),
    typePreset:  initPreset,
    typeCustom:  initCustom,
    description: entry.description ?? '',
    amount:      String(entry.amount),
    direction:   (entry.direction?.toLowerCase() ?? 'in') as 'in' | 'out',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof AddCustomerTxForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleTypePresetChange = (preset: string) => {
    const dir = TX_TYPE_DIRECTION[preset as TxTypePreset];
    setForm(prev => ({ ...prev, typePreset: preset, direction: dir ?? prev.direction }));
  };

  const handleSave = async () => {
    const amount    = parseFloat(form.amount);
    const typeValue = form.typePreset === 'other' ? (form.typeCustom.trim() || null) : (form.typePreset || null);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('customer_accounting_ledger')
      .update({
        created_at:  form.date,
        type:        typeValue,
        description: form.description || null,
        amount,
        direction:   form.direction.toUpperCase(),
      })
      .eq('id', entry.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const selectArrow = `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

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

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date + Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Direction</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'out'] as const).map(d => (
                  <button key={d} onClick={() => set('direction', d)} style={{
                    flex: 1, height: 38, borderRadius: 9,
                    border: `1.5px solid ${form.direction === d ? (d === 'in' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                    background: form.direction === d ? (d === 'in' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                    color: form.direction === d ? (d === 'in' ? '#16a34a' : '#dc2626') : '#6b7280',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease',
                  }}>
                    {d === 'in' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
            <select
              value={form.typePreset}
              onChange={e => handleTypePresetChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as React.CSSProperties['appearance'], backgroundImage: selectArrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32, color: form.typePreset ? '#0f1117' : '#9ca3af' }}
              onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
            >
              <option value="" disabled>Select transaction type...</option>
              <option value="deposit">Deposit</option>
              <option value="rental">Rental</option>
              <option value="payment">Payment</option>
              <option value="hgs">HGS</option>
              <option value="delivery">Delivery</option>
              <option value="other">Other</option>
            </select>
            {form.typePreset === 'other' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom type</div>
                <input type="text" placeholder="Enter custom type…" value={form.typeCustom} onChange={e => set('typeCustom', e.target.value)} style={inputStyle}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (TRY)</div>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inputStyle}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
            <textarea placeholder="Optional note…" value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }} />
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
