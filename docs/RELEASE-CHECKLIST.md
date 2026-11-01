# Release checklist

This is a template for future releases, not evidence of completion. An unchecked item is not a pass. The first 0.1.0 npm publication is recorded separately in [NPM-RELEASE-0.1.0.md](NPM-RELEASE-0.1.0.md); no GitHub Release was created.

## Core gate comes first

- [ ] Identify the exact reviewed commit and compare ROADMAP, architecture and API with implementation.
- [ ] Verify the unified TypeScript runtime: events, spatial mapping, solver and scheduling shared by embodied/field modes.
- [ ] Verify L0–L7 and cross-component orchestration, user preemption, async results, native behavior and teardown.
- [ ] Review core browser test names/results and all six demo scenarios, not just API existence or screenshots.
- [ ] Resolve blockers and explicitly scope any unverified browser/platform. Maintainer approves the framework acceptance gate.

## Names and versions

- [ ] Repeat official Registry lookups; verify npm account, email, 2FA, package and `@animatter` namespace ownership.
- [ ] Confirm `animatter` remains core; if renaming is necessary, agree the coordinated import/peer migration first.
- [ ] Choose the real SemVer version; update all manifests, lockfile, adapter core peers, README badges and CHANGELOG.
- [ ] Document 0.x API changes and migration steps without implying 1.0 stability.

## Reviewed artifacts

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify:package` (dry-run, real pack, real local npm install, ESM/types/CSS/peers)
- [ ] `npm run verify:docs` (bilingual links, anchors, assets, SVGs and icon transparency)
- [ ] `npm run test:core-browser`
- [ ] `npm run test:demos` (six demos, desktop, effects off, emulated touch/reduced motion)
- [ ] Inspect exact tarball allowlist, exports, LICENSE, README, integrity, source map limitations and absence of credentials.
- [ ] Review raw logs, test environment and failures; no unsupported CI/browser badge or fabricated test count.
- [ ] Review English/Chinese examples, mode explanations and real screenshot provenance.

## Separate publication decision

- [ ] Obtain explicit maintainer authorization to publish this exact version/artifacts. A repository merge is not npm authorization.
- [ ] If enabling CI publishing, configure a package-specific OIDC trusted publisher, protected environment and allowed action; verify current npm prerequisites. No stored write token default.
- [ ] Publish reviewed core artifact, verify Registry availability/integrity, then publish reviewed adapters.
- [ ] Dist-tags: publish stable versions with the default tag, which sets `latest`. Do not pass `--tag` for a stable release. After publishing, `npm view animatter dist-tags` and the same command for each adapter must show `latest` at the new version. If not, fix with `npm dist-tag add <name>@<version> latest` and record why.
- [ ] Peer ranges: adapters' `animatter` peer must allow the core version being published (0.2.0 needs `^0.2.0`). Run `node scripts/verify-install.mjs --version <v>` before publishing and `node scripts/verify-install.mjs --registry <v>` after publishing; both must pass with no ERESOLVE.
- [ ] Install exact Registry versions into a fresh project and verify ESM/types/CSS/React/Vue and browser behavior.
- [ ] Record real npm URLs and integrity; only then enable npm badges and optionally create an accurate GitHub Release.
- [ ] Ensure deprecation/fix-forward guidance is ready; never overwrite/reuse a published version.

Actual evidence from this preparation belongs in [NPM-PREPARATION-AUDIT.md](NPM-PREPARATION-AUDIT.md), not pre-checked boxes here.
