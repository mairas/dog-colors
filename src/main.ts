import './styles.css';
import type { ReadResult } from './report/types.ts';
import { startApp } from './ui/app.ts';

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

startApp(root, { read });
