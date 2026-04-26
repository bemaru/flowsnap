# flowsnap

**Capture E2E test flows as visual documents.**

[![npm version](https://img.shields.io/npm/v/flowsnap.svg)](https://www.npmjs.com/package/flowsnap)
[![license](https://img.shields.io/npm/l/flowsnap.svg)](https://github.com/bemaru/flowsnap/blob/main/LICENSE)
[![CI](https://github.com/bemaru/flowsnap/actions/workflows/ci.yml/badge.svg)](https://github.com/bemaru/flowsnap/actions/workflows/ci.yml)

flowsnap is a Playwright reporter that turns your E2E tests into visual flow documents. It captures screenshots at each page navigation and connects them with arrows, producing a self-contained HTML report you can open anywhere -- no server required.

---

## What It Does

When your Playwright tests run, flowsnap:

1. Captures screenshots on every page navigation (or at test end, depending on mode)
2. Records URL transitions and generates descriptive labels automatically
3. Outputs a [CTRF](https://ctrf.io)-compliant JSON report with flow data in `test.extra.flow`
4. Generates a self-contained HTML report with an interactive sidebar, flow lanes, screenshot gallery, and search/filter

---

## Installation

```bash
npm install flowsnap -D
```

Requires `@playwright/test` >= 1.40.0 as a peer dependency.

---

## Quick Start

flowsnap offers two modes depending on how much detail you need.

### Mode 1: Reporter Only (Zero Config)

Add flowsnap to your reporter array in `playwright.config.ts`. No other changes needed.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['flowsnap'],
  ],
});
```

This mode captures Playwright's built-in end-of-test screenshots. You get one screenshot per test -- useful for a quick visual summary without modifying any test files.

### Mode 2: Full Flow (Fixture)

Import `test` and `expect` from `flowsnap/fixture` instead of `@playwright/test`. This hooks into page navigation events and captures a screenshot at every URL change.

```typescript
// tests/example.spec.ts

// Replace this:
// import { test, expect } from '@playwright/test';

// With this:
import { test, expect } from 'flowsnap/fixture';

test('user login flow', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('text=Sign In');
  await page.fill('#email', 'user@example.com');
  await page.fill('#password', 'password');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL('/dashboard');
});
```

Each navigation triggers a screenshot automatically. The final report shows every step connected by arrows, forming a visual flow of the user journey.

You still need the reporter in `playwright.config.ts`:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['flowsnap'],
  ],
});
```

---

## Example / Demo

A deterministic example lives in [`examples/basic`](./examples/basic). It stubs a small checkout flow locally with Playwright routing, then writes a flowsnap report.

From the repository root:

```bash
npm install
npm run example:basic
```

If Chromium is not installed yet:

```bash
npx playwright install chromium
npm run example:basic
```

Open `examples/basic/flow-report/index.html` after the run. Generated reports and Playwright output are ignored by git.

---

## Configuration

Pass options as the second element of the reporter tuple:

```typescript
reporter: [
  ['flowsnap', {
    outputDir: './flow-report',  // Output directory (default: './flow-report')
    generateHtml: true,          // Generate HTML report (default: true)
  }],
],
```

### `FlowReporterOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `outputDir` | `string` | `'./flow-report'` | Directory for the JSON report, HTML report, and screenshots |
| `generateHtml` | `boolean` | `true` | Whether to auto-generate the HTML report after test run |

---

## Output

After running `npx playwright test`, the output directory contains:

```
flow-report/
  ctrf-report.json        # CTRF-compliant test report with flow data
  index.html              # Self-contained HTML report (all screenshots inlined as base64)
  screenshots/            # Raw screenshot files
    test-name-a0-0.png
    test-name-a0-1.png
    ...
```

The HTML report is fully self-contained -- screenshots are embedded as base64 data URIs. You can share the single `index.html` file and it works offline.

### HTML Report Features

- **Sidebar** with project tree, test search, and status filters (pass/fail/skip)
- **Flow lanes** showing each test as a horizontal strip of connected screenshots
- **Screenshot gallery** modal with keyboard navigation (arrow keys, Escape)
- **Error display** for failed tests with stack traces
- **Responsive** layout with mobile sidebar toggle

---

## CTRF Extension: `extra.flow`

flowsnap outputs standard [CTRF](https://ctrf.io) (Common Test Report Format) JSON. Flow-specific data is stored in the `extra.flow` namespace on each test, keeping the report fully compatible with other CTRF tools.

```json
{
  "reportFormat": "CTRF",
  "specVersion": "0.0.0",
  "results": {
    "tool": { "name": "playwright" },
    "summary": { "tests": 5, "passed": 4, "failed": 1, "..." : "..." },
    "tests": [
      {
        "name": "user login flow",
        "status": "passed",
        "duration": 3200,
        "extra": {
          "flow": {
            "screenshots": [
              {
                "id": "default-user-login-flow-0",
                "url": "https://example.com/",
                "previousUrl": null,
                "timestamp": 1700000000000,
                "screenshotPath": "screenshots/default-user-login-flow-a0-0.png",
                "label": "Start: /"
              },
              {
                "id": "default-user-login-flow-1",
                "url": "https://example.com/login",
                "previousUrl": "https://example.com/",
                "timestamp": 1700000001000,
                "screenshotPath": "screenshots/default-user-login-flow-a0-1.png",
                "label": "/login navigate"
              }
            ],
            "edges": [
              {
                "from": "default-user-login-flow-0",
                "to": "default-user-login-flow-1",
                "label": "/login navigate"
              }
            ]
          }
        }
      }
    ]
  }
}
```

### Flow Data Types

- **`FlowScreenshot`** -- id, url, previousUrl, timestamp, screenshotPath, label
- **`FlowEdge`** -- from (screenshot id), to (screenshot id), optional label

This structure allows other tools to consume the CTRF report normally while ignoring the `extra.flow` extension, or to build custom visualizations on top of the flow data.

---

## Retry Handling

flowsnap automatically merges retries. When a test is retried, only the final attempt's screenshots are kept. Previous attempt screenshots are cleaned up from disk to avoid clutter.

---

## Programmatic HTML Generation

You can generate (or regenerate) the HTML report from an existing CTRF JSON file:

```typescript
import { generateFlowHtml } from 'flowsnap';

await generateFlowHtml('./flow-report/ctrf-report.json', './flow-report/index.html');
```

Or from the command line by running the generate-html module directly.

---

## Maintainer Checks

Before publishing or cutting a release tag, run:

```bash
npm run check
npm pack --dry-run
```

For a smoke test that exercises the fixture and reporter together:

```bash
npm run example:basic
```

The release workflow publishes only from `v*` tags and now verifies that the pushed tag matches `package.json` (for example, `v0.0.3` for version `0.0.3`).

### Public-readiness Caveats

- This package is still pre-1.0. Treat APIs and report shape as subject to change until a stable release is declared.
- Automated coverage is currently limited to typecheck/build and the example smoke path. Add focused unit or integration tests before relying on release automation alone.
- No committed sample report is included because reports can contain screenshots, URLs, stack traces, and other sensitive data. Use the example to generate one locally when needed.
- Confirm npm package version, git tag, and GitHub release notes are aligned before any public announcement.

---

## Security Considerations

- **Sensitive data in screenshots**: Screenshots may capture logged-in user info, API responses, or internal dashboards. Do not publish reports to public repositories or storage without review.
- **Error details**: Failed test reports may include stack traces containing connection strings, API keys, or tokens. Always review reports before sharing externally.
- **Exclude output from version control**: Add the output directory to `.gitignore` (e.g., `flow-report/`) to prevent accidental commits of sensitive screenshots and reports.

---

## License

[MIT](./LICENSE)
