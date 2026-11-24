// Puppy odds for every health condition two reports test, and the harmful
// combinations the mating itself creates. Each condition is one variant, so
// there is no phase ambiguity: a parent with n copies (0–2) passes the variant
// to a puppy with chance n/2. The X chromosome and mitochondria need the
// parents' sexes, which come from the reports, never from the slot order.
import type { HealthRow, Inheritance, Report } from '../report/types.ts';
import { catalogueInheritance, findCondition, isWithheld, type ConditionKey } from './conditions.ts';
import { add, fraction, multiply, ONE, subtract, toNumber, ZERO, type Fraction } from './fraction.ts';

export type HealthParent = Pick<Report, 'sex' | 'shortTail' | 'health'>;

/** Slot index: 0 for Parent 1, 1 for Parent 2. */
export type ParentIndex = 0 | 1;

export interface ParentResult {
  readonly copies: number;
  /** As the report prints it, e.g. "Clear", "Carrier", "At Risk", "Notable". */
  readonly result: string;
}

/** Chance per puppy. `carrier` is null where no carrier state exists (AD, XD, MT, and sons for XR). */
export interface PuppyOdds {
  readonly atRisk: Fraction;
  readonly carrier: Fraction | null;
}

export type UnknownReason =
  /** Neither report nor the catalogue gives the mode. */
  | 'inheritance-unknown'
  /** The two reports print different modes. */
  | 'inheritance-conflict'
  /** X-linked or MT, and both reports give the same sex. */
  | 'same-sex-parents'
  /** X-linked or MT, and a report's sex could not be read. */
  | 'sex-unknown';

export type ConditionOdds =
  | { readonly kind: 'puppies'; readonly puppies: PuppyOdds }
  | { readonly kind: 'by-sex'; readonly sons: PuppyOdds; readonly daughters: PuppyOdds }
  | { readonly kind: 'unknown'; readonly reason: UnknownReason };

export interface Condition extends ConditionKey {
  /** Null when unknown: missing from the reports and the catalogue, or printed differently by the two reports. */
  readonly inheritance: Inheritance | null;
  /** Listed as known in the breed by either report. */
  readonly knownInBreed: boolean;
}

export interface ConditionRow extends Condition {
  /** In slot order; null for the untested sire of an MT condition tested in the dam only. */
  readonly parents: readonly [ParentResult | null, ParentResult | null];
  readonly odds: ConditionOdds;
}

export interface OneParentCondition extends Condition {
  readonly parent: ParentIndex;
  readonly tested: ParentResult;
}

/** A chance that depends on which parent is the dam, when a report's sex could not be read; `low` < `high`. */
export interface ChanceRange {
  readonly low: Fraction;
  readonly high: Fraction;
}

export type HealthWarning =
  /** Affected puppies that need the variant from both parents (AR; XR daughters). */
  | {
      readonly kind: 'affected-puppies';
      readonly condition: Condition;
      readonly among: 'puppies' | 'daughters';
      /** A range only for XR with a sex unread, and only when the two possible dams give different chances. */
      readonly chance: Fraction | ChanceRange;
    }
  /** Both parents carry a variant whose inheritance mode is unknown. */
  | { readonly kind: 'inheritance-unknown'; readonly condition: Condition }
  /**
   * Both parents carry the T-box bobtail variant. T/T embryos are not viable,
   * so smaller litters are likely. A live dog with two copies is unexpected,
   * so a parent reported with two is named; the fraction still follows the
   * reported copies.
   */
  | { readonly kind: 'bobtail'; readonly embryosTT: Fraction; readonly twoCopyParents: readonly ParentIndex[] };

export interface HealthAnalysis {
  /** Conditions tested in both reports (or MT in the dam) that are not clear in both parents. */
  readonly rows: readonly ConditionRow[];
  readonly oneParentOnly: readonly OneParentCondition[];
  readonly clearInBoth: readonly Condition[];
  readonly warnings: readonly HealthWarning[];
}

