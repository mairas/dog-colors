import { readFileSync } from 'node:fs';
import { fixturePath, type Fixture } from '../../scripts/extract-fixtures.ts';
import type { PdfText } from '../../src/report/pdfText.ts';

export function loadFixture(letter: string): Fixture {
  return JSON.parse(readFileSync(fixturePath(letter), 'utf8')) as Fixture;
}

export function fixtureText(letter: string): PdfText {
  return { lines: loadFixture(letter).lines, info: { creator: null, producer: null } };
}
