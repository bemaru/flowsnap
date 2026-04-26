# Basic flowsnap Example

This example is a deterministic smoke test that uses `flowsnap/fixture` and the `flowsnap` reporter to generate a local HTML flow report.
It points at the built local reporter in `dist/` so it can run from a source checkout before the package is published or installed.

From the repository root:

```bash
npm install
npm run example:basic
```

If Playwright browsers are not installed yet:

```bash
npx playwright install chromium
npm run example:basic
```

The report is written to `examples/basic/flow-report/index.html`. Generated `flow-report/`, `test-results/`, and `playwright-report/` directories are intentionally ignored by git.
