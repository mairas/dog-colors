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

/** One effect per gene and pair, for "Reads as" on the card. */
export function pairEffect(gene: ColourGene, pair: readonly string[], patternHidden: boolean): string {
  const count = (allele: string): number => pair.filter((item) => item === allele).length;
  const hidden = patternHidden ? ', hidden' : '';
  switch (gene) {
    case 'ASIP': {
      const shown =
        count('ay') + count('ayt') > 0
          ? 'sable'
          : count('aw') > 0
            ? 'wolf sable'
            : count('at') > 0
              ? 'tan points'
              : 'recessive black';
      const carries = count('a') === 1 ? ', carries recessive black' : '';
      return `${shown}${carries}${hidden}`;
    }
    case 'CBD103':
      return count('KB') > 0 ? 'one colour (Dominant Black)' : 'no Dominant Black';
    case 'MC1R': {
      if (count('e') === 2) {
        return 'beige';
      }
      const parts = [
        count('Em') > 0 ? (patternHidden ? 'mask, hidden on solid coats' : 'mask') : null,
        count('eA') + count('eH') + count('eG') > 0 ? 'not modelled precisely' : null,
        count('e') === 1 ? 'carries beige' : null,
      ].filter((part) => part !== null);
      return parts.length > 0 ? parts.join(', ') : 'no effect';
    }
    case 'HPS3':
      return ['no effect', 'carries cocoa', 'cocoa'][count('co')] ?? '';
    case 'MFSD12':
      return count('i') === 2 ? 'light cream if beige, lighter tan' : 'no effect';
    case 'MLPH':
      return ['no effect', 'carries dilute', 'dilute'][count('d')] ?? '';
    case 'TYRP1':
      return ['black', 'black, carries brown', 'brown'][count('b')] ?? '';
    case 'MITF':
      return ['solid', 'limited white', 'piebald'][count('sp')] ?? '';
    case 'PMEL':
      return ['no merle', 'merle', 'double merle'][count('M')] ?? '';
    case 'PSMB7':
      return count('H') > 0 ? 'harlequin (acts on merle)' : 'no harlequin';
    case 'RALY':
      return count('+') > 0 ? 'saddle tan marker' : 'no saddle tan marker';
    case 'USH2A':
      return count('R') > 0 ? 'roan (within white areas)' : 'no roan';
    case 'SLC45A2':
      return ['no effect', 'carries albino', 'albino'][count('cal')] ?? '';
  }
}
