/**
 * flowsnap - HTML Report Generator
 *
 * ctrf-report.json(CTRF 포맷)과 스크린샷을 읽어서 self-contained HTML 리포트를 생성.
 * 디자인: 모노스페이스, 흑백 기조, 넉넉한 여백, 장식 최소화.
 */
declare function generateFlowHtml(ctrfReportPath: string, outputHtmlPath: string): Promise<void>;

export { generateFlowHtml };
