import {
  computeTaskStats,
  countStaffTasks,
  formatDue,
  isTaskOverdue,
  istanbulLocalToIso,
  nextOccurrence,
  normalizeTemplate,
  quickDueValue,
  recurrenceSentence,
  relativeDue,
  scheduleSummary,
  taskAssignee,
  templateError,
  type TemplateDraft,
} from './tasks';

const draft = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({
  title: 'Wash the fleet', description: null, department_key: 'operations', assignee_profile_id: null,
  frequency: 'daily', repeat_every: 1, weekdays: null, due_day: null, due_time: '18:00:00', duration_days: 0,
  start_date: '2026-11-01', end_date: null, max_occurrences: null, priority: 'normal', requires_proof: false,
  is_active: true, ...over,
});

describe('scheduleSummary', () => {
  it('describes daily schedules', () => {
    expect(scheduleSummary(draft())).toBe('Every day at 18:00');
    expect(scheduleSummary(draft({ repeat_every: 3 }))).toBe('Every 3 days at 18:00');
  });

  it('describes weekly schedules, with days in week order', () => {
    expect(scheduleSummary(draft({ frequency: 'weekly', weekdays: [3, 1] }))).toBe('Every week on Mon, Wed at 18:00');
    expect(scheduleSummary(draft({ frequency: 'weekly', weekdays: [5], repeat_every: 2 }))).toBe('Every 2 weeks on Fri at 18:00');
  });

  it('describes monthly schedules', () => {
    expect(scheduleSummary(draft({ frequency: 'monthly', due_day: 5 }))).toBe('Every month on day 5 at 18:00');
    expect(scheduleSummary(draft({ frequency: 'monthly', due_day: 28, repeat_every: 3 }))).toBe('Every 3 months on day 28 at 18:00');
  });
});

describe('templateError', () => {
  it('accepts a valid template', () => {
    expect(templateError(draft())).toBeNull();
  });

  it('matches the database checks', () => {
    expect(templateError(draft({ title: '  ' }))).not.toBeNull();
    expect(templateError(draft({ department_key: null }))).not.toBeNull();
    expect(templateError(draft({ frequency: 'weekly', weekdays: [] }))).not.toBeNull();
    expect(templateError(draft({ frequency: 'monthly', due_day: null }))).not.toBeNull();
    expect(templateError(draft({ frequency: 'monthly', due_day: 29 }))).not.toBeNull();
    expect(templateError(draft({ repeat_every: 0 }))).not.toBeNull();
    expect(templateError(draft({ duration_days: -1 }))).not.toBeNull();
    expect(templateError(draft({ max_occurrences: 0 }))).not.toBeNull();
    expect(templateError(draft({ end_date: '2026-10-01' }))).not.toBeNull();
  });
});

describe('normalizeTemplate', () => {
  it('drops fields the frequency does not use', () => {
    const daily = normalizeTemplate(draft({ weekdays: [1], due_day: 5 }));
    expect(daily.weekdays).toBeNull();
    expect(daily.due_day).toBeNull();
  });

  it('keeps one assignment, preferring the person', () => {
    expect(normalizeTemplate(draft({ assignee_profile_id: 'a' })).department_key).toBeNull();
  });
});

describe('due dates', () => {
  it('reads a form value as Istanbul time, whatever the browser zone', () => {
    expect(new Date(istanbulLocalToIso('2026-11-01T18:00')).toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });

  it('shows a due date in Istanbul time', () => {
    expect(formatDue('2026-11-01T15:00:00Z')).toContain('18:00');
    expect(formatDue(null)).toBe('No due date');
  });
});

describe('overdue and counts', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const past = '2026-10-30T12:00:00Z';
  const future = '2026-11-02T12:00:00Z';

  it('counts only open tasks past their due date as overdue', () => {
    expect(isTaskOverdue({ status: 'open', due_at: past }, now)).toBe(true);
    expect(isTaskOverdue({ status: 'open', due_at: future }, now)).toBe(false);
    expect(isTaskOverdue({ status: 'open', due_at: null }, now)).toBe(false);
    expect(isTaskOverdue({ status: 'done', due_at: past }, now)).toBe(false);
  });

  it('counts overdue inside open, not on top of it', () => {
    expect(countStaffTasks([
      { status: 'open', due_at: past },
      { status: 'open', due_at: future },
      { status: 'claimed', due_at: null },
      { status: 'done', due_at: past },
      { status: 'missed', due_at: past },
      { status: 'cancelled', due_at: past },
    ], now)).toEqual({ open: 3, done: 1, missed: 1, overdue: 1 });
  });
});

describe('taskAssignee', () => {
  const person = { id: 'a', full_name: 'A', avatar_url: null, gender: null };

  it('accepts the join as an object or an array', () => {
    expect(taskAssignee({ assignee: person })).toBe(person);
    expect(taskAssignee({ assignee: [person] })).toBe(person);
    expect(taskAssignee({ assignee: null })).toBeNull();
  });
});

