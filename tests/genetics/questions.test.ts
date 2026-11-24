import { describe, expect, it } from 'vitest';
import { formatPair } from '../../src/genetics/alleles.ts';
import { resolveReport, type GenotypeResolution } from '../../src/genetics/haplotypes.ts';
import { applyAnswers, questionsFor } from '../../src/genetics/questions.ts';
import type { ColourGene } from '../../src/report/loci.ts';
import { sampleReport, syntheticReport } from './reports.ts';

const BD_BC = { 'TYRP1 bd': 1, 'TYRP1 bc': 1, 'CBD103 KB': 1 };

function tyrp1(resolution: GenotypeResolution): string[] {
  const locus = resolution.TYRP1;
  return locus.status === 'resolved' ? locus.candidates.map(formatPair) : [locus.status];
}

const resolved = (copies: Readonly<Record<string, number>>, missing: readonly ColourGene[] = []) =>
  resolveReport(syntheticReport(copies, missing));

describe('questionsFor', () => {
  it('asks the nose question for TYRP1 bd 1 + bc 1, each answer selecting one candidate', () => {
    const [question, ...rest] = questionsFor(resolved(BD_BC));
    expect(rest).toEqual([]);
    expect(question?.id).toBe('nose');
    expect(question?.gene).toBe('TYRP1');
    expect(question?.options.map((option) => [option.answer, option.candidates.map(formatPair)])).toEqual([
      ['black', ['B/b']],
      ['brown', ['b/b']],
    ]);
  });

  it('asks it on a beige dog too, whose nose still shows TYRP1', () => {
    expect(questionsFor(resolved({ ...BD_BC, 'MC1R e1': 2 })).map((question) => question.id)).toEqual(['nose']);
  });

  it('asks nothing when TYRP1 has one candidate (Sample B: bc 2 + bd 1)', async () => {
    expect(questionsFor(resolveReport(await sampleReport('b')))).toEqual([]);
  });

  it('asks nothing for ASIP ambiguity, which has no reliable observable', () => {
    expect(questionsFor(resolved({ 'ASIP ay': 1, 'ASIP at': 1 }))).toEqual([]);
  });

  it.each<[string, Readonly<Record<string, number>>, readonly ColourGene[]]>([
    ['dilute (blue or lilac nose)', { ...BD_BC, 'MLPH d1': 2 }, []],
    ['albino (pink nose)', { ...BD_BC, 'SLC45A2 cal': 2 }, []],
    ['cocoa (brown nose either way)', { ...BD_BC, 'HPS3 co': 2 }, []],
    ['MLPH missing (nose unknown)', BD_BC, ['MLPH']],
  ])('asks nothing when the nose cannot separate the candidates: %s', (_name, copies, missing) => {
    expect(questionsFor(resolved(copies, missing))).toEqual([]);
  });
});

describe('applyAnswers', () => {
  it('keeps b/b for "brown" and B/b for "black"', () => {
    const resolution = resolved(BD_BC);
    expect(tyrp1(applyAnswers(resolution, { nose: 'brown' }))).toEqual(['b/b']);
    expect(tyrp1(applyAnswers(resolution, { nose: 'black' }))).toEqual(['B/b']);
  });

  it('keeps every candidate without an answer', () => {
    expect(tyrp1(applyAnswers(resolved(BD_BC), {}))).toEqual(['B/b', 'b/b']);
  });

  it('ignores an answer to a question the dog has no reason to be asked', () => {
    const resolution = resolved({ ...BD_BC, 'MLPH d1': 2 });
    expect(applyAnswers(resolution, { nose: 'brown' })).toEqual(resolution);
  });
});
