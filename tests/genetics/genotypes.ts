import { ALLELES, type Allele, type AllelePair, type Genotype } from '../../src/genetics/alleles.ts';
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
  const result: { -readonly [G in ColourGene]?: AllelePair<G> } = {};
  const set = <G extends ColourGene>(gene: G): void => {
    const value: { -readonly [K in G]?: AllelePair<K> } = result;
    value[gene] = pair(gene, spec[gene] ?? WILD_TYPE[gene]);
  };
  for (const gene of COLOUR_GENES) {
    if (!unknown.includes(gene)) {
      set(gene);
    }
  }
  return result;
}
