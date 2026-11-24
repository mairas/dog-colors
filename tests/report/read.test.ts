import { describe, expect, it } from 'vitest';
import { extractPdfText, MAX_BYTES, MAX_PAGES } from '../../src/report/pdfText.ts';
import { readReport } from '../../src/report/read.ts';
import { buildPdf, type TextRun } from './pdfBuilder.ts';

const BODY = 8;
const run = (text: string, x: number, y: number, size = BODY): TextRun => ({ text, x, y, size });

// A current-format report reduced to its marker, one header field and two
// rows, the first with a raised variant code as Wisdom prints it.
const MINI_REPORT: readonly TextRun[] = [
  run('Registered name', 34, 622),
  run('Sample Z', 34, 610),
  run('ASIP', 307, 602),
  run('a', 365.4, 602),
  run('y', 370, 603.5, 5.2),
  run('1', 417, 602),
  run('No effect', 455, 602),
  run('T-box', 304, 580),
  run('T', 364, 580),
  run('0', 417, 580),
  run('Wisdom Panel Genetics Report', 34, 13),
];

const blob = (data: Uint8Array): Blob => new Blob([data.slice().buffer]);

describe('extractPdfText', () => {
  it('reads lines of text, superscripts attached, and the producer metadata through pdf.js', async () => {
    const pdf = buildPdf([MINI_REPORT], { info: { Creator: 'Test Creator', Producer: 'Test Producer' } });
    const result = await extractPdfText(pdf);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.text.info).toEqual({ creator: 'Test Creator', producer: 'Test Producer' });
    const texts = result.text.lines.map((line) => line.cells.map((cell) => cell.text));
    expect(texts).toContainEqual(['ASIP', 'ay', '1', 'No effect']);
  });

  it('rejects a file that is not a PDF as not-pdf', async () => {
    expect(await extractPdfText(new TextEncoder().encode('<html>not a report</html>'))).toEqual({
      ok: false,
      kind: 'not-pdf',
    });
  });

  it('rejects a damaged PDF as not-pdf', async () => {
    expect(await extractPdfText(new TextEncoder().encode('%PDF-1.4\nthis is not a PDF body'))).toEqual({
      ok: false,
      kind: 'not-pdf',
    });
  });

  it('rejects a password-protected PDF as encrypted', async () => {
    expect(await extractPdfText(buildPdf([MINI_REPORT], { encrypted: true }))).toEqual({
      ok: false,
      kind: 'encrypted',
    });
  });

  it(`accepts ${MAX_PAGES} pages and rejects ${MAX_PAGES + 1} as too-large`, async () => {
    const pages = (count: number) => Array.from({ length: count }, () => [run('page', 34, 700)]);
    expect((await extractPdfText(buildPdf(pages(MAX_PAGES)))).ok).toBe(true);
    expect(await extractPdfText(buildPdf(pages(MAX_PAGES + 1)))).toEqual({ ok: false, kind: 'too-large' });
  });

  it('rejects more than the size limit as too-large without parsing it', async () => {
    const oversized = new Uint8Array(MAX_BYTES + 1);
    oversized.set(new TextEncoder().encode('%PDF-1.4\n'));
    expect(await extractPdfText(oversized)).toEqual({ ok: false, kind: 'too-large' });
  });
});

describe('readReport', () => {
  it('reads a report file into a Report', async () => {
    const result = await readReport(blob(buildPdf([MINI_REPORT])));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.format).toBe('current');
      expect(result.report.name).toBe('Sample Z');
      expect(result.report.colour.ASIP).toEqual({ ay: 1 });
      expect(result.report.shortTail).toBe(0);
    }
  });

  it('rejects a PDF whose pages carry no text as no-text', async () => {
    expect(await readReport(blob(buildPdf([[], []])))).toEqual({ ok: false, kind: 'no-text' });
  });

  it('rejects text-free output of the Windows Adobe PDF printer as adobe-pdf-printer', async () => {
    const pdf = buildPdf([[]], { info: { Creator: 'PScript5.dll Version 5.2.2', Producer: 'Acrobat Distiller 26.0 (Windows)' } });
    expect(await readReport(blob(pdf))).toEqual({ ok: false, kind: 'adobe-pdf-printer' });
  });

  it('rejects an oversized file by its size, before reading it', async () => {
    const huge = { size: MAX_BYTES + 1, arrayBuffer: () => Promise.reject(new Error('read')) } as unknown as Blob;
    expect(await readReport(huge)).toEqual({ ok: false, kind: 'too-large' });
  });

  it('passes a pdf.js rejection through', async () => {
    expect(await readReport(blob(new TextEncoder().encode('plain text')))).toEqual({ ok: false, kind: 'not-pdf' });
  });
});
