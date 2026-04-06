import { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
export { test } from './fixture.js';
export { generateFlowHtml } from './generate-html.js';
export { expect } from '@playwright/test';
import 'playwright/test';

/**
 * flowsnap - CTRF-based Flow Report Types
 *
 * CTRF (Common Test Report Format) 스키마를 기반으로 하되,
 * extra.flow 네임스페이스에 스크린샷 흐름 데이터를 확장.
 *
 * @see https://ctrf.io/docs/full-schema
 * @see https://github.com/ctrf-io/ctrf/blob/main/spec/ctrf.md
 */
interface CtrfReport {
    reportFormat: 'CTRF';
    specVersion: string;
    timestamp?: string;
    generatedBy?: string;
    extra?: Record<string, unknown>;
    results: CtrfResults;
}
interface CtrfResults {
    tool: CtrfTool;
    summary: CtrfSummary;
    tests: CtrfTest[];
    environment?: CtrfEnvironment;
    extra?: Record<string, unknown>;
}
interface CtrfTool {
    name: string;
    version?: string;
    extra?: Record<string, unknown>;
}
interface CtrfSummary {
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
type CtrfTestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
interface CtrfTest {
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
interface CtrfStep {
    name: string;
    status: CtrfTestStatus;
    extra?: Record<string, unknown>;
}
interface CtrfAttachment {
    name: string;
    contentType: string;
    path: string;
    extra?: Record<string, unknown>;
}
interface CtrfEnvironment {
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
/** test.extra에 포함되는 flow 확장 데이터 */
interface CtrfTestExtra {
    flow?: FlowData;
    [key: string]: unknown;
}
/** extra.flow의 구조 */
interface FlowData {
    screenshots: FlowScreenshot[];
    edges: FlowEdge[];
}
/** 개별 스크린샷 메타데이터 */
interface FlowScreenshot {
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
interface FlowEdge {
    from: string;
    to: string;
    label?: string;
}
/** Reporter 옵션 */
interface FlowReporterOptions {
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
interface GitOptions {
    branch?: string;
    commit?: string;
    tag?: string;
    repositoryName?: string;
    repositoryUrl?: string;
}

/**
 * flowsnap - Playwright Custom Reporter (CTRF Format)
 *
 * 테스트 실행 중 수집된 스크린샷과 메타데이터를 모아
 * CTRF(Common Test Report Format) 규격의 ctrf-report.json을 생성하고,
 * HTML 생성기를 호출한다.
 *
 * flow 데이터(screenshots, edges)는 각 test.extra.flow에 포함.
 * retry 병합: 같은 테스트의 여러 attempt 중 마지막 attempt만 기록.
 * 이전 attempt의 스크린샷 파일은 자동 삭제.
 */

declare class FlowReporter implements Reporter {
    private outputDir;
    private screenshotsDir;
    private generateHtml;
    private gitOption;
    private gitInfo;
    /** testId → 마지막 attempt 결과 (덮어쓰기로 병합) */
    private testMap;
    private startTime;
    constructor(options?: FlowReporterOptions);
    onBegin(_config: FullConfig, _suite: Suite): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(_result: FullResult): Promise<void>;
    printsToStdio(): boolean;
}

export { type CtrfReport, type CtrfTest, type CtrfTestStatus, type FlowData, type FlowEdge, type FlowReporterOptions, type FlowScreenshot, FlowReporter as default };
