import type { InboxItem } from './mail';
import {
  cleanLocalPart,
  fileKind,
  formatBytes,
  groupConversations,
  invalidAddress,
  listTime,
  normalizeSubject,
  participantsLabel,
  quoteBlock,
  replyRecipients,
  replySubject,
  splitAddresses,
} from './mailThreads';
import { isBlankHtml, sanitizeIncomingHtml, sanitizeOutgoingHtml } from './sanitizeEmail';

let seq = 0;
function msg(over: Partial<InboxItem>): InboxItem {
  seq += 1;
  return {
    id: `m${seq}`,
    direction: 'inbound',
    sendStatus: 'received',
    subject: 'Hello',
    fromEmail: 'guest@example.com',
    fromName: 'Guest',
    toEmails: ['info@homestacars.com'],
    emailDate: `2026-11-0${Math.min(seq, 9)}T10:00:00Z`,
    isRead: true,
    isArchived: false,
    isStarred: false,
    threadKey: null,
    sourceId: null,
    sourceName: null,
    sourceSlug: null,
    sourcePriority: null,
    contactId: null,
    contactName: null,
    preview: null,
    accountId: 'acc-info',
    accountSlug: 'homestacars-info',
    accountLabel: 'Info',
    accountEmail: 'info@homestacars.com',
    accountColor: '#9aa5b1',
    hasAttachments: false,
    messageId: null,
    inReplyTo: null,
    ...over,
  };
}

beforeEach(() => { seq = 0; });

describe('groupConversations', () => {
  it('groups by thread_key and orders messages oldest first, conversations newest first', () => {
    const a1 = msg({ threadKey: 't1', emailDate: '2026-11-01T10:00:00Z' });
    const b1 = msg({ threadKey: 't2', subject: 'Other', emailDate: '2026-11-03T10:00:00Z' });
    const a2 = msg({ threadKey: 't1', direction: 'outbound', emailDate: '2026-11-05T10:00:00Z' });
    const out = groupConversations([a2, b1, a1]);
    expect(out.map((c) => c.messages.map((m) => m.id))).toEqual([[a1.id, a2.id], [b1.id]]);
    expect(out[0].latest.id).toBe(a2.id);
    expect(out[0].hasOutbound && out[0].hasInbound).toBe(true);
  });

  it('links through in_reply_to when there is no thread_key', () => {
    const first = msg({ messageId: '<a@x>', subject: 'Quote' });
    const reply = msg({ inReplyTo: '<a@x>', subject: 'Totally different' });
    expect(groupConversations([first, reply])).toHaveLength(1);
  });

  it('falls back to subject only between the same parties', () => {
    const one = msg({ subject: 'Booking', fromEmail: 'a@x.com' });
    const two = msg({ subject: 'RE: Booking', fromEmail: 'a@x.com' });
    const stranger = msg({ subject: 'Booking', fromEmail: 'b@y.com' });
    const groups = groupConversations([one, two, stranger]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.messages.length === 2)?.messages.map((m) => m.id)).toEqual([one.id, two.id]);
  });

  it('counts unread inbound, stars and attachments per conversation', () => {
    const c = groupConversations([
      msg({ threadKey: 't', isRead: false }),
      msg({ threadKey: 't', isRead: false, hasAttachments: true }),
      msg({ threadKey: 't', direction: 'outbound', isRead: false, isStarred: true }),
    ])[0];
    expect(c.unreadCount).toBe(2);
    expect(c.starred).toBe(true);
    expect(c.hasAttachments).toBe(true);
  });
});

describe('participantsLabel', () => {
  it('names people in order, "me" for us, with a count', () => {
    const c = groupConversations([
      msg({ threadKey: 't', fromName: 'Ahmed' }),
      msg({ threadKey: 't', direction: 'outbound', toEmails: ['ahmed@x.com'] }),
    ])[0];
    expect(participantsLabel(c)).toBe('Ahmed, me (2)');
  });

  it('shows the recipient for a conversation only we have written in', () => {
    const c = groupConversations([msg({ direction: 'outbound', toEmails: ['partner@agency.com'] })])[0];
    expect(participantsLabel(c)).toBe('To: partner@agency.com');
  });
});

