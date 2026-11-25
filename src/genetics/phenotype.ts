// Genotype → coat phenotype, following the plan's epistasis order: albino →
// eumelanin colour → MC1R → K → A → mask → intensity → merle and harlequin →
// piebald → roan. The pigment loci and the white loci (MITF, USH2A) are
// separate functions so the cross can enumerate the two groups independently.
//
// A locus absent from the genotype is unknown. Every field and every flag has
// its own rule, which reads only the loci it needs for this genotype, and is
// evaluated over every pair the unknown loci it reads could hold: a field that
// differs between them is "unknown", and a flag holds only if it holds for all.
// So missing loci a field never reads leave it known (lethality needs PSMB7
// alone, however many pigment loci are missing), and loci never consulted for
// this genotype (MFSD12 under KB, say) leave the result untouched.

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
  'undocumented-haplotype',
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

/** One phenotype field or flag as a function of the genotype. It reads only the loci it needs. */
type Rule<T> = (read: Reader) => T;

const has = <G extends ColourGene>(pair: AllelePair<G>, allele: Allele<G>): boolean =>
  pair[0] === allele || pair[1] === allele;

const copies = <G extends ColourGene>(pair: AllelePair<G>, allele: Allele<G>): number =>
  (pair[0] === allele ? 1 : 0) + (pair[1] === allele ? 1 : 0);

const yesNo = (value: boolean): 'yes' | 'no' => (value ? 'yes' : 'no');

const isAlbino: Rule<boolean> = (read) => copies(read('SLC45A2'), 'cal') === 2;

const isRecessiveRed: Rule<boolean> = (read) => copies(read('MC1R'), 'e') === 2;

/** Albino or e/e: the coat shows no eumelanin, the only pigment merle and harlequin act on. */
const hidesEumelanin: Rule<boolean> = (read) => isAlbino(read) || isRecessiveRed(read);

const isDilute: Rule<boolean> = (read) => !isAlbino(read) && copies(read('MLPH'), 'd') === 2;

function baseOf(read: Reader): BaseColour {
  if (isAlbino(read)) {
    return 'albino';
  }
  if (isRecessiveRed(read)) {
    return copies(read('MFSD12'), 'i') === 2 ? 'beige-light' : 'beige';
  }
  const brown = copies(read('TYRP1'), 'b') === 2;
  const cocoa = copies(read('HPS3'), 'co') === 2;
  if (isDilute(read)) {
    return brown || cocoa ? 'lilac' : 'blue';
  }
  // co/co with b/b is named plain brown: no source gives the combined shade.
  return brown ? 'brown' : cocoa ? 'cocoa' : 'black';
}

function noseOf(read: Reader): Nose {
  if (isAlbino(read)) {
    return 'pink';
  }
  const brownish = copies(read('TYRP1'), 'b') === 2 || copies(read('HPS3'), 'co') === 2;
  if (isDilute(read)) {
    return brownish ? 'lilac' : 'blue';
  }
  return brownish ? 'brown' : 'black';
}

/**
 * The MC1R alleles that leave KB unexpressed when the dog has neither E nor Em.
 * Anderson 2020 saw it in eA/eA and eA/e dogs, with Em/eA and E/eA unaffected.
 * eH rests on Honkanen 2024's abstract, which groups eA, eH and eG. eG is left
 * out: Dreger 2010 reports KB epistatic to its grizzle and domino.
 */
const KB_SKIPPING_MC1R = ['eA', 'eH'] as const satisfies readonly Allele<'MC1R'>[];

/** Whether KB goes unexpressed: an eA or eH allele with neither E nor Em. */
export function skipsDominantBlack(mc1r: readonly string[]): boolean {
  return KB_SKIPPING_MC1R.some((allele) => mc1r.includes(allele)) && !mc1r.includes('E') && !mc1r.includes('Em');
}

const skipsK: Rule<boolean> = (read) => skipsDominantBlack(read('MC1R'));

