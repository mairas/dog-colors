import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoIdentifiers,
  buildFixture,
  FIXTURE_LETTERS,
  fixturePath,
  HEALTH_FIXTURE_LETTERS,
  identifiersOf,
  readManifest,
  serialiseFixture,
  SAMPLES_DIRECTORY,
} from '../../scripts/extract-fixtures.ts';
import { readHeader } from '../../src/report/header.ts';
import { findHealthRows } from '../../src/report/parse.ts';
import { extractPdfText, type Line, type PdfText } from '../../src/report/pdfText.ts';
import { loadFixture } from './fixtures.ts';
import { line } from './lines.ts';

const SOURCE_PATH = '/samples/Rexie/Kennelname Rexie Example - Rex.pdf';

const traitRowSaying = (result: string): Line =>
  line(6, 550, [43, 'Tan Points'], [307, 'ASIP'], [365, 'at'], [417, '1'], [455, result]);

function source(extra: readonly Line[] = []): PdfText {
  return {
    info: { creator: 'owner 0b0e8c39-6d47-4c4e-a2d4-58d1e3f5b7a1', producer: 'wisdom-pdf-server' },
    lines: [
      line(1, 799, [34, 'Rex']),
      line(1, 771, [34, 'Breed: Spanish Water Dog'], [210, 'Registration number: FI12345/20']),
      line(1, 759, [34, 'Microchip number: 123456789012345'], [210, 'Test date: 2019-03-14']),
      line(1, 747, [34, 'Birth date: 2015-06-21'], [210, 'ID kit: ABCDEFG']),
      line(1, 694, [34, 'Rex’s Profile']),
      line(1, 622, [34, 'Registered name'], [209, 'Sex']),
      line(1, 610, [34, 'Kennelname Rexie Example'], [209, 'M']),
      line(1, 586, [34, 'Owner reported breed'], [209, 'Date of birth']),
      line(1, 574, [34, 'Spanish Water Dog'], [209, '2015-06-21']),
      line(1, 550, [34, 'Microchip number']),
      line(1, 538, [34, '123456789012345']),
      line(1, 526, [34, 'Country of Origin']),
      line(1, 514, [34, 'ZZ']),
      line(1, 503, [33, 'Genetic Diversity']),
      line(1, 467, [34, 'Rex’s Percentage of Heterozygosity']),
      line(1, 13, [34, 'Wisdom Panel™ Genetics Report'], [519, 'page 1 of 27']),
      line(6, 602, [43, 'Fawn'], [307, 'ASIP'], [365, 'ay'], [417, '0'], [455, 'No effect']),
      line(6, 576, [43, 'Rex has a lovely coat'], [400, 'ignored']),
      line(12, 654, [43, 'Genetic Condition'], [302, 'Gene'], [356, 'Risk Variant'], [421, 'Copies'], [467, 'Inheritance'], [529, 'Result']),
      line(12, 627, [43, 'Degenerative Myelopathy'], [301, 'SOD1'], [370, 'G>A'], [431, '1'], [482, 'AR'], [529, 'Carrier']),
      line(12, 600, [43, 'Alexander Disease'], [301, 'GFAP'], [370, 'G>A'], [431, '0'], [482, 'AR'], [531, 'Clear']),
      ...extra,
    ],
  };
}

