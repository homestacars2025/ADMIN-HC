import React from 'react';
import { Plus, Trash2 } from '../../components/media/MediaIcons';
import { Button } from '../../components/media/MediaUI';
import { cn } from '../../lib/media/badgeColor';
import {
  FIXED_FIELDS,
  KNOCKOUT_OPS,
  LIST_OPS,
  NUMERIC_OPS,
  optionValue,
  pickLabel,
  ruleProblem,
  ruleValueFrom,
  ruleValueText,
  type FormField,
  type KnockoutOp,
  type KnockoutRule,
  type QuestionType,
} from '../../lib/recruitment/model';
import { FIXED_FIELD_LABELS, KNOCKOUT_OP_LABELS, RULE_PROBLEMS } from '../../lib/recruitment/labels';
import { INPUT } from '../bookings/ui';

type FieldKind = QuestionType | 'number' | 'text';

interface RuleField {
  key: string;
  label: string;
  kind: FieldKind;
  options: string[];
}

/** The fixed fields every form asks, then the opening's own questions, files aside. */
export function ruleFields(formSchema: readonly FormField[]): RuleField[] {
  const fixed = FIXED_FIELDS.map((key) => ({ key, label: FIXED_FIELD_LABELS[key], kind: (key === 'age' ? 'number' : 'text') as FieldKind, options: [] }));
  const questions = formSchema.filter((field) => field.type !== 'file').map((field) => ({
    key: field.key,
    label: pickLabel(field.label, 'en') || field.key,
    kind: field.type,
    options: field.options.map(optionValue),
  }));
  return [...fixed, ...questions];
}

/** What a field can be tested with: numbers compare, yes/no is one or the other, text matches. */
export function opsFor(kind: FieldKind): KnockoutOp[] {
  if (kind === 'number') return [...KNOCKOUT_OPS];
  if (kind === 'yes_no') return ['eq', 'neq', 'empty'];
  return ['eq', 'neq', 'in', 'not_in', 'empty'];
}

const SELECT = cn(INPUT, 'cursor-pointer');

/**
 * `recruitment_openings.knockout_rules`. The application endpoint checks every rule on
 * submit; a hit marks the applicant auto-rejected with the reason, for HR to review.
 */
export const KnockoutRulesEditor: React.FC<{
  rules: KnockoutRule[];
  formSchema: FormField[];
  showErrors: boolean;
  onChange: (next: KnockoutRule[]) => void;
}> = ({ rules, formSchema, showErrors, onChange }) => {
  const fields = ruleFields(formSchema);
  const fieldOf = (key: string) => fields.find((field) => field.key === key);
  const set = (index: number, patch: Partial<KnockoutRule>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  const changeField = (index: number, key: string) => {
    const kind = fieldOf(key)?.kind ?? 'text';
    const op = opsFor(kind).includes(rules[index].op) ? rules[index].op : opsFor(kind)[0];
    set(index, { field: key, op, value: kind === 'yes_no' && (op === 'eq' || op === 'neq') ? false : null });
  };

  const changeOp = (index: number, op: KnockoutOp) => {
    const rule = rules[index];
    const kind = fieldOf(rule.field)?.kind ?? 'text';
    set(index, { op, value: ruleValueFrom(ruleValueText(rule), op, kind) });
  };

  return (
    <div>
      {rules.length === 0 ? (
        <p className="rounded-[12px] bg-black/[0.03] px-3 py-3 text-[12.5px] text-black/50">No rules: every application lands in New. Add one to set aside, for example, applicants under 21 or without a driving licence.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rules.map((rule, index) => {
            const field = fieldOf(rule.field);
            const kind = field?.kind ?? 'text';
            const problem = showErrors ? ruleProblem(rule) : null;
            const valueText = ruleValueText(rule);
            return (
              // eslint-disable-next-line react/no-array-index-key -- rules have no key of their own
              <li key={index} className={cn('rounded-[14px] border bg-white p-3', problem ? 'border-[#DC2626]/40' : 'border-subtle')}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <select aria-label={`Rule ${index + 1} field`} className={SELECT} value={rule.field} onChange={(event) => changeField(index, event.target.value)}>
                    <option value="">Field…</option>
                    {fields.map((option) => <option key={option.key} value={option.key}>{option.label}{FIXED_FIELDS.includes(option.key as typeof FIXED_FIELDS[number]) ? '' : ` (${option.key})`}</option>)}
                    {rule.field && !field && <option value={rule.field}>{rule.field} (not on the form)</option>}
                  </select>
                  <select aria-label={`Rule ${index + 1} test`} className={SELECT} value={rule.op} onChange={(event) => changeOp(index, event.target.value as KnockoutOp)}>
                    {opsFor(kind).map((op) => <option key={op} value={op}>{KNOCKOUT_OP_LABELS[op]}</option>)}
                    {!opsFor(kind).includes(rule.op) && <option value={rule.op}>{KNOCKOUT_OP_LABELS[rule.op]}</option>}
                  </select>
                  {rule.op === 'empty' ? (
                    <span className="flex h-11 items-center px-1 text-[12.5px] text-black/40 md:h-10">No value</span>
                  ) : kind === 'yes_no' && !LIST_OPS.includes(rule.op) && !NUMERIC_OPS.includes(rule.op) ? (
                    <select aria-label={`Rule ${index + 1} value`} className={SELECT} value={valueText} onChange={(event) => set(index, { value: ruleValueFrom(event.target.value, rule.op, kind) })}>
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`Rule ${index + 1} value`}
                      className={cn(INPUT, NUMERIC_OPS.includes(rule.op) && 'tabular-nums')}
                      inputMode={NUMERIC_OPS.includes(rule.op) || kind === 'number' ? 'decimal' : undefined}
                      placeholder={LIST_OPS.includes(rule.op) ? (field?.options.length ? field.options.slice(0, 3).join(', ') : 'Comma separated') : NUMERIC_OPS.includes(rule.op) ? '21' : 'Value'}
                      defaultValue={valueText}
                      key={`${rule.field}-${rule.op}`}
                      onChange={(event) => set(index, { value: ruleValueFrom(event.target.value, rule.op, kind) })}
                    />
                  )}
                  <button type="button" aria-label={`Remove rule ${index + 1}`} onClick={() => onChange(rules.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center justify-self-end rounded-[10px] text-black/40 hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C] md:h-10 md:w-10">
                    <Trash2 size={15} />
                  </button>
                </div>
                <input aria-label={`Rule ${index + 1} reason`} dir="auto" className={cn(INPUT, 'mt-2')} placeholder="Reason HR sees, e.g. Under 21" value={rule.reason} onChange={(event) => set(index, { reason: event.target.value })} />
                {LIST_OPS.includes(rule.op) && field?.options.length ? <p className="mt-1 text-[11.5px] text-black/45">Options: {field.options.join(', ')}</p> : null}
                {problem && <p role="alert" className="mt-1 text-[12px] text-[#B91C1C]">{RULE_PROBLEMS[problem]}</p>}
              </li>
            );
          })}
        </ol>
      )}
      <Button type="button" variant="ghost" size="sm" className="mt-2 !h-11 text-brand-strong md:!h-8" onClick={() => onChange([...rules, { field: 'age', op: 'lt', value: 21, reason: 'Under 21' }])}>
        <Plus size={14} /> Add rule
      </Button>
    </div>
  );
};
