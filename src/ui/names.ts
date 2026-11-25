// Plain-language names for what the engine returns. Spanish Water Dog terms
// (brown, beige) where they differ from generic ones.

import type { AllelePair } from '../genetics/alleles.ts';
import type { BaseColour, Flag, Pattern, Trait, Unknown, WhiteSpotting } from '../genetics/phenotype.ts';
import type { UnknownLocus } from '../genetics/results.ts';
import type { ParentIndex } from '../health/health.ts';
import type { ColourGene } from '../report/loci.ts';

export const GENE_LABELS: Readonly<Record<ColourGene, string>> = {
  ASIP: 'agouti',
  CBD103: 'Dominant Black',
  MC1R: 'extension',
  HPS3: 'cocoa',
  MFSD12: 'red intensity',
  MLPH: 'dilute',
  TYRP1: 'chocolate',
  MITF: 'piebald',
  PMEL: 'merle',
  PSMB7: 'harlequin',
  RALY: 'saddle tan',
  USH2A: 'roan',
  SLC45A2: 'albino',
};

export const geneName = (gene: ColourGene): string => `${gene} (${GENE_LABELS[gene]})`;

export const parentLabel = (parent: ParentIndex): string => `Parent ${parent + 1}`;

export const copiesText = (copies: number): string => (copies === 1 ? '1 copy' : `${copies} copies`);

export const BASE_NAMES: Readonly<Record<BaseColour | Unknown, string>> = {
  black: 'Black',
  brown: 'Brown',
  cocoa: 'Cocoa',
  blue: 'Blue (dilute black)',
  lilac: 'Lilac (dilute brown)',
  beige: 'Beige',
  'beige-light': 'Beige, light cream likely',
  albino: 'White or cream, pink nose',
  unknown: 'Unknown',
};

/** A colour as one plain word or two, for qualifiers: "(blue puppies only)". */
export const BASE_WORDS: Readonly<Record<BaseColour, string>> = {
  black: 'black',
  brown: 'brown',
  cocoa: 'cocoa',
  blue: 'blue',
  lilac: 'lilac',
  beige: 'beige',
  'beige-light': 'light cream',
  albino: 'albino',
};

export const PATTERN_NAMES: Readonly<Record<Pattern | Unknown, { readonly name: string; readonly detail?: string }>> = {
  'one-colour': {
    name: 'One colour: no tan points, sable or brindle',
    detail: 'KB gene (Dominant Black), which acts the same on brown',
  },
  sable: { name: 'Sable' },
  'wolf-sable': { name: 'Wolf sable' },
  'tan-points': { name: 'Tan points' },
  'recessive-solid': { name: 'One colour', detail: 'Recessive black (a/a)' },
  'not-visible': { name: 'No pattern visible', detail: 'Beige (e/e) hides the pattern' },
  unknown: { name: 'Unknown' },
};

export const WHITE_NAMES: Readonly<Record<WhiteSpotting | Unknown, string>> = {
  extensive: 'Piebald to mostly white',
  limited: 'None to limited white',
  solid: 'Solid',
  unknown: 'Unknown',
};

export const TRAIT_NAMES: Readonly<Record<Trait, string>> = {
  merle: 'Merle',
  doubleMerle: 'Double merle',
  dilute: 'Dilute (blue or lilac)',
  beige: 'Beige',
  harlequin: 'Harlequin',
  roan: 'Roan',
};

/** Flags the names or table captions already carry; never shown as a row tag. */
const UNTAGGED: readonly Flag[] = ['brindle-possible', 'mostly-white'];

export const taggedFlags = (flags: readonly Flag[]): Flag[] => flags.filter((flag) => !UNTAGGED.includes(flag));

export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

export const formatPairs = (pairs: readonly AllelePair<ColourGene>[]): string =>
  pairs.map((pair) => `${pair[0]}/${pair[1]}`).join(' or ');

/** "TYRP1 (chocolate) missing from Parent 2's report", per parent and reason. */
export function unknownLociText(loci: readonly UnknownLocus[]): string {
  const groups = new Map<string, ColourGene[]>();
  for (const locus of loci) {
    const where = `${locus.reason === 'missing' ? 'missing from' : 'unreadable in'} ${parentLabel(locus.parent)}'s report`;
    groups.set(where, [...(groups.get(where) ?? []), locus.gene]);
  }
  return [...groups].map(([where, genes]) => `${genes.map(geneName).join(', ')} ${where}`).join('; ');
}
