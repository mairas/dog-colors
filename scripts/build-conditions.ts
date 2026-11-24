// Writes src/health/conditions.json, the inheritance mode of every condition
// on the panel, from the current-format sample reports in _local/samples (the
// older format prints no Inheritance column). It keeps panel facts only:
// condition name, gene, risk variant and mode, never a dog's copies or result,
// and refuses to write a file holding any sample's identifying values.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CatalogueEntry } from '../src/health/conditions.ts';
import { parseReport } from '../src/report/parse.ts';
import type { Report } from '../src/report/types.ts';
import {
  assertNoIdentifiers,
  identifiersOf,
  readSampleTexts,
  SAMPLES_DIRECTORY,
  type Identifier,
} from './extract-fixtures.ts';

export const CATALOGUE_PATH = fileURLToPath(new URL('../src/health/conditions.json', import.meta.url));

export function buildCatalogue(reports: readonly Pick<Report, 'format' | 'health'>[]): CatalogueEntry[] {
  const entries = new Map<string, CatalogueEntry>();
  for (const report of reports.filter(({ format }) => format === 'current')) {
    for (const { name, gene, variant, inheritance } of report.health) {
      if (inheritance === null) {
        continue;
      }
      const key = JSON.stringify([name, gene, variant]);
      const known = entries.get(key);
      if (known && known.inheritance !== inheritance) {
        throw new Error(`${name} (${gene} ${variant}) is ${known.inheritance} in one report and ${inheritance} in another`);
      }
      entries.set(key, { name, gene, variant, inheritance });
    }
  }
  const order = (a: CatalogueEntry, b: CatalogueEntry) =>
    a.name.localeCompare(b.name, 'en') || a.gene.localeCompare(b.gene, 'en') || a.variant.localeCompare(b.variant, 'en');
  return [...entries.values()].sort(order);
}

export function serialiseCatalogue(entries: readonly CatalogueEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

interface Sample {
  readonly letter: string;
  readonly report: Report;
  readonly identifiers: readonly Identifier[];
}

/** Every readable sample report the manifest lists, with its identifying values. */
export async function readSamples(directory: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for await (const { letter, path, text } of readSampleTexts(directory)) {
    const result = await parseReport(text);
    if (!result.ok) {
      throw new Error(`sample ${letter} could not be read: ${result.kind}`);
    }
    samples.push({ letter, report: result.report, identifiers: identifiersOf(text, path) });
  }
  return samples;
}

async function main(directory: string): Promise<void> {
  const samples = await readSamples(directory);
  const entries = buildCatalogue(samples.map(({ report }) => report));
  if (entries.length === 0) {
    throw new Error('no current-format sample report gave an inheritance mode');
  }
  const serialised = serialiseCatalogue(entries);
  assertNoIdentifiers(serialised, samples.flatMap(({ identifiers }) => identifiers));
  writeFileSync(CATALOGUE_PATH, serialised);
  console.log(`conditions.json: ${entries.length} conditions`);
}

if (import.meta.main) {
  await main(process.argv[2] ?? SAMPLES_DIRECTORY);
}
