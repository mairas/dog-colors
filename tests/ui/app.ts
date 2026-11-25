// Drives the page with fixture reports injected below the pdf.js layer: the
// reader is replaced by a lookup from file name to read result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReport } from '../../src/report/parse.ts';
import type { Line, PdfText } from '../../src/report/pdfText.ts';
import type { ReadResult, Report } from '../../src/report/types.ts';
import { startApp, type App, type AppState } from '../../src/ui/app.ts';

// happy-dom replaces the global URL, which the shared fixture helpers resolve
// paths with, so the DOM tests read the fixtures by directory instead.
export function fixtureText(letter: string): PdfText {
  const file = join(import.meta.dirname, '..', 'fixtures', `sample-${letter}.json`);
  const { lines } = JSON.parse(readFileSync(file, 'utf8')) as { lines: Line[] };
  return { lines, info: { creator: null, producer: null } };
}

export async function sampleReport(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}

export interface Page {
  readonly app: App;
  readonly root: HTMLElement;
  text(): string;
}

/** Files by name; a function is called, so a read can throw or stay pending. */
export type Library = Readonly<Record<string, ReadResult | (() => Promise<ReadResult>)>>;

/** A read that stays pending until released. */
export function slowRead(result: ReadResult): { readonly read: () => Promise<ReadResult>; release(): Promise<void> } {
  let resolve: (value: ReadResult) => void = () => undefined;
  const promise = new Promise<ReadResult>((done) => {
    resolve = done;
  });
  return {
    read: () => promise,
    async release() {
      resolve(result);
      await promise;
    },
  };
}

export function pdf(name: string): File {
  return new File(['%PDF-'], name, { type: 'application/pdf' });
}

export function ok(report: Report): ReadResult {
  return { ok: true, report };
}

export function openPage(library: Library, options: { initial?: AppState; narrow?: boolean } = {}): Page {
  document.body.replaceChildren();
  const root = document.createElement('main');
  document.body.append(root);
  const app = startApp(root, {
    read: async (file) => {
      const entry = library[file.name];
      if (entry === undefined) {
        throw new Error(`no fixture for ${file.name}`);
      }
      return typeof entry === 'function' ? entry() : entry;
    },
    narrow: () => options.narrow ?? false,
    ...(options.initial === undefined ? {} : { initial: options.initial }),
  });
  return { app, root, text: () => root.textContent ?? '' };
}

/** A sample with some genes' copies changed, its own name and no kit ID. */
export async function variant(letter: string, name: string, colour: Report['colour']): Promise<Report> {
  const base = await sampleReport(letter);
  return { ...base, name, kitIdHash: null, colour: { ...base.colour, ...colour } };
}

export async function parsed(text: PdfText): Promise<ReadResult> {
  return parseReport(text);
}

/** A table's rows as [label, chance] text pairs, by caption. */
export function tableRows(root: HTMLElement, caption: string): [string, string][] {
  const table = [...root.querySelectorAll('table')].find((candidate) =>
    (candidate.querySelector('caption')?.textContent ?? '').startsWith(caption),
  );
  if (table === undefined) {
    return [];
  }
  return [...table.querySelectorAll('tbody tr')].map((row) => {
    const cells = [...row.querySelectorAll('td, th')].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
    return [cells[0] ?? '', cells.at(-1) ?? ''];
  });
}

export function button(root: HTMLElement, key: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
  if (found === null) {
    throw new Error(`no button ${key}`);
  }
  return found;
}
