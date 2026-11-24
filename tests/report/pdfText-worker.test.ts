// pdf.js caches a failed worker load for the life of the module, so this
// runs in its own file: Vitest gives each file a fresh module graph.
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractPdfText } from '../../src/report/pdfText.ts';
import { readReport } from '../../src/report/read.ts';
import { buildPdf } from './pdfBuilder.ts';

const validPdf = (): Uint8Array => buildPdf([[{ text: 'page', x: 34, y: 700, size: 8 }]]);

describe('a pdf.js worker that fails to load', () => {
  beforeAll(() => {
    GlobalWorkerOptions.workerSrc = new URL('./missing-pdf.worker.mjs', import.meta.url).href;
  });

  it('is thrown, not reported as a file that is not a PDF', async () => {
    await expect(extractPdfText(validPdf())).rejects.toThrow(/worker/i);
  });

  it('is thrown by readReport too', async () => {
    await expect(readReport(new Blob([validPdf().slice().buffer]))).rejects.toThrow(/worker/i);
  });
});
