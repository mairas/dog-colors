// Drives the page with fixture reports injected below the pdf.js layer: the
// reader is replaced by a lookup from file name to read result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReport } from '../../src/report/parse.ts';
import type { Line, PdfText } from '../../src/report/pdfText.ts';
import type { ReadResult, Report } from '../../src/report/types.ts';
import { SAVED_DOGS_KEY, openSavedDogs } from '../../src/saved/store.ts';
import { stateFromQuery } from '../../src/ui/dev.ts';
import { startApp, type App, type AppOptions, type AppState, type NoteStorage } from '../../src/ui/app.ts';
import { MemoryStorage, sequentialIds } from '../saved/storage.ts';

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

/** Read results by file name; a function is called, so a read can throw or stay pending. */
export type ReadResults = Readonly<Record<string, ReadResult | (() => Promise<ReadResult>)>>;

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

export interface PageOptions {
  readonly initial?: AppState;
  readonly narrow?: boolean;
  readonly storage?: NoteStorage;
  /** The clock's fixed reading, in epoch milliseconds. */
  readonly now?: number;
  /** IDs for dogs the page saves; new-1, new-2, … by default. */
  readonly newId?: () => string;
  readonly predictPuppies?: AppOptions['predictPuppies'];
}

export function openPage(reads: ReadResults, options: PageOptions = {}): Page {
  document.body.replaceChildren();
  const root = document.createElement('main');
  document.body.append(root);
  const app = startApp(root, {
    read: async (file) => {
      const entry = reads[file.name];
      if (entry === undefined) {
        throw new Error(`no fixture for ${file.name}`);
      }
      return typeof entry === 'function' ? entry() : entry;
    },
    narrow: () => options.narrow ?? false,
    storage: options.storage ?? new MemoryStorage(),
    now: () => options.now ?? Date.now(),
    newId: options.newId ?? sequentialIds('new'),
    ...(options.initial === undefined ? {} : { initial: options.initial }),
    ...(options.predictPuppies === undefined ? {} : { predictPuppies: options.predictPuppies }),
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

/** A coat picture's shapes, as "tag class". */
export function shapes(picture: SVGSVGElement): string[] {
  return [...picture.children].map((shape) => `${shape.tagName.toLowerCase()} ${shape.getAttribute('class') ?? ''}`);
}

/** A storage holding the reports as saved dogs with IDs dog-1, dog-2, … in the order given. */
export function savedStorage(...reports: readonly Report[]): MemoryStorage {
  const storage = new MemoryStorage();
  const store = openSavedDogs({ storage: () => storage, newId: sequentialIds('dog') });
  for (const report of reports) {
    store.add(report);
  }
  return storage;
}

/** Rewrites stored entries: each entry with a listed ID passes through `change`. */
export function rewriteSaved(
  storage: MemoryStorage,
  ids: readonly string[],
  change: (entry: Record<string, unknown>) => Record<string, unknown>,
): void {
  const stored = JSON.parse(storage.getItem(SAVED_DOGS_KEY) ?? '{}') as { version: number; dogs: Record<string, unknown>[] };
  stored.dogs = stored.dogs.map((entry) => (ids.includes(String(entry['id'])) ? change(entry) : entry));
  storage.setItem(SAVED_DOGS_KEY, JSON.stringify(stored));
}

/** A slot's heading as text: "Parent 1Sample A". */
export function heading(root: HTMLElement, slot: number): string {
  return root.querySelector(`[data-slot="${slot}"] h2`)?.textContent ?? '';
}

/** The polite region's current text. */
export function spoken(root: HTMLElement): string {
  return root.querySelector('[aria-live]')?.textContent ?? '';
}

/** The data-key of the focused element. */
export function focused(): string | null {
  return document.activeElement?.getAttribute('data-key') ?? null;
}

/** Opens the page in a fixture state, its dogs saved into the storage given or a new one. */
export async function openState(
  query: Readonly<Record<string, string>>,
  options: PageOptions & { readonly storage?: MemoryStorage } = {},
): Promise<Page & { readonly storage: MemoryStorage }> {
  const storage = options.storage ?? new MemoryStorage();
  const start = await stateFromQuery(new URLSearchParams(query), storage);
  return { ...openPage({}, { ...options, ...start, storage }), storage };
}
