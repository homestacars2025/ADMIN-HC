import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import HrOpeningsPage from './HrOpeningsPage';
import HrOpeningPage from './HrOpeningPage';
import { KnockoutRulesEditor, opsFor, ruleFields } from './KnockoutRulesEditor';
import type { Applicant, Opening } from '../../lib/recruitment/hr';
import type { KnockoutRule } from '../../lib/recruitment/model';

const mockListOpenings = jest.fn();
const mockGetOpening = jest.fn();
const mockListApplicants = jest.fn();
const mockMoveStage = jest.fn();
const mockSignedUrl = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../hooks/useCurrentProfile', () => ({ useCurrentProfile: () => ({ profile: { id: 'me', role: 'admin' } }) }));
jest.mock('../../lib/recruitment/hr', () => ({
  ...jest.requireActual('../../lib/recruitment/hr'),
  listOpenings: (...args: unknown[]) => mockListOpenings(...args),
  getOpening: (...args: unknown[]) => mockGetOpening(...args),
  listApplicants: (...args: unknown[]) => mockListApplicants(...args),
  listSlots: async () => [],
  getInterviewSettings: async () => null,
  listInterviews: async () => [],
  listActivities: async () => [],
  moveStage: (...args: unknown[]) => mockMoveStage(...args),
  signedFileUrl: (...args: unknown[]) => mockSignedUrl(...args),
}));

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: 'o1', title: 'Driver', department: 'Operations', description: null, status: 'published', publicSlug: 'driver-istanbul',
  formSchema: [{ key: 'has_license', type: 'yes_no', label: { en: 'Do you have a driving licence?', ar: 'هل لديك رخصة؟' }, required: true, options: [] }],
  interviewCriteria: [], interviewQuestions: [], knockoutRules: [], positionsCount: 2, publishedAt: null, closedAt: null,
  createdAt: '2026-11-01T09:00:00Z', applicantCount: 3, shortlistedCount: 1, ...over,
});

const applicant = (over: Partial<Applicant>): Applicant => ({
  id: 'a', openingId: 'o1', fullName: 'Ali Veli', age: 30, phone: '0532 111 22 33', email: null, nationality: 'Türkiye', residenceCity: 'İstanbul',
  residenceDistrict: 'Şişli', cvPath: null, attachments: [], answers: {}, stage: 'new', source: 'website', priority: 'medium', rating: null, notes: null,
  lostReason: null, knockoutFailed: false, knockoutReasons: [], duplicateOf: null, language: 'en', shortlisted: false, confirmation: 'pending',
  createdAt: '2026-11-02T09:00:00Z', ...over,
});

const APPLICANTS = [
  applicant({ id: 'a1', fullName: 'Ali Veli' }),
  applicant({ id: 'a2', fullName: 'Omar Said', stage: 'rejected', knockoutFailed: true, knockoutReasons: ['Under 21'], age: 19, language: 'ar', source: 'whatsapp' }),
  applicant({ id: 'a3', fullName: 'Ali Veli', duplicateOf: 'a1', attachments: [{ path: 'o1/a3/cv.pdf', slot: 'cv', name: 'cv' }, { path: 'o1/a3/license.jpg', slot: 'license', name: 'license' }] }),
];

const Where: React.FC = () => <span data-testid="where">{useLocation().search}</span>;
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/dashboard/hr" element={<HrOpeningsPage />} />
      <Route path="/dashboard/hr/openings/:id" element={<HrOpeningPage />} />
    </Routes>
    <Where />
  </MemoryRouter>,
);

beforeEach(() => {
  mockListOpenings.mockReset().mockResolvedValue([opening(), opening({ id: 'o2', title: 'Cleaner', status: 'draft', publicSlug: null, applicantCount: 0, shortlistedCount: 0 })]);
  mockGetOpening.mockReset().mockResolvedValue(opening());
  mockListApplicants.mockReset().mockResolvedValue(APPLICANTS);
  mockMoveStage.mockReset().mockResolvedValue('viewed');
  mockSignedUrl.mockReset().mockResolvedValue('https://signed.example/cv.pdf?token=1');
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
});

