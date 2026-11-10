import { describe, expect, it } from 'vitest';
import { ruleGap, ruleValue } from '@/composables/wickfleetFormat';

describe('ruleValue', () => {
  it('prices keep two decimals, small values four', () => {
    expect(ruleValue(87230.2)).toBe(
      (87230.2).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    expect(ruleValue(0.01)).toBe('0.01');
    expect(ruleValue(-0.00293172)).toBe('-0.0029');
    expect(ruleValue(1)).toBe('1.00');
    expect(ruleValue(0)).toBe('0');
  });
});

describe('ruleGap', () => {
  it('shows the needed move for an unmet price rule', () => {
    expect(ruleGap({ met: false, left: 83024.7, gap: 0.0506 })).toBe('+5.06%');
  });
  it('is empty when met or for a prediction', () => {
    expect(ruleGap({ met: true, left: 83024.7, gap: 0 })).toBe('');
    expect(ruleGap({ met: false, left: -0.0029, gap: 4.41 })).toBe('');
  });
});
