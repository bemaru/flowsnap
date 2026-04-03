import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    fixture: 'src/fixture.ts',
    'generate-html': 'src/generate-html.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  clean: true,
  external: ['@playwright/test'],
});
