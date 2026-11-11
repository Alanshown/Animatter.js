# npm release verification ? 0.2.0

Published and verified on **2026-11-11 (Asia/Shanghai)** after explicit maintainer authorization and interactive npm authentication. All three exact versions installed anonymously from the public Registry into fresh consumer directories. No GitHub Release was created and no package version was increased.

Source commit: [8e0d1ef](https://github.com/Alanshown/Animatter.js/commit/8e0d1ef8086b31dcd7ab14226d77a0f8686e80f9). Authenticated account: `shownalan`. The private root workspace is not itself an npm package.

| Package | Version | Verified tag |
| --- | --- | --- |
| [animatter](https://www.npmjs.com/package/animatter) | 0.2.0 | latest |
| [@animatter/react](https://www.npmjs.com/package/@animatter/react) | 0.2.0 | latest |
| [@animatter/vue](https://www.npmjs.com/package/@animatter/vue) | 0.2.0 | latest |

## Evidence

Raw package URLs, integrity values, peer dependencies, exports, environment and checks are in [registry-results.json](testing/npm-publication/registry-results.json). All three Registry integrity values match the reviewed local tarballs.

| Check | Result |
| --- | --- |
| Public installation | All three exact 0.2.0 versions installed with an anonymous config and separate consumer/cache directories |
| Subpaths | Core-only, `animatter/particles`, React adapter and Vue adapter all install and import successfully (8/8) |
| Pre-publication gates | Typecheck, lint, 93 unit tests, build, package contents, browser subpaths, Chromium implementation/demo checks, branding and local consumer installs passed |
| Registry integrity and tags | Public integrity matches reviewed archives; `latest` points to 0.2.0 for all three names |

## Scope and distribution

The verification covers the documented Chromium and ES2022 package-consumer path. It does not certify other browsers, physical devices or all Node versions. Version 0.2.0 adds the advanced interaction modules described in the changelog while retaining the React `>=18` and Vue `>=3.3` peer contracts.

Published tarballs are immutable snapshots of the package READMEs and builds captured during release. GitHub documentation updates do not overwrite those artifacts. npm publication does not itself create a GitHub Release.
