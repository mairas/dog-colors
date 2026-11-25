// "Chance per puppy" figures: a whole percentage with odds, "50% (1 in 2)",
// or a range across scenarios without odds, "50–100%".

import { isSingle, type Range } from '../genetics/range.ts';
import { toNumber, type Fraction } from '../health/fraction.ts';

const PER_CENT = 100;
const ODDS_IN_TENTHS = 10;
/** Up to this denominator a fraction's own odds read plainly ("3 in 4"). */
const PLAIN_ODDS_DENOMINATOR = 4;
/** Up to this share odds read as "about 1 in N"; above it, in tenths, where 1 in N moves in big steps. */
const ONE_IN_N_SHARE = 1 / 3;

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
    return '<1%';
  }
  return rounded >= PER_CENT ? '>99%' : `${rounded}%`;
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
  const share = numerator / denominator;
  if (share <= ONE_IN_N_SHARE) {
    return `about 1 in ${Math.round(denominator / numerator)}`;
  }
  const tenths = Math.round(share * ODDS_IN_TENTHS);
  return tenths >= ODDS_IN_TENTHS ? 'nearly all' : `about ${tenths} in ${ODDS_IN_TENTHS}`;
}

export function chanceParts(range: Range): { readonly figure: string; readonly odds: string | null } {
  if (!isSingle(range)) {
    const [low, high] = [percent(range.min), percent(range.max)];
    return { figure: low === high ? high : `${low.replace('%', '')}–${high}`, odds: null };
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