/** Chance that a parent with `copies` passes the variant on one chromosome. */
function transmits(copies: number): Fraction {
  return fraction(Math.min(copies, 2), 2);
}

/** Chance that a sire passes an X-linked variant to a daughter: he has one X, so any reported copy means every daughter. */
function sireTransmits(copies: number): Fraction {
  return copies > 0 ? ONE : ZERO;
}

function either(a: Fraction, b: Fraction): Fraction {
  return subtract(ONE, multiply(subtract(ONE, a), subtract(ONE, b)));
}

function exactlyOne(a: Fraction, b: Fraction): Fraction {
  return add(multiply(a, subtract(ONE, b)), multiply(b, subtract(ONE, a)));
}

type Pair = readonly [HealthRow | null, HealthRow | null];

/** The dam's slot, or why the X-linked and MT modes cannot be computed. */
type Dam = ParentIndex | 'same-sex-parents' | 'sex-unknown';

function damOf(first: HealthParent, second: HealthParent): Dam {
  if (first.sex === null || second.sex === null) {
    return 'sex-unknown';
  }
  if (first.sex === second.sex) {
    return 'same-sex-parents';
  }
  return first.sex === 'female' ? 0 : 1;
}

function inheritanceOf(pair: Pair): Inheritance | 'conflict' | null {
  const printed = [...new Set(pair.flatMap((row) => (row?.inheritance ? [row.inheritance] : [])))];
  if (printed.length > 1) {
    return 'conflict';
  }
  if (printed[0]) {
    return printed[0];
  }
  for (const row of pair) {
    const mode = row && catalogueInheritance(row);
    if (mode) {
      return mode;
    }
  }
  return null;
}

/** The pair's condition, named by the row that prints its gene and variant. */
function describe(pair: Pair, inheritance: Inheritance | null): Condition {
  const rows = pair.filter((row) => row !== null);
  const named = rows.find((row) => !isWithheld(row)) ?? rows[0];
  if (!named) {
    throw new Error('a condition needs at least one tested parent');
  }
  return {
    name: named.name,
    gene: named.gene,
    variant: named.variant,
    inheritance,
    knownInBreed: rows.some((row) => row.knownInBreed),
  };
}

function resultOf(row: HealthRow | null): ParentResult | null {
  return row && { copies: row.copies, result: row.result };
}

function sexLinkedOdds(inheritance: 'XR' | 'XD' | 'MT', damCopies: number, sireCopies: number): ConditionOdds {
  if (inheritance === 'MT') {
    return { kind: 'puppies', puppies: { atRisk: damCopies > 0 ? ONE : ZERO, carrier: null } };
  }
  const fromDam = transmits(damCopies);
  const fromSire = sireTransmits(sireCopies);
  const sons = { atRisk: fromDam, carrier: null };
  const daughters =
    inheritance === 'XR'
      ? { atRisk: multiply(fromDam, fromSire), carrier: exactlyOne(fromDam, fromSire) }
      : { atRisk: either(fromDam, fromSire), carrier: null };
  return { kind: 'by-sex', sons, daughters };
}

function oddsOf(mode: Inheritance | 'conflict' | null, copies: readonly [number, number], dam: Dam): ConditionOdds {
  if (mode === null || mode === 'conflict') {
    return { kind: 'unknown', reason: mode === null ? 'inheritance-unknown' : 'inheritance-conflict' };
  }
  const [a, b] = [transmits(copies[0]), transmits(copies[1])];
  if (mode === 'AR') {
    return { kind: 'puppies', puppies: { atRisk: multiply(a, b), carrier: exactlyOne(a, b) } };
  }
  if (mode === 'AD') {
    return { kind: 'puppies', puppies: { atRisk: either(a, b), carrier: null } };
  }
  if (typeof dam !== 'number') {
    return { kind: 'unknown', reason: dam };
  }
  return sexLinkedOdds(mode, copies[dam], copies[dam === 0 ? 1 : 0]);
}

