// Verifies that a production build carries none of the dev-only fixture
// states (src/ui/dev.ts): its entry point, its state names, and the
// placeholder names and IDs of the committed fixtures it embeds. The build
// drops them only while main.ts guards the import with __FIXTURES__ and
// vite.config.ts defines it false in production; this catches a change to
// either. The markers are written out here rather than imported from dev.ts,
// so that the check stays an independent statement of intent.
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

const STATE_NAMES = [
  'slot-empty',
  'results-hidden',
  'slot-reading',
  'slot-error',
  'slot-loaded',
  'slot-questions',
  'slot-unanswerable',
  'slot-missing',
  'list-none-chosen',
  'list-chosen',
  'list-narrowed',
  'list-all-shown',
  'list-no-match',
  'list-many',
  'list-reading',
  'list-rejected',
  'list-same-dog',
  'open-same-dog',
  'list-stale',
  'stale-chosen',
  'results-populated',
  'results-ranges',
  'results-warnings',
  'results-partial',
  'results-health-unknown',
  'results-failed',
  'list-undo',
  'open-undo',
  'clear-asking',
  'storage-refused',
  'storage-full',
  'page-outdated',
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MARKERS: readonly RegExp[] = [
  /\bstateFromQuery\b/,
  ...STATE_NAMES.map((name) => new RegExp(`\\b${escape(name)}\\b`)),
  // The fixtures' placeholders: "Sample A", "KIT000A", an all-zero microchip number.
  /\bSample [A-Z]\b/,
  /KIT000/,
  /0{15}/,
];

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt']);
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs']);

/** Each problem names a file and the marker found in it; an empty list means the build is clean. */
export function findFixtureMarkers(files: ReadonlyMap<string, string>): string[] {
  if (![...files.keys()].some((path) => SCRIPT_EXTENSIONS.has(extname(path)))) {
    return ['no JavaScript file in the build'];
  }
  return [...files].flatMap(([path, text]) =>
    MARKERS.flatMap((marker) => {
      const found = marker.exec(text);
      return found === null ? [] : [`${path} contains "${found[0]}"`];
    }),
  );
}

/** The build's text files by path relative to the directory, with / separators, in path order. */
export function readBuild(directory: string): Map<string, string> {
  const paths = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .sort();
  return new Map(paths.map((path) => [path.split(sep).join('/'), readFileSync(join(directory, path), 'utf8')]));
}

if (import.meta.main) {
  const directory = process.argv[2] ?? 'dist';
  const problems = findFixtureMarkers(readBuild(directory));
  if (problems.length > 0) {
    console.error(`${directory}: the build carries dev-only fixture code`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
  console.log(`${directory}: no dev-only fixture code in the build`);
}
