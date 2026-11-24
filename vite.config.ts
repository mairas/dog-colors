import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served as a GitHub Pages project page, under the repository name.
  base: '/dog-colors/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
