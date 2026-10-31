# Branding and npm preparation audit

Baseline: `f9b0ee9cd3911bbabc5bec4510a793989b77c7f7` on main. Review: 2026-10-31, Asia/Shanghai. Version remains 0.1.0. This audit will record the actual validation outcomes before integration; preparation is not npm publication or a new framework acceptance claim.

## Findings and changes

- Existing source includes one TypeScript core, actor/field renderers, a graph/arbiter and React/Vue lifecycle adapters; six HTML demos and historical browser captures exist. No GitHub Actions workflow existed at the baseline; no CI status badge is added.
- Existing manifests expose ESM/types/CSS correctly but lack consistent repository, homepage, bugs, descriptions, keywords and publish access. Metadata is completed without renaming packages or changing API/engine code.
- Existing package checks manually unpacked archives and symlinked peers; replaced by real npm tarball installation, export/dependency/CSS/SSR-import and declaration consumption checks.
- Existing README verification hardcoded 11 headings. It now validates actual bilingual structure, matching examples/versions, local links/anchors, HTML hero images, demo provenance and vector/icon assets.
- Introduced original vector brand with hand-drawn path lettering, theme variants, transparent PNGs, demo favicon and small shared-toolbar attribution. Existing scene art and recordings remain intact.
- Official public Registry returned HTTP 404 for all four proposed names. No name reservation, npm login, namespace ownership or publishing permission is established.
- Added type declarations to the existing `animatter/browser` ESM export without changing its JavaScript API.
- Routine demo test screenshots now go to artifacts/demo-screenshots instead of overwriting the retained README PNGs.
- No Node engines minimum is invented. Local development is Node 24.22.1/npm 11.9.0; browser runtime compatibility is documented separately.

## Status and priorities

| Item | Evidence-based status | Next priority / risk |
| --- | --- | --- |
| Unified core, actor/field modes, cross-component L0–L7 | Existing implementation and historical Chromium acceptance; this task reruns existing integration suites | Preserve shared runtime and native lifecycle; do not infer arbitrary app state |
| Six derived demos | Source and real GIF/PNG provenance retained; current smoke outcomes recorded below | Keep demo tests independent of branding screenshots |
| Branding/docs/package preparation | Implemented; acceptance depends on the recorded checks below | Review exact artifacts and README in both themes |
| Firefox/WebKit and physical devices | Not verified by this preparation | Run dedicated platform tests before promising support |
| npm names/scope/account | Blocked on maintainer ownership verification | Resolve before release, never rename silently |
| npm publication / GitHub Release | Not performed | Separate explicit authorization and core acceptance required |

Known architecture risks remain: finite-depth AABB/spring approximation; dense contact workloads; sampled kinematic actor routing; transformed ancestor and Shadow DOM scope; application-owned async cancellation. See ARCHITECTURE.md and the original acceptance report. These are not addressed through unrelated engine refactoring here.

## Current validation

Local validation on Node 24.22.1 / npm 11.9.0, Linux x64, Chromium 141.0.7390.37:

| Check | Result / evidence |
| --- | --- |
| npm ci, typecheck, lint, unit tests, build | Passed; 23/23 unit tests; [validation log](testing/npm-preparation/validation.log) and [run summary](testing/npm-preparation/run-results.json) |
| Complete browser suite | Passed, 46/46: 22 core + 24 demo cases; [browser results](testing/npm-preparation/browser-results.json), [raw log](testing/npm-preparation/browser-validation.log) |
| Demo regression after redirecting test screenshots | Passed, 24/24; [demo results](testing/npm-preparation/demo-results.json), [raw log](testing/npm-preparation/demo-validation.log) |
| Three packages | Dry-run and real pack agree; actual npm tarball installation, strict declaration compilation (including dependency declarations), ESM/browser exports, SSR-safe imports, CSS retention and peer tree pass; [package report](testing/npm-preparation/package-results.json) |
| Bilingual README/assets | Local paths and anchors, matching code/badges, six GIF SHA-256/loop checks and PNGs pass; [docs report](testing/npm-preparation/docs-results.json) |
| Brand | Seven SVGs parse/render; 24/32/64 light/dark symbol review, transparent 192/512 PNG alpha/size checks pass; [brand report](testing/npm-preparation/branding-results.json), [visual review](testing/npm-preparation/brand-review.png) |

The initial offline consumer attempt could not resolve uncached Registry package metadata. The consumer now uses npm's prefer-offline mode with bounded network requests, without force or legacy-peer-deps. The final real installation and `npm ls` pass. Brand-script lint errors were corrected before the passing final run. No failing attempt is reported as a pass.

No physics/behavior implementation or original GIF/PNG was modified. Historical report headings now identify their original checkpoint; raw baseline test records remain unchanged. This evidence covers the declared Chromium scope; Firefox/WebKit and physical platforms remain unverified. Scope ownership blocks a future npm release, not merging this preparation change. No npm login/publish, GitHub Release or version increase occurred.
