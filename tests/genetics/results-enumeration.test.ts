// predictPuppies against a full enumeration of every puppy genotype. The
// enumeration has its own Mendelian crossing and its own carry and hide rules
// for the hidden rows, written from the genotype; it shares only phenotype()
// and ownColourName() with the engine, which their own tests cover.

import { describe, expect, it } from 'vitest';
import { ALLELES, allPairs, formatPair } from '../../src/genetics/alleles.ts';
import { FLAGS, ownColourName, phenotype, TRAITS, type Phenotype } from '../../src/genetics/phenotype.ts';
import { predictPuppies, type PuppyPrediction } from '../../src/genetics/results.ts';
import { compare, fraction, ONE, subtract, ZERO, type Fraction, type Range } from '../../src/health/fraction.ts';
import { COLOUR_GENES, type ColourGene } from '../../src/report/loci.ts';
import { genotype, parentLoci } from './genotypes.ts';

type Spec = Readonly<Partial<Record<ColourGene, string>>>;
type CandidateSpec = Readonly<Partial<Record<ColourGene, readonly string[]>>>;

/** The pair a parent has when the spec leaves the locus out, as in parentLoci. */
const WILD: Readonly<Record<ColourGene, string>> = {
  ASIP: 'aw/aw',
  CBD103: 'ky/ky',
  MC1R: 'E/E',
  HPS3: '+/+',
  MFSD12: '+/+',
  MLPH: 'D/D',
  TYRP1: 'B/B',
  MITF: '+/+',
  PMEL: 'm/m',
  PSMB7: 'h/h',
  RALY: 'dup/dup',
  USH2A: '+/+',
  SLC45A2: '+/+',
};

const pairOf = (spec: Spec, gene: ColourGene): string => spec[gene] ?? WILD[gene];
const alleles = (pair: string): string[] => pair.split('/');
const count = (pair: string, allele: string): number => alleles(pair).filter((item) => item === allele).length;

/** Each parent passes either allele with equal chance: four equally likely puppies per locus. */
function puppyPairs(gene: ColourGene, first: string, second: string): Map<string, number> {
  const order: readonly string[] = ALLELES[gene];
  const result = new Map<string, number>();
  for (const left of alleles(first)) {
    for (const right of alleles(second)) {
      const pair = order.indexOf(left) <= order.indexOf(right) ? `${left}/${right}` : `${right}/${left}`;
      result.set(pair, (result.get(pair) ?? 0) + 1);
    }
  }
  return result;
}

function puppies(first: Spec, second: Spec): { spec: Spec; weight: number }[] {
  let result: { spec: Spec; weight: number }[] = [{ spec: {}, weight: 1 }];
  for (const gene of COLOUR_GENES) {
    const pairs = [...puppyPairs(gene, pairOf(first, gene), pairOf(second, gene))];
    result = result.flatMap(({ spec, weight }) => pairs.map(([pair, times]) => ({ spec: { ...spec, [gene]: pair }, weight: weight * times })));
  }
  return result;
}

type Hider = 'dominant-black' | 'beige' | 'albino';

