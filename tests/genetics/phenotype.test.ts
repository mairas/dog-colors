import { describe, expect, it } from 'vitest';
import { allPairs, withLocus, type Genotype } from '../../src/genetics/alleles.ts';
import {
  FLAG_INFO,
  ownColourName,
  phenotype,
  phenotypeKey,
  type Flag,
  type Phenotype,
} from '../../src/genetics/phenotype.ts';
import { COLOUR_GENES, type ColourGene } from '../../src/report/loci.ts';
import { genotype } from './genotypes.ts';

type Spec = Readonly<Partial<Record<ColourGene, string>>>;

const of = (spec: Spec, unknown: readonly ColourGene[] = []): Phenotype => phenotype(genotype(spec, unknown));

interface Expected {
  readonly base?: Phenotype['base'];
  readonly pattern?: Phenotype['pattern'];
  readonly nose?: Phenotype['nose'];
  readonly white?: Phenotype['white'];
  readonly traits?: Partial<Phenotype['traits']>;
  readonly lethal?: Phenotype['lethal'];
  /** The exact flag set. */
  readonly flags?: readonly Flag[];
}

function check(spec: Spec, expected: Expected, unknown: readonly ColourGene[] = []): void {
  const result = of(spec, unknown);
  const { traits, flags, ...fields } = expected;
  expect(result).toMatchObject(fields);
  if (traits !== undefined) {
    expect(result.traits).toMatchObject(traits);
  }
  if (flags !== undefined) {
    expect([...result.flags].sort()).toEqual([...flags].sort());
  }
}

