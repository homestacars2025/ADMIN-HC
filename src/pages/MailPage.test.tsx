import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EmailAccount, EmailBody, InboxItem } from '../lib/mail';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/sources', () => ({ listSources: () => Promise.resolve([]) }));

const mockMail = {
  listAccounts: jest.fn(),
  listMailbox: jest.fn(),
  unreadByAccount: jest.fn(),
  getBodies: jest.fn(),
  setReadMany: jest.fn(),
  markUnread: jest.fn(),
  setArchivedMany: jest.fn(),
  setStarred: jest.fn(),
  deleteMessages: jest.fn(),
  searchMessageIds: jest.fn(),
  sendEmail: jest.fn(),
  createMailbox: jest.fn(),
  listTeamMembers: jest.fn(),
  listMailboxGrants: jest.fn(),
  subscribeToMail: jest.fn(),
};

jest.mock('../lib/mail', () => {
  const actual = jest.requireActual('../lib/mail');
  return {
    ...actual,
    listAccounts: (...a: unknown[]) => mockMail.listAccounts(...a),
    listMailbox: (...a: unknown[]) => mockMail.listMailbox(...a),
    unreadByAccount: (...a: unknown[]) => mockMail.unreadByAccount(...a),
    getBodies: (...a: unknown[]) => mockMail.getBodies(...a),
    setReadMany: (...a: unknown[]) => mockMail.setReadMany(...a),
    markUnread: (...a: unknown[]) => mockMail.markUnread(...a),
    setArchivedMany: (...a: unknown[]) => mockMail.setArchivedMany(...a),
    setStarred: (...a: unknown[]) => mockMail.setStarred(...a),
    deleteMessages: (...a: unknown[]) => mockMail.deleteMessages(...a),
    searchMessageIds: (...a: unknown[]) => mockMail.searchMessageIds(...a),
    sendEmail: (...a: unknown[]) => mockMail.sendEmail(...a),
    createMailbox: (...a: unknown[]) => mockMail.createMailbox(...a),
    listTeamMembers: (...a: unknown[]) => mockMail.listTeamMembers(...a),
    listMailboxGrants: (...a: unknown[]) => mockMail.listMailboxGrants(...a),
    subscribeToMail: (...a: unknown[]) => mockMail.subscribeToMail(...a),
  };
});

// eslint-disable-next-line import/first
import MailPage from './MailPage';

const ACCOUNTS: EmailAccount[] = [
  { id: 'acc-p', slug: 'homestacars-partners', emailAddress: 'partners@homestacars.com', label: 'Homesta Cars — Partnerships', color: '#6ea4e7', isDefault: false, sortOrder: 1 },
  { id: 'acc-i', slug: 'homestacars-info', emailAddress: 'info@homestacars.com', label: 'Homesta Cars — Info / Customers', color: '#9aa5b1', isDefault: true, sortOrder: 2 },
];

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: 'x', direction: 'inbound', sendStatus: 'received', subject: 'Subject', fromEmail: 'ali@example.com', fromName: 'Ali Hassan',
  toEmails: ['info@homestacars.com'], emailDate: '2026-11-10T10:00:00Z', isRead: true, isArchived: false, isStarred: false,
  threadKey: null, sourceId: null, sourceName: null, sourceSlug: null, sourcePriority: null, contactId: null, contactName: null,
  preview: 'Hello there', accountId: 'acc-i', accountSlug: 'homestacars-info', accountLabel: null, accountEmail: 'info@homestacars.com',
  accountColor: '#9aa5b1', messageId: null, inReplyTo: null, hasAttachments: false, ...over,
});

