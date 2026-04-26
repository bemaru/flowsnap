import { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
export { test } from './fixture.mjs';
export { generateFlowHtml } from './generate-html.mjs';
export { expect } from '@playwright/test';
import 'playwright/test';

/**
 * flowsnap - CTRF-based Flow Report Types
 *
 * Based on the CTRF (Common Test Report Format) schema, with screenshot
 * flow data added under the extra.flow namespace.
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
/** Flow extension data stored under test.extra. */
interface CtrfTestExtra {
    flow?: FlowData;
    [key: string]: unknown;
}
/** Shape of extra.flow. */
interface FlowData {
    screenshots: FlowScreenshot[];
    edges: FlowEdge[];
}
/** Metadata for one screenshot. */
interface FlowScreenshot {
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
interface FlowEdge {
    from: string;
    to: string;
    label?: string;
}
/** Reporter options. */
interface FlowReporterOptions {
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
 * Collects screenshots and metadata during Playwright runs, writes
 * a CTRF (Common Test Report Format) ctrf-report.json file, and invokes
 * the HTML generator.
 *
 * Flow data (screenshots, edges) is stored in each test.extra.flow object.
 * Retry handling keeps only the last attempt for each test.
 * Screenshot files from previous attempts are cleaned up automatically.
 */

declare class FlowReporter implements Reporter {
    private outputDir;
    private screenshotsDir;
    private generateHtml;
    private gitOption;
    private gitInfo;
    /** testId -> last attempt result (overwritten on retry). */
    private testMap;
    private startTime;
    constructor(options?: FlowReporterOptions);
    onBegin(_config: FullConfig, _suite: Suite): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(_result: FullResult): Promise<void>;
    printsToStdio(): boolean;
}

export { type CtrfReport, type CtrfTest, type CtrfTestStatus, type FlowData, type FlowEdge, type FlowReporterOptions, type FlowScreenshot, FlowReporter as default };
