import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  first_name:              string;
  last_name:               string;
  id_type:                 string | null;
  id_number:               string | null;
  driving_license:         string | null;
  driving_license_mirror:  string | null;
  birth_date:              string | null;
  nationality:             string | null;
  address:                 string | null;
  phone:                   string | null;
}

export interface ContractBooking {
  id:             number;
  booking_number: string;
  plate_number:   string;
  car_model:      string;
  customer_id:    number;
  customer_name:  string;
  start_date:     string;
  end_date:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  if (!s) return '—';
  return s;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function blank(label: string = ''): string {
  return `<span class="blank">${label}</span>`;
}

// ─── Fuel gauge SVG ───────────────────────────────────────────────────────────

function fuelGauge(filled: number = 0): string {
  const total = 8;
  const bars = Array.from({ length: total }, (_, i) => {
    const active = i < filled;
    const color  = active ? (i >= 6 ? '#22c55e' : i >= 3 ? '#eab308' : '#ef4444') : '#e5e7eb';
    return `<rect x="${4 + i * 14}" y="2" width="10" height="18" rx="2" fill="${color}"/>`;
  }).join('');
  return `<svg width="${4 + total * 14}" height="22" viewBox="0 0 ${4 + total * 14} 22">${bars}</svg>`;
}

// ─── Contract HTML ────────────────────────────────────────────────────────────

function buildHTML(booking: ContractBooking, cust: CustomerData): string {
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fullName = `${cust.first_name} ${cust.last_name}`.trim();

  const termsAR = `
    <h3>شروط وأحكام تأجير السيارات</h3>
    <p><strong>١. استلام وتسليم المركبة:</strong> يُسلَّم المركبة للمستأجر بحالة نظيفة وسليمة، ويلتزم المستأجر بإعادتها بنفس الحالة في الموعد والمكان المتفق عليهما.</p>
    <p><strong>٢. مسؤولية السائق:</strong> يتحمل المستأجر المسؤولية الكاملة عن أي مخالفات مرورية أو حوادث تقع خلال فترة الإيجار.</p>
    <p><strong>٣. المخالفات المرورية:</strong> تُحتسب جميع المخالفات المرورية على حساب المستأجر وليس الشركة.</p>
    <p><strong>٤. التأمين:</strong> المركبة مؤمنة بالتأمين الشامل (كاسكو) والتأمين الإلزامي (ترافيك سيغورتا). لا يشمل التأمين الإهمال المتعمد أو السياقة تحت تأثير الكحول.</p>
    <p><strong>٥. حدود الكيلومترات:</strong> الحد اليومي ١٥٠ كم/يوم أو ٣٥٠٠ كم/شهر. يُحتسب رسم إضافي على كل كيلومتر زائد.</p>
    <p><strong>٦. الاستخدامات المحظورة:</strong> يُحظر استخدام المركبة خارج تركيا أو في السباقات أو نقل البضائع غير المشروعة أو أي نشاط مخالف للقانون.</p>
    <p><strong>٧. مسؤولية الأضرار:</strong> يتحمل المستأجر تكاليف إصلاح أي ضرر يلحق بالمركبة خلال فترة الإيجار وغير مشمول بالتأمين.</p>
    <p><strong>٨. الاختصاص القضائي:</strong> تخضع أي نزاعات ناشئة عن هذا العقد لاختصاص محاكم إسطنبول.</p>
  `;

  const termsTR = `
    <h3>Araç Kiralama Sözleşmesi Şartları ve Koşulları</h3>
    <p><strong>1. Araç Teslimi ve İadesi:</strong> Araç kiracıya temiz ve eksiksiz olarak teslim edilir; kiracı, aracı anlaşılan tarih ve yerde aynı koşullarda iade etmekle yükümlüdür.</p>
    <p><strong>2. Sürücü Sorumluluğu:</strong> Kiralama süresi boyunca meydana gelen tüm trafik cezaları ve kazalar kiracının sorumluluğundadır.</p>
    <p><strong>3. Trafik Cezaları:</strong> Kiralama süresi içinde oluşan her türlü trafik cezası kiracıya aittir.</p>
    <p><strong>4. Sigorta:</strong> Araç; Kasko ve Trafik Sigortası kapsamındadır. Sigorta; kasıtlı ihmal ve alkollü araç kullanımını kapsamaz.</p>
    <p><strong>5. Kilometre Limiti:</strong> Günlük limit 150 km veya aylık 3.500 km'dir. Aşılan her kilometre için ek ücret tahsil edilir.</p>
    <p><strong>6. Yasaklı Kullanımlar:</strong> Aracın Türkiye dışında, yarışlarda, yasadışı mal taşımacılığında veya kanuna aykırı herhangi bir faaliyette kullanılması kesinlikle yasaktır.</p>
    <p><strong>7. Hasar Sorumluluğu:</strong> Kiralama süresi içinde araçta meydana gelen ve sigorta kapsamı dışında kalan hasarların tüm maliyeti kiracıya aittir.</p>
    <p><strong>8. Yetkili Mahkeme:</strong> Bu sözleşmeden doğan her türlü uyuşmazlıkta İstanbul Mahkemeleri yetkilidir.</p>
  `;

  const termsEN = `
    <h3>Car Rental Terms and Conditions</h3>
    <p><strong>1. Vehicle Delivery & Return:</strong> The vehicle is delivered in clean, fully operational condition. The renter is obligated to return it in the same condition at the agreed time and location.</p>
    <p><strong>2. Driver Responsibility:</strong> The renter bears full responsibility for all traffic violations and accidents occurring during the rental period.</p>
    <p><strong>3. Traffic Fines:</strong> All traffic fines incurred during the rental period are the renter's responsibility, not the company's.</p>
    <p><strong>4. Insurance:</strong> The vehicle is covered by Comprehensive Insurance (Kasko) and Mandatory Traffic Insurance. Insurance does not cover intentional negligence or driving under the influence of alcohol.</p>
    <p><strong>5. Kilometre Limits:</strong> The daily limit is 150 km/day or 3,500 km/month. An additional charge applies for every kilometre exceeding the limit.</p>
    <p><strong>6. Prohibited Uses:</strong> The vehicle must not be taken outside Turkey, used in races, used to transport illegal goods, or used for any unlawful activity.</p>
    <p><strong>7. Damage Liability:</strong> The renter is responsible for the full repair costs of any damage to the vehicle during the rental period that is not covered by insurance.</p>
    <p><strong>8. Jurisdiction:</strong> Any disputes arising from this agreement shall be subject to the jurisdiction of Istanbul Courts.</p>
  `;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Contract – ${booking.booking_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11px; color: #111;
    background: #fff;
  }

  /* ── Page breaks ── */
  .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 10mm; position: relative; }
  .page-break { page-break-after: always; break-after: page; }

