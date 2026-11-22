import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sataplanner/game-data': `${root}packages/game-data/src/index.ts`,
      '@sataplanner/engine': `${root}packages/engine/src/index.ts`,
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
  },
});