const ITEMS: InboxItem[] = [
  item({ id: 'q1', subject: 'Quote for May', threadKey: 't-quote', emailDate: '2026-11-09T09:00:00Z', messageId: '<q1@ex>', preview: 'Can you quote a Passat?' }),
  item({ id: 'q2', subject: 'Re: Quote for May', threadKey: 't-quote', direction: 'outbound', sendStatus: 'sent', fromEmail: null, fromName: null, toEmails: ['ali@example.com'], emailDate: '2026-11-09T12:00:00Z', preview: 'Yes, 1,500 TRY a day' }),
  item({ id: 'q3', subject: 'Re: Quote for May', threadKey: 't-quote', emailDate: '2026-11-10T08:00:00Z', isRead: false, hasAttachments: true, messageId: '<q3@ex>', preview: 'Great, attached my licence' }),
  item({ id: 'p1', subject: 'Partnership', fromEmail: 'sara@agency.com', fromName: 'Sara', toEmails: ['partners@homestacars.com'], accountId: 'acc-p', accountEmail: 'partners@homestacars.com', emailDate: '2026-11-08T08:00:00Z', preview: 'Our agency would like to partner' }),
  item({ id: 'a1', subject: 'Old invoice', fromName: 'Omar', fromEmail: 'omar@example.com', isArchived: true, emailDate: '2026-10-01T08:00:00Z' }),
];

const body = (id: string, over: Partial<EmailBody> = {}): EmailBody => ({
  id, bodyHtml: `<p>Body of ${id}</p><script>window.bad = 1</script>`, bodyText: null, ccEmails: [], messageId: `<${id}@ex>`, inReplyTo: null,
  attachments: [], matchedBy: null, ...over,
});

function renderPage(path = '/dashboard/mail') {
  return render(<MemoryRouter initialEntries={[path]}><MailPage /></MemoryRouter>);
}

beforeEach(() => {
  Object.values(mockMail).forEach((fn) => fn.mockReset());
  mockMail.listAccounts.mockResolvedValue(ACCOUNTS);
  mockMail.listMailbox.mockResolvedValue(ITEMS);
  mockMail.unreadByAccount.mockResolvedValue({ 'acc-i': 1, 'acc-p': 0 });
  mockMail.getBodies.mockImplementation((ids: string[]) => Promise.resolve(Object.fromEntries(ids.map((id) => [id, body(id, id === 'q3' ? { attachments: [{ name: 'Licence.pdf', type: 'application/pdf', size: 204800, url: null }], ccEmails: ['partners@homestacars.com', 'omar@example.com'] } : {})]))));
  mockMail.setReadMany.mockResolvedValue(undefined);
  mockMail.setArchivedMany.mockResolvedValue(undefined);
  mockMail.deleteMessages.mockResolvedValue(undefined);
  mockMail.searchMessageIds.mockResolvedValue(new Set());
  mockMail.subscribeToMail.mockReturnValue(() => undefined);
  mockMail.listTeamMembers.mockResolvedValue([{ profileId: 'u1', fullName: 'Lina', email: 'lina@hc.com', avatarUrl: null, avatarBg: null, gender: null, position: 'Ops' }]);
  mockMail.listMailboxGrants.mockResolvedValue([]);
});

const list = () => screen.getByRole('region', { name: 'Conversations' });

it('threads the conversation and hides what is archived', async () => {
  renderPage();
  await waitFor(() => expect(within(list()).getByText('Quote for May')).toBeInTheDocument());
  // Three messages, one row, with the count beside the people.
  expect(within(list()).getAllByText('Quote for May')).toHaveLength(1);
  expect(within(list()).getByText('3')).toBeInTheDocument();
  expect(within(list()).getByText('Partnership')).toBeInTheDocument();
  expect(within(list()).queryByText('Old invoice')).not.toBeInTheDocument();
});

it('keeps the folder in the URL and shows archived mail there', async () => {
  renderPage('/dashboard/mail?folder=archived');
  await waitFor(() => expect(within(list()).getByText('Old invoice')).toBeInTheDocument());
  expect(within(list()).queryByText('Quote for May')).not.toBeInTheDocument();
});

it('filters to one mailbox from the URL', async () => {
  renderPage('/dashboard/mail?box=acc-p');
  await waitFor(() => expect(within(list()).getByText('Partnership')).toBeInTheDocument());
  expect(within(list()).queryByText('Quote for May')).not.toBeInTheDocument();
});

