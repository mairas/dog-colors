// Offspring of two parents, per scenario: one scenario per pair of the
// parents' candidate genotypes. Loci are inherited independently, and the
// pigment loci and the white loci (MITF, USH2A) are enumerated as two groups.
//
// Enumerating every offspring genotype is too slow for heterozygous parents,
// so each group is reduced twice. First, the pairs at a locus that every coat
// treats alike (B/B and B/b) form one class. Second, the coat of every class
// combination the pairing can produce is computed once, and arranged as a
// decision tree over the loci in which a locus that no longer matters (TYRP1
// under albino) is skipped. Each scenario then walks the tree with its own
// class weights. Weights are integers out of 4 per locus, so every count is
// exact; a locus skipped on a path keeps its full weight.

import { fraction, type Fraction } from '../health/fraction.ts';
import type { ColourGene } from '../report/loci.ts';
import { comparePairs, copies, formatPair, orderedPair, type AllelePair, type Genotype } from './alleles.ts';
import { candidateGenotypes, type GenotypeResolution } from './haplotypes.ts';
import { PIGMENT_HIDDEN, WHITE_HIDDEN, type HiddenItem } from './hidden.ts';
import { pigmentPhenotype, skipsDominantBlack, whitePhenotype, type PigmentPhenotype, type WhitePhenotype } from './phenotype.ts';

/** Epistatic loci first, so that the loci they hide drop out of the tree near its root. */
export const PIGMENT_GENES = [
  'SLC45A2',
  'MC1R',
  'CBD103',
  'ASIP',
  'RALY',
  'TYRP1',
  'HPS3',
  'MLPH',
  'MFSD12',
  'PMEL',
  'PSMB7',
] as const satisfies readonly ColourGene[];

export const WHITE_GENES = ['MITF', 'USH2A'] as const satisfies readonly ColourGene[];

export interface CrossParent {
  readonly loci: GenotypeResolution;
}

export interface Offspring<G extends ColourGene> {
  readonly pair: AllelePair<G>;
  /** Out of 4. */
  readonly count: number;
}

/** The pairs a puppy can inherit, in display order. */
export function offspringPairs<G extends ColourGene>(gene: G, first: AllelePair<G>, second: AllelePair<G>): Offspring<G>[] {
  const found = new Map<string, { pair: AllelePair<G>; count: number }>();
  for (const left of first) {
    for (const right of second) {
      const pair = orderedPair(gene, left, right);
      const key = formatPair(pair);
      const entry = found.get(key) ?? { pair, count: 0 };
      entry.count++;
      found.set(key, entry);
    }
  }
  return [...found.values()].sort((left, right) => comparePairs(gene, left.pair, right.pair));
}

const has = (pair: readonly string[], allele: string): boolean => pair.includes(allele);
const flags = (...values: boolean[]): string => values.map((value) => (value ? 1 : 0)).join('');

// What each phenotype rule asks of a locus. Two pairs with the same class give
// the same coat in every genotype; tests/genetics/cross.test.ts checks this
// against the phenotype functions, so a rule change that splits a class fails there.
const CLASSES: Readonly<Record<ColourGene, (pair: readonly string[]) => string>> = {
  ASIP: (pair) => {
    if (has(pair, 'ay') || has(pair, 'ayt')) {
      return `sable${flags(has(pair, 'ayt'))}`;
    }
    return has(pair, 'aw') ? 'wolf' : has(pair, 'at') ? 'tan' : 'recessive';
  },
  CBD103: (pair) => flags(has(pair, 'KB')),
  MC1R: (pair) =>
    flags(
      copies(pair, 'e') === 2,
      has(pair, 'eH') || has(pair, 'eG'),
      skipsDominantBlack(pair),
      skipsDominantBlack(pair) && has(pair, 'eA'),
      has(pair, 'Em'),
    ),
  HPS3: (pair) => flags(copies(pair, 'co') === 2),
  MFSD12: (pair) => flags(copies(pair, 'i') === 2),
  MLPH: (pair) => flags(copies(pair, 'd') === 2),
  TYRP1: (pair) => flags(copies(pair, 'b') === 2),
  MITF: (pair) => String(copies(pair, 'sp')),
  PMEL: (pair) => String(copies(pair, 'M')),
  PSMB7: (pair) => String(copies(pair, 'H')),
  RALY: (pair) => flags(has(pair, '+')),
  USH2A: (pair) => String(copies(pair, 'R')),
  SLC45A2: (pair) => flags(copies(pair, 'cal') === 2),
};

