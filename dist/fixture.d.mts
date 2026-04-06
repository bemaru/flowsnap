import * as playwright_test from 'playwright/test';
export { expect } from '@playwright/test';

declare const test: playwright_test.TestType<playwright_test.PlaywrightTestArgs & playwright_test.PlaywrightTestOptions, playwright_test.PlaywrightWorkerArgs & playwright_test.PlaywrightWorkerOptions>;

export { test };
