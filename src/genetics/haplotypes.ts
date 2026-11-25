// Turns a report's copy counts into candidate allele pairs per locus. The
// report gives no phase, so each gene's variant copies are placed on the dog's
// two chromosomes in every way the documented cis haplotypes allow; each
// placement decodes to one allele pair, and equal pairs merge. When no
// documented placement fits at all, the placements whose chromosomes each carry
// only variants that alone decode to that chromosome's allele are tried: if
// they all decode to the same pair, that pair is used and marked undocumented.

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
  type Chromosome,
  type Genotype,
} from './alleles.ts';

/**
 * Why a locus's copy counts fit no genotype: a count outside 0–2, or variants
 * that fit no documented placement and whose other placements either put
 * variants with different effects on one chromosome or decode to different pairs.
 */
export type Inconsistency = 'invalid-count' | 'no-phasing';

export type LocusResolution<G extends ColourGene> =
  | { readonly status: 'missing' }
  | { readonly status: 'inconsistent'; readonly reason: Inconsistency }
  | {
      readonly status: 'resolved';
      readonly candidates: readonly AllelePair<G>[];
      /** Set when no documented placement fits and every placement that keeps each variant's own effect gives this one pair. */
      readonly undocumented?: true;
    };

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
  // The two chromosomes are interchangeable, so the first single-copy variant
  // stays on the first chromosome and only the others are placed both ways.
  const placements = Array.from({ length: onOne.length === 0 ? 1 : 2 ** (onOne.length - 1) }, (_, mask) => {
    const first = new Set(onBoth);
    const second = new Set(onBoth);
    onOne.forEach((code, index) => {
      (index > 0 && (mask >> (index - 1)) & 1 ? second : first).add(code);
    });
    return [first, second] as const;
  });
  const decoded = (chosen: readonly (readonly [Chromosome, Chromosome])[]): AllelePair<G>[] => {
    const found = new Map<string, AllelePair<G>>();
    for (const [first, second] of chosen) {
      const pair = orderedPair(gene, rule.decode(first), rule.decode(second));
      found.set(formatPair(pair), pair);
    }
    return [...found.values()].sort((left, right) => comparePairs(gene, left, right));
  };

  const documented = placements.filter(([first, second]) => rule.documented(first) && rule.documented(second));
  if (documented.length > 0) {
    return { status: 'resolved', candidates: decoded(documented) };
  }
  // On a chromosome carrying a variant that alone decodes to another allele,
  // decode order, not the report, would settle the allele.
  const keepsEffects = (chromosome: Chromosome): boolean =>
    [...chromosome].every((code) => rule.decode(new Set([code])) === rule.decode(chromosome));
  const candidates = decoded(placements.filter(([first, second]) => keepsEffects(first) && keepsEffects(second)));
  return candidates.length === 1
    ? { status: 'resolved', candidates, undocumented: true }
    : { status: 'inconsistent', reason: 'no-phasing' };
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
