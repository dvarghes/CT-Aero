import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pagesBase = '/CT-Aero/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? pagesBase : '/',
  plugins: [
    react(),
    {
      name: 'github-pages-spa',
      apply: 'build',
      closeBundle() {
        const dist = path.resolve('dist');
        fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
        fs.writeFileSync(path.join(dist, '.nojekyll'), '');
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](@carbon[\\/]charts|d3-|d3$)/,
              priority: 30,
            },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
}));
