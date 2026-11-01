# Changelog

All changes follow Semantic Versioning. During 0.x, public APIs may change; document migrations and do not infer 1.0 stability.

## Unreleased

No additional package version has been published after 0.1.0. Documentation updates after publication do not overwrite immutable Registry artifacts.

### v0.3 (local branch, not published)

- Core: `world.attach(system)` schedules a module on the world clock (`fixedStep` after physics, `frame` after rendering). Systems never own a `requestAnimationFrame` loop. Disposed on `destroy()`.
- Core: `claimStyle(element, property, owner)` gives one writer per inline style property; conflicting claims throw.
- `createLiquidDock(world, container, options)`: proximity magnification, spring settle, pointer drag reorder, Alt+Arrow keyboard reorder, horizontal and vertical layout, `onReorder` callback. The dock owns `transform` of its items and `touch-action` of its container.
- `createKineticText(world, element, options)`: grapheme-cluster letters (`Intl.Segmenter`), elastic / magnetic / wave / gravity / velocity modes, `scatter()`, `reform()`, `setText()`, `setMode()`, `remeasure()`, `destroy()`. Words are kept on one line; text over 160 graphemes falls back to plain text.
- `parseScene` / `serializeScene`: versioned (`schemaVersion: 1`) JSON-only scene schema with path-based errors. Used by Animatter Lab.
- Kinetic text Canvas renderer: `createCanvasKinetic(world, host, text, options)` draws the same modes with `fillText`, greedy word wrap via `measureText`, and a 400-glyph limit. Original text kept in a visually hidden node. Surfaces the same spring semantics; the DOM controller remains the default.
- Liquid connector: `createLiquidDock(..., { connector: true })` draws a metaball layer behind the items so neighbours look joined. Visual only.
- Demos: `demos/lab`, `demos/liquid-dock`, `demos/kinetic-type`.
- Scripts: `npm run test:modules` (browser checks for dock, typography and Lab), shared Chromium launcher in `scripts/browser-utils.mjs` (`CHROME_PATH` override), dev server maps `/favicon.ico` to the brand favicon.

### v0.4 (local branch, not published)

- Rope: `createRope(world, options)` is a Verlet / position-based rope with fixed substeps. Ends attach to points or to DOM elements (`elementAnchor`), break when stretch exceeds `breakStretch` (a stretch ratio, not a force), reconnect explicitly, and resize with `setLength` / `setBreakStretch`. `mountRopeSvg` draws it. A broken end stays free until `reconnect` or `attachX`.
- Soft body: `createSoftBody(world, options)` is a point-mass ring with edge springs, centre spokes for shape recovery, an area-pressure term, optional `outline` rest shape, grab / drag / release and impulses. `linkSoftBodyContacts` adds particle contacts between bodies. This is a constraint model. It is not a fluid or finite-element solver.
- Metaball: `createMetaballCanvas(world, host, options)` draws the iso-surface of a scalar field on a low-resolution Canvas2D grid. It is visual fusion only.
- Demos: `demos/rope-editor`, `demos/jelly-card`, `demos/soft-body`.
- Tests: `tests/v04-modules.test.ts` (node, with a world double) and new browser cases in `npm run test:modules`.

### v0.5 (local branch, not published)

- Particles: `addParticleSystem(world, host, options)` from the optional `particles` entry (`dist/particles.js`), so the core bundle has no GPU code. Fixed-capacity typed-array simulation (flow field, attract / repel / vortex fields in 4 slots, viewport reflection with restitution, deterministic seed). Emit recycles the oldest slots.
- Renderers: WebGL2 (one POINTS draw, `webglcontextlost` / `restored` handled, GPU objects released on destroy) with a Canvas2D fallback that supports trails. `rendererKind` reports what is actually used.
- Deviation from the draft API: the draft wrote `world.addParticleSystem`. It is a free function so the core world does not import particle code.
- Not implemented: text-shape attraction, surface collision against DOM geometry (only viewport bounds), WebGPU.
- Demo: `demos/particles`. Tests: `tests/v05-particles.test.ts` and three browser cases in `npm run test:modules`.

### v0.6 (local branch, not published)

- Actor behaviours: `BehaviourMachine` (pure state machine: idle, exploring, resting, dragged, loading, celebrating, erroring, following) with three profiles (`calm`, `curious`, `busy`), bounded memory (five recent targets, idle time since the last user signal, one interrupted target), and commands that map onto existing ActorRuntime methods.
- `attachActorBehaviour(world, actor, options)`: runs the machine on the world clock. A cancelled walk is re-planned on the next decision. Dragging interrupts a walk; the calm and curious profiles resume the same target on release.
- Not implemented: obstacle-aware path replanning beyond cancellation, multi-actor avoidance, and the Nuxt, Vue and React consumer builds from the spec.
- Demo: `demos/actor-behaviours`. Tests: `tests/v06-behaviours.test.ts` (14 node tests) and four browser cases in `npm run test:modules`.
- Cross-browser: `npm run test:compat` covers Chromium, Firefox and WebKit (Playwright engines). `MODULE_ENGINE=firefox|webkit npm run test:modules` runs the module demo checks on each engine. Safari and real devices are not tested.
- Fixture: `tests/fixtures/runtime.html` now declares a viewport meta tag, so mobile emulation in WebKit uses a 390 px layout.

## 0.1.0 — 2026-10-31

First npm publication of `animatter`, `@animatter/react` and `@animatter/vue`, after explicit maintainer authorization and interactive npm authentication. No GitHub Release was created. Source baseline: `91f7c649eff039cc2401862b40b14a23bc559389`.

- Shared TypeScript runtime, embodied/field modes, L0–L7 semantics, React/Vue adapters and six interaction studies.
- Original vector branding, bilingual README, transparent icons and shared demo attribution.
- ESM/browser/CSS/type exports, required framework peers and controlled package contents.
- Anonymous public Registry installation of all three exact versions; declaration, ESM/SSR, CSS, dependency and Chromium interaction verification.
- Distribution archives remain outside the source tree; generated artifacts are ignored.

See [npm release verification](docs/NPM-RELEASE-0.1.0.md) for actual package URLs, integrity values, checks and limitations. Historical initial implementation evidence remains under docs/testing.
