// Header fields of a report's first page, read by label. Both formats print
// labels in columns with each value on the line below; the current format's
// page header also prints "Label: value" pairs. Every field is untrusted text.
import type { ReportFormat } from './loci.ts';
import type { Cell, Line } from './pdfText.ts';

export interface HeaderFields {
  /** The current format's profile name, from the "<name>'s Profile" title. */
  readonly profileName: string | null;
  readonly registeredName: string | null;
  /** The older format's "Nickname (Call Name)". */
  readonly callName: string | null;
  /** As printed; the parser decides whether it is a sex it knows. */
  readonly sex: string | null;
  readonly breed: string | null;
  readonly kitId: string | null;
  readonly microchip: string | null;
  readonly registration: string | null;
  readonly birthDate: string | null;
  readonly testDate: string | null;
  readonly tattoo: string | null;
  readonly ownerFirstName: string | null;
  readonly ownerLastName: string | null;
}

type Field = keyof HeaderFields;

const BLOCK_LABELS: ReadonlyMap<string, Field> = new Map([
  ['registered name', 'registeredName'],
  ['nickname (call name)', 'callName'],
  ['sex', 'sex'],
  ['owner reported breed', 'breed'],
  ['sample id', 'kitId'],
  ['microchip number', 'microchip'],
  ['microchip id', 'microchip'],
  ['registration', 'registration'],
  ['date of birth', 'birthDate'],
  ['tattoo id', 'tattoo'],
  ['first name', 'ownerFirstName'],
  ['last name', 'ownerLastName'],
]);

// Labels the block holds whose values identify no one; recognising them keeps
// their values from being read as anything else.
const IGNORED_BLOCK_LABELS = new Set(['country of origin']);

const INLINE_LABELS: ReadonlyMap<string, Field> = new Map([
  ['breed', 'breed'],
  ['microchip number', 'microchip'],
  ['registration number', 'registration'],
  ['registration', 'registration'],
  ['birth date', 'birthDate'],
  ['test date', 'testDate'],
  ['id kit', 'kitId'],
  ['sample id', 'kitId'],
]);

const PROFILE_TITLE = /^(.+?)['’]s Profile$/;
const INLINE_PAIR = /^([^:]+):\s*(.+)$/;

// A value sits on the next line, a dozen points below its label.
const MAX_VALUE_DROP = 20;
// Labels and values share a left edge; allow for rounding between producers.
const ALIGNMENT_TOLERANCE = 2;

const labelKey = (text: string): string => text.trim().toLowerCase();

const isBlockLabel = (cell: Cell): boolean => {
  const key = labelKey(cell.text);
  return BLOCK_LABELS.has(key) || IGNORED_BLOCK_LABELS.has(key);
};

function labelAbove(labels: readonly Cell[], value: Cell): Cell | undefined {
  return labels.find(
    (label) =>
      value.x >= label.x - ALIGNMENT_TOLERANCE && value.x <= label.x + label.width,
  );
}

export function readHeader(lines: readonly Line[]): HeaderFields {
  const fields: Record<Field, string | null> = {
    profileName: null,
    registeredName: null,
    callName: null,
    sex: null,
    breed: null,
    kitId: null,
    microchip: null,
    registration: null,
    birthDate: null,
    testDate: null,
    tattoo: null,
    ownerFirstName: null,
    ownerLastName: null,
  };
  const set = (field: Field, value: string): void => {
    const trimmed = value.trim();
    if (fields[field] === null && trimmed !== '') {
      fields[field] = trimmed;
    }
  };

  const firstPage = lines.filter((line) => line.page === 1);
  firstPage.forEach((line, index) => {
    for (const cell of line.cells) {
      const profile = PROFILE_TITLE.exec(cell.text);
      if (profile?.[1]) {
        set('profileName', profile[1]);
      }
      const pair = INLINE_PAIR.exec(cell.text);
      const inlineField = pair?.[1] ? INLINE_LABELS.get(labelKey(pair[1])) : undefined;
      if (inlineField && pair?.[2]) {
        set(inlineField, pair[2]);
      }
    }

    const labels = line.cells.filter(isBlockLabel);
    const next = firstPage[index + 1];
    if (
      labels.length === 0 ||
      !next ||
      line.y - next.y > MAX_VALUE_DROP ||
      next.cells.some(isBlockLabel)
    ) {
      return;
    }
    for (const value of next.cells) {
      const label = labelAbove(labels, value);
      const field = label ? BLOCK_LABELS.get(labelKey(label.text)) : undefined;
      if (field) {
        set(field, value.text);
      }
    }
  });
  return fields;
}

/** The name a report goes by: its profile name (current format) or call name (older format), else its registered name. */
export function displayName(header: HeaderFields, format: ReportFormat): string | null {
  return (format === 'current' ? header.profileName : header.callName) ?? header.registeredName;
}
