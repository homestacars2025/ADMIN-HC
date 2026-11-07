import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { LOCKUP_GAP, WORDMARK_RATIO, brandDataUrl, brandSrc, type BrandAsset } from '../../lib/brand';
import { statementCount, statementDay, statementMoney, type StatementInput, type StatementLine } from '../../lib/hgsStatement';
import { isRtl, STATEMENT_TEXT, type StatementText } from '../../lib/hgsStatementText';

/**
 * The HGS toll statement as an A4 PDF, drawn in the browser. This module is only ever
 * loaded with import(), so react-pdf and the fonts stay out of the page until someone
 * downloads a statement.
 *
 * Geist sets Latin, Turkish and the figures; Arabic, and the lira sign Geist lacks, fall
 * back to IBM Plex Sans Arabic glyph by glyph. The Arabic statement mirrors the layout,
 * while plates, stations, dates and amounts read left to right inside it.
 */

const BRAND = '#6EA4E7';
const BRAND_INK = '#3A74C2';
const INK = '#0E0E10';
const SOFT = '#45454B';
const MUTED = '#8A8A93';
const LINE = '#EBEBEB';
const TINT = '#F3F8FE';
const ZEBRA = '#FAFBFD';

const FONT = ['Geist', 'PlexArabic'];

let registered = false;
export function registerFonts(base: string): void {
  if (registered) return;
  const file = (name: string) => `${base}/fonts/pdf/${name}.ttf`;
  Font.register({
    family: 'Geist',
    fonts: [
      { src: file('Geist-Regular'), fontWeight: 400 },
      { src: file('Geist-Medium'), fontWeight: 500 },
      { src: file('Geist-SemiBold'), fontWeight: 600 },
      { src: file('Geist-Bold'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'PlexArabic',
    fonts: [
      { src: file('IBMPlexSansArabic-Regular'), fontWeight: 400 },
      { src: file('IBMPlexSansArabic-Regular'), fontWeight: 500 },
      { src: file('IBMPlexSansArabic-SemiBold'), fontWeight: 600 },
      { src: file('IBMPlexSansArabic-Bold'), fontWeight: 700 },
    ],
  });
  // Station names and Arabic words are never hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, color: INK, paddingTop: 40, paddingBottom: 64, paddingHorizontal: 40, backgroundColor: '#FFFFFF' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND },
  label: { fontSize: 7.5, color: MUTED, marginBottom: 3 },
  value: { fontSize: 10, fontWeight: 600, color: INK },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  th: { fontSize: 7.5, fontWeight: 600, color: BRAND_INK },
  td: { fontSize: 8.5, color: INK, lineHeight: 1.35 },
});

/** One table column: its width, and whether it holds text written left to right. */
const COLUMNS = [
  { key: 'date', width: 58 },
  { key: 'time', width: 34 },
  { key: 'route', grow: true },
  { key: 'road', width: 118 },
  { key: 'type', width: 62 },
  { key: 'amount', width: 66 },
] as const;
type ColumnKey = typeof COLUMNS[number]['key'];

const columnStyle = (key: ColumnKey) => {
  const column = COLUMNS.find((item) => item.key === key)!;
  return 'grow' in column ? { flexGrow: 1, flexBasis: 0 } : { width: column.width };
};

/** The official logo files, embedded as base64 PNG data URLs. */
export interface StatementBrand {
  wordmark: string;
  icon: string;
}

/** The header lockup: icon, then the wordmark matched to it, as on Team's statement. */
const LOCKUP_ICON = 24;
const LOCKUP_WORDMARK = 16.5;
const FOOTER_ICON = 16;

/** A Turkish plate: the blue TR band, then the number. */
const Plate: React.FC<{ plate: string }> = ({ plate }) => (
  <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 0.8, borderColor: '#9A9AA3', borderRadius: 3 }}>
    <View style={{ backgroundColor: '#1D4ED8', paddingHorizontal: 3, justifyContent: 'flex-end', paddingBottom: 2, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }}>
      <Text style={{ fontSize: 5.5, fontWeight: 700, color: '#FFFFFF' }}>TR</Text>
    </View>
    <Text style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, paddingHorizontal: 6, paddingVertical: 3, color: '#0F1117' }}>{plate}</Text>
  </View>
);

