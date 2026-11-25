// What one locus's pair does on its own, for "Reads as" on a parent's card:
// "tan points, carries recessive black", "mask", "black, carries brown". The
// pair is read by the phenotype rules on a background where its effect can
// show (wild type elsewhere, with merle for harlequin, tan points for the
// saddle marker, and white for roan); the carried alleles are the hidden
// table's carriers.

import type { ColourGene } from '../report/loci.ts';
import { withLocus, type AllelePair, type Genotype } from './alleles.ts';
import { CARRIERS, HIDDEN_EFFECTS, NEUTRAL } from './hidden.ts';
import { FLAG_INFO, phenotype, type Pattern, type Phenotype, type Unknown, type WhiteSpotting } from './phenotype.ts';

interface Reading {
  /** Where the effect shows; wild type when absent. */
  readonly background?: Genotype;
  /** What the coat shows, or null when it shows nothing of this locus. */
  readonly shows: (coat: Phenotype, patternHidden: boolean) => string | null;
  /** The text when the pair neither shows nor carries anything. */
  readonly none: string;
  /** Whether "hidden" ends the text when the dog's own coat hides its pattern. */
  readonly hiddenByPattern?: boolean;
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
  ASIP: { shows: (coat) => PATTERN_WORDS[coat.pattern], none: NO_EFFECT, hiddenByPattern: true },
  CBD103: { shows: (coat) => (coat.pattern === 'one-colour' ? 'one colour (Dominant Black)' : null), none: 'no Dominant Black' },
  MC1R: {
    shows: (coat, patternHidden) => {
      if (coat.traits.beige === 'yes') {
        return 'beige';
      }
      const parts = new Set([
        ...(coat.flags.includes('mask') ? [patternHidden ? lowerFirst(HIDDEN_EFFECTS['mask-hidden']) : FLAG_INFO.mask.label] : []),
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

/**
 * One locus's effect, as the card's "Reads as" shows it. `patternHidden` says
 * that the dog's own coat hides its pattern (Dominant Black or beige), so the
 * A locus and the mask are marked hidden.
 */
export function pairEffect<G extends ColourGene>(gene: G, pair: AllelePair<G>, patternHidden: boolean): string {
  const reading = READINGS[gene];
  const coat = phenotype(withLocus(reading.background ?? NEUTRAL, gene, pair));
  const carried = CARRIERS.filter((item) => item.gene === gene && item.carries(pair)).map((item) => lowerFirst(HIDDEN_EFFECTS[item.id]));
  const shown = reading.shows(coat, patternHidden) ?? (carried.length > 0 ? null : reading.none);
  const hidden = reading.hiddenByPattern === true && patternHidden ? ['hidden'] : [];
  return [shown, ...carried, ...hidden].filter((part) => part !== null).join(', ');
}
