// Alleles a puppy carries or has whose effect does not show on its coat:
// recessive alleles carried once, and alleles that epistasis hides (tan
// points under Dominant Black, merle on a beige coat). Each item is an event
// on one locus's pair plus a condition on the puppy's coat, so the cross can
// count it alongside the coat outcomes.

import { COLOUR_GENES, type ColourGene } from '../report/loci.ts';
import { ALLELES, GENE_RULES, withLocus, type Allele, type Genotype } from './alleles.ts';
import { pigmentPhenotype, type Pattern, type PigmentPhenotype, type Unknown, type WhitePhenotype } from './phenotype.ts';

/** What hides an effect that the puppy's genotype would otherwise show. */
export const HIDERS = ['dominant-black', 'beige', 'albino'] as const;
export type Hider = (typeof HIDERS)[number];

export const HIDDEN_IDS = [
  'carries-beige',
  'carries-brown',
  'carries-cocoa',
  'carries-dilute',
  'carries-albino',
  'carries-recessive-black',
  'sable-hidden',
  'wolf-sable-hidden',
  'tan-points-hidden',
  'recessive-black-hidden',
  'dominant-black-hidden',
  'mask-hidden',
  'light-cream-hidden',
  'merle-hidden',
  'harlequin-hidden',
  'roan-hidden',
] as const;
export type HiddenId = (typeof HIDDEN_IDS)[number];

export interface HiddenItem<P> {
  readonly id: HiddenId;
  readonly hider: Hider | null;
  readonly gene: ColourGene;
  /** Whether a puppy with this pair at `gene` has the allele or genotype. */
  readonly carries: (pair: readonly string[]) => boolean;
  /** Whether the effect is hidden on this coat. */
  readonly hidden: (coat: P) => boolean;
}

/** "Carries brown", or the hidden effect without its hider ("Tan points"). */
export const HIDDEN_EFFECTS: Readonly<Record<HiddenId, string>> = {
  'carries-beige': 'Carries beige',
  'carries-brown': 'Carries brown',
  'carries-cocoa': 'Carries cocoa',
  'carries-dilute': 'Carries dilute',
  'carries-albino': 'Carries albino',
  'carries-recessive-black': 'Carries recessive black',
  'sable-hidden': 'Sable',
  'wolf-sable-hidden': 'Wolf sable',
  'tan-points-hidden': 'Tan points',
  'recessive-black-hidden': 'Recessive black (a/a)',
  'dominant-black-hidden': 'Dominant Black (KB)',
  'mask-hidden': 'Mask, hidden on solid coats',
  'light-cream-hidden': 'Light cream if ever beige',
  'merle-hidden': 'Merle',
  'harlequin-hidden': 'Harlequin',
  'roan-hidden': 'Roan, hidden without white spotting',
};

export const HIDER_LABELS: Readonly<Record<Hider, string>> = {
  'dominant-black': 'hidden by Dominant Black',
  beige: 'hidden by beige',
  albino: 'hidden by albino',
};

const copies = (pair: readonly string[], allele: string): number => pair.filter((item) => item === allele).length;

export function hiderOf(coat: PigmentPhenotype): Hider | null {
  if (coat.base === 'albino') {
    return 'albino';
  }
  if (coat.pattern === 'not-visible') {
    return 'beige';
  }
  return coat.pattern === 'one-colour' ? 'dominant-black' : null;
}

/** A genotype in which the A locus shows: wild type everywhere, as a report with no variants reads. */
const NEUTRAL: Genotype = (() => {
  let result: Genotype = {};
  const wild = <G extends ColourGene>(gene: G): void => {
    const allele = GENE_RULES[gene].decode(new Set());
    result = withLocus(result, gene, [allele, allele]);
  };
  for (const gene of COLOUR_GENES) {
    wild(gene);
  }
  return result;
})();

const ownPatterns = new Map<string, Pattern | Unknown>();