/** The hidden and carried rows a puppy counts in, as "id|hider", written from its genotype. */
function hiddenRows(spec: Spec): string[] {
  const n = (gene: ColourGene, allele: string): number => count(pairOf(spec, gene), allele);
  const albino = n('SLC45A2', 'cal') === 2;
  const recessiveRed = n('MC1R', 'e') === 2;
  // Anderson 2020, Honkanen 2024: KB is not expressed with eA or eH and no E or Em.
  const kSkipped = n('MC1R', 'eA') + n('MC1R', 'eH') > 0 && n('MC1R', 'E') + n('MC1R', 'Em') === 0;
  const dominantBlack = n('CBD103', 'KB') > 0;
  const hider: Hider | null = albino ? 'albino' : recessiveRed ? 'beige' : dominantBlack && !kSkipped ? 'dominant-black' : null;
  const agouti =
    n('ASIP', 'ay') + n('ASIP', 'ayt') > 0 ? 'sable' : n('ASIP', 'aw') > 0 ? 'wolf-sable' : n('ASIP', 'at') > 0 ? 'tan-points' : 'recessive-black';
  const showsTanOrFawn = hider === null && agouti !== 'recessive-black';
  const noEumelanin = albino || recessiveRed;

  const rows: string[] = [];
  const add = (id: string, by: Hider | null, when: boolean): void => {
    if (when) {
      rows.push(`${id}|${by ?? ''}`);
    }
  };
  add('carries-beige', null, n('MC1R', 'e') === 1);
  add('carries-brown', null, n('TYRP1', 'b') === 1);
  add('carries-cocoa', null, n('HPS3', 'co') === 1);
  add('carries-dilute', null, n('MLPH', 'd') === 1);
  add('carries-albino', null, n('SLC45A2', 'cal') === 1);
  add('carries-recessive-black', null, n('ASIP', 'a') === 1);
  if (hider !== null) {
    add(`${agouti}-hidden`, hider, true);
  }
  add('dominant-black-hidden', hider, dominantBlack && noEumelanin);
  add('dominant-black-unexpressed', null, dominantBlack && kSkipped && !noEumelanin);
  add('mask-hidden', null, n('MC1R', 'Em') > 0 && !showsTanOrFawn);
  // Light cream shows on a beige coat and on tan or fawn areas.
  add('light-cream-hidden', null, n('MFSD12', 'i') === 2 && !showsTanOrFawn && !(recessiveRed && !albino));
  add('merle-hidden', hider, n('PMEL', 'M') === 1 && noEumelanin);
  add('harlequin-hidden', hider, n('PSMB7', 'H') === 1 && n('PMEL', 'M') > 0 && noEumelanin);
  add('roan-hidden', null, n('USH2A', 'R') > 0 && n('MITF', 'sp') === 0);
  return rows;
}

const HIDDEN_GENE: Readonly<Record<string, ColourGene>> = {
  'carries-beige': 'MC1R',
  'carries-brown': 'TYRP1',
  'carries-cocoa': 'HPS3',
  'carries-dilute': 'MLPH',
  'carries-albino': 'SLC45A2',
  'carries-recessive-black': 'ASIP',
  'sable-hidden': 'ASIP',
  'wolf-sable-hidden': 'ASIP',
  'tan-points-hidden': 'ASIP',
  'recessive-black-hidden': 'ASIP',
  'dominant-black-hidden': 'CBD103',
  'dominant-black-unexpressed': 'CBD103',
  'mask-hidden': 'MC1R',
  'light-cream-hidden': 'MFSD12',
  'merle-hidden': 'PMEL',
  'harlequin-hidden': 'PSMB7',
  'roan-hidden': 'USH2A',
};

/** Shares per key over scenarios: a key missing from a scenario is zero there. */
class Spread {
  private scenarios = 0;
  private readonly seen = new Map<string, { min: Fraction; max: Fraction; scenarios: number }>();

  next(shares: ReadonlyMap<string, Fraction>): void {
    this.scenarios++;
    for (const [key, share] of shares) {
      const entry = this.seen.get(key);
      if (entry === undefined) {
        this.seen.set(key, { min: share, max: share, scenarios: 1 });
      } else {
        entry.scenarios++;
        entry.min = compare(share, entry.min) < 0 ? share : entry.min;
        entry.max = compare(share, entry.max) > 0 ? share : entry.max;
      }
    }
  }

  keys(): string[] {
    return [...this.seen.keys()];
  }

  range(key: string): Range {
    const entry = this.seen.get(key);
    if (entry === undefined) {
      return { min: ZERO, max: ZERO };
    }
    return { min: entry.scenarios < this.scenarios ? ZERO : entry.min, max: entry.max };
  }

  all(): Record<string, Range> {
    return Object.fromEntries(this.keys().map((key) => [key, this.range(key)]));
  }
}

