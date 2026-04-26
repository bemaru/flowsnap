import { defineConfig } from '@playwright/test';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const flowsnapReporter = path.join(repoRoot, 'dist/index.js');

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    [flowsnapReporter, { outputDir: path.join(repoRoot, 'examples/basic/flow-report') }],
  ],
  use: {
    browserName: 'chromium',
  },
});
