import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allPairs, formatPair, withLocus, type AllelePair, type Genotype } from '../../src/genetics/alleles.ts';
import { crossScenarios, offspringPairs, phenotypeClass, PIGMENT_GENES, WHITE_GENES, type GroupResult } from '../../src/genetics/cross.ts';
import { PIGMENT_HIDDEN, WHITE_HIDDEN, type HiddenItem } from '../../src/genetics/hidden.ts';
import { phenotype, pigmentPhenotype, whitePhenotype } from '../../src/genetics/phenotype.ts';
import { COLOUR_GENES, type ColourGene } from '../../src/report/loci.ts';
import { parentLoci } from './genotypes.ts';

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

function randomGenotype(next: () => number): Genotype {
  let result: Genotype = {};
  const set = <G extends ColourGene>(gene: G): void => {
    result = withLocus(result, gene, pick(next, allPairs(gene)));
  };
  for (const gene of COLOUR_GENES) {
    set(gene);
  }
  return result;
}

describe('phenotypeClass', () => {
  it('puts two pairs in one class only when every coat they give is the same', () => {
    const next = random(1);
    const contexts = Array.from({ length: 300 }, () => randomGenotype(next));
    const check = <G extends ColourGene>(gene: G): void => {
      const classes = new Map<string, AllelePair<G>[]>();
      for (const pair of allPairs(gene)) {
        const key = phenotypeClass(gene, pair);
        classes.set(key, [...(classes.get(key) ?? []), pair]);
      }
      for (const pairs of classes.values()) {
        for (const context of contexts) {
          const coats = new Set(pairs.map((pair) => JSON.stringify(phenotype(withLocus(context, gene, pair)))));
          expect(coats.size, `${gene} ${pairs.map(formatPair).join(', ')}`).toBe(1);
        }
      }
    };
    for (const gene of COLOUR_GENES) {
      check(gene);
    }
  });
});

describe('offspringPairs', () => {
  it('gives each of the four allele combinations a weight of one in four', () => {
    expect(offspringPairs('TYRP1', ['B', 'b'], ['B', 'b']).map(({ pair, count }) => [formatPair(pair), count])).toEqual([
      ['B/B', 1],
      ['B/b', 2],
      ['b/b', 1],
    ]);
  });
});

/** Every offspring genotype of the group, enumerated in full, with its weight out of 4^loci. */
function bruteForce<P>(
  genes: readonly ColourGene[],
  parents: readonly [Genotype, Genotype],
  coat: (genotype: Genotype) => P,
  items: readonly HiddenItem<P>[],
  lethal: (value: P) => boolean,
): { outcomes: Map<string, number>; hidden: Map<string, number>; lethal: number; total: number } {
  let genotypes: { genotype: Genotype; weight: number }[] = [{ genotype: {}, weight: 1 }];
  const extend = <G extends ColourGene>(gene: G): void => {
    const first = parents[0][gene];
    const second = parents[1][gene];
    if (first === undefined || second === undefined) {
      return;
    }
    const pairs = offspringPairs(gene, first, second);
    genotypes = genotypes.flatMap(({ genotype: partial, weight }) =>
      pairs.map(({ pair, count }) => ({ genotype: withLocus(partial, gene, pair), weight: weight * count })),
    );
  };
  for (const gene of genes) {
    extend(gene);
  }
  const outcomes = new Map<string, number>();
  const hidden = new Map<string, number>();
  let dead = 0;
  for (const { genotype: offspring, weight } of genotypes) {
    const value = coat(offspring);
    if (lethal(value)) {
      dead += weight;
      continue;
    }
    const key = JSON.stringify(value);
    outcomes.set(key, (outcomes.get(key) ?? 0) + weight);
    items.forEach((item, index) => {
      const pair = offspring[item.gene];
      if (pair !== undefined && item.carries(pair) && item.hidden(value)) {
        hidden.set(String(index), (hidden.get(String(index)) ?? 0) + weight);
      }
    });
  }
  const total = genotypes.reduce((sum, { weight }) => sum + weight, 0);
  return { outcomes, hidden, lethal: dead, total };
}

function asMaps<P>(group: GroupResult<P>, items: readonly HiddenItem<P>[]): { outcomes: Map<string, number>; hidden: Map<string, number> } {
  return {
    outcomes: new Map(group.outcomes.map(({ phenotype: value, count }) => [JSON.stringify(value), count])),
    hidden: new Map(group.hidden.map(({ item, count }) => [String(items.indexOf(item)), count])),
  };
}