interface ScenarioShares {
  readonly lethal: Fraction;
  /** Null when every conception dies. */
  readonly live: {
    readonly tables: Readonly<Record<'base' | 'pattern' | 'white' | 'traits' | 'combined' | 'hidden', Map<string, Fraction>>>;
    readonly hiddenPairs: Map<string, Set<string>>;
    readonly hiddenBases: Map<string, Set<string>>;
    readonly bases: Set<string>;
    readonly phenotypes: Map<string, Phenotype[]>;
  } | null;
}

function scenarioShares(first: Spec, second: Spec): ScenarioShares {
  const all = puppies(first, second);
  const conceptions = all.reduce((total, { weight }) => total + weight, 0);
  const born = all.filter(({ spec }) => count(pairOf(spec, 'PSMB7'), 'H') < 2);
  const total = born.reduce((sum, { weight }) => sum + weight, 0);
  const lethal = fraction(conceptions - total, conceptions);
  if (total === 0) {
    return { lethal, live: null };
  }
  const counts = { base: new Map<string, number>(), pattern: new Map<string, number>(), white: new Map<string, number>(), traits: new Map<string, number>(), combined: new Map<string, number>(), hidden: new Map<string, number>() };
  const bump = (map: Map<string, number>, key: string, weight: number): void => {
    map.set(key, (map.get(key) ?? 0) + weight);
  };
  const hiddenPairs = new Map<string, Set<string>>();
  const hiddenBases = new Map<string, Set<string>>();
  const bases = new Set<string>();
  const phenotypes = new Map<string, Phenotype[]>();
  for (const { spec, weight } of born) {
    const coat = phenotype(genotype(spec));
    bump(counts.base, coat.base, weight);
    bump(counts.pattern, coat.pattern, weight);
    bump(counts.white, coat.white, weight);
    for (const trait of TRAITS) {
      if (coat.traits[trait] === 'yes') {
        bump(counts.traits, trait, weight);
      }
    }
    const name = ownColourName(coat);
    bump(counts.combined, name, weight);
    phenotypes.set(name, [...(phenotypes.get(name) ?? []), coat]);
    bases.add(coat.base);
    for (const key of hiddenRows(spec)) {
      bump(counts.hidden, key, weight);
      const [id = ''] = key.split('|');
      const gene = HIDDEN_GENE[id];
      if (gene === undefined) {
        throw new Error(`no gene for ${id}`);
      }
      hiddenPairs.set(key, (hiddenPairs.get(key) ?? new Set()).add(pairOf(spec, gene)));
      hiddenBases.set(key, (hiddenBases.get(key) ?? new Set()).add(coat.base));
    }
  }
  const share = (map: Map<string, number>): Map<string, Fraction> => new Map([...map].map(([key, weight]) => [key, fraction(weight, total)]));
  return {
    lethal,
    live: {
      tables: {
        base: share(counts.base),
        pattern: share(counts.pattern),
        white: share(counts.white),
        traits: share(counts.traits),
        combined: share(counts.combined),
        hidden: share(counts.hidden),
      },
      hiddenPairs,
      hiddenBases,
      bases,
      phenotypes,
    },
  };
}

