// Verifies that a built index.html carries the Content-Security-Policy meta
// tag, placed where it governs every resource, with exactly the policy below.
// The expected policy is written out here rather than imported from
// vite.config.ts so that the check stays an independent statement of intent.
import { readFileSync } from 'node:fs';

const EXPECTED_POLICY: ReadonlyMap<string, string> = new Map([
  ['default-src', "'none'"],
  ['script-src', "'self'"],
  ['worker-src', "'self'"],
  ['connect-src', "'self'"],
  ['img-src', "'self' data:"],
  ['style-src', "'self'"],
  ['font-src', "'self'"],
  ['form-action', "'none'"],
  ['base-uri', "'none'"],
  ['object-src', "'none'"],
]);

const CSP_META = /<meta\s[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi;
const CONTENT_ATTR = /\scontent="([^"]*)"/i;
// A meta CSP only applies to resources requested after the parser reaches it.
const RESOURCE_ELEMENT = /<(script|link|style)[\s>]/i;

// Vite writes quotes in attribute values as character references. An
// unrecognised named reference is left as is and fails the comparison.
const NAMED_REFERENCES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['quot', '"'],
  ['lt', '<'],
  ['gt', '>'],
]);

function decodeAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (reference, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      return String.fromCodePoint(Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return NAMED_REFERENCES.get(body.toLowerCase()) ?? reference;
  });
}

function parsePolicy(policy: string): Map<string, string> {
  const directives = new Map<string, string>();
  for (const directive of policy.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) {
      directives.set(name.toLowerCase(), sources.join(' '));
    }
  }
  return directives;
}

export function findCspProblems(html: string): string[] {
  const metas = [...html.matchAll(CSP_META)];
  const [meta] = metas;
  if (metas.length !== 1 || !meta) {
    return [`expected exactly one Content-Security-Policy meta tag, found ${metas.length}`];
  }

  const problems: string[] = [];
  const headEnd = html.search(/<\/head>/i);
  if (headEnd === -1 || meta.index > headEnd) {
    problems.push('the Content-Security-Policy meta tag must be inside <head>');
  }
  const firstResource = html.search(RESOURCE_ELEMENT);
  if (firstResource !== -1 && firstResource < meta.index) {
    problems.push(
      'the Content-Security-Policy meta tag must precede every script, link and style element',
    );
  }

  const content = CONTENT_ATTR.exec(meta[0])?.[1];
  if (content === undefined) {
    problems.push('the Content-Security-Policy meta tag has no content attribute');
    return problems;
  }
  const actual = parsePolicy(decodeAttribute(content));
  for (const [name, expected] of EXPECTED_POLICY) {
    const sources = actual.get(name);
    if (sources === undefined) {
      problems.push(`${name} is missing, expected "${expected}"`);
    } else if (sources !== expected) {
      problems.push(`${name} is "${sources}", expected "${expected}"`);
    }
  }
  for (const name of actual.keys()) {
    if (!EXPECTED_POLICY.has(name)) {
      problems.push(`${name} is not part of the expected policy`);
    }
  }
  return problems;
}

if (import.meta.main) {
  const path = process.argv[2] ?? 'dist/index.html';
  const problems = findCspProblems(readFileSync(path, 'utf8'));
  if (problems.length > 0) {
    console.error(`${path}: Content-Security-Policy check failed`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
  console.log(`${path}: Content-Security-Policy meta tag is present and correct`);
}
