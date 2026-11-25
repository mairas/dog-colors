import { describe, expect, it } from 'vitest';
import { fraction, toNumber } from '../../src/health/fraction.ts';
import { chance, chanceParts, odds, showsRange } from '../../src/ui/format.ts';

/** The share odds without numbers state: "nearly all" sits between 9 in 10 and all. */
const STATED: Readonly<Record<string, number>> = { 'nearly all': 0.95, all: 1 };

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
    [5, 16, '31% (about 1 in 3)'],
    [3, 8, '38% (about 4 in 10)'],
    [7, 16, '44% (about 4 in 10)'],
    [15, 32, '47% (about 5 in 10)'],
    [3, 16, '19% (about 1 in 5)'],
    [9, 16, '56% (about 6 in 10)'],
    [1, 256, '<1% (1 in 256)'],
    [255, 256, '>99% (nearly all)'],
    [1, 3, '33% (1 in 3)'],
    [11, 32, '34% (about 1 in 3)'],
    [21, 32, '66% (about 2 in 3)'],
    [2, 3, '67% (2 in 3)'],
    [23, 32, '72% (about 7 in 10)'],
  ])('shows %i/%i as %s', (numerator, denominator, text) => {
    expect(chance(single(numerator, denominator))).toBe(text);
  });

  it('never states lower odds for a higher share', () => {
    const shares = [32, 64, 96, 256]
      .flatMap((denominator) => Array.from({ length: denominator }, (_, index) => fraction(index + 1, denominator)))
      .toSorted((left, right) => toNumber(left) - toNumber(right));
    const stated = shares.map((share) => {
      const text = odds(share) ?? '';
      const match = /^(?:about )?(\d+) in (\d+)$/.exec(text);
      const value = match === null ? STATED[text] : Number(match[1]) / Number(match[2]);
      if (value === undefined) {
        throw new Error(`unexpected odds "${text}"`);
      }
      return { share: `${share.numerator}/${share.denominator}`, text, value };
    });
    const falls = stated.slice(1).filter((current, index) => current.value < (stated[index]?.value ?? 0));
    expect(falls.map((current) => `${current.share}: ${current.text}`)).toEqual([]);
  });

  it('shows a range as its bounds without odds', () => {
    expect(chance({ min: fraction(1, 2), max: fraction(1) })).toBe('50–100%');
    expect(chance({ min: fraction(0), max: fraction(1, 4) })).toBe('0–25%');
    expect(showsRange({ min: fraction(0), max: fraction(1, 4) })).toBe(true);
  });

  it('shows a range whose ends round alike as one figure', () => {
    expect(chance({ min: fraction(127, 256), max: fraction(1, 2) })).toBe('50%');
    expect(chanceParts({ min: fraction(1, 512), max: fraction(1, 256) })).toEqual({ figure: '<1%', odds: null });
    expect(showsRange({ min: fraction(127, 256), max: fraction(1, 2) })).toBe(false);
  });

  it('shows a range within the extremes as one figure', () => {
    expect(chanceParts({ min: fraction(0), max: fraction(1, 256) })).toEqual({ figure: '<1%', odds: null });
    expect(chanceParts({ min: fraction(255, 256), max: fraction(1) })).toEqual({ figure: '>99%', odds: null });
    expect(showsRange({ min: fraction(0), max: fraction(1, 256) })).toBe(false);
    expect(showsRange({ min: fraction(255, 256), max: fraction(1) })).toBe(false);
  });

  it('does not count a single figure as a range', () => {
    expect(showsRange(single(1, 4))).toBe(false);
  });

  it('splits a single figure into percentage and odds for the outcome chips', () => {
    expect(chanceParts(single(1, 4))).toEqual({ figure: '25%', odds: '1 in 4' });
    expect(chanceParts({ min: fraction(1, 4), max: fraction(1, 2) })).toEqual({ figure: '25–50%', odds: null });
  });
});