describe('replyRecipients', () => {
  const own = ['info@homestacars.com', 'partners@homestacars.com'];

  it('replies to the sender of received mail', () => {
    const m = msg({ fromEmail: 'guest@example.com', toEmails: ['info@homestacars.com', 'friend@example.com'] });
    expect(replyRecipients(m, ['boss@example.com'], own, 'reply')).toEqual({ to: ['guest@example.com'], cc: [] });
  });

  it('reply-all adds everyone else and never our own mailboxes', () => {
    const m = msg({ fromEmail: 'guest@example.com', toEmails: ['INFO@homestacars.com', 'friend@example.com'] });
    expect(replyRecipients(m, ['boss@example.com', 'partners@homestacars.com', 'guest@example.com'], own, 'replyAll'))
      .toEqual({ to: ['guest@example.com'], cc: ['friend@example.com', 'boss@example.com'] });
  });

  it('replying to our own sent mail goes back to its recipients', () => {
    const m = msg({ direction: 'outbound', fromEmail: null, toEmails: ['a@x.com', 'b@x.com'] });
    expect(replyRecipients(m, [], own, 'reply').to).toEqual(['a@x.com', 'b@x.com']);
  });

  it('forward starts empty', () => {
    expect(replyRecipients(msg({}), [], own, 'forward')).toEqual({ to: [], cc: [] });
  });
});

describe('subjects and quoting', () => {
  it('prefixes once', () => {
    expect(replySubject('Booking', 'reply')).toBe('Re: Booking');
    expect(replySubject('RE: Booking', 'replyAll')).toBe('RE: Booking');
    expect(replySubject('Booking', 'forward')).toBe('Fwd: Booking');
    expect(replySubject(null, 'reply')).toBe('Re:');
    expect(normalizeSubject('Re: Fwd: RE:  Booking ')).toBe('booking');
  });

  it('quotes with attribution and escapes the sender', () => {
    const html = quoteBlock(msg({ fromName: 'A<b>', fromEmail: 'a@x.com' }), '<p>hi</p>', 'reply', '1 Nov 2026');
    expect(html).toContain('On 1 Nov 2026, A&lt;b&gt; &lt;a@x.com&gt; wrote:');
    expect(html).toContain('<blockquote');
    const fwd = quoteBlock(msg({ subject: 'S' }), '<p>hi</p>', 'forward', 'd');
    expect(fwd).toContain('Forwarded message');
    expect(fwd).toContain('Subject: S');
  });
});

describe('formatting', () => {
  const now = new Date(2026, 10, 12, 15, 0, 0);
  it('listTime reads like a mail client', () => {
    expect(listTime(new Date(2026, 10, 12, 14, 59, 40).toISOString(), now)).toBe('now');
    expect(listTime(new Date(2026, 10, 12, 14, 55).toISOString(), now)).toBe('5m ago');
    expect(listTime(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toBe('6h ago');
    expect(listTime(new Date(2026, 10, 11, 23, 0).toISOString(), now)).toBe('Yesterday');
    expect(listTime(new Date(2026, 9, 2).toISOString(), now)).toBe('2 Oct');
    expect(listTime(new Date(2025, 9, 2).toISOString(), now)).toBe('2 Oct 2025');
    expect(listTime(null, now)).toBe('');
  });

  it('formats sizes and kinds', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
    expect(formatBytes(undefined)).toBeNull();
    expect(fileKind('UNS.pdf', 'application/pdf')).toBe('PDF');
    expect(fileKind('noext', 'image/png')).toBe('PNG');
  });

  it('validates addresses and cleans local parts', () => {
    expect(splitAddresses('a@x.com, b@y.org; c@z.io')).toEqual(['a@x.com', 'b@y.org', 'c@z.io']);
    expect(invalidAddress(['a@x.com', 'nope'])).toBe('nope');
    expect(invalidAddress(['a@x.com'])).toBeNull();
    expect(cleanLocalPart('Sales Team!')).toBe('salesteam');
    expect(cleanLocalPart('ops.ist_1-a')).toBe('ops.ist_1-a');
  });
});

describe('sanitizers', () => {
  it('strips scripts, handlers and forms from incoming mail but keeps styling', () => {
    const out = sanitizeIncomingHtml(
      '<style>p{color:red}</style><p onclick="x()" style="color:blue">Hi</p><script>alert(1)</script>' +
      '<form action="https://evil"><input name="pw"></form><a href="https://ok.com">ok</a><a href="javascript:alert(1)">bad</a>',
    );
    expect(out).not.toMatch(/script|onclick|<form|<input|javascript:/i);
    expect(out).toContain('style="color:blue"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('reduces outgoing HTML to formatting', () => {
    const out = sanitizeOutgoingHtml('<p><b>Hi</b><img src="x" onerror="y()"><iframe src="z"></iframe><style>*{}</style></p>');
    expect(out).toBe('<p><b>Hi</b><img src="x"></p>');
  });

  it('knows an empty editor', () => {
    expect(isBlankHtml('<div><br></div>')).toBe(true);
    expect(isBlankHtml('<p>&nbsp;</p>')).toBe(true);
    expect(isBlankHtml('<p>Hi</p>')).toBe(false);
  });
});
