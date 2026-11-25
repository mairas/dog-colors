// Lines of a report → Report, or the reason it is not one. Rows are found by
// their content (gene, variant, copies), never by column positions, because
// each PDF producer places the columns differently.
import { displayName, readHeader } from './header.ts';
import {
  COLOUR_GENES,
  COLOUR_VARIANTS,
  printedRow,
  SHORT_TAIL,
  type ColourGene,
  type ColourVariant,
  type ReportFormat,
} from './loci.ts';
import type { Cell, DocumentInfo, Line, PdfText } from './pdfText.ts';
import {
  INHERITANCE_MODES,
  type HealthRow,
  type ReadResult,
  type Rejection,
  type RejectionKind,
  type Sex,
} from './types.ts';

const CURRENT_MARKER = /^Wisdom Panel\S*\s+Genetics Report$/i;
const MYDOGDNA_TITLE = /^DNA Test Report$/i;
const MYDOGDNA_BRAND = /^MyDogDNA$/i;
const WISDOM_MENTION = /wisdom\s*panel|mydogdna/i;
const PAGE_FOOTER = /^page \d+ of \d+$/i;

const ADOBE_PRINTER = /PScript5\.dll|Acrobat Distiller/i;
// Readable reports are about 96% letters and digits once whitespace is
// removed; text from the Windows "Adobe PDF" printer is under half.
const MIN_READABLE_SHARE = 0.6;

const COPIES = /^(\d)(?:\s|$)/;

// Wrapped name and gene fragments sit up to 13 pt from their row's values;
// the next row, or a condition's description, is at least 24 pt away.
const MAX_FRAGMENT_DISTANCE = 14;