test('openings: status tiles filter, and a published one shows its public and WhatsApp links', async () => {
  renderAt('/dashboard/hr');
  const driver = await screen.findByRole('article', { name: 'Driver' });
  expect(driver).toHaveTextContent('homestacars.com/careers/driver-istanbul');
  await userEvent.click(within(driver).getByRole('button', { name: 'Copy WhatsApp link' }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://homestacars.com/careers/driver-istanbul?src=whatsapp');
  await userEvent.click(within(driver).getByRole('button', { name: 'Copy link' }));
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('https://homestacars.com/careers/driver-istanbul');
  await userEvent.click(screen.getByRole('button', { name: /^Drafts/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=draft');
  expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Cleaner']);
});

test('pipeline: Auto-rejected tile, badges, and the board moves a card by drag', async () => {
  renderAt('/dashboard/hr/openings/o1');
  const omar = await screen.findByRole('button', { name: 'Omar Said' });
  expect(within(omar).getByText('Auto-rejected')).toHaveAttribute('title', 'Auto-rejected: Under 21');
  expect(within(omar).getByText('AR')).toBeInTheDocument();
  expect(within(omar).getByText('WhatsApp')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Possible duplicate: open the earlier application' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /^Auto-rejected/ }));
  expect(screen.getByTestId('where')).toHaveTextContent('filter=auto_rejected');
  expect(screen.getAllByRole('button', { name: /^(Ali Veli|Omar Said)$/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Omar Said']);
  await userEvent.click(screen.getByRole('button', { name: /^Auto-rejected/ }));

  const data = new Map<string, string>();
  const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' };
  const ali = screen.getAllByRole('button', { name: 'Ali Veli' })[0];
  fireEvent.dragStart(ali, { dataTransfer });
  const viewed = screen.getByRole('region', { name: /^Viewed/ });
  fireEvent.dragOver(viewed, { dataTransfer });
  fireEvent.drop(viewed, { dataTransfer });
  await waitFor(() => expect(mockMoveStage).toHaveBeenCalledWith('a1', 'viewed', 'me'));
});

test('the possible duplicate opens the earlier application, whose files open only through a signed link', async () => {
  const open = jest.spyOn(window, 'open').mockReturnValue({ opener: null, location: { href: '' }, close: jest.fn() } as unknown as Window);
  renderAt('/dashboard/hr/openings/o1?applicant=a3');
  const drawer = await screen.findByRole('dialog', { name: 'Ali Veli' });
  expect(within(drawer).getByText('CV')).toBeInTheDocument();
  expect(within(drawer).getByText('Driving licence')).toBeInTheDocument();
  expect(within(drawer).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/905321112233');
  await userEvent.click(within(drawer).getAllByRole('button', { name: 'Open' })[0]);
  await waitFor(() => expect(mockSignedUrl).toHaveBeenCalledWith('o1/a3/cv.pdf'));
  await userEvent.click(within(drawer).getByRole('button', { name: 'Possible duplicate: open the earlier application' }));
  expect(screen.getByTestId('where')).toHaveTextContent('applicant=a1');
  open.mockRestore();
});

describe('the knock-out rules editor', () => {
  const schema = opening().formSchema;

  test('offers the fixed fields and the questions, and tests that fit them', () => {
    expect(ruleFields(schema).map((field) => field.key)).toEqual(['age', 'nationality', 'residence_city', 'residence_district', 'has_license']);
    expect(opsFor('yes_no')).toEqual(['eq', 'neq', 'empty']);
    expect(opsFor('number')).toContain('lt');
    expect(opsFor('text')).not.toContain('lt');
  });

  test('"no licence" is stored as the boolean false the endpoint compares', async () => {
    let rules: KnockoutRule[] = [];
    const onChange = jest.fn((next: KnockoutRule[]) => { rules = next; });
    const { rerender } = render(<KnockoutRulesEditor rules={rules} formSchema={schema} showErrors={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    expect(rules).toEqual([{ field: 'age', op: 'lt', value: 21, reason: 'Under 21' }]);
    rerender(<KnockoutRulesEditor rules={rules} formSchema={schema} showErrors={false} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rule 1 field' }), 'has_license');
    expect(rules[0]).toMatchObject({ field: 'has_license', op: 'eq', value: false });
  });
});
