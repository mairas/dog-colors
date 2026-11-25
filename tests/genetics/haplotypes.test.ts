import { describe, expect, it } from 'vitest';
import { formatPair } from '../../src/genetics/alleles.ts';
import { resolveLocus, resolveReport, type LocusResolution } from '../../src/genetics/haplotypes.ts';
import type { ColourGene } from '../../src/report/loci.ts';
import { sampleReport, syntheticReport } from './reports.ts';

function candidates<G extends ColourGene>(resolution: LocusResolution<G>): string[] {
  if (resolution.status !== 'resolved') {
    throw new Error(`expected a resolved locus, got ${resolution.status}`);
  }
  return resolution.candidates.map(formatPair);
}

describe('resolveLocus: TYRP1', () => {
  it('puts bc and bs on separate chromosomes: b/b only', () => {
    expect(candidates(resolveLocus('TYRP1', { bc: 1, bs: 1 }))).toEqual(['b/b']);
  });

  it('allows bd in cis with another b variant: b/b or B/b', () => {
    expect(candidates(resolveLocus('TYRP1', { bd: 1, bc: 1 }))).toEqual(['B/b', 'b/b']);
  });

  it('places bc ×2 + bd ×1 as bc+bd and bc: b/b only', () => {
    expect(candidates(resolveLocus('TYRP1', { bc: 2, bd: 1 }))).toEqual(['b/b']);
  });

  it('reads no variant as B/B and a single variant as B/b', () => {
    expect(candidates(resolveLocus('TYRP1', { bc: 0, bs: 0 }))).toEqual(['B/B']);
    expect(candidates(resolveLocus('TYRP1', { bs: 1 }))).toEqual(['B/b']);
  });
});

describe('resolveLocus: ASIP', () => {
  it('reads 0 copies of every code as aw/aw', () => {
    expect(candidates(resolveLocus('ASIP', { ay: 0, a: 0, at: 0 }))).toEqual(['aw/aw']);
  });

  it('keeps both phasings of ay 1 + at 1: ay/at in trans, ayt/aw in cis', () => {
    expect(candidates(resolveLocus('ASIP', { ay: 1, at: 1, a: 0 }))).toEqual(['ay/at', 'ayt/aw']);
  });

  it('puts ay with one of two at copies: ayt/at only', () => {
    expect(candidates(resolveLocus('ASIP', { ay: 1, at: 2, a: 0 }))).toEqual(['ayt/at']);
  });

  it('always puts a with at', () => {
    expect(candidates(resolveLocus('ASIP', { at: 1, a: 1 }))).toEqual(['aw/a']);
    expect(candidates(resolveLocus('ASIP', { at: 2, a: 1 }))).toEqual(['at/a']);
    expect(candidates(resolveLocus('ASIP', { at: 2, a: 2 }))).toEqual(['a/a']);
  });

  it('reads at 1 as aw/at and at 2 as at/at', () => {
    expect(candidates(resolveLocus('ASIP', { at: 1 }))).toEqual(['aw/at']);
    expect(candidates(resolveLocus('ASIP', { at: 2 }))).toEqual(['at/at']);
  });

  it('places ay 1 + at 1 + a 1 as ay and a+at: ay/a only', () => {
    expect(candidates(resolveLocus('ASIP', { ay: 1, at: 1, a: 1 }))).toEqual(['ay/a']);
  });
});

