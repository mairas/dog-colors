import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCatalogue } from '../../scripts/build-conditions.ts';
import { catalogueInheritance, findCondition } from '../../src/health/conditions.ts';
import { parseReport } from '../../src/report/parse.ts';
import type { Report } from '../../src/report/types.ts';
import { fixtureText } from '../report/fixtures.ts';
import { healthRow } from './rows.ts';

const MODES = ['AR', 'AD', 'XR', 'XD', 'MT'];

async function sample(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

describe('buildCatalogue', () => {
  it('keeps one entry per condition, with only its name, gene, variant and mode, sorted by name', () => {
    const first = [healthRow('Zeta Disease', 1, 'AR'), healthRow('Alpha Disease', 2, 'AD', { gene: 'ALPHA', knownInBreed: true })];
    const second = [healthRow('Zeta Disease', 0, 'AR'), healthRow('Mid Disease', 0, 'XR', { variant: 'Deletion' })];
    expect(
      buildCatalogue([
        { format: 'current', health: first },
        { format: 'current', health: second },
      ]),
    ).toEqual([
      { name: 'Alpha Disease', gene: 'ALPHA', variant: 'G>A', inheritance: 'AD' },
      { name: 'Mid Disease', gene: 'GENE', variant: 'Deletion', inheritance: 'XR' },
      { name: 'Zeta Disease', gene: 'GENE', variant: 'G>A', inheritance: 'AR' },
    ]);
  });

  it('ignores older-format reports, which carry no inheritance', () => {
    expect(buildCatalogue([{ format: 'mydogdna', health: [healthRow('Zeta Disease', 1, null)] }])).toEqual([]);
  });

  it('refuses two reports that give one condition different modes', () => {
    expect(() =>
      buildCatalogue([
        { format: 'current', health: [healthRow('Zeta Disease', 0, 'AR')] },
        { format: 'current', health: [healthRow('Zeta Disease', 0, 'AD')] },
      ]),
    ).toThrow(/Zeta Disease/);
  });
});

describe('the committed catalogue', () => {
  const entries = JSON.parse(
    readFileSync(new URL('../../src/health/conditions.json', import.meta.url), 'utf8'),
  ) as readonly Record<string, unknown>[];

  it('holds panel facts only: name, gene, risk variant and inheritance mode', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(['gene', 'inheritance', 'name', 'variant']);
      expect(MODES).toContain(entry.inheritance);
      for (const field of ['name', 'gene', 'variant']) {
        expect(typeof entry[field]).toBe('string');
        expect(entry[field]).not.toBe('');
      }
    }
  });

  it('has one entry per condition', () => {
    const keys = entries.map((entry) => JSON.stringify([entry.name, entry.gene, entry.variant]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each current-format fixture condition the mode its report prints', async () => {
    for (const letter of ['a', 'b', 'c']) {
      for (const row of (await sample(letter)).health) {
        expect(catalogueInheritance(row), row.name).toBe(row.inheritance);
      }
    }
  });
});

describe('findCondition', () => {
  const vwf1 = healthRow("von Willebrand's Disease, type 1", 0, 'AD', { gene: 'VWF' });
  const vwf3 = healthRow("von Willebrand's Disease, type 3 (Discovered in the Kooiker Hound)", 0, 'AR', { gene: 'VWF' });

  it('matches on name, gene and variant, keeping conditions that share a gene and variant apart', () => {
    expect(findCondition(healthRow(vwf3.name, 1, null, { gene: 'VWF' }), [vwf1, vwf3])).toBe(vwf3);
    expect(findCondition(healthRow(vwf1.name, 1, null, { gene: 'VWF' }), [vwf1, vwf3])).toBe(vwf1);
  });

  it('ignores letter case in the name', () => {
    expect(findCondition(healthRow("Von Willebrand's disease, type 1", 1, null, { gene: 'VWF' }), [vwf1, vwf3])).toBe(vwf1);
  });

  it('matches a "Confidential" row on the name alone, whatever the other report prints', () => {
    const current = healthRow('Hypophosphatasia', 0, 'AR', { gene: 'Confidential', variant: '-' });
    const named = healthRow('Progressive Retinal Atrophy (Discovered in the Lhasa Apso)', 0, 'AR', { gene: 'IMPG2', variant: 'Insertion' });
    const older = healthRow(named.name, 1, null, { gene: 'Confidential', variant: '-' });
    expect(findCondition(healthRow('Hypophosphatasia', 1, null, { gene: 'Confidential', variant: '-' }), [current])).toBe(current);
    expect(findCondition(older, [current, named])).toBe(named);
  });

  it('matches a row whose variant is withheld as "-" on its name and gene', () => {
    const current = healthRow('Thrombopathia (Discovered in the Eskimo Spitz)', 0, 'AR', { gene: 'RASGRP1', variant: 'Insertion' });
    expect(findCondition(healthRow(current.name, 0, null, { gene: 'RASGRP1', variant: '-' }), [current])).toBe(current);
    expect(findCondition(healthRow(current.name, 0, null, { gene: 'OTHER', variant: '-' }), [current])).toBeUndefined();
  });

  it('does not match rows that print different variants under one name', () => {
    const current = healthRow('Dental-Skeletal-Retinal Anomaly (Discovered in the Cane Corso)', 0, 'AR', { gene: 'MIA3', variant: 'Deletion' });
    expect(findCondition(healthRow(current.name, 0, null, { gene: 'MIA3', variant: 'I>S' }), [current])).toBeUndefined();
  });

  it('does not match different names', () => {
    expect(findCondition(healthRow('Hypophosphatasia', 0, null, { gene: 'Confidential', variant: '-' }), [vwf1])).toBeUndefined();
  });
});

describe('catalogueInheritance', () => {
  it('gives an older-format row the mode of its condition, matching withheld genes by name', () => {
    expect(catalogueInheritance(healthRow('Degenerative Myelopathy', 1, null, { gene: 'SOD1', variant: 'G>A' }))).toBe('AR');
    expect(
      catalogueInheritance(healthRow('Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)', 0, null, { gene: 'Confidential', variant: '-' })),
    ).toBe('AR');
  });

  it('is null for a condition the catalogue lacks', () => {
    expect(catalogueInheritance(healthRow('No Such Condition', 0, null))).toBeNull();
  });
});
