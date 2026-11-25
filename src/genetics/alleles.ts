// Alleles per colour gene and the rule that decodes one chromosome's tested
// variants into one allele. Each array's order is the display order of a pair
// ("B/b", "sp/+"), not a dominance order; the phenotype rules never rely on it.

import { COLOUR_VARIANTS, type ColourGene } from '../report/loci.ts';

export const ALLELES = {
  // ayt: ay and at in cis (Dreger 2019), its phenotype unknown.
  ASIP: ['ay', 'ayt', 'aw', 'at', 'a'],
  CBD103: ['KB', 'ky'],
  MC1R: ['Em', 'E', 'eA', 'eH', 'eG', 'e'],
  HPS3: ['co', '+'],
  MFSD12: ['i', '+'],
  MLPH: ['D', 'd'],
  TYRP1: ['B', 'b'],
  MITF: ['sp', '+'],
  PMEL: ['M', 'm'],
  PSMB7: ['H', 'h'],
  // "+" is the non-duplicated allele, the one the report is assumed to count (Dreger 2013 notation).
  RALY: ['+', 'dup'],
  USH2A: ['R', '+'],
  SLC45A2: ['cal', '+'],
} as const satisfies Record<ColourGene, readonly string[]>;

export type Allele<G extends ColourGene> = (typeof ALLELES)[G][number];

export type AllelePair<G extends ColourGene> = readonly [Allele<G>, Allele<G>];

/** One allele pair per locus; an absent locus is unknown. */
export type Genotype = { readonly [G in ColourGene]?: AllelePair<G> };

/** The variant codes on one chromosome. */
export type Chromosome = ReadonlySet<string>;

interface GeneRule<G extends ColourGene> {
  /** Whether a source documents these variants together on one chromosome. */
  readonly documented: (chromosome: Chromosome) => boolean;
  /** Loss-of-function wins: any variant that removes the wild-type function decides the allele. */
  readonly decode: (chromosome: Chromosome) => Allele<G>;
}

const atMostOne = (chromosome: Chromosome): boolean => chromosome.size <= 1;

function singleVariant<G extends ColourGene>(variant: Allele<G>, wild: Allele<G>): GeneRule<G> {
  return { documented: atMostOne, decode: (chromosome) => (chromosome.size > 0 ? variant : wild) };
}

export const GENE_RULES: { readonly [G in ColourGene]: GeneRule<G> } = {
  ASIP: {
    // ay+at is the ayt haplotype (Dreger 2019). The tan-points marker sits on
    // every a chromosome too (Dreger & Schmutz 2011), so a never appears without at.
    documented: (chromosome) => {
      const codes = [...chromosome].sort().join('+');
      return ['', 'ay', 'at', 'at+ay', 'a+at'].includes(codes);
    },
    decode: (chromosome) => {
      if (chromosome.has('a')) {
        return 'a';
      }
      if (chromosome.has('ay')) {
        return chromosome.has('at') ? 'ayt' : 'ay';
      }
      return chromosome.has('at') ? 'at' : 'aw';
    },
  },
  CBD103: singleVariant('KB', 'ky'),
  MC1R: {
    documented: atMostOne,
    decode: (chromosome) => {
      if (['e1', 'e2', 'e3'].some((code) => chromosome.has(code))) {
        return 'e';
      }
      if (chromosome.has('Em')) {
        return 'Em';
      }
      if (chromosome.has('eA')) {
        return 'eA';
      }
      if (chromosome.has('eH')) {
        return 'eH';
      }
      return chromosome.has('eG') ? 'eG' : 'E';
    },
  },
  HPS3: singleVariant('co', '+'),
  MFSD12: singleVariant('i', '+'),
  MLPH: singleVariant('d', 'D'),
  TYRP1: {
    // MyDogDNA: bd "can be co-inherited (on the same half of the chromosome)" with another b allele.
    documented: (chromosome) => chromosome.size <= 1 || (chromosome.size === 2 && chromosome.has('bd')),
    decode: (chromosome) => (chromosome.size > 0 ? 'b' : 'B'),
  },
  MITF: singleVariant('sp', '+'),
  PMEL: singleVariant('M', 'm'),
  PSMB7: singleVariant('H', 'h'),
  RALY: singleVariant('+', 'dup'),
  USH2A: singleVariant('R', '+'),
  SLC45A2: singleVariant('cal', '+'),
};

/** The report's variant codes per gene, from the catalogue. */
export function variantCodes(gene: ColourGene): string[] {
  return COLOUR_VARIANTS.filter((variant) => variant.gene === gene).map((variant) => variant.code);
}

function alleleIndex<G extends ColourGene>(gene: G, allele: Allele<G>): number {
  const alleles: readonly string[] = ALLELES[gene];
  return alleles.indexOf(allele);
}

/** The pair in display order, so equal pairs compare equal. */
export function orderedPair<G extends ColourGene>(gene: G, first: Allele<G>, second: Allele<G>): AllelePair<G> {
  return alleleIndex(gene, first) <= alleleIndex(gene, second) ? [first, second] : [second, first];
}

export function comparePairs<G extends ColourGene>(gene: G, left: AllelePair<G>, right: AllelePair<G>): number {
  return (
    alleleIndex(gene, left[0]) - alleleIndex(gene, right[0]) || alleleIndex(gene, left[1]) - alleleIndex(gene, right[1])
  );
}

export function formatPair(pair: readonly [string, string]): string {
  return `${pair[0]}/${pair[1]}`;
}

/** Every unordered pair of the gene's alleles, in display order. */
export function allPairs<G extends ColourGene>(gene: G): AllelePair<G>[] {
  const alleles: readonly Allele<G>[] = ALLELES[gene];
  return alleles.flatMap((first, index) => alleles.slice(index).map((second): AllelePair<G> => [first, second]));
}

/** How many copies of the allele the pair holds. */
export function copies(pair: readonly string[], allele: string): number {
  return pair.filter((item) => item === allele).length;
}

/** The genotype with one locus set. */
export function withLocus<G extends ColourGene>(genotype: Genotype, gene: G, pair: AllelePair<G>): Genotype {
  const result: { -readonly [K in ColourGene]?: AllelePair<K> } = { ...genotype };
  const locus: { -readonly [K in G]?: AllelePair<K> } = result;
  locus[gene] = pair;
  return result;
}