describe('extract-fixtures', () => {
  it('replaces every identifier with a placeholder and keeps only header, colour and chosen health rows', () => {
    const text = source();
    const fixture = buildFixture(text, 'a');
    const serialised = serialiseFixture(fixture, identifiersOf(text, SOURCE_PATH));
    expect(serialised).not.toMatch(/Rex|Kennelname|123456789012345|ABCDEFG|FI12345|2015-06-21|2019-03-14|ZZ/);
    const header = readHeader(fixture.lines);
    expect(header).toMatchObject({
      profileName: 'Sample A',
      registeredName: 'Sample A Registered',
      microchip: '000000000000000',
      kitId: 'KIT000A',
      registration: 'XX00000/00',
      birthDate: '2000-01-01',
      testDate: '2000-01-02',
      countryOfOrigin: 'XX',
    });
    const texts = fixture.lines.flatMap((kept) => kept.cells.map((cell) => cell.text));
    expect(texts).toContain('ASIP');
    expect(texts).toContain('Degenerative Myelopathy');
    expect(texts).not.toContain('Alexander Disease');
    expect(texts).not.toContain('Genetic Diversity');
    expect(fixture.healthRowCount).toBe(2);
  });

  it('keeps no health rows for the other owners’ dogs', () => {
    const fixture = buildFixture(source(), 'd');
    expect(findHealthRows(fixture.lines, 'current')).toEqual([]);
    expect(fixture.healthRowCount).toBe(2);
  });

  it('refuses to write a fixture that still holds an identifier in another letter case', () => {
    const text = source([
      line(12, 573, [43, 'Degenerative Myelopathy'], [301, 'SOD1'], [370, 'abcdefg'], [431, '0'], [482, 'AR'], [531, 'Clear']),
    ]);
    expect(() => serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH))).toThrow(
      /identifier/,
    );
  });

  it('refuses to write a fixture that holds one word of the registered name', () => {
    const text = source([traitRowSaying('Kennelname')]);
    expect(() => serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH))).toThrow(
      /identifier/,
    );
  });

  it('refuses to write a fixture that holds the country of origin in another letter case', () => {
    const text = source([traitRowSaying('Bred in zz')]);
    expect(() => serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH))).toThrow(
      /identifier/,
    );
  });

  it('refuses to write a fixture that holds a word of the source file name', () => {
    const text = source([traitRowSaying('Seen in Example dogs')]);
    expect(() => serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH))).toThrow(
      /identifier/,
    );
  });

  it('refuses to write a fixture that holds an ID from the PDF metadata', () => {
    const text = source([traitRowSaying('0b0e8c39-6d47-4c4e-a2d4-58d1e3f5b7a1')]);
    expect(() => serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH))).toThrow(
      /identifier/,
    );
  });

  it('treats the ID in a browser blob-URL file name as an identifier, but not its common words', () => {
    const blobPath = '/samples/Rexie/blob-https-www.wisdompanel.com5f2a9c1e-0d3b-4e8a-9c7f-1b2d3e4f5a6b.pdf';
    const kinds = identifiersOf(source(), blobPath).filter(({ kind }) => kind !== 'file name');
    expect(kinds.map(({ value }) => value.toLowerCase())).not.toContain('blob');
    expect(kinds.map(({ value }) => value.toLowerCase())).not.toContain('https');
    const leaky = source([traitRowSaying('5f2a9c1e-0d3b-4e8a-9c7f-1b2d3e4f5a6b')]);
    expect(() => serialiseFixture(buildFixture(leaky, 'a'), identifiersOf(leaky, blobPath))).toThrow(/identifier/);
    const clean = source([traitRowSaying('Blob https www')]);
    expect(() => serialiseFixture(buildFixture(clean, 'a'), identifiersOf(clean, blobPath))).not.toThrow();
  });

  it('names the kind of identifier it found, never its value', () => {
    const text = source([traitRowSaying('Kennelname')]);
    try {
      serialiseFixture(buildFixture(text, 'a'), identifiersOf(text, SOURCE_PATH));
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('Kennelname');
    }
  });
});

describe('committed fixtures', () => {
  it.each(FIXTURE_LETTERS)('sample %s carries only placeholder identifiers', (letter) => {
    const header = readHeader(loadFixture(letter).lines);
    const upper = letter.toUpperCase();
    for (const name of [header.profileName, header.callName, header.registeredName]) {
      if (name !== null) {
        expect(name).toMatch(new RegExp(`^Sample ${upper}( Registered)?$`, 'i'));
      }
    }
    expect(header.kitId).toBe(`KIT000${upper}`);
    expect(header.microchip).toMatch(/^0+$/);
    expect(header.registration ?? 'XX00000/00').toBe('XX00000/00');
    expect(header.countryOfOrigin ?? 'XX').toBe('XX');
    for (const owner of [header.ownerFirstName, header.ownerLastName]) {
      expect([null, 'Owner', 'Surname']).toContain(owner);
    }
  });

  it.each(FIXTURE_LETTERS.filter((letter) => !HEALTH_FIXTURE_LETTERS.includes(letter)))(
    'sample %s, another owner’s dog, holds no health rows',
    (letter) => {
      const fixture = loadFixture(letter);
      expect(findHealthRows(fixture.lines, 'mydogdna')).toEqual([]);
      expect(findHealthRows(fixture.lines, 'current')).toEqual([]);
    },
  );
});

const manifest = readManifest(SAMPLES_DIRECTORY);

describe.skipIf(manifest === null)('committed fixtures against the local sample reports', () => {
  it.each(FIXTURE_LETTERS)('sample %s holds no identifier of its source PDF', async (letter) => {
    const pdf = manifest?.fixtures[letter];
    expect(pdf).toBeDefined();
    const path = join(SAMPLES_DIRECTORY, pdf ?? '');
    const extracted = await extractPdfText(new Uint8Array(readFileSync(path)));
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) {
      return;
    }
    const committed = readFileSync(fixturePath(letter), 'utf8');
    expect(() => assertNoIdentifiers(committed, identifiersOf(extracted.text, path))).not.toThrow();
  });
});
