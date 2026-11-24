// Reads the real sample reports through pdf.js. They live only in the
// git-ignored _local/samples, so this suite skips itself where they are
// absent, as in CI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_LETTERS,
  readManifest,
  SAMPLES_DIRECTORY,
} from '../../scripts/extract-fixtures.ts';
import { parseReport } from '../../src/report/parse.ts';
import { readReport } from '../../src/report/read.ts';
import type { Report } from '../../src/report/types.ts';
import { fixtureText, loadFixture } from './fixtures.ts';

const manifest = readManifest(SAMPLES_DIRECTORY);

async function readSample(relative: string): ReturnType<typeof readReport> {
  return readReport(new Blob([readFileSync(join(SAMPLES_DIRECTORY, relative))]));
}

async function fixtureReport(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

describe.skipIf(manifest === null)('real sample reports', () => {
  it.each(FIXTURE_LETTERS)(
    'sample %s gives the copy counts, header fields and health-row count of its fixture',
    async (letter) => {
      const result = await readSample(manifest?.fixtures[letter] ?? '');
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const real = result.report;
      const fixture = await fixtureReport(letter);
      expect(real.format).toBe(fixture.format);
      expect(real.colour).toEqual(fixture.colour);
      expect(real.missingLoci).toEqual(fixture.missingLoci);
      expect(real.shortTail).toBe(fixture.shortTail);
      expect(real.sex).toBe(fixture.sex);
      expect(real.breed).toBe(fixture.breed);
      expect(real.name).not.toBeNull();
      expect(real.kitIdHash).toMatch(/^[0-9a-f]{64}$/);
      expect(real.health).toHaveLength(loadFixture(letter).healthRowCount);
      for (const row of fixture.health) {
        expect(real.health).toContainEqual(row);
      }
    },
  );

  // Numbered rather than named: the file names identify the dogs.
  const rejections = Object.entries(manifest?.rejections ?? {}).map(
    ([relative, kind], index) => [index + 1, kind, relative] as const,
  );
  it.each(rejections)('rejected sample %i is rejected as %s', async (_number, kind, relative) => {
    expect(await readSample(relative)).toEqual({ ok: false, kind });
  });
});
