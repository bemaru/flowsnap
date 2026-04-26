/**
 * flowsnap - E2E Visual Flow Reporter for Playwright
 *
 * Collects Playwright screenshot flows in CTRF format and generates
 * a self-contained HTML report.
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
