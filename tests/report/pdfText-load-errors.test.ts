// Load failures that no small crafted PDF provokes from pdf.js, given to
// extractPdfText through a stand-in getDocument. pdf.js does not export
// UnknownErrorException; its errors carry their class name in `name`.
import { describe, expect, it, vi } from 'vitest';
import { extractPdfText, MAX_BYTES } from '../../src/report/pdfText.ts';
import { PASS_BUDGET_MS } from './timing.ts';

const loadFailure = vi.hoisted(() => ({ error: new Error('unset') }));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>()),
  getDocument: () => ({
    promise: Promise.reject(loadFailure.error),
    destroy: () => Promise.resolve(),
  }),
}));

function unknownError(message: string): Error {
  const error = new Error(message);
  error.name = 'UnknownErrorException';
  return error;
}

const file = (body: string): Uint8Array => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);

describe('extractPdfText, when pdf.js fails to load the document', () => {
  it('rejects an unknown pdf.js error as not-pdf', async () => {
    loadFailure.error = unknownError('Bad FCHECK in flate stream');
    expect(await extractPdfText(file('trailer << /Root 1 0 R >>'))).toEqual({ ok: false, kind: 'not-pdf' });
  });

  it('rejects an unknown pdf.js error naming encryption as encrypted', async () => {
    loadFailure.error = unknownError('Unknown crypto method');
    expect(await extractPdfText(file('trailer << /Root 1 0 R >>'))).toEqual({ ok: false, kind: 'encrypted' });
  });

  it('rejects an unknown pdf.js error in a file with an /Encrypt entry as encrypted', async () => {
    loadFailure.error = unknownError('Bad FCHECK in flate stream');
    expect(await extractPdfText(file('trailer << /Root 1 0 R /Encrypt 5 0 R >>'))).toEqual({
      ok: false,
      kind: 'encrypted',
    });
  });

  it('scans a largest-size file dense with name slashes for /Encrypt quickly', async () => {
    loadFailure.error = unknownError('Bad FCHECK in flate stream');
    const data = new Uint8Array(MAX_BYTES).fill('/'.charCodeAt(0));
    data.set(new TextEncoder().encode('%PDF-1.7\n'));
    let fastest = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      expect(await extractPdfText(data)).toEqual({ ok: false, kind: 'not-pdf' });
      fastest = Math.min(fastest, performance.now() - start);
    }
    expect(fastest).toBeLessThan(PASS_BUDGET_MS);
  });

  it('throws any other error, such as a worker that could not start', async () => {
    loadFailure.error = new Error('Setting up fake worker failed');
    await expect(extractPdfText(file('trailer << /Root 1 0 R /Encrypt 5 0 R >>'))).rejects.toThrow(/worker/);
  });
});
