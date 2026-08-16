import { supabase } from './supabase';
import { fmt, fmtDate, fmtKm, fmtFuel, infoRow, infoRowPair } from './printContract';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  first_name: string;
  last_name:  string;
  id_number:  string | null;
  phone:      string | null;
}

export interface ReplacementSheet {
  sheet_number:            string;
  customer_id:             string;          // uuid
  customer_name:           string;
  original_booking_number: string | null;
  original_plate:          string | null;
  original_model:          string | null;
  replacement_plate:       string;
  replacement_model:       string | null;
  start_date:              string;
  end_date:                string;
  km_at_handover:          number | null;
  fuel_at_handover:        string | null;
  notes:                   string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Dynamic values reach the template through `safe()` so a name or note containing
// `<` or `&` can never break the document structure.
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, ch => HTML_ESCAPES[ch]);
}

/** Escape, then apply the shared em-dash-for-empty formatting. */
function safe(s: string | null | undefined): string {
  return fmt(esc(s));
}

// ─── Replacement-specific terms ───────────────────────────────────────────────

// These are NOT the master contract's clauses. Clause 1 pulls the whole original
// contract in by reference, so its 15 clauses bind the replacement vehicle
// without being reprinted here; clauses 2-4 cover what is specific to a
// substitute vehicle. Same shape as printContract's CLAUSES.
interface SheetClause {
  num: number;
  titleAR: string; titleTR: string; titleEN: string;
  ar: string; tr: string; en: string;
}

