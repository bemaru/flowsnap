/**
 * flowsnap - Playwright Test Fixture
 *
 * Playwright test fixture that detects page navigation and collects
 * screenshots with flow metadata.
 */

import { test as base, expect } from '@playwright/test';
import type { FlowScreenshot } from './types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

/** Extract the pathname from a URL, excluding query string and hash. */
function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Extract the query string from a URL. */
function getSearch(url: string): string {
  try {
    return new URL(url).search;
  } catch {
    return '';
  }
}

/** Build a readable label from the URL change. */
function buildLabel(
  url: string,
  previousUrl: string | null,
  isFirst: boolean,
): string {
  const pathname = getPathname(url);

  if (isFirst) {
    return `Start: ${pathname}`;
  }

  if (previousUrl === null) {
    return `Start: ${pathname}`;
  }

  const prevPathname = getPathname(previousUrl);
  const prevSearch = getSearch(previousUrl);
  const currSearch = getSearch(url);

  // Same pathname, query string changed.
  if (prevPathname === pathname && prevSearch !== currSearch) {
    return 'Query changed';
  }

  // Pathname changed.
  return `Navigate to ${pathname}`;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const projectName = testInfo.project.name || 'default';
    const testId = slugify(`${projectName}-${testInfo.title}`);

    const screenshots: FlowScreenshot[] = [];
    let index = 0;
    let previousUrl: string | null = null;
    let lastObservedUrl: string | null = null;

    /** Last captured URL, using pathname + search. */
    let lastCapturedPathname = '';
    let lastCapturedSearch = '';
    /** URLs currently being captured, used to avoid race conditions. */
    const pendingUrls = new Set<string>();

    const captureScreenshot = async (
      url: string,
      label: string,
      options?: { force?: boolean; previousUrl?: string | null },
    ) => {
      const pathname = getPathname(url);
      const search = getSearch(url);
      const urlKey = `${pathname}${search}`;

      // Skip duplicates when pathname and search are identical, unless forced.
      if (
        !options?.force &&
        (pendingUrls.has(urlKey) ||
          (pathname === lastCapturedPathname &&
            search === lastCapturedSearch))
      ) {
        return;
      }
      pendingUrls.add(urlKey);

      try {
        // Wait for rendering: networkidle plus a short buffer.
        await page
          .waitForLoadState('networkidle', { timeout: 3000 })
          .catch(() => {
            /* ignore timeout */
          });
        await page.waitForTimeout(300);

        const buffer = await page.screenshot();
        const screenshotId = `${testId}-${index}`;
        const screenshotPath = `${screenshotId}.png`;

        const metadata: FlowScreenshot = {
          id: screenshotId,
          url,
          previousUrl: options?.previousUrl ?? previousUrl,
          timestamp: Date.now(),
          screenshotPath,
          label,
        };

        screenshots.push(metadata);

        await testInfo.attach(`flow-screenshot-${index}`, {
          body: buffer,
          contentType: 'image/png',
        });

        previousUrl = url;
        lastCapturedPathname = pathname;
        lastCapturedSearch = search;
        index++;
      } catch {
        // Screenshot failures must not fail the test.
      }
    };

    page.on('framenavigated', async (frame) => {
      // Only handle main-frame navigation.
      if (frame !== page.mainFrame()) {
        return;
      }

      const url = frame.url();
      // Ignore about:blank and chrome internal URLs.
      if (!url || url === 'about:blank' || url.startsWith('chrome')) {
        return;
      }
      const previousObservedUrl = lastObservedUrl;
      const isFirst = previousObservedUrl === null;
      const label = buildLabel(url, previousObservedUrl, isFirst);
      lastObservedUrl = url;

      try {
        await captureScreenshot(url, label, { previousUrl: previousObservedUrl });
      } catch {
        // Ignore capture failures.
      }
    });

    await use(page);

    // Capture the final state at test end.
    try {
      const finalUrl = page.url();
      await captureScreenshot(finalUrl, 'Final state', { force: true });
    } catch {
      // Ignore capture failures.
    }

    // Attach metadata.
    try {
      if (screenshots.length > 0) {
        await testInfo.attach('flow-metadata', {
          body: Buffer.from(JSON.stringify(screenshots)),
          contentType: 'application/json',
        });
      }
    } catch {
      // Ignore attachment failures.
    }
  },
});

export { expect };
