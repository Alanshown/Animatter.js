# Package compatibility

Version 0.1.0 is published for all three packages. Anonymous public Registry installation, strict types, ESM/SSR-safe imports, CSS bundling and Chromium interaction checks are recorded in [release verification](NPM-RELEASE-0.1.0.md).

## Actual outputs and dependency direction

| Package / entry | JavaScript | Types / assets | Dependencies |
| --- | --- | --- | --- |
| `animatter` | `dist/index.js`, native ES2022 ESM modules | `dist/index.d.ts` | No runtime or peer dependencies |
| `animatter/browser` | `dist/animatter.js`, standalone minified ESM | `dist/index.d.ts` (same API as root) | No external runtime dependencies |
| `animatter/materials.css` | Not JavaScript | `dist/materials.css`, optional | Preserved by `sideEffects: ["**/*.css"]` |
| `@animatter/react` | `dist/index.js`, ESM | `dist/index.d.ts` | Required peers `animatter ^0.2.0`, `react >=18` (0.1.0 published adapters require `^0.1.0`) |
| `@animatter/vue` | `dist/index.js`, ESM | `dist/index.d.ts` | Required peers `animatter ^0.2.0`, `vue >=3.3` (0.1.0 published adapters require `^0.1.0`) |

Framework peers are intentionally required, not optional; `peerDependenciesMeta` is unnecessary. Neither adapter bundles a framework or a second copy of the core. The root workspace is private. No `@animatter/core` package is produced. Root and `/browser` exports share the same type declarations; `/browser` also supports direct browser ESM JavaScript imports. There is no CommonJS build or `require` export; Node's evolving ability to load ESM through require is not a CommonJS support promise.

## Environment and module safety

| Area | Declared or implemented | Evidence / limit |
| --- | --- | --- |
| Development runtime | No `engines` minimum; `packageManager: npm@11.9.0` | Node 24.22.1 / npm 11.9.0, Linux x64 verified; other Node/npm versions unverified |
| TypeScript | Pinned 5.9.3, strict NodeNext, ES2022 + DOM libs | Real installed-tarball consumer compiled with 5.9.3; older compilers unverified |
| ESM | `.js` modules, explicit relative file extensions, package exports | Fresh Node ESM consumer imports all three packages and standalone browser entry |
| SSR import | DOM access deferred until world construction/mount | All three package modules import in Node without window/document; full SSR framework rendering/hydration not certified |
| World creation | Requires live browser DOM | Call after mount; creating a world on the server is unsupported |
| Browser API | Pointer Events, observers, rAF, matchMedia, AbortController, individual CSS transforms and CSS variables | Current Linux Chromium tested; no polyfill bundle |
| React | Peer >=18; types from 19.2.2 in development | Runtime 19.2.0 and StrictMode lifecycle tested; React 18 not individually certified |
| Vue | Peer >=3.3 | Runtime 3.5.44 lifecycle tested; earlier 3.x not individually certified |
| Browser engine | Chromium 141.0.7390.37 on Linux x64 | Core integration and all six demo scenarios; touch is emulated |
| Other engines/platforms | No broad compatibility claim | Historical Firefox page-start failure and WebKit missing libraries; no Windows/macOS/iOS/Android physical-device certification |

The README development badges describe this environment, not a minimum supported runtime. Node is build/test tooling for this browser runtime. A future engines floor requires a deliberate support policy and validation. npm Trusted Publishing's Node/npm authentication prerequisites are separate; see [publishing](NPM-PUBLISHING.md).

## Reproduce

`npm ci`, `npm run build`, `npm run verify:package`, `npm run verify:docs`, `npm run test:core-browser`, `npm run test:demos`. Package checks install local tarballs with npm, validate exports and dependency trees, typecheck a consumer, resolve CSS and bundle it with tree shaking. They are independent of workspace symlinks. Browser checks require Playwright Chromium. Original screenshots/GIFs are retained and hash-checked, not recreated as design mockups.

See [current audit](NPM-PREPARATION-AUDIT.md) for this change's actual outcomes and [historical verification](VERIFICATION.md) for the baseline scope. Known geometry, solver, motion and cancellation limits remain in [architecture](ARCHITECTURE.md).
