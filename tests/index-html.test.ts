import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPECTED_POLICY } from '../scripts/csp-check.ts';

const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag);
const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];

describe('index.html', () => {
  const external = scripts.filter((tag) => /^(https?:)?\/\//.test(attribute(tag, 'src') ?? ''));

  it('loads only GoatCounter from another origin', () => {
    expect(external.map((tag) => attribute(tag, 'src'))).toEqual(['https://gc.zgo.at/count.v5.js']);
  });

  it('pins each external script by hash', () => {
    for (const tag of external) {
      expect(attribute(tag, 'integrity'), tag).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
      expect(attribute(tag, 'crossorigin'), tag).toBe('anonymous');
    }
  });

  it('counts to an endpoint the policy lets the beacon reach', () => {
    const endpoint = external.map((tag) => attribute(tag, 'data-goatcounter'))[0];
    expect(endpoint).toBe('https://mairas.goatcounter.com/count');
    expect(EXPECTED_POLICY.get('connect-src')?.split(' ')).toContain(endpoint);
  });
});
