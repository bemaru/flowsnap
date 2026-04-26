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

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { execSync } from 'node:child_process';
import type {
  CtrfAttachment,
  CtrfEnvironment,
  CtrfReport,
  CtrfStep,
  CtrfTest,
  CtrfTestStatus,
  FlowEdge,
  FlowReporterOptions,
  FlowScreenshot,
  GitOptions,
} from './types';
import { generateFlowHtml } from './generate-html';

/** Run a git command and return undefined on failure. */
function gitExec(cmd: string): string | undefined {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Collect git metadata automatically. */
function collectGitInfo(): GitOptions {
  return {
    branch: gitExec('git branch --show-current'),
    commit: gitExec('git rev-parse --short HEAD'),
    tag: gitExec('git tag --points-at HEAD'),
    repositoryName: gitExec('git remote get-url origin')
      ?.replace(/.*[/:]([^/]+\/[^/]+?)(?:\.git)?$/, '$1'),
    repositoryUrl: gitExec('git remote get-url origin'),
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Map Playwright status to CTRF status. */
function mapStatus(status: TestResult['status']): CtrfTestStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
    case 'timedOut':
    case 'interrupted':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return 'other';
  }
}

/** Intermediate result for a single test attempt. */
interface TestEntry {
  ctrfTest: CtrfTest;
  /** Screenshot file names from previous attempts, used for cleanup. */
  previousScreenshotFiles: string[];
}

class FlowReporter implements Reporter {
  private outputDir: string;
  private screenshotsDir: string = '';
  private generateHtml: boolean;
  private gitOption: boolean | GitOptions;
  private gitInfo: GitOptions = {};

  /** testId -> last attempt result (overwritten on retry). */
  private testMap = new Map<string, TestEntry>();
  private startTime = 0;

  constructor(options: FlowReporterOptions = {}) {
    this.outputDir = options.outputDir ?? './flow-report';
    this.generateHtml = options.generateHtml ?? true;
    this.gitOption = options.git ?? true;
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();

    this.screenshotsDir = path.join(this.outputDir, 'screenshots');
    fs.mkdirSync(this.screenshotsDir, { recursive: true });

    // Collect git metadata.
    if (this.gitOption === true) {
      this.gitInfo = collectGitInfo();
    } else if (this.gitOption && typeof this.gitOption === 'object') {
      this.gitInfo = this.gitOption;
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.title;
    const projectName = test.parent.project()?.name ?? 'default';
    const testId = slugify(`${projectName}-${title}`);
    const retry = result.retry;

    // --- Build suite: [projectName, ...describe segments] ---
    const titlePath = test.titlePath().filter(Boolean);
    // titlePath: [projectName?, file?, ...describes, title]
    // Describe segments are everything except the first project/file entry and last title.
    const suite: string[] = [projectName];
    if (titlePath.length > 2) {
      // Middle entries are describe blocks.
      suite.push(...titlePath.slice(1, -1));
    }

    // --- Status mapping ---
    const ctrfStatus = mapStatus(result.status);

    // --- Parse metadata collected by the fixture (FlowScreenshot[]) ---
    let metaScreenshots: FlowScreenshot[] = [];
    const metaAttachment = result.attachments.find(
      (a) => a.name === 'flow-metadata',
    );
    if (metaAttachment?.body) {
      try {
        metaScreenshots = JSON.parse(metaAttachment.body.toString('utf-8'));
      } catch {
        // Ignore invalid metadata.
      }
    }

    // --- Process screenshot attachments ---
    const screenshotAttachments = result.attachments.filter((a) =>
      a.name.startsWith('flow-screenshot-'),
    );

    const screenshotIds: string[] = [];
    const flowScreenshots: FlowScreenshot[] = [];
    const ctrfAttachments: CtrfAttachment[] = [];

    screenshotAttachments.forEach((attachment, index) => {
      const screenshotId = `${testId}-${index}`;
      const fileName = `${testId}-a${retry}-${index}.png`;
      const destPath = path.join(this.screenshotsDir, fileName);

      // Copy file.
      if (attachment.path) {
        fs.copyFileSync(attachment.path, destPath);
      } else if (attachment.body) {
        fs.writeFileSync(destPath, attachment.body);
      }

      // Record CtrfAttachment.
      ctrfAttachments.push({
        name: attachment.name,
        contentType: 'image/png',
        path: `screenshots/${fileName}`,
      });

      // Pull matching metadata when available.
      const meta = metaScreenshots[index];

      const screenshot: FlowScreenshot = {
        id: screenshotId,
        url: meta?.url ?? '',
        previousUrl: meta?.previousUrl ?? null,
        timestamp: meta?.timestamp ?? Date.now(),
        screenshotPath: `screenshots/${fileName}`,
        label: meta?.label ?? `Step ${index + 1}`,
      };

      flowScreenshots.push(screenshot);
      screenshotIds.push(screenshotId);
    });

    // --- Fallback: collect Playwright's built-in screenshots without the fixture (mode 1) ---
    if (flowScreenshots.length === 0) {
      const builtinScreenshots = result.attachments.filter(
        (a) =>
          a.contentType === 'image/png' &&
          !a.name.startsWith('flow-') &&
          (a.path || a.body),
      );

      builtinScreenshots.forEach((attachment, index) => {
        const screenshotId = `${testId}-${index}`;
        const fileName = `${testId}-a${retry}-${index}.png`;
        const destPath = path.join(this.screenshotsDir, fileName);

        if (attachment.path) {
          fs.copyFileSync(attachment.path, destPath);
        } else if (attachment.body) {
          fs.writeFileSync(destPath, attachment.body);
        }

        ctrfAttachments.push({
          name: attachment.name,
          contentType: 'image/png',
          path: `screenshots/${fileName}`,
        });

        flowScreenshots.push({
          id: screenshotId,
          url: '',
          previousUrl: null,
          timestamp: Date.now(),
          screenshotPath: `screenshots/${fileName}`,
          label: attachment.name === 'screenshot' ? 'Test end' : attachment.name,
        });
        screenshotIds.push(screenshotId);
      });
    }

    // --- Build FlowEdges between consecutive screenshots ---
    const edges: FlowEdge[] = [];
    for (let i = 0; i < screenshotIds.length - 1; i++) {
      const fromId = screenshotIds[i];
      const toId = screenshotIds[i + 1];
      const toMeta = metaScreenshots[i + 1];

      edges.push({
        from: fromId,
        to: toId,
        label: toMeta?.label,
      });
    }

    // --- Error details ---
    let message: string | undefined;
    let trace: string | undefined;
    if (result.error) {
      message = result.error.message || result.error.value?.toString();
      if (message && message.length > 500) message = message.slice(0, 500) + '…';
      trace = result.error.stack;
      if (trace && trace.length > 1000) trace = trace.slice(0, 1000) + '…';
    }

    // --- Collect only category === 'test.step' entries ---
    const steps: CtrfStep[] = result.steps
      .filter((s) => s.category === 'test.step')
      .map((s) => ({
        name: s.title,
        status: s.error ? ('failed' as CtrfTestStatus) : ('passed' as CtrfTestStatus),
      }));

    // --- Collect previous-attempt screenshots for later cleanup ---
    const previousEntry = this.testMap.get(testId);
    const previousScreenshotFiles: string[] = [];
    if (previousEntry) {
      // Collect attachment paths from the previous attempt.
      const prevAttachments = previousEntry.ctrfTest.attachments ?? [];
      for (const att of prevAttachments) {
        previousScreenshotFiles.push(path.basename(att.path));
      }
      // Include any already accumulated cleanup entries.
      previousScreenshotFiles.push(...previousEntry.previousScreenshotFiles);
    }

    // --- Build CtrfTest ---
    const ctrfTest: CtrfTest = {
      name: title,
      status: ctrfStatus,
      duration: result.duration,
      suite,
      message,
      trace,
      filePath: test.location?.file,
      rawStatus: result.status,
      retries: retry,
      flaky: ctrfStatus === 'passed' && retry > 0,
      steps: steps.length > 0 ? steps : undefined,
      attachments: ctrfAttachments.length > 0 ? ctrfAttachments : undefined,
      extra: flowScreenshots.length > 0
        ? { flow: { screenshots: flowScreenshots, edges } }
        : undefined,
    };

    // Store by testId; retries overwrite earlier attempts so only the last one remains.
    this.testMap.set(testId, { ctrfTest, previousScreenshotFiles });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const stopTime = Date.now();
    const duration = stopTime - this.startTime;

    // --- Delete screenshots from previous attempts ---
    for (const entry of Array.from(this.testMap.values())) {
      for (const fileName of entry.previousScreenshotFiles) {
        try {
          fs.unlinkSync(path.join(this.screenshotsDir, fileName));
        } catch {
          // Ignore cleanup failures.
        }
      }
    }

    // --- Collect final results ---
    const tests = Array.from(this.testMap.values()).map((e) => e.ctrfTest);

    // --- Calculate summary ---
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed').length;
    const skipped = tests.filter((t) => t.status === 'skipped').length;

    // --- Build environment from git metadata ---
    let environment: CtrfEnvironment | undefined;
    if (this.gitInfo.commit || this.gitInfo.branch) {
      environment = {
        ...(this.gitInfo.branch && { branchName: this.gitInfo.branch }),
        ...(this.gitInfo.commit && { commit: this.gitInfo.commit }),
        ...(this.gitInfo.repositoryName && { repositoryName: this.gitInfo.repositoryName }),
        ...(this.gitInfo.repositoryUrl && { repositoryUrl: this.gitInfo.repositoryUrl }),
        ...(this.gitInfo.tag && { extra: { tag: this.gitInfo.tag } }),
        osPlatform: process.platform,
      };
    }

    // --- Build CtrfReport ---
    const report: CtrfReport = {
      reportFormat: 'CTRF',
      specVersion: '0.0.0',
      timestamp: new Date().toISOString(),
      results: {
        tool: { name: 'playwright' },
        summary: {
          tests: tests.length,
          passed,
          failed,
          skipped,
          pending: 0,
          other: 0,
          start: this.startTime,
          stop: stopTime,
          duration,
        },
        tests,
        ...(environment && { environment }),
      },
    };

    // Write ctrf-report.json.
    const jsonPath = path.join(this.outputDir, 'ctrf-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    // Generate HTML through direct import.
    if (this.generateHtml) {
      try {
        const htmlPath = path.join(this.outputDir, 'index.html');
        await generateFlowHtml(jsonPath, htmlPath);
      } catch {
        // Ignore HTML generation failures; ctrf-report.json has already been written.
      }
    }
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default FlowReporter;
