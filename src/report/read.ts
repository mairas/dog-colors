import { parseReport } from './parse.ts';
import { extractPdfText, MAX_BYTES } from './pdfText.ts';
import type { ReadResult } from './types.ts';

/**
 * Reads a chosen file into a Report, or the reason it is not one.
 *
 * Throws when the reader fails rather than the file: a pdf.js worker that
 * could not be loaded, a page or the metadata that pdf.js could not read, or
 * a browser without Web Crypto. The file may be fine; reloading the page is
 * the remedy for a worker failure.
 */
export async function readReport(file: Blob): Promise<ReadResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, kind: 'too-large' };
  }
  const extracted = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  return extracted.ok ? parseReport(extracted.text) : extracted;
}
