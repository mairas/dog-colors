import { describe, expect, it } from 'vitest';
import { FIXTURE_LETTERS } from '../../scripts/extract-fixtures.ts';
import { READER_VERSION } from '../../src/report/version.ts';
import { fixtureReport } from './fixtures.ts';
import { pdfjsDistVersion } from './pdfjsVersion.ts';

const BUMP_RULE = [
  'The reader snapshot changed.',
  'Bump READER_VERSION in src/report/version.ts when the parsed fixtures changed in a way saved reports would share,',
  'or when the local real-sample comparison in tests/report/real-pdfs.local.test.ts changed;',
  'then re-record this snapshot with ./run test -u and the local copy with ./run record-readings.',
  'A pdfjs-dist update that changes neither re-records this snapshot with ./run test -u and no bump,',
  'and is merged only after the owner has run the local tests.',
].join(' ');

describe('reader version', () => {
  it('matches the snapshot of the version, pdfjs-dist and the parsed fixtures (on failure, follow the bump rule)', async () => {
    const fixtures = Object.fromEntries(
      await Promise.all(FIXTURE_LETTERS.map(async (letter) => [letter, await fixtureReport(letter)] as const)),
    );
    const snapshot = { readerVersion: READER_VERSION, pdfjsDist: pdfjsDistVersion(), fixtures };
    await expect(`${JSON.stringify(snapshot, null, 2)}\n`, BUMP_RULE).toMatchFileSnapshot(
      './__snapshots__/reader-version.json',
    );
  });
});