export function phenotypeClass(gene: ColourGene, pair: readonly string[]): string {
  return CLASSES[gene](pair);
}

export interface Outcome<P> {
  readonly phenotype: P;
  /** Out of the group's total. */
  readonly count: number;
}

export interface HiddenCount<P> {
  readonly item: HiddenItem<P>;
  /** Out of the group's total. */
  readonly count: number;
  /** The pairs at the item's locus of the puppies counted, formatted. */
  readonly pairs: readonly string[];
  /** The coats of the puppies counted. */
  readonly coats: readonly P[];
}

export interface GroupResult<P> {
  /** Live puppies: 4 per known locus of the group, multiplied, less the H/H conceptions; zero when every conception is H/H. */
  readonly total: number;
  /** Outcomes with a positive count; they sum to the total. */
  readonly outcomes: readonly Outcome<P>[];
  readonly hidden: readonly HiddenCount<P>[];
  /** The share of conceptions that are H/H and die before birth. */
  readonly lethal: Fraction;
}

export interface Scenario {
  readonly parents: readonly [Genotype, Genotype];
  readonly pigment: GroupResult<PigmentPhenotype>;
  readonly white: GroupResult<WhitePhenotype>;
}

interface Group<P> {
  readonly genes: readonly ColourGene[];
  readonly coat: (genotype: Genotype) => P;
  readonly items: readonly HiddenItem<P>[];
  readonly lethal: (coat: P) => boolean;
}

const PIGMENT: Group<PigmentPhenotype> = {
  genes: PIGMENT_GENES,
  coat: pigmentPhenotype,
  items: PIGMENT_HIDDEN,
  lethal: (coat) => coat.lethal === 'yes',
};

const WHITE: Group<WhitePhenotype> = { genes: WHITE_GENES, coat: whitePhenotype, items: WHITE_HIDDEN, lethal: () => false };

type AnyPair = AllelePair<ColourGene>;

type MutableGenotype = { -readonly [G in ColourGene]?: AllelePair<G> };

function setLocus<G extends ColourGene>(genotype: MutableGenotype, gene: G, pair: AllelePair<G>): void {
  const locus: { -readonly [K in G]?: AllelePair<K> } = genotype;
  locus[gene] = pair;
}

interface PairClass {
  readonly representative: AnyPair;
  /** Formatted pairs, in display order. */
  readonly pairs: readonly string[];
}

interface Locus {
  readonly gene: ColourGene;
  readonly classes: readonly PairClass[];
}

interface Branch {
  readonly classes: readonly number[];
  readonly node: TreeNode;
}

type TreeNode = { readonly outcome: number } | { readonly locus: number; readonly branches: readonly Branch[] };

const LOCUS_WEIGHT = 4;

/** One group's decision tree for one pairing, and its results per distinct offspring distribution. */
class GroupCross<P> {
  private readonly outcomes: P[] = [];
  private readonly outcomeIds = new Map<string, number>();
  private readonly leaves: TreeNode[] = [];
  private readonly nodes = new Map<string, TreeNode>();
  private readonly nodeIds = new Map<TreeNode, number>();
  private readonly hiddenFor: number[][] = [];
  private readonly itemLocus: readonly number[];
  /** Per item, per class of its locus, the pairs that carry it. */
  private readonly carriers: readonly (readonly (readonly string[])[])[];
  private readonly root: TreeNode;
  private readonly results = new Map<string, GroupResult<P>>();
  private readonly group: Group<P>;
  private readonly loci: readonly Locus[];

  constructor(group: Group<P>, loci: readonly Locus[]) {
    this.group = group;
    this.loci = loci;
    this.itemLocus = group.items.map((item) => loci.findIndex((locus) => locus.gene === item.gene));
    this.carriers = group.items.map((item, index) =>
      (loci[this.itemLocus[index] ?? -1]?.classes ?? []).map((pairClass) =>
        pairClass.pairs.filter((pair) => item.carries(pair.split('/'))),
      ),
    );
    this.root = this.build(0, {});
  }

  private build(index: number, genotype: MutableGenotype): TreeNode {
    const locus = this.loci[index];
    if (locus === undefined) {
      return this.leaf(this.group.coat({ ...genotype }));
    }
    const branches: { classes: number[]; node: TreeNode }[] = [];
    locus.classes.forEach((pairClass, at) => {
      setLocus(genotype, locus.gene, pairClass.representative);
      const node = this.build(index + 1, genotype);
      const same = branches.find((branch) => branch.node === node);
      if (same === undefined) {
        branches.push({ classes: [at], node });
      } else {
        same.classes.push(at);
      }
    });
    const [only, ...others] = branches;
    if (only !== undefined && others.length === 0) {
      return only.node;
    }
    const key = `${index}:${branches.map((branch) => `${branch.classes.join(',')}>${this.nodeId(branch.node)}`).join(';')}`;
    let node = this.nodes.get(key);
    if (node === undefined) {
      node = { locus: index, branches };
      this.nodes.set(key, node);
    }
    return node;
  }

