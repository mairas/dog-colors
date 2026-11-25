/** An exact rational number in lowest terms, with a positive denominator. */
export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** A chance that differs between cases, as its lowest and highest value; equal ends show as one value. */
export interface Range {
  readonly min: Fraction;
  readonly max: Fraction;
}

export function fraction(numerator: number, denominator = 1): Fraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new RangeError(`not a fraction: ${numerator}/${denominator}`);
  }
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return { numerator: (sign * numerator) / divisor || 0, denominator: (sign * denominator) / divisor };
}

export const ZERO = fraction(0);
export const ONE = fraction(1);

export function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

export function subtract(a: Fraction, b: Fraction): Fraction {
  return add(a, { numerator: -b.numerator, denominator: b.denominator });
}

export function multiply(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}

export function toNumber(value: Fraction): number {
  return value.numerator / value.denominator;
}

export function equals(a: Fraction, b: Fraction): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compare(a: Fraction, b: Fraction): number {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}
