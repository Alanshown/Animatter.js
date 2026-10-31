# Contributing

Use Node 24 (the tested development runtime), npm and a local Chromium installation managed by Playwright. No Docker is required.

```sh
npm ci
npx playwright install chromium
npm run check
npm run benchmark
npm run capture
```

The capture command requires ffmpeg and ffprobe. For additional engines install their Playwright browser/system dependencies and run `npm run test:compat`. Default required checks deliberately target the recorded Chromium scope; do not present that as a Safari/device certification.

Keep core algorithms separate from browser integration and scene code. Extend the existing semantic world rather than adding a separate animation engine inside a demo. Keep native keyboard, form, navigation and touch behavior intact. Register only intended surfaces and make teardown idempotent. Treat actor/field renderer cleanup as an ownership contract.

For changes to public behavior, include a focused regression or browser scenario that would fail without the change. For performance claims, record the command, workload, environment and raw measurement. Re-record actual demos after visual changes; never replace browser evidence with mockups or generated images.

Source is in packages/core, packages/react and packages/vue. Independent demo entries are under demos. API/architecture and evidence are under docs. Build outputs and recordings in artifacts/test-results are generated; preserve final reviewed evidence under docs/testing and docs/assets/demos.

Before a pull request, run npm run check, inspect README links/images, ensure both README translations convey the same behavior and limitations, and describe what changed and how it was verified. Do not commit node_modules, temporary recordings or environment credentials.

Contributions are licensed under the repository's MIT license. Report ordinary bugs in GitHub issues with a minimal reproduction. For a security issue, avoid including credentials or private code in a public report.