describe('recurrenceSentence', () => {
  it('reads like a sentence', () => {
    expect(recurrenceSentence(draft({ frequency: 'weekly', weekdays: [4, 1] }), 'Operations'))
      .toBe('Repeats every Monday and Thursday at 18:00 for Operations, starting 1 Nov');
    expect(recurrenceSentence(draft({ repeat_every: 3 }), 'Omer')).toContain('every 3 days');
    expect(recurrenceSentence(draft({ frequency: 'monthly', due_day: 5, repeat_every: 2 }), '')).toContain('every 2 months on day 5');
  });
});

describe('nextOccurrence', () => {
  const today = '2026-11-02'; // a Monday

  it('finds the next daily step from the start date', () => {
    expect(nextOccurrence(draft({ start_date: '2026-11-01', repeat_every: 3 }), today)).toBe('2026-11-04');
    expect(nextOccurrence(draft({ start_date: '2026-11-01', repeat_every: 1 }), today)).toBe(today);
  });

  it('waits for a start date in the future', () => {
    expect(nextOccurrence(draft({ start_date: '2026-12-25' }), today)).toBe('2026-12-25');
  });

  it('finds the next chosen weekday, and today when it is one', () => {
    expect(nextOccurrence(draft({ frequency: 'weekly', weekdays: [4] }), today)).toBe('2026-11-05');
    expect(nextOccurrence(draft({ frequency: 'weekly', weekdays: [1] }), today)).toBe(today);
  });

  it('counts weeks by calendar week, like the generator', () => {
    // Started Sunday 1 Nov, so the 2nd falls in the week after and is skipped.
    const everyOther = draft({ frequency: 'weekly', weekdays: [1], repeat_every: 2, start_date: '2026-11-01' });
    expect(nextOccurrence(everyOther, today)).toBe('2026-11-09');
  });

  it('honours the months between runs', () => {
    expect(nextOccurrence(draft({ frequency: 'monthly', due_day: 15, repeat_every: 2, start_date: '2026-10-01' }), today)).toBe('2026-12-15');
  });

  it('returns nothing past the end date, or when switched off', () => {
    expect(nextOccurrence(draft({ start_date: '2026-10-01', end_date: '2026-10-31' }), today)).toBeNull();
    expect(nextOccurrence(draft({ is_active: false }), today)).toBeNull();
  });
});

describe('quickDueValue', () => {
  const saturday = new Date('2026-10-31T09:00:00Z');

  it('uses the Istanbul day', () => {
    expect(quickDueValue('today', new Date('2026-10-31T22:00:00Z'))).toBe('2026-11-01T18:00');
  });

  it('resolves each chip', () => {
    expect(quickDueValue('today', saturday)).toBe('2026-10-31T18:00');
    expect(quickDueValue('tomorrow', saturday)).toBe('2026-11-01T10:00');
    expect(quickDueValue('week_end', saturday)).toBe('2026-11-01T18:00');
    expect(quickDueValue('next_week', saturday)).toBe('2026-11-07T18:00');
  });
});

describe('relativeDue', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('describes time both ways', () => {
    expect(relativeDue('2026-10-31T14:00:00Z', now)).toBe('in 2 hours');
    expect(relativeDue('2026-10-29T12:00:00Z', now)).toBe('2 days ago');
  });

  it('is empty without a date', () => {
    expect(relativeDue(null, now)).toBe('');
  });
});

describe('computeTaskStats', () => {
  const now = new Date('2026-10-31T12:00:00Z'); // Saturday
  const row = (over: object) => ({
    status: 'open' as const, created_at: '2026-10-20T09:00:00Z', due_at: null, completed_at: null, missed_at: null,
    updated_at: '2026-10-20T09:00:00Z', ...over,
  });

  it('counts each tile', () => {
    const stats = computeTaskStats([
      row({}),
      row({ due_at: '2026-10-25T09:00:00Z' }),
      row({ status: 'done', completed_at: '2026-10-29T09:00:00Z' }), // this week
      row({ status: 'done', completed_at: '2026-10-20T09:00:00Z' }), // last week
      row({ status: 'missed', missed_at: '2026-10-02T09:00:00Z' }), // this month
      row({ status: 'missed', missed_at: '2026-09-28T09:00:00Z' }), // last month
    ], now);
    expect(stats).toMatchObject({ open: 2, overdue: 1, doneThisWeek: 1, missedThisMonth: 1 });
  });

  it('gives a 14-day trend that ends today', () => {
    const stats = computeTaskStats([row({ status: 'done', completed_at: '2026-10-31T09:00:00Z' })], now);
    expect(stats.trends.done).toHaveLength(14);
    expect(stats.trends.done[13]).toBe(1);
  });

  it('removes a closed task from the open trend after it closed', () => {
    const stats = computeTaskStats([row({ status: 'done', completed_at: '2026-10-25T09:00:00Z' })], now);
    expect(stats.trends.open[6]).toBe(1); // 24 Oct
    expect(stats.trends.open[13]).toBe(0);
  });
});
