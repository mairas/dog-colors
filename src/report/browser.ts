// The page's entry point to the report reader. pdf.js parses in a worker that
// Vite bundles and serves from the site's own origin, as the CSP's
// worker-src 'self' requires.
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export { readReport } from './read.ts';
