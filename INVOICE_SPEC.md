# Customer Invoice / Print — Technical Spec

> Reference implementation source: [`src/pages/AccountingPage.tsx`](src/pages/AccountingPage.tsx), component `CarCustomerSheetPage`, function `printInvoice` (around line 2741). Currency formatting: [`src/lib/CurrencyContext.tsx`](src/lib/CurrencyContext.tsx). Supabase client: [`src/lib/supabase.ts`](src/lib/supabase.ts).
>
> This document is self-contained: a developer with no access to this repo can rebuild the identical invoice from it alone. This is the **CRA (Create React App)** implementation. Porting notes for **Next.js** are in section 6.

---

## 1. Overview

The invoice feature is part of the **Car Customer Sheet** detail page — the per-car breakdown reached from the Accounting page's "Customer Sheets" tab.

**Route:** `accounting/customer-sheet/:carId` → renders `CarCustomerSheetPage` (registered in [`src/App.tsx:70`](src/App.tsx#L70)).

End-to-end flow:

1. The page loads one car (by `:carId`) and all of that car's **customer accounting ledger** entries, then loads the distinct customers referenced by those entries.
2. Ledger entries are grouped per customer into `CustGroup` objects, each carrying the customer's entries plus computed `totalIn`, `totalOut`, and `balance`.
3. Each customer renders as an expandable card. When expanded, it shows an **"Invoice"** button (label in JSX is `Invoice`; the button inside the printed page reads "Print Invoice").
4. Clicking it calls `printInvoice(cust)` with that customer's `CustGroup`.
5. `printInvoice` builds a **complete standalone HTML document string** (inline CSS, no external assets), generates an invoice number and issue date on the fly, renders one table row per ledger entry, and computes the three totals.
6. It opens a **new browser popup window** (`window.open`), writes the HTML into it (`document.write` + `document.close`), and closes the stream. The written document contains its own "Print Invoice" button that calls `window.print()`. The user clicks it (or uses Ctrl/Cmd-P) to print. A `@media print` block hides the button and strips the card chrome for a clean printed page.

There is **no PDF generation, no server round-trip, and no persistence** — nothing about the invoice is saved to the database. The invoice number is ephemeral, generated at click time.

---

## 2. Data

### 2.1 Tables & columns read

All table/column names are lowercase (project rule). The page reads four tables.

**`cars`** — the vehicle for the sheet. Columns selected:
- `id`
- `plate_number`
- `model_group:model_group_id(name)` — a foreign-key embed of the related `model_group` row, aliased as `model_group`, pulling only its `name`.

**`model_group`** — read only via the embed above; only `name` is used. (`model_group_id` on `cars` is the FK.)

**`customer_accounting_ledger`** — the ledger entries for the car. `select('*')` (all columns) **plus** an embed of `bookings`. The columns actually consumed downstream (see the `CustomerLedgerEntry` interface, lines 23–50):
- `id` (number)
- `booking_id` (number | null)
- `customer_id` (string | null) — UUID FK to `customers`
- `car_id` (number | null)
- `type` (string | null) — shown in the invoice "Type" column
- `description` (string | null) — shown in the "Description" column
- `amount` (number) — stored in **TRY** (see §5)
- `direction` (string) — `'IN'` or `'OUT'` (compared case-insensitively via `.toUpperCase()`)
- `created_at` (string, ISO timestamp) — invoice row date uses `created_at.slice(0,10)` → `YYYY-MM-DD`
- `created_by` (string | null) — not shown on invoice
- `transaction_type` (string | null) — not shown on invoice
- Embedded `bookings` (`id, booking_number, start_date, end_date`) — fetched but **not used** by the invoice itself.

**`customers`** — the people. Fetched separately (second round-trip) filtered by the customer IDs found in the ledger. Columns selected:
- `id` (string UUID)
- `first_name` (string)
- `last_name` (string)
- `phone` (string | null)
- `nationality` (string | null)
- `id_number` (string | null)

`first_name` + `last_name` are the "Full Name". `nationality`, `id_number`, `phone` render conditionally in the "Billed To" block.

### 2.2 Exact queries

From `loadData` (lines 2680–2709), verbatim:

```ts
const loadData = async () => {
  const [carRes, ledgerRes] = await Promise.all([
    supabase.from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .eq('id', carId)
      .single(),
    supabase.from('customer_accounting_ledger')
      .select('*, bookings(id, booking_number, start_date, end_date)')
      .eq('car_id', carId)
      .order('created_at', { ascending: false }),
  ]);
  const raw = carRes.data as any;
  const mg  = raw?.model_group;
  setCar({ id: raw?.id ?? carId, plate_number: raw?.plate_number ?? '—', model_name: Array.isArray(mg) ? (mg[0]?.name ?? '—') : (mg?.name ?? '—') });

  const entries = (ledgerRes.data ?? []) as CustomerLedgerEntry[];
  setLedger(entries);

  const custIds = [...new Set(entries.map(e => e.customer_id).filter((id): id is string => id != null))];
  if (custIds.length > 0) {
    const { data: custData } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, nationality, id_number')
      .in('id', custIds);
    setCustomers((custData ?? []) as CustomerRow[]);
  } else {
    setCustomers([]);
  }
  setLoading(false);
};
```

Notes:
- The car query uses `.single()` and the FK embed `model_group:model_group_id(name)`. The embed may come back as an object or a single-element array depending on relationship inference, hence the `Array.isArray(mg)` guard.
- Ledger is ordered **newest first** (`created_at` descending). The invoice table preserves this order (no re-sort in `printInvoice`).
- Customers are loaded in a **second, dependent** query using `.in('id', custIds)` where `custIds` is the deduped set of non-null `customer_id`s. This is a deliberate two-step fetch (not a single embed).

### 2.3 Grouping into `CustGroup`

`printInvoice` receives a `CustGroup`. That object is built in the `customerGroups` memo (lines 2717–2724):

```ts
const customerGroups = useMemo((): CustGroup[] =>
  customers.map(c => {
    const entries  = ledger.filter(e => e.customer_id === c.id);
    const totalIn  = entries.filter(e => e.direction?.toUpperCase() === 'IN' ).reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = entries.filter(e => e.direction?.toUpperCase() === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
    return { ...c, entries, totalIn, totalOut, balance: totalIn - totalOut };
  }).sort((a, b) => b.balance - a.balance),
[customers, ledger]);
```

`CustGroup` type (lines 2649–2660):

```ts
interface CustGroup {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  nationality: string | null;
  id_number: string | null;
  entries: CustomerLedgerEntry[];
  totalIn: number;
  totalOut: number;
  balance: number;
}
```

### 2.4 Totals — exact formulas

Two layers compute the same idea.

**On the group** (used across the whole page): for a customer's entries,
- `totalIn`  = Σ `amount` over entries where `direction.toUpperCase() === 'IN'`
- `totalOut` = Σ `amount` over entries where `direction.toUpperCase() === 'OUT'`
- `balance`  = `totalIn − totalOut`

**Inside `printInvoice`** (lines 2744–2746), the invoice re-labels these:

```ts
const totalCharged = cust.totalOut;   // money the customer owes / was charged
const totalPaid    = cust.totalIn;    // money the customer paid in
const balance      = totalCharged - totalPaid;   // = totalOut - totalIn
```

So on the invoice:
- **Total Charged** = `cust.totalOut`
- **Total Paid** = `cust.totalIn`
- **Balance Due** = `totalCharged − totalPaid` = `cust.totalOut − cust.totalIn` (this is the **negation** of the group's `balance`, which is `totalIn − totalOut`).

The printed "Balance Due" value uses **`Math.abs(balance)`** — it is always shown as a positive magnitude, with no sign and no "who owes whom" indicator.

> ⚠️ Semantics gotcha to preserve when porting: the invoice's `balance` is `OUT − IN`, i.e. the opposite sign convention from the page's hero/card `balance` (`IN − OUT`). The printed number is `Math.abs`, so sign is discarded regardless.

### 2.5 Invoice number & issue date

Lines 2742–2743:

```ts
const invNum = `HC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
const today  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
```

- **Invoice number** format: `HC-{4-digit-year}-{last-5-digits-of-epoch-ms}`.
  - `new Date().getFullYear()` → e.g. `2026`.
  - `Date.now()` → milliseconds since epoch; `String(...).slice(-5)` keeps the **last 5 characters**. Example: `HC-2026-84713`.
  - This is **not** a stored/sequential counter — it is quasi-random (derived from the current millisecond clock) and **not guaranteed unique** (collisions possible if two invoices are printed within the same `…X0000`–`…X9999` window; also purely time-based). It is never written back to the DB.
- **Issue date** (`today`): `toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })` → e.g. `13 July 2026` (day-month-year, full month name, British English locale).

---

## 3. The generated HTML

`printInvoice` builds three pieces before the template:

1. **`rows`** — the `<tbody>` HTML, one `<tr>` per ledger entry (lines 2747–2754):

```ts
const rows = cust.entries.map(e => `
  <tr>
    <td>${e.created_at.slice(0, 10)}</td>
    <td>${e.type ?? '—'}</td>
    <td style="color:#6b7280;max-width:200px">${e.description ?? '—'}</td>
    <td><span class="${e.direction?.toUpperCase() === 'IN' ? 'badge-in' : 'badge-out'}">${e.direction?.toUpperCase() === 'IN' ? '↓ IN' : '↑ OUT'}</span></td>
    <td>${fmt(e.amount)}</td>
  </tr>`).join('');
```

Per row: date (`YYYY-MM-DD`), `type` (or em-dash), `description` (muted grey, capped at 200px, or em-dash), a colored **IN/OUT badge** (`↓ IN` green / `↑ OUT` red), and the formatted amount (`fmt`, see §5). Entries appear in `created_at`-descending order (as loaded).

2. **`invNum`** and **`today`** — from §2.5.

3. **totals** — from §2.4.

### 3.1 The complete HTML template string (verbatim)

This is the entire `html` template literal (lines 2755–2856), reproduced exactly. `${...}` placeholders are JS interpolations described above.

```html
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>Invoice ${invNum} — HomestaCars</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;background:#f0f2f5;color:#0f1117;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-bar{text-align:center;padding:24px 0 16px;background:#f0f2f5}
  .print-btn{padding:11px 32px;background:#4ba6ea;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;box-shadow:0 4px 12px rgba(75,166,234,.35)}
  .print-btn:hover{background:#3a95d9}
  .page{max-width:800px;margin:0 auto 48px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.10)}
  .hdr{background:linear-gradient(135deg,#0d1117 0%,#1c2a3a 100%);padding:40px 48px;display:flex;justify-content:space-between;align-items:flex-start}
  .brand-name{font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px}
  .brand-dot{color:#4ba6ea}
  .brand-tag{font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px;margin-top:5px}
  .inv-meta{text-align:right}
  .inv-label{font-size:10px;font-weight:700;color:#4ba6ea;text-transform:uppercase;letter-spacing:2px}
  .inv-number{font-size:28px;font-weight:800;color:#fff;margin-top:4px;letter-spacing:-.5px}
  .inv-date{font-size:12px;color:rgba(255,255,255,.45);margin-top:5px}
  .accent{height:3px;background:linear-gradient(90deg,#4ba6ea 0%,#93d2ff 100%)}
  .body{padding:40px 48px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:36px}
  .info-section h4{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
  .info-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;gap:12px}
  .info-key{font-size:11px;color:#9ca3af;white-space:nowrap}
  .info-val{font-size:12px;font-weight:600;color:#0f1117;text-align:right}
  .sec-title{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
  table{width:100%;border-collapse:collapse}
  th{padding:9px 12px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;text-align:left;border-bottom:1.5px solid #f0f0f0}
  th:last-child{text-align:right}
  td{padding:11px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f9f9f9;vertical-align:middle}
  td:last-child{text-align:right;font-weight:600;color:#0f1117}
  .badge-in{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;color:#16a34a;background:rgba(34,197,94,.1)}
  .badge-out{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;color:#dc2626;background:rgba(239,68,68,.1)}
  .totals{margin-top:28px;display:flex;justify-content:flex-end}
  .totals-box{width:280px;background:#f8f9fb;border-radius:12px;padding:20px 24px}
  .t-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px;border-bottom:1px solid #eef0f2}
  .t-row:last-child{border-bottom:none;border-top:2px solid #e5e7eb;margin-top:8px;padding-top:12px}
  .t-lbl{color:#6b7280}
  .t-val{font-weight:600;color:#0f1117}
  .t-row.balance .t-lbl{font-weight:800;font-size:14px;color:#0f1117}
  .t-row.balance .t-val{font-weight:800;font-size:16px;color:#4ba6ea}
  .footer{padding:22px 48px;background:#f8f9fb;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0}
  .footer-brand{font-size:14px;font-weight:800;color:#0f1117}
  .footer-info{font-size:11px;color:#9ca3af;line-height:1.9;text-align:right}
  @media print{body{background:#fff}.page{box-shadow:none;border-radius:0;margin:0;max-width:100%}.print-bar{display:none}}
</style>
</head>
<body>
<div class="print-bar"><button class="print-btn" onclick="window.print()">🖨&nbsp; Print Invoice</button></div>
<div class="page">
  <div class="hdr">
    <div>
      <div class="brand-name">Homesta<span class="brand-dot">Cars</span></div>
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
        <div class="info-row"><span class="info-key">Plate Number</span><span class="info-val">${car?.plate_number ?? '—'}</span></div>
        <div class="info-row"><span class="info-key">Model</span><span class="info-val">${car?.model_name ?? '—'}</span></div>
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
    <div class="footer-brand">HomestaCars</div>
    <div class="footer-info">
      Şişli &amp; Kayaşehir, Istanbul, Turkey<br>
      Premium Car Rental Since 2025<br>
      This document serves as an official invoice.
    </div>
  </div>
</div>
</body></html>
```

### 3.2 Section-by-section explanation

**`.print-bar` + `.print-btn`** — A screen-only toolbar above the invoice card holding the blue "🖨 Print Invoice" button. Its `onclick` is inline `window.print()`. Hidden in print via `@media print{.print-bar{display:none}}`.

**`.page`** — The invoice "sheet": max-width 800px, centered, white, rounded 18px, drop shadow. In print, shadow/radius/margins are removed and it spans full width.

**`.hdr` (header)** — Dark gradient bar (`#0d1117 → #1c2a3a`). Left: brand wordmark `Homesta` + blue `Cars` (`.brand-dot` = `#4ba6ea`) and the tagline "Premium Car Rental · Istanbul". Right (`.inv-meta`): the "Invoice" label, the `${invNum}`, and "Issued ${today}".

**`.accent`** — A 3px blue→light-blue gradient rule directly under the header.

**`.body` → `.info-grid`** — Two equal columns:
- **Billed To**: Full Name (always, from `first_name`+`last_name` trimmed). Nationality, ID / Passport (`id_number`), and Phone each render **only if** the value is truthy (conditional interpolation).
- **Vehicle**: Plate Number (`car.plate_number`), Model (`car.model_name`), and a "Transactions" count with singular/plural `item`/`items`.

**`.sec-title` "Transaction Details" + `<table>`** — Five columns: Date, Type, Description, Direction, Amount. Header note: the CSS `th:last-child{text-align:right}` and `td:last-child{text-align:right}` right-align the **Amount** column; the `<th>` labels are `Date/Type/Description/Direction/Amount` while the data cells produced by `rows` are date / type / description / **badge** / amount. Body is the `rows` string from §3.1. `.badge-in` (green) / `.badge-out` (red) style the direction pills.

**`.totals` → `.totals-box`** — Right-aligned 280px card: Total Charged, Total Paid, and a visually emphasized **Balance Due** row (`.t-row.balance` — heavier weight, blue value, top border separator).

**`.footer`** — Left: `HomestaCars` wordmark. Right: fixed company info — "Şişli & Kayaşehir, Istanbul, Turkey", "Premium Car Rental Since 2025", "This document serves as an official invoice."

### 3.3 Logo / branding assets

**There are no image assets.** All branding is pure text + CSS:
- Wordmark "Homesta**Cars**" is HTML text; the "Cars" half is colored with `.brand-dot { color:#4ba6ea }`.
- The only "icon" is the 🖨 **emoji** inside the screen-only print button.
- Brand color `#4ba6ea` (project brand) is hardcoded throughout (header accent, invoice label, balance value, button).
- Header/footer/company strings are hardcoded literals in the template. Nothing is loaded from disk, a CDN, or Supabase Storage. This makes the document fully self-contained and printable offline.

---

## 4. The print mechanism

Verbatim (lines 2857–2858):

```ts
const win = window.open('', '_blank', 'width=920,height=780');
if (win) { win.document.write(html); win.document.close(); }
```

And the in-document trigger (inside the template, line 2804):

```html
<div class="print-bar"><button class="print-btn" onclick="window.print()">🖨&nbsp; Print Invoice</button></div>
```

Mechanism details:

- **Open**: `window.open('', '_blank', 'width=920,height=780')` opens a **blank popup** (empty URL) in a new window sized 920×780. Because it's triggered synchronously inside the button's click handler, popup blockers generally allow it.
- **Popup-blocked guard**: `if (win)` — if the browser blocked the popup, `window.open` returns `null` and the code does nothing (no error, no fallback, no user message). Worth improving when porting (see §6).
- **Write**: `win.document.write(html)` injects the full document string into the new window. `win.document.close()` closes the document output stream, which finalizes parsing and fires the load lifecycle.
- **Print trigger**: printing is **manual / user-driven**. There is **no** automatic `win.print()` call, **no** `onload` handler, and **no** `setTimeout`. The user prints by clicking the in-page "🖨 Print Invoice" button (which runs `window.print()` in the popup's own context) or via the browser's native print shortcut. The popup is **not** auto-closed after printing.
- **No timing dependence**: since there are no external assets (images/fonts/stylesheets), there's nothing to await — `document.close()` is sufficient and the content is immediately printable.

---

## 5. Currency & formatting

### 5.1 Money — the `fmt` formatter

The invoice uses `fmt` from the currency context, obtained at the top of the component:

```ts
const { fmt } = useCurrency();   // from '../lib/CurrencyContext'
```

Amounts in `customer_accounting_ledger.amount` are stored in **TRY**. `fmt` converts a TRY amount into the **user's currently selected display currency** and formats it with the right symbol and locale. Full implementation ([`src/lib/CurrencyContext.tsx`](src/lib/CurrencyContext.tsx)):

```ts
const convert = (tryAmount: number): number => {
  if (currency === 'TRY') return tryAmount;
  const rate = rates.find(r => r.currency === currency)?.rate_to_try;
  if (!rate || rate === 0) return tryAmount; // fallback if rates not loaded yet
  return tryAmount / rate;
};

const fmt = (tryAmount: number): string => {
  const converted = convert(Math.abs(tryAmount));
  let formatted: string;
  if (currency === 'TRY') {
    formatted = converted.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (currency === 'LYD') {
    formatted = converted.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  } else {
    formatted = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return symbol + formatted;
};
```

Key facts:
- **Always positive**: `fmt` applies `Math.abs`, so it never prints a minus sign. (Sign/direction is conveyed by the IN/OUT badge, not the number.)
- **Supported currencies**: `TRY '₺'`, `USD '$'`, `EUR '€'`, `LYD 'LD'` (`CURRENCY_SYMBOLS`). Symbol is **prepended** with no space (e.g. `₺1.234,56`, `$1,234.56`, `LD1,234.560`).
- **Locale/decimals**:
  - `TRY` → `tr-TR` locale, 2 decimals (Turkish grouping: `.` thousands, `,` decimal → `₺12.345,67`).
  - `LYD` → `en-US` locale, **3 decimals**.
  - `USD`/`EUR` (the `else`) → `en-US` locale, 2 decimals (`,` thousands, `.` decimal).
- **Exchange rates** come from the Supabase table **`exchange_rates`** (`currency, rate_to_try`), loaded once by `CurrencyProvider` on mount. `rate_to_try` is "how many TRY per 1 unit of that currency"; conversion divides (`tryAmount / rate`). If rates aren't loaded yet or rate is 0, it **falls back to the raw TRY number** (but still shows the selected currency's symbol — a known edge case during the brief pre-load window).
- **Selected currency** is persisted in `localStorage` under key `hc_currency` (default `'TRY'`).
- A **default context** exists so `fmt` works even outside a provider: `defaultFmt` = `'₺' + Math.abs(n).toLocaleString('tr-TR', {min/max 2})`.

### 5.2 Dates

- **Invoice row dates**: `e.created_at.slice(0, 10)` → the first 10 chars of the ISO timestamp = `YYYY-MM-DD` (raw, no locale conversion, effectively UTC calendar date as stored).
- **Issue date** (`today`): `new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })` → e.g. `13 July 2026`. Locale `en-GB` (day-first, English month names).

### 5.3 Locale summary

| Element            | Locale    | Format example         |
|--------------------|-----------|------------------------|
| TRY amount         | `tr-TR`   | `₺12.345,67`           |
| USD/EUR amount     | `en-US`   | `$12,345.67`           |
| LYD amount         | `en-US`   | `LD12,345.678` (3 dp)  |
| Invoice issue date | `en-GB`   | `13 July 2026`         |
| Row date           | (none)    | `2026-07-13`           |

---

## 6. Porting notes for Next.js (TEAM dashboard)

The invoice logic is 95% framework-agnostic string building. The friction is all around **browser-only APIs** and **this project's providers**. Checklist:

### 6.1 Client-only execution — `'use client'` + window guards

`printInvoice` uses `window.open`, `window.print` (in the popup), `Date.now()`, `new Date()`, and `localStorage` (indirectly via the currency provider). None of these exist during SSR.

- Put the invoice button / handler in a **Client Component**: add `'use client'` at the top of the file. `window.open` inside an `onClick` only runs in the browser, so no explicit guard is strictly required — but if you ever call the generator during render or in a Server Component, it will crash.
- If you factor the HTML builder into a shared util that could be imported server-side, keep the `window.open(...)` call itself inside a click handler / `if (typeof window !== 'undefined')` guard. The pure string-building part (template + totals + invoice number) is safe to run anywhere, but `Date.now()`/`new Date()` make output non-deterministic, so never call it during SSR/prerender (hydration-mismatch risk if rendered into the DOM). Here it's only used to write a **detached popup document**, so hydration isn't a concern.

### 6.2 The `Date`/`Date.now` invoice number

`HC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}` is fine in a client handler. Two things to decide for the TEAM app:
- If you want **stable, unique, sequential** invoice numbers, replace this with a DB-backed counter / sequence (e.g. a Postgres sequence or an `invoices` table). The current scheme is ephemeral and collision-prone.
- Keep it identical if you only need a visual reference number.

### 6.3 Currency context substitution

`fmt` comes from `useCurrency()` in [`src/lib/CurrencyContext.tsx`](src/lib/CurrencyContext.tsx), which:
- reads `localStorage['hc_currency']`,
- fetches the `exchange_rates` table via the CRA Supabase singleton,
- is provided by `<CurrencyProvider>` high in the CRA tree.

To port, you must **recreate or substitute this provider** in Next.js:
- Port `CurrencyContext.tsx` as a Client Component provider (`'use client'`), wrap it around the relevant layout/tree, and ensure the `exchange_rates` table (columns `currency`, `rate_to_try`) exists in the TEAM Supabase project. `localStorage` access is already `try/catch`-guarded, so it's SSR-tolerant as written, but the provider still must be a client component.
- **Or** substitute a simpler formatter if the TEAM app doesn't do multi-currency. Minimal drop-in replacement matching current TRY-default behavior:
  ```ts
  const fmt = (n: number) => '₺' + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ```
  Whatever you use, remember `fmt` must accept a TRY-denominated number and return `symbol + localized string`, and it applies `Math.abs`.

### 6.4 Supabase client

CRA uses `process.env.REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` ([`src/lib/supabase.ts`](src/lib/supabase.ts)). In Next.js:
- Client-side env vars must be prefixed **`NEXT_PUBLIC_`** (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), not `REACT_APP_`.
- The queries themselves (`from('cars')…`, `from('customer_accounting_ledger')…`, `from('customers')…`) are portable verbatim, provided the TEAM Supabase project has the same tables/columns and RLS permits reading them. Since this data fetch could run in a Server Component in Next.js, you may prefer `@supabase/ssr` server client for the loads and pass the resulting `CustGroup` + `car` down to the client button — but the existing client-side `useEffect` fetch also works unchanged inside a `'use client'` component.
- The `model_group:model_group_id(name)` embed and the `Array.isArray(mg)` guard should be kept.

### 6.5 Router / params

CRA uses `react-router-dom` (`useParams`, `useNavigate`) with route `accounting/customer-sheet/:carId`. In Next.js App Router:
- Route becomes a segment like `app/accounting/customer-sheet/[carId]/page.tsx`; read `carId` from the `params` prop (server) or `useParams()` from `next/navigation` (client).
- Replace `useNavigate('/dashboard/accounting')` with `useRouter().push(...)` from `next/navigation` (or a `<Link>`).

### 6.6 Things that need NO change

- The entire HTML/CSS template string, including `@media print`.
- The IN/OUT badge logic, totals math, singular/plural "item(s)", conditional Billed-To rows.
- The `window.open` → `document.write` → `document.close` print mechanism (works identically in any browser; it's client-only regardless of framework).
- No images/fonts/CDN assets to migrate — the document is fully self-contained.

### 6.7 Optional hardening to consider during the port

Not present in the current code, but low-risk improvements:
- **Popup-blocked UX**: the current `if (win)` silently no-ops. Consider a toast/fallback (e.g. render into a hidden iframe, or open a Blob URL) when `win` is null.
- **HTML-escaping**: customer-supplied fields (`first_name`, `last_name`, `description`, `nationality`, `id_number`, `phone`, plate/model) are interpolated **raw** into HTML. In the current trusted-admin context this is acceptable, but for defense-in-depth, escape `<`, `>`, `&`, `"` before interpolation to avoid broken markup / injection from unexpected data.