  private nodeId(node: TreeNode): number {
    let id = this.nodeIds.get(node);
    if (id === undefined) {
      id = this.nodeIds.size;
      this.nodeIds.set(node, id);
    }
    return id;
  }

  private leaf(coat: P): TreeNode {
    const key = JSON.stringify(coat);
    let outcome = this.outcomeIds.get(key);
    if (outcome === undefined) {
      outcome = this.outcomes.length;
      this.outcomes.push(coat);
      this.outcomeIds.set(key, outcome);
      this.leaves.push({ outcome });
      this.hiddenFor.push(
        this.group.lethal(coat)
          ? []
          : this.group.items.flatMap((item, at) => (this.itemLocus[at] !== -1 && item.hidden(coat) ? [at] : [])),
      );
    }
    const leaf = this.leaves[outcome];
    if (leaf === undefined) {
      throw new Error(`no leaf for outcome ${outcome}`);
    }
    return leaf;
  }

  /** The group's outcomes for offspring of these two genotypes. */
  evaluate(first: Genotype, second: Genotype): GroupResult<P> {
    const offspring = this.loci.map((locus) => offspringOf(locus.gene, first, second));
    const key = offspring.map((pairs) => [...pairs].map(([pair, count]) => `${pair}=${count}`).join(',')).join('|');
    let result = this.results.get(key);
    if (result === undefined) {
      result = this.walk(offspring);
      this.results.set(key, result);
    }
    return result;
  }

  private walk(offspring: readonly ReadonlyMap<string, number>[]): GroupResult<P> {
    const { loci, group, itemLocus, hiddenFor, carriers } = this;
    const weightOf = (at: number, pair: string): number => offspring[at]?.get(pair) ?? 0;
    const weights = loci.map((locus, at) => locus.classes.map((pairClass) => sum(pairClass.pairs.map((pair) => weightOf(at, pair)))));
    const carried = carriers.map((byClass, index) =>
      byClass.map((pairs) => sum(pairs.map((pair) => weightOf(itemLocus[index] ?? -1, pair)))),
    );
    const carriedTotal = carried.map(sum);

    const counts = new Float64Array(this.outcomes.length);
    const hiddenCounts = new Float64Array(group.items.length);
    const coatSeen = group.items.map(() => new Uint8Array(this.outcomes.length));
    const hiddenCoats: number[][] = group.items.map(() => []);
    const hiddenClasses = group.items.map((_, index) => new Uint8Array(loci[itemLocus[index] ?? -1]?.classes.length ?? 0));
    const path: (Branch | undefined)[] = loci.map(() => undefined);
    const pathWeight = loci.map(() => 0);

    const visit = (node: TreeNode, factor: number): void => {
      if ('outcome' in node) {
        const outcome = node.outcome;
        counts[outcome] = (counts[outcome] ?? 0) + factor;
        for (const item of hiddenFor[outcome] ?? []) {
          const at = itemLocus[item] ?? -1;
          const branch = path[at];
          const byClass = carried[item] ?? [];
          const marks = hiddenClasses[item] ?? new Uint8Array(0);
          let share = 0;
          if (branch === undefined) {
            share = (factor / LOCUS_WEIGHT) * (carriedTotal[item] ?? 0);
            if (share > 0) {
              marks.fill(1);
            }
          } else {
            let restricted = 0;
            for (const pairClass of branch.classes) {
              const weight = byClass[pairClass] ?? 0;
              if (weight > 0) {
                restricted += weight;
                marks[pairClass] = 1;
              }
            }
            share = (factor / (pathWeight[at] ?? 1)) * restricted;
          }
          if (share > 0) {
            hiddenCounts[item] = (hiddenCounts[item] ?? 0) + share;
            const seen = coatSeen[item];
            if (seen !== undefined && seen[outcome] === 0) {
              seen[outcome] = 1;
              hiddenCoats[item]?.push(outcome);
            }
          }
        }
        return;
      }
      const classWeights = weights[node.locus] ?? [];
      for (const branch of node.branches) {
        let weight = 0;
        for (const pairClass of branch.classes) {
          weight += classWeights[pairClass] ?? 0;
        }
        if (weight > 0) {
          path[node.locus] = branch;
          pathWeight[node.locus] = weight;
          visit(branch.node, (factor / LOCUS_WEIGHT) * weight);
          path[node.locus] = undefined;
        }
      }
    };
    const conceptions = LOCUS_WEIGHT ** loci.length;
    visit(this.root, conceptions);

    const present = [...counts.keys()].filter((outcome) => (counts[outcome] ?? 0) > 0);
    const lethal = sum(present.map((outcome) => (group.lethal(this.coat(outcome)) ? (counts[outcome] ?? 0) : 0)));
    const outcomes = present
      .filter((outcome) => !group.lethal(this.coat(outcome)))
      .map((outcome) => ({ phenotype: this.coat(outcome), count: counts[outcome] ?? 0 }));
    const hidden = group.items.flatMap((item, index): HiddenCount<P>[] => {
      const count = hiddenCounts[index] ?? 0;
      if (count === 0) {
        return [];
      }
      const at = itemLocus[index] ?? -1;
      const marks = hiddenClasses[index] ?? new Uint8Array(0);
      const pairs = (carriers[index] ?? [])
        .filter((_, pairClass) => marks[pairClass] === 1)
        .flat()
        .filter((pair) => weightOf(at, pair) > 0);
      const coats = (hiddenCoats[index] ?? []).map((outcome) => this.coat(outcome));
      return [{ item, count, pairs, coats }];
    });
    return {
      total: conceptions - lethal,
      outcomes,
      hidden,
      lethal: fraction(lethal, conceptions),
    };
  }

