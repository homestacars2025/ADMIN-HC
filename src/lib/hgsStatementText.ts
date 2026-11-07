import type { StatementLang } from './hgsStatement';

/**
 * The words printed on the HGS toll statement, in the customer's language. This is
 * document text for the customer, not Admin's interface, which stays English.
 */

export interface StatementText {
  title: string;
  number: string;
  issued: string;
  plate: string;
  vehicle: string;
  period: string;
  customer: string;
  booking: string;
  total: string;
  passes: string;
  days: string;
  date: string;
  time: string;
  route: string;
  road: string;
  type: string;
  amount: string;
  public: string;
  private: string;
  totalRow: string;
  /** "{x}" and "{y}" are the page and the page count. */
  page: string;
  empty: string;
  privateExcluded: string;
  legalTitle: string;
  legal: string;
}

export const STATEMENT_TEXT: Record<StatementLang, StatementText> = {
  ar: {
    title: 'كشف رسوم عبور HGS',
    number: 'رقم الكشف',
    issued: 'تاريخ الإصدار',
    plate: 'رقم اللوحة',
    vehicle: 'المركبة',
    period: 'الفترة',
    customer: 'العميل',
    booking: 'رقم الحجز',
    total: 'إجمالي المبلغ',
    passes: 'عدد مرات العبور',
    days: 'أيام العبور',
    date: 'التاريخ',
    time: 'الوقت',
    route: 'المعبر / المسار',
    road: 'الطريق / المشغّل',
    type: 'النوع',
    amount: 'المبلغ',
    public: 'طريق عام',
    private: 'طريق خاص',
    totalRow: 'الإجمالي',
    page: 'صفحة {x} من {y}',
    empty: 'لا توجد عمليات عبور في هذه الفترة.',
    privateExcluded: 'لا يشمل الطرق الخاصة',
    legalTitle: 'ملاحظة قانونية',
    legal: 'تم استخراج هذه البيانات من سجل نظام HGS الرسمي المرتبط بالمركبة، والمسجّل باسم مالك المركبة أو الجهة المتعاقدة مع شركة Homesta. يحق لـ Homesta تحصيل هذه الرسوم من المستأجر وفقاً لعقد الإيجار الموقّع.',
  },
  tr: {
    title: 'HGS Geçiş Ekstresi',
    number: 'Ekstre no.',
    issued: 'Düzenleme tarihi',
    plate: 'Plaka',
    vehicle: 'Araç',
    period: 'Dönem',
    customer: 'Müşteri',
    booking: 'Rezervasyon no.',
    total: 'Toplam tutar',
    passes: 'Geçiş sayısı',
    days: 'Geçiş yapılan gün',
    date: 'Tarih',
    time: 'Saat',
    route: 'Geçiş / güzergâh',
    road: 'Yol / işletmeci',
    type: 'Tür',
    amount: 'Tutar',
    public: 'Kamu yolu',
    private: 'Özel yol',
    totalRow: 'Toplam',
    page: 'Sayfa {x} / {y}',
    empty: 'Bu dönemde geçiş yok.',
    privateExcluded: 'Özel yollar hariç',
    legalTitle: 'Yasal not',
    legal: 'Bu veriler, araca bağlı ve araç sahibi veya Homesta ile sözleşmeli taraf adına kayıtlı resmi HGS sistem kayıtlarından alınmıştır. Homesta, imzalanan kira sözleşmesi uyarınca bu ücretleri kiracıdan tahsil etme hakkına sahiptir.',
  },
  en: {
    title: 'HGS Toll Statement',
    number: 'Statement no.',
    issued: 'Issue date',
    plate: 'Plate',
    vehicle: 'Vehicle',
    period: 'Period',
    customer: 'Customer',
    booking: 'Booking no.',
    total: 'Total amount',
    passes: 'Passes',
    days: 'Days with passes',
    date: 'Date',
    time: 'Time',
    route: 'Crossing / route',
    road: 'Road / operator',
    type: 'Type',
    amount: 'Amount',
    public: 'Public road',
    private: 'Private road',
    totalRow: 'Total',
    page: 'Page {x} of {y}',
    empty: 'No passes in this period.',
    privateExcluded: 'Private roads not included',
    legalTitle: 'Legal note',
    legal: 'This data is taken from the official HGS system records linked to the vehicle, registered to the vehicle owner or the party contracted with Homesta. Homesta is entitled to collect these charges from the renter under the signed rental agreement.',
  },
  fr: {
    title: 'Relevé des péages HGS',
    number: 'Relevé n°',
    issued: "Date d'émission",
    plate: 'Immatriculation',
    vehicle: 'Véhicule',
    period: 'Période',
    customer: 'Client',
    booking: 'Réservation n°',
    total: 'Montant total',
    passes: 'Passages',
    days: 'Jours avec passages',
    date: 'Date',
    time: 'Heure',
    route: 'Passage / trajet',
    road: 'Route / exploitant',
    type: 'Type',
    amount: 'Montant',
    public: 'Route publique',
    private: 'Route privée',
    totalRow: 'Total',
    page: 'Page {x} sur {y}',
    empty: 'Aucun passage sur cette période.',
    privateExcluded: 'Routes privées exclues',
    legalTitle: 'Mention légale',
    legal: 'Ces données proviennent des registres officiels du système HGS liés au véhicule, enregistrés au nom du propriétaire du véhicule ou de la partie sous contrat avec Homesta. Homesta est en droit de facturer ces frais au locataire conformément au contrat de location signé.',
  },
};

export const isRtl = (lang: StatementLang): boolean => lang === 'ar';
