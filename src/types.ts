/**
 * flowsnap - CTRF-based Flow Report Types
 *
 * Based on the CTRF (Common Test Report Format) schema, with screenshot
 * flow data added under the extra.flow namespace.
 *
 * @see https://ctrf.io/docs/full-schema
 * @see https://github.com/ctrf-io/ctrf/blob/main/spec/ctrf.md
 */

// --- CTRF Core Types ---

export interface CtrfReport {
  reportFormat: 'CTRF';
  specVersion: string;
  timestamp?: string;
  generatedBy?: string;
  extra?: Record<string, unknown>;
  results: CtrfResults;
}

export interface CtrfResults {
  tool: CtrfTool;
  summary: CtrfSummary;
  tests: CtrfTest[];
  environment?: CtrfEnvironment;
  extra?: Record<string, unknown>;
}

export interface CtrfTool {
  name: string;
  version?: string;
  extra?: Record<string, unknown>;
}

export interface CtrfSummary {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  other: number;
  start?: number;
  stop?: number;
  duration?: number;
  flaky?: number;
  suites?: number;
  extra?: Record<string, unknown>;
}

export type CtrfTestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'other';

export interface CtrfTest {
  name: string;
  status: CtrfTestStatus;
  duration: number;
  suite?: string[];
  message?: string;
  trace?: string;
  filePath?: string;
  tags?: string[];
  type?: string;
  retries?: number;
  flaky?: boolean;
  browser?: string;
  screenshot?: string;
  steps?: CtrfStep[];
  attachments?: CtrfAttachment[];
  rawStatus?: string;
  extra?: CtrfTestExtra;
}

export interface CtrfStep {
  name: string;
  status: CtrfTestStatus;
  extra?: Record<string, unknown>;
}

export interface CtrfAttachment {
  name: string;
  contentType: string;
  path: string;
  extra?: Record<string, unknown>;
}

export interface CtrfEnvironment {
  appName?: string;
  appVersion?: string;
  buildName?: string;
  buildNumber?: string;
  buildUrl?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  commit?: string;
  branchName?: string;
  osPlatform?: string;
  osRelease?: string;
  osVersion?: string;
  testEnvironment?: string;
  extra?: Record<string, unknown>;
}

// --- Flow Extension (extra.flow) ---

/** Flow extension data stored under test.extra. */
export interface CtrfTestExtra {
  flow?: FlowData;
  [key: string]: unknown;
}

/** Shape of extra.flow. */
export interface FlowData {
  screenshots: FlowScreenshot[];
  edges: FlowEdge[];
}

/** Metadata for one screenshot. */
export interface FlowScreenshot {
  /** Unique ID. */
  id: string;
  /** URL captured at screenshot time. */
  url: string;
  /** Previous URL. */
  previousUrl: string | null;
  /** Capture timestamp in milliseconds. */
  timestamp: number;
  /** Screenshot file path relative to the report directory. */
  screenshotPath: string;
  /** Human-readable label. */
  label: string;
}

/** Connection between screenshots (screen transition). */
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

/** Reporter options. */
export interface FlowReporterOptions {
  /** Output directory. Default: ./flow-report. */
  outputDir?: string;
  /** Whether to generate HTML automatically. Default: true. */
  generateHtml?: boolean;
  /**
   * Git metadata collection. Default: true.
   * - true: collect branch, commit, and tag automatically for environment
   * - false: do not collect git metadata
   * - object: specify values manually, such as from CI environment variables
   */
  git?: boolean | GitOptions;
}

/** Manual git metadata options. */
export interface GitOptions {
  branch?: string;
  commit?: string;
  tag?: string;
  repositoryName?: string;
  repositoryUrl?: string;
}
