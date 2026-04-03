/**
 * flowsnap - E2E Visual Flow Reporter for Playwright
 *
 * Playwright 테스트의 스크린샷 흐름을 CTRF 포맷으로 수집하고
 * self-contained HTML 리포트를 생성합니다.
 */

export { default } from './reporter';
export { test, expect } from './fixture';
export { generateFlowHtml } from './generate-html';
export type {
  CtrfReport,
  CtrfTest,
  CtrfTestStatus,
  FlowData,
  FlowScreenshot,
  FlowEdge,
  FlowReporterOptions,
} from './types';
