// pdf.js text items → lines of cells. Everything downstream of this module
// works on lines, so parsing is tested without pdf.js.
//
// The legacy build runs in Node and polyfills recent built-ins (such as
// Math.sumPrecise) that the modern build expects but older phone browsers
// lack. The browser entry point sets its bundled worker; Node uses pdf.js's
// in-process fallback.
import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  VerbosityLevel,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { RejectionKind } from './types.ts';

export interface TextItem {
  readonly str: string;
  /** Left edge of the item's baseline, in PDF points. */
  readonly x: number;
  /** Baseline height above the bottom of the page, in PDF points. */
  readonly y: number;
  readonly width: number;
  /** Font size, in PDF points. */
  readonly size: number;
}

export interface Cell {
  readonly text: string;
  readonly x: number;
  readonly width: number;
}

export interface Line {
  /** 1-based page number. */
  readonly page: number;
  readonly y: number;
  readonly cells: readonly Cell[];
}

// Variant codes print as a base letter plus a raised, smaller suffix (a + y).
// Wisdom's own PDFs raise it 1.5 pt, browser prints of MyDogDNA about 5.3 pt
// at 8 pt type; a footnote-sized item further away is something else.
const SUPERSCRIPT_MAX_SIZE_RATIO = 0.8;
const SUPERSCRIPT_MAX_RISE_RATIO = 0.8;
const SUPERSCRIPT_MAX_GAP_RATIO = 0.5;
const SUPERSCRIPT_MAX_OVERLAP = 0.5;

// Cells of one table row share a baseline to within a fraction of a point,
// and a heading set in a slightly larger font sits within a point of the
// column headers beside it. Wrapped name and result fragments sit 4–6 pt
// above or below the row, so they must stay separate lines.
const LINE_TOLERANCE_RATIO = 0.25;

// Items less than half the font size apart belong to one cell: a label and
// its value separated by one space, or a word the producer split into runs.
// A copy count and the result text beside it are at least 7.3 pt apart.
const CELL_JOIN_GAP_RATIO = 0.5;
const SPACE_GAP_RATIO = 0.1;

interface Run {
  str: string;
  readonly x: number;
  readonly y: number;
  width: number;
  readonly size: number;
}

const isBlank = (text: string): boolean => text.trim() === '';

function attachSuperscripts(items: readonly TextItem[]): Run[] {
  // Spaces carry no information that the gaps between items don't, and a
  // superscript-sized space would otherwise pull a line's baseline upwards.
  const runs: Run[] = items.filter((item) => !isBlank(item.str)).map((item) => ({ ...item }));
  const attached = new Set<Run>();
  for (const sup of runs) {
    let best: Run | undefined;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const base of runs) {
      if (base === sup || attached.has(base) || sup.size > base.size * SUPERSCRIPT_MAX_SIZE_RATIO) {
        continue;
      }
      const rise = sup.y - base.y;
      const gap = sup.x - (base.x + base.width);
      if (
        rise > 0 &&
        rise <= base.size * SUPERSCRIPT_MAX_RISE_RATIO &&
        gap >= -SUPERSCRIPT_MAX_OVERLAP &&
        gap <= base.size * SUPERSCRIPT_MAX_GAP_RATIO &&
        gap < bestGap
      ) {
        best = base;
        bestGap = gap;
      }
    }
    if (best) {
      best.str = best.str.trimEnd() + sup.str.trim();
      best.width = sup.x + sup.width - best.x;
      attached.add(sup);
    }
  }
  return runs.filter((run) => !attached.has(run));
}

function groupByBaseline(runs: readonly Run[]): { y: number; runs: Run[] }[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; size: number; runs: Run[] }[] = [];
  for (const run of sorted) {
    const current = groups.at(-1);
    const tolerance = Math.max(run.size, current?.size ?? 0) * LINE_TOLERANCE_RATIO;
    if (current && current.y - run.y <= tolerance) {
      current.runs.push(run);
    } else {
      groups.push({ y: run.y, size: run.size, runs: [run] });
    }
  }
  return groups.map(({ y, runs: members }) => ({ y, runs: members.sort((a, b) => a.x - b.x) }));
}

