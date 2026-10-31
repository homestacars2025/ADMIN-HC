import {
  countStaffTasks,
  formatDue,
  isTaskOverdue,
  istanbulLocalToIso,
  normalizeTemplate,
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
