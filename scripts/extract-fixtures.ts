// Writes the committed test fixtures from the sample reports in
// _local/samples. A fixture is the line stream of one report, cut down to its
// format marker, header block, colour and Short Tail rows and a few chosen
// health rows, with every identifier replaced by a placeholder. The script
// collects each report's real identifier values and refuses to write a
// fixture that still contains any of them. It never prints them either.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayName, readHeader, type HeaderFields } from '../src/report/header.ts';
import { detectFormat, findHealthRows, findTraitRows } from '../src/report/parse.ts';
import { extractPdfText, type Cell, type Line, type PdfText } from '../src/report/pdfText.ts';
import type { RejectionKind } from '../src/report/types.ts';

export const FIXTURE_LETTERS: readonly string[] = ['a', 'b', 'c', 'd', 'e'];
// D and E are other owners' dogs: their fixtures hold no health rows.
export const HEALTH_FIXTURE_LETTERS: readonly string[] = ['a', 'b', 'c'];

// The health rows tests assert on: the "known in the breed" block layout, a
// carrier, conditions sharing a gene and variant, "Confidential" genes, and
// the X-linked and mitochondrial modes.
export const FIXTURE_HEALTH_CONDITIONS: readonly string[] = [
  'Chondrodystrophy (CDDY) and Intervertebral Disc Disease (IVDD) Risk',
  'Early-Onset Progressive Retinal Atrophy, (Discovered in the Spanish Water Dog)',
  'Degenerative Myelopathy',
  'Amelogenesis Imperfecta (Discovered in the Lancashire Heeler)',
  'Hypophosphatasia',
  "von Willebrand's Disease, type 1",
  "von Willebrand's Disease, type 3 (Discovered in the Kooiker Hound)",
  'Hemophilia A (Discovered in the German Shepherd Dog - Variant 1)',
  'Sensory Ataxic Neuropathy',
];

export const SAMPLES_DIRECTORY = fileURLToPath(new URL('../_local/samples', import.meta.url));
const MANIFEST_FILE = 'manifest.json';

export function fixturePath(letter: string): string {
  return fileURLToPath(new URL(`../tests/fixtures/sample-${letter}.json`, import.meta.url));
}

export interface Fixture {
  /** Health rows in the whole source report, for the local real-PDF test. */
  readonly healthRowCount: number;
  readonly lines: readonly Line[];
}

/** Which local PDF is which sample. It names the dogs, so it stays in _local. */
export interface Manifest {
  /** Fixture letter → PDF path relative to the samples directory. */
  readonly fixtures: Readonly<Record<string, string>>;
  /** PDF path relative to the samples directory → the rejection it must get. */
  readonly rejections: Readonly<Record<string, RejectionKind>>;
}

export function readManifest(directory: string): Manifest | null {
  const path = join(directory, MANIFEST_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null;
}

export interface Identifier {
  /** What the value is, safe to print. */
  readonly kind: string;
  readonly value: string;
}

const NAME_FIELDS: readonly (keyof HeaderFields)[] = [
  'profileName',
  'registeredName',
  'callName',
  'ownerFirstName',
  'ownerLastName',
];
// Fields whose values identify no one, or are printed in every report alike.
const PUBLIC_FIELDS: readonly (keyof HeaderFields)[] = ['sex', 'breed'];
const NOT_AN_IDENTIFIER = new Set(['n/a']);
// A word this short also occurs inside ordinary report text.
const MIN_WORD_LENGTH = 3;
// Words a name or file name may share with ordinary text, which identify no
// one: function words, and the parts of a browser's "blob:https://…" name.
const COMMON_WORDS = new Set([
  'and', 'the', 'via', 'von', 'van', 'del', 'des',
  'pdf', 'dna', 'dog', 'report', 'test', 'wisdom', 'panel', 'wisdompanel', 'mydogdna',
  'blob', 'http', 'https', 'www', 'com',
]);
const METADATA_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32,}\b/gi;

const words = (text: string): string[] =>
  text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        word.length >= MIN_WORD_LENGTH && /\p{L}/u.test(word) && !COMMON_WORDS.has(word.toLowerCase()),
    );

/** The identifying values of a source report: header fields, the words of names and file name, IDs in metadata and file name. */
export function identifiersOf(text: PdfText, sourcePath: string): Identifier[] {
  const header = readHeader(text.lines);
  const identifiers: Identifier[] = [];
  for (const [field, value] of Object.entries(header) as [keyof HeaderFields, string | null][]) {
    if (value === null || PUBLIC_FIELDS.includes(field) || NOT_AN_IDENTIFIER.has(value.toLowerCase())) {
      continue;
    }
    identifiers.push({ kind: field, value });
    if (NAME_FIELDS.includes(field)) {
      identifiers.push(...words(value).map((word) => ({ kind: `word of ${field}`, value: word })));
    }
  }
  const fileName = basename(sourcePath, extname(sourcePath));
  const directoryName = basename(dirname(sourcePath));
  for (const name of [fileName, directoryName]) {
    identifiers.push({ kind: 'file name', value: name });
    identifiers.push(...words(name).map((word) => ({ kind: 'word of file name', value: word })));
  }
  for (const source of [text.info.creator, text.info.producer, fileName]) {
    for (const id of source?.match(METADATA_ID) ?? []) {
      identifiers.push({ kind: 'embedded ID', value: id });
    }
  }
  return identifiers;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Throws, naming only the kinds, if any identifier occurs in `text` as a whole word in any letter case. */
export function assertNoIdentifiers(text: string, identifiers: readonly Identifier[]): void {
  const found = identifiers.filter(({ value }) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, 'iu').test(text),
  );
  if (found.length > 0) {
    const kinds = [...new Set(found.map(({ kind }) => kind))].join(', ');
    throw new Error(`the fixture holds an identifier of its source report (${kinds})`);
  }
}