const Statement: React.FC<{ input: StatementInput; logos: StatementBrand }> = ({ input, logos }) => {
  const t: StatementText = STATEMENT_TEXT[input.lang];
  const rtl = isRtl(input.lang);
  const row = rtl ? 'row-reverse' : 'row';
  const start = rtl ? 'right' : 'left';
  const end = rtl ? 'left' : 'right';
  const words = { direction: rtl ? 'rtl' : 'ltr', textAlign: start } as const;
  // Plates, stations, dates and amounts read left to right on every statement.
  const latin = (align: 'start' | 'end' = 'start') => ({ direction: 'ltr', textAlign: align === 'start' ? start : end } as const);
  const period = `${statementDay(input.period.from)} → ${statementDay(input.period.to)}`;

  const field = (label: string, value: React.ReactNode, key: string) => (
    <View key={key} style={{ flexGrow: 1, flexBasis: 0, alignItems: rtl ? 'flex-end' : 'flex-start' }}>
      <Text style={[styles.label, words]}>{label}</Text>
      {value}
    </View>
  );

  const tile = (label: string, value: string, brand: boolean) => (
    <View style={{ flexGrow: 1, flexBasis: 0, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: brand ? BRAND : TINT, alignItems: rtl ? 'flex-end' : 'flex-start' }}>
      <Text style={[{ fontSize: 8, color: brand ? 'rgba(255,255,255,0.85)' : SOFT, marginBottom: 5 }, words]}>{label}</Text>
      <Text style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: brand ? '#FFFFFF' : INK, direction: 'ltr' }}>{value}</Text>
    </View>
  );

  const cell = (key: ColumnKey, content: React.ReactNode) => (
    <View key={key} style={[columnStyle(key), { paddingHorizontal: 5, justifyContent: 'center' }]}>{content}</View>
  );

  const typeBadge = (line: StatementLine) => {
    if (!line.roadType) return <Text style={[styles.td, { color: MUTED }]}>—</Text>;
    const priv = line.roadType === 'private';
    return (
      <View style={{ alignSelf: rtl ? 'flex-end' : 'flex-start', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5, backgroundColor: priv ? '#F1EBFD' : '#F2F2F4' }}>
        <Text style={[{ fontSize: 7, fontWeight: 500, color: priv ? '#5B21B6' : '#55555C' }, words]}>{priv ? t.private : t.public}</Text>
      </View>
    );
  };

  const route = (line: StatementLine) => (line.entry ? `${line.entry} → ${line.exit ?? '—'}` : line.exit ?? '—');

  return (
    <Document title={`${t.title} ${input.number}`} author="Homesta Cars" creator="Homesta Cars" producer="Homesta Cars" language={input.lang}>
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.strip} />

        <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* The lockup follows the statement's direction: in Arabic the icon sits on the right. */}
          <View style={{ flexDirection: row, alignItems: 'center', gap: LOCKUP_GAP }}>
            <Image src={logos.icon} style={{ width: LOCKUP_ICON, height: LOCKUP_ICON }} />
            <Image src={logos.wordmark} style={{ height: LOCKUP_WORDMARK, width: LOCKUP_WORDMARK * WORDMARK_RATIO }} />
          </View>
          <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
            <Text style={[{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2, color: INK }, { direction: rtl ? 'rtl' : 'ltr', textAlign: end }]}>{t.title}</Text>
            <View style={{ flexDirection: row, marginTop: 6 }}>
              <Text style={[{ fontSize: 8, color: MUTED }, words]}>{t.number}</Text>
              <Text style={{ fontSize: 8, fontWeight: 600, color: INK, marginHorizontal: 5, direction: 'ltr' }}>{input.number}</Text>
            </View>
            <View style={{ flexDirection: row, marginTop: 2 }}>
              <Text style={[{ fontSize: 8, color: MUTED }, words]}>{t.issued}</Text>
              <Text style={{ fontSize: 8, color: INK, marginHorizontal: 5, direction: 'ltr' }}>{statementDay(input.issueDay)}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: LINE, marginTop: 16, marginBottom: 16 }} />

        <View style={styles.card}>
          <View style={{ flexDirection: row, gap: 14 }}>
            {field(t.plate, <Plate plate={input.plate} />, 'plate')}
            {field(t.vehicle, <Text style={[styles.value, latin()]}>{input.model ?? '—'}</Text>, 'vehicle')}
            {field(t.period, <Text style={[styles.value, latin()]}>{period}</Text>, 'period')}
          </View>
          {(input.customer || input.booking) && (
            <View style={{ flexDirection: row, gap: 14, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE }}>
              {field(t.customer, <Text style={[styles.value, { textAlign: start }]}>{input.customer ?? '—'}</Text>, 'customer')}
              {field(t.booking, <Text style={[styles.value, latin()]}>{input.booking ?? '—'}</Text>, 'booking')}
              <View style={{ flexGrow: 1, flexBasis: 0 }} />
            </View>
          )}
          {!input.includePrivate && (
            <Text style={[{ fontSize: 7.5, color: MUTED, marginTop: 10 }, words]}>{t.privateExcluded}</Text>
          )}
        </View>

        <View style={{ flexDirection: row, gap: 10, marginTop: 12 }}>
          {tile(t.total, statementMoney(input.totals.amount), true)}
          {tile(t.passes, statementCount(input.totals.passes), false)}
          {tile(t.days, statementCount(input.totals.days), false)}
        </View>

        <View style={{ marginTop: 18 }}>
          <View fixed style={{ flexDirection: row, backgroundColor: TINT, borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingVertical: 6 }}>
            {cell('date', <Text style={[styles.th, words]}>{t.date}</Text>)}
            {cell('time', <Text style={[styles.th, words]}>{t.time}</Text>)}
            {cell('route', <Text style={[styles.th, words]}>{t.route}</Text>)}
            {cell('road', <Text style={[styles.th, words]}>{t.road}</Text>)}
            {cell('type', <Text style={[styles.th, words]}>{t.type}</Text>)}
            {cell('amount', <Text style={[styles.th, { direction: rtl ? 'rtl' : 'ltr', textAlign: end }]}>{t.amount}</Text>)}
          </View>

          {input.lines.length === 0 && (
            <Text style={[{ fontSize: 9, color: MUTED, paddingVertical: 14, textAlign: 'center' }, { direction: rtl ? 'rtl' : 'ltr' }]}>{t.empty}</Text>
          )}

          {input.lines.map((line, index) => (
            <View key={line.id} wrap={false} style={{ flexDirection: row, paddingVertical: 5, backgroundColor: index % 2 === 1 ? ZEBRA : '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              {cell('date', <Text style={[styles.td, latin()]}>{statementDay(line.day)}</Text>)}
              {cell('time', <Text style={[styles.td, latin(), { color: SOFT }]}>{line.time || '—'}</Text>)}
              {cell('route', <Text style={[styles.td, latin()]}>{route(line)}</Text>)}
              {cell('road', <Text style={[styles.td, latin(), { color: SOFT, fontSize: 7.5 }]}>{line.road ?? '—'}</Text>)}
              {cell('type', typeBadge(line))}
              {cell('amount', <Text style={[styles.td, latin('end'), { fontWeight: 600 }]}>{statementMoney(line.amount)}</Text>)}
            </View>
          ))}

          <View wrap={false} style={{ flexDirection: row, alignItems: 'center', paddingVertical: 8, borderTopWidth: 1.2, borderTopColor: INK, marginTop: -0.5 }}>
            <View style={{ flexGrow: 1, flexBasis: 0, paddingHorizontal: 5 }}>
              <Text style={[{ fontSize: 9, fontWeight: 700 }, words]}>{t.totalRow}</Text>
            </View>
            <View style={[columnStyle('amount'), { paddingHorizontal: 5 }]}>
              <Text style={[{ fontSize: 10, fontWeight: 700, color: BRAND_INK }, latin('end')]}>{statementMoney(input.totals.amount)}</Text>
            </View>
          </View>
        </View>

        <View wrap={false} style={{ marginTop: 22, borderRadius: 8, backgroundColor: ZEBRA, borderWidth: 1, borderColor: LINE, ...(rtl ? { borderRightWidth: 3, borderRightColor: BRAND } : { borderLeftWidth: 3, borderLeftColor: BRAND }), paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={[{ fontSize: 8, fontWeight: 600, color: INK, marginBottom: 4 }, words]}>{t.legalTitle}</Text>
          <Text style={[{ fontSize: 8, color: SOFT, lineHeight: 1.55 }, words]}>{t.legal}</Text>
        </View>

        <View fixed style={{ position: 'absolute', bottom: 26, left: 40, right: 40, flexDirection: row, justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 8 }}>
          <View style={{ flexDirection: row, alignItems: 'center' }}>
            <Image src={logos.icon} style={{ width: FOOTER_ICON, height: FOOTER_ICON }} />
            <Text style={{ fontSize: 7.5, color: MUTED, direction: 'ltr', marginHorizontal: 6 }}>{`Homesta Cars · homestacars.com · ${input.number}`}</Text>
          </View>
          <Text
            // The page count is only known once laid out, so its width is set aside up front.
            style={[{ fontSize: 7.5, color: MUTED, width: 110 }, { direction: rtl ? 'rtl' : 'ltr', textAlign: end }]}
            render={({ pageNumber, totalPages }) => t.page.replace('{x}', String(pageNumber)).replace('{y}', String(totalPages))}
          />
        </View>
      </Page>
    </Document>
  );
};

/** The statement as a PDF file. `base` is where /fonts/pdf is served from. */
export async function renderStatementPdf(input: StatementInput, base: string = window.location.origin): Promise<Blob> {
  registerFonts(base);
  const [wordmark, icon] = await Promise.all([embedded('wordmarkLight', base), embedded('icon', base)]);
  return pdf(<Statement input={input} logos={{ wordmark, icon }} />).toBlob();
}

/** The logo as base64, so the PDF carries it; react-pdf fetches the file itself if that fails. */
async function embedded(asset: BrandAsset, base: string): Promise<string> {
  try {
    return await brandDataUrl(asset);
  } catch {
    return new URL(brandSrc(asset), base).href;
  }
}

export default Statement;
