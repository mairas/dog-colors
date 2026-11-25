import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Defence in depth: GitHub Pages cannot set response headers, so the policy
// travels in a meta tag. The page reads untrusted PDF text, and this limits
// what a script injection could load or send if text ever reached markup.
// The pdf.js worker is bundled as a same-origin asset, so worker-src 'self'
// admits it. GoatCounter's count.js is the one script from elsewhere; it sends
// each page view to the count endpoint with sendBeacon.
// `scripts/csp-check.ts` holds the same policy and fails the build check if
// the two disagree.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' https://gc.zgo.at",
  "worker-src 'self'",
  "connect-src 'self' https://mairas.goatcounter.com/count",
  "img-src 'self' data:",
  "style-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

// Build only: the dev server injects inline scripts the policy would block.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

// The dev-only fixture states (src/ui/dev.ts) ship in every mode but
// production, where the constant folds to false and the branch is dropped.
// `./run preview-fixtures` builds them with the policy in force.
export default defineConfig(({ mode }) => ({
  // Served as a GitHub Pages project page, under the repository name.
  base: '/dog-colors/',
  define: { __FIXTURES__: JSON.stringify(mode !== 'production') },
  plugins: [contentSecurityPolicy()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
