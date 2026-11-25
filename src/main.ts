import './styles.css';
import type { ReadResult } from './report/types.ts';
import { startApp, type AppState } from './ui/app.ts';
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

async function fixtureState(): Promise<AppState | undefined> {
  const params = new URLSearchParams(window.location.search);
  if (!__FIXTURES__ || (!params.has('state') && !params.has('fixtures'))) {
    return undefined;
  }
  const { stateFromQuery } = await import('./ui/dev.ts');
  return stateFromQuery(params);
}

async function main(): Promise<void> {
  const initial = await fixtureState();
  startApp(root, { read, ...(initial === undefined ? {} : { initial }) });
}

void main();
// After the app starts, so a footer fault cannot stop it.
wireDogsDialog(document);