describe('resolveLocus: genes without documented cis pairs', () => {
  it('MC1R Em 1 + e1 1 → Em/e only', () => {
    expect(candidates(resolveLocus('MC1R', { Em: 1, e1: 1 }))).toEqual(['Em/e']);
  });

  it('MC1R decodes every e variant as e, and no variant as E', () => {
    expect(candidates(resolveLocus('MC1R', { e1: 1, e2: 1 }))).toEqual(['e/e']);
    expect(candidates(resolveLocus('MC1R', { e3: 2 }))).toEqual(['e/e']);
    expect(candidates(resolveLocus('MC1R', { eA: 1 }))).toEqual(['E/eA']);
    expect(candidates(resolveLocus('MC1R', {}))).toEqual(['E/E']);
  });

  it('MLPH d1 + d2 → d/d', () => {
    expect(candidates(resolveLocus('MLPH', { d1: 1, d2: 1 }))).toEqual(['d/d']);
  });

  it('single-code genes read 0, 1 and 2 copies as homozygous wild, heterozygous and homozygous variant', () => {
    expect(candidates(resolveLocus('MITF', { sp: 0 }))).toEqual(['+/+']);
    expect(candidates(resolveLocus('MITF', { sp: 1 }))).toEqual(['sp/+']);
    expect(candidates(resolveLocus('MITF', { sp: 2 }))).toEqual(['sp/sp']);
    expect(candidates(resolveLocus('CBD103', { KB: 1 }))).toEqual(['KB/ky']);
  });

  it('RALY counts copies of the non-duplicated allele', () => {
    expect(candidates(resolveLocus('RALY', { '-': 0 }))).toEqual(['dup/dup']);
    expect(candidates(resolveLocus('RALY', { '-': 1 }))).toEqual(['+/dup']);
  });
});

describe('resolveLocus: impossible copy counts', () => {
  it('rejects a code with more than two copies as an invalid count', () => {
    expect(resolveLocus('MITF', { sp: 3 })).toEqual({ status: 'inconsistent', reason: 'invalid-count' });
  });

  it('rejects a copy count that is not a whole number from 0 to 2', () => {
    expect(resolveLocus('MITF', { sp: -1 })).toEqual({ status: 'inconsistent', reason: 'invalid-count' });
    expect(resolveLocus('MITF', { sp: 1.5 })).toEqual({ status: 'inconsistent', reason: 'invalid-count' });
  });

  it('rejects three single variants with no documented placement, whose other placements disagree', () => {
    // TYRP1: all three on one chromosome gives B/b, two and one gives b/b.
    expect(resolveLocus('TYRP1', { bc: 1, bs: 1, be: 1 })).toEqual({ status: 'inconsistent', reason: 'no-phasing' });
    // MC1R: every placement puts two of Em, e1 and eA, which decode differently, on one chromosome.
    expect(resolveLocus('MC1R', { Em: 1, e1: 1, eA: 1 })).toEqual({ status: 'inconsistent', reason: 'no-phasing' });
  });
});

