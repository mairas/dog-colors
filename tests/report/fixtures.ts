import { readFileSync } from 'node:fs';
import { fixturePath, type Fixture } from '../../scripts/extract-fixtures.ts';
import { parseReport } from '../../src/report/parse.ts';
import type { PdfText } from '../../src/report/pdfText.ts';
import type { Report } from '../../src/report/types.ts';

export function loadFixture(letter: string): Fixture {
  return JSON.parse(readFileSync(fixturePath(letter), 'utf8')) as Fixture;
}

export function fixtureText(letter: string): PdfText {
  return { lines: loadFixture(letter).lines, info: { creator: null, producer: null } };
}

export async function fixtureReport(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}
