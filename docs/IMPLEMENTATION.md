# Implementation and acceptance ledger

Audit date: 2026-10-31 (Asia/Shanghai). GitHub API reports an empty public repository, default branch main, no files or initial commit. Local clone confirmed empty. No source or AGENTS.md to inherit. Node 24.22.1, npm 11.9.0, git 2.51.1 available. Registry access verified. No remote writes during development.

## Dependency order

1. Establish ESM TypeScript workspaces, build, static checks and test runner.
2. Implement deterministic physics, spatial index, input protocol, graph, planner and preemptive scheduler. Test before demos.
3. Compose runtime and field/actor renderers; verify cleanup, modes, plugins and accessibility.
4. Implement six independent HTML scenes using public runtime APIs.
5. Run browser scenarios, desktop/mobile, reduced motion, keyboard, cleanup and frame measurements; capture actual screenshots and GIFs.
6. Write matching English/Chinese README, API, architecture, limitations, contribution and MIT license.
7. Full local audit and package verification; record actual evidence. Push once only if acceptance passes.

## Acceptance policy

Passing an API existence check is not proof of a working feature. Evidence must identify a test or browser scenario. Unsupported capabilities must be listed explicitly. No fabricated browser coverage, frame rates, memory numbers or publication status. No claim of npm publication. Final push withheld if mandatory acceptance is incomplete.
