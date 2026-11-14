import { avatarTint, channelLine, continuesRun, fileExtension, formatDuration, linkify, listTime, previewParts } from './inbox';

describe('previewParts', () => {
  it('turns the webhook\'s media previews into a kind and a plain word', () => {
    expect(previewParts('🎵 Audio')).toEqual({ kind: 'audio', text: 'Voice message' });
    expect(previewParts('📷 Image')).toEqual({ kind: 'image', text: 'Photo' });
    expect(previewParts('📄 Document')).toEqual({ kind: 'document', text: 'Document' });
    expect(previewParts('🎥 Video')).toEqual({ kind: 'video', text: 'Video' });
  });

  it('leaves real text alone, on one line', () => {
    expect(previewParts('مرحباً 👋\nهذا رقم آلي')).toEqual({ kind: null, text: 'مرحباً 👋 هذا رقم آلي' });
    expect(previewParts('Audio file attached tomorrow')).toEqual({ kind: null, text: 'Audio file attached tomorrow' });
    expect(previewParts(null)).toEqual({ kind: null, text: 'No messages yet' });
  });
});

describe('linkify', () => {
  it('finds links and phone numbers, and leaves short numbers as text', () => {
    expect(linkify('See https://homestacars.com/cars/tucson. Call +90 555 111 22 33 at 14:30, 2,450₺')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'url', value: 'https://homestacars.com/cars/tucson' },
      { kind: 'text', value: '. Call ' },
      { kind: 'phone', value: '+90 555 111 22 33' },
      { kind: 'text', value: ' at 14:30, 2,450₺' },
    ]);
  });
});

describe('list and thread helpers', () => {
  it('times the list like a phone: today a clock, then Yesterday, a weekday, a date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T13:40:00'));
    expect(listTime('2026-11-14T09:05:00')).toBe('09:05');
    expect(listTime('2026-11-13T22:00:00')).toBe('Yesterday');
    expect(listTime('2026-11-10T08:00:00')).toBe('Tue');
    expect(listTime('2026-08-17T11:00:00')).toBe('17 Aug');
    jest.useRealTimers();
  });

  it('names the channel once: "WhatsApp · HomestaCars"', () => {
    expect(channelLine({ id: 'c', type: 'whatsapp', display_name: 'HomestaCars WhatsApp' })).toBe('WhatsApp · HomestaCars');
    expect(channelLine({ id: 'c', type: 'whatsapp', display_name: 'WhatsApp' })).toBe('WhatsApp');
    expect(channelLine(null)).toBe('Direct');
  });

  it('runs messages from one side within five minutes, never across sides or days', () => {
    const at = (direction: 'inbound' | 'outbound', created_at: string) => ({ direction, created_at });
    expect(continuesRun(at('inbound', '2026-11-14T13:37:00'), at('inbound', '2026-11-14T13:38:00'))).toBe(true);
    expect(continuesRun(at('inbound', '2026-11-14T13:30:00'), at('inbound', '2026-11-14T13:38:00'))).toBe(false);
    expect(continuesRun(at('inbound', '2026-11-14T13:37:00'), at('outbound', '2026-11-14T13:38:00'))).toBe(false);
    expect(continuesRun(undefined, at('inbound', '2026-11-14T13:38:00'))).toBe(false);
  });

  it('keeps one color per name, and formats durations and file types', () => {
    expect(avatarTint('أحمد المنصوري')).toEqual(avatarTint('أحمد المنصوري'));
    expect(formatDuration(23)).toBe('0:23');
    expect(formatDuration(725)).toBe('12:05');
    expect(fileExtension('Rental-agreement.pdf')).toBe('PDF');
    expect(fileExtension(null, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX');
  });
});