function patternOf(read: Reader): Pattern {
  if (hidesEumelanin(read)) {
    return 'not-visible';
  }
  if (!skipsK(read) && has(read('CBD103'), 'KB')) {
    return 'one-colour';
  }
  const asip = read('ASIP');
  if (has(asip, 'ay') || has(asip, 'ayt')) {
    return 'sable';
  }
  if (has(asip, 'aw')) {
    return 'wolf-sable';
  }
  return has(asip, 'at') ? 'tan-points' : 'recessive-solid';
}

const showsPheomelanin: Rule<boolean> = (read) => ['sable', 'wolf-sable', 'tan-points'].includes(patternOf(read));

const merleCopies = (read: Reader): number => copies(read('PMEL'), 'M');

const hasHarlequin: Rule<boolean> = (read) => merleCopies(read) > 0 && has(read('PSMB7'), 'H');

type WhiteFlag = 'roan-single-copy';

/** Flags about how the report was read, not about the genotype; resolveDog adds them. */
type ReportFlag = 'undocumented-haplotype';

const PIGMENT_FLAGS: Readonly<Record<Exclude<Flag, WhiteFlag | ReportFlag>, Rule<boolean>>> = {
  'not-modelled-eA': (read) => !hidesEumelanin(read) && skipsK(read) && has(read('MC1R'), 'eA'),
  'not-modelled-eH-eG': (read) => !hidesEumelanin(read) && (has(read('MC1R'), 'eH') || has(read('MC1R'), 'eG')),
  'ayt-unknown': (read) => patternOf(read) === 'sable' && has(read('ASIP'), 'ayt'),
  'possible-saddle': (read) => patternOf(read) === 'tan-points' && has(read('RALY'), '+'),
  mask: (read) => showsPheomelanin(read) && has(read('MC1R'), 'Em'),
  'pheomelanin-light': (read) => showsPheomelanin(read) && copies(read('MFSD12'), 'i') === 2,
  // The KB test can't tell brindle from KB, so any KB result may be brindle.
  'brindle-possible': (read) => patternOf(read) === 'one-colour',
  'merle-hidden': (read) => merleCopies(read) > 0 && hidesEumelanin(read),
  'merle-hard-to-see': (read) => merleCopies(read) > 0 && patternOf(read) === 'sable',
  'harlequin-hidden': (read) => hasHarlequin(read) && hidesEumelanin(read),
  'mostly-white': (read) => merleCopies(read) === 2,
};

const spotting = (read: Reader): number => copies(read('MITF'), 'sp');

const WHITE_FLAGS: Readonly<Record<WhiteFlag, Rule<boolean>>> = {
  // Brancalion 2021 proposes incomplete dominance from Australian Cattle Dogs
  // with one or two copies; Wisdom's roan test is a linkage test.
  'roan-single-copy': (read) => spotting(read) > 0 && copies(read('USH2A'), 'R') === 1,
};

interface Choice {
  readonly gene: ColourGene;
  index: number;
  readonly count: number;
}

const UNREAD = Symbol('unread');

/**
 * The rule's value when every locus it reads is known, or UNREAD. The cross
 * evaluates complete genotypes tens of thousands of times, and this skips the
 * search's bookkeeping for them.
 */
function direct<T>(genotype: Genotype, rule: Rule<T>): T | typeof UNREAD {
  try {
    return rule(<G extends ColourGene>(gene: G): AllelePair<G> => {
      const pair = genotype[gene];
      if (pair === undefined) {
        throw UNREAD;
      }
      return pair;
    });
  } catch (error) {
    if (error === UNREAD) {
      return UNREAD;
    }
    throw error;
  }
}

/**
 * Calls visit with the rule's value for each combination of pairs at the
 * unknown loci the rule reads, until visit returns false. It branches on a
 * locus only when the rule first reads it, so a rule meets only the loci it
 * needs for this genotype: at most five, 3·21·3·15·3 = 8,505 combinations.
 */
