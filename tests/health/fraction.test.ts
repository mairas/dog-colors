import { describe, expect, it } from 'vitest';
import { add, fraction, multiply, ONE, subtract, toNumber, ZERO } from '../../src/health/fraction.ts';

describe('fraction', () => {
  it('reduces to lowest terms with a positive denominator', () => {
    expect(fraction(2, 4)).toEqual({ numerator: 1, denominator: 2 });
    expect(fraction(3, -6)).toEqual({ numerator: -1, denominator: 2 });
    expect(fraction(0, 5)).toEqual(ZERO);
    expect(fraction(7)).toEqual({ numerator: 7, denominator: 1 });
  });

  it('adds, subtracts and multiplies exactly', () => {
    expect(add(fraction(1, 4), fraction(1, 4))).toEqual(fraction(1, 2));
    expect(subtract(ONE, fraction(1, 4))).toEqual(fraction(3, 4));
    expect(multiply(fraction(1, 2), fraction(1, 2))).toEqual(fraction(1, 4));
    expect(add(fraction(1, 3), fraction(1, 6))).toEqual(fraction(1, 2));
  });

  it('converts to a number for display', () => {
    expect(toNumber(fraction(3, 4))).toBe(0.75);
  });

  it('rejects a zero denominator and non-integer terms', () => {
    expect(() => fraction(1, 0)).toThrow();
    expect(() => fraction(0.5, 1)).toThrow();
  });
});
