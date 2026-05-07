# Print Contract — Feature Export

## Files in this folder

| File | Origin | Description |
|------|--------|-------------|
| `printContract.ts` | `src/lib/printContract.ts` | **Exact copy.** The entire feature lives here: types, helpers, 15-clause trilingual terms, BONO section, HTML builder, print CSS, and the exported `printBookingContract()` function. |
| `supabase.ts` | `src/lib/supabase.ts` | **Exact copy.** The only import that `printContract.ts` depends on. Creates the Supabase client from env vars. |
| `BookingsPage-PrintIntegration.txt` | Extracted from `src/pages/BookingsPage.tsx` | **Snippets only** (with original line numbers). Shows the import, `ActionBtn` wrapper, `onPrint` prop wiring, the print icon button, and the call site. The rest of `BookingsPage.tsx` is unrelated to printing. |
| `DEPENDENCIES.md` | — | npm packages this feature needs, plus the Google Fonts CDN detail. |
| `README.md` | — | This file. |

---

## How print is triggered

1. The user clicks the **printer icon** in the Actions column of any booking row (`BookingsPage.tsx` line 379).
2. The click calls `printBookingContract(booking)` (line 2606), passing the full `Booking` object which satisfies the `ContractBooking` interface.
3. `printBookingContract()` does a **single Supabase query** to `customers` to fetch extended fields (address, license issue date, nationality, etc.) that aren't loaded on the bookings list.
4. `buildHTML()` assembles a **complete self-contained HTML document** (inlined CSS, Google Fonts link, all text). No React is involved — it's pure string templating.
5. The HTML is written into a new browser tab opened with `window.open('', '_blank', 'width=960,height=1150')`. The tab renders a 2-page A4 preview.
6. A preview bar at the top (hidden on print via `.no-print`) contains a **"Print / Save PDF"** button that calls `window.print()`.
7. The browser's native print dialog handles both physical printing and "Save as PDF" — no PDF library is used.

---

## Document structure (2 pages)

### Page 1
- **Header** — HOMESTA CARS brand + company address
- **Contract title block** — trilingual (TR / EN / AR)
- **Info grid** — two side-by-side tables: Customer Info and Booking Info (pickup/dropoff, KM, fuel, insurance, services)
- **BONO** — Turkish promissory note section with blank fields for amount, due date, debtor signature

### Page 2
- **Mini header** — brand + contract reference
- **Terms & Conditions** — 15 clauses in three side-by-side columns: Arabic (RTL), Turkish, English
- **Signature blocks** — Renter and Company Representative

---

## Quirks and notes

- **Pop-up blocker**: `window.open()` will be blocked by the browser if the user hasn't allowed pop-ups for the site. The function catches this and shows an `alert()` explaining how to fix it.
- **Fallback customer data**: If the Supabase customer fetch fails or returns null (e.g. offline), `printBookingContract()` constructs a minimal `CustomerData` object from `booking.customer_name` (split on first space). The contract will print with dashes (`—`) for missing fields rather than crashing.
- **Arabic font**: The Cairo font is loaded via Google Fonts CDN inside the generated HTML. If the tab is opened offline, Arabic text will fall back to the system's default Arabic font (may differ in appearance).
- **Print CSS**: `@page { size: A4; margin: 0; }` is set inside the generated HTML's `<style>` block. The `.page` divs add their own padding (`15mm 15mm 12mm`), so there is no dependency on the host app's CSS.
- **`-webkit-print-color-adjust: exact`**: Set on `body` and on colored elements (BONO header, section bars) to ensure background colours survive printing in Chrome/Safari.
- **Page 1 → Page 2 break**: Achieved with `.page-break { page-break-after: always; break-after: page; }` on the first `.page` div.
- **BONO fields are blank by default**: Amount, due date, issue date, and serial number are left empty intentionally — staff fills them in by hand after printing.
- **Dates**: Formatted with `toLocaleDateString('tr-TR', ...)` for Turkish locale (DD.MM.YYYY), except the `today` date used in the contract header and footer.
