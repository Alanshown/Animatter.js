# npm release verification · 0.1.0

Published and verified on **2026-10-31 (Asia/Shanghai)** after explicit maintainer authorization and interactive npm authentication. All three exact versions were installed anonymously from the public Registry into an external consumer directory. No GitHub Release was created and no package version was increased.

Source commit: [`91f7c649eff039cc2401862b40b14a23bc559389`](https://github.com/Alanshown/Animatter.js/commit/91f7c649eff039cc2401862b40b14a23bc559389). Authenticated account: `shownalan`; Owner membership of `animatter` was verified. The private root workspace is not itself an npm package.

| Package | Version | Verified tag |
| --- | --- | --- |
| [animatter](https://www.npmjs.com/package/animatter) | 0.1.0 | latest |
| [@animatter/react](https://www.npmjs.com/package/@animatter/react) | 0.1.0 | latest |
| [@animatter/vue](https://www.npmjs.com/package/@animatter/vue) | 0.1.0 | latest |

## Evidence

Raw, timestamped package URLs, lockfile integrity values, peer dependencies, exports, environment and checks are in [registry-results.json](testing/npm-publication/registry-results.json). All three Registry `dist.integrity` values match the reviewed local tarballs; lockfile resolutions use `https://registry.npmjs.org/`, not workspace links or local file archives.

| Check | Result |
| --- | --- |
| Public installation | All three exact 0.1.0 versions installed with an anonymous config and a separate consumer/cache directory |
| Dependencies | `npm ls --all` passes; React 19.2.0, React DOM 19.2.0 and Vue 3.5.44 |
| Declarations | Strict TypeScript 5.9.3 NodeNext consumer, including browser-subpath types; no skipLibCheck |
| ESM / SSR-safe import | Core, standalone browser subpath and both adapters import without document/window |
| CSS | materials.css resolves from the package and survives the browser bundle |
| Real browser | Chromium 141.0.7390.37 loads the installed packages, resolves adapter exports, receives native click and semantic success events |
| Disabled mode and teardown | Business click behavior continues with effects off; destroy removes the actor portal |
| Integrity and tags | Reviewed SHA-512 integrity matches all public downloads; latest points to 0.1.0 for all three names |

The anonymous consumer imported the installed packages, not repository source modules. Node 24.22.1 and npm 11.9.0 on Linux x64 were used. The pre-publication run also passed typecheck, lint, 23 unit tests, build, local tarball consumer verification and docs/branding checks. The original 46-case Chromium implementation acceptance remains a separate historical record under testing/npm-preparation; it is not re-labelled as a new cross-browser run.

## Scope and distribution

This verifies the published package-consumer path within the documented Chromium/ES2022 scope. It does not certify Firefox/WebKit, physical iOS/Android devices, other Node/compiler versions or a general 3D/fluid engine. See [compatibility](PACKAGE-COMPATIBILITY.md) and [architecture](ARCHITECTURE.md).

Published 0.1.0 tarballs contain the package READMEs captured during preparation. GitHub documentation was updated after successful Registry verification. Package contents and integrity are immutable; this documentation update does not overwrite them or silently publish another version.

Consumers use npm and lockfiles. Source development stays in GitHub; local packs stay under ignored artifacts/. A source archive and a built distribution archive are distinct deliverables. No binary release folder is committed to the source tree, and npm publication does not create a GitHub Release.
