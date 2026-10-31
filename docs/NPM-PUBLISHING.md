# npm publishing preparation

**Preparation only. No publication is authorized by this document.** Current source version: 0.1.0. Core and full L0–L7 interaction acceptance must precede a maintainer's release decision. Brand/package checks alone cannot approve a framework release. Do not create a GitHub Release to imply npm availability.

## Names, account and namespace

| Candidate | Current repository role | Public Registry check, 2026-10-31 |
| --- | --- | --- |
| `animatter` | Actual core package | HTTP 404; not publicly found |
| `@animatter/core` | Alternative naming proposal only | HTTP 404; not publicly found |
| `@animatter/react` | Actual React adapter | HTTP 404; not publicly found |
| `@animatter/vue` | Actual Vue adapter | HTTP 404; not publicly found |

Raw timestamped responses: [registry-name-check.json](testing/npm-preparation/registry-name-check.json). A 404 is neither a reservation nor proof that npm will allow registration. Package-name policies, withheld names and namespace ownership can still prevent publication. GitHub account/repository ownership establishes no npm permissions. No `@animatter` organization or account ownership has been verified.

Before release, the maintainer must sign in to the intended npm account, verify email and account access, enable 2FA, and establish ownership of the unscoped name and the `@animatter` namespace with permission to publish each adapter. Check `npm whoami`, organization membership in npm settings, and `npm owner ls <existing-package>` where applicable. If the scope is unavailable, stop and agree a coordinated naming/migration plan; do not silently rename the core to `@animatter/core` or adapters to a different scope. Current imports/peers intentionally retain `animatter`.

Repeat authoritative lookups immediately before a release:

```sh
npm view animatter name version --registry=https://registry.npmjs.org
npm view @animatter/core name version --registry=https://registry.npmjs.org
npm view @animatter/react name version --registry=https://registry.npmjs.org
npm view @animatter/vue name version --registry=https://registry.npmjs.org
```

Treat network/auth failures as unverified, never as available. If a name exists, inspect owners and release history before acting.

## Version and changelog

Use a small, manual SemVer process rather than adding a second release system. PATCH fixes remain compatible, MINOR adds compatible features, MAJOR changes public contracts. During 0.x, identify API changes explicitly and provide migrations; do not use the pre-1.0 label to hide breakage. Keep workspace/package versions and adapter core-peer ranges coordinated. Move reviewed entries from CHANGELOG.md's Unreleased section only when a real release is approved. Update package-lock.json and verify every package. No version change is performed by the preparation scripts.

## Build and inspect locally

Verified development environment: Node 24.22.1 / npm 11.9.0 on Linux x64. No `engines` floor is declared; see [compatibility](PACKAGE-COMPATIBILITY.md). From the checkout root:

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

`verify:package` runs `npm pack --dry-run` and real `npm pack` for every package, compares entries, validates all export targets, installs all three local archives into a fresh consumer with real peer dependencies, typechecks declarations, imports ESM without a DOM and verifies CSS survives bundling. Artifacts are regenerated in `artifacts/packages/`; `releases/0.1.0/` contains historical archives and is not a current build output. No tarball is uploaded automatically.

Inspect the exact archive contents, integrity, dependencies, README and LICENSE in `test-results/package-results.json`. Only dist, package.json, README and LICENSE are allowed. CSS is explicitly side-effectful. Tests, demo images, credentials, node_modules, caches and source workspaces must not appear. Sourcemaps may refer to source paths not shipped in the package; source-level debugging is not a runtime support guarantee.

## Authentication and a future release

For local manual publishing use `npm login --registry=https://registry.npmjs.org` and the browser/2FA flow; never put login data or tokens in this repository, scripts, logs or documentation. Verify the intended identity and package ownership immediately before publishing. Do not disable 2FA to make automation convenient.

For future CI, prefer [npm Trusted Publishing / OIDC](https://docs.npmjs.com/trusted-publishers/), checked on 2026-10-31. The official requirements at that check are npm CLI >=11.5.1 and Node >=22.14.0, which are **authentication-tool requirements**, not this framework's runtime minimum. Configure a trusted publisher **per package**, bound to the exact GitHub owner `Alanshown`, repository `Animatter.js`, workflow filename and optional protected environment. GitHub-hosted runners and `permissions: {contents: read, id-token: write}` are required. Enable the intended allowed action in npm settings; current newly configured publishers permit staged publishing by default and direct `npm publish` permission is separate. First-package/account setup may require an authenticated maintainer bootstrap before package settings exist. Verify current npm guidance when enabling it.

There is no publishing workflow in this repository, no CI build badge and no configured OIDC relationship. A future workflow must be added only after account/namespace setup and the release gate; it should require explicit maintainer approval and verify the same reviewed commit/artifacts. Do not add long-lived write tokens as a default fallback.

After separate release authorization, the maintainer may publish the **reviewed tarballs**, core first, adapters after the core is visible:

```sh
# Future manual operations only. DO NOT run for preparation.
npm publish ./artifacts/packages/animatter-0.1.0.tgz --access public --registry=https://registry.npmjs.org
npm publish ./artifacts/packages/animatter-react-0.1.0.tgz --access public --registry=https://registry.npmjs.org
npm publish ./artifacts/packages/animatter-vue-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

Replace archive names with the genuinely approved version; check `npm view <name>@<version> dist.integrity` against the reviewed artifact. Never retry an immutable version by changing its contents. Local login and OIDC are alternative authentication paths, not reasons to keep a token in a workflow.

## Post-publication verification and incidents

In a fresh external directory install exact released versions from the public Registry, install React/Vue peers explicitly, repeat ESM, browser CSS/bundler and TypeScript consumption tests, and check a real browser. Confirm npm ownership, dist-tags, README and tarball contents before enabling npm-version/download badges. Log actual URLs and integrity values; a successful Git push is not proof of npm publication.

For a defective release, stop downstream automation, document affected versions and publish a reviewed fix under a **new** version after re-running acceptance. Deprecate an affected version with a clear reason and replacement, for example `npm deprecate 'animatter@<affected-version>' 'Use <fixed-version>; see repository advisory'`. Coordinate adapter peer ranges and deprecation messages. If compromise is suspected, revoke exposed credentials in npm settings, review publisher access, rotate affected secrets and notify maintainers. Use npm's current [unpublish policy](https://docs.npmjs.com/policies/unpublish) and support process; do not assume deleting a GitHub tag removes an npm package or that a version can be reused. Do not perform deprecation, unpublishing or credential changes during preparation.
