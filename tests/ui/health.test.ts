// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { analyseHealth } from '../../src/health/health.ts';
import type { HealthRow, Inheritance, Report, Sex } from '../../src/report/types.ts';
import { healthRow } from '../health/rows.ts';
import { ok, openPage, pdf, sampleReport } from './app.ts';

let a: Report;
let b: Report;

beforeAll(async () => {
  [a, b] = await Promise.all([sampleReport('a'), sampleReport('b')]);
});

/** A copy of a sample with its own health rows, sex and short-tail copies, and no kit ID. */
function withHealth(base: Report, name: string, health: readonly HealthRow[], changes: Partial<Report> = {}): Report {
  return { ...base, name, kitIdHash: null, health, ...changes };
}

async function pairOf(first: Report, second: Report) {
  const page = openPage({ '1.pdf': ok(first), '2.pdf': ok(second) });
  await page.app.load(0, pdf('1.pdf'));
  await page.app.load(1, pdf('2.pdf'));
  return page;
}

/** The health table's rows as [condition cell, at risk, carrier] text. */
function healthRows(root: HTMLElement): string[][] {
  return [...root.querySelectorAll('.health tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
  );
}

const XR = (copies: number) => healthRow('Hemophilia A', copies, 'XR', { gene: 'F8' });

describe('the health section', () => {
  it('shows CDDY and DM for Sample A × Sample B, and counts the rest clear in both', async () => {
    const { root } = await pairOf(a, b);
    const rows = healthRows(root);
    const cddy = rows.find(([condition]) => condition?.startsWith('Chondrodystrophy'));
    const dm = rows.find(([condition]) => condition?.startsWith('Degenerative Myelopathy'));
    expect(cddy?.slice(1)).toEqual(['100% (all)', '–']);
    expect(cddy?.[0]).toContain('Dominant: one copy raises the risk');
    expect(dm?.slice(1)).toEqual(['0%', '50% (1 in 2)']);
    expect(dm?.[0]).toContain('Recessive: two copies needed');
    const clear = analyseHealth(a, b).clearInBoth.length;
    expect(root.querySelector('.health .clear')?.textContent).toBe(`Clear in both parents: ${clear} other conditions.`);
    expect(root.querySelector('.warnings')).toBeNull();
  });

  it('gives an X-linked condition Sons and Daughters sub-rows', async () => {
    const dam = withHealth(b, 'Sample F', [XR(1)], { sex: 'female' });
    const sire = withHealth(a, 'Sample M', [XR(0)], { sex: 'male' });
    const { root } = await pairOf(sire, dam);
    expect(healthRows(root)).toEqual([
      ['Hemophilia AX-linked recessive: sons need one copy, daughters two', '', ''],
      ['Sons', '50% (1 in 2)', '–'],
      ['Daughters', '0%', '50% (1 in 2)'],
    ]);
  });

  const condition = (inheritance: Inheritance | null) => (copies: number) => healthRow('Some Condition', copies, inheritance);
  it.each<{ case: string; rows: readonly [HealthRow, HealthRow]; sexes: readonly [Sex | null, Sex | null]; mode: string; reason: string }>([
    {
      case: 'no inheritance given',
      rows: [condition(null)(1), condition(null)(0)],
      sexes: ['female', 'male'],
      mode: 'Inheritance not known',
      reason: "This condition's inheritance isn't known, so the odds can't be worked out.",
    },
    {
      case: 'different inheritance',
      rows: [condition('AR')(1), condition('AD')(0)],
      sexes: ['female', 'male'],
      mode: 'Inheritance not known',
      reason: 'The two reports give different inheritance, so the odds are unknown.',
    },
    {
      case: 'X-linked, same sex',
      rows: [condition('XR')(1), condition('XR')(0)],
      sexes: ['female', 'female'],
      mode: 'X-linked recessive: sons need one copy, daughters two',
      reason: 'Both reports give the same sex, so the odds are unknown.',
    },
    {
      case: 'mitochondrial, same sex',
      rows: [condition('MT')(1), condition('MT')(0)],
      sexes: ['male', 'male'],
      mode: 'Mitochondrial: passed on by the dam only',
      reason: 'Both reports give the same sex, so the odds are unknown.',
    },
    {
      case: 'X-linked, neither sex read',
      rows: [condition('XD')(1), condition('XD')(0)],
      sexes: [null, null],
      mode: 'X-linked dominant: one copy raises the risk',
      reason: "Neither report's sex could be read, so the odds are unknown.",
    },
  ])('marks the odds unknown, with the reason, for $case', async ({ rows, sexes, mode, reason }) => {
    const first = withHealth(a, 'Sample F', [rows[0]], { sex: sexes[0] });
    const second = withHealth(b, 'Sample G', [rows[1]], { sex: sexes[1] });
    const { root } = await pairOf(first, second);
    expect(healthRows(root)).toEqual([[`Some Condition${mode}${reason}`, 'unknown', '']]);
  });

  it('lists a condition tested in one parent only, with that parent’s result', async () => {
    const first = withHealth(a, 'Sample A', [healthRow('Sensory Ataxic Neuropathy', 0, 'MT')], { sex: 'male' });
    const second = withHealth(b, 'Sample B', [], { sex: 'female' });
    const { root } = await pairOf(first, second);
    expect(root.querySelector('.health .one-parent')?.textContent).toContain('Sensory Ataxic Neuropathy: tested in Parent 1 only: Clear');
  });

  it.each([
    { sire: 'untested', sireHealth: [] },
    { sire: 'at risk', sireHealth: [healthRow('Mito Disease', 1, 'MT')] },
  ])('keeps an MT condition clear in the dam as a no-risk row, with the sire $sire', async ({ sireHealth }) => {
    const dam = withHealth(b, 'Sample F', [healthRow('Mito Disease', 0, 'MT')], { sex: 'female' });
    const sire = withHealth(a, 'Sample M', sireHealth, { sex: 'male' });
    const { root } = await pairOf(sire, dam);
    expect(healthRows(root)).toEqual([['Mito DiseaseMitochondrial: passed on by the dam only', '0%', '–']]);
    expect(root.querySelector('.health .clear')?.textContent).toBe('Clear in both parents: 0 other conditions.');
  });

  it('puts the bobtail and carrier × carrier warnings in the panel above the colour results', async () => {
    const prcd = (copies: number) => healthRow('Progressive Rod-Cone Degeneration (prcd-PRA)', copies, 'AR', { gene: 'PRCD' });
    const first = withHealth(a, 'Sample T', [prcd(1)], { shortTail: 1 });
    const second = withHealth(b, 'Sample U', [prcd(1)], { shortTail: 1 });
    const { root } = await pairOf(first, second);
    const panel = root.querySelector('.warnings');
    const items = [...(panel?.querySelectorAll('.err') ?? [])].map((item) => item.textContent ?? '');
    expect(items.some((item) => item.includes('Bobtail × bobtail') && item.includes('About 1 in 4 embryos'))).toBe(true);
    expect(items.some((item) => item.includes('Progressive Rod-Cone Degeneration (prcd-PRA): 25% (1 in 4)'))).toBe(true);
    const outcomes = [...root.querySelectorAll('h3')].find((heading) => heading.textContent === 'Most likely puppies');
    expect(panel && outcomes && panel.compareDocumentPosition(outcomes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('warns about affected daughters from an X-linked variant both parents carry', async () => {
    const dam = withHealth(b, 'Sample F', [XR(1)], { sex: 'female' });
    const sire = withHealth(a, 'Sample M', [XR(1)], { sex: 'male' });
    const { root } = await pairOf(dam, sire);
    expect(root.querySelector('.warnings')?.textContent).toContain('Hemophilia A: 50% (1 in 2) of daughters');
  });

  it('warns when both parents carry a variant of unknown inheritance', async () => {
    const odd = (copies: number) => healthRow('Unlisted Condition', copies, null, { gene: 'XYZ1' });
    const { root } = await pairOf(withHealth(a, 'Sample A', [odd(1)]), withHealth(b, 'Sample B', [odd(1)]));
    expect(root.querySelector('.warnings')?.textContent).toContain('Unlisted Condition: inheritance unknown');
  });

  it('renders markup in a condition name as literal text', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const row = (copies: number) => healthRow(hostile, copies, 'AR', { gene: 'EVIL' });
    const { root } = await pairOf(withHealth(a, 'Sample A', [row(1)]), withHealth(b, 'Sample B', [row(1)]));
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.health')?.textContent).toContain(hostile);
    expect(root.querySelector('.warnings')?.textContent).toContain(hostile);
  });
});
