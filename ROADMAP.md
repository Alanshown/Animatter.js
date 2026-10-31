# Roadmap

## 0.1.0 · implemented

Independent typed ESM core; optional CSS materials; L0–L7 protocol; DOM spatial grid and anchors; fixed-step springs, force sources, depth-separated AABB contacts and constraints; graph and composed priority behaviors; procedural actors and continuous motion blending; SVG/Canvas/surface renderer protocols; React/Vue adapters; opt-in devtools; six independent HTML studies; local automated verification and actual browser GIFs.

The core and adapters are published at 0.1.0 on npm with anonymous consumer verification; see [release evidence](docs/NPM-RELEASE-0.1.0.md).

## 0.2 · planned, not implemented

- Run the full suite on Firefox, WebKit and physical touch devices in environments with the required dependencies.
- Publish renderer/behavior integration recipes for existing accessible component systems.
- Configure package-specific Trusted Publishing after reviewing maintainer access and future release authorization.
- Evaluate additional spatial invalidation strategies for externally transformed layouts.

## 0.3 · research

Measure a worker-based solver and more robust broadphase against the current DOM workload. Prototype better obstacle routing and richer character rigs through the renderer protocol. These are research items, not delivered guarantees.

## 1.0 · stability gate

Set a documented browser/device support policy, version the public protocol, validate migration guidance and package-consumer workflows, then commit to API stability. No date or performance promise is implied.
