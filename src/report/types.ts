import type { ColourGene, ReportFormat } from './loci.ts';

export type Sex = 'male' | 'female';

export type Inheritance = 'AR' | 'AD' | 'XR' | 'XD' | 'MT';

export interface HealthRow {
  /** Condition name, wrapped parts joined and whitespace and dashes normalised. */
  readonly name: string;
  /** Gene as printed; "Confidential" when the report withholds it. */
  readonly gene: string;
  /** Risk variant as printed, with any dash normalised to "-". */
  readonly variant: string;
  readonly copies: number;
  /** Result as printed, e.g. "Clear", "Carrier", "At Risk". */
  readonly result: string;
  /** The current format's Inheritance column; null in the older format, which has none. */
  readonly inheritance: Inheritance | null;
  /** Listed under the report's "known in the breed" conditions. */
  readonly knownInBreed: boolean;
}

/** Copies per variant code, for the colour variants whose rows the report contains. */
export type ColourCopies = Readonly<Partial<Record<ColourGene, Readonly<Record<string, number>>>>>;

export interface Report {
  readonly format: ReportFormat;
  /** The call name when the report has one, otherwise the registered name. */
  readonly name: string | null;
  /** Null when the report's value is not one of M, F, Male or Female. */
  readonly sex: Sex | null;
  readonly breed: string | null;
  /** SHA-256 of the kit or sample ID, hex; the ID itself is not kept. */
  readonly kitIdHash: string | null;
  readonly colour: ColourCopies;
  /** Colour genes with at least one catalogue variant absent from the report. Absent is unknown, never 0. */
  readonly missingLoci: readonly ColourGene[];
  /** Copies of the T-box bobtail variant; null when the Short Tail row is absent. */
  readonly shortTail: number | null;
  readonly health: readonly HealthRow[];
}

export type RejectionKind =
  | 'not-pdf'
  | 'encrypted'
  | 'too-large'
  | 'no-text'
  | 'unreadable-text'
  | 'adobe-pdf-printer'
  | 'not-wisdom-dog'
  | 'unrecognised-layout';

export interface Rejection {
  readonly ok: false;
  readonly kind: RejectionKind;
}

export type ReadResult = { readonly ok: true; readonly report: Report } | Rejection;
