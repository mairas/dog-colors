// What the results section shows for a pairing: every scenario's exact
// figures collapsed into min–max ranges, ready to render. A locus missing or
// inconsistent in either parent leaves the figures that depend on it
// "unknown"; everything else is still computed.

import { compare, fraction, type Fraction } from '../health/fraction.ts';
import type { ParentIndex } from '../health/health.ts';
import { COLOUR_GENES, type ColourGene } from '../report/loci.ts';
import { ALLELES, copies } from './alleles.ts';
import { crossScenarios, sum, type CrossParent, type GroupResult, type Scenario } from './cross.ts';
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

/** A parent's locus read from a combination no source documents (ResolvedDog.undocumentedLoci). */
export interface UndocumentedLocus {
  readonly gene: ColourGene;
  readonly parent: ParentIndex;
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
  /** Undocumented parent loci this table's figures read; the undocumented-haplotype caveat names their genes. */
  readonly undocumented: readonly UndocumentedLocus[];
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
  readonly undocumentedLoci: readonly UndocumentedLocus[];
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

/**
 * The loci each figure's rules in phenotype.ts read. A figure left unknown
 * blames only these among the missing or inconsistent loci.
 */
const READS = {
  base: ['SLC45A2', 'MC1R', 'MFSD12', 'TYRP1', 'HPS3', 'MLPH'],
  pattern: ['SLC45A2', 'MC1R', 'CBD103', 'ASIP'],
  white: ['MITF'],
  merle: ['SLC45A2', 'MC1R', 'PMEL'],
  doubleMerle: ['PMEL'],
  dilute: ['SLC45A2', 'MLPH'],
  beige: ['SLC45A2', 'MC1R'],
  harlequin: ['SLC45A2', 'MC1R', 'PMEL', 'PSMB7'],
  roan: ['MITF', 'USH2A'],
} as const satisfies Readonly<Record<'base' | 'pattern' | 'white' | Trait, readonly ColourGene[]>>;

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

function undocumentedLociOf(first: CrossParent, second: CrossParent): UndocumentedLocus[] {
  return COLOUR_GENES.flatMap((gene) =>
    ([first, second] as const).flatMap((parent, index): UndocumentedLocus[] => {
      const locus = parent.loci[gene];
      return locus.status === 'resolved' && locus.undocumented === true ? [{ gene, parent: index === 0 ? 0 : 1 }] : [];
    }),
  );
}

/** Descending by upper bound, then by lower bound. */
const upperThenLower = (left: Range, right: Range): number => compare(right.max, left.max) || compare(right.min, left.min);

const positive = (range: Range): boolean => range.max.numerator > 0;

const hiddenKey = (item: { readonly id: HiddenId; readonly hider: Hider | null }): string => `${item.id}|${item.hider ?? ''}`;

function addAll<K, V>(map: Map<K, Set<V>>, key: K, values: Iterable<V>): void {
  const set = map.get(key) ?? new Set<V>();
  for (const value of values) {
    set.add(value);
  }
  map.set(key, set);
}

const inFlagOrder = (flags: ReadonlySet<Flag> | undefined): Flag[] => FLAGS.filter((flag) => flags?.has(flag) ?? false);

function pairOrder(gene: ColourGene, pair: string): number {
  const alleles: readonly string[] = ALLELES[gene];
  const [first = '', second = ''] = pair.split('/');
  return alleles.indexOf(first) * alleles.length + alleles.indexOf(second);
}

/** Scenarios with the same offspring distributions share their group results, so each is counted once. */
function countDistinct(scenarios: readonly Scenario[], combiner: Combiner): ScenarioCounts[] {
  const unique = new Map<GroupResult<PigmentPhenotype>, Map<GroupResult<WhitePhenotype>, ScenarioCounts>>();
  for (const { pigment, white } of scenarios) {
    const byWhite = unique.get(pigment) ?? new Map<GroupResult<WhitePhenotype>, ScenarioCounts>();
    if (!byWhite.has(white)) {
      byWhite.set(white, countScenario(pigment, white, combiner));
    }
    unique.set(pigment, byWhite);
  }
  return [...unique.values()].flatMap((byWhite) => [...byWhite.values()]);
}

/** Every scenario's figures as ranges, with what the rows need besides. */
interface Gathered {
  /** Scenarios with live puppies; the figures below come from these alone. */
  readonly live: readonly ScenarioCounts[];
  readonly base: Ranges<BaseColour | Unknown>;
  readonly pattern: Ranges<Pattern | Unknown>;
  readonly white: Ranges<WhiteSpotting | Unknown>;
  readonly traits: Ranges<Trait>;
  readonly combined: Ranges<number>;
  /** Keyed by hiddenKey. */
  readonly hidden: Ranges<string>;
  /** The H/H share of conceptions, over every scenario. */
  readonly lethal: Range;
  readonly unknownTraits: ReadonlySet<Trait>;
  readonly hiddenPairs: ReadonlyMap<string, ReadonlySet<string>>;
  readonly hiddenBases: ReadonlyMap<string, ReadonlySet<BaseColour | Unknown>>;
  /** Scenarios share coat objects, so each coat is listed once. */
  readonly pigmentCoats: ReadonlySet<PigmentPhenotype>;
  readonly whiteCoats: ReadonlySet<WhitePhenotype>;
}

function gather(counted: readonly ScenarioCounts[]): Gathered {
  const lethal = new Ranges<'lethal'>();
  for (const { pigment } of counted) {
    lethal.nextScenario();
    if (pigment.lethal.numerator > 0) {
      lethal.add('lethal', pigment.lethal.numerator, pigment.lethal.denominator);
    }
  }

  // A scenario in which every conception dies has no live puppies to share out.
  const live = counted.filter(({ pigment }) => pigment.total > 0);
  const base = new Ranges<BaseColour | Unknown>();
  const pattern = new Ranges<Pattern | Unknown>();
  const white = new Ranges<WhiteSpotting | Unknown>();
  const traits = new Ranges<Trait>();
  const combined = new Ranges<number>();
  const hidden = new Ranges<string>();
  const unknownTraits = new Set<Trait>();
  const hiddenPairs = new Map<string, Set<string>>();
  const hiddenBases = new Map<string, Set<BaseColour | Unknown>>();
  const pigmentCoats = new Set<PigmentPhenotype>();
  const whiteCoats = new Set<WhitePhenotype>();

  for (const scenario of live) {
    const pigmentTotal = scenario.pigment.total;
    const whiteTotal = scenario.white.total;
    for (const ranges of [base, pattern, white, traits, combined, hidden]) {
      ranges.nextScenario();
    }
    scenario.base.forEach((count, key) => base.add(key, count, pigmentTotal));
    scenario.pattern.forEach((count, key) => pattern.add(key, count, pigmentTotal));
    scenario.whiteRows.forEach((count, key) => white.add(key, count, whiteTotal));
    scenario.traits.forEach((count, trait) => traits.add(trait, count, trait === 'roan' ? whiteTotal : pigmentTotal));
    scenario.combined.ids.forEach((id, index) => combined.add(id, scenario.combined.counts[index] ?? 0, pigmentTotal * whiteTotal));
    scenario.unknownTraits.forEach((trait) => unknownTraits.add(trait));
    scenario.pigment.outcomes.forEach(({ phenotype: coat }) => pigmentCoats.add(coat));
    scenario.white.outcomes.forEach(({ phenotype: spotting }) => whiteCoats.add(spotting));
    for (const { item, count, pairs, coats } of scenario.pigment.hidden) {
      const key = hiddenKey(item);
      hidden.add(key, count, pigmentTotal);
      addAll(hiddenPairs, key, pairs);
      addAll(
        hiddenBases,
        key,
        coats.map((coat) => coat.base),
      );
    }
    for (const { item, count, pairs } of scenario.white.hidden) {
      const key = hiddenKey(item);
      hidden.add(key, count, whiteTotal);
      addAll(hiddenPairs, key, pairs);
    }
  }

  return {
    live,
    base,
    pattern,
    white,
    traits,
    combined,
    hidden,
    lethal: lethal.range('lethal'),
    unknownTraits,
    hiddenPairs,
    hiddenBases,
    pigmentCoats,
    whiteCoats,
  };
}

/** The flags each row shows: those some of its puppies have, among the ones the row shows. */
interface RowFlags {
  readonly base: ReadonlyMap<BaseColour | Unknown, ReadonlySet<Flag>>;
  readonly pattern: ReadonlyMap<Pattern | Unknown, ReadonlySet<Flag>>;
  readonly traits: ReadonlyMap<Trait, ReadonlySet<Flag>>;
}

function rowFlags({ pigmentCoats, whiteCoats }: Gathered): RowFlags {
  const base = new Map<BaseColour | Unknown, Set<Flag>>();
  const pattern = new Map<Pattern | Unknown, Set<Flag>>();
  const traits = new Map<Trait, Set<Flag>>();
  const among = (flags: readonly Flag[], shown: readonly Flag[]): Flag[] => flags.filter((flag) => shown.includes(flag));
  for (const coat of pigmentCoats) {
    addAll(base, coat.base, among(coat.flags, BASE_FLAGS));
    addAll(pattern, coat.pattern, among(coat.flags, PATTERN_FLAGS));
    for (const trait of PIGMENT_TRAITS) {
      if (coat[trait] === 'yes') {
        addAll(traits, trait, among(coat.flags, TRAIT_FLAGS[trait] ?? []));
      }
    }
  }
  for (const spotting of whiteCoats) {
    if (spotting.roan === 'yes') {
      addAll(traits, 'roan', among(spotting.flags, TRAIT_FLAGS.roan ?? []));
    }
  }
  return { base, pattern, traits };
}

/** Rows by chance, most likely first, or in display order alone. */
function tableRows<V>(
  ranges: Ranges<V>,
  order: readonly V[],
  extra: (value: V) => { copies: number | null; flags: readonly Flag[] },
  byChance: boolean,
): Row<V>[] {
  return ranges
    .keys()
    .map((value): Row<V> => ({ value, chance: ranges.range(value), caveats: [], ...extra(value) }))
    .sort(
      (left, right) =>
        (byChance ? upperThenLower(left.chance, right.chance) : 0) || order.indexOf(left.value) - order.indexOf(right.value),
    );
}

const BASE_ORDER: readonly (BaseColour | Unknown)[] = [...BASE_COLOURS, 'unknown'];
const PATTERN_ORDER: readonly (Pattern | Unknown)[] = [...PATTERNS, 'unknown'];
const WHITE_ORDER: readonly (WhiteSpotting | Unknown)[] = [...[...WHITE_SPOTTING].reverse(), 'unknown'];

interface TableRows {
  readonly base: readonly Row<BaseColour | Unknown>[];
  readonly pattern: readonly Row<Pattern | Unknown>[];
  readonly white: readonly Row<WhiteSpotting | Unknown>[];
}

function buildRows(gathered: Gathered, flags: RowFlags): TableRows {
  return {
    base: tableRows(gathered.base, BASE_ORDER, (value) => ({ copies: null, flags: inFlagOrder(flags.base.get(value)) }), true),
    pattern: tableRows(gathered.pattern, PATTERN_ORDER, (value) => ({ copies: null, flags: inFlagOrder(flags.pattern.get(value)) }), true),
    white: tableRows(gathered.white, WHITE_ORDER, (value) => ({ copies: WHITE_COPIES[value], flags: [] }), false),
  };
}

function buildTraits(
  gathered: Gathered,
  flags: RowFlags,
  unknownIn: (genes: readonly ColourGene[]) => UnknownLocus[],
): PuppyPrediction['traits'] {
  const { traits, unknownTraits } = gathered;
  const predictable = TRAITS.filter((trait) => !unknownTraits.has(trait));
  return {
    possible: predictable
      .filter((trait) => positive(traits.range(trait)))
      .map((trait) => ({
        value: trait,
        chance: traits.range(trait),
        copies: TRAIT_COPIES[trait] ?? null,
        flags: inFlagOrder(flags.traits.get(trait)),
        caveats: TRAIT_CAVEATS[trait] ?? [],
      })),
    notPossible: predictable.filter((trait) => !positive(traits.range(trait))),
    cannotPredict: TRAITS.filter((trait) => unknownTraits.has(trait)).map((trait) => ({
      trait,
      unknown: unknownIn(READS[trait]),
    })),
  };
}

function canCarry(parent: CrossParent, gene: ColourGene, allele: string): boolean {
  const locus = parent.loci[gene];
  const candidates: readonly (readonly string[])[] = locus.status === 'resolved' ? locus.candidates : [];
  return candidates.some((pair) => copies(pair, allele) > 0);
}

function buildWarnings(
  traits: PuppyPrediction['traits'],
  lethal: Range,
  parents: readonly [CrossParent, CrossParent],
  unknownLoci: readonly UnknownLocus[],
): ColourWarning[] {
  // A parent's unknown locus can't rule out two copies when the other parent can carry the allele.
  const unruledOut = (gene: ColourGene, allele: string): UnknownLocus[] =>
    unknownLoci.filter((locus) => locus.gene === gene && canCarry(parents[locus.parent === 0 ? 1 : 0], gene, allele));
  const warnings: ColourWarning[] = [];
  const doubleMerle = traits.possible.find((row) => row.value === 'doubleMerle');
  const merleUnknown = unruledOut('PMEL', 'M');
  if (doubleMerle !== undefined) {
    warnings.push({ kind: 'double-merle', chance: doubleMerle.chance });
  } else if (merleUnknown.length > 0) {
    warnings.push({ kind: 'double-merle-unknown', unknown: merleUnknown });
  }
  const harlequinUnknown = unruledOut('PSMB7', 'H');
  if (positive(lethal)) {
    warnings.push({ kind: 'harlequin-lethal', chance: lethal });
  } else if (harlequinUnknown.length > 0) {
    warnings.push({ kind: 'harlequin-lethal-unknown', unknown: harlequinUnknown });
  }
  return warnings;
}

function buildCombined(gathered: Gathered, combiner: Combiner): PuppyPrediction['combined'] {
  const ranked = gathered.combined
    .keys()
    .map((id) => ({ id, chance: gathered.combined.range(id) }))
    .sort((left, right) => upperThenLower(left.chance, right.chance));
  const shown = ranked.slice(0, COMBINED_SHOWN);
  const outcomes = shown.map(({ id, chance }): CombinedOutcome => ({ phenotype: combiner.phenotype(id), chance }));
  if (ranked.length <= COMBINED_SHOWN) {
    return { outcomes, other: null };
  }
  const shownIds = new Set(shown.map(({ id }) => id));
  const rest = new Ranges<'other'>();
  for (const { pigment, white, combined } of gathered.live) {
    rest.nextScenario();
    const total = pigment.total * white.total;
    const listed = sum(combined.ids.map((id, index) => (shownIds.has(id) ? (combined.counts[index] ?? 0) : 0)));
    if (listed < total) {
      rest.add('other', total - listed, total);
    }
  }
  return { outcomes, other: rest.range('other') };
}

function buildHidden(gathered: Gathered): HiddenRow[] {
  const allBases = new Set([...gathered.pigmentCoats].map((coat) => coat.base));
  return [...PIGMENT_HIDDEN, ...WHITE_HIDDEN].flatMap((item): HiddenRow[] => {
    const key = hiddenKey(item);
    const chance = gathered.hidden.range(key);
    if (!positive(chance)) {
      return [];
    }
    const bases = [...(gathered.hiddenBases.get(key) ?? [])];
    const [only] = bases;
    const onlyIn = bases.length === 1 && only !== undefined && only !== 'unknown' && allBases.size > 1 ? only : null;
    const genotypes = [...(gathered.hiddenPairs.get(key) ?? [])].sort((l, r) => pairOrder(item.gene, l) - pairOrder(item.gene, r));
    return [{ id: item.id, hider: item.hider, genotypes, chance, onlyIn }];
  });
}

/** Every caveat shown anywhere, in a stable order, plus those that always apply. */
function collectCaveats(rows: TableRows, tableCaveats: readonly CaveatId[], traits: PuppyPrediction['traits'], combined: PuppyPrediction['combined']): CaveatId[] {
  const shownFlags = new Set<Flag>([
    ...[...rows.base, ...rows.pattern, ...traits.possible].flatMap((row) => row.flags),
    ...combined.outcomes.flatMap((outcome) => outcome.phenotype.flags),
  ]);
  return [
    ...new Set<CaveatId>([
      ...tableCaveats,
      ...traits.possible.flatMap((row) => row.caveats),
      ...FLAGS.filter((flag) => shownFlags.has(flag)),
      ...ALWAYS,
    ]),
  ];
}

export function predictPuppies(first: CrossParent, second: CrossParent): PuppyPrediction {
  const scenarios = crossScenarios(first, second);
  const unknownLoci = unknownLociOf(first, second);
  const unknownIn = (genes: readonly ColourGene[]): UnknownLocus[] => unknownLoci.filter((locus) => genes.includes(locus.gene));

  const combiner = new Combiner();
  const gathered = gather(countDistinct(scenarios, combiner));
  const flags = rowFlags(gathered);
  const rows = buildRows(gathered, flags);
  const traits = buildTraits(gathered, flags, unknownIn);
  const warnings = buildWarnings(traits, gathered.lethal, [first, second], unknownLoci);
  const combined = buildCombined(gathered, combiner);
  const hidden = buildHidden(gathered);

  const brindle = [...gathered.pigmentCoats].some((coat) => coat.flags.includes('brindle-possible'));
  const patternCaveats: CaveatId[] = brindle ? ['brindle-possible'] : [];
  const whiteCaveats: CaveatId[] = [
    ...(rows.white.some((row) => row.value === 'extensive') ? (['deafness'] as const) : []),
    ...(traits.possible.some((row) => row.value === 'doubleMerle') ? (['white-piebald-only'] as const) : []),
  ];
  const undocumentedLoci = undocumentedLociOf(first, second);
  const table = <V>(tableRows: readonly Row<V>[], caveats: readonly CaveatId[], genes: readonly ColourGene[]): Table<V> => {
    const undocumented = undocumentedLoci.filter((locus) => genes.includes(locus.gene));
    return {
      rows: tableRows,
      caveats: [...(undocumented.length > 0 ? (['undocumented-haplotype'] as const) : []), ...caveats],
      unknown: tableRows.some((row) => row.value === 'unknown') ? unknownIn(genes) : [],
      undocumented,
    };
  };
  const baseCaveats: CaveatId[] = rows.base.some((row) => row.value === 'albino') ? ['albino-health'] : [];
  const base = table(rows.base, baseCaveats, READS.base);
  const pattern = table(rows.pattern, patternCaveats, READS.pattern);
  const white = table(rows.white, whiteCaveats, READS.white);

  const ranges = [
    ...[...rows.base, ...rows.pattern, ...rows.white, ...traits.possible].map((row) => row.chance),
    ...combined.outcomes.map((outcome) => outcome.chance),
    ...(combined.other === null ? [] : [combined.other]),
    ...hidden.map((row) => row.chance),
    ...warnings.flatMap((warning) => ('chance' in warning ? [warning.chance] : [])),
  ];

  return {
    scenarios: scenarios.length,
    hasRanges: ranges.some((range) => !isSingle(range)),
    warnings,
    combined,
    base,
    pattern,
    white,
    traits,
    hidden,
    unknownLoci,
    undocumentedLoci,
    caveats: collectCaveats(rows, [...base.caveats, ...pattern.caveats, ...white.caveats], traits, combined),
  };
}
