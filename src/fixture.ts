/**
 * flowsnap - Playwright Test Fixture
 *
 * 페이지 네비게이션을 자동 감지하여 스크린샷과 메타데이터를 수집하는
 * Playwright test fixture.
 */

import { test as base, expect } from '@playwright/test';
import type { FlowScreenshot } from './types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** URL에서 pathname을 추출 (쿼리스트링/해시 제외) */
function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** URL에서 쿼리스트링을 추출 */
function getSearch(url: string): string {
  try {
    return new URL(url).search;
  } catch {
    return '';
  }
}

/** URL 변화에 기반한 의미 있는 라벨 생성 */
function buildLabel(
  url: string,
  previousUrl: string | null,
  isFirst: boolean,
): string {
  const pathname = getPathname(url);

  if (isFirst) {
    return `시작: ${pathname}`;
  }

  if (previousUrl === null) {
    return `시작: ${pathname}`;
  }

  const prevPathname = getPathname(previousUrl);
  const prevSearch = getSearch(previousUrl);
  const currSearch = getSearch(url);

  // pathname이 같고 쿼리스트링만 변경된 경우
  if (prevPathname === pathname && prevSearch !== currSearch) {
    return '필터 변경';
  }

  // pathname이 변경된 경우
  return `${pathname} 이동`;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const projectName = testInfo.project.name || 'default';
    const testId = slugify(`${projectName}-${testInfo.title}`);

    const screenshots: FlowScreenshot[] = [];
    let index = 0;
    let previousUrl: string | null = null;

    /** 마지막으로 스크린샷을 촬영한 URL (pathname + search) */
    let lastCapturedPathname = '';
    let lastCapturedSearch = '';
    /** 진행 중인 URL (race condition 방지) */
    const pendingUrls = new Set<string>();

    const captureScreenshot = async (
      url: string,
      label: string,
      options?: { force?: boolean },
    ) => {
      const pathname = getPathname(url);
      const search = getSearch(url);
      const urlKey = `${pathname}${search}`;

      // 중복 방지: pathname과 search가 모두 동일하면 스킵 (force 제외)
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
        // 렌더링 대기: networkidle 후 추가 대기
        await page
          .waitForLoadState('networkidle', { timeout: 3000 })
          .catch(() => {
            /* timeout 무시 */
          });
        await page.waitForTimeout(300);

        const buffer = await page.screenshot();
        const screenshotId = `${testId}-${index}`;
        const screenshotPath = `${screenshotId}.png`;

        const metadata: FlowScreenshot = {
          id: screenshotId,
          url,
          previousUrl,
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
        // 에러 발생 시 테스트 실패를 유발하지 않음
      }
    };

    page.on('framenavigated', async (frame) => {
      // 메인 프레임 네비게이션만 처리
      if (frame !== page.mainFrame()) {
        return;
      }

      const url = frame.url();
      // about:blank, chrome 내부 URL 무시
      if (!url || url === 'about:blank' || url.startsWith('chrome')) {
        return;
      }
      const isFirst = index === 0;
      const label = buildLabel(url, previousUrl, isFirst);

      try {
        await captureScreenshot(url, label);
      } catch {
        // 에러 무시
      }
    });

    await use(page);

    // 테스트 끝에서 최종 스크린샷 촬영
    try {
      const finalUrl = page.url();
      await captureScreenshot(finalUrl, '최종 상태', { force: true });
    } catch {
      // 에러 무시
    }

    // 메타데이터 첨부
    try {
      if (screenshots.length > 0) {
        await testInfo.attach('flow-metadata', {
          body: Buffer.from(JSON.stringify(screenshots)),
          contentType: 'application/json',
        });
      }
    } catch {
      // 에러 무시
    }
  },
});

export { expect };