/** XR daughters affected with either parent as the dam: one chance when both give the same. */
function xrDaughtersOverBothDams(copies: readonly [number, number]): Fraction | ChanceRange {
  const daughters = (dam: ParentIndex, sire: ParentIndex) => multiply(transmits(copies[dam]), sireTransmits(copies[sire]));
  const [first, second] = [daughters(0, 1), daughters(1, 0)];
  if (first.numerator === second.numerator && first.denominator === second.denominator) {
    return first;
  }
  return toNumber(first) < toNumber(second) ? { low: first, high: second } : { low: second, high: first };
}

/** The panel warning for harm that needs the variant from both parents; none for what a puppy inherits from one. */
function warningOf(condition: Condition, odds: ConditionOdds, copies: readonly [number, number]): HealthWarning | null {
  if (copies[0] === 0 || copies[1] === 0) {
    return null;
  }
  if (odds.kind === 'unknown' && (odds.reason === 'inheritance-unknown' || odds.reason === 'inheritance-conflict')) {
    return { kind: 'inheritance-unknown', condition };
  }
  if (condition.inheritance === 'AR' && odds.kind === 'puppies') {
    return { kind: 'affected-puppies', condition, among: 'puppies', chance: odds.puppies.atRisk };
  }
  if (condition.inheritance === 'XR' && odds.kind === 'by-sex') {
    return { kind: 'affected-puppies', condition, among: 'daughters', chance: odds.daughters.atRisk };
  }
  if (condition.inheritance === 'XR' && odds.kind === 'unknown' && odds.reason === 'sex-unknown') {
    return { kind: 'affected-puppies', condition, among: 'daughters', chance: xrDaughtersOverBothDams(copies) };
  }
  return null;
}

function bobtailWarning(first: HealthParent, second: HealthParent): HealthWarning | null {
  const copies = [first.shortTail, second.shortTail] as const;
  if (copies[0] === null || copies[1] === null || copies[0] === 0 || copies[1] === 0) {
    return null;
  }
  const twoCopyParents = ([0, 1] as const).filter((index) => (copies[index] ?? 0) >= 2);
  return { kind: 'bobtail', embryosTT: multiply(transmits(copies[0]), transmits(copies[1])), twoCopyParents };
}

function pairRows(first: readonly HealthRow[], second: readonly HealthRow[]): Pair[] {
  const unpaired = new Set(second);
  const pairs: Pair[] = first.map((row) => {
    const match = findCondition(row, [...unpaired]);
    if (match) {
      unpaired.delete(match);
    }
    return [row, match ?? null];
  });
  return [...pairs, ...[...unpaired].map((row): Pair => [null, row])];
}

export function analyseHealth(first: HealthParent, second: HealthParent): HealthAnalysis {
  const dam = damOf(first, second);
  const rows: ConditionRow[] = [];
  const oneParentOnly: OneParentCondition[] = [];
  const clearInBoth: Condition[] = [];
  const warnings: HealthWarning[] = [];

  for (const pair of pairRows(first.health, second.health)) {
    const mode = inheritanceOf(pair);
    const condition = describe(pair, mode === 'conflict' ? null : mode);
    const [a, b] = pair;
    if (a === null || b === null) {
      const parent: ParentIndex = a === null ? 1 : 0;
      const tested = resultOf(pair[parent]);
      // The sire's result is irrelevant to an MT condition, so the dam's alone is enough.
      if (tested && !(mode === 'MT' && parent === dam)) {
        oneParentOnly.push({ ...condition, parent, tested });
        continue;
      }
    } else if (a.copies === 0 && b.copies === 0) {
      clearInBoth.push(condition);
      continue;
    }
    const copies = [a?.copies ?? 0, b?.copies ?? 0] as const;
    const odds = oddsOf(mode, copies, dam);
    rows.push({ ...condition, parents: [resultOf(a), resultOf(b)], odds });
    const warning = warningOf(condition, odds, copies);
    if (warning) {
      warnings.push(warning);
    }
  }

  const bobtail = bobtailWarning(first, second);
  if (bobtail) {
    warnings.push(bobtail);
  }
  return { rows, oneParentOnly, clearInBoth, warnings };
}
