// What the results section shows for a pairing: every scenario's exact
// figures collapsed into min–max ranges, ready to render. A locus missing or
// inconsistent in either parent leaves the figures that depend on it
// "unknown"; everything else is still computed.

import { compare, fraction, type Fraction } from '../health/fraction.ts';
import type { ParentIndex } from '../health/health.ts';
import { COLOUR_GENES, type ColourGene } from '../report/loci.ts';
import { ALLELES } from './alleles.ts';
import { crossScenarios, PIGMENT_GENES, WHITE_GENES, type CrossParent, type GroupResult, type Scenario } from './cross.ts';
import { PIGMENT_HIDDEN, WHITE_HIDDEN, type HiddenId, type Hider } from './hidden.ts';
import {
  BASE_COLOURS,
  combine,
  FLAGS,
  mergePhenotypes,
  ownColourName,
  PATTERNS,
  TRAITS,
  WHITE_SPOTTING,
  type BaseColour,
  type Flag,
  type Pattern,
  type Phenotype,
  type PigmentPhenotype,
  type Trait,
  type Unknown,
  type WhitePhenotype,
  type WhiteSpotting,
} from './phenotype.ts';
import { isSingle, Ranges, type Range } from './range.ts';
import type { CaveatId, ColourWarning } from './warnings.ts';

export interface UnknownLocus {
  readonly gene: ColourGene;
  /** "Locus missing from Parent N's report" uses this slot. */
  readonly parent: ParentIndex;
  readonly reason: 'missing' | 'inconsistent';
}

export interface Row<V> {
  readonly value: V;
  readonly chance: Range;
  /** The copies pill of a dosage row; null elsewhere. */
  readonly copies: number | null;
  /** Muted tags: flags some puppies in this row have. */
  readonly flags: readonly Flag[];
  readonly caveats: readonly CaveatId[];
}

export interface Table<V> {
  /** Every puppy falls in exactly one row; "unknown" is a row when a locus is missing. */
  readonly rows: readonly Row<V>[];
  /** Caveat badges on the caption. */
  readonly caveats: readonly CaveatId[];
  /** Why some puppies' value is unknown; empty when none is. */
  readonly unknown: readonly UnknownLocus[];
}

/** A "Chance of each trait" row, phrased positively ("Merle 50%"). */
export type TraitRow = Row<Trait>;

export interface CombinedOutcome {
  readonly phenotype: Phenotype;
  readonly chance: Range;
}

export interface HiddenRow {
  readonly id: HiddenId;
  readonly hider: Hider | null;
  /** The pairs that give it, in display order ("E/e"). */
  readonly genotypes: readonly string[];
  readonly chance: Range;
  /** The one visible base colour of the puppies it applies to, when not every puppy has that colour: "(black puppies)". */
  readonly onlyIn: BaseColour | null;
}

export interface PuppyPrediction {
  /** Pairs of candidate genotypes, Parent 1's × Parent 2's. */
  readonly scenarios: number;
  /** Whether any figure shown differs between scenarios. */
  readonly hasRanges: boolean;
  readonly warnings: readonly ColourWarning[];
  readonly combined: {
    /** The most likely outcomes, at most six, ranked by upper bound. */
    readonly outcomes: readonly CombinedOutcome[];
    /** The chance of every other outcome; null when the list has them all. */
    readonly other: Range | null;
  };
  readonly base: Table<BaseColour | Unknown>;
  readonly pattern: Table<Pattern | Unknown>;
  readonly white: Table<WhiteSpotting | Unknown>;
  readonly traits: {
    /** Traits some puppies can have: upper bound above zero. */
    readonly possible: readonly TraitRow[];
    /** "Not possible with this pairing: …" */
    readonly notPossible: readonly Trait[];
    /** "Can't predict (locus missing from Parent N's report): …" */
    readonly cannotPredict: readonly { readonly trait: Trait; readonly unknown: readonly UnknownLocus[] }[];
  };
  readonly hidden: readonly HiddenRow[];
  readonly unknownLoci: readonly UnknownLocus[];
  /** Every caveat shown anywhere, plus those that always apply, for the collected list. */
  readonly caveats: readonly CaveatId[];
}

