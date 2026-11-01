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
- Demos: `demos/lab`, `demos/liquid-dock`, `demos/kinetic-type`.
- Scripts: `npm run test:modules` (browser checks for dock, typography and Lab), shared Chromium launcher in `scripts/browser-utils.mjs` (`CHROME_PATH` override), dev server maps `/favicon.ico` to the brand favicon.

## 0.1.0 — 2026-10-31

First npm publication of `animatter`, `@animatter/react` and `@animatter/vue`, after explicit maintainer authorization and interactive npm authentication. No GitHub Release was created. Source baseline: `91f7c649eff039cc2401862b40b14a23bc559389`.

- Shared TypeScript runtime, embodied/field modes, L0–L7 semantics, React/Vue adapters and six interaction studies.
- Original vector branding, bilingual README, transparent icons and shared demo attribution.
- ESM/browser/CSS/type exports, required framework peers and controlled package contents.
- Anonymous public Registry installation of all three exact versions; declaration, ESM/SSR, CSS, dependency and Chromium interaction verification.
- Distribution archives remain outside the source tree; generated artifacts are ignored.

See [npm release verification](docs/NPM-RELEASE-0.1.0.md) for actual package URLs, integrity values, checks and limitations. Historical initial implementation evidence remains under docs/testing.