describe('resolveLocus: no documented placement', () => {
  it('reads TYRP1 bc 2 + bs 1, whose only placement is undocumented, as b/b, flagged', () => {
    expect(resolveLocus('TYRP1', { bc: 2, bs: 1 })).toEqual({
      status: 'resolved',
      candidates: [['b', 'b']],
      undocumented: true,
    });
  });

  it('reads TYRP1 bc 2 + bs 2 as b/b, flagged', () => {
    expect(resolveLocus('TYRP1', { bc: 2, bs: 2 })).toEqual({
      status: 'resolved',
      candidates: [['b', 'b']],
      undocumented: true,
    });
  });

  it('reads ASIP a without at, whose only placement is undocumented, as aw/a or a/a, flagged', () => {
    expect(resolveLocus('ASIP', { a: 1, at: 0 })).toEqual({
      status: 'resolved',
      candidates: [['aw', 'a']],
      undocumented: true,
    });
    expect(resolveLocus('ASIP', { a: 2, at: 0 })).toEqual({
      status: 'resolved',
      candidates: [['a', 'a']],
      undocumented: true,
    });
  });

  it('reads MLPH d1 2 + d2 1 as d/d, flagged', () => {
    expect(resolveLocus('MLPH', { d1: 2, d2: 1 })).toEqual({
      status: 'resolved',
      candidates: [['d', 'd']],
      undocumented: true,
    });
  });

  it('reads a placement that keeps each variant apart, when the others would mix effects, flagged', () => {
    // ay+a on one chromosome would decode as a, hiding ay; only ay / a keeps both.
    expect(resolveLocus('ASIP', { ay: 1, a: 1 })).toEqual({
      status: 'resolved',
      candidates: [['ay', 'a']],
      undocumented: true,
    });
    // e1 and e2 both decode alone to e, so e1+e2 / Em is the one placement kept.
    expect(resolveLocus('MC1R', { Em: 1, e1: 1, e2: 1 })).toEqual({
      status: 'resolved',
      candidates: [['Em', 'e']],
      undocumented: true,
    });
  });

  it.each<[string, ColourGene, Readonly<Record<string, number>>]>([
    ['MC1R eA 2 + eH 1', 'MC1R', { eA: 2, eH: 1 }],
    ['MC1R eH 2 + eA 1', 'MC1R', { eH: 2, eA: 1 }],
    ['MC1R Em 2 + eA 1', 'MC1R', { Em: 2, eA: 1 }],
    ['MC1R Em 2 + e1 2', 'MC1R', { Em: 2, e1: 2 }],
    ['ASIP ay 2 + a 2', 'ASIP', { ay: 2, a: 2 }],
  ])('rejects %s: a chromosome would carry variants that decode alone to different alleles', (_name, gene, copies) => {
    expect(resolveLocus(gene, copies)).toEqual({ status: 'inconsistent', reason: 'no-phasing' });
  });

  it('leaves documented placements unflagged, even beside undocumented ones', () => {
    expect(resolveLocus('TYRP1', { bc: 1, bs: 1 })).toEqual({ status: 'resolved', candidates: [['b', 'b']] });
    expect(resolveLocus('TYRP1', { bc: 2, bd: 1 })).toEqual({ status: 'resolved', candidates: [['b', 'b']] });
    expect(resolveLocus('TYRP1', { bd: 1, bc: 1 })).toEqual({
      status: 'resolved',
      candidates: [
        ['B', 'b'],
        ['b', 'b'],
      ],
    });
  });
});

describe('resolveReport', () => {
  it('marks a gene missing from the report as missing, never wild type', () => {
    const resolution = resolveReport(syntheticReport({}, ['TYRP1']));
    expect(resolution.TYRP1).toEqual({ status: 'missing' });
    expect(candidates(resolution.MITF)).toEqual(['+/+']);
  });

  it('marks a gene listed as missing as missing even when some of its rows are present', () => {
    const report = { ...syntheticReport({ 'MC1R Em': 1 }), missingLoci: ['MC1R' as const] };
    expect(resolveReport(report).MC1R).toEqual({ status: 'missing' });
  });

  it('resolves Sample A', async () => {
    const resolution = resolveReport(await sampleReport('a'));
    expect(candidates(resolution.TYRP1)).toEqual(['b/b']);
    expect(candidates(resolution.ASIP)).toEqual(['aw/at']);
    expect(candidates(resolution.CBD103)).toEqual(['KB/KB']);
    expect(candidates(resolution.MC1R)).toEqual(['E/e']);
    expect(candidates(resolution.MITF)).toEqual(['sp/sp']);
    expect(candidates(resolution.MFSD12)).toEqual(['i/i']);
  });

  it('resolves Sample B TYRP1 (bc 2, bd 1) to b/b', async () => {
    expect(candidates(resolveReport(await sampleReport('b')).TYRP1)).toEqual(['b/b']);
  });

  it.each(['c', 'd', 'e'])('resolves Sample %s TYRP1 to b/b and every locus to one pair', async (letter) => {
    const resolution = resolveReport(await sampleReport(letter));
    expect(candidates(resolution.TYRP1)).toEqual(['b/b']);
    for (const locus of Object.values(resolution)) {
      expect(locus.status === 'resolved' && locus.candidates.length).toBe(1);
    }
  });
});
