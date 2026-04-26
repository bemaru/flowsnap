/**
 * flowsnap - HTML Report Generator
 *
 * Reads ctrf-report.json (CTRF format) and screenshots to generate a
 * self-contained HTML report.
 */
declare function generateFlowHtml(ctrfReportPath: string, outputHtmlPath: string): Promise<void>;

export { generateFlowHtml };
