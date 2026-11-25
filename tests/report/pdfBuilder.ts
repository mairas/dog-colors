// Builds small PDFs in memory, so pdf.js can be exercised in CI without
// committing any PDF file. Text uses the standard Helvetica font.

export interface TextRun {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface PdfOptions {
  /** Document information entries, e.g. Creator and Producer. */
  readonly info?: Readonly<Record<string, string>>;
  /** Adds a standard security handler whose user password is not empty. */
  readonly encrypted?: boolean;
  /** Adds a security handler with these /Filter, /V and /R entries in place of the standard one's. */
  readonly securityHandler?: string;
  /** Leaves each page's /Contents array unclosed: the document loads, its pages do not. */
  readonly brokenPages?: boolean;
}

const escapeString = (text: string): string => text.replace(/[\\()]/g, '\\$&');

function contentStream(runs: readonly TextRun[]): string {
  return runs
    .map((run) => `BT /F1 ${run.size} Tf 1 0 0 1 ${run.x} ${run.y} Tm (${escapeString(run.text)}) Tj ET`)
    .join('\n');
}

export function buildPdf(pages: readonly (readonly TextRun[])[], options: PdfOptions = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);

  const catalog = add('');
  const pageTree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageRefs = pages.map((runs) => {
    const stream = contentStream(runs);
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> ` +
        (options.brokenPages ? `/Contents [${content} 0 R >>` : `/Contents ${content} 0 R >>`),
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] =
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  const entries = Object.entries(options.info ?? {});
  const info = entries.length > 0
    ? add(`<< ${entries.map(([key, value]) => `/${key} (${escapeString(value)})`).join(' ')} >>`)
    : null;
  const handler = options.securityHandler ?? (options.encrypted ? '/Filter /Standard /V 1 /R 2' : null);
  const encrypt = handler === null
    ? null
    : add(`<< ${handler} /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R`;
  pdf += info === null ? '' : ` /Info ${info} 0 R`;
  pdf += encrypt === null ? '' : ` /Encrypt ${encrypt} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]`;
  pdf += ` >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
