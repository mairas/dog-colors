// A displayed figure across scenarios: its lowest and highest value. A figure
// equal in every scenario has min equal to max and shows as one value.

import { fraction, type Fraction } from '../health/fraction.ts';

export interface Range {
  readonly min: Fraction;
  readonly max: Fraction;
}

export function isSingle(range: Range): boolean {
  return range.min.numerator === range.max.numerator && range.min.denominator === range.max.denominator;
}

interface Entry {
  minCount: number;
  minTotal: number;
  maxCount: number;
  maxTotal: number;
  scenarios: number;
}

/**
 * Collects one share per key per scenario, as an unreduced count out of a
 * total. Totals stay below 4^13, so the cross products that compare two
 * shares are exact. A key absent from a scenario is zero there, so its range
 * starts at zero.
 */
export class Ranges<K> {
  private readonly entries = new Map<K, Entry>();
  private scenarios = 0;

  /** Call once per scenario, before its shares. */
  nextScenario(): void {
    this.scenarios++;
  }

  add(key: K, count: number, total: number): void {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.entries.set(key, { minCount: count, minTotal: total, maxCount: count, maxTotal: total, scenarios: 1 });
      return;
    }
    entry.scenarios++;
    if (count * entry.minTotal < entry.minCount * total) {
      entry.minCount = count;
      entry.minTotal = total;
    }
    if (count * entry.maxTotal > entry.maxCount * total) {
      entry.maxCount = count;
      entry.maxTotal = total;
    }
  }

  keys(): K[] {
    return [...this.entries.keys()];
  }

  range(key: K): Range {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return { min: fraction(0), max: fraction(0) };
    }
    const min = entry.scenarios < this.scenarios ? fraction(0) : fraction(entry.minCount, entry.minTotal);
    return { min, max: fraction(entry.maxCount, entry.maxTotal) };
  }
}
