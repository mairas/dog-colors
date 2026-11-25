// Health analysis over the real sample reports. They live only in the
// git-ignored _local/samples, so this suite skips itself where they are
// absent, as in CI.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalogue, CATALOGUE_PATH, readSamples, serialiseCatalogue } from '../../scripts/build-conditions.ts';
import { readManifest, SAMPLES_DIRECTORY } from '../../scripts/extract-fixtures.ts';
import { analyseHealth } from '../../src/health/health.ts';
import type { Report } from '../../src/report/types.ts';

const manifest = readManifest(SAMPLES_DIRECTORY);

describe.skipIf(manifest === null)('health analysis of the real sample reports', () => {
  const reports = new Map<string, Report>();

  beforeAll(async () => {
    for (const { letter, report } of await readSamples(SAMPLES_DIRECTORY)) {
      reports.set(letter, report);
    }
  });

  function report(letter: string): Report {
    const found = reports.get(letter);
    if (!found) {
      throw new Error(`sample ${letter} was not read`);
    }
    return found;
  }

  const lettersOf = (format: Report['format']) => [...reports.keys()].filter((letter) => report(letter).format === format);

  it('commits the catalogue the current-format samples give', () => {
    expect(readFileSync(CATALOGUE_PATH, 'utf8')).toBe(serialiseCatalogue(buildCatalogue([...reports.values()])));
  });

  it('Sample A × Sample B: clear count, listed and one-parent conditions add up to the distinct conditions', () => {
    const [a, b] = [report('a'), report('b')];
    const key = ({ name, gene, variant }: { name: string; gene: string; variant: string }) => JSON.stringify([name, gene, variant]);
    const distinct = new Set([...a.health, ...b.health].map(key)).size;
    const analysis = analyseHealth(a, b);
    expect(analysis.clearInBoth.length + analysis.rows.length + analysis.oneParentOnly.length).toBe(distinct);
  });

  it('pairs every confidential and VWF G>A condition of a current-format report with an older-format one', () => {
    const current = lettersOf('current');
    const older = lettersOf('mydogdna');
    expect(current.length).toBeGreaterThan(0);
    expect(older.length).toBeGreaterThan(0);
    for (const c of current) {
      const watched = report(c).health.filter(
        (row) => row.gene === 'Confidential' || (row.gene === 'VWF' && row.variant === 'G>A'),
      );
      expect(watched.filter((row) => row.gene === 'VWF').map((row) => row.inheritance)).toEqual(['AD', 'AR']);
      for (const o of older) {
        for (const analysis of [analyseHealth(report(c), report(o)), analyseHealth(report(o), report(c))]) {
          const listed = [...analysis.rows, ...analysis.clearInBoth];
          for (const row of watched) {
            const found = listed.filter((item) => item.name === row.name);
            expect(found, `${c} × ${o}: ${row.name}`).toHaveLength(1);
            expect(found[0]?.inheritance).toBe(row.inheritance);
            expect(analysis.oneParentOnly.map(({ name }) => name)).not.toContain(row.name);
          }
        }
      }
    }
  });

  it('pairs the two aliased conditions of a current-format report with an older-format one', () => {
    const dsra = 'Dental-Skeletal-Retinal Anomaly (Discovered in the Cane Corso)';
    const lgmd = 'Limb-girdle Muscular Dystrophy (Discovered in the Boston Terrier)';
    const paired = [dsra, `${lgmd} Variant 1`];
    for (const c of lettersOf('current')) {
      for (const o of lettersOf('mydogdna')) {
        for (const analysis of [analyseHealth(report(c), report(o)), analyseHealth(report(o), report(c))]) {
          const unpaired = analysis.oneParentOnly.map(({ name }) => name).filter((name) => [lgmd, ...paired].includes(name));
          expect(unpaired, `${c} × ${o}`).toEqual([]);
          const listed = [...analysis.rows, ...analysis.clearInBoth];
          for (const name of paired) {
            expect(listed.filter((item) => item.name === name), `${c} × ${o}: ${name}`).toHaveLength(1);
          }
        }
      }
    }
  });
});
