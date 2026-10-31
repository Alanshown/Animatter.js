# Verification report · Animatter.js 0.1.0

> Historical baseline record from the initial local development session. Statements about an empty repository, pending demo work or an untouched remote describe that session, not the current GitHub state. Current branding/package preparation evidence is in [NPM-PREPARATION-AUDIT.md](NPM-PREPARATION-AUDIT.md). Original test data under testing/ is retained.

Review date: **2026-10-31, Asia/Shanghai**. Scope: local Work workspace, no GitHub Actions substituted for local verification. The repository was audited as empty. Core acceptance was completed before demo work resumed; final scenes exercise the same public runtime.

## Acceptance result

**PASS for the documented Chromium / ES2022 scope.** 23 unit tests and 46 real-browser cases pass. Two rendering modes, the shared protocol/runtime, all six independent HTML scenes, six browser-recorded looping GIFs, six desktop PNGs, bilingual README, APIs/architecture, packaged JavaScript/types, contribution rules and MIT license are present. No npm registry publication, untested cross-browser support, true fluid solver or general 3D character engine is claimed.

| Required check | Result / evidence |
| --- | --- |
| TypeScript | Core/React/Vue project references; tests and TS tools; isolated archive-consumer imports |
| Static analysis | ESLint across packages, tests, demos and scripts |
| Unit tests | 23/23; deterministic physics, constraints/depth, planner/climb/bounds, blending, graph, queue/abort/cancellation, async sequences |
| Core browser integration | 22 cases, including native behavior, modes/regions, actor drag, field forces, layout continuity, all semantic levels, async staleness, action preemption, cleanup/fault handling and adapters |
| Six demos | 24 cases: desktop interaction, effects-off business behavior, 390 px touch, 1280 px reduced-motion/keyboard |
| Desktop layout | 1440 × 1000 scenarios; captures also generated at 1280 × 900 |
| Resource lifecycle | 25 instrumented teardown cycles; additional Chromium CDP measurements after warmup/full GC |
| Build/package exports | 3 packed packages, ESM/CSS/types verified from extracted consumer directory; packed outputs included under releases/0.1.0 |
| README/assets | Matching English/Chinese structure; six real GIFs and PNGs; local links, hashes, dimensions and infinite GIF loops checked by verify:docs |
| Dependency audit | npm audit reports 0 advisories for the locked dependency set at this run; this is not a security certification |

Commands and raw output: [full-validation.log](testing/full-validation.log). Browser cases: [browser-results.json](testing/browser-results.json). Package metadata: [package-results.json](testing/package-results.json). Recordings and SHA-256 provenance: [manifest](assets/demos/manifest.json).

## Measured performance

Environment: v24.22.1, linux/x64, Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz; Chromium 141.0.7390.37. React 19.2.0, Vue 3.5.44, TypeScript 5.9.3, Playwright 1.56.1.

Browser workload: viewport 1440 × 1000, registered button grid, animated pointer source, 30 warmup frames + 120 measured frames. One complete world.step per rAF; timings include its simulation and DOM style work, not the entire browser rendering pipeline. Frame intervals reflect this headless host, not physical-device certification.

| Workload | World-step median | World-step p95 | Frame-interval p95 |
| --- | --- | --- | --- |
| 100 surfaces | 1.10 ms | 2.20 ms | 16.70 ms |
| 300 surfaces | 2.80 ms | 4.80 ms | 16.80 ms |

Pure solver workload: 120 warmup + 1200 measured fixed 1/120-second substeps, collision broadphase enabled, one impulse per measured step.

| Bodies | Step median | Step p95 | Maximum observed |
| --- | --- | --- | --- |
| 100 | 0.074 ms | 0.236 ms | 1.096 ms |
| 300 | 0.336 ms | 0.711 ms | 1.368 ms |
| 1000 | 2.249 ms | 3.923 ms | 51.477 ms |

The minified standalone ESM browser bundle is **47078 bytes raw / 15207 bytes gzip**, excluding source maps. Full npm tarballs are larger because they include modules, declarations, maps and license. Raw values and methodology: [performance-results.json](testing/performance-results.json).

## Lifecycle observations

After 30 warmup cycles, 30 additional world + surface + draggable actor + devtools mount/destroy cycles were measured using Chromium CDP with full GC before each observation. DOM nodes changed by **0**, event listeners by **0**, documents by **0**. Observed JS heap delta: **3952 bytes**. This small heap observation is not a proof of zero leakage; structural ownership and listener/observer/task/style cleanup are also exercised by explicit integration tests.

## Demo recordings

- skeleton-pet: 7.760000 s, 62 frames, 960 × 675, 2251003 bytes.
- liquid-world: 12.880000 s, 103 frames, 960 × 675, 3400470 bytes.
- gravity-dashboard: 7.010000 s, 56 frames, 960 × 675, 2170529 bytes.
- magnetic-interface: 11.260000 s, 90 frames, 960 × 675, 2804310 bytes.
- physics-portfolio: 7.630000 s, 61 frames, 960 × 675, 2792098 bytes.
- living-workspace: 9.880000 s, 79 frames, 960 × 675, 3299462 bytes.

All recordings come from actual page interactions through Playwright recordVideo, followed by ffmpeg GIF conversion. The initial blank recording lead is trimmed; palettes/frame rate are compressed; loops are infinite. No generated screenshots, design mockups or fabricated animation frames were used. SVG/Canvas scene artwork is authored in the repository. Total GIF bytes: 16717872.

## Compatibility and honest limits

Chromium 141.0.7390.37 is verified on this Linux host. Firefox 142.0.1 can launch but page creation did not become usable in an isolated 25-second probe. WebKit reports missing GTK/GStreamer/other shared libraries. Standard Playwright dependency installation failed due host identity/cache permissions; a read/download-only retry could not acquire the host package-manager lock. Those engines are **not passing or certified**. No Windows/macOS browser, Safari/iOS or Android-device run is claimed; touch tests are browser emulation. test:compat is supplied for a prepared host.

The solver uses finite-depth screen-space AABBs and springs; liquid is a soft-body approximation. Actors are procedural kinematic agents, with sampled obstacle clearance, side-climbing waypoints and viewport/depth-aware jumps, not articulated rigid bodies or a navmesh. Dense collision piles can approach quadratic cost. Shadow DOM, arbitrary transformed ancestor geometry and observing every external style change are outside current guarantees; use explicit invalidate/layout APIs and wrappers where documented. Application-specific L3–L7 state must be bridged explicitly. Unresolved external promises require application-owned cancellation; track suppresses stale result events.

## Reproduce

npm ci; npm run build; npx playwright install chromium; npm run check. For the measurements: npm run benchmark. For the actual recordings: npm run capture (requires ffmpeg and ffprobe). No Docker or external design assets are required. Build outputs are also provided as local-install tarballs under releases/0.1.0.

## Publication boundary

All implementation, tests, captures, README and this report were prepared locally. Final publication is authorized only after these local gates pass. The publication action and resulting GitHub commit will be reported separately; this document does not invent a successful remote push.
