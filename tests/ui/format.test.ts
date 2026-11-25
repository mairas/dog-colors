import { describe, expect, it } from 'vitest';
import { fraction } from '../../src/health/fraction.ts';
import { chance, chanceParts } from '../../src/ui/format.ts';

const single = (numerator: number, denominator: number) => ({
  min: fraction(numerator, denominator),
  max: fraction(numerator, denominator),
});

describe('chance', () => {
  it.each([
    [1, 2, '50% (1 in 2)'],
    [1, 1, '100% (all)'],
    [0, 1, '0%'],
    [3, 4, '75% (3 in 4)'],
    [1, 16, '6% (1 in 16)'],
    [3, 8, '38% (about 1 in 3)'],
    [3, 16, '19% (about 1 in 5)'],
    [9, 16, '56% (about 6 in 10)'],
    [1, 256, '<1% (1 in 256)'],
    [255, 256, '>99% (nearly all)'],
  ])('shows %i/%i as %s', (numerator, denominator, text) => {
    expect(chance(single(numerator, denominator))).toBe(text);
  });

  it('shows a range as its bounds without odds', () => {
    expect(chance({ min: fraction(1, 2), max: fraction(1) })).toBe('50–100%');
    expect(chance({ min: fraction(0), max: fraction(1, 4) })).toBe('0–25%');
  });

  it('splits a single figure into percentage and odds for the outcome chips', () => {
    expect(chanceParts(single(1, 4))).toEqual({ figure: '25%', odds: '1 in 4' });
    expect(chanceParts({ min: fraction(1, 4), max: fraction(1, 2) })).toEqual({ figure: '25–50%', odds: null });
  });
});
