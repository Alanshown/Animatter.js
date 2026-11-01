import { spawn } from "node:child_process";
export const base = "http://127.0.0.1:4173";
export async function startServer() {
  try {
    const r = await fetch(base + "/tests/fixtures/runtime.html");
    if (r.ok) return () => {};
  } catch {
    /* start local fixture server */
  }
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (d) => {
    output += d;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/tests/fixtures/runtime.html");
      if (r.ok) return () => child.kill();
    } catch {
      /* await startup */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw Error("Local server did not start: " + output);
}

// Chromium launcher shared by all scripts. Resolution order:
//   1. CHROME_PATH (explicit override, must exist)
//   2. Playwright's own downloaded Chromium (chromium.executablePath(), must exist)
//   3. A locally installed Chrome or Edge in the standard Windows/macOS/Linux locations
// It never silently falls back to a path that does not exist.
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const localBrowserCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export function resolveChromiumExecutable() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    }
    return { path: process.env.CHROME_PATH, source: "CHROME_PATH" };
  }
  let managed;
  try {
    managed = chromium.executablePath();
  } catch {
    managed = undefined;
  }
  if (managed && existsSync(managed)) return { path: managed, source: "playwright" };
  const local = localBrowserCandidates.find((p) => existsSync(p));
  if (local) return { path: local, source: "local-install" };
  throw Error(
    "No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH to a Chrome/Edge executable.",
  );
}

export async function launchChromium(options = {}) {
  const resolved = resolveChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...options,
    executablePath: resolved.path,
  });
  browser.__animatterSource = resolved;
  return browser;
}
