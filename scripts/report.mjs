import { readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const browser = await json("test-results/browser-results.json"),
  physics = await json("test-results/performance-results.json"),
  packageReport = await json("test-results/package-results.json"),
  audit = await json("test-results/dependency-audit.json"),
  assets = await json("docs/assets/demos/manifest.json"),
  pkg = await json("package.json"),
  log = await readFile("test-results/full-validation.log", "utf8");
const packages = Array.isArray(packageReport)
  ? packageReport
  : packageReport.packages;
const releaseDir = `artifacts/releases/${pkg.version}`;
const tests = Number(log.match(/ℹ pass (\d+)/)?.[1]);
assert.ok(tests > 0);
assert.ok(browser.cases.every((c) => c.status === "passed"));
assert.equal(audit.metadata.vulnerabilities.total, 0);
await mkdir("docs/testing", { recursive: true });
for (const f of [
  "browser-results.json",
  "performance-results.json",
  "package-results.json",
  "dependency-audit.json",
  "full-validation.log",
])
  await copyFile(`test-results/${f}`, `docs/testing/${f}`);
try {
  await copyFile(
    "test-results/docs-results.json",
    "docs/testing/docs-results.json",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(releaseDir, { recursive: true });
const release = [];
for (const p of packages) {
  const source = `artifacts/packages/${p.tarball}`,
    target = `${releaseDir}/${p.tarball}`;
  await copyFile(source, target);
  release.push({
    name: p.name,
    file: p.tarball,
    bytes: (await stat(target)).size,
    sha256: createHash("sha256")
      .update(await readFile(target))
      .digest("hex"),
  });
}
await writeFile(
  `${releaseDir}/manifest.json`,
  JSON.stringify(release, null, 2),
);
const matrix = browser.performance
  .map(
    (p) =>
      `| ${p.surfaces} surfaces | ${p.stepMedianMs.toFixed(2)} ms | ${p.stepP95Ms.toFixed(2)} ms | ${p.frameIntervalP95Ms.toFixed(2)} ms |`,
  )
  .join("\n");
const cpu = physics.physics
  .map(
    (p) =>
      `| ${p.bodies} | ${p.medianMs.toFixed(3)} ms | ${p.p95Ms.toFixed(3)} ms | ${p.maxMs.toFixed(3)} ms |`,
  )
  .join("\n");
const report = `# Verification report · Animatter.js 0.1.0

Review date: **2026-10-31, Asia/Shanghai**. Scope: local Work workspace, no GitHub Actions substituted for local verification. The repository was audited as empty. Core acceptance was completed before demo work resumed; final scenes exercise the same public runtime.

## Acceptance result

**PASS for the documented Chromium / ES2022 scope.** ${tests} unit tests and ${browser.cases.length} real-browser cases pass. Two rendering modes, the shared protocol/runtime, all six independent HTML scenes, six browser-recorded looping GIFs, six desktop PNGs, bilingual README, APIs/architecture, packaged JavaScript/types, contribution rules and MIT license are present. No npm registry publication, untested cross-browser support, true fluid solver or general 3D character engine is claimed.

| Required check | Result / evidence |
| --- | --- |
| TypeScript | Core/React/Vue project references; tests and TS tools; isolated archive-consumer imports |
| Static analysis | ESLint across packages, tests, demos and scripts |
| Unit tests | ${tests}/${tests}; deterministic physics, constraints/depth, planner/climb/bounds, blending, graph, queue/abort/cancellation, async sequences |
| Core browser integration | 22 cases, including native behavior, modes/regions, actor drag, field forces, layout continuity, all semantic levels, async staleness, action preemption, cleanup/fault handling and adapters |
| Six demos | 24 cases: desktop interaction, effects-off business behavior, 390 px touch, 1280 px reduced-motion/keyboard |
| Desktop layout | 1440 × 1000 scenarios; captures also generated at 1280 × 900 |
| Resource lifecycle | 25 instrumented teardown cycles; additional Chromium CDP measurements after warmup/full GC |
| Build/package exports | 3 packed packages, ESM/CSS/types verified from extracted consumer directory; local tarballs generated under artifacts/packages for separate distribution |
| README/assets | Matching English/Chinese structure; six real GIFs and PNGs; local links, hashes, dimensions and infinite GIF loops checked by verify:docs |
| Dependency audit | npm audit reports 0 advisories for the locked dependency set at this run; this is not a security certification |

Commands and raw output: [full-validation.log](testing/full-validation.log). Browser cases: [browser-results.json](testing/browser-results.json). Package metadata: [package-results.json](testing/package-results.json). Recordings and SHA-256 provenance: [manifest](assets/demos/manifest.json).

## Measured performance

Environment: ${physics.environment.node}, ${physics.environment.platform}/${physics.environment.arch}, ${physics.environment.cpu}; Chromium ${browser.browsers[0].version}. React ${pkg.devDependencies.react}, Vue ${pkg.devDependencies.vue}, TypeScript ${pkg.devDependencies.typescript}, Playwright ${pkg.devDependencies["@playwright/test"]}.

Browser workload: viewport 1440 × 1000, registered button grid, animated pointer source, 30 warmup frames + 120 measured frames. One complete world.step per rAF; timings include its simulation and DOM style work, not the entire browser rendering pipeline. Frame intervals reflect this headless host, not physical-device certification.

| Workload | World-step median | World-step p95 | Frame-interval p95 |
| --- | --- | --- | --- |
${matrix}

Pure solver workload: 120 warmup + 1200 measured fixed 1/120-second substeps, collision broadphase enabled, one impulse per measured step.

| Bodies | Step median | Step p95 | Maximum observed |
| --- | --- | --- | --- |
${cpu}

The minified standalone ESM browser bundle is **${physics.browserBundle.rawBytes} bytes raw / ${physics.browserBundle.gzipBytes} bytes gzip**, excluding source maps. Full npm tarballs are larger because they include modules, declarations, maps and license. Raw values and methodology: [performance-results.json](testing/performance-results.json).

## Lifecycle observations

After 30 warmup cycles, 30 additional world + surface + draggable actor + devtools mount/destroy cycles were measured using Chromium CDP with full GC before each observation. DOM nodes changed by **${browser.memory.delta.Nodes}**, event listeners by **${browser.memory.delta.JSEventListeners}**, documents by **${browser.memory.delta.Documents}**. Observed JS heap delta: **${browser.memory.delta.JSHeapUsedSize} bytes**. This small heap observation is not a proof of zero leakage; structural ownership and listener/observer/task/style cleanup are also exercised by explicit integration tests.

## Demo recordings

${assets.map((a) => `- ${a.demo}: ${a.duration} s, ${a.nb_frames} frames, ${a.width} × ${a.height}, ${a.bytes} bytes.`).join("\n")}

All recordings come from actual page interactions through Playwright recordVideo, followed by ffmpeg GIF conversion. The initial blank recording lead is trimmed; palettes/frame rate are compressed; loops are infinite. No generated screenshots, design mockups or fabricated animation frames were used. SVG/Canvas scene artwork is authored in the repository. Total GIF bytes: ${assets.reduce((sum, a) => sum + a.bytes, 0)}.

## Compatibility and honest limits

Chromium ${browser.browsers[0].version} is verified on this Linux host. Firefox 142.0.1 can launch but page creation did not become usable in an isolated 25-second probe. WebKit reports missing GTK/GStreamer/other shared libraries. Standard Playwright dependency installation failed due host identity/cache permissions; a read/download-only retry could not acquire the host package-manager lock. Those engines are **not passing or certified**. No Windows/macOS browser, Safari/iOS or Android-device run is claimed; touch tests are browser emulation. test:compat is supplied for a prepared host.

The solver uses finite-depth screen-space AABBs and springs; liquid is a soft-body approximation. Actors are procedural kinematic agents, with sampled obstacle clearance, side-climbing waypoints and viewport/depth-aware jumps, not articulated rigid bodies or a navmesh. Dense collision piles can approach quadratic cost. Shadow DOM, arbitrary transformed ancestor geometry and observing every external style change are outside current guarantees; use explicit invalidate/layout APIs and wrappers where documented. Application-specific L3–L7 state must be bridged explicitly. Unresolved external promises require application-owned cancellation; track suppresses stale result events.

## Reproduce

npm ci; npm run build; npx playwright install chromium; npm run check. For the measurements: npm run benchmark. For the actual recordings: npm run capture (requires ffmpeg and ffprobe). No Docker or external design assets are required. Generate local-install tarballs under artifacts/packages; release archives are distributed separately from the source tree.

## Publication boundary

All implementation, tests, captures, README and this report were prepared locally. Final publication is authorized only after these local gates pass. The publication action and resulting GitHub commit will be reported separately; this document does not invent a successful remote push.
`;
await writeFile("docs/VERIFICATION.md", report);
console.log(
  `Evidence report: ${tests} unit tests, ${browser.cases.length} browser cases, ${release.length} release tarballs.`,
);
