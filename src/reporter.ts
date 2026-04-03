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
import type {
  CtrfAttachment,
  CtrfReport,
  CtrfStep,
  CtrfTest,
  CtrfTestStatus,
  FlowEdge,
  FlowReporterOptions,
  FlowScreenshot,
} from './types';
import { generateFlowHtml } from './generate-html';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 상태 매핑: Playwright → CTRF */
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

/** 단일 테스트의 attempt 결과를 담는 중간 구조 */
interface TestEntry {
  ctrfTest: CtrfTest;
  /** 이전 attempt의 스크린샷 파일명 (정리용) */
  previousScreenshotFiles: string[];
}

class FlowReporter implements Reporter {
  private outputDir: string;
  private screenshotsDir: string = '';
  private generateHtml: boolean;

  /** testId → 마지막 attempt 결과 (덮어쓰기로 병합) */
  private testMap = new Map<string, TestEntry>();
  private startTime = 0;

  constructor(options: FlowReporterOptions = {}) {
    this.outputDir = options.outputDir ?? './flow-report';
    this.generateHtml = options.generateHtml ?? true;
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();

    this.screenshotsDir = path.join(this.outputDir, 'screenshots');
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.title;
    const projectName = test.parent.project()?.name ?? 'default';
    const testId = slugify(`${projectName}-${title}`);
    const retry = result.retry;

    // --- suite 구성: [projectName, ...describe 부분] ---
    const titlePath = test.titlePath().filter(Boolean);
    // titlePath: [projectName?, file?, ...describes, title]
    // describe 부분 = titlePath에서 첫 요소(project)와 마지막(title) 제외
    const suite: string[] = [projectName];
    if (titlePath.length > 2) {
      // 중간 요소가 describe 블록
      suite.push(...titlePath.slice(1, -1));
    }

    // --- 상태 매핑 ---
    const ctrfStatus = mapStatus(result.status);

    // --- 메타데이터 파싱 (fixture에서 수집한 FlowScreenshot[]) ---
    let metaScreenshots: FlowScreenshot[] = [];
    const metaAttachment = result.attachments.find(
      (a) => a.name === 'flow-metadata',
    );
    if (metaAttachment?.body) {
      try {
        metaScreenshots = JSON.parse(metaAttachment.body.toString('utf-8'));
      } catch {
        // 파싱 실패 시 무시
      }
    }

    // --- 스크린샷 attachment 처리 ---
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

      // 파일 복사
      if (attachment.path) {
        fs.copyFileSync(attachment.path, destPath);
      } else if (attachment.body) {
        fs.writeFileSync(destPath, attachment.body);
      }

      // CtrfAttachment 기록
      ctrfAttachments.push({
        name: attachment.name,
        contentType: 'image/png',
        path: `screenshots/${fileName}`,
      });

      // 메타데이터에서 매칭되는 정보 가져오기
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

    // --- Fallback: fixture 없이 Playwright 기본 screenshot 수집 (모드 1) ---
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
          label: attachment.name === 'screenshot' ? '테스트 종료 시점' : attachment.name,
        });
        screenshotIds.push(screenshotId);
      });
    }

    // --- FlowEdge 생성 (연속된 스크린샷 간) ---
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

    // --- 에러 정보 ---
    let message: string | undefined;
    let trace: string | undefined;
    if (result.error) {
      message = result.error.message || result.error.value?.toString();
      if (message && message.length > 500) message = message.slice(0, 500) + '…';
      trace = result.error.stack;
      if (trace && trace.length > 1000) trace = trace.slice(0, 1000) + '…';
    }

    // --- steps 수집: category === 'test.step'인 것만 ---
    const steps: CtrfStep[] = result.steps
      .filter((s) => s.category === 'test.step')
      .map((s) => ({
        name: s.title,
        status: s.error ? ('failed' as CtrfTestStatus) : ('passed' as CtrfTestStatus),
      }));

    // --- 이전 attempt 스크린샷 파일 수집 (나중에 정리용) ---
    const previousEntry = this.testMap.get(testId);
    const previousScreenshotFiles: string[] = [];
    if (previousEntry) {
      // 이전 attempt의 attachment 경로 수집
      const prevAttachments = previousEntry.ctrfTest.attachments ?? [];
      for (const att of prevAttachments) {
        previousScreenshotFiles.push(path.basename(att.path));
      }
      // 이전에 누적된 것도 포함
      previousScreenshotFiles.push(...previousEntry.previousScreenshotFiles);
    }

    // --- CtrfTest 조립 ---
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

    // testId 기반으로 Map에 저장 (같은 testId면 덮어쓰기 → 마지막 attempt만 남음)
    this.testMap.set(testId, { ctrfTest, previousScreenshotFiles });
  }

  async onEnd(_result: FullResult): Promise<void> {
    const stopTime = Date.now();
    const duration = stopTime - this.startTime;

    // --- 이전 attempt 스크린샷 파일 삭제 ---
    for (const entry of Array.from(this.testMap.values())) {
      for (const fileName of entry.previousScreenshotFiles) {
        try {
          fs.unlinkSync(path.join(this.screenshotsDir, fileName));
        } catch {
          // 삭제 실패 시 무시
        }
      }
    }

    // --- 최종 결과 수집 ---
    const tests = Array.from(this.testMap.values()).map((e) => e.ctrfTest);

    // --- Summary 계산 ---
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed').length;
    const skipped = tests.filter((t) => t.status === 'skipped').length;

    // --- CtrfReport 조립 ---
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
      },
    };

    // ctrf-report.json 저장
    const jsonPath = path.join(this.outputDir, 'ctrf-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    // HTML 생성 (직접 import로 호출)
    if (this.generateHtml) {
      try {
        const htmlPath = path.join(this.outputDir, 'index.html');
        await generateFlowHtml(jsonPath, htmlPath);
      } catch {
        // HTML 생성 실패 시 무시 (ctrf-report.json은 이미 저장됨)
      }
    }
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default FlowReporter;
