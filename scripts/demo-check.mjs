import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { startServer } from "./browser-utils.mjs";
import { testDemos } from "./demo-tests.mjs";
const stop = await startServer(),
  browser = await chromium.launch({ headless: true }),
  report = { cases: [] };
try {
  await testDemos(browser, report);
} finally {
  await browser.close();
  stop();
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/demo-results.json",
    JSON.stringify(report, null, 2),
  );
}
if (report.cases.some((c) => c.status === "failed")) process.exitCode = 1;
