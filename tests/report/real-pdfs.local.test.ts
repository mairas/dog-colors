// Reads the real sample reports through pdf.js. They live only in the
// git-ignored _local/samples, so this suite skips itself where they are
// absent, as in CI.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_LETTERS,
  readManifest,
  SAMPLES_DIRECTORY,
} from '../../scripts/extract-fixtures.ts';
import { readReport } from '../../src/report/read.ts';
import type { Report } from '../../src/report/types.ts';
import { READER_VERSION } from '../../src/report/version.ts';
import { fixtureReport, loadFixture } from './fixtures.ts';
import { pdfjsDistVersion } from './pdfjsVersion.ts';

const manifest = readManifest(SAMPLES_DIRECTORY);

async function readSample(relative: string): ReturnType<typeof readReport> {
  return readReport(new Blob([readFileSync(join(SAMPLES_DIRECTORY, relative))]));
}

async function sampleReport(letter: string): Promise<Report> {
  const result = await readSample(manifest?.fixtures[letter] ?? '');
  if (!result.ok) {
    throw new Error(`sample ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

// The full reports identify the dogs, so the recorded copy stays beside the samples.
// It is keyed by reader version alone, so a pdfjs-dist update is compared with the
// copy the previous pdfjs-dist recorded.
const READING_NAME = `readings/${READER_VERSION}.json`;
const READING_PATH = join(SAMPLES_DIRECTORY, READING_NAME);
const RECORDING = process.env.RECORD_READINGS === '1';
const PDFJS_DIST = pdfjsDistVersion();

type Reading = Readonly<Record<string, unknown>>;

interface RecordedCopy {
  readonly pdfjsDist: string;
  readonly readings: Readonly<Record<string, Reading>>;
}

const asReading = (report: Report): Reading => JSON.parse(JSON.stringify(report)) as Reading;

const recordedCopy: RecordedCopy | null =
  !RECORDING && existsSync(READING_PATH) ? (JSON.parse(readFileSync(READING_PATH, 'utf8')) as RecordedCopy) : null;

const pdfjsNote =
  recordedCopy === null || recordedCopy.pdfjsDist === PDFJS_DIST
    ? ''
    : ` (recorded with pdfjs-dist ${recordedCopy.pdfjsDist}, read with ${PDFJS_DIST})`;

/** Names the fields that differ, without their values, which identify the dog. */
function differingFields(actual: Reading, recorded: Reading): string[] {
  const fields = new Set([...Object.keys(actual), ...Object.keys(recorded)]);
  return [...fields].filter((field) => !isDeepStrictEqual(actual[field], recorded[field])).sort();
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

  async function healthRows(letter: string): Promise<Report['health']> {
    return (await sampleReport(letter)).health;
  }

  it('reads the same health conditions from samples A and B, one panel from two producers', async () => {
    // Sorted: a report lists the dog's carrier and at-risk results first.
    const conditions = async (letter: string) =>
      (await healthRows(letter)).map(({ name, gene, variant }) => `${name} | ${gene} | ${variant}`).sort();
    const a = await conditions('a');
    expect(a.length).toBeGreaterThan(0);
    expect(await conditions('b')).toEqual(a);
  });

  it('names each gene and variant alike in samples A and C, whose pages break differently', async () => {
    const namesByVariant = async (letter: string) => {
      const names = new Map<string, string[]>();
      for (const { name, gene, variant } of await healthRows(letter)) {
        names.set(`${gene} | ${variant}`, [...(names.get(`${gene} | ${variant}`) ?? []), name].sort());
      }
      return names;
    };
    const a = await namesByVariant('a');
    const c = await namesByVariant('c');
    const shared = [...a.keys()].filter((key) => c.has(key));
    expect(shared.length).toBeGreaterThan(0);
    expect(Object.fromEntries(shared.map((key) => [key, c.get(key)]))).toEqual(
      Object.fromEntries(shared.map((key) => [key, a.get(key)])),
    );
  });

  // Numbered rather than named: the file names identify the dogs.
  const rejections = Object.entries(manifest?.rejections ?? {}).map(
    ([relative, kind], index) => [index + 1, kind, relative] as const,
  );
  it.each(rejections)('rejected sample %i is rejected as %s', async (_number, kind, relative) => {
    expect(await readSample(relative)).toEqual({ ok: false, kind });
  });
});

describe.skipIf(manifest === null)(`real sample reports against their recorded copy, ${READING_NAME}`, () => {
  it.runIf(RECORDING)('records every sample’s full report and the pdfjs-dist version for this reader', async () => {
    const readings = Object.fromEntries(
      await Promise.all(FIXTURE_LETTERS.map(async (letter) => [letter, await sampleReport(letter)] as const)),
    );
    const copy = { pdfjsDist: PDFJS_DIST, readings };
    mkdirSync(dirname(READING_PATH), { recursive: true });
    writeFileSync(READING_PATH, `${JSON.stringify(copy, null, 2)}\n`);
  });

  it.skipIf(RECORDING).each(FIXTURE_LETTERS)(`sample %s reads as its recorded copy${pdfjsNote}`, async (letter) => {
    if (recordedCopy === null) {
      expect.fail(`No recorded copy for reader version ${READER_VERSION}: record it with ./run record-readings.`);
    }
    const recorded = recordedCopy.readings[letter];
    if (recorded === undefined) {
      expect.fail(`The recorded copy holds no sample ${letter}: record it again with ./run record-readings.`);
    }
    const update =
      pdfjsNote === ''
        ? ''
        : `The copy was recorded with pdfjs-dist ${recordedCopy.pdfjsDist} and ${PDFJS_DIST} is installed; ` +
          'a pdfjs-dist update that changes a reading needs the bump too. ';
    expect(
      differingFields(asReading(await sampleReport(letter)), recorded),
      `Sample ${letter} reads differently from its recorded copy in these fields. ${update}` +
        'If the change is accepted, bump READER_VERSION in src/report/version.ts and record with ./run record-readings.',
    ).toEqual([]);
  });
});
