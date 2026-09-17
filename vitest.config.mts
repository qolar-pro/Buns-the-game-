import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match the `@/…` alias the app uses. Without it, any system that reaches the
  // sound manager — which is most of them — cannot be unit tested at all, and
  // the tests quietly shape themselves around what happens to import cleanly.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
