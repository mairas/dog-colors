// "Chance per puppy" figures: a whole percentage with odds, "50% (1 in 2)",
// or a range across scenarios without odds, "50–100%".

import { isSingle, type Range } from '../genetics/range.ts';
import { toNumber, type Fraction } from '../health/fraction.ts';

const PER_CENT = 100;
const UNDER_ONE = '<1%';
const OVER_99 = '>99%';
/** Up to this denominator a fraction's own odds read plainly ("3 in 4"). */
const PLAIN_ODDS_DENOMINATOR = 4;
/** The smallest N of "1 in N" odds; above one in three, odds read in tenths, where 1 in N moves in big steps. */
const SMALLEST_ONE_IN = 3;

interface Odds {
  readonly share: number;
  readonly text: string;
}

/**
 * Odds a share that is not exact reads as, above one in three: tenths, and
 * the plain fractions among them, so that a share just below 2/3 doesn't read
 * above the exact "2 in 3".
 */
const UPPER_ODDS: readonly Odds[] = [
  ...[4, 5, 6, 7, 8, 9].map((tenths) => ({ share: tenths / 10, text: `about ${tenths} in 10` })),
  { share: 2 / 3, text: 'about 2 in 3' },
  { share: 3 / 4, text: 'about 3 in 4' },
];
const NEARLY_ALL: Odds = { share: 1, text: 'nearly all' };

export function percent(value: Fraction): string {
  const share = toNumber(value);
  if (share <= 0) {
    return '0%';
  }
  if (share >= 1) {
    return '100%';
  }
  const rounded = Math.round(share * PER_CENT);
  if (rounded < 1) {
    return UNDER_ONE;
  }
  return rounded >= PER_CENT ? OVER_99 : `${rounded}%`;
}

/**
 * The nearest of "1 in N" and the upper odds. Rounding to the nearest of one
 * fixed set never states lower odds for a higher share, and every exact plain
 * fraction is in the set.
 */
function nearestOdds(share: number): string {
  const below = Math.floor(1 / share);
  const oneIn = [below, below + 1]
    .filter((n) => n >= SMALLEST_ONE_IN)
    .map((n): Odds => ({ share: 1 / n, text: `about 1 in ${n}` }));
  const distance = (odds: Odds): number => Math.abs(odds.share - share);
  return [...oneIn, ...UPPER_ODDS].reduce((best, odds) => (distance(odds) < distance(best) ? odds : best), NEARLY_ALL).text;
}

export function odds(value: Fraction): string | null {
  const { numerator, denominator } = value;
  if (numerator <= 0) {
    return null;
  }
  if (numerator >= denominator) {
    return 'all';
  }
  if (numerator === 1 || denominator <= PLAIN_ODDS_DENOMINATOR) {
    return `${numerator} in ${denominator}`;
  }
  return nearestOdds(numerator / denominator);
}

/** A range's ends as shown, or its one figure when they read alike: 0 to under 1% reads "<1%". */
function rangeEnds(range: Range): readonly [string] | readonly [string, string] {
  const [low, high] = [percent(range.min), percent(range.max)];
  if (low === high || high === UNDER_ONE) {
    return [high];
  }
  return low === OVER_99 ? [low] : [low, high];
}

/** Whether the figure shows as a range of two ends, not as one figure. */
export function showsRange(range: Range): boolean {
  return !isSingle(range) && rangeEnds(range).length === 2;
}

export function chanceParts(range: Range): { readonly figure: string; readonly odds: string | null } {
  if (!isSingle(range)) {
    const [low, high] = rangeEnds(range);
    return { figure: high === undefined ? low : `${low.replace('%', '')}–${high}`, odds: null };
  }
  return { figure: percent(range.max), odds: odds(range.max) };
}

export function chance(range: Range): string {
  const parts = chanceParts(range);
  return parts.odds === null ? parts.figure : `${parts.figure} (${parts.odds})`;
}

export function exactChance(value: Fraction): string {
  return chance({ min: value, max: value });
}
