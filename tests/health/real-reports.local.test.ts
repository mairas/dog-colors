// Health analysis over the real sample reports. They live only in the
// git-ignored _local/samples, so this suite skips itself where they are
// absent, as in CI.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { readManifest, SAMPLES_DIRECTORY } from '../../scripts/extract-fixtures.ts';
import { buildCatalogue, CATALOGUE_PATH, readSamples, serialiseCatalogue } from '../../scripts/build-conditions.ts';
import type { Report } from '../../src/report/types.ts';

const manifest = readManifest(SAMPLES_DIRECTORY);

describe.skipIf(manifest === null)('health analysis of the real sample reports', () => {
  let reports: Report[] = [];

  beforeAll(async () => {
    reports = (await readSamples(SAMPLES_DIRECTORY)).map(({ report }) => report);
  });

  it('commits the catalogue the current-format samples give', () => {
    expect(readFileSync(CATALOGUE_PATH, 'utf8')).toBe(serialiseCatalogue(buildCatalogue(reports)));
  });
});
