import { writeFile, mkdir } from "node:fs/promises";
import { startServer, launchChromium } from "./browser-utils.mjs";
import { testDemos } from "./demo-tests.mjs";
const stop = await startServer(),
  browser = await launchChromium(),
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
