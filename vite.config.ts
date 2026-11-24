import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Defence in depth: GitHub Pages cannot set response headers, so the policy
// travels in a meta tag. The page reads untrusted PDF text, and this limits
// what a script injection could load or send if text ever reached markup.
// worker-src must also admit the bundled pdf.js worker once it is added.
// `scripts/csp-check.ts` holds the same policy and fails the build check if
// the two disagree.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
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

export default defineConfig({
  // Served as a GitHub Pages project page, under the repository name.
  base: '/dog-colors/',
  plugins: [contentSecurityPolicy()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