  private coat(outcome: number): P {
    const coat = this.outcomes[outcome];
    if (coat === undefined) {
      throw new Error(`no outcome ${outcome}`);
    }
    return coat;
  }
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function offspringOf<G extends ColourGene>(gene: G, first: Genotype, second: Genotype): Map<string, number> {
  const left = first[gene];
  const right = second[gene];
  if (left === undefined || right === undefined) {
    throw new Error(`${gene} is not known in both parents`);
  }
  return new Map(offspringPairs(gene, left, right).map(({ pair, count }) => [formatPair(pair), count]));
}

/** The classes of every pair a puppy can inherit at the locus, over all scenarios. */
function locusOf<G extends ColourGene>(gene: G, firsts: readonly Genotype[], seconds: readonly Genotype[]): Locus {
  const pairs = new Map<string, AllelePair<G>>();
  for (const first of firsts) {
    for (const second of seconds) {
      const left = first[gene];
      const right = second[gene];
      if (left !== undefined && right !== undefined) {
        for (const { pair } of offspringPairs(gene, left, right)) {
          pairs.set(formatPair(pair), pair);
        }
      }
    }
  }
  const sorted = [...pairs.values()].sort((left, right) => comparePairs(gene, left, right));
  const classes: { representative: AnyPair; pairs: string[] }[] = [];
  const classIds = new Map<string, number>();
  for (const pair of sorted) {
    const key = phenotypeClass(gene, pair);
    let id = classIds.get(key);
    if (id === undefined) {
      id = classes.length;
      classIds.set(key, id);
      classes.push({ representative: pair, pairs: [] });
    }
    classes[id]?.pairs.push(formatPair(pair));
  }
  return { gene, classes };
}

function groupCross<P>(group: Group<P>, firsts: readonly Genotype[], seconds: readonly Genotype[], known: (gene: ColourGene) => boolean): GroupCross<P> {
  return new GroupCross(
    group,
    group.genes.filter(known).map((gene) => locusOf(gene, firsts, seconds)),
  );
}

/**
 * One scenario per pair of candidate genotypes, Parent 1's candidates outer.
 * A locus missing or inconsistent in either parent is unknown in every puppy.
 */
export function crossScenarios(first: CrossParent, second: CrossParent): Scenario[] {
  const firsts = candidateGenotypes(first.loci);
  const seconds = candidateGenotypes(second.loci);
  const known = (gene: ColourGene): boolean =>
    first.loci[gene].status === 'resolved' && second.loci[gene].status === 'resolved';
  const pigment = groupCross(PIGMENT, firsts, seconds, known);
  const white = groupCross(WHITE, firsts, seconds, known);
  return firsts.flatMap((left) =>
    seconds.map((right): Scenario => ({
      parents: [left, right],
      pigment: pigment.evaluate(left, right),
      white: white.evaluate(left, right),
    })),
  );
}