const SHEET_CLAUSES: SheetClause[] = [
  {
    num: 1,
    titleAR: 'سريان العقد الأصلي',
    titleTR: 'ASIL SÖZLEŞMENİN GEÇERLİLİĞİ',
    titleEN: 'APPLICABILITY OF THE ORIGINAL CONTRACT',
    ar: 'تنطبق جميع شروط وأحكام عقد الإيجار الأصلي بالكامل على هذه السيارة البديلة دون استثناء، ويُعد هذا المحضر جزءاً لا يتجزأ من ذلك العقد.',
    tr: 'Asıl kira sözleşmesinin tüm hüküm ve şartları, istisnasız olarak işbu değişim aracı hakkında da aynen geçerlidir. İşbu tutanak, anılan sözleşmenin ayrılmaz bir parçasıdır.',
    en: 'All terms and conditions of the original rental contract apply in full and without exception to this replacement vehicle. This record forms an integral part of that contract.',
  },
  {
    num: 2,
    titleAR: 'إرجاع السيارة البديلة',
    titleTR: 'DEĞİŞİM ARACININ İADESİ',
    titleEN: 'RETURN OF THE REPLACEMENT VEHICLE',
    ar: 'يلتزم العميل بإرجاع السيارة البديلة فور إشعاره بجاهزية سيارته الأصلية أو عند انتهاء المدة المذكورة، أيهما أقرب.',
    tr: 'Kiracı, asıl aracının hazır olduğunun kendisine bildirilmesi üzerine derhal veya yukarıda belirtilen sürenin sonunda — hangisi önce gerçekleşirse — değişim aracını iade etmekle yükümlüdür.',
    en: 'The renter undertakes to return the replacement vehicle immediately upon being notified that their original vehicle is ready, or at the end of the stated period, whichever occurs first.',
  },
  {
    num: 3,
    titleAR: 'الوقود والكيلومترات والحالة',
    titleTR: 'YAKIT, KİLOMETRE VE ARACIN DURUMU',
    titleEN: 'FUEL, KILOMETRES & CONDITION',
    ar: 'تسري على السيارة البديلة نفس التزامات الوقود والكيلومترات والحالة المتفق عليها في العقد الأصلي، ويلتزم العميل بإرجاعها نظيفة ومغسولة وبنفس الحالة التي استلمها بها.',
    tr: 'Asıl sözleşmede kararlaştırılan yakıt, kilometre ve araç durumuna ilişkin yükümlülükler değişim aracı hakkında da aynen geçerlidir. Kiracı, aracı temiz ve yıkanmış olarak, teslim aldığı durumda iade etmeyi taahhüt eder.',
    en: 'The fuel, kilometre and condition obligations agreed in the original contract apply equally to the replacement vehicle. The renter undertakes to return it clean and washed, in the same condition in which it was received.',
  },
  {
    num: 4,
    titleAR: 'عدم التمديد والالتزامات المالية',
    titleTR: 'SÜRE UZATIMI VE EK YÜKÜMLÜLÜK',
    titleEN: 'NO EXTENSION OR ADDITIONAL OBLIGATION',
    ar: 'لا يترتب على استلام السيارة البديلة أي تمديد لمدة العقد الأصلي أو أي التزامات مالية إضافية ما لم يُتفق على غير ذلك كتابةً.',
    tr: 'Değişim aracının teslim alınması, asıl sözleşmenin süresini uzatmaz ve yazılı olarak aksi kararlaştırılmadıkça herhangi bir ek mali yükümlülük doğurmaz.',
    en: 'Receipt of the replacement vehicle neither extends the term of the original contract nor creates any additional financial obligation, unless otherwise agreed in writing.',
  },
];

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(sheet: ReplacementSheet, cust: CustomerData): string {
  const today    = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fullName = `${cust.first_name} ${cust.last_name}`.trim();

  const clauseCol = (pick: 'ar' | 'tr' | 'en', title: 'titleAR' | 'titleTR' | 'titleEN') =>
    SHEET_CLAUSES.map(c =>
      // Clause 1 carries the whole original contract by reference, so it gets a
      // tint to stand out — direction-agnostic, works in the RTL column too.
      `<div class="clause${c.num === 1 ? ' clause-bind' : ''}">
        <div class="clause-title">${c.num}. ${c[title]}</div>
        <div class="clause-body">${c[pick]}</div>
      </div>`
    ).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Replacement Sheet – ${esc(sheet.sheet_number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 10.5px;
    color: #111;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Page ───────────────────────────────────────────── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 15mm 12mm;
    position: relative;
    background: #fff;
  }

  /* ── Preview bar ────────────────────────────────────── */
  .preview-bar {
    background: #1a2942;
    color: #fff;
    padding: 10px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 500;
  }
  .preview-bar button {
    background: #4ba6ea;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 22px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: 0.3px;
  }
  .preview-bar button:hover { background: #2e8fd4; }

  /* ── Header ─────────────────────────────────────────── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 10px;
    border-bottom: 3px double #1a2942;
    margin-bottom: 10px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 900;
    color: #1a2942;
    letter-spacing: 1.5px;
    line-height: 1;
  }
  .brand-sub {
    font-size: 8px;
    color: #4ba6ea;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    margin-top: 3px;
  }
  .company-info {
    text-align: right;
    font-size: 8.5px;
    color: #374151;
    line-height: 1.75;
  }

  /* ── Title block ────────────────────────────────────── */
  .doc-title-block {
    text-align: center;
    margin-bottom: 10px;
    padding: 8px 0 7px;
    border-bottom: 1.5px solid #e5e7eb;
  }
  .doc-title-tr {
    font-size: 13px;
    font-weight: 700;
    color: #1a2942;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .doc-title-divider { color: #9ca3af; margin: 0 8px; font-size: 12px; }
  .doc-title-en {
    font-size: 11px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .doc-title-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    direction: rtl;
    display: block;
    margin-top: 3px;
  }
  .doc-meta { text-align: center; font-size: 9.5px; color: #374151; margin-top: 5px; }
  .doc-meta strong { color: #1a2942; font-size: 11px; }

  /* ── Section bar ────────────────────────────────────── */
  .section-bar {
    background: #1a2942;
    color: #fff;
    padding: 5px 10px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-bar .bar-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0;
    margin-left: auto;
    direction: rtl;
    opacity: 0.85;
  }

  /* ── Info grid ──────────────────────────────────────── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
    align-items: stretch;
  }
  .info-box {
    border: 1.5px solid #d1d5db;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    display: flex;
    flex-direction: column;
  }
  .info-table { width: 100%; border-collapse: collapse; flex: 1; height: 100%; }
  .info-label {
    width: 106px;
    padding: 3px 7px;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: top;
    background: #f8f9fb;
  }
  .lbl-tr {
    display: block;
    font-size: 7.5px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .lbl-en {
    display: block;
    font-size: 7px;
    font-weight: 400;
    color: #9ca3af;
    margin-top: 1px;
    letter-spacing: 0.1px;
  }
  .lbl-ar {
    display: block;
    font-family: 'Cairo', sans-serif;
    font-size: 8px;
    color: #9ca3af;
    direction: rtl;
    text-align: left;
    margin-top: 1px;
    line-height: 1.2;
  }
  .info-val {
    padding: 3px 8px;
    font-size: 10px;
    color: #111;
    font-weight: 500;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: middle;
  }
  tr:last-child .info-label,
  tr:last-child .info-val,
  tr:last-child .info-pair-cell { border-bottom: none; }

  /* ── Paired info row ────────────────────────────────── */
  .info-pair-cell { padding: 0; border-bottom: 1px solid #f0f0f0; }
  .pair-inner { display: flex; width: 100%; }
  .pair-half { flex: 1; display: flex; flex-direction: row; align-items: stretch; min-width: 0; }
  .pair-half-r { border-left: 1px solid #e5e7eb; }
  .pair-lbl {
    padding: 3px 7px;
    background: #f8f9fb;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex-shrink: 0;
    width: 80px;
    border-right: 1px solid #e5e7eb;
  }
  .pair-val {
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 500;
    color: #111;
    flex: 1;
    display: flex;
    align-items: center;
  }

  /* ── Acknowledgement ────────────────────────────────── */
  .ack-box {
    border: 1.5px solid #1a2942;
    background: #f8f9fb;
    padding: 8px 12px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .ack-tr {
    font-size: 9px;
    font-weight: 600;
    color: #1a2942;
    line-height: 1.65;
    text-align: justify;
  }
  .ack-en {
    display: block;
    font-size: 8.5px;
    color: #374151;
    line-height: 1.6;
    margin-top: 4px;
    text-align: justify;
  }
  .ack-ar {
    display: block;
    font-family: 'Cairo', sans-serif;
    font-size: 9.5px;
    color: #374151;
    direction: rtl;
    text-align: right;
    line-height: 1.7;
    margin-top: 4px;
  }

  /* ── Double divider ─────────────────────────────────── */
  .double-rule { border: none; border-top: 3px double #1a2942; margin: 10px 0; }

  /* ── Terms ──────────────────────────────────────────── */
  .terms-title {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 10px;
    padding-bottom: 7px;
    border-bottom: 1.5px solid #e5e7eb;
  }
  .terms-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .terms-col-header {
    background: #1a2942;
    color: #fff;
    text-align: center;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 4px 6px;
    margin-bottom: 8px;
  }
  .terms-col-header.ar-col { font-family: 'Cairo', sans-serif; font-size: 10px; letter-spacing: 0; }
  .clause { margin-bottom: 6px; }
  .clause-bind {
    background: #f8f9fb;
    border: 1px solid #e5e7eb;
    border-radius: 3px;
    padding: 5px 6px;
  }
  .clause-title {
    font-size: 8px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 2px;
  }
  .clause-body { font-size: 7.5px; color: #374151; line-height: 1.6; text-align: justify; }
  .terms-col-ar { direction: rtl; text-align: right; }
  .terms-col-ar .clause-title {
    font-family: 'Cairo', sans-serif;
    font-size: 8.5px;
    letter-spacing: 0;
    text-transform: none;
  }
  .terms-col-ar .clause-body { font-family: 'Cairo', sans-serif; font-size: 8px; text-align: right; }

  /* ── Signatures ─────────────────────────────────────── */
  .sig-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 10px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sig-box { border: 1.5px solid #d1d5db; padding: 5px 10px; text-align: center; }
  .sig-title {
    font-size: 8.5px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .sig-title-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 9px;
    color: #6b7280;
    direction: rtl;
    display: block;
    margin-bottom: 3px;
  }
  .sig-area { height: 26px; border-bottom: 1.5px solid #9ca3af; margin-bottom: 4px; }
  .sig-name { font-size: 8.5px; color: #374151; font-weight: 600; }

  /* ── Footer note ────────────────────────────────────── */
  .footer-note {
    margin-top: 8px;
    text-align: center;
    font-size: 7.5px;
    color: #9ca3af;
    border-top: 1.5px solid #e5e7eb;
    padding-top: 5px;
  }

  /* ── Print ──────────────────────────────────────────── */
  @media print {
    @page { size: A4; margin: 0; }
    body  { margin: 0; }
    .page { padding: 15mm 15mm 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<!-- Preview bar -->
<div class="preview-bar no-print">
  <span>Replacement Sheet Preview — ${esc(sheet.sheet_number)}</span>
  <button onclick="window.print()">🖨 Print / Save PDF</button>
</div>

<div class="page">

  <!-- Header -->
  <div class="doc-header">
    <div class="brand-block">
      <div class="brand-name">HOMESTA CARS</div>
      <div class="brand-sub">Premium Car Rental &middot; Istanbul</div>
    </div>
    <div class="company-info">
      KAYABA&Scedil;I MAH. GAZ&#304; YA&Scedil;ARG&#304;L CAD.<br/>
      T2 BLOK NO: 2Y &nbsp;&middot;&nbsp; BA&Scedil;AK&Scedil;EH&#304;R / &#304;STANBUL<br/>
      +90 507 539 16 99 &nbsp;&middot;&nbsp; +90 501 615 95 16<br/>
      info@homestacars.com
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title-block">
    <span class="doc-title-tr">ARA&Ccedil; DE&#286;&#304;&Scedil;&#304;M TUTANA&#286;I</span>
    <span class="doc-title-divider">/</span>
    <span class="doc-title-en">REPLACEMENT VEHICLE HANDOVER</span>
    <span class="doc-title-divider">/</span>
    <span class="doc-title-ar">محضر استبدال سيارة</span>
    <div class="doc-meta">
      Tutanak No / Sheet No: <strong>${safe(sheet.sheet_number)}</strong>
      &nbsp;&nbsp;&middot;&nbsp;&nbsp;
      Tarih / Date: <strong>${today}</strong>
    </div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">

    <!-- LEFT: Customer + original contract -->
    <div class="info-box">
      <div class="section-bar">
        M&Uuml;&Scedil;TER&#304; VE ASIL S&Ouml;ZLE&Scedil;ME / CUSTOMER &amp; ORIGINAL CONTRACT
        <span class="bar-ar">العميل والعقد الأصلي</span>
      </div>
      <table class="info-table">
        ${infoRow('AD SOYAD', 'Full Name', 'الاسم الكامل', safe(fullName))}
        ${infoRow('K&#304;ML&#304;K NO', 'ID Number', 'رقم الهوية', safe(cust.id_number))}
        ${infoRow('TELEFON', 'Phone', 'رقم الهاتف', safe(cust.phone))}
        ${infoRow('S&Ouml;ZLE&Scedil;ME NO', 'Contract No', 'رقم العقد', safe(sheet.original_booking_number))}
        ${infoRow('ASIL PLAKA', 'Original Plate', 'لوحة السيارة الأصلية', safe(sheet.original_plate))}
        ${infoRow('ASIL MODEL', 'Original Model', 'موديل السيارة الأصلية', safe(sheet.original_model))}
      </table>
    </div>

    <!-- RIGHT: Replacement vehicle + handover -->
    <div class="info-box">
      <div class="section-bar">
        DE&#286;&#304;&Scedil;&#304;M ARACI VE TESL&#304;M / REPLACEMENT VEHICLE &amp; HANDOVER
        <span class="bar-ar">سيارة الاستبدال والتسليم</span>
      </div>
      <table class="info-table">
        ${infoRow('PLAKA', 'Plate', 'رقم اللوحة', safe(sheet.replacement_plate))}
        ${infoRow('MODEL', 'Model', 'موديل السيارة', safe(sheet.replacement_model))}
        ${infoRowPair(
          'TESL&#304;M TAR&#304;H&#304;', 'Handover Date', 'تاريخ التسليم', fmtDate(sheet.start_date),
          '&#304;ADE TAR&#304;H&#304;',   'Return Date',   'تاريخ الإرجاع', fmtDate(sheet.end_date)
        )}
        ${infoRowPair(
          'TESL&#304;MDEK&#304; KM',    'KM at Handover',   'الكيلومتر عند التسليم', fmtKm(sheet.km_at_handover),
          'TESL&#304;MDEK&#304; YAKIT', 'Fuel at Handover', 'الوقود عند التسليم',    fmtFuel(esc(sheet.fuel_at_handover))
        )}
        ${infoRow('NOT', 'Notes', 'ملاحظة', safe(sheet.notes))}
      </table>
    </div>

  </div><!-- /info-grid -->

  <!-- Acknowledgement -->
  <div class="ack-box">
    <div class="ack-tr">
      &#304;&scedil;bu tutanak ile yukar&#305;da bilgileri yer alan de&gbreve;i&scedil;im arac&#305;,
      as&#305;l arac&#305;n yerine ge&ccedil;ici olarak m&uuml;&scedil;teriye teslim edilmi&scedil;tir.
      As&#305;l ara&ccedil; kiralama s&ouml;zle&scedil;mesi t&uuml;m h&uuml;k&uuml;m ve &scedil;artlar&#305;yla
      y&uuml;r&uuml;rl&uuml;kte kalmaya devam eder; bu tutanak an&#305;lan s&ouml;zle&scedil;menin ayr&#305;lmaz bir par&ccedil;as&#305;d&#305;r.
      <span class="ack-en">
        By this record, the replacement vehicle described above has been handed over to the customer as a
        temporary substitute for the original vehicle. The original rental contract remains in force with all
        its terms and conditions, and this record forms an integral part of that contract.
      </span>
      <span class="ack-ar">
        بموجب هذا المحضر، تم تسليم سيارة الاستبدال الموضحة أعلاه إلى العميل كبديل مؤقت عن السيارة الأصلية.
        ويبقى عقد إيجار السيارة الأصلي سارياً بكامل بنوده وشروطه، ويُعد هذا المحضر جزءاً لا يتجزأ من ذلك العقد.
      </span>
    </div>
  </div>

  <hr class="double-rule"/>

  <!-- Terms title -->
  <div class="terms-title">
    شروط السيارة البديلة
    &nbsp;/&nbsp;
    DE&#286;&#304;&Scedil;&#304;M ARACI &Scedil;ARTLARI
    &nbsp;/&nbsp;
    REPLACEMENT VEHICLE TERMS
  </div>

  <!-- Three-column terms -->
  <div class="terms-cols">
    <div>
      <div class="terms-col-header ar-col">العربية</div>
      <div class="terms-col-ar">${clauseCol('ar', 'titleAR')}</div>
    </div>
    <div>
      <div class="terms-col-header">T&Uuml;RK&Ccedil;E</div>
      <div>${clauseCol('tr', 'titleTR')}</div>
    </div>
    <div>
      <div class="terms-col-header">ENGLISH</div>
      <div>${clauseCol('en', 'titleEN')}</div>
    </div>
  </div>

  <hr class="double-rule"/>

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-title">M&Uuml;&Scedil;TER&#304; &#304;MZASI / CUSTOMER SIGNATURE</div>
        <div class="sig-title-ar">توقيع العميل</div>
        <div class="sig-area"></div>
        <div class="sig-name">${safe(fullName)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">&Scedil;İRKET YETKİLİSİ / AUTHORIZED REPRESENTATIVE</div>
        <div class="sig-title-ar">ممثل الشركة</div>
        <div class="sig-area"></div>
        <div class="sig-name">HOMESTA CARS</div>
      </div>
    </div>
  </div>

  <div class="footer-note">
    HOMESTA CARS &nbsp;&middot;&nbsp; Ba&scedil;ak&scedil;ehir, &#304;stanbul
    &nbsp;&middot;&nbsp;
    Bu tutanak elektronik ortamda olu&scedil;turulmu&scedil;tur / This record was generated electronically.
    &nbsp;&middot;&nbsp;
    Sheet: ${safe(sheet.sheet_number)} &nbsp;&middot;&nbsp; ${today}
  </div>

</div>

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printReplacementSheet(sheet: ReplacementSheet): Promise<void> {
  const { data } = await supabase
    .from('customers')
    .select('first_name, last_name, id_number, phone')
    .eq('id', sheet.customer_id)
    .maybeSingle();

  // Non-fatal: an unresolved customer still prints, using the denormalised name.
  const nameParts = sheet.customer_name.split(' ');
  const cust: CustomerData = (data as CustomerData | null) ?? {
    first_name: nameParts[0] ?? '',
    last_name:  nameParts.slice(1).join(' ') ?? '',
    id_number:  null,
    phone:      null,
  };

  const html = buildHTML(sheet, cust);

  const win = window.open('', '_blank', 'width=960,height=1150');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── Layout preview ───────────────────────────────────────────────────────────

/**
 * Renders the sheet with sample data so the layout can be eyeballed before any
 * UI exists. The customer id is a well-formed uuid that matches no row, so the
 * fallback path renders and no real customer is fetched.
 *
 * Call from the browser console during development.
 */
export function __previewReplacementSheet(): Promise<void> {
  return printReplacementSheet({
    sheet_number:            'RPL-2026-0007',
    customer_id:             '00000000-0000-0000-0000-000000000000',
    customer_name:           'Ahmet Yilmaz',
    original_booking_number: 'HC-2026-0412',
    original_plate:          '34 ABC 123',
    original_model:          'Fiat Egea 1.4',
    replacement_plate:       '34 XYZ 789',
    replacement_model:       'Renault Clio 1.0',
    start_date:              '2026-08-16',
    end_date:                '2026-08-24',
    km_at_handover:          48250,
    fuel_at_handover:        '3/4',
    notes:                   'Original vehicle in service for scheduled maintenance.',
  });
}
