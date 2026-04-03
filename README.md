# flowsnap

**Capture your product flows as visual documents.**

flowsnap automatically captures screenshots during E2E test execution on every page transition, connecting them with arrows to generate a visual flow report.

- CTRF (Common Test Report Format) compliant
- Playwright-based (Cypress support planned)
- Self-contained HTML report (works offline)

## Features

- Auto-capture screenshots on every navigation
- Auto-generated labels based on URL changes
- Project tree sidebar + Flow Lane view
- Screenshot gallery modal with keyboard navigation
- Test search/filter (pass/fail/skip)
- Error log display for failed tests
- Automatic retry merging

## Install

```bash
npm install -D flowsnap
```

## Quick Start

### Mode 1: Zero Config (Reporter Only)

Add one line to `playwright.config.ts`:

```typescript
reporter: [['flowsnap']]
```

Generates a basic report using screenshots taken at test completion.

### Mode 2: Full Flow (Fixture)

Change your import to capture screenshots on every navigation:

```typescript
// before
import { test, expect } from '@playwright/test';

// after
import { test, expect } from 'flowsnap/fixture';
```

## Output

After running `npx playwright test`:

- `flow-report/ctrf-report.json` -- CTRF standard JSON
- `flow-report/index.html` -- Self-contained HTML report

## Configuration

```typescript
reporter: [['flowsnap', {
  outputDir: './flow-report',    // default
  generateHtml: true,            // auto-generate HTML
}]]
```

## CTRF Compatibility

flowsnap follows the CTRF standard. Flow data is stored in `test.extra.flow`, ensuring compatibility with existing CTRF tools.

## License

MIT
