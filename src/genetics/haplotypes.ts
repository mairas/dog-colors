// Turns a report's copy counts into candidate allele pairs per locus. The
// report gives no phase, so each gene's variant copies are placed on the dog's
// two chromosomes in every way the documented cis haplotypes allow; each
// placement decodes to one allele pair, and equal pairs merge.

import { COLOUR_GENES, type ColourGene } from '../report/loci.ts';
import type { Report } from '../report/types.ts';
import {
  comparePairs,
  formatPair,
  GENE_RULES,
  orderedPair,
  variantCodes,
  withLocus,
  type AllelePair,
  type Genotype,
} from './alleles.ts';

/**
 * Why a locus's copy counts fit no genotype: a count outside 0–2, or variants
 * that would need more than two chromosomes under the documented cis pairs.
 */
export type Inconsistency = 'invalid-count' | 'no-phasing';

export type LocusResolution<G extends ColourGene> =
  | { readonly status: 'missing' }
  | { readonly status: 'inconsistent'; readonly reason: Inconsistency }
  | { readonly status: 'resolved'; readonly candidates: readonly AllelePair<G>[] };

export type GenotypeResolution = { readonly [G in ColourGene]: LocusResolution<G> };

export function resolveLocus<G extends ColourGene>(
  gene: G,
  copies: Readonly<Record<string, number>>,
): LocusResolution<G> {
  const onBoth: string[] = [];
  const onOne: string[] = [];
  for (const code of variantCodes(gene)) {
    const count = copies[code] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > 2) {
      return { status: 'inconsistent', reason: 'invalid-count' };
    }
    if (count === 2) {
      onBoth.push(code);
    } else if (count === 1) {
      onOne.push(code);
    }
  }

  const rule = GENE_RULES[gene];
  const found = new Map<string, AllelePair<G>>();
  // The two chromosomes are interchangeable, so the first single-copy variant
  // stays on the first chromosome and only the others are placed both ways.
  const placements = onOne.length === 0 ? 1 : 2 ** (onOne.length - 1);
  for (let mask = 0; mask < placements; mask++) {
    const first = new Set(onBoth);
    const second = new Set(onBoth);
    onOne.forEach((code, index) => {
      (index > 0 && (mask >> (index - 1)) & 1 ? second : first).add(code);
    });
    if (rule.documented(first) && rule.documented(second)) {
      const pair = orderedPair(gene, rule.decode(first), rule.decode(second));
      found.set(formatPair(pair), pair);
    }
  }

  if (found.size === 0) {
    return { status: 'inconsistent', reason: 'no-phasing' };
  }
  const candidates = [...found.values()].sort((left, right) => comparePairs(gene, left, right));
  return { status: 'resolved', candidates };
}

export function resolveReport(report: Pick<Report, 'colour' | 'missingLoci'>): GenotypeResolution {
  const resolve = <G extends ColourGene>(gene: G): LocusResolution<G> => {
    const copies = report.colour[gene];
    return copies === undefined || report.missingLoci.includes(gene) ? { status: 'missing' } : resolveLocus(gene, copies);
  };
  return {
    ASIP: resolve('ASIP'),
    CBD103: resolve('CBD103'),
    MC1R: resolve('MC1R'),
    HPS3: resolve('HPS3'),
    MFSD12: resolve('MFSD12'),
    MLPH: resolve('MLPH'),
    TYRP1: resolve('TYRP1'),
    MITF: resolve('MITF'),
    PMEL: resolve('PMEL'),
    PSMB7: resolve('PSMB7'),
    RALY: resolve('RALY'),
    USH2A: resolve('USH2A'),
    SLC45A2: resolve('SLC45A2'),
  };
}

/**
 * Every genotype the candidates allow: the cross product over the resolved
 * loci. Missing and inconsistent loci are left out, so they stay unknown.
 */
export function candidateGenotypes(resolution: GenotypeResolution): Genotype[] {
  let genotypes: Genotype[] = [{}];
  const extend = <G extends ColourGene>(gene: G): void => {
    const locus: LocusResolution<G> = resolution[gene];
    if (locus.status === 'resolved') {
      genotypes = genotypes.flatMap((genotype) => locus.candidates.map((pair) => withLocus(genotype, gene, pair)));
    }
  };
  for (const gene of COLOUR_GENES) {
    extend(gene);
  }
  return genotypes;
}