const COMBINED_SHOWN = 6;

const BASE_FLAGS: readonly Flag[] = ['not-modelled-eA', 'not-modelled-eH-eG'];
const PATTERN_FLAGS: readonly Flag[] = [
  'not-modelled-eA',
  'not-modelled-eH-eG',
  'ayt-unknown',
  'possible-saddle',
  'mask',
  'pheomelanin-light',
];
const TRAIT_FLAGS: Readonly<Partial<Record<Trait, readonly Flag[]>>> = {
  merle: ['merle-hard-to-see'],
  roan: ['roan-single-copy'],
};
const TRAIT_COPIES: Readonly<Partial<Record<Trait, number>>> = { merle: 1, doubleMerle: 2, dilute: 2 };
const TRAIT_CAVEATS: Readonly<Partial<Record<Trait, readonly CaveatId[]>>> = {
  merle: ['merle-allele-length'],
  doubleMerle: ['merle-allele-length'],
  dilute: ['dilution-alopecia', 'linkage-d1'],
  roan: ['linkage-roan'],
};
const WHITE_COPIES: Readonly<Record<WhiteSpotting | Unknown, number | null>> = { solid: 0, limited: 1, extensive: 2, unknown: null };
const ALWAYS: readonly CaveatId[] = ['independent-loci', 'untested-loci', 'linkage-d1', 'linkage-roan'];

const PIGMENT_TRAITS = ['merle', 'doubleMerle', 'dilute', 'beige', 'harlequin'] as const satisfies readonly Trait[];

/** One scenario's figures as counts out of their group's total. */
interface ScenarioCounts {
  readonly pigment: GroupResult<PigmentPhenotype>;
  readonly white: GroupResult<WhitePhenotype>;
  readonly base: Map<BaseColour | Unknown, number>;
  readonly pattern: Map<Pattern | Unknown, number>;
  readonly whiteRows: Map<WhiteSpotting | Unknown, number>;
  /** Puppies with the trait; roan out of the white total, the rest out of the pigment total. */
  readonly traits: Map<Trait, number>;
  readonly unknownTraits: ReadonlySet<Trait>;
  /** Combiner ids with a positive count, and their counts out of the pigment total × the white total. */
  readonly combined: { readonly ids: readonly number[]; readonly counts: readonly number[] };
}

/**
 * Combined coats of one pairing, numbered by the name the page shows, so that
 * coats differing only in what the name leaves out (nose, flags) make one
 * outcome, merged as a dog's own colours are.
 */
class Combiner {
  private readonly whiteIndex = new Map<WhitePhenotype, number>();
  private readonly whites: WhitePhenotype[] = [];
  /** Per pigment coat, the combined id for each white coat by its index. */
  private readonly rows = new Map<PigmentPhenotype, number[]>();
  private readonly ids = new Map<string, number>();
  readonly names: string[] = [];
  readonly phenotypes: Phenotype[] = [];

  whiteOf(white: WhitePhenotype): number {
    let index = this.whiteIndex.get(white);
    if (index === undefined) {
      index = this.whites.length;
      this.whites.push(white);
      this.whiteIndex.set(white, index);
    }
    return index;
  }

  id(pigment: PigmentPhenotype, white: number): number {
    let row = this.rows.get(pigment);
    if (row === undefined) {
      row = [];
      this.rows.set(pigment, row);
    }
    let id = row[white];
    if (id === undefined) {
      const spotting = this.whites[white];
      if (spotting === undefined) {
        throw new Error(`no white coat ${white}`);
      }
      const phenotype = combine(pigment, spotting);
      const name = ownColourName(phenotype);
      id = this.ids.get(name);
      if (id === undefined) {
        id = this.phenotypes.length;
        this.ids.set(name, id);
        this.names.push(name);
        this.phenotypes.push(phenotype);
      } else {
        this.phenotypes[id] = mergePhenotypes(this.phenotype(id), phenotype);
      }
      row[white] = id;
    }
    return id;
  }

  phenotype(id: number): Phenotype {
    const phenotype = this.phenotypes[id];
    if (phenotype === undefined) {
      throw new Error(`no combined outcome ${id}`);
    }
    return phenotype;
  }

