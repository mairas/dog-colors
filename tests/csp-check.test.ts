import { describe, expect, it } from 'vitest';
import { findCspProblems } from '../scripts/csp-check.ts';

const POLICY =
  "default-src 'none'; script-src 'self' https://gc.zgo.at; worker-src 'self'; " +
  "connect-src 'self' https://mairas.goatcounter.com/count; " +
  "img-src 'self' data:; style-src 'self'; font-src 'self'; " +
  "form-action 'none'; base-uri 'none'; object-src 'none'";

function page(head: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8" />${head}</head><body></body></html>`;
}

const meta = (policy: string): string =>
  `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
const script = '<script type="module" crossorigin src="/dog-colors/assets/index.js"></script>';

describe('findCspProblems', () => {
  it('accepts the policy placed before the first script', () => {
    expect(findCspProblems(page(meta(POLICY) + script))).toEqual([]);
  });

  it('decodes character references in the attribute, as Vite escapes quotes', () => {
    const escaped = POLICY.replaceAll("'", '&#39;').replace('data:', '&#x64;ata:');
    expect(findCspProblems(page(meta(escaped) + script))).toEqual([]);
  });

  it('ignores directive order and extra whitespace', () => {
    const reordered = POLICY.split('; ').reverse().join(' ;  ');
    expect(findCspProblems(page(meta(reordered) + script))).toEqual([]);
  });

  it('rejects a page without the meta tag', () => {
    expect(findCspProblems(page(script))).toEqual([
      'expected exactly one Content-Security-Policy meta tag, found 0',
    ]);
  });

  it('rejects two meta tags', () => {
    expect(findCspProblems(page(meta(POLICY) + meta(POLICY) + script))).toEqual([
      'expected exactly one Content-Security-Policy meta tag, found 2',
    ]);
  });

  it('rejects a meta tag that comes after a script, which it would not govern', () => {
    expect(findCspProblems(page(script + meta(POLICY)))).toEqual([
      'the Content-Security-Policy meta tag must precede every script, link and style element',
    ]);
  });

  it('rejects a meta tag outside the head', () => {
    const html = page(script).replace('<body>', `<body>${meta(POLICY)}`);
    expect(findCspProblems(html)).toContain(
      'the Content-Security-Policy meta tag must be inside <head>',
    );
  });

  it('rejects a weakened directive', () => {
    const weakened = POLICY.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(findCspProblems(page(meta(weakened) + script))).toEqual([
      "script-src is \"'self' 'unsafe-inline' https://gc.zgo.at\", expected \"'self' https://gc.zgo.at\"",
    ]);
  });

  it('rejects connect-src widened from the count endpoint to its whole host', () => {
    const widened = POLICY.replace('goatcounter.com/count', 'goatcounter.com');
    expect(findCspProblems(page(meta(widened) + script))).toEqual([
      "connect-src is \"'self' https://mairas.goatcounter.com\", expected \"'self' https://mairas.goatcounter.com/count\"",
    ]);
  });

  it('rejects a missing directive', () => {
    const missing = POLICY.replace("; object-src 'none'", '');
    expect(findCspProblems(page(meta(missing) + script))).toEqual([
      "object-src is missing, expected \"'none'\"",
    ]);
  });

  it('rejects an unexpected directive', () => {
    const extra = `${POLICY}; frame-src https:`;
    expect(findCspProblems(page(meta(extra) + script))).toEqual([
      'frame-src is not part of the expected policy',
    ]);
  });
});