function choices(spec: CandidateSpec): Spec[] {
  let result: Spec[] = [{}];
  for (const gene of COLOUR_GENES) {
    const options = spec[gene] ?? [WILD[gene]];
    result = result.flatMap((partial) => options.map((pair) => ({ ...partial, [gene]: pair })));
  }
  return result;
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const byUpperThenLower = (left: Range, right: Range): number => compare(right.max, left.max) || compare(right.min, left.min);

/** predictPuppies' output against the enumeration, figure by figure. */
function checkAgainstEnumeration(first: CandidateSpec, second: CandidateSpec): void {
  const prediction: PuppyPrediction = predictPuppies({ loci: parentLoci(first) }, { loci: parentLoci(second) });
  const scenarios = choices(first).flatMap((left) => choices(second).map((right) => scenarioShares(left, right)));
  expect(prediction.scenarios).toBe(scenarios.length);

  const lethal = new Spread();
  const spreads = { base: new Spread(), pattern: new Spread(), white: new Spread(), traits: new Spread(), combined: new Spread(), hidden: new Spread() };
  const hiddenPairs = new Map<string, Set<string>>();
  const hiddenBases = new Map<string, Set<string>>();
  const bases = new Set<string>();
  const live = scenarios.flatMap((scenario) => (scenario.live === null ? [] : [scenario.live]));
  for (const scenario of scenarios) {
    lethal.next(new Map(scenario.lethal.numerator > 0 ? [['lethal', scenario.lethal]] : []));
  }
  for (const scenario of live) {
    for (const key of ['base', 'pattern', 'white', 'traits', 'combined', 'hidden'] as const) {
      spreads[key].next(scenario.tables[key]);
    }
    scenario.hiddenPairs.forEach((pairs, key) => pairs.forEach((pair) => hiddenPairs.set(key, (hiddenPairs.get(key) ?? new Set()).add(pair))));
    scenario.hiddenBases.forEach((found, key) => found.forEach((base) => hiddenBases.set(key, (hiddenBases.get(key) ?? new Set()).add(base))));
    scenario.bases.forEach((base) => bases.add(base));
  }

  const asRecord = (rows: readonly { value: string; chance: Range }[]): Record<string, Range> =>
    Object.fromEntries(rows.map((row) => [row.value, row.chance]));
  expect(asRecord(prediction.base.rows)).toEqual(spreads.base.all());
  expect(asRecord(prediction.pattern.rows)).toEqual(spreads.pattern.all());
  expect(asRecord(prediction.white.rows)).toEqual(spreads.white.all());

  const possible = TRAITS.filter((trait) => spreads.traits.range(trait).max.numerator > 0);
  expect(asRecord(prediction.traits.possible)).toEqual(Object.fromEntries(possible.map((trait) => [trait, spreads.traits.range(trait)])));
  expect(prediction.traits.notPossible).toEqual(TRAITS.filter((trait) => !possible.includes(trait)));

  const warnings = [
    ...(possible.includes('doubleMerle') ? [{ kind: 'double-merle', chance: spreads.traits.range('doubleMerle') }] : []),
    ...(lethal.range('lethal').max.numerator > 0 ? [{ kind: 'harlequin-lethal', chance: lethal.range('lethal') }] : []),
  ];
  expect(prediction.warnings).toEqual(warnings);

  const hidden = Object.fromEntries(
    prediction.hidden.map((row) => [`${row.id}|${row.hider ?? ''}`, { chance: row.chance, genotypes: sorted(row.genotypes), onlyIn: row.onlyIn }]),
  );
  const expectedHidden = Object.fromEntries(
    spreads.hidden.keys().map((key) => {
      const found = [...(hiddenBases.get(key) ?? [])];
      const onlyIn = found.length === 1 && bases.size > 1 ? (found[0] ?? null) : null;
      return [key, { chance: spreads.hidden.range(key), genotypes: sorted(hiddenPairs.get(key) ?? []), onlyIn }];
    }),
  );
  expect(hidden).toEqual(expectedHidden);

  // The six most likely names by upper bound, then lower bound; ties may fall either way.
  const names = spreads.combined.keys();
  const shown = prediction.combined.outcomes.map((outcome) => outcome.name);
  expect(shown).toHaveLength(Math.min(6, names.length));
  expect(new Set(shown).size).toBe(shown.length);
  prediction.combined.outcomes.forEach((outcome, index) => {
    expect(outcome.chance).toEqual(spreads.combined.range(shown[index] ?? ''));
    const coats = live.flatMap((scenario) => scenario.phenotypes.get(shown[index] ?? '') ?? []);
    expect(coats.length).toBeGreaterThan(0);
    expect(outcome.phenotype.flags).toEqual(FLAGS.filter((flag) => coats.some((coat) => coat.flags.includes(flag))));
  });
  const last = prediction.combined.outcomes.at(-1)?.chance;
  for (const name of names.filter((item) => !shown.includes(item))) {
    expect(last !== undefined && byUpperThenLower(last, spreads.combined.range(name)) <= 0).toBe(true);
  }
  if (names.length > 6) {
    const rest = new Spread();
    for (const scenario of live) {
      const listed = shown.reduce((sum, name) => {
        const share = scenario.tables.combined.get(name) ?? ZERO;
        return fraction(sum.numerator * share.denominator + share.numerator * sum.denominator, sum.denominator * share.denominator);
      }, ZERO);
      const other = subtract(ONE, listed);
      rest.next(new Map(other.numerator > 0 ? [['other', other]] : []));
    }
    expect(prediction.combined.other).toEqual(rest.range('other'));
  } else {
    expect(prediction.combined.other).toBeNull();
  }
}

/** Deterministic pseudo-random numbers (mulberry32), so failures reproduce. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, items: readonly T[]): T {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) {
    throw new Error('empty choice');
  }
  return item;
}

/** Puppy genotypes per scenario, bounded so the enumeration stays fast. */
function size(first: CandidateSpec, second: CandidateSpec): number {
  return choices(first).length * choices(second).length * COLOUR_GENES.reduce((product, gene) => {
    const pairs = new Set<string>();
    for (const left of first[gene] ?? [WILD[gene]]) {
      for (const right of second[gene] ?? [WILD[gene]]) {
        puppyPairs(gene, left, right).forEach((_, pair) => pairs.add(pair));
      }
    }
    return product * pairs.size;
  }, 1);
}

function randomParents(next: () => number): readonly [CandidateSpec, CandidateSpec] {
  for (;;) {
    const parent = (): CandidateSpec => {
      const spec: Partial<Record<ColourGene, readonly string[]>> = {};
      for (const gene of COLOUR_GENES) {
        if (next() < 0.5) {
          const pairs = allPairs(gene).map(formatPair);
          spec[gene] = next() < 0.1 ? [...new Set([pick(next, pairs), pick(next, pairs)])] : [pick(next, pairs)];
        }
      }
      return spec;
    };
    const pair = [parent(), parent()] as const;
    if (size(...pair) <= 6000) {
      return pair;
    }
  }
}

describe('predictPuppies against a full enumeration', () => {
  it.each([
    [
      'carriers of every hider',
      { SLC45A2: ['+/cal'], MC1R: ['E/e'], CBD103: ['KB/ky'], ASIP: ['ay/at'], PMEL: ['M/m'], PSMB7: ['H/h'], MFSD12: ['i/+'], USH2A: ['R/+'], MITF: ['sp/+'] },
      { SLC45A2: ['+/cal'], MC1R: ['Em/e'], ASIP: ['aw/a'], MFSD12: ['i/+'], PSMB7: ['H/h'] },
    ],
    [
      'eA, brown, cocoa and dilute carriers',
      { MC1R: ['eA/e'], CBD103: ['KB/ky'], ASIP: ['at/a'], TYRP1: ['B/b'], HPS3: ['co/+'], MLPH: ['D/d'], MFSD12: ['i/i'] },
      { MC1R: ['E/eA', 'Em/eA'], TYRP1: ['B/b'], HPS3: ['co/+'], MLPH: ['D/d'], ASIP: ['ayt/at'] },
    ],
    ['every conception H/H in one scenario', { PSMB7: ['H/H', 'H/h'], PMEL: ['M/m'], MC1R: ['e/e'] }, { PSMB7: ['H/H'], MC1R: ['E/e'] }],
    // Dominant Black and recessive black puppies share a name; their merged pattern is unknown.
    ['one name from two patterns', { CBD103: ['KB/ky'], ASIP: ['a/a'] }, { CBD103: ['ky/ky'], ASIP: ['a/a'] }],
  ] as const)('%s', (_name, first, second) => {
    checkAgainstEnumeration(first, second);
  });

  it('random pairs', () => {
    const next = random(11);
    for (let trial = 0; trial < 60; trial++) {
      checkAgainstEnumeration(...randomParents(next));
    }
  });
});