  /* ── Header ── */
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 10px; border-bottom: 2.5px solid #4ba6ea; margin-bottom: 12px;
  }
  .brand-name {
    font-size: 22px; font-weight: 900; color: #4ba6ea; letter-spacing: -0.5px; line-height: 1;
  }
  .brand-tag { font-size: 9px; color: #6b7280; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3px; }
  .company-info { text-align: right; font-size: 9px; color: #374151; line-height: 1.7; }
  .company-info strong { font-size: 10px; color: #111; }

  /* ── Contract title ── */
  .contract-title {
    text-align: center; font-size: 13px; font-weight: 800;
    color: #0f1117; letter-spacing: 0.3px; margin-bottom: 10px;
    text-transform: uppercase;
  }
  .contract-num {
    text-align: center; font-size: 10px; color: #6b7280; margin-bottom: 12px;
  }
  .contract-num strong { color: #4ba6ea; font-size: 12px; }

  /* ── Info grid ── */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .info-box {
    border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;
  }
  .info-box-header {
    background: #4ba6ea; color: #fff; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px; padding: 5px 8px;
  }
  .info-row {
    display: flex; border-bottom: 1px solid #f3f4f6; align-items: center;
  }
  .info-row:last-child { border-bottom: none; }
  .info-label {
    font-size: 9px; font-weight: 600; color: #6b7280; padding: 4px 8px;
    width: 100px; flex-shrink: 0; border-right: 1px solid #f3f4f6;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  .info-val { font-size: 10.5px; color: #111; padding: 4px 8px; font-weight: 500; flex: 1; }

  /* ── Delivery table ── */
  .delivery-table {
    width: 100%; border-collapse: collapse; margin-bottom: 10px;
    border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;
  }
  .delivery-table th {
    background: #f8fafc; font-size: 9px; font-weight: 700; color: #374151;
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 5px 8px; border-bottom: 1.5px solid #e5e7eb;
    border-right: 1px solid #e5e7eb; text-align: left;
  }
  .delivery-table th.accent { background: #4ba6ea; color: #fff; }
  .delivery-table td {
    padding: 5px 8px; font-size: 10px; color: #111;
    border-bottom: 1px solid #f3f4f6; border-right: 1px solid #f3f4f6; vertical-align: middle;
  }
  .delivery-table td:last-child, .delivery-table th:last-child { border-right: none; }
  .delivery-table tr:last-child td { border-bottom: none; }
  .blank {
    display: inline-block; min-width: 80px; height: 1px;
    border-bottom: 1px solid #9ca3af; vertical-align: bottom;
  }

  /* ── KM limit note ── */
  .km-note {
    background: #f0f7ff; border: 1px solid rgba(75,166,234,0.25);
    border-radius: 5px; padding: 5px 10px;
    font-size: 9.5px; color: #374151; margin-bottom: 10px;
    display: flex; align-items: center; gap: 6px;
  }
  .km-note strong { color: #4ba6ea; }

  /* ── Second driver ── */
  .second-driver {
    border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px;
  }
  .section-header {
    background: #f8fafc; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px; color: #374151;
    padding: 5px 8px; border-bottom: 1px solid #e5e7eb;
  }
  .driver-row { display: flex; gap: 0; padding: 7px 8px; }
  .driver-field { flex: 1; margin-right: 12px; }
  .driver-field:last-child { margin-right: 0; }
  .driver-label { font-size: 8.5px; color: #9ca3af; font-weight: 600; text-transform: uppercase; margin-bottom: 3px; }
  .driver-line { border-bottom: 1px solid #9ca3af; height: 16px; }

  /* ── Signature boxes ── */
  .sig-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .sig-box {
    flex: 1; border: 1px solid #e5e7eb; border-radius: 6px;
    padding: 8px; text-align: center;
  }
  .sig-title { font-size: 9px; font-weight: 700; color: #374151; text-transform: uppercase; margin-bottom: 6px; }
  .sig-area { height: 40px; border-bottom: 1px solid #9ca3af; }
  .sig-name { font-size: 9px; color: #6b7280; margin-top: 4px; }

  /* ── Senet ── */
  .senet-wrapper {
    border: 2px solid #111; border-radius: 4px; overflow: hidden;
  }
  .senet-header {
    background: #111; color: #fff; text-align: center; padding: 6px;
    display: flex; align-items: center; justify-content: center; gap: 12px;
  }
  .senet-title { font-size: 14px; font-weight: 900; letter-spacing: 3px; }
  .senet-subtitle { font-size: 8px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  .senet-body { padding: 8px 10px; }
  .senet-top-row {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;
    border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;
  }
  .senet-field { }
  .senet-field-label { font-size: 8px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .senet-field-val { font-size: 11px; font-weight: 600; color: #111; border-bottom: 1px solid #9ca3af; min-height: 18px; padding-bottom: 1px; }
  .senet-middle-row {
    display: grid; grid-template-columns: 2fr 1fr; gap: 8px;
    margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;
  }
  .senet-amount-box {
    border: 1.5px solid #111; border-radius: 4px; padding: 6px 8px;
  }
  .senet-amount-label { font-size: 8px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .senet-amount-val { font-size: 18px; font-weight: 900; letter-spacing: 1px; color: #111; min-height: 24px; }
  .senet-amount-currency { font-size: 9px; color: #6b7280; margin-top: 2px; }
  .senet-serial { text-align: right; }
  .senet-serial-label { font-size: 8px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
  .senet-serial-val { font-size: 12px; font-weight: 700; font-family: monospace; border-bottom: 1px solid #9ca3af; min-height: 18px; }
  .senet-promise-text {
    font-size: 9px; color: #374151; line-height: 1.6; margin-bottom: 8px;
    padding: 6px 8px; background: #f9fafb; border-radius: 4px; border: 1px solid #f0f0f0;
  }
  .senet-promise-text strong { color: #111; }
  .senet-debtor-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  }
  .senet-debtor-sig { grid-column: span 1; }
  .senet-debtor-label { font-size: 8px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .senet-debtor-val { font-size: 10px; font-weight: 500; border-bottom: 1px solid #9ca3af; min-height: 18px; padding-bottom: 1px; }
  .senet-sig-area { height: 40px; border: 1px solid #9ca3af; border-radius: 3px; margin-top: 4px; }

  /* ── Page 2 — Terms ── */
  .terms-page .header { margin-bottom: 14px; }
  .terms-page h2 {
    text-align: center; font-size: 11px; font-weight: 800; color: #0f1117;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px;
  }
  .terms-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .terms-col { }
  .terms-col h3 { font-size: 10px; font-weight: 800; color: #4ba6ea; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 1.5px solid #4ba6ea; padding-bottom: 4px; }
  .terms-col p { font-size: 8.5px; color: #374151; line-height: 1.55; margin-bottom: 5px; }
  .terms-col strong { font-weight: 700; color: #111; }
  [lang="ar"] .terms-col { direction: rtl; }
  .footer-note {
    margin-top: 14px; text-align: center; font-size: 8px; color: #9ca3af;
    border-top: 1px solid #f0f0f0; padding-top: 8px;
  }

  /* ── Print ── */
  @media print {
    @page { size: A4; margin: 0; }
    body { margin: 0; }
    .page { padding: 12mm 12mm 8mm; }
    .no-print { display: none !important; }
  }

  /* ── Screen preview bar ── */
  .preview-bar {
    background: #0f1117; color: #fff; padding: 10px 20px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; font-weight: 500;
  }
  .preview-bar button {
    background: #4ba6ea; color: #fff; border: none; border-radius: 8px;
    padding: 8px 20px; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: inherit;
  }
</style>
</head>
<body>

<!-- Preview bar (hidden in print) -->
<div class="preview-bar no-print">
  <span>Contract Preview — ${booking.booking_number}</span>
  <button onclick="window.print()">🖨 Print / Save PDF</button>
</div>

<!-- ═══════════ PAGE 1 ═══════════ -->
<div class="page page-break">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">HOMESTA CARS</div>
      <div class="brand-tag">Premium Car Rental · Istanbul</div>
    </div>
    <div class="company-info">
      <strong>HOMESTA ARAÇ KİRALAMA A.Ş.</strong><br/>
      Şişli Şubesi · Kayaşehir Şubesi<br/>
      İstanbul, Türkiye<br/>
      📞 +90 212 000 00 00 &nbsp;|&nbsp; +90 532 000 00 00
    </div>
  </div>

  <!-- Title -->
  <div class="contract-title">Araç Kiralama Sözleşmesi / Car Rental Contract</div>
  <div class="contract-num">Sözleşme No / Contract No: <strong>${booking.booking_number}</strong> &nbsp;·&nbsp; Tarih / Date: ${today}</div>

  <!-- Info grid -->
  <div class="info-grid">

    <!-- Car info -->
    <div class="info-box">
      <div class="info-box-header">🚗 Araç Bilgileri / Vehicle Info</div>
      <div class="info-row">
        <div class="info-label">Plaka / Plate</div>
        <div class="info-val">${fmt(booking.plate_number)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Model</div>
        <div class="info-val">${fmt(booking.car_model)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Sigorta</div>
        <div class="info-val">Kasko + Trafik Sigortası</div>
      </div>
    </div>

    <!-- Customer info -->
    <div class="info-box">
      <div class="info-box-header">👤 Kiracı Bilgileri / Renter Info</div>
      <div class="info-row">
        <div class="info-label">Ad Soyad</div>
        <div class="info-val">${fmt(fullName)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">TC / Pasaport</div>
        <div class="info-val">${fmt(cust.id_number)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Ehliyet No</div>
        <div class="info-val">${fmt(cust.driving_license)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Doğum Tarihi</div>
        <div class="info-val">${fmtDate(cust.birth_date)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Uyruk</div>
        <div class="info-val">${fmt(cust.nationality)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Adres</div>
        <div class="info-val" style="font-size:9.5px">${fmt(cust.address)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Telefon</div>
        <div class="info-val">${fmt(cust.phone)}</div>
      </div>
    </div>
  </div>

  <!-- Delivery / pickup table -->
  <table class="delivery-table">
    <thead>
      <tr>
        <th style="width:140px"></th>
        <th class="accent">📦 Teslim / Delivery</th>
        <th class="accent">📬 Tesellüm / Return</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Tarih / Date</strong></td>
        <td>${fmtDate(booking.start_date)}</td>
        <td>${fmtDate(booking.end_date)}</td>
      </tr>
      <tr>
        <td><strong>Saat / Time</strong></td>
        <td>${blank()}</td>
        <td>${blank()}</td>
      </tr>
      <tr>
        <td><strong>Yer / Location</strong></td>
        <td>${blank('Şişli / Kayaşehir')}</td>
        <td>${blank()}</td>
      </tr>
      <tr>
        <td><strong>KM</strong></td>
        <td>${blank()}</td>
        <td>${blank()}</td>
      </tr>
      <tr>
        <td><strong>Yakıt / Fuel</strong></td>
        <td>${fuelGauge(4)} &nbsp;<small style="font-size:8px;color:#9ca3af">Teslim</small></td>
        <td>${fuelGauge(0)} &nbsp;<small style="font-size:8px;color:#9ca3af">İade</small></td>
      </tr>
    </tbody>
  </table>

  <!-- KM limit note -->
  <div class="km-note">
    <strong>⚡ KM Limiti:</strong>
    Günlük <strong>150 km/gün</strong> veya Aylık <strong>3.500 km/ay</strong> —
    Aşılan her km için ek ücret tahsil edilir.
  </div>

  <!-- Second driver -->
  <div class="second-driver">
    <div class="section-header">İkinci Sürücü / Second Driver (İsteğe Bağlı / Optional)</div>
    <div class="driver-row">
      <div class="driver-field">
        <div class="driver-label">Ad Soyad</div>
        <div class="driver-line"></div>
      </div>
      <div class="driver-field">
        <div class="driver-label">TC / Pasaport No</div>
        <div class="driver-line"></div>
      </div>
      <div class="driver-field">
        <div class="driver-label">Ehliyet No</div>
        <div class="driver-line"></div>
      </div>
    </div>
  </div>

  <!-- Signatures -->
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-title">Kiracı İmzası / Renter Signature</div>
      <div class="sig-area"></div>
      <div class="sig-name">${fmt(fullName)}</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Şirket Yetkilisi / Authorized Representative</div>
      <div class="sig-area"></div>
      <div class="sig-name">HOMESTA CARS</div>
    </div>
  </div>

  <!-- ── SENET ── -->
  <div class="senet-wrapper">
    <div class="senet-header">
      <div>
        <div class="senet-title">B O N O</div>
        <div class="senet-subtitle">Promissory Note / Senet</div>
      </div>
    </div>
    <div class="senet-body">

      <!-- Top row: Vade / Tanzim / Seri -->
      <div class="senet-top-row">
        <div class="senet-field">
          <div class="senet-field-label">Vade Tarihi / Due Date</div>
          <div class="senet-field-val">&nbsp;</div>
        </div>
        <div class="senet-field">
          <div class="senet-field-label">Tanzim Tarihi / Issue Date</div>
          <div class="senet-field-val">${today}</div>
        </div>
        <div class="senet-field">
          <div class="senet-field-label">Senet Seri / Sıra No</div>
          <div class="senet-field-val">${booking.booking_number}</div>
        </div>
      </div>

      <!-- Amount row -->
      <div class="senet-middle-row">
        <div class="senet-amount-box">
          <div class="senet-amount-label">Türk Lirası (₺) / Amount in Turkish Lira</div>
          <div class="senet-amount-val">&nbsp;</div>
          <div class="senet-amount-currency">Yazıyla / In Words: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
        </div>
        <div class="senet-serial">
          <div class="senet-serial-label">Ödeme Yeri / Payment Location</div>
          <div class="senet-serial-val">İstanbul</div>
        </div>
      </div>

      <!-- Promise text -->
      <div class="senet-promise-text">
        Bu senedi düzenleyen <strong>${fmt(fullName)}</strong>,
        yukarıda belirtilen <strong>vade tarihinde</strong>,
        Homesta Araç Kiralama A.Ş.'ye veya emrine,
        yukarıda yazılı miktarı kayıtsız ve şartsız ödeyeceğini kabul ve taahhüt eder.
        İşbu bono, <strong>${booking.booking_number}</strong> numaralı araç kiralama sözleşmesine istinaden düzenlenmiştir.
      </div>

      <!-- Debtor section -->
      <div class="senet-debtor-grid">
        <div>
          <div class="senet-debtor-label">Borçlu Adı Soyadı</div>
          <div class="senet-debtor-val">${fmt(fullName)}</div>
        </div>
        <div>
          <div class="senet-debtor-label">TC / Vergi No</div>
          <div class="senet-debtor-val">${fmt(cust.id_number)}</div>
        </div>
        <div>
          <div class="senet-debtor-label">Adres</div>
          <div class="senet-debtor-val" style="font-size:8.5px">${fmt(cust.address)}</div>
        </div>
        <div class="senet-debtor-sig">
          <div class="senet-debtor-label">İmza / Signature</div>
          <div class="senet-sig-area"></div>
        </div>
      </div>

    </div>
  </div>

</div>
<!-- ═══════════ END PAGE 1 ═══════════ -->


<!-- ═══════════ PAGE 2 ═══════════ -->
<div class="page terms-page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">HOMESTA CARS</div>
      <div class="brand-tag">Premium Car Rental · Istanbul</div>
    </div>
    <div class="company-info">
      <strong>Sözleşme No / Contract No:</strong> ${booking.booking_number}<br/>
      <strong>Kiracı / Renter:</strong> ${fmt(fullName)}<br/>
      <strong>Tarih / Date:</strong> ${today}
    </div>
  </div>

  <h2>Genel Şartlar ve Koşullar / General Terms / الشروط العامة</h2>

  <div class="terms-cols">
    <!-- Arabic -->
    <div class="terms-col" lang="ar" dir="rtl" style="text-align:right">
      ${termsAR}
    </div>
    <!-- Turkish -->
    <div class="terms-col">
      ${termsTR}
    </div>
    <!-- English -->
    <div class="terms-col">
      ${termsEN}
    </div>
  </div>

  <div class="footer-note">
    Homesta Araç Kiralama A.Ş. · İstanbul, Türkiye · Bu sözleşme elektronik ortamda oluşturulmuştur / This contract was generated electronically.
    Booking: ${booking.booking_number} · ${today}
  </div>

</div>
<!-- ═══════════ END PAGE 2 ═══════════ -->

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printBookingContract(booking: ContractBooking): Promise<void> {
  // Fetch full customer details
  const { data, error } = await supabase
    .from('customers')
    .select('first_name, last_name, id_type, id_number, driving_license, driving_license_mirror, birth_date, nationality, address, phone')
    .eq('id', booking.customer_id)
    .maybeSingle();

  const cust: CustomerData = data ?? {
    first_name:             booking.customer_name.split(' ')[0] ?? '',
    last_name:              booking.customer_name.split(' ').slice(1).join(' ') ?? '',
    id_type:                null,
    id_number:              null,
    driving_license:        null,
    driving_license_mirror: null,
    birth_date:             null,
    nationality:            null,
    address:                null,
    phone:                  null,
  };

  if (error) {
    // Non-fatal: proceed with partial data from booking
  }

  const html = buildHTML(booking, cust);

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
