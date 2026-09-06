import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Node environment (not jsdom) — everything tested so far is pure logic
// extracted from page/component files, not component rendering. Switch to
// jsdom + @testing-library/react if/when a real interactive-component test
// is added; no reason to install/configure that until there's a test that
// needs it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