function joinCells(runs: readonly Run[]): Cell[] {
  const cells: { text: string; x: number; right: number; size: number }[] = [];
  for (const run of runs) {
    const current = cells.at(-1);
    const gap = current ? run.x - current.right : Number.POSITIVE_INFINITY;
    const size = Math.max(run.size, current?.size ?? 0);
    if (current && gap <= size * CELL_JOIN_GAP_RATIO) {
      const space = gap > size * SPACE_GAP_RATIO ? ' ' : '';
      current.text = `${current.text}${space}${run.str}`;
      current.right = Math.max(current.right, run.x + run.width);
    } else {
      cells.push({ text: run.str, x: run.x, right: run.x + run.width, size: run.size });
    }
  }
  return cells.map(({ text, x, right }) => ({
    text: text.replace(/\s+/g, ' ').trim(),
    x,
    width: right - x,
  }));
}

/** Turns each page's text items into lines of cells, top of page 1 first. */
export function buildLines(pages: readonly (readonly TextItem[])[]): Line[] {
  return pages.flatMap((items, index) =>
    groupByBaseline(attachSuperscripts(items))
      .map(({ y, runs }) => ({ page: index + 1, y, cells: joinCells(runs) }))
      .filter((line) => line.cells.length > 0),
  );
}

export interface DocumentInfo {
  readonly creator: string | null;
  readonly producer: string | null;
}

export interface PdfText {
  readonly lines: readonly Line[];
  readonly info: DocumentInfo;
}

export type PdfRejectionKind = Extract<RejectionKind, 'not-pdf' | 'encrypted' | 'too-large'>;

export type PdfTextResult =
  | { readonly ok: true; readonly text: PdfText }
  | { readonly ok: false; readonly kind: PdfRejectionKind };

// A Wisdom report is 19–28 pages and a few megabytes; anything far beyond
// that is not one, and is refused before pdf.js spends time on it.
export const MAX_BYTES = 40 * 1024 * 1024;
export const MAX_PAGES = 40;

const PDF_SIGNATURE = '%PDF-';
// Readers accept the signature anywhere in the first kilobyte.
const SIGNATURE_SEARCH_BYTES = 1024;

function hasPdfSignature(data: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(data.subarray(0, SIGNATURE_SEARCH_BYTES));
  return head.includes(PDF_SIGNATURE);
}

function infoString(info: unknown, key: string): string | null {
  if (typeof info !== 'object' || info === null) {
    return null;
  }
  const value: unknown = Reflect.get(info, key);
  return typeof value === 'string' ? value : null;
}

function toTextItem(raw: unknown): TextItem | null {
  if (typeof raw !== 'object' || raw === null || !('str' in raw) || !('transform' in raw)) {
    return null;
  }
  const { str, transform, width } = raw as { str: unknown; transform: unknown; width: unknown };
  if (typeof str !== 'string' || !Array.isArray(transform) || typeof width !== 'number') {
    return null;
  }
  const [, , c, d, e, f] = transform.map(Number);
  if (c === undefined || d === undefined || e === undefined || f === undefined) {
    return null;
  }
  return { str, x: e, y: f, width, size: Math.hypot(c, d) };
}

/**
 * Extracts the text lines and producer metadata of a PDF. Takes ownership of
 * `data`: pdf.js transfers its buffer to the worker.
 *
 * Throws when the reader itself fails rather than the file, for example a
 * pdf.js worker that could not be loaded; pdf.js keeps that failure until the
 * page is reloaded.
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfTextResult> {
  if (data.byteLength > MAX_BYTES) {
    return { ok: false, kind: 'too-large' };
  }
  if (!hasPdfSignature(data)) {
    return { ok: false, kind: 'not-pdf' };
  }
  const task = getDocument({
    data,
    disableFontFace: true,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    let document;
    try {
      document = await task.promise;
    } catch (error) {
      if (error instanceof PasswordException) {
        return { ok: false, kind: 'encrypted' };
      }
      if (error instanceof InvalidPDFException) {
        return { ok: false, kind: 'not-pdf' };
      }
      throw error;
    }
    if (document.numPages > MAX_PAGES) {
      return { ok: false, kind: 'too-large' };
    }
    const pages: TextItem[][] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map(toTextItem).filter((item) => item !== null));
    }
    const { info } = await document.getMetadata();
    return {
      ok: true,
      text: {
        lines: buildLines(pages),
        info: { creator: infoString(info, 'Creator'), producer: infoString(info, 'Producer') },
      },
    };
  } finally {
    await task.destroy();
  }
}
