import './styles.css';
import type { ReadResult } from './report/types.ts';
import { startApp, type AppOptions } from './ui/app.ts';
import { wireDogsDialog } from './ui/dogs.ts';

const found = document.querySelector<HTMLElement>('#app');
if (!found) {
  throw new Error('index.html is missing the #app element');
}
const root = found;

// pdf.js is about 1.8 MB, so it loads with the first file instead of delaying the first paint.
async function read(file: File): Promise<ReadResult> {
  const { readReport } = await import('./report/browser.ts');
  return readReport(file);
}

/** A fixture state's starting slots, storage and any staged failure, when the dev-only query asks for one. */
async function devOptions(): Promise<Pick<AppOptions, 'initial' | 'storage' | 'predictPuppies'>> {
  const params = new URLSearchParams(window.location.search);
  if (!__FIXTURES__ || (!params.has('state') && !params.has('fixtures'))) {
    return {};
  }
  const { fixtureOptions } = await import('./ui/dev.ts');
  return fixtureOptions(params);
}

async function main(): Promise<void> {
  startApp(root, { read, ...(await devOptions()) });
}

void main();
// After the app starts, so a footer fault cannot stop it.
wireDogsDialog(document);
