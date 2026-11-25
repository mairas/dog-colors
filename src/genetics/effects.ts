// What one locus's pair does, for "Reads as" on a parent's card: "tan points,
// hidden by Dominant Black, carries recessive black", "mask", "black, carries
// brown". The pair is read by the phenotype rules on a background where its
// effect can show (wild type elsewhere, with merle for harlequin, tan points
// for the saddle marker, and white for roan). The dog's own genotypes then say
// whether its coat hides that effect, by the hidden table's rules; the carried
// alleles are the hidden table's carriers.

import type { ColourGene } from '../report/loci.ts';
import { withLocus, type AllelePair, type Genotype } from './alleles.ts';
import { CARRIERS, HIDDEN_EFFECTS, HIDER_LABELS, NEUTRAL, PIGMENT_HIDDEN, WHITE_HIDDEN, type HiddenId, type HiddenItem } from './hidden.ts';
import {
  FLAG_INFO,
  phenotype,
  pigmentPhenotype,
  whitePhenotype,
  type Pattern,
  type Phenotype,
  type Unknown,
  type WhiteSpotting,
} from './phenotype.ts';

interface Reading {
  /** Where the effect shows; wild type when absent. */
  readonly background?: Genotype;
  /** What the coat shows, or null when it shows nothing of this locus. */
  readonly shows: (coat: Phenotype) => string | null;
  /** The text when the pair neither shows nor carries anything. */
  readonly none: string;
}

const PATTERN_WORDS: Readonly<Record<Pattern | Unknown, string>> = {
  'one-colour': 'one colour',
  sable: 'sable',
  'wolf-sable': 'wolf sable',
  'tan-points': 'tan points',
  'recessive-solid': 'recessive black',
  'not-visible': 'not visible',
  unknown: 'unknown',
};

const WHITE_WORDS: Readonly<Record<WhiteSpotting | Unknown, string>> = {
  solid: 'solid',
  limited: 'limited white',
  extensive: 'piebald',
  unknown: 'unknown',
};

const NO_EFFECT = 'no effect';

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const READINGS: Readonly<Record<ColourGene, Reading>> = {
  ASIP: { shows: (coat) => PATTERN_WORDS[coat.pattern], none: NO_EFFECT },
  CBD103: {
    shows: (coat) => (coat.pattern === 'one-colour' ? 'one colour (Dominant Black)' : null),
    none: 'no Dominant Black',
  },
  MC1R: {
    shows: (coat) => {
      if (coat.traits.beige === 'yes') {
        return 'beige';
      }
      const parts = new Set([
        ...(coat.flags.includes('mask') ? [FLAG_INFO.mask.label] : []),
        ...coat.flags.filter((flag) => flag === 'not-modelled-eA' || flag === 'not-modelled-eH-eG').map((flag) => FLAG_INFO[flag].label),
      ]);
      return parts.size > 0 ? [...parts].join(', ') : null;
    },
    none: NO_EFFECT,
  },
  HPS3: { shows: (coat) => (coat.base === 'cocoa' ? 'cocoa' : null), none: NO_EFFECT },
  MFSD12: { shows: (coat) => (coat.flags.includes('pheomelanin-light') ? 'light cream if beige, lighter tan' : null), none: NO_EFFECT },
  MLPH: { shows: (coat) => (coat.traits.dilute === 'yes' ? 'dilute' : null), none: NO_EFFECT },
  TYRP1: { shows: (coat) => (coat.base === 'brown' ? 'brown' : 'black'), none: NO_EFFECT },
  MITF: { shows: (coat) => WHITE_WORDS[coat.white], none: NO_EFFECT },
  PMEL: {
    shows: (coat) => (coat.traits.doubleMerle === 'yes' ? 'double merle' : coat.traits.merle === 'yes' ? 'merle' : null),
    none: 'no merle',
  },
  PSMB7: {
    background: withLocus(NEUTRAL, 'PMEL', ['M', 'm']),
    shows: (coat) => (coat.traits.harlequin === 'yes' ? 'harlequin (acts on merle)' : null),
    none: 'no harlequin',
  },
  RALY: {
    background: withLocus(NEUTRAL, 'ASIP', ['at', 'at']),
    shows: (coat) => (coat.flags.includes('possible-saddle') ? 'saddle tan marker' : null),
    none: 'no saddle tan marker',
  },
  USH2A: {
    background: withLocus(NEUTRAL, 'MITF', ['sp', '+']),
    shows: (coat) => (coat.traits.roan === 'yes' ? 'roan (within white areas)' : null),
    none: 'no roan',
  },
  SLC45A2: { shows: (coat) => (coat.base === 'albino' ? 'albino' : null), none: NO_EFFECT },
};

/** The hidden table's items for effects a coat can hide; the carriers are listed apart. */
const EFFECTS_HIDDEN = PIGMENT_HIDDEN.filter((item) => !CARRIERS.includes(item));

/** How an item that no single hider causes is marked; the rest read "hidden". */
const UNSEEN_NOTES: Readonly<Partial<Record<HiddenId, string>>> = {
  'mask-hidden': 'hidden on solid coats',
  'roan-hidden': 'hidden without white spotting',
  'dominant-black-unexpressed': 'not expressed with eA or eH',
};

/** The item that hides this pair's effect on every one of the coats, if any. */
function hiddenOn<P>(items: readonly HiddenItem<P>[], gene: ColourGene, pair: readonly string[], coats: readonly P[]): HiddenItem<P> | undefined {
  return coats.length === 0
    ? undefined
    : items.find((item) => item.gene === gene && item.carries(pair) && coats.every((coat) => item.hidden(coat)));
}

/** "hidden by beige", "not expressed with eA", or null when the dog's coat shows the effect. */
function unseenNote(gene: ColourGene, pair: readonly string[], genotypes: readonly Genotype[]): string | null {
  const item =
    hiddenOn(EFFECTS_HIDDEN, gene, pair, genotypes.map(pigmentPhenotype)) ?? hiddenOn(WHITE_HIDDEN, gene, pair, genotypes.map(whitePhenotype));
  if (item === undefined) {
    return null;
  }
  return item.hider === null ? (UNSEEN_NOTES[item.id] ?? 'hidden') : HIDER_LABELS[item.hider];
}

/**
 * One locus's effect, as the card's "Reads as" shows it. `genotypes` are the
 * dog's candidate genotypes: an effect is marked hidden when the hidden
 * table's rules hide it on every one of them.
 */
export function pairEffect<G extends ColourGene>(gene: G, pair: AllelePair<G>, genotypes: readonly Genotype[]): string {
  const reading = READINGS[gene];
  const carried = CARRIERS.filter((item) => item.gene === gene && item.carries(pair)).map((item) => lowerFirst(HIDDEN_EFFECTS[item.id]));
  const shown = reading.shows(phenotype(withLocus(reading.background ?? NEUTRAL, gene, pair)));
  const effect = shown === null ? (carried.length > 0 ? [] : [reading.none]) : [shown, unseenNote(gene, pair, genotypes)];
  return [...effect, ...carried].filter((part) => part !== null).join(', ');
}