function search<T>(genotype: Genotype, rule: Rule<T>, visit: (value: T) => boolean): void {
  const value = direct(genotype, rule);
  if (value !== UNREAD) {
    visit(value);
    return;
  }
  const choices: Choice[] = [];
  for (;;) {
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

    if (!visit(rule(read))) {
      return;
    }
    choices.length = depth;
    let last = choices.at(-1);
    while (last !== undefined && ++last.index >= last.count) {
      choices.pop();
      last = choices.at(-1);
    }
    if (last === undefined) {
      return;
    }
  }
}

/** The rule's value, or unknown when the unknown loci it reads could change it. */
function known<T extends string>(genotype: Genotype, rule: Rule<T>): T | Unknown {
  let result: T | Unknown = 'unknown';
  let first = true;
  search(genotype, rule, (value) => {
    result = first || result === value ? value : 'unknown';
    first = false;
    return result !== 'unknown';
  });
  return result;
}

/** The flags that hold whatever the unknown loci their rules read hold. */
function flagsOf(genotype: Genotype, rules: Readonly<Partial<Record<Flag, Rule<boolean>>>>): Flag[] {
  return FLAGS.filter((flag) => {
    const rule = rules[flag];
    if (rule === undefined) {
      return false;
    }
    let always = true;
    search(genotype, rule, (value) => (always = value));
    return always;
  });
}

export function pigmentPhenotype(genotype: Genotype): PigmentPhenotype {
  const trait = (rule: Rule<boolean>): TraitValue => known(genotype, (read) => yesNo(rule(read)));
  return {
    base: known(genotype, baseOf),
    pattern: known(genotype, patternOf),
    nose: known(genotype, noseOf),
    merle: trait((read) => merleCopies(read) === 1 && !hidesEumelanin(read)),
    doubleMerle: trait((read) => merleCopies(read) === 2),
    dilute: trait(isDilute),
    beige: trait((read) => !isAlbino(read) && isRecessiveRed(read)),
    harlequin: trait((read) => hasHarlequin(read) && !hidesEumelanin(read)),
    lethal: trait((read) => copies(read('PSMB7'), 'H') === 2),
    flags: flagsOf(genotype, PIGMENT_FLAGS),
  };
}

