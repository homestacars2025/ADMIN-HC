# Print Contract — npm Dependencies

## Runtime dependencies (from package.json)

| Package | Version | Used for |
|---------|---------|----------|
| `@supabase/supabase-js` | `^2.78.0` | Fetching customer data in `printBookingContract()` |
| `react` | `^19.2.5` | JSX / component rendering (BookingsPage integration) |
| `react-dom` | `^19.2.5` | `ReactDOM.createPortal` for modals in BookingsPage |
| `typescript` | `^4.9.5` | Type checking (`ContractBooking`, `CustomerData`) |

## External fonts (loaded via CDN in the generated HTML — no npm install required)

The contract HTML window loads these directly from Google Fonts:
- **Inter** (weights 400, 500, 600, 700, 800, 900) — body text, labels, values
- **Cairo** (weights 400, 600, 700) — Arabic RTL text in labels and terms columns

```html
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
```

These are embedded inside `buildHTML()` in `printContract.ts`. No configuration needed.

## Dev dependencies (not needed at runtime)

| Package | Version | Used for |
|---------|---------|----------|
| `tailwindcss` | `^3.4.19` | App-wide styling (not used inside the contract HTML itself) |

## What this feature does NOT need

- No PDF library (jsPDF, pdfmake, etc.) — PDF export is handled natively by the browser's Print → Save as PDF.
- No i18n library — translations are hardcoded as inline string literals inside `CLAUSES` array in `printContract.ts`.
- No additional React packages — the contract opens in a raw `window.open()` popup, completely outside the React tree.
