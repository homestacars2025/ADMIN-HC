/**
 * Admin's words for the recruitment vocabulary. Admin is English only, so these live
 * here rather than in translations; `model.ts`, `hr.ts` and `interviews.ts` are kept
 * byte for byte as in Team (HC.TEAM src/lib/recruitment), so both apps read and write
 * the same tables the same way. Copy those three again to stay in step.
 */

import type { FilterTileTone } from '../../components/shared/FilterTile';
import type { InterviewConfirmation, KnockoutOp, OpeningStatus, Priority, QuestionType, Recommendation, RecruitmentStage } from './model';

export const STAGE_LABELS: Record<RecruitmentStage, string> = {
  new: 'New', viewed: 'Viewed', interview_invited: 'Interview invited', interviewed: 'Interviewed',
  rejected: 'Rejected', on_hold: 'On hold', hired: 'Hired', no_show: 'No show',
};

export const CONFIRMATION_LABELS: Record<InterviewConfirmation, string> = {
  pending: 'Awaiting reply', coming: 'Coming', not_coming: 'Not coming', no_response: 'No response',
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = { hire: 'Hire', reject: 'Reject', hold: 'Hold' };

export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', hot: 'Hot' };

export const SOURCE_LABELS: Record<string, string> = {
  website: 'Website', referral: 'Referral', linkedin: 'LinkedIn', instagram: 'Instagram', walk_in: 'Walk-in', agency: 'Agency', whatsapp: 'WhatsApp', other: 'Other',
};

/** `recruitment_applicants.language`: the language they applied in. */
export const LANGUAGE_LABELS: Record<string, string> = { ar: 'Arabic', en: 'English', tr: 'Turkish' };

export const OPENING_STATUS_LABELS: Record<OpeningStatus, string> = { draft: 'Draft', published: 'Published', closed: 'Closed' };

export const OPENING_STATUS_TONES: Record<OpeningStatus, { bg: string; ink: string; dot: string; tile: FilterTileTone }> = {
  draft: { bg: 'rgba(0,0,0,0.05)', ink: 'rgba(0,0,0,0.6)', dot: 'rgba(0,0,0,0.3)', tile: 'amber' },
  published: { bg: '#ECFDF5', ink: '#047857', dot: '#10B981', tile: 'green' },
  closed: { bg: '#F5F5F4', ink: '#57534E', dot: '#A8A29E', tile: 'slate' },
};

export const SLOT_STATUS_LABELS: Record<string, string> = { open: 'Open', booked: 'Booked', blocked: 'Blocked' };

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short text', long_text: 'Paragraph', number: 'Number', date: 'Date', phone: 'Phone', yes_no: 'Yes / No',
  single_choice: 'Single choice', multiple_choice: 'Multiple choice', file: 'File upload',
};

export const FILE_SLOT_LABELS: Record<string, string> = { cv: 'CV', license: 'Driving licence', id_document: 'ID document' };

export const FIXED_FIELD_LABELS: Record<string, string> = { age: 'Age', nationality: 'Nationality', residence_city: 'City', residence_district: 'District' };

export const KNOCKOUT_OP_LABELS: Record<KnockoutOp, string> = {
  lt: 'is less than', lte: 'is at most', gt: 'is more than', gte: 'is at least', eq: 'is', neq: 'is not', in: 'is one of', not_in: 'is none of', empty: 'is empty',
};

export const NOTE_TYPE_LABELS: Record<string, string> = {
  note: 'Note', call: 'Call', whatsapp: 'WhatsApp', email: 'Email', meeting: 'Meeting', stage_change: 'Stage', interview: 'Interview',
};

/** The builder's problems, by `openingProblem`'s key. */
export const OPENING_PROBLEMS: Record<string, string> = {
  title: 'Give the opening a title.',
  positions: 'Positions is a whole number, or empty.',
  question: 'Every question needs a label.',
  options: 'A choice question needs at least two options.',
  fileKey: 'A file question uploads the CV, the driving licence or the ID document, each once.',
  criterion: 'Every criterion needs a label.',
  weights: 'Give every criterion a weight adding up to 100, or leave them all empty.',
  rule: 'Finish every knock-out rule: a field, and a value unless it tests "is empty".',
};

export const RULE_PROBLEMS: Record<string, string> = { field: 'Pick a field.', value: 'Enter a value.', number: 'Enter a number.' };
