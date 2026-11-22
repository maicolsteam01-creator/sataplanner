import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Base relativa: funciona en la raíz, en un subdirectorio (GitHub Pages)
  // o en cualquier hosting estático sin recompilar.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@sataplanner/game-data': `${root}../../packages/game-data/src/index.ts`,
      '@sataplanner/engine': `${root}../../packages/engine/src/index.ts`,
    },
  },
  server: {
    // Escucha en todas las interfaces para abrir la app desde el celular
    // en la misma red WiFi. Vite imprime la URL "Network" al arrancar.
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
