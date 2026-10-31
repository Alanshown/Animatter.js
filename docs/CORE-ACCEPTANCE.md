# Core acceptance gate

Status: PASSED for the declared Chromium / ES2022 scope on 2026-10-31. Demo work may resume. No npm publication or untested browser/device support is claimed. Existing demo drafts were not used as core acceptance evidence.

The first fixture run verified basic physics, native input, modes, scheduling, adapters and teardown. That was insufficient to declare the framework complete. The following gate must pass before resuming demo development:

- Explicit actor state transitions, continuous action blending and configurable action timing.
- Geometry-driven movement, dynamic anchors, contact feedback and actor drag cancellation.
- One protocol across L0–L7, native proximity/gesture/selection/scroll coverage and composed event bindings.
- Reentrant event safety, task queue cancellation, stale async result suppression and behavioral cleanup.
- Force-field extension protocol, material validation, depth-separated collision and continuous layout transactions.
- Root/region/surface opt-in, mode and enable controls, keyboard/touch/reduced-motion behavior.
- Public APIs and publishable ESM/types/CSS exports verified independently of demos.
- Integration tests on available real browser engines; missing platform dependencies are not passes.
- Measured performance, resource ownership checks and documented algorithmic limitations.

This gate is separate from the final six-demo/readme/GIF acceptance gate. Nothing has been pushed.

## Recorded evidence

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run verify:package`, `npm run test:core-browser`: passed.
- 20 pure unit tests: springs, determinism, constraints, collisions/depth, gravity, planner paths/climb, normalized blending, graph, arbitration, cancellation and async sequencing.
- 19 real Chromium browser cases: native input, all protocol levels, composition, fault isolation, regions/modes, actor drag/contact, proximity/longpress/gesture/selection, scroll/layout, presence, stale async suppression, adapters, touch, reduced motion and teardown.
- Archive exports and declaration imports exercised from an extracted consumer directory for core/React/Vue.
- 100/300-surface rendering measurements and Chromium CDP lifecycle metrics recorded in `testing/core-browser-results.json`.
- API and architecture reviewed in `API.md` and `ARCHITECTURE.md`; custom surface renderer, actor renderer, behavior, field, plugin and material protocols are implemented.

## Environment limitations

Firefox 142.0.1 launches but cannot create a usable page in this managed host (25-second isolated startup probe timed out). WebKit cannot launch because GTK/GStreamer and other shared libraries are absent. Standard dependency installation failed due host identity/cache permissions; no cross-engine pass is claimed. Chromium 141.0.7390.37 is the tested browser. `npm run test:compat` is provided for a host with all Playwright dependencies.

Known algorithmic scope is explicit: kinematic procedural actors, rectangular obstacle-clearance heuristic, spring-based soft-body approximation, finite-depth AABB contacts. No general 3D, navmesh, true fluid, articulated-limb or high-speed continuous-collision claim. See architecture limitations.

Final six-demo/GIF/README acceptance remains separate and incomplete at this checkpoint. Remote repository still untouched.

## Final regression expansion

The final source adds disabled-engine/direct-actor guards, continuous drag-release excursions, bounded combination histories, cancellation reentrancy protection and viewport/depth-aware jump arcs. The complete local verification now exercises 23 unit tests and 46 Chromium browser cases (22 core plus 24 demo desktop/touch/reduced-motion/effects-off business scenarios). Final raw evidence is in `testing/browser-results.json` and `testing/full-validation.log`.

Final pursuit regression: a continuously oscillating target must not reset the arrival clock indefinitely. Retargeting preserves the remaining active travel budget; preemption/resume still replans from the current pose. This is exercised independently of the scene timeout.
