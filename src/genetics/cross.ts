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
import { comparePairs, formatPair, orderedPair, withLocus, type AllelePair, type Genotype } from './alleles.ts';
import { candidateGenotypes, type GenotypeResolution } from './haplotypes.ts';
import { PIGMENT_HIDDEN, WHITE_HIDDEN, type HiddenItem } from './hidden.ts';
import { pigmentPhenotype, whitePhenotype, type PigmentPhenotype, type WhitePhenotype } from './phenotype.ts';

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

const copies = (pair: readonly string[], allele: string): number => pair.filter((item) => item === allele).length;
const has = (pair: readonly string[], allele: string): boolean => pair.includes(allele);
const flags = (...values: boolean[]): string => values.map((value) => (value ? 1 : 0)).join('');

// What each phenotype rule asks of a locus. Two pairs with the same class give
// the same coat in every genotype; tests/genetics/cross.test.ts checks this
// against the phenotype functions, so a rule change that splits a class fails there.
const CLASSES: Readonly<Record<ColourGene, (pair: readonly string[]) => string>> = {
  ASIP: (pair) => flags(has(pair, 'ayt'), has(pair, 'ay') || has(pair, 'ayt'), has(pair, 'aw'), has(pair, 'at')),
  CBD103: (pair) => flags(has(pair, 'KB')),
  MC1R: (pair) =>
    flags(
      copies(pair, 'e') === 2,
      has(pair, 'eH') || has(pair, 'eG'),
      has(pair, 'eA') && copies(pair, 'eA') + copies(pair, 'e') === 2,
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
  /** The pairs at the item's locus of the puppies counted, formatted, in display order. */
  readonly pairs: readonly string[];
  /** The coats of the puppies counted. */
  readonly coats: readonly P[];
}

export interface GroupResult<P> {
  /** Live puppies: 4 per known locus of the group, multiplied, less the H/H conceptions. */
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
  readonly lethal: Fraction;
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
  private readonly root: TreeNode;
  private readonly results = new Map<string, GroupResult<P>>();
  private readonly group: Group<P>;
  private readonly loci: readonly Locus[];

  constructor(group: Group<P>, loci: readonly Locus[]) {
    this.group = group;
    this.loci = loci;
    this.itemLocus = group.items.map((item) => loci.findIndex((locus) => locus.gene === item.gene));
    this.root = this.build(0, []);
  }

  private build(index: number, chosen: number[]): TreeNode {
    const locus = this.loci[index];
    if (locus === undefined) {
      let genotype: Genotype = {};
      this.loci.forEach((known, at) => {
        const representative = known.classes[chosen[at] ?? 0]?.representative;
        if (representative !== undefined) {
          genotype = withLocus(genotype, known.gene, representative);
        }
      });
      return this.leaf(this.group.coat(genotype));
    }
    const branches: { classes: number[]; node: TreeNode }[] = [];
    locus.classes.forEach((_, at) => {
      chosen[index] = at;
      const node = this.build(index + 1, chosen);
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
    const { loci, group, itemLocus } = this;
    const weights = loci.map((locus, at) =>
      locus.classes.map((pairClass) => sum(pairClass.pairs.map((pair) => offspring[at]?.get(pair) ?? 0))),
    );
    const carried = group.items.map((item, at) =>
      (loci[itemLocus[at] ?? -1]?.classes ?? []).map((pairClass) =>
        sum(pairClass.pairs.map((pair) => (item.carries(pair.split('/')) ? (offspring[itemLocus[at] ?? -1]?.get(pair) ?? 0) : 0))),
      ),
    );
    const carriedTotal = carried.map(sum);

    const counts = new Map<number, number>();
    const hiddenCounts = group.items.map(() => 0);
    const hiddenCoats = group.items.map(() => new Set<number>());
    const hiddenClasses = group.items.map(() => new Set<number>());
    const path: (Branch | undefined)[] = loci.map(() => undefined);
    const branchWeight = (at: number, branch: Branch, byClass: readonly number[] | undefined): number =>
      sum(branch.classes.map((pairClass) => byClass?.[pairClass] ?? weights[at]?.[pairClass] ?? 0));

    const visit = (node: TreeNode, factor: number): void => {
      if ('outcome' in node) {
        counts.set(node.outcome, (counts.get(node.outcome) ?? 0) + factor);
        for (const item of this.hiddenFor[node.outcome] ?? []) {
          const at = itemLocus[item] ?? -1;
          const branch = path[at];
          const share =
            branch === undefined
              ? (factor / LOCUS_WEIGHT) * (carriedTotal[item] ?? 0)
              : (factor / branchWeight(at, branch, undefined)) * branchWeight(at, branch, carried[item]);
          if (share > 0) {
            hiddenCounts[item] = (hiddenCounts[item] ?? 0) + share;
            hiddenCoats[item]?.add(node.outcome);
            const classes = branch?.classes ?? loci[at]?.classes.map((_, index) => index) ?? [];
            for (const pairClass of classes) {
              if ((carried[item]?.[pairClass] ?? 0) > 0) {
                hiddenClasses[item]?.add(pairClass);
              }
            }
          }
        }
        return;
      }
      for (const branch of node.branches) {
        const weight = branchWeight(node.locus, branch, undefined);
        if (weight > 0) {
          path[node.locus] = branch;
          visit(branch.node, (factor / LOCUS_WEIGHT) * weight);
          path[node.locus] = undefined;
        }
      }
    };
    const conceptions = LOCUS_WEIGHT ** loci.length;
    visit(this.root, conceptions);

    const lethal = sum([...counts].map(([outcome, count]) => (group.lethal(this.coat(outcome)) ? count : 0)));
    const removeLethal = lethal < conceptions;
    const outcomes = [...counts]
      .filter(([outcome]) => !removeLethal || !group.lethal(this.coat(outcome)))
      .map(([outcome, count]) => ({ phenotype: this.coat(outcome), count }));
    const hidden = group.items.flatMap((item, at): HiddenCount<P>[] => {
      const count = hiddenCounts[at] ?? 0;
      if (count === 0) {
        return [];
      }
      const locus = loci[itemLocus[at] ?? -1];
      const pairs = [...(hiddenClasses[at] ?? [])]
        .flatMap((pairClass) => locus?.classes[pairClass]?.pairs ?? [])
        .filter((pair) => item.carries(pair.split('/')) && (offspring[itemLocus[at] ?? -1]?.get(pair) ?? 0) > 0);
      return [{ item, count, pairs: inDisplayOrder(locus, pairs), coats: [...(hiddenCoats[at] ?? [])].map((outcome) => this.coat(outcome)) }];
    });
    return {
      total: removeLethal ? conceptions - lethal : conceptions,
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function inDisplayOrder(locus: Locus | undefined, pairs: readonly string[]): string[] {
  const order = locus?.classes.flatMap((pairClass) => pairClass.pairs) ?? [];
  const position = (pair: string): number => order.indexOf(pair);
  return [...new Set(pairs)].sort((left, right) => position(left) - position(right));
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
    seconds.map((right): Scenario => {
      const pigmentResult = pigment.evaluate(left, right);
      return {
        parents: [left, right],
        pigment: pigmentResult,
        white: white.evaluate(left, right),
        lethal: pigmentResult.lethal,
      };
    }),
  );
}
