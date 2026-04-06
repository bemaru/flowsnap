"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/fixture.ts
var fixture_exports = {};
__export(fixture_exports, {
  expect: () => import_test.expect,
  test: () => test
});
module.exports = __toCommonJS(fixture_exports);
var import_test = require("@playwright/test");
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
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
    return `\uC2DC\uC791: ${pathname}`;
  }
  if (previousUrl === null) {
    return `\uC2DC\uC791: ${pathname}`;
  }
  const prevPathname = getPathname(previousUrl);
  const prevSearch = getSearch(previousUrl);
  const currSearch = getSearch(url);
  if (prevPathname === pathname && prevSearch !== currSearch) {
    return "\uD544\uD130 \uBCC0\uACBD";
  }
  return `${pathname} \uC774\uB3D9`;
}
var test = import_test.test.extend({
  page: async ({ page }, use, testInfo) => {
    const projectName = testInfo.project.name || "default";
    const testId = slugify(`${projectName}-${testInfo.title}`);
    const screenshots = [];
    let index = 0;
    let previousUrl = null;
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
          previousUrl,
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
      const isFirst = index === 0;
      const label = buildLabel(url, previousUrl, isFirst);
      try {
        await captureScreenshot(url, label);
      } catch {
      }
    });
    await use(page);
    try {
      const finalUrl = page.url();
      await captureScreenshot(finalUrl, "\uCD5C\uC885 \uC0C1\uD0DC", { force: true });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  expect,
  test
});
