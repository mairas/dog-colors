// Genotype → coat phenotype, following the plan's epistasis order: albino →
// eumelanin colour → MC1R → K → A → mask → intensity → merle and harlequin →
// piebald → roan. The pigment loci and the white loci (MITF, USH2A) are
// separate functions so the cross can enumerate the two groups independently.
//
// A locus absent from the genotype is unknown. Each phenotype field is computed
// over every pair the unknown locus could hold, and a field that differs
// between them is "unknown"; loci the rules never consult for this genotype
// (MFSD12 under KB, say) leave the result untouched.

import type { ColourGene } from '../report/loci.ts';
import { allPairs, type Allele, type AllelePair, type Genotype } from './alleles.ts';

export const BASE_COLOURS = ['black', 'brown', 'cocoa', 'blue', 'lilac', 'beige', 'beige-light', 'albino'] as const;
export type BaseColour = (typeof BASE_COLOURS)[number];

export const PATTERNS = ['one-colour', 'sable', 'wolf-sable', 'tan-points', 'recessive-solid', 'not-visible'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const NOSES = ['black', 'brown', 'blue', 'lilac', 'pink'] as const;
export type Nose = (typeof NOSES)[number];

export const WHITE_SPOTTING = ['solid', 'limited', 'extensive'] as const;
export type WhiteSpotting = (typeof WHITE_SPOTTING)[number];

export const TRAITS = ['merle', 'doubleMerle', 'dilute', 'beige', 'harlequin', 'roan'] as const;
export type Trait = (typeof TRAITS)[number];

/** The canonical flag order; every phenotype lists its flags in this order. */
export const FLAGS = [
  'not-modelled-eA',
  'not-modelled-eH-eG',
  'ayt-unknown',
  'possible-saddle',
  'mask',
  'pheomelanin-light',
  'brindle-possible',
  'merle-hidden',
  'merle-hard-to-see',
  'harlequin-hidden',
  'mostly-white',
  'roan-single-copy',
] as const;
export type Flag = (typeof FLAGS)[number];

export type Unknown = 'unknown';
export type TraitValue = 'yes' | 'no' | Unknown;

export interface PigmentPhenotype {
  readonly base: BaseColour | Unknown;
  readonly pattern: Pattern | Unknown;
  readonly nose: Nose | Unknown;
  /** Visible merle: one copy of M on a coat that shows eumelanin. */
  readonly merle: TraitValue;
  /** M/M, whether or not the coat shows it: its white and its health risks do not depend on that. */
  readonly doubleMerle: TraitValue;
  readonly dilute: TraitValue;
  readonly beige: TraitValue;
  /** Visible harlequin: H/h or H/H with merle, on a coat that shows eumelanin. */
  readonly harlequin: TraitValue;
  /** H/H dies before birth; the cross removes these outcomes. */
  readonly lethal: TraitValue;
  readonly flags: readonly Flag[];
}

export interface WhitePhenotype {
  readonly white: WhiteSpotting | Unknown;
  readonly roan: TraitValue;
  readonly flags: readonly Flag[];
}

export interface Phenotype {
  readonly base: BaseColour | Unknown;
  readonly pattern: Pattern | Unknown;
  readonly nose: Nose | Unknown;
  readonly white: WhiteSpotting | Unknown;
  readonly traits: Readonly<Record<Trait, TraitValue>>;
  readonly lethal: TraitValue;
  readonly flags: readonly Flag[];
}

type Reader = <G extends ColourGene>(gene: G) => AllelePair<G>;

const has = <G extends ColourGene>(pair: AllelePair<G>, allele: Allele<G>): boolean =>
  pair[0] === allele || pair[1] === allele;

const copies = <G extends ColourGene>(pair: AllelePair<G>, allele: Allele<G>): number =>
  (pair[0] === allele ? 1 : 0) + (pair[1] === allele ? 1 : 0);

const yesNo = (value: boolean): TraitValue => (value ? 'yes' : 'no');

function sortedFlags(flags: Iterable<Flag>): Flag[] {
  const present = new Set(flags);
  return FLAGS.filter((flag) => present.has(flag));
}

function pigmentRule(read: Reader): PigmentPhenotype {
  const flags = new Set<Flag>();
  const merleCopies = copies(read('PMEL'), 'M');
  const psmb7 = read('PSMB7');
  const lethal = yesNo(copies(psmb7, 'H') === 2);

  const merleTraits = (visible: boolean, hardToSee: boolean) => {
    if (merleCopies > 0 && !visible) {
      flags.add('merle-hidden');
    }
    if (merleCopies > 0 && visible && hardToSee) {
      flags.add('merle-hard-to-see');
    }
    if (merleCopies === 2) {
      flags.add('mostly-white');
    }
    const harlequinGenotype = merleCopies > 0 && has(psmb7, 'H');
    if (harlequinGenotype && !visible) {
      flags.add('harlequin-hidden');
    }
    return {
      merle: yesNo(merleCopies === 1 && visible),
      doubleMerle: yesNo(merleCopies === 2),
      harlequin: yesNo(harlequinGenotype && visible),
    };
  };

  if (copies(read('SLC45A2'), 'cal') === 2) {
    return {
      base: 'albino',
      pattern: 'not-visible',
      nose: 'pink',
      dilute: 'no',
      beige: 'no',
      ...merleTraits(false, false),
      lethal,
      flags: sortedFlags(flags),
    };
  }

  const mc1r = read('MC1R');
  const brownish = copies(read('TYRP1'), 'b') === 2 || copies(read('HPS3'), 'co') === 2;
  const cocoaOnly = copies(read('TYRP1'), 'b') < 2 && copies(read('HPS3'), 'co') === 2;
  const dilute = copies(read('MLPH'), 'd') === 2;
  const nose: Nose = dilute ? (brownish ? 'lilac' : 'blue') : brownish ? 'brown' : 'black';
  // co/co with b/b is named plain brown: no source gives the combined shade.
  const eumelanin: BaseColour = dilute ? (brownish ? 'lilac' : 'blue') : cocoaOnly ? 'cocoa' : brownish ? 'brown' : 'black';

  if (copies(mc1r, 'e') === 2) {
    return {
      base: copies(read('MFSD12'), 'i') === 2 ? 'beige-light' : 'beige',
      pattern: 'not-visible',
      nose,
      dilute: yesNo(dilute),
      beige: 'yes',
      ...merleTraits(false, false),
      lethal,
      flags: sortedFlags(flags),
    };
  }

  if (has(mc1r, 'eH') || has(mc1r, 'eG')) {
    flags.add('not-modelled-eH-eG');
  }
  // Anderson 2020: KB was not expressed in eA/eA and eA/e dogs; Em/eA and E/eA were unaffected.
  const kSkipped = has(mc1r, 'eA') && copies(mc1r, 'eA') + copies(mc1r, 'e') === 2;
  if (kSkipped) {
    flags.add('not-modelled-eA');
  }

  let pattern: Pattern;
  if (!kSkipped && has(read('CBD103'), 'KB')) {
    pattern = 'one-colour';
    // The KB test also marks the brindle haplotypes, so any KB result may be brindle.
    flags.add('brindle-possible');
  } else {
    const asip = read('ASIP');
    if (has(asip, 'ayt')) {
      flags.add('ayt-unknown');
    }
    if (has(asip, 'ay') || has(asip, 'ayt')) {
      pattern = 'sable';
    } else if (has(asip, 'aw')) {
      pattern = 'wolf-sable';
    } else if (has(asip, 'at')) {
      pattern = 'tan-points';
      if (has(read('RALY'), '+')) {
        flags.add('possible-saddle');
      }
    } else {
      pattern = 'recessive-solid';
    }
  }

  const pheomelaninShows = pattern === 'sable' || pattern === 'wolf-sable' || pattern === 'tan-points';
  if (pheomelaninShows && has(mc1r, 'Em')) {
    flags.add('mask');
  }
  if (pheomelaninShows && copies(read('MFSD12'), 'i') === 2) {
    flags.add('pheomelanin-light');
  }

  return {
    base: eumelanin,
    pattern,
    nose,
    dilute: yesNo(dilute),
    beige: 'no',
    ...merleTraits(true, pattern === 'sable'),
    lethal,
    flags: sortedFlags(flags),
  };
}

function whiteRule(read: Reader): WhitePhenotype {
  const spotting = copies(read('MITF'), 'sp');
  const white = WHITE_SPOTTING[spotting] ?? 'extensive';
  if (spotting === 0) {
    // Roan shows only within white areas.
    return { white, roan: 'no', flags: [] };
  }
  const roanCopies = copies(read('USH2A'), 'R');
  // Brancalion 2021 never observed one copy, and Wisdom's roan test is a linkage test.
  return { white, roan: yesNo(roanCopies > 0), flags: roanCopies === 1 ? ['roan-single-copy'] : [] };
}

const same = <T extends string>(left: T, right: T): T | Unknown => (left === right ? left : 'unknown');

function intersect(left: readonly Flag[], right: readonly Flag[]): Flag[] {
  return left.filter((flag) => right.includes(flag));
}

function joinPigment(left: PigmentPhenotype, right: PigmentPhenotype): PigmentPhenotype {
  return {
    base: same(left.base, right.base),
    pattern: same(left.pattern, right.pattern),
    nose: same(left.nose, right.nose),
    merle: same(left.merle, right.merle),
    doubleMerle: same(left.doubleMerle, right.doubleMerle),
    dilute: same(left.dilute, right.dilute),
    beige: same(left.beige, right.beige),
    harlequin: same(left.harlequin, right.harlequin),
    lethal: same(left.lethal, right.lethal),
    flags: intersect(left.flags, right.flags),
  };
}

function joinWhite(left: WhitePhenotype, right: WhitePhenotype): WhitePhenotype {
  return { white: same(left.white, right.white), roan: same(left.roan, right.roan), flags: intersect(left.flags, right.flags) };
}

interface Choice {
  readonly gene: ColourGene;
  index: number;
  readonly count: number;
}

/**
 * Runs the rule once per combination of pairs at the unknown loci it reads,
 * branching on a locus only when the rule first reads it, and joins the
 * results. Stops early once nothing more can become unknown, and gives up
 * with everything unknown past MAX_RUNS: only a genotype missing most of its
 * loci gets there, and every field of such a dog is unknown in practice.
 */
function explore<T>(genotype: Genotype, rule: (read: Reader) => T, join: (left: T, right: T) => T, unknown: T): T {
  const choices: Choice[] = [];
  const settled = (value: T): boolean => JSON.stringify(value) === JSON.stringify(unknown);
  let result: T | undefined;
  for (let run = 0; run < MAX_RUNS; run++) {
    let depth = 0;
    const chosen = new Map<ColourGene, number>();
    const read: Reader = <G extends ColourGene>(gene: G): AllelePair<G> => {
      const known = genotype[gene];
      if (known !== undefined) {
        return known;
      }
      let index = chosen.get(gene);
      if (index === undefined) {
        if (depth === choices.length) {
          choices.push({ gene, index: 0, count: allPairs(gene).length });
        }
        index = choices[depth]?.index ?? 0;
        depth++;
        chosen.set(gene, index);
      }
      const pair = allPairs(gene)[index];
      if (pair === undefined) {
        throw new Error(`no pair ${index} for ${gene}`);
      }
      return pair;
    };

    const value = rule(read);
    result = result === undefined ? value : join(result, value);
    choices.length = depth;
    let last = choices.at(-1);
    while (last !== undefined && ++last.index >= last.count) {
      choices.pop();
      last = choices.at(-1);
    }
    if (last === undefined || settled(result)) {
      return result;
    }
  }
  return unknown;
}

const MAX_RUNS = 4096;

const PIGMENT_UNKNOWN: PigmentPhenotype = {
  base: 'unknown',
  pattern: 'unknown',
  nose: 'unknown',
  merle: 'unknown',
  doubleMerle: 'unknown',
  dilute: 'unknown',
  beige: 'unknown',
  harlequin: 'unknown',
  lethal: 'unknown',
  flags: [],
};

const WHITE_UNKNOWN: WhitePhenotype = { white: 'unknown', roan: 'unknown', flags: [] };

export function pigmentPhenotype(genotype: Genotype): PigmentPhenotype {
  return explore(genotype, pigmentRule, joinPigment, PIGMENT_UNKNOWN);
}

export function whitePhenotype(genotype: Genotype): WhitePhenotype {
  return explore(genotype, whiteRule, joinWhite, WHITE_UNKNOWN);
}

export function combine(pigment: PigmentPhenotype, white: WhitePhenotype): Phenotype {
  return {
    base: pigment.base,
    pattern: pigment.pattern,
    nose: pigment.nose,
    white: white.white,
    traits: {
      merle: pigment.merle,
      doubleMerle: pigment.doubleMerle,
      dilute: pigment.dilute,
      beige: pigment.beige,
      harlequin: pigment.harlequin,
      roan: white.roan,
    },
    lethal: pigment.lethal,
    flags: sortedFlags([...pigment.flags, ...white.flags]),
  };
}

export function phenotype(genotype: Genotype): Phenotype {
  return combine(pigmentPhenotype(genotype), whitePhenotype(genotype));
}

/** A stable string that is equal exactly when two phenotypes are. */
export function phenotypeKey(value: Phenotype): string {
  return JSON.stringify([
    value.base,
    value.pattern,
    value.nose,
    value.white,
    TRAITS.map((trait) => value.traits[trait]),
    value.lethal,
    value.flags,
  ]);
}

export const FLAG_INFO: Readonly<Record<Flag, { readonly label: string; readonly caveat: string }>> = {
  'not-modelled-eA': {
    label: 'not modelled precisely',
    caveat:
      'MC1R eA: with two copies, or eA with e, Dominant Black (KB) was not expressed in the dogs studied, so this follows the A locus instead. Observed coats vary: dogs expected to be recessive black or tan-pointed showed wolf-sable, tan-point-like or nearly red coats (Anderson 2020).',
  },
  'not-modelled-eH-eG': {
    label: 'not modelled precisely',
    caveat:
      'MC1R eH (Cocker sable) or eG (Sighthound domino) is present. Their effects outside their origin breeds are not well described, so the coat may differ from this prediction.',
  },
  'ayt-unknown': {
    label: 'ayt phenotype unknown',
    caveat:
      'ASIP ay and at may sit on one chromosome (the ayt haplotype). Its coat effect is not known (Dreger 2019); it is shown as sable.',
  },
  'possible-saddle': {
    label: 'possible saddle, low confidence',
    caveat:
      'The saddle-tan marker (RALY) is a linked marker, not the cause, and the report does not say which allele it counts. Saddle tan is possible but uncertain.',
  },
  mask: { label: 'mask', caveat: 'Em gives a dark mask on the muzzle where the face would otherwise be tan or fawn.' },
  'pheomelanin-light': {
    label: 'light tan or cream likely',
    caveat: 'Two copies of MFSD12 i lighten the tan or fawn areas; black or brown areas are unaffected.',
  },
  'brindle-possible': {
    label: 'may be brindle',
    caveat: "Brindle can't be tested: a Dominant Black (KB) result may hide brindle.",
  },
  'merle-hidden': {
    label: 'merle hidden',
    caveat: 'Merle acts on black or brown pigment only, so it does not show on this coat, but it is passed on.',
  },
  'merle-hard-to-see': {
    label: 'merle hard to see',
    caveat: 'Merle acts on black or brown pigment only, so it may be hard to see on a mostly fawn sable coat.',
  },
  'harlequin-hidden': {
    label: 'harlequin hidden',
    caveat: 'Harlequin acts on merle, which does not show on this coat, but it is passed on.',
  },
  'mostly-white': {
    label: 'mostly white',
    caveat: 'Double merle (M/M) dogs are mostly white.',
  },
  'roan-single-copy': {
    label: 'roan uncertain',
    caveat:
      "Roan has been seen with two copies; one copy has not been observed (Brancalion 2021), and Wisdom's roan test is a linkage test.",
  },
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A plain name for a dog's own coat, e.g. "Brown, mostly white". */
export function ownColourName(value: Phenotype): string {
  const baseName: Record<BaseColour | Unknown, string> = {
    black: 'black',
    brown: 'brown',
    cocoa: 'cocoa',
    blue: 'blue',
    lilac: 'lilac',
    beige: 'beige',
    'beige-light': 'beige, light cream likely',
    albino: 'white or cream, pink nose',
    unknown: 'unknown base colour',
  };
  if (value.base === 'albino') {
    return capitalise(baseName.albino);
  }
  let name = baseName[value.base];
  if (value.traits.harlequin === 'yes') {
    name += ' harlequin';
  } else if (value.traits.merle === 'yes') {
    name += ' merle';
  } else if (value.traits.doubleMerle === 'yes') {
    name += ' double merle';
  }
  const patternSuffix: Partial<Record<Pattern | Unknown, string>> = {
    sable: ' sable',
    'wolf-sable': ' wolf sable',
    'tan-points': ' and tan',
    unknown: ', pattern unknown',
  };
  name += patternSuffix[value.pattern] ?? '';
  const joiner = name.includes(',') ? ', ' : ' ';
  const whiteSuffix: Record<WhiteSpotting | Unknown, string> = {
    solid: ', solid',
    limited: `${joiner}with limited white`,
    extensive: ', mostly white',
    unknown: ', white spotting unknown',
  };
  // M/M alone makes a dog mostly white, whatever MITF holds.
  const white = value.traits.doubleMerle === 'yes' ? 'extensive' : value.white;
  return capitalise(name + whiteSuffix[white]);
}
