# npm publishing and distribution

Version **0.1.0** is published on the public npm Registry for the core and both adapters. The maintainer explicitly authorized this publication and completed npm's interactive authentication. Anonymous Registry installation, reviewed-tarball integrity matching, strict types, ESM/SSR-safe imports, CSS bundling and Chromium behavior checks passed. See [the release record](NPM-RELEASE-0.1.0.md) and [raw consumer results](testing/npm-publication/registry-results.json).

This does not authorize another version or create a GitHub Release. Every future release still requires core architecture / L0–L7 acceptance and an explicit maintainer decision. Branding or packaging success alone cannot approve a framework release.

## Published names and ownership

| Package | Role | Published version |
| --- | --- | --- |
| [animatter](https://www.npmjs.com/package/animatter) | Independent core, types and optional CSS | 0.1.0 |
| [@animatter/react](https://www.npmjs.com/package/@animatter/react) | React lifecycle adapter | 0.1.0 |
| [@animatter/vue](https://www.npmjs.com/package/@animatter/vue) | Vue lifecycle adapter | 0.1.0 |

The authenticated npm account was `shownalan`; `npm org ls animatter` confirmed its Owner role. GitHub ownership alone does not grant npm publishing rights. `@animatter/core` remains an unused naming proposal, not a fourth delivered package. Existing imports and adapter peers intentionally use `animatter`.

The earlier [name check](testing/npm-preparation/registry-name-check.json) is a historical pre-publication record. Its 404 results are not the current status of the three published names. Recheck account, organization membership, package owners and Registry versions before every future release. A network/authentication failure is not evidence that a name is available.

## Installation and source development

Consumers install from npm:

```sh
npm install animatter
npm install animatter @animatter/react react react-dom
npm install animatter @animatter/vue vue
```

The latter two commands are optional integrations. Append `@0.1.0` to the Animatter package names to pin this release. The application owns its framework dependencies; see [compatibility](PACKAGE-COMPATIBILITY.md) for declared peer ranges and actually tested versions.

Contributors clone the source, use Node 24.22.1 / npm 11.9.0 for the verified local environment, and run:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:package
npm run verify:docs
npx playwright install chromium
npm run test:core-browser
npm run test:demos
```

No `engines` minimum is invented. Other browsers/platforms require their own evidence. `verify:package` checks local candidate tarballs; it does not prove Registry publication. It performs pack dry-runs and real packs, export/allowlist checks, real local npm installation, strict declarations, ESM/SSR imports, CSS retention and peer checks.

## Distribution artifacts

Use npm for application dependency management and lockfiles. Keep generated tarballs outside the source tree in ignored `artifacts/packages/`; the report helper writes copies/manifests to `artifacts/releases/<version>/`. Do not commit binary release archives or create a source-tree releases directory.

An npm package contains built ESM JavaScript, `.d.ts` declarations, CSS where needed, package metadata, README and LICENSE. Source archives are a separate developer deliverable containing TypeScript, tests, demos, docs and build configuration. A future GitHub Release can offer source and distribution archives separately, with clear labels and checksums; no such Release is implied by npm publication.

Inspect the exact candidate allowlist, exports, integrity and dependency tree before publication. Tests, screenshots, credentials, node_modules and caches must not be included. Published tarballs are immutable snapshots, including their package READMEs. Repository documentation updates after publication do not overwrite those snapshots; changed package content requires a separately approved new version.

## Version and authentication

PATCH fixes remain compatible, MINOR adds compatible functionality, MAJOR changes public contracts. During 0.x, state API changes and migrations explicitly. Coordinate all package versions, adapter core-peer ranges, lockfile and CHANGELOG. No preparation or verification script automatically bumps versions or publishes.

For an authorized manual publication, use the official browser login flow:

```sh
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm org ls animatter --json --registry=https://registry.npmjs.org
```

The maintainer completes login and any operation-specific 2FA on npm's official pages. Never place passwords, tokens, OTPs, login-state files or recovery codes in the repository or evidence logs. Do not disable 2FA to simplify automation.

After separately approving a new version, replace `X.Y.Z` below with that exact version, rebuild/review the artifacts and publish core first, then adapters:

```sh
# Future approved versions only; 0.1.0 already exists and cannot be overwritten.
RELEASE_VERSION=X.Y.Z
npm publish "./artifacts/packages/animatter-${RELEASE_VERSION}.tgz" --access public --registry=https://registry.npmjs.org
npm publish "./artifacts/packages/animatter-react-${RELEASE_VERSION}.tgz" --access public --registry=https://registry.npmjs.org
npm publish "./artifacts/packages/animatter-vue-${RELEASE_VERSION}.tgz" --access public --registry=https://registry.npmjs.org
```

A publish command reporting acceptance or processing is not yet proof of public installation. Wait for Registry metadata, compare `dist.integrity` with the reviewed archive, install exact versions anonymously into a fresh external consumer, verify lockfile Registry URLs, types, imports, CSS, peers and browser behavior. Do not repeatedly republish an accepted version while waiting for visibility. Confirm the intended `latest` dist-tag before updating consumer documentation or npm badges. Stable releases use the default tag (sets `latest`); `npm view <name> dist-tags` must show the new version for `latest` for `animatter`, `@animatter/react` and `@animatter/vue`. Adapter peer ranges must match the core version (`animatter ^0.2.0` for 0.2.0). `node scripts/verify-install.mjs --registry <version>` installs the published versions into fresh consumers and imports them.

## Future Trusted Publishing / OIDC

Prefer [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) for a future CI workflow. At the 2026-10-31 documentation check, publishing requires npm CLI >=11.5.1 and Node >=22.14.0; these are authentication-tool prerequisites, not the framework's runtime minimum.

Configure each existing package's trusted publisher with GitHub owner `Alanshown`, repository `Animatter.js`, the exact workflow filename and any protected environment. The workflow must exist, use supported GitHub-hosted runners, and grant `contents: read` / `id-token: write`. Select the intended allowed action in npm settings; direct `npm publish` permission is separate from staged publishing. Recheck npm's current setup and expiry rules before enabling it.

No publishing workflow or OIDC relationship was configured for this first manual publication. Do not display a CI success badge or assume account linking enabled publication. A future workflow needs reviewed permissions, an explicit release action and the same artifact/acceptance checks; do not add long-lived write tokens as a default fallback.

## Incidents and fix-forward

For a defective release, stop further publishing, identify affected versions and issue a reviewed fix under a new version. Deprecate affected versions with a concrete reason/replacement, for example `npm deprecate 'animatter@<affected-version>' 'Use <fixed-version>; see repository advisory'`, only after explicit authorization. Coordinate adapter peers and notices.

For suspected compromise, review publisher access, revoke exposed credentials and rotate affected secrets through npm's official account settings. Follow the current [unpublish policy](https://docs.npmjs.com/policies/unpublish) and support process when needed. Deleting a GitHub tag does not remove an npm package, and an unpublished name/version cannot be reused. No deprecation, unpublishing or account changes are part of this release documentation update.
