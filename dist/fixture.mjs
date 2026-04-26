// src/fixture.ts
import { test as base, expect } from "@playwright/test";
function slugify(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}
function getPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
function getSearch(url) {
  try {
    return new URL(url).search;
  } catch {
    return "";
  }
}
function buildLabel(url, previousUrl, isFirst) {
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
  if (prevPathname === pathname && prevSearch !== currSearch) {
    return "Query changed";
  }
  return `Navigate to ${pathname}`;
}
var test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const projectName = testInfo.project.name || "default";
    const testId = slugify(`${projectName}-${testInfo.title}`);
    const screenshots = [];
    let index = 0;
    let previousUrl = null;
    let lastObservedUrl = null;
    let lastCapturedPathname = "";
    let lastCapturedSearch = "";
    const pendingUrls = /* @__PURE__ */ new Set();
    const captureScreenshot = async (url, label, options) => {
      const pathname = getPathname(url);
      const search = getSearch(url);
      const urlKey = `${pathname}${search}`;
      if (!options?.force && (pendingUrls.has(urlKey) || pathname === lastCapturedPathname && search === lastCapturedSearch)) {
        return;
      }
      pendingUrls.add(urlKey);
      try {
        await page.waitForLoadState("networkidle", { timeout: 3e3 }).catch(() => {
        });
        await page.waitForTimeout(300);
        const buffer = await page.screenshot();
        const screenshotId = `${testId}-${index}`;
        const screenshotPath = `${screenshotId}.png`;
        const metadata = {
          id: screenshotId,
          url,
          previousUrl: options?.previousUrl ?? previousUrl,
          timestamp: Date.now(),
          screenshotPath,
          label
        };
        screenshots.push(metadata);
        await testInfo.attach(`flow-screenshot-${index}`, {
          body: buffer,
          contentType: "image/png"
        });
        previousUrl = url;
        lastCapturedPathname = pathname;
        lastCapturedSearch = search;
        index++;
      } catch {
      }
    };
    page.on("framenavigated", async (frame) => {
      if (frame !== page.mainFrame()) {
        return;
      }
      const url = frame.url();
      if (!url || url === "about:blank" || url.startsWith("chrome")) {
        return;
      }
      const previousObservedUrl = lastObservedUrl;
      const isFirst = previousObservedUrl === null;
      const label = buildLabel(url, previousObservedUrl, isFirst);
      lastObservedUrl = url;
      try {
        await captureScreenshot(url, label, { previousUrl: previousObservedUrl });
      } catch {
      }
    });
    await use(page);
    try {
      const finalUrl = page.url();
      await captureScreenshot(finalUrl, "Final state", { force: true });
    } catch {
    }
    try {
      if (screenshots.length > 0) {
        await testInfo.attach("flow-metadata", {
          body: Buffer.from(JSON.stringify(screenshots)),
          contentType: "application/json"
        });
      }
    } catch {
    }
  }
});
export {
  expect,
  test
};
