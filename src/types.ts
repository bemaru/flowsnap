/**
 * flowsnap - CTRF-based Flow Report Types
 *
 * CTRF (Common Test Report Format) 스키마를 기반으로 하되,
 * extra.flow 네임스페이스에 스크린샷 흐름 데이터를 확장.
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

/** test.extra에 포함되는 flow 확장 데이터 */
export interface CtrfTestExtra {
  flow?: FlowData;
  [key: string]: unknown;
}

/** extra.flow의 구조 */
export interface FlowData {
  screenshots: FlowScreenshot[];
  edges: FlowEdge[];
}

/** 개별 스크린샷 메타데이터 */
export interface FlowScreenshot {
  /** 고유 ID */
  id: string;
  /** 촬영 시점의 URL */
  url: string;
  /** 이전 URL */
  previousUrl: string | null;
  /** 촬영 타임스탬프 (ms) */
  timestamp: number;
  /** 스크린샷 파일 경로 (리포트 디렉토리 기준 상대 경로) */
  screenshotPath: string;
  /** 설명 라벨 */
  label: string;
}

/** 스크린샷 간 연결 (화면 전환) */
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

/** Reporter 옵션 */
export interface FlowReporterOptions {
  /** 결과 출력 디렉토리 (기본: ./flow-report) */
  outputDir?: string;
  /** HTML 자동 생성 여부 (기본: true) */
  generateHtml?: boolean;
  /**
   * Git 메타데이터 자동 수집 (기본: true)
   * - true: branch, commit, tag를 자동 수집하여 environment에 포함
   * - false: git 정보 수집 안 함
   * - object: 수동 지정 (CI 환경 등에서 env var로 전달할 때)
   */
  git?: boolean | GitOptions;
}

/** Git 메타데이터 수동 지정 옵션 */
export interface GitOptions {
  branch?: string;
  commit?: string;
  tag?: string;
  repositoryName?: string;
  repositoryUrl?: string;
}
