import { ALLELES, withLocus, type Allele, type AllelePair, type Genotype } from '../../src/genetics/alleles.ts';
import type { GenotypeResolution, LocusResolution } from '../../src/genetics/haplotypes.ts';
import { COLOUR_GENES, type ColourGene } from '../../src/report/loci.ts';

/** The pair a dog with no tested variant at the locus has. */
const WILD_TYPE: Readonly<Record<ColourGene, string>> = {
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

function isAllele<G extends ColourGene>(gene: G, text: string): text is Allele<G> {
  const alleles: readonly string[] = ALLELES[gene];
  return alleles.includes(text);
}

function pair<G extends ColourGene>(gene: G, text: string): AllelePair<G> {
  const [first, second, ...rest] = text.split('/');
  if (first === undefined || second === undefined || rest.length > 0 || !isAllele(gene, first) || !isAllele(gene, second)) {
    throw new Error(`not a ${gene} pair: ${text}`);
  }
  return [first, second];
}

/**
 * A genotype from pair literals ({ MC1R: 'e/e' }). Loci not given are wild
 * type, except those listed as unknown, which are left out.
 */
export function genotype(
  spec: Readonly<Partial<Record<ColourGene, string>>>,
  unknown: readonly ColourGene[] = [],
): Genotype {
  let result: Genotype = {};
  const set = <G extends ColourGene>(gene: G): void => {
    result = withLocus(result, gene, pair(gene, spec[gene] ?? WILD_TYPE[gene]));
  };
  for (const gene of COLOUR_GENES) {
    if (!unknown.includes(gene)) {
      set(gene);
    }
  }
  return result;
}

/**
 * A parent's loci from pair literals, one or more candidates per locus
 * ({ TYRP1: ['B/b', 'b/b'] }). Loci not given are wild type; loci listed as
 * missing are unknown.
 */
export function parentLoci(
  spec: Readonly<Partial<Record<ColourGene, string | readonly string[]>>>,
  missing: readonly ColourGene[] = [],
): GenotypeResolution {
  const resolve = <G extends ColourGene>(gene: G): LocusResolution<G> => {
    if (missing.includes(gene)) {
      return { status: 'missing' };
    }
    const given: string | readonly string[] = spec[gene] ?? WILD_TYPE[gene];
    const texts: readonly string[] = typeof given === 'string' ? [given] : given;
    return { status: 'resolved', candidates: texts.map((text) => pair(gene, text)) };
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

/** Heterozygous at every locus, with four candidates at ASIP and MC1R: 16 per parent, 256 scenarios for a pair. */
export const HETEROZYGOUS = {
  ASIP: ['ay/at', 'ayt/aw', 'aw/at', 'at/a'],
  MC1R: ['Em/e', 'E/e', 'Em/eA', 'eH/e'],
  CBD103: 'KB/ky',
  HPS3: 'co/+',
  MFSD12: 'i/+',
  MLPH: 'D/d',
  TYRP1: 'B/b',
  PMEL: 'M/m',
  PSMB7: 'H/h',
  RALY: '+/dup',
  SLC45A2: 'cal/+',
  MITF: 'sp/+',
  USH2A: 'R/+',
};