export function whitePhenotype(genotype: Genotype): WhitePhenotype {
  return {
    white: known(genotype, (read) => WHITE_SPOTTING[spotting(read)] ?? 'extensive'),
    // Roan shows only within white areas.
    roan: known(genotype, (read) => yesNo(spotting(read) > 0 && copies(read('USH2A'), 'R') > 0)),
    flags: flagsOf(genotype, WHITE_FLAGS),
  };
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
    flags: FLAGS.filter((flag) => pigment.flags.includes(flag) || white.flags.includes(flag)),
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
  'undocumented-haplotype': {
    label: 'undocumented combination',
    caveat:
      "For the genes named, the report's variant copies fit no combination documented on one chromosome. Every way of placing them that keeps each variant's own effect gives the same alleles, so those are used, but the combination itself is not described in the sources.",
  },
  'not-modelled-eA': {
    label: 'not modelled precisely',
    caveat:
      'MC1R eA without E or Em: Dominant Black (KB) was not expressed in the eA/eA and eA/e dogs studied, so this follows the A locus instead. Observed coats vary: dogs expected to be recessive black or tan-pointed showed wolf-sable, tan-point-like or nearly red coats (Anderson 2020).',
  },
  'not-modelled-eH-eG': {
    label: 'not modelled precisely',
    caveat:
      'MC1R eH (Cocker sable) or eG (Sighthound domino) is present. Honkanen 2024 groups eA, eH and eG; on that grouping, with eH and without E or Em, Dominant Black (KB) is taken as not expressed and this follows the A locus. With eG and neither eA nor eH, KB is kept expressed, since Dreger 2010 reports KB epistatic to grizzle and domino. Their effects outside their origin breeds are not well described, so the coat may differ from this prediction.',
  },
  'ayt-unknown': {
    label: 'ayt phenotype unknown',
    caveat:
      'ASIP ay and at may sit on one chromosome (the ayt haplotype, Dreger 2019). Dogs with ay and two copies of at were tan-pointed in one breed and fawn in another (Dreger 2020), so the sable shown here is uncertain.',
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
    caveat: 'Double merle (M/M) dogs are usually mostly white; two copies of the shorter merle alleles can show little white.',
  },
  'roan-single-copy': {
    label: 'roan uncertain',
    caveat:
      "Brancalion 2021 proposes incomplete dominance: Australian Cattle Dogs, nearly all roan, carried one or two roan copies, but no spaniel with one roan and one non-roan copy was found. Wisdom's roan test is a linkage test.",
  },
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A plain name for a dog's own coat, e.g. "Brown, mostly white"; with an
 * unknown base colour, comma-separated parts: "Colour unknown, tan points, solid".
 * A merle or harlequin the report can't settle is named as unknown, and so is
 * white spotting short of mostly white when a double merle can't be ruled out.
 */
export function ownColourName(value: Phenotype): string {
  if (value.base === 'albino') {
    return 'White or cream, pink nose';
  }
  const baseName: Record<Exclude<BaseColour, 'albino'>, string> = {
    black: 'black',
    brown: 'brown',
    cocoa: 'cocoa',
    blue: 'blue',
    lilac: 'lilac',
    beige: 'beige',
    'beige-light': 'beige, light cream likely',
  };
  const { harlequin, merle, doubleMerle } = value.traits;
  const marking =
    harlequin === 'yes'
      ? doubleMerle === 'yes'
        ? 'harlequin double merle'
        : 'harlequin'
      : merle === 'yes'
        ? 'merle'
        : doubleMerle === 'yes'
          ? 'double merle'
          : undefined;
  const unsettled = [
    // doubleMerle 'no' with merle unknown means one M is reported but its visibility isn't settled.
    merle === 'unknown' && marking === undefined
      ? doubleMerle === 'no'
        ? 'merle, may not show'
        : 'merle unknown'
      : undefined,
    harlequin === 'unknown' ? 'harlequin unknown' : undefined,
  ].filter((part) => part !== undefined);
  const whiteName: Record<WhiteSpotting | Unknown, string> = {
    solid: 'solid',
    limited: 'with limited white',
    extensive: 'mostly white',
    unknown: 'white spotting unknown',
  };
  // M/M usually makes a dog mostly white whatever MITF holds; the mostly-white caveat carries the exceptions.
  const white =
    whiteName[
      doubleMerle === 'yes'
        ? 'extensive'
        : doubleMerle === 'unknown' && value.white !== 'extensive'
          ? 'unknown'
          : value.white
    ];

  if (value.base === 'unknown') {
    const patternPart: Partial<Record<Pattern | Unknown, string>> = {
      sable: 'sable',
      'wolf-sable': 'wolf sable',
      'tan-points': 'tan points',
      unknown: 'pattern unknown',
    };
    const parts = ['Colour unknown', marking, patternPart[value.pattern], ...unsettled, white];
    return parts.filter((part) => part !== undefined).join(', ');
  }

  const patternSuffix: Partial<Record<Pattern | Unknown, string>> = {
    sable: ' sable',
    'wolf-sable': ' wolf sable',
    'tan-points': ' and tan',
    unknown: ', pattern unknown',
  };
  const name =
    baseName[value.base] +
    (marking === undefined ? '' : ` ${marking}`) +
    (patternSuffix[value.pattern] ?? '') +
    unsettled.map((part) => `, ${part}`).join('');
  const joiner = white === whiteName.limited && !name.includes(',') ? ' ' : ', ';
  return capitalise(name + joiner + white);
}