/** Joins whitespace and maps typographic dashes and apostrophes to ASCII. */
export function normaliseText(text: string): string {
  return text
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const cellTexts = (lines: readonly Line[]): string[] =>
  lines.flatMap((line) => line.cells.map((cell) => cell.text));

export function detectFormat(lines: readonly Line[]): ReportFormat | null {
  const texts = cellTexts(lines);
  if (texts.some((text) => CURRENT_MARKER.test(text))) {
    return 'current';
  }
  if (texts.some((text) => MYDOGDNA_TITLE.test(text)) && texts.some((text) => MYDOGDNA_BRAND.test(text))) {
    return 'mydogdna';
  }
  return null;
}

function isReadable(texts: readonly string[]): boolean {
  const characters = [...texts.join('').replace(/\s/g, '')];
  const readable = characters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  return readable >= characters.length * MIN_READABLE_SHARE;
}

function unparsedKind(lines: readonly Line[], info: DocumentInfo): RejectionKind {
  const texts = cellTexts(lines);
  const fromAdobePrinter = [info.creator, info.producer].some(
    (value) => value !== null && ADOBE_PRINTER.test(value),
  );
  if (texts.join('').trim() === '') {
    return fromAdobePrinter ? 'adobe-pdf-printer' : 'no-text';
  }
  if (!isReadable(texts)) {
    return fromAdobePrinter ? 'adobe-pdf-printer' : 'unreadable-text';
  }
  return texts.some((text) => WISDOM_MENTION.test(text)) ? 'unrecognised-layout' : 'not-wisdom-dog';
}

function parseCopies(cell: Cell | undefined): number | null {
  const match = cell ? COPIES.exec(cell.text) : null;
  return match?.[1] === undefined ? null : Number(match[1]);
}

export interface TraitRow {
  /** A catalogue colour variant, or the Short Tail row. */
  readonly variant: ColourVariant | 'short-tail';
  readonly copies: number;
  readonly line: Line;
}

/** Finds every catalogue colour row and the Short Tail row, by gene + code + copies on one line. */
export function findTraitRows(lines: readonly Line[], format: ReportFormat): TraitRow[] {
  const entries = [
    ...COLOUR_VARIANTS.map((variant) => ({ variant, printed: printedRow(format, variant) })),
    { variant: 'short-tail' as const, printed: SHORT_TAIL },
  ];
  const rows: TraitRow[] = [];
  for (const line of lines) {
    line.cells.forEach((cell, index) => {
      const code = line.cells[index + 1];
      const copies = parseCopies(line.cells[index + 2]);
      if (!code || copies === null) {
        return;
      }
      const name = normaliseText(line.cells[index - 1]?.text ?? '');
      const entry = entries.find(
        ({ printed }) =>
          printed.gene === cell.text &&
          printed.code === normaliseText(code.text) &&
          (printed.name === undefined || printed.name === name),
      );
      if (entry) {
        rows.push({ variant: entry.variant, copies, line });
      }
    });
  }
  return rows;
}

type LineRole = 'trait-header' | 'health-header' | 'health-row' | 'other';

interface Anchor {
  readonly index: number;
  readonly y: number;
  readonly copiesIndex: number;
  readonly knownInBreed: boolean;
  readonly headerNameParts: readonly Cell[];
  /** The section title and table header lines the row depends on. */
  readonly context: readonly Line[];
}

export interface SourcedHealthRow {
  readonly row: HealthRow;
  /** The lines the row was read from: section title, table header, values and wrapped fragments. */
  readonly lines: readonly Line[];
}

const hasCell = (line: Line, text: string): boolean =>
  line.cells.some((cell) => cell.text.toLowerCase() === text.toLowerCase());

function headerRole(line: Line): LineRole | null {
  if (!hasCell(line, 'Gene') || !hasCell(line, 'Copies')) {
    return null;
  }
  if (hasCell(line, 'Risk Variant')) {
    return 'health-header';
  }
  return hasCell(line, 'Variant') ? 'trait-header' : null;
}

function healthCopiesIndex(line: Line): number | null {
  for (let index = line.cells.length - 2; index >= 1; index--) {
    if (/^\d$/.test(line.cells[index]?.text ?? '')) {
      return index;
    }
  }
  return null;
}

const isPageFurniture = (line: Line): boolean =>
  line.cells.some((cell) => CURRENT_MARKER.test(cell.text) || PAGE_FOOTER.test(cell.text));

const right = (cell: Cell): number => cell.x + cell.width;

function joinCells(cells: readonly { cell: Cell; y: number }[]): string {
  return normaliseText(
    [...cells]
      .sort((a, b) => b.y - a.y || a.cell.x - b.cell.x)
      .map(({ cell }) => cell.text)
      .join(' '),
  );
}

/** Index of the first item for which `isAfter` holds, in items sorted so that it holds for a suffix. */
function firstWhere<T>(sorted: readonly T[], isAfter: (item: T) => boolean): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const item = sorted[middle];
    if (item !== undefined && isAfter(item)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/**
 * The anchor a fragment line belongs to: the nearest within the fragment
 * distance, and of equally near ones the latest in the document. `group`
 * holds the anchors that share the line's page and have no table header
 * between them and the line, sorted by baseline and then document order.
 */
function nearestAnchor(group: readonly Anchor[], y: number): Anchor | undefined {
  const firstAbove = firstWhere(group, (anchor) => anchor.y >= y);
  const below = group[firstAbove - 1];
  const nearestAbove = group[firstAbove];
  // Of anchors on one baseline, the latest is last.
  const above = nearestAbove && group[firstWhere(group, (anchor) => anchor.y > nearestAbove.y) - 1];
  const belowDistance = below ? y - below.y : Number.POSITIVE_INFINITY;
  const aboveDistance = above ? above.y - y : Number.POSITIVE_INFINITY;
  const nearest =
    belowDistance < aboveDistance || (belowDistance === aboveDistance && (below?.index ?? 0) > (above?.index ?? 0))
      ? below
      : above;
  const distance = Math.min(belowDistance, aboveDistance);
  return distance <= MAX_FRAGMENT_DISTANCE ? nearest : undefined;
}

/** Finds the rows of the health tables, which are introduced by a header line with a "Risk Variant" column. */
export function findHealthRows(lines: readonly Line[], format: ReportFormat): SourcedHealthRow[] {
  const roles: LineRole[] = [];
  // Per line, its page and the count of table headers up to it: a fragment
  // line and an anchor share the key when no header lies between them.
  const groupKeys: string[] = [];
  let headers = 0;
  const anchors: Anchor[] = [];
  let inHealthTable = false;
  let knownInBreed = false;
  let sectionTitle: Line | null = null;
  let tableHeader: Line | null = null;
  let pendingNameParts: Cell[] = [];

  lines.forEach((line, index) => {
    const texts = line.cells.map((cell) => cell.text);
    if (texts.some((text) => /known in (the|this) breed/i.test(text))) {
      knownInBreed = true;
      sectionTitle = line;
    } else if (texts.some((text) => /^other (health )?conditions tested/i.test(text))) {
      knownInBreed = false;
      sectionTitle = line;
    }
    const header = headerRole(line);
    headers += header ? 1 : 0;
    groupKeys.push(`${line.page} ${headers}`);
    if (header) {
      roles.push(header);
      inHealthTable = header === 'health-header';
      tableHeader = line;
      const gene = line.cells.find((cell) => cell.text.toLowerCase() === 'gene');
      // In the current format a condition's name is set beside its column headers.
      pendingNameParts = line.cells.filter(
        (cell) => gene && right(cell) <= gene.x && cell.text.toLowerCase() !== 'genetic condition',
      );
      return;
    }
    const copiesIndex = inHealthTable ? healthCopiesIndex(line) : null;
    if (copiesIndex === null) {
      roles.push('other');
      return;
    }
    roles.push('health-row');
    anchors.push({
      index,
      y: line.y,
      copiesIndex,
      knownInBreed,
      headerNameParts: pendingNameParts,
      context: [sectionTitle, tableHeader].filter((context) => context !== null),
    });
    pendingNameParts = [];
  });

  const groups = new Map<string, Anchor[]>();
  // A baseline that is not a finite number is never within the fragment distance.
  for (const anchor of anchors.filter(({ y }) => Number.isFinite(y))) {
    const key = groupKeys[anchor.index] ?? '';
    const group = groups.get(key);
    if (group) {
      group.push(anchor);
    } else {
      groups.set(key, [anchor]);
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.y - b.y || a.index - b.index);
  }

  const fragments = new Map<number, Line[]>();
  lines.forEach((line, index) => {
    if (roles[index] !== 'other' || isPageFurniture(line) || !Number.isFinite(line.y)) {
      return;
    }
    const nearest = nearestAnchor(groups.get(groupKeys[index] ?? '') ?? [], line.y);
    const attached = nearest && fragments.get(nearest.index);
    if (attached) {
      attached.push(line);
    } else if (nearest) {
      fragments.set(nearest.index, [line]);
    }
  });

  return anchors.flatMap((anchor) => {
    const line = lines[anchor.index];
    const row = line && healthRow(line, anchor, fragments.get(anchor.index) ?? [], format);
    return row ? [row] : [];
  });
}

function healthRow(
  line: Line,
  anchor: Anchor,
  fragmentLines: readonly Line[],
  format: ReportFormat,
): SourcedHealthRow | null {
  const { cells } = line;
  const variant = cells[anchor.copiesIndex - 1];
  const copies = parseCopies(cells[anchor.copiesIndex]);
  const after = cells.slice(anchor.copiesIndex + 1);
  const [inheritanceCell, resultCell] = format === 'current' ? after : [undefined, ...after];
  if (!variant || copies === null || !resultCell) {
    return null;
  }
  const leftCells = cells.slice(0, anchor.copiesIndex - 1);
  const fragmentCells = fragmentLines.flatMap((fragment) =>
    fragment.cells.filter((cell) => right(cell) <= variant.x).map((cell) => ({ cell, y: fragment.y })),
  );

  let geneParts: { cell: Cell; y: number }[];
  let nameParts: { cell: Cell; y: number }[];
  const [first] = leftCells;
  if (leftCells.length === 1 && first && fragmentCells.some(({ cell }) => cell.x >= right(first))) {
    // A lone cell with fragments to its right is the name; the gene wrapped around the row.
    geneParts = fragmentCells.filter(({ cell }) => cell.x >= right(first));
    nameParts = [{ cell: first, y: line.y }];
  } else {
    const gene = leftCells.at(-1);
    if (!gene) {
      return null;
    }
    geneParts = [{ cell: gene, y: line.y }];
    nameParts = [
      ...leftCells.slice(0, -1).map((cell) => ({ cell, y: line.y })),
      ...fragmentCells.filter(({ cell }) => right(cell) <= gene.x),
    ];
  }
  const name = joinCells([
    ...anchor.headerNameParts.map((cell) => ({ cell, y: Number.POSITIVE_INFINITY })),
    ...nameParts,
  ]);
  const inheritance = INHERITANCE_MODES.find((mode) => mode === inheritanceCell?.text) ?? null;
  return {
    row: {
      name,
      gene: joinCells(geneParts),
      variant: normaliseText(variant.text),
      copies,
      result: normaliseText(resultCell.text),
      inheritance,
      knownInBreed: anchor.knownInBreed,
    },
    lines: [...anchor.context, line, ...fragmentLines],
  };
}

const SEXES: ReadonlyMap<string, Sex> = new Map([
  ['m', 'male'],
  ['male', 'male'],
  ['f', 'female'],
  ['female', 'female'],
]);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function colourCopies(rows: readonly TraitRow[]): Map<ColourGene, Record<string, number>> {
  const colour = new Map<ColourGene, Record<string, number>>();
  for (const { variant, copies } of rows) {
    if (variant === 'short-tail') {
      continue;
    }
    const codes = colour.get(variant.gene) ?? {};
    // A variant printed twice keeps its first reading.
    codes[variant.code] ??= copies;
    colour.set(variant.gene, codes);
  }
  return colour;
}

export async function parseReport(text: PdfText): Promise<ReadResult> {
  const { lines, info } = text;
  const format = detectFormat(lines);
  if (format === null) {
    const rejection: Rejection = { ok: false, kind: unparsedKind(lines, info) };
    return rejection;
  }
  const traitRows = findTraitRows(lines, format);
  const health = findHealthRows(lines, format).map(({ row }) => row);
  if (traitRows.length === 0 && health.length === 0) {
    return { ok: false, kind: 'unrecognised-layout' };
  }

  const colour = colourCopies(traitRows);
  const missingLoci = COLOUR_GENES.filter((gene) =>
    COLOUR_VARIANTS.some(
      (variant) => variant.gene === gene && colour.get(gene)?.[variant.code] === undefined,
    ),
  );
  const header = readHeader(lines);
  return {
    ok: true,
    report: {
      format,
      name: displayName(header, format),
      sex: SEXES.get(header.sex?.toLowerCase() ?? '') ?? null,
      breed: header.breed,
      kitIdHash: header.kitId === null ? null : await sha256Hex(header.kitId),
      colour: Object.fromEntries(colour),
      missingLoci,
      shortTail: traitRows.find((row) => row.variant === 'short-tail')?.copies ?? null,
      health,
    },
  };
}