it('opens a conversation: bodies in one request, scripts stripped, unread marked read, attachments shown', async () => {
  renderPage();
  fireEvent.click(await within(list()).findByText('Quote for May'));
  const reader = screen.getByRole('region', { name: 'Conversation' });
  await waitFor(() => expect(mockMail.getBodies).toHaveBeenCalledWith(['q1', 'q2', 'q3']));
  expect(mockMail.setReadMany).toHaveBeenCalledWith(['q3'], true);
  await waitFor(() => expect(within(reader).getByText('Licence.pdf')).toBeInTheDocument());
  expect(within(reader).getByText('PDF · 200 KB')).toBeInTheDocument();
  const frames = reader.querySelectorAll('iframe');
  expect(frames.length).toBeGreaterThan(0);
  frames.forEach((frame) => {
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    expect(frame.getAttribute('srcdoc')).not.toContain('<script');
  });
});

it('holds back remote images until asked, and offers the plain-text version', async () => {
  mockMail.getBodies.mockImplementation((ids: string[]) => Promise.resolve(Object.fromEntries(ids.map((id) => [id, body(id, id === 'q3'
    ? { bodyHtml: '<p>See the car</p><img src="https://cdn.example/car.jpg" alt="car">', bodyText: 'See the car (plain)' }
    : {})]))));
  renderPage();
  fireEvent.click(await within(list()).findByText('Quote for May'));
  const reader = screen.getByRole('region', { name: 'Conversation' });
  await within(reader).findByText('Images are hidden to protect your privacy.');
  const frameFor = (needle: string) => Array.from(reader.querySelectorAll('iframe')).find((f) => (f.getAttribute('srcdoc') ?? '').includes(needle));
  const before = frameFor('See the car');
  expect(before?.getAttribute('srcdoc')).not.toContain('https://cdn.example/car.jpg');
  expect(before?.getAttribute('srcdoc')).toContain('Content-Security-Policy');

  fireEvent.click(within(reader).getByRole('button', { name: 'Load images' }));
  expect(within(reader).queryByText('Images are hidden to protect your privacy.')).not.toBeInTheDocument();
  expect(frameFor('See the car')?.getAttribute('srcdoc')).toContain('https://cdn.example/car.jpg');

  fireEvent.click(within(reader).getByRole('button', { name: 'Plain text' }));
  expect(frameFor('See the car (plain)')).toBeDefined();
  expect(within(reader).getByRole('button', { name: 'Formatted view' })).toHaveAttribute('aria-pressed', 'true');
});

it('reply all goes to the sender and the others on it, quotes the original, and stays in the mailbox', async () => {
  renderPage();
  fireEvent.click(await within(list()).findByText('Quote for May'));
  await waitFor(() => expect(screen.getByText('Licence.pdf')).toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: 'Reply all' })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Reply all' });
  expect(within(dialog).getByDisplayValue('ali@example.com')).toBeInTheDocument();
  // Our own partners@ address is dropped from Cc.
  expect(within(dialog).getByDisplayValue('omar@example.com')).toBeInTheDocument();
  expect(within(dialog).getByDisplayValue('Re: Quote for May')).toBeInTheDocument();
  expect(within(dialog).getByText(/info@homestacars\.com/)).toBeInTheDocument();
  const editor = within(dialog).getByRole('textbox', { name: 'Message' });
  expect(editor.innerHTML).toContain('wrote:');
  expect(editor.innerHTML).toContain('Body of q3');
  expect(editor.innerHTML).not.toContain('<script');
});