describe('phenotype: eumelanin colour', () => {
  it.each<[string, Spec, Expected]>([
    ['KB + b/b + D → brown, one colour', { CBD103: 'KB/ky', TYRP1: 'b/b' }, { base: 'brown', pattern: 'one-colour', nose: 'brown' }],
    ['KB + B → black', { CBD103: 'KB/KB', TYRP1: 'B/b' }, { base: 'black', nose: 'black' }],
    ['d/d + B → blue', { CBD103: 'KB/ky', MLPH: 'd/d' }, { base: 'blue', nose: 'blue', traits: { dilute: 'yes' } }],
    ['b/b + d/d → lilac (isabella)', { CBD103: 'KB/ky', TYRP1: 'b/b', MLPH: 'd/d' }, { base: 'lilac', nose: 'lilac', traits: { dilute: 'yes' } }],
    ['D/d → not dilute', { CBD103: 'KB/ky', MLPH: 'D/d' }, { base: 'black', traits: { dilute: 'no' } }],
    ['co/co + B → cocoa', { CBD103: 'KB/ky', HPS3: 'co/co' }, { base: 'cocoa', nose: 'brown' }],
    ['co/co + b/b → brown, with no shade claim', { CBD103: 'KB/ky', HPS3: 'co/co', TYRP1: 'b/b' }, { base: 'brown' }],
    ['co/co + d/d → lilac', { CBD103: 'KB/ky', HPS3: 'co/co', MLPH: 'd/d' }, { base: 'lilac' }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: albino', () => {
  it('cal/cal → white or cream with a pink nose, whatever the other loci', () => {
    check(
      { SLC45A2: 'cal/cal', MC1R: 'e/e', CBD103: 'KB/ky', TYRP1: 'b/b', MLPH: 'd/d', PMEL: 'M/m', MITF: 'sp/sp' },
      {
        base: 'albino',
        pattern: 'not-visible',
        nose: 'pink',
        traits: { beige: 'no', dilute: 'no', merle: 'no', harlequin: 'no' },
        flags: ['merle-hidden'],
      },
    );
  });

  it('cal/+ has no effect', () => {
    check({ SLC45A2: 'cal/+', CBD103: 'KB/ky' }, { base: 'black' });
  });

  it.each<[string, Spec, Expected]>([
    [
      'cal/cal on E/E hides merle and harlequin',
      { SLC45A2: 'cal/cal', PMEL: 'M/m', PSMB7: 'H/h' },
      { traits: { merle: 'no', harlequin: 'no' }, flags: ['merle-hidden', 'harlequin-hidden'] },
    ],
    ['cal/cal + eA/eA + KB → no eA flag', { SLC45A2: 'cal/cal', MC1R: 'eA/eA', CBD103: 'KB/ky' }, { pattern: 'not-visible', flags: [] }],
    ['cal/cal + E/eH → no eH flag', { SLC45A2: 'cal/cal', MC1R: 'E/eH' }, { pattern: 'not-visible', flags: [] }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: MC1R', () => {
  it.each<[string, Spec, Expected]>([
    ['e/e + B → beige with a black nose', { MC1R: 'e/e' }, { base: 'beige', pattern: 'not-visible', nose: 'black', traits: { beige: 'yes' }, flags: [] }],
    ['e/e + b/b → beige with a brown nose', { MC1R: 'e/e', TYRP1: 'b/b' }, { base: 'beige', nose: 'brown' }],
    ['e/e wins over KB, with no brindle flag', { MC1R: 'e/e', CBD103: 'KB/KB' }, { base: 'beige', pattern: 'not-visible', flags: [] }],
    ['e/e + d/d → beige, dilute, blue nose', { MC1R: 'e/e', MLPH: 'd/d' }, { base: 'beige', nose: 'blue', traits: { dilute: 'yes' } }],
    ['E/e → not beige', { MC1R: 'E/e', CBD103: 'KB/ky' }, { base: 'black', traits: { beige: 'no' } }],
    [
      'KB + eA/e + at/at → black and tan, K skipped and flagged',
      { CBD103: 'KB/ky', MC1R: 'eA/e', ASIP: 'at/at' },
      { base: 'black', pattern: 'tan-points', flags: ['not-modelled-eA'] },
    ],
    [
      'KB + eA/eA + ay/ay → sable, K skipped and flagged',
      { CBD103: 'KB/ky', MC1R: 'eA/eA', ASIP: 'ay/ay' },
      { pattern: 'sable', flags: ['not-modelled-eA'] },
    ],
    [
      'KB + Em/eA → one colour, unflagged',
      { CBD103: 'KB/ky', MC1R: 'Em/eA', ASIP: 'ay/ay' },
      { pattern: 'one-colour', flags: ['brindle-possible'] },
    ],
    [
      'KB + E/eA → one colour, unflagged',
      { CBD103: 'KB/ky', MC1R: 'E/eA', ASIP: 'at/at' },
      { pattern: 'one-colour', flags: ['brindle-possible'] },
    ],
    [
      'ky/ky + eA/eA + a/a → recessive black, flagged',
      { MC1R: 'eA/eA', ASIP: 'a/a' },
      { base: 'black', pattern: 'recessive-solid', flags: ['not-modelled-eA'] },
    ],
    [
      'KB + E/eH → one colour, flagged, K not skipped',
      { CBD103: 'KB/ky', MC1R: 'E/eH' },
      { pattern: 'one-colour', flags: ['not-modelled-eH-eG', 'brindle-possible'] },
    ],
    [
      'eG/e + ky/ky + at/at → tan points, flagged',
      { MC1R: 'eG/e', ASIP: 'at/at' },
      { pattern: 'tan-points', flags: ['not-modelled-eH-eG'] },
    ],
    [
      'eA/eH → K not skipped, flagged for eH',
      { CBD103: 'KB/ky', MC1R: 'eA/eH' },
      { pattern: 'one-colour', flags: ['not-modelled-eH-eG', 'brindle-possible'] },
    ],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: K and A', () => {
  it.each<[string, Spec, Expected]>([
    ['KB hides every A pattern, with the brindle caveat', { CBD103: 'KB/ky', ASIP: 'at/at' }, { pattern: 'one-colour', flags: ['brindle-possible'] }],
    ['ky/ky + at/at + B → black and tan', { ASIP: 'at/at' }, { base: 'black', pattern: 'tan-points', flags: [] }],
    ['ay/at → sable', { ASIP: 'ay/at' }, { pattern: 'sable', flags: [] }],
    ['ayt/aw → sable, ayt flagged', { ASIP: 'ayt/aw' }, { pattern: 'sable', flags: ['ayt-unknown'] }],
    ['ayt/at → sable, ayt flagged', { ASIP: 'ayt/at' }, { pattern: 'sable', flags: ['ayt-unknown'] }],
    ['KB hides ayt with its flag', { CBD103: 'KB/ky', ASIP: 'ayt/aw' }, { pattern: 'one-colour', flags: ['brindle-possible'] }],
    ['aw/at → wolf sable', { ASIP: 'aw/at' }, { pattern: 'wolf-sable' }],
    ['at/a → tan points', { ASIP: 'at/a' }, { pattern: 'tan-points' }],
    ['a/a → recessive black', { ASIP: 'a/a' }, { base: 'black', pattern: 'recessive-solid', flags: [] }],
    ['b/b + at/at → brown and tan', { ASIP: 'at/at', TYRP1: 'b/b' }, { base: 'brown', pattern: 'tan-points' }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: saddle tan', () => {
  it.each<[string, Spec, readonly Flag[]]>([
    ['at/at with one RALY copy → possible saddle', { ASIP: 'at/at', RALY: '+/dup' }, ['possible-saddle']],
    ['at/a with two RALY copies → possible saddle', { ASIP: 'at/a', RALY: '+/+' }, ['possible-saddle']],
    ['at/at with no RALY copy → no saddle', { ASIP: 'at/at', RALY: 'dup/dup' }, []],
    ['ay/at hides saddle', { ASIP: 'ay/at', RALY: '+/+' }, []],
    ['aw/at hides saddle', { ASIP: 'aw/at', RALY: '+/+' }, []],
    ['KB hides saddle', { CBD103: 'KB/ky', ASIP: 'at/at', RALY: '+/+' }, ['brindle-possible']],
  ])('%s', (_name, spec, flags) => check(spec, { flags }));
});

describe('phenotype: mask and intensity', () => {
  it.each<[string, Spec, Expected]>([
    ['Em on a sable face → mask', { MC1R: 'Em/E', ASIP: 'ay/ay' }, { pattern: 'sable', flags: ['mask'] }],
    ['Em on tan points → mask', { MC1R: 'Em/e', ASIP: 'at/at' }, { pattern: 'tan-points', flags: ['mask'] }],
    ['Em under KB → no mask', { MC1R: 'Em/Em', CBD103: 'KB/ky', ASIP: 'ay/ay' }, { flags: ['brindle-possible'] }],
    ['Em on recessive black → no mask', { MC1R: 'Em/E', ASIP: 'a/a' }, { flags: [] }],
    ['i/i on e/e → beige, light cream likely', { MC1R: 'e/e', MFSD12: 'i/i' }, { base: 'beige-light', flags: [] }],
    ['i/+ on e/e → beige', { MC1R: 'e/e', MFSD12: 'i/+' }, { base: 'beige' }],
    ['i/i on wolf sable → pheomelanin lightened', { ASIP: 'aw/aw', MFSD12: 'i/i' }, { base: 'black', pattern: 'wolf-sable', flags: ['pheomelanin-light'] }],
    ['i/i under KB → nothing to lighten', { CBD103: 'KB/ky', MFSD12: 'i/i' }, { base: 'black', flags: ['brindle-possible'] }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: merle and harlequin', () => {
  it.each<[string, Spec, Expected]>([
    ['M/m on black → merle', { CBD103: 'KB/ky', PMEL: 'M/m' }, { traits: { merle: 'yes', doubleMerle: 'no' }, flags: ['brindle-possible'] }],
    ['M/m on e/e → merle hidden', { MC1R: 'e/e', PMEL: 'M/m' }, { traits: { merle: 'no' }, flags: ['merle-hidden'] }],
    ['M/m on sable → merle, hard to see', { ASIP: 'ay/ay', PMEL: 'M/m' }, { traits: { merle: 'yes' }, flags: ['merle-hard-to-see'] }],
    ['M/M on sable → hard to see', { ASIP: 'ay/ay', PMEL: 'M/M' }, { traits: { doubleMerle: 'yes' }, flags: ['mostly-white', 'merle-hard-to-see'] }],
    [
      'M/M → double merle, mostly white',
      { CBD103: 'KB/ky', PMEL: 'M/M' },
      { traits: { merle: 'no', doubleMerle: 'yes' }, flags: ['mostly-white', 'brindle-possible'] },
    ],
    [
      'M/M on e/e → double merle, merle hidden',
      { MC1R: 'e/e', PMEL: 'M/M' },
      { traits: { doubleMerle: 'yes' }, flags: ['mostly-white', 'merle-hidden'] },
    ],
    ['M/m + H/h → harlequin', { CBD103: 'KB/ky', PMEL: 'M/m', PSMB7: 'H/h' }, { traits: { harlequin: 'yes', merle: 'yes' }, lethal: 'no' }],
    ['m/m + H/h → no harlequin', { PSMB7: 'H/h' }, { traits: { harlequin: 'no', merle: 'no' }, flags: [] }],
    [
      'M/m + H/h on e/e → harlequin hidden',
      { MC1R: 'e/e', PMEL: 'M/m', PSMB7: 'H/h' },
      { traits: { harlequin: 'no' }, flags: ['merle-hidden', 'harlequin-hidden'] },
    ],
    ['H/H → lethal', { PMEL: 'M/m', PSMB7: 'H/H' }, { lethal: 'yes' }],
    ['H/H without merle → lethal', { PSMB7: 'H/H' }, { lethal: 'yes' }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: white spotting and roan', () => {
  it.each<[string, Spec, Expected]>([
    ['MITF 0 copies → solid', { MITF: '+/+' }, { white: 'solid' }],
    ['MITF 1 copy → limited white', { MITF: 'sp/+' }, { white: 'limited' }],
    ['MITF 2 copies → piebald to mostly white', { MITF: 'sp/sp' }, { white: 'extensive' }],
    ['roan within piebald white', { MITF: 'sp/sp', USH2A: 'R/R' }, { traits: { roan: 'yes' }, flags: [] }],
    ['one roan copy → roan, flagged uncertain', { MITF: 'sp/+', USH2A: 'R/+' }, { traits: { roan: 'yes' }, flags: ['roan-single-copy'] }],
    ['roan without white → not visible', { MITF: '+/+', USH2A: 'R/R' }, { traits: { roan: 'no' }, flags: [] }],
    ['one roan copy without white → not visible, unflagged', { MITF: '+/+', USH2A: 'R/+' }, { traits: { roan: 'no' }, flags: [] }],
  ])('%s', (_name, spec, expected) => check(spec, expected));
});

describe('phenotype: unknown loci', () => {
  it('a missing MFSD12 makes a beige shade unknown', () => {
    check({ MC1R: 'e/e' }, { base: 'unknown', pattern: 'not-visible', traits: { beige: 'yes' } }, ['MFSD12']);
  });

  it('a missing MFSD12 changes nothing where no pheomelanin shows', () => {
    check({ CBD103: 'KB/ky' }, { base: 'black', pattern: 'one-colour', flags: ['brindle-possible'] }, ['MFSD12']);
  });

  it('a missing TYRP1 makes base colour and nose unknown, and leaves the pattern', () => {
    check({ CBD103: 'KB/ky' }, { base: 'unknown', nose: 'unknown', pattern: 'one-colour' }, ['TYRP1']);
  });

  it('a missing CBD103 makes the pattern unknown, and drops flags that only some genotypes carry', () => {
    check({ ASIP: 'at/at' }, { base: 'black', pattern: 'unknown', flags: [] }, ['CBD103']);
  });

  it('a missing PMEL makes merle and double merle unknown', () => {
    check({ CBD103: 'KB/ky' }, { traits: { merle: 'unknown', doubleMerle: 'unknown', harlequin: 'no' } }, ['PMEL']);
  });

  it('a missing PSMB7 makes harlequin and lethality unknown only where they could occur', () => {
    check({ PMEL: 'M/m' }, { traits: { harlequin: 'unknown' }, lethal: 'unknown' }, ['PSMB7']);
  });

  it('a missing MITF makes white spotting and roan unknown', () => {
    check({ USH2A: 'R/R' }, { white: 'unknown', traits: { roan: 'unknown' } }, ['MITF']);
  });

  it('a missing USH2A leaves roan impossible on a solid dog', () => {
    check({ MITF: '+/+' }, { white: 'solid', traits: { roan: 'no' } }, ['USH2A']);
  });

  it('a missing SLC45A2 makes the whole pigment phenotype unknown', () => {
    check({ CBD103: 'KB/ky' }, { base: 'unknown', pattern: 'unknown', nose: 'unknown', white: 'solid' }, ['SLC45A2']);
  });

  it('keeps a field known across two unknown loci that cannot change it', () => {
    check({ CBD103: 'KB/ky', TYRP1: 'b/b' }, { base: 'unknown', pattern: 'unknown', nose: 'brown', flags: [] }, ['MC1R', 'ASIP']);
  });

  it('keeps merle, double merle, harlequin, lethality and dilution known with eight pigment loci missing', () => {
    check(
      { PMEL: 'M/M', PSMB7: 'h/h', MLPH: 'D/D' },
      {
        traits: { merle: 'no', doubleMerle: 'yes', harlequin: 'no', dilute: 'no' },
        lethal: 'no',
        flags: ['mostly-white'],
      },
      ['SLC45A2', 'MC1R', 'CBD103', 'ASIP', 'TYRP1', 'HPS3', 'MFSD12', 'RALY'],
    );
  });

  it('keeps dilution, double merle and lethality known with five pigment loci missing', () => {
    check(
      { PMEL: 'M/m', PSMB7: 'H/H', MLPH: 'D/d' },
      { base: 'unknown', traits: { dilute: 'no', doubleMerle: 'no' }, lethal: 'yes' },
      ['SLC45A2', 'MC1R', 'ASIP', 'TYRP1', 'HPS3'],
    );
  });

  it('an empty genotype is unknown everywhere', () => {
    const all: ColourGene[] = ['ASIP', 'CBD103', 'MC1R', 'HPS3', 'MFSD12', 'MLPH', 'TYRP1', 'MITF', 'PMEL', 'PSMB7', 'RALY', 'USH2A', 'SLC45A2'];
    check({}, { base: 'unknown', pattern: 'unknown', nose: 'unknown', white: 'unknown', lethal: 'unknown', flags: [] }, all);
  });
});

describe('phenotype: the unknown-locus search', () => {
  /** Mulberry32, seeded, so every run checks the same genotypes. */
  function generator(seed: number): (size: number) => number {
    let state = seed;
    return (size) => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 2 ** 32) * size);
    };
  }

  const same = <T extends string>(left: T, right: T): T | 'unknown' => (left === right ? left : 'unknown');

  /** What an unknown locus means: a field the completions disagree on is unknown; a flag holds only if every completion has it. */
  function join(left: Phenotype, right: Phenotype): Phenotype {
    const trait = (name: keyof Phenotype['traits']) => same(left.traits[name], right.traits[name]);
    return {
      base: same(left.base, right.base),
      pattern: same(left.pattern, right.pattern),
      nose: same(left.nose, right.nose),
      white: same(left.white, right.white),
      traits: {
        merle: trait('merle'),
        doubleMerle: trait('doubleMerle'),
        dilute: trait('dilute'),
        beige: trait('beige'),
        harlequin: trait('harlequin'),
        roan: trait('roan'),
      },
      lethal: same(left.lethal, right.lethal),
      flags: left.flags.filter((flag) => right.flags.includes(flag)),
    };
  }

  it('matches joining the phenotypes of every completion of up to three unknown loci', () => {
    const random = generator(1);
    for (let trial = 0; trial < 200; trial++) {
      const genes = [...COLOUR_GENES];
      const unknown = Array.from({ length: 1 + random(3) }, () => genes.splice(random(genes.length), 1)[0]);
      let partial: Genotype = {};
      const pick = <G extends ColourGene>(gene: G): void => {
        const pairs = allPairs(gene);
        const pair = pairs[random(pairs.length)];
        if (pair !== undefined && !unknown.includes(gene)) {
          partial = withLocus(partial, gene, pair);
        }
      };
      COLOUR_GENES.forEach(pick);

      let completions: Genotype[] = [partial];
      const complete = <G extends ColourGene>(gene: G): void => {
        completions = completions.flatMap((known) => allPairs(gene).map((pair) => withLocus(known, gene, pair)));
      };
      unknown.forEach((gene) => gene !== undefined && complete(gene));

      const [first, ...rest] = completions.map(phenotype);
      expect(first).toBeDefined();
      if (first !== undefined) {
        expect({ unknown, phenotype: phenotype(partial) }).toEqual({ unknown, phenotype: rest.reduce(join, first) });
      }
    }
  });
});

describe('phenotypeKey', () => {
  it('is equal for the same phenotype whatever the pair order', () => {
    expect(phenotypeKey(of({ TYRP1: 'b/B', CBD103: 'ky/KB' }))).toBe(phenotypeKey(of({ TYRP1: 'B/b', CBD103: 'KB/ky' })));
  });

  it('differs when a flag differs', () => {
    expect(phenotypeKey(of({ ASIP: 'at/at', RALY: '+/dup' }))).not.toBe(phenotypeKey(of({ ASIP: 'at/at' })));
  });
});

describe('ownColourName', () => {
  it.each<[Spec, string]>([
    [{ CBD103: 'KB/KB', TYRP1: 'b/b', MITF: 'sp/sp' }, 'Brown, mostly white'],
    [{ CBD103: 'KB/ky', TYRP1: 'b/b', MITF: 'sp/+' }, 'Brown with limited white'],
    [{ CBD103: 'KB/ky', TYRP1: 'b/b' }, 'Brown, solid'],
    [{ ASIP: 'at/at' }, 'Black and tan, solid'],
    [{ ASIP: 'ay/ay', TYRP1: 'b/b' }, 'Brown sable, solid'],
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, 'Black merle, solid'],
    [{ CBD103: 'KB/ky', PMEL: 'M/m', PSMB7: 'H/h' }, 'Black harlequin, solid'],
    [{}, 'Black wolf sable, solid'],
    [{ ASIP: 'aw/at', MITF: 'sp/+' }, 'Black wolf sable with limited white'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M' }, 'Black double merle, mostly white'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M', MITF: 'sp/+' }, 'Black double merle, mostly white'],
    [{ MC1R: 'e/e', PMEL: 'M/M' }, 'Beige double merle, mostly white'],
    [{ CBD103: 'KB/ky', MLPH: 'd/d' }, 'Blue, solid'],
    [{ MC1R: 'e/e', MFSD12: 'i/i', MITF: 'sp/+' }, 'Beige, light cream likely, with limited white'],
    [{ SLC45A2: 'cal/cal', MITF: 'sp/sp' }, 'White or cream, pink nose'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M', PSMB7: 'H/h' }, 'Black harlequin double merle, mostly white'],
  ])('%j → %s', (spec, name) => expect(ownColourName(of(spec))).toBe(name));

  it.each<[Spec, readonly ColourGene[], string]>([
    [{ CBD103: 'KB/ky' }, ['PMEL'], 'Black, merle unknown, white spotting unknown'],
    [{ CBD103: 'KB/ky', MITF: 'sp/sp' }, ['PMEL'], 'Black, merle unknown, mostly white'],
    [{ ASIP: 'at/at', MITF: 'sp/+' }, ['PMEL'], 'Black and tan, merle unknown, white spotting unknown'],
    [{ CBD103: 'KB/ky', PSMB7: 'H/h' }, ['PMEL'], 'Black, merle unknown, harlequin unknown, white spotting unknown'],
    [{ MC1R: 'e/e' }, ['PMEL'], 'Beige, white spotting unknown'],
    [{ ASIP: 'at/at' }, ['CBD103', 'PMEL'], 'Black, pattern unknown, merle unknown, white spotting unknown'],
  ])('names an unknown merle: %j with %j unknown → %s', (spec, unknown, name) =>
    expect(ownColourName(of(spec, unknown))).toBe(name),
  );

  it.each<[Spec, readonly ColourGene[]]>([
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, ['MC1R']],
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, ['SLC45A2']],
  ])('a reported M/m whose visibility is unknown is merle that may not show: %j with %j unknown', (spec, unknown) => {
    const name = ownColourName(of(spec, unknown));
    expect(name).toContain('merle, may not show');
    expect(name).not.toContain('merle unknown');
  });

  it('the single-copy roan caveat says what Brancalion 2021 found', () => {
    const { caveat } = FLAG_INFO['roan-single-copy'];
    expect(caveat).toMatch(/Australian Cattle Dogs/);
    expect(caveat).toMatch(/no spaniel with one roan and one non-roan copy/);
  });

  it.each<[Spec, readonly ColourGene[], string]>([
    [{ CBD103: 'KB/ky' }, ['PMEL'], 'Black, merle unknown, white spotting unknown'],
  ])('keeps merle unknown when PMEL itself is unknown: %j with %j unknown → %s', (spec, unknown, name) =>
    expect(ownColourName(of(spec, unknown))).toBe(name),
  );

  it.each<[Spec, readonly ColourGene[], string]>([
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, ['PSMB7'], 'Black merle, harlequin unknown, solid'],
    [{ CBD103: 'KB/ky', PMEL: 'M/m', MITF: 'sp/+' }, ['PSMB7'], 'Black merle, harlequin unknown, with limited white'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M' }, ['PSMB7'], 'Black double merle, harlequin unknown, mostly white'],
    [{ CBD103: 'KB/ky' }, ['PSMB7'], 'Black, solid'],
    [{ MC1R: 'e/e', PMEL: 'M/m' }, ['PSMB7'], 'Beige, solid'],
  ])('names an unknown harlequin: %j with %j unknown → %s', (spec, unknown, name) =>
    expect(ownColourName(of(spec, unknown))).toBe(name),
  );

  it.each<[Spec, readonly ColourGene[], string]>([
    [{ ASIP: 'at/at' }, ['CBD103'], 'Black, pattern unknown, solid'],
    [{ ASIP: 'at/at', MITF: 'sp/+' }, ['CBD103'], 'Black, pattern unknown, with limited white'],
    [{ CBD103: 'KB/ky' }, ['MITF'], 'Black, white spotting unknown'],
    [{ ASIP: 'at/at', TYRP1: 'b/b' }, ['MITF'], 'Brown and tan, white spotting unknown'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M' }, ['MITF'], 'Black double merle, mostly white'],
  ])('%j with %j unknown → %s', (spec, unknown, name) => expect(ownColourName(of(spec, unknown))).toBe(name));

  it.each<[Spec, readonly ColourGene[], string]>([
    [{ CBD103: 'KB/ky', MITF: 'sp/+' }, ['TYRP1'], 'Colour unknown, with limited white'],
    [{}, ['TYRP1'], 'Colour unknown, wolf sable, solid'],
    [{ ASIP: 'at/at' }, ['TYRP1'], 'Colour unknown, tan points, solid'],
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, ['TYRP1'], 'Colour unknown, merle, solid'],
    [{ ASIP: 'at/at' }, ['TYRP1', 'CBD103', 'MITF'], 'Colour unknown, pattern unknown, white spotting unknown'],
    [{ CBD103: 'KB/ky', PMEL: 'M/M' }, ['TYRP1'], 'Colour unknown, double merle, mostly white'],
    [{ CBD103: 'KB/ky', PMEL: 'M/m' }, ['TYRP1', 'PSMB7'], 'Colour unknown, merle, harlequin unknown, solid'],
    [{ ASIP: 'at/at' }, ['TYRP1', 'PMEL'], 'Colour unknown, tan points, merle unknown, white spotting unknown'],
  ])('names an unknown base colour: %j with %j unknown → %s', (spec, unknown, name) =>
    expect(ownColourName(of(spec, unknown))).toBe(name),
  );
});

describe('FLAG_INFO', () => {
  it('labels the eA flag "not modelled precisely" and says observed coats vary', () => {
    expect(FLAG_INFO['not-modelled-eA'].label).toBe('not modelled precisely');
    expect(FLAG_INFO['not-modelled-eA'].caveat).toMatch(/vary/);
  });

  it('says roan may be incompletely dominant, not that one copy was never seen', () => {
    const { caveat } = FLAG_INFO['roan-single-copy'];
    expect(caveat).not.toMatch(/not been observed/);
    expect(caveat).toMatch(/incomplete dominance/);
    expect(caveat).toMatch(/linkage test/);
  });

  it('says double merle dogs are usually, not always, mostly white', () => {
    expect(FLAG_INFO['mostly-white'].caveat).toMatch(/usually mostly white/);
  });

  it('says ay/at/at dogs were tan-pointed in one breed and fawn in another', () => {
    const { caveat } = FLAG_INFO['ayt-unknown'];
    expect(caveat).toMatch(/Dreger 2020/);
    expect(caveat).toMatch(/tan-pointed/);
    expect(caveat).toMatch(/fawn/);
  });
});
