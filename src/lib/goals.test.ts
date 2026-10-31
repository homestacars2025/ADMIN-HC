import {
  buildTargetRows,
  goalSubline,
  goalValueText,
  missingLabel,
  ringFraction,
  targetError,
  type GoalMetric,
} from './goals';

describe('ringFraction', () => {
  it('fills to value over target', () => {
    expect(ringFraction({ value: 25, target: 50, status: 'progress' })).toBe(0.5);
  });

  it('stops at full when the target is beaten', () => {
    expect(ringFraction({ value: 61, target: 50, status: 'green' })).toBe(1);
  });

  it('stays empty with no data', () => {
    expect(ringFraction({ value: null, target: 100, status: 'none' })).toBe(0);
  });

  it('treats a target of zero as met, not as a division by zero', () => {
    expect(ringFraction({ value: 0, target: 0, status: 'green' })).toBe(1);
  });

  it('copes with the string numerics PostgREST can return', () => {
    expect(ringFraction({ value: '57.1' as unknown as number, target: '100' as unknown as number, status: 'red' })).toBeCloseTo(0.571);
  });
});

describe('goal text', () => {
  it('shows a count as is and a percent rounded', () => {
    expect(goalValueText({ value: 42, kind: 'count', status: 'progress' })).toBe('42');
    expect(goalValueText({ value: 57.1, kind: 'percent', status: 'red' })).toBe('57%');
  });

  it('shows a dash when there is no data', () => {
    expect(goalValueText({ value: null, kind: 'percent', status: 'none' })).toBe('—');
  });

  it('sublines a percent by its counts, and a count by its target', () => {
    expect(goalSubline({ kind: 'percent', numerator: 12, denominator: 16, target: 100 })).toBe('12 / 16');
    expect(goalSubline({ kind: 'count', numerator: 42, denominator: null, target: 50 })).toBe('42 / 50');
    expect(goalSubline({ kind: 'percent', numerator: 0, denominator: 0, target: 95 })).toBe('Target 95%');
  });
});

describe('missingLabel', () => {
  it('names checklist items and photos', () => {
    expect(missingLabel('customer_card')).toBe('Customer card');
    expect(missingLabel('photo:left_side')).toBe('Photo: left side');
  });

  it('shows an unknown item rather than hiding it', () => {
    expect(missingLabel('something_new')).toBe('something_new');
  });
});

describe('buildTargetRows', () => {
  const metric = (key: string): GoalMetric => ({ key, label_en: key, kind: 'percent', description_en: null, sort_order: 0 });
  const defaults = [{ department_key: 'ops', metric_key: 'a', target: 100 }];

  it('uses the department default when the employee has no target', () => {
    expect(buildTargetRows([metric('a')], 'ops', defaults, [])[0]).toMatchObject({ target: 100, hasOverride: false, active: true });
  });

  it('prefers the employee target', () => {
    const rows = buildTargetRows([metric('a')], 'ops', defaults, [{ metric_key: 'a', target: 90, is_active: true }]);
    expect(rows[0]).toMatchObject({ target: 90, defaultTarget: 100, hasOverride: true });
  });

  it('keeps a turned-off metric listed, so it can be turned back on', () => {
    const rows = buildTargetRows([metric('a')], 'ops', defaults, [{ metric_key: 'a', target: 100, is_active: false }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(false);
  });

  it('leaves a metric with no target unset', () => {
    expect(buildTargetRows([metric('b')], 'ops', defaults, [])[0].target).toBeNull();
  });
});

describe('targetError', () => {
  it('rejects negatives and percentages above 100', () => {
    expect(targetError('count', -1)).not.toBeNull();
    expect(targetError('percent', 101)).not.toBeNull();
  });

  it('accepts a count above 100', () => {
    expect(targetError('count', 150)).toBeNull();
  });
});
