import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The installed pdfjs-dist version, as its package.json states it. */
export function pdfjsDistVersion(): string {
  const path = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest) || typeof manifest.version !== 'string') {
    throw new Error(`${path} states no version`);
  }
  return manifest.version;
}