  name(id: number): string {
    const name = this.names[id];
    if (name === undefined) {
      throw new Error(`no combined outcome ${id}`);
    }
    return name;
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function increment<K>(map: Map<K, number>, key: K, count: number): void {
  map.set(key, (map.get(key) ?? 0) + count);
}

function countScenario(
  pigment: GroupResult<PigmentPhenotype>,
  white: GroupResult<WhitePhenotype>,
  combiner: Combiner,
): ScenarioCounts {
  const base = new Map<BaseColour | Unknown, number>();
  const pattern = new Map<Pattern | Unknown, number>();
  const whiteRows = new Map<WhiteSpotting | Unknown, number>();
  const traits = new Map<Trait, number>();
  const unknownTraits = new Set<Trait>();
  const whites = white.outcomes.map(({ phenotype: spotting, count }) => ({ index: combiner.whiteOf(spotting), count }));
  const pairIds = pigment.outcomes.flatMap(({ phenotype: coat }) => whites.map(({ index }) => combiner.id(coat, index)));
  const sums = new Float64Array(combiner.phenotypes.length);
  pigment.outcomes.forEach(({ count }, row) => {
    whites.forEach(({ count: whiteCount }, column) => {
      const id = pairIds[row * whites.length + column] ?? 0;
      sums[id] = (sums[id] ?? 0) + count * whiteCount;
    });
  });
  for (const { phenotype: coat, count } of pigment.outcomes) {
    increment(base, coat.base, count);
    increment(pattern, coat.pattern, count);
    for (const trait of PIGMENT_TRAITS) {
      if (coat[trait] === 'yes') {
        increment(traits, trait, count);
      } else if (coat[trait] === 'unknown') {
        unknownTraits.add(trait);
      }
    }
  }
  for (const { phenotype: spotting, count } of white.outcomes) {
    increment(whiteRows, spotting.white, count);
    if (spotting.roan === 'yes') {
      increment(traits, 'roan', count);
    } else if (spotting.roan === 'unknown') {
      unknownTraits.add('roan');
    }
  }
  const combined: { ids: number[]; counts: number[] } = { ids: [], counts: [] };
  sums.forEach((count, id) => {
    if (count > 0) {
      combined.ids.push(id);
      combined.counts.push(count);
    }
  });
  return { pigment, white, base, pattern, whiteRows, traits, unknownTraits, combined };
}

export interface ScenarioTables {
  readonly base: ReadonlyMap<BaseColour | Unknown, Fraction>;
  readonly pattern: ReadonlyMap<Pattern | Unknown, Fraction>;
  readonly white: ReadonlyMap<WhiteSpotting | Unknown, Fraction>;
  /** Keyed by own-colour name. */
  readonly combined: ReadonlyMap<string, Fraction>;
  readonly traits: ReadonlyMap<Trait, Fraction>;
}

/** One scenario's exact distribution tables. */
export function scenarioTables(scenario: Scenario): ScenarioTables {
  const combiner = new Combiner();
  const counts = countScenario(scenario.pigment, scenario.white, combiner);
  const pigmentTotal = scenario.pigment.total;
  const whiteTotal = scenario.white.total;
  const exact = <K>(map: ReadonlyMap<K, number>, total: number): Map<K, Fraction> =>
    new Map([...map].map(([key, count]) => [key, fraction(count, total)]));
  return {
    base: exact(counts.base, pigmentTotal),
    pattern: exact(counts.pattern, pigmentTotal),
    white: exact(counts.whiteRows, whiteTotal),
    combined: new Map(
      counts.combined.ids.map((id, index) => [
        combiner.name(id),
        fraction(counts.combined.counts[index] ?? 0, pigmentTotal * whiteTotal),
      ]),
    ),
    traits: new Map(
      [...counts.traits].map(([trait, count]) => [trait, fraction(count, trait === 'roan' ? whiteTotal : pigmentTotal)]),
    ),
  };
}

function unknownLociOf(first: CrossParent, second: CrossParent): UnknownLocus[] {
  return COLOUR_GENES.flatMap((gene) =>
    ([first, second] as const).flatMap((parent, index): UnknownLocus[] => {
      const status = parent.loci[gene].status;
      const slot: ParentIndex = index === 0 ? 0 : 1;
      return status === 'resolved' ? [] : [{ gene, parent: slot, reason: status }];
    }),
  );
}

/** Descending by upper bound, then by lower bound. */
const upperThenLower = (left: Range, right: Range): number => compare(right.max, left.max) || compare(right.min, left.min);

const positive = (range: Range): boolean => range.max.numerator > 0;

function addFlags<K>(map: Map<K, Set<Flag>>, key: K, flags: readonly Flag[], allowed: readonly Flag[]): void {
  const set = map.get(key) ?? new Set<Flag>();
  for (const flag of flags) {
    if (allowed.includes(flag)) {
      set.add(flag);
    }
  }
  map.set(key, set);
}

const inFlagOrder = (flags: ReadonlySet<Flag> | undefined): Flag[] => FLAGS.filter((flag) => flags?.has(flag) ?? false);

function pairOrder(gene: ColourGene, pair: string): number {
  const alleles: readonly string[] = ALLELES[gene];
  const [first = '', second = ''] = pair.split('/');
  return alleles.indexOf(first) * alleles.length + alleles.indexOf(second);
}

export function predictPuppies(first: CrossParent, second: CrossParent): PuppyPrediction {
  const scenarios = crossScenarios(first, second);
  const unknownLoci = unknownLociOf(first, second);
  const unknownIn = (genes: readonly ColourGene[]): UnknownLocus[] => unknownLoci.filter((locus) => genes.includes(locus.gene));

  // Scenarios with the same offspring distributions share their group results.
  const combiner = new Combiner();
  const unique = new Map<GroupResult<PigmentPhenotype>, Map<GroupResult<WhitePhenotype>, ScenarioCounts>>();
  for (const { pigment, white } of scenarios) {
    const byWhite = unique.get(pigment) ?? new Map<GroupResult<WhitePhenotype>, ScenarioCounts>();
    if (!byWhite.has(white)) {
      byWhite.set(white, countScenario(pigment, white, combiner));
    }
    unique.set(pigment, byWhite);
  }
  const counted = [...unique.values()].flatMap((byWhite) => [...byWhite.values()]);

  const base = new Ranges<BaseColour | Unknown>();
  const pattern = new Ranges<Pattern | Unknown>();
  const whiteRows = new Ranges<WhiteSpotting | Unknown>();
  const traits = new Ranges<Trait>();
  const combinedRanges = new Ranges<number>();
  const hiddenRanges = new Ranges<string>();
  const lethal = new Ranges<'lethal'>();
  const unknownTraits = new Set<Trait>();
  const baseFlags = new Map<BaseColour | Unknown, Set<Flag>>();
  const patternFlags = new Map<Pattern | Unknown, Set<Flag>>();
  const traitFlags = new Map<Trait, Set<Flag>>();
  const allBases = new Set<BaseColour | Unknown>();
  const hiddenPairs = new Map<string, Set<string>>();
  const hiddenBases = new Map<string, Set<BaseColour | Unknown>>();
  // Scenarios share coat objects, so each coat's flags are collected once.
  const pigmentCoats = new Set<PigmentPhenotype>();
  const whiteCoats = new Set<WhitePhenotype>();

  for (const scenario of counted) {
    const { pigment, white } = scenario;
    lethal.nextScenario();
    if (pigment.lethal.numerator > 0) {
      lethal.add('lethal', pigment.lethal.numerator, pigment.lethal.denominator);
    }
    // A scenario in which every conception dies has no live puppies to share out.
    if (pigment.total === 0) {
      continue;
    }
    for (const ranges of [base, pattern, whiteRows, traits, combinedRanges, hiddenRanges]) {
      ranges.nextScenario();
    }
    scenario.base.forEach((count, key) => base.add(key, count, pigment.total));
    scenario.pattern.forEach((count, key) => pattern.add(key, count, pigment.total));
    scenario.whiteRows.forEach((count, key) => whiteRows.add(key, count, white.total));
    scenario.traits.forEach((count, trait) => traits.add(trait, count, trait === 'roan' ? white.total : pigment.total));
    scenario.combined.ids.forEach((id, index) => combinedRanges.add(id, scenario.combined.counts[index] ?? 0, pigment.total * white.total));
    scenario.unknownTraits.forEach((trait) => unknownTraits.add(trait));

    for (const { phenotype: coat } of pigment.outcomes) {
      pigmentCoats.add(coat);
    }
    for (const { phenotype: spotting } of white.outcomes) {
      whiteCoats.add(spotting);
    }

    for (const { item, count, pairs, coats } of pigment.hidden) {
      const key = `${item.id}|${item.hider ?? ''}`;
      hiddenRanges.add(key, count, pigment.total);
      pairs.forEach((pair) => hiddenPairs.set(key, (hiddenPairs.get(key) ?? new Set()).add(pair)));
      coats.forEach((coat) => hiddenBases.set(key, (hiddenBases.get(key) ?? new Set()).add(coat.base)));
    }
    for (const { item, count, pairs } of white.hidden) {
      const key = `${item.id}|${item.hider ?? ''}`;
      hiddenRanges.add(key, count, white.total);
      pairs.forEach((pair) => hiddenPairs.set(key, (hiddenPairs.get(key) ?? new Set()).add(pair)));
    }
  }

  let brindle = false;
  for (const coat of pigmentCoats) {
    allBases.add(coat.base);
    brindle ||= coat.flags.includes('brindle-possible');
    addFlags(baseFlags, coat.base, coat.flags, BASE_FLAGS);
    addFlags(patternFlags, coat.pattern, coat.flags, PATTERN_FLAGS);
    for (const trait of PIGMENT_TRAITS) {
      if (coat[trait] === 'yes') {
        addFlags(traitFlags, trait, coat.flags, TRAIT_FLAGS[trait] ?? []);
      }
    }
  }
  for (const spotting of whiteCoats) {
    if (spotting.roan === 'yes') {
      addFlags(traitFlags, 'roan', spotting.flags, TRAIT_FLAGS.roan ?? []);
    }
  }

  const tableRows = <V>(
    ranges: Ranges<V>,
    order: readonly (V | Unknown)[],
    extra: (value: V) => { copies: number | null; flags: readonly Flag[] },
    sort: (left: Row<V>, right: Row<V>) => number,
  ): Row<V>[] =>
    ranges
      .keys()
      .map((value): Row<V> => ({ value, chance: ranges.range(value), caveats: [], ...extra(value) }))
      .sort((left, right) => sort(left, right) || order.indexOf(left.value) - order.indexOf(right.value));

  const baseOrder: readonly (BaseColour | Unknown)[] = [...BASE_COLOURS, 'unknown'];
  const patternOrder: readonly (Pattern | Unknown)[] = [...PATTERNS, 'unknown'];
  const whiteOrder: readonly (WhiteSpotting | Unknown)[] = [...[...WHITE_SPOTTING].reverse(), 'unknown'];

  const baseRows = tableRows(base, baseOrder, (value) => ({ copies: null, flags: inFlagOrder(baseFlags.get(value)) }), (l, r) =>
    upperThenLower(l.chance, r.chance),
  );
  const patternRows = tableRows(
    pattern,
    patternOrder,
    (value) => ({ copies: null, flags: inFlagOrder(patternFlags.get(value)) }),
    (l, r) => upperThenLower(l.chance, r.chance),
  );
  const whiteTableRows = tableRows(whiteRows, whiteOrder, (value) => ({ copies: WHITE_COPIES[value], flags: [] }), () => 0);

  const traitRow = (trait: Trait): TraitRow => ({
    value: trait,
    chance: traits.range(trait),
    copies: TRAIT_COPIES[trait] ?? null,
    flags: inFlagOrder(traitFlags.get(trait)),
    caveats: TRAIT_CAVEATS[trait] ?? [],
  });
  const cannotPredict = TRAITS.filter((trait) => unknownTraits.has(trait)).map((trait) => ({
    trait,
    unknown: unknownIn(trait === 'roan' ? WHITE_GENES : PIGMENT_GENES),
  }));
  const predictable = TRAITS.filter((trait) => !unknownTraits.has(trait));
  const possible = predictable.filter((trait) => positive(traits.range(trait))).map(traitRow);
  const notPossible = predictable.filter((trait) => !positive(traits.range(trait)));

  const doubleMerle = possible.find((row) => row.value === 'doubleMerle');
  const warnings: ColourWarning[] = [];
  if (doubleMerle !== undefined) {
    warnings.push({ kind: 'double-merle', chance: doubleMerle.chance });
  }
  if (positive(lethal.range('lethal'))) {
    warnings.push({ kind: 'harlequin-lethal', chance: lethal.range('lethal') });
  }

  const ranked = combinedRanges
    .keys()
    .map((key) => ({ key, chance: combinedRanges.range(key) }))
    .sort((left, right) => upperThenLower(left.chance, right.chance));
  const shown = ranked.slice(0, COMBINED_SHOWN);
  let other: Range | null = null;
  if (ranked.length > COMBINED_SHOWN) {
    const shownIds = new Set(shown.map(({ key }) => key));
    const rest = new Ranges<'other'>();
    for (const scenario of counted.filter(({ pigment }) => pigment.total > 0)) {
      rest.nextScenario();
      const total = scenario.pigment.total * scenario.white.total;
      const listed = sum(scenario.combined.ids.map((id, index) => (shownIds.has(id) ? (scenario.combined.counts[index] ?? 0) : 0)));
      if (listed < total) {
        rest.add('other', total - listed, total);
      }
    }
    other = rest.range('other');
  }
  const outcomes = shown.map(({ key, chance }): CombinedOutcome => ({ phenotype: combiner.phenotype(key), chance }));

  const hidden = [...PIGMENT_HIDDEN, ...WHITE_HIDDEN].flatMap((item): HiddenRow[] => {
    const key = `${item.id}|${item.hider ?? ''}`;
    const chance = hiddenRanges.range(key);
    if (!positive(chance)) {
      return [];
    }
    const bases = [...(hiddenBases.get(key) ?? [])];
    const [only] = bases;
    const onlyIn = bases.length === 1 && only !== undefined && only !== 'unknown' && allBases.size > 1 ? only : null;
    const genotypes = [...(hiddenPairs.get(key) ?? [])].sort((l, r) => pairOrder(item.gene, l) - pairOrder(item.gene, r));
    return [{ id: item.id, hider: item.hider, genotypes, chance, onlyIn }];
  });

  const patternCaveats: CaveatId[] = brindle ? ['brindle-possible'] : [];
  const whiteCaveats: CaveatId[] = [
    ...(whiteTableRows.some((row) => row.value === 'extensive') ? (['deafness'] as const) : []),
    ...(doubleMerle !== undefined ? (['white-piebald-only'] as const) : []),
  ];
  const table = <V>(rows: readonly Row<V>[], caveats: readonly CaveatId[], genes: readonly ColourGene[]): Table<V> => ({
    rows,
    caveats,
    unknown: rows.some((row) => row.value === 'unknown') ? unknownIn(genes) : [],
  });

  const shownFlags = new Set<Flag>([
    ...[...baseRows, ...patternRows, ...possible].flatMap((row) => row.flags),
    ...outcomes.flatMap((outcome) => outcome.phenotype.flags),
  ]);
  const caveats = [
    ...new Set<CaveatId>([
      ...patternCaveats,
      ...whiteCaveats,
      ...possible.flatMap((row) => row.caveats),
      ...FLAGS.filter((flag) => shownFlags.has(flag)),
      ...ALWAYS,
    ]),
  ];

  const ranges = [
    ...[...baseRows, ...patternRows, ...whiteTableRows, ...possible].map((row) => row.chance),
    ...outcomes.map((outcome) => outcome.chance),
    ...(other === null ? [] : [other]),
    ...hidden.map((row) => row.chance),
    ...warnings.map((warning) => warning.chance),
  ];

  return {
    scenarios: scenarios.length,
    hasRanges: ranges.some((range) => !isSingle(range)),
    warnings,
    combined: { outcomes, other },
    base: table(baseRows, [], PIGMENT_GENES),
    pattern: table(patternRows, patternCaveats, PIGMENT_GENES),
    white: table(whiteTableRows, whiteCaveats, WHITE_GENES),
    traits: { possible, notPossible, cannotPredict },
    hidden,
    unknownLoci,
    caveats,
  };
}