function placeholders(header: HeaderFields, name: string | null, letter: string): Map<string, string> {
  const upper = letter.toUpperCase();
  const isoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const replacements = new Map<string, string>();
  const add = (value: string | null, placeholder: string): void => {
    if (value !== null && !NOT_AN_IDENTIFIER.has(value.toLowerCase()) && !replacements.has(value)) {
      replacements.set(value, placeholder);
    }
  };
  add(name, `Sample ${upper}`);
  add(header.registeredName, `Sample ${upper} Registered`);
  add(header.profileName, `Sample ${upper} Profile`);
  add(header.callName, `Sample ${upper} Call`);
  add(header.microchip, '000000000000000');
  add(header.registration, 'XX00000/00');
  add(header.kitId, `KIT000${upper}`);
  add(header.birthDate, header.birthDate && isoDate(header.birthDate) ? '2000-01-01' : '1/1/2000');
  add(header.testDate, header.testDate && isoDate(header.testDate) ? '2000-01-02' : '1/2/2000');
  add(header.tattoo, 'T-0000');
  add(header.ownerFirstName, 'Owner');
  add(header.ownerLastName, 'Surname');
  return replacements;
}

const round = (value: number): number => Math.round(value * 10) / 10;

function substitute(cell: Cell, replacements: ReadonlyMap<string, string>): Cell {
  const longestFirst = [...replacements].sort(([a], [b]) => b.length - a.length);
  const text = longestFirst.reduce((current, [real, placeholder]) => current.replaceAll(real, placeholder), cell.text);
  // Scale the width with the text, so that it does not reveal the real value's length.
  const width = text === cell.text ? cell.width : (cell.width / cell.text.length) * text.length;
  return { text, x: round(cell.x), width: round(width) };
}

export function buildFixture(text: PdfText, letter: string): Fixture {
  const { lines } = text;
  const format = detectFormat(lines);
  if (format === null) {
    throw new Error(`sample ${letter} is not a report in a known format`);
  }
  const keep = new Set<Line>();
  const firstPage = lines.filter((line) => line.page === 1);
  const diversity = firstPage.findIndex((line) => line.cells.some((cell) => cell.text.startsWith('Genetic Diversity')));
  for (const line of diversity === -1 ? firstPage : firstPage.slice(0, diversity)) {
    keep.add(line);
  }
  for (const line of firstPage.filter((candidate) => detectFormat([candidate]) === format)) {
    keep.add(line);
  }
  for (const row of findTraitRows(lines, format)) {
    keep.add(row.line);
  }
  const healthRows = findHealthRows(lines, format);
  if (HEALTH_FIXTURE_LETTERS.includes(letter)) {
    for (const { row, lines: rowLines } of healthRows) {
      if (FIXTURE_HEALTH_CONDITIONS.includes(row.name)) {
        rowLines.forEach((line) => keep.add(line));
      }
    }
  }

  const header = readHeader(lines);
  const replacements = placeholders(header, displayName(header, format), letter);
  return {
    healthRowCount: healthRows.length,
    lines: lines
      .filter((line) => keep.has(line))
      .map((line) => ({
        page: line.page,
        y: round(line.y),
        cells: line.cells.map((cell) => substitute(cell, replacements)),
      })),
  };
}

/** Serialises a fixture one line per text line, after checking both the JSON and its plain text. */
export function serialiseFixture(fixture: Fixture, identifiers: readonly Identifier[]): string {
  const serialised = [
    '{',
    `  "healthRowCount": ${fixture.healthRowCount},`,
    '  "lines": [',
    fixture.lines.map((line) => `    ${JSON.stringify(line)}`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
  const plain = fixture.lines.map((line) => line.cells.map((cell) => cell.text).join(' ')).join('\n');
  assertNoIdentifiers(serialised, identifiers);
  assertNoIdentifiers(plain, identifiers);
  return serialised;
}

async function main(directory: string): Promise<void> {
  const manifest = readManifest(directory);
  if (manifest === null) {
    throw new Error(
      `${join(directory, MANIFEST_FILE)} is missing; it maps each fixture letter to its PDF (see AGENTS.md)`,
    );
  }
  for (const letter of FIXTURE_LETTERS) {
    const relative = manifest.fixtures[letter];
    if (relative === undefined) {
      throw new Error(`the manifest names no PDF for sample ${letter}`);
    }
    const path = join(directory, relative);
    const extracted = await extractPdfText(new Uint8Array(readFileSync(path)));
    if (!extracted.ok) {
      throw new Error(`sample ${letter} could not be read: ${extracted.kind}`);
    }
    const fixture = buildFixture(extracted.text, letter);
    let serialised: string;
    try {
      serialised = serialiseFixture(fixture, identifiersOf(extracted.text, path));
    } catch (error) {
      throw new Error(`sample ${letter} not written: ${error instanceof Error ? error.message : String(error)}`);
    }
    writeFileSync(fixturePath(letter), serialised);
    console.log(`sample-${letter}.json: ${fixture.lines.length} lines`);
  }
}

if (import.meta.main) {
  await main(process.argv[2] ?? SAMPLES_DIRECTORY);
}