describe('crossScenarios', () => {
  it('matches a full enumeration of the offspring genotypes', () => {
    const next = random(7);
    for (let trial = 0; trial < 40; trial++) {
      const spec = (): Partial<Record<ColourGene, string[]>> => {
        const result: Partial<Record<ColourGene, string[]>> = {};
        for (const gene of COLOUR_GENES) {
          if (next() < 0.45) {
            const pairs = allPairs(gene).map(formatPair);
            result[gene] = next() < 0.15 ? [pick(next, pairs), pick(next, pairs)].filter((p, i, all) => all.indexOf(p) === i) : [pick(next, pairs)];
          }
        }
        return result;
      };
      const missing = next() < 0.3 ? [pick(next, COLOUR_GENES)] : [];
      const scenarios = crossScenarios({ loci: parentLoci(spec(), missing) }, { loci: parentLoci(spec()) });
      for (const scenario of scenarios) {
        const pigment = bruteForce(PIGMENT_GENES, scenario.parents, pigmentPhenotype, PIGMENT_HIDDEN, (value) => value.lethal === 'yes');
        expect(scenario.pigment.total).toBe(pigment.total - pigment.lethal);
        expect(asMaps(scenario.pigment, PIGMENT_HIDDEN)).toEqual({ outcomes: pigment.outcomes, hidden: pigment.hidden });
        const white = bruteForce(WHITE_GENES, scenario.parents, whitePhenotype, WHITE_HIDDEN, () => false);
        expect(scenario.white.total).toBe(white.total);
        expect(asMaps(scenario.white, WHITE_HIDDEN)).toEqual({ outcomes: white.outcomes, hidden: white.hidden });
      }
    }
  });

  it('runs one scenario per pair of candidate genotypes', () => {
    const scenarios = crossScenarios(
      { loci: parentLoci({ TYRP1: ['B/b', 'b/b'], ASIP: ['ay/at', 'ayt/aw'] }) },
      { loci: parentLoci({ TYRP1: ['B/b', 'b/b'] }) },
    );
    expect(scenarios).toHaveLength(8);
  });

  it('gives exact counts that add up to the total in every scenario', () => {
    const scenarios = crossScenarios(
      { loci: parentLoci({ TYRP1: ['B/b', 'b/b'], MLPH: 'D/d', MITF: 'sp/+', PSMB7: 'H/h', PMEL: 'M/m' }) },
      { loci: parentLoci({ TYRP1: 'B/b', MLPH: 'D/d', MITF: 'sp/sp', PSMB7: 'H/h' }) },
    );
    for (const { pigment, white } of scenarios) {
      expect(pigment.outcomes.reduce((sum, { count }) => sum + count, 0)).toBe(pigment.total);
      expect(white.outcomes.reduce((sum, { count }) => sum + count, 0)).toBe(white.total);
    }
  });

  it('leaves no live puppies when every conception is H/H', () => {
    const [scenario] = crossScenarios({ loci: parentLoci({ PSMB7: 'H/H', PMEL: 'M/m' }) }, { loci: parentLoci({ PSMB7: 'H/H' }) });
    expect(scenario?.pigment).toMatchObject({ total: 0, outcomes: [], hidden: [], lethal: { numerator: 1, denominator: 1 } });
  });

  it('removes H/H puppies and renormalises the rest', () => {
    const [scenario] = crossScenarios({ loci: parentLoci({ PSMB7: 'H/h', PMEL: 'M/m' }) }, { loci: parentLoci({ PSMB7: 'H/h' }) });
    expect(scenario?.pigment.lethal).toEqual({ numerator: 1, denominator: 4 });
    expect(scenario?.pigment.outcomes.every(({ phenotype: value }) => value.lethal !== 'yes')).toBe(true);
    const harlequin = scenario?.pigment.outcomes
      .filter(({ phenotype: value }) => value.harlequin === 'yes')
      .reduce((sum, { count }) => sum + count, 0);
    // M/m (1/2) × H/h among live puppies (2/3).
    expect((harlequin ?? 0) / (scenario?.pigment.total ?? 1)).toBeCloseTo(1 / 3);
  });
});

interface OracleRow {
  readonly id: string;
  readonly genotype: Readonly<Partial<Record<ColourGene, string>>>;
}

describe('literature oracle: H/H never survives a cross', () => {
  const rows = JSON.parse(readFileSync(new URL('./oracle.json', import.meta.url), 'utf8')) as OracleRow[];

  it.each(rows.map((row) => [row.id, row] as const))('%s, carrying H, × a harlequin merle', (_id, row) => {
    const first = { ...row.genotype, PSMB7: row.genotype.PSMB7 === 'H/H' ? 'H/H' : 'H/h' };
    const scenarios = crossScenarios({ loci: parentLoci(first) }, { loci: parentLoci({ PSMB7: 'H/h', PMEL: 'M/m' }) });
    for (const scenario of scenarios) {
      expect(scenario.pigment.outcomes.some(({ phenotype: value }) => value.lethal === 'yes')).toBe(false);
      expect(scenario.pigment.lethal.numerator).toBeGreaterThan(0);
    }
  });
});
