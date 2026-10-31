# GitHub Packages distribution

GitHub Packages is a separate registry from npm. This workflow creates no GitHub Release, tag or new version and does not republish to npm. Package visibility and publication must be verified after the workflow runs; the workflow's presence alone is not publication evidence.

| npm package        | GitHub Packages variant      |
| ------------------ | ---------------------------- |
| `animatter`        | `@alanshown/animatter`       |
| `@animatter/react` | `@alanshown/animatter-react` |
| `@animatter/vue`   | `@alanshown/animatter-vue`   |

GitHub requires scoped lowercase names under the GitHub owner. The npm organization `@animatter` does not confer a GitHub namespace. The variants preserve the 0.1.0 runtime API, ESM exports, declarations, optional core CSS and framework peers. Only the ignored staging copies are renamed. Adapter JavaScript, declarations and core peer names use `@alanshown/animatter`; their source maps are omitted because import rewriting changes mappings. Core source maps remain unchanged. Do not combine adapters from one registry family with the other family's core, which can create duplicate runtimes.

## Manual publication

The maintainer must first approve the framework architecture and L0–L7 interaction acceptance. Packaging success is not architecture acceptance. On the reviewed `main` commit, manually run **Publish GitHub Packages** in Actions and enter the exact approved version. There are no push, tag or Release triggers. The workflow uses an ephemeral repository `GITHUB_TOKEN` with `contents: read` and `packages: write`; no stored personal token or npm token is required.

Before publishing it runs the complete existing `npm run check`, including browser/demo checks, then dry-runs and packs each staged variant, installs its actual tarball into a clean consumer and checks strict types, SSR-safe ESM imports, CSS retention, framework isolation and peers. Publication is core first, then adapters. A retry only accepts an existing version if its integrity matches; authentication errors never count as name availability. A fresh registry install verifies exact versions, Registry URLs and integrity after publication. A partial failure may leave individual packages published: inspect the run before retrying; never overwrite, delete or bump versions automatically.

All staging lives under ignored `artifacts/github-packages/`. The original npm package metadata, source imports, public API and version remain unchanged. After publication, verify that all three packages link to this repository and inspect their visibility in GitHub Packages settings. Initial visibility can be private even when the source repository is public; do not claim public access without checking it.

## Installation

Most users should keep using the existing public npm packages; they need no GitHub authentication. GitHub's npm registry requires authentication even for public packages. Follow the [official authentication guidance](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) for a classic personal access token with `read:packages` or an authorized Actions token. Never paste tokens into chat or commit them.

Configure only the GitHub owner scope in the consuming project's `.npmrc`:

```ini
@alanshown:registry=https://npm.pkg.github.com
```

Authenticate in your own terminal using the official login flow (supply the token only to npm's password prompt):

```sh
npm login --scope=@alanshown --auth-type=legacy --registry=https://npm.pkg.github.com
npm install @alanshown/animatter@0.1.0
# Optional integrations:
npm install @alanshown/animatter@0.1.0 @alanshown/animatter-react@0.1.0 react react-dom
npm install @alanshown/animatter@0.1.0 @alanshown/animatter-vue@0.1.0 vue
```

Use `@alanshown/animatter`, `@alanshown/animatter/materials.css`, `@alanshown/animatter-react` and `@alanshown/animatter-vue` in application imports. The three install commands apply after verified publication; check the Actions result and package page first. See [npm publishing](NPM-PUBLISHING.md) for the separate public npm distribution.