const isAsip = (allele: string | undefined): allele is Allele<'ASIP'> =>
  allele !== undefined && (ALLELES.ASIP as readonly string[]).includes(allele);

/** The pattern an ASIP pair shows when nothing hides it. */
function asipPattern(pair: readonly string[]): Pattern | Unknown {
  const key = pair.join('/');
  let pattern = ownPatterns.get(key);
  if (pattern === undefined) {
    const [first, second] = pair;
    if (!isAsip(first) || !isAsip(second)) {
      throw new Error(`not an ASIP pair: ${key}`);
    }
    pattern = pigmentPhenotype(withLocus(NEUTRAL, 'ASIP', [first, second])).pattern;
    ownPatterns.set(key, pattern);
  }
  return pattern;
}

function carrier(id: HiddenId, gene: ColourGene, allele: string): HiddenItem<PigmentPhenotype> {
  return { id, hider: null, gene, carries: (pair) => copies(pair, allele) === 1, hidden: () => true };
}

function byHider(
  id: HiddenId,
  gene: ColourGene,
  carries: (pair: readonly string[]) => boolean,
  hiders: readonly Hider[],
  shows: (coat: PigmentPhenotype) => boolean = () => false,
): HiddenItem<PigmentPhenotype>[] {
  return hiders.map((hider) => ({ id, hider, gene, carries, hidden: (coat) => !shows(coat) && hiderOf(coat) === hider }));
}

const asipShows = (pattern: Pattern) => (pair: readonly string[]) => asipPattern(pair) === pattern;

export const PIGMENT_HIDDEN: readonly HiddenItem<PigmentPhenotype>[] = [
  carrier('carries-beige', 'MC1R', 'e'),
  carrier('carries-brown', 'TYRP1', 'b'),
  carrier('carries-cocoa', 'HPS3', 'co'),
  carrier('carries-dilute', 'MLPH', 'd'),
  carrier('carries-albino', 'SLC45A2', 'cal'),
  carrier('carries-recessive-black', 'ASIP', 'a'),
  ...byHider('sable-hidden', 'ASIP', asipShows('sable'), HIDERS),
  ...byHider('wolf-sable-hidden', 'ASIP', asipShows('wolf-sable'), HIDERS),
  ...byHider('tan-points-hidden', 'ASIP', asipShows('tan-points'), HIDERS),
  ...byHider('recessive-black-hidden', 'ASIP', asipShows('recessive-solid'), HIDERS),
  ...byHider('dominant-black-hidden', 'CBD103', (pair) => copies(pair, 'KB') > 0, ['beige', 'albino']),
  {
    id: 'mask-hidden',
    hider: null,
    gene: 'MC1R',
    carries: (pair) => copies(pair, 'Em') > 0,
    hidden: (coat) => coat.pattern !== 'unknown' && !coat.flags.includes('mask'),
  },
  {
    id: 'light-cream-hidden',
    hider: null,
    gene: 'MFSD12',
    carries: (pair) => copies(pair, 'i') === 2,
    hidden: (coat) =>
      coat.base !== 'unknown' &&
      coat.pattern !== 'unknown' &&
      coat.base !== 'beige-light' &&
      !coat.flags.includes('pheomelanin-light'),
  },
  ...byHider('merle-hidden', 'PMEL', (pair) => copies(pair, 'M') === 1, ['beige', 'albino'], (coat) => !coat.flags.includes('merle-hidden')),
  ...byHider(
    'harlequin-hidden',
    'PSMB7',
    (pair) => copies(pair, 'H') === 1,
    ['beige', 'albino'],
    (coat) => !coat.flags.includes('harlequin-hidden'),
  ),
];

export const WHITE_HIDDEN: readonly HiddenItem<WhitePhenotype>[] = [
  { id: 'roan-hidden', hider: null, gene: 'USH2A', carries: (pair) => copies(pair, 'R') > 0, hidden: (coat) => coat.white === 'solid' },
];
