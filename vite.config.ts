import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> regular multi-file build in dist/
// `npm run build:single` -> one self-contained HTML file in dist-single/ (handy for sharing / phones)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    environment: 'node',
    include: process.env.PROBE ? ['scripts/**/*.probe.ts'] : process.env.SLOW ? ['tests/**/*.slow.ts'] : ['tests/**/*.test.ts'],
  },
}));