it('sends a reply with the thread and In-Reply-To set', async () => {
  mockMail.sendEmail.mockResolvedValue('new-row');
  renderPage();
  fireEvent.click(await within(list()).findByText('Quote for May'));
  await waitFor(() => expect(screen.getByText('Licence.pdf')).toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Reply' });
  const editor = within(dialog).getByRole('textbox', { name: 'Message' });
  editor.innerHTML = `<p>Thanks Ali</p>${editor.innerHTML}`;
  fireEvent.input(editor);
  fireEvent.click(within(dialog).getByRole('button', { name: /send/i }));
  await waitFor(() => expect(mockMail.sendEmail).toHaveBeenCalled());
  const sent = mockMail.sendEmail.mock.calls[0][0];
  expect(sent).toMatchObject({ to: 'ali@example.com', subject: 'Re: Quote for May', threadKey: 't-quote', inReplyTo: '<q3@ex>', accountId: 'acc-i', accountSlug: 'homestacars-info' });
  expect(sent.bodyHtml).toContain('Thanks Ali');
});

it('deletes only after confirming', async () => {
  renderPage();
  fireEvent.click(await within(list()).findByText('Partnership'));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete conversation' }));
  const confirm = await screen.findByRole('alertdialog');
  expect(mockMail.deleteMessages).not.toHaveBeenCalled();
  // The reload that follows reads the server, where it is gone.
  mockMail.listMailbox.mockResolvedValue(ITEMS.filter((m) => m.id !== 'p1'));
  await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' })); });
  expect(mockMail.deleteMessages).toHaveBeenCalledWith(['p1']);
  await waitFor(() => expect(within(list()).queryByText('Partnership')).not.toBeInTheDocument());
});

it('searches as you type, including the full text from the server', async () => {
  mockMail.searchMessageIds.mockResolvedValue(new Set(['p1']));
  renderPage();
  await within(list()).findByText('Quote for May');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search mail' }), { target: { value: 'passat' } });
  expect(within(list()).getByText('Quote for May')).toBeInTheDocument();
  expect(within(list()).queryByText('Partnership')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search mail' }), { target: { value: 'commission' } });
  await waitFor(() => expect(within(list()).getByText('Partnership')).toBeInTheDocument());
  expect(mockMail.searchMessageIds).toHaveBeenCalledWith('commission', null);
});

it('announces new mail once when it arrives, and shows it without a refresh', async () => {
  let push: (change: { event: string; row: Record<string, unknown> }) => void = () => undefined;
  mockMail.subscribeToMail.mockImplementation((handler: typeof push) => { push = handler; return () => undefined; });
  renderPage();
  await within(list()).findByText('Quote for May');
  expect(screen.queryByText(/New mail from/)).not.toBeInTheDocument();

  const arrived = item({ id: 'n1', subject: 'Airport pickup', fromName: 'Maya', fromEmail: 'maya@example.com', isRead: false, emailDate: '2026-11-11T09:00:00Z' });
  mockMail.listMailbox.mockResolvedValue([...ITEMS, arrived]);
  act(() => { push({ event: 'INSERT', row: { id: 'n1', account_id: 'acc-i', direction: 'inbound' } }); });

  await waitFor(() => expect(within(list()).getByText('Airport pickup')).toBeInTheDocument());
  expect(screen.getByText('New mail from Maya — Airport pickup')).toBeInTheDocument();
  // A second reload with nothing new says nothing more.
  act(() => { push({ event: 'UPDATE', row: { id: 'n1', account_id: 'acc-i' } }); });
  await waitFor(() => expect(mockMail.listMailbox).toHaveBeenCalledTimes(3));
  expect(screen.getAllByText('New mail from Maya — Airport pickup')).toHaveLength(1);
});

it('creates a mailbox with a live address preview, then opens it', async () => {
  mockMail.createMailbox.mockResolvedValue({ id: 'acc-s', email: 'sales@homestacars.com', slug: 'homestacars-sales', label: 'Sales' });
  renderPage();
  await within(list()).findByText('Quote for May');
  fireEvent.click(screen.getAllByRole('button', { name: 'New mailbox' })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'New mailbox' });
  fireEvent.change(within(dialog).getByLabelText('Address, the part before @'), { target: { value: 'Sales Team' } });
  expect(within(dialog).getByText('salesteam@homestacars.com')).toBeInTheDocument();
  expect(within(dialog).getByText(/ready straight away/)).toBeInTheDocument();
  fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Give Lina access' }));
  mockMail.listAccounts.mockResolvedValue([...ACCOUNTS, { id: 'acc-s', slug: 'homestacars-sales', emailAddress: 'sales@homestacars.com', label: 'Sales', color: '#6ea4e7', isDefault: false, sortOrder: 3 }]);
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /create mailbox/i })); });
  expect(mockMail.createMailbox).toHaveBeenCalledWith({ localPart: 'salesteam', label: '', color: '#6ea4e7', grantProfiles: ['u1'] });
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sales'));
});
