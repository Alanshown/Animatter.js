import { performance } from "node:perf_hooks";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { cpus } from "node:os";
import { PhysicsEngine } from "../packages/core/src/physics/engine.js";
const rows = [];
for (const count of [100, 300, 1000]) {
  const engine = new PhysicsEngine();
  for (let i = 0; i < count; i++) {
    const b = engine.create(String(i));
    b.origin = { x: (i % 25) * 45, y: Math.floor(i / 25) * 35, z: 0 };
    b.size = { width: 30, height: 25 };
    b.collision = true;
    engine.impulse(String(i), { x: 50, y: -80 });
  }
  for (let i = 0; i < 120; i++) engine.step(1 / 120);
  const measurements = [];
  for (let i = 0; i < 1200; i++) {
    engine.impulse(String(i % count), { x: 25, y: 10 });
    const start = performance.now();
    engine.step(1 / 120);
    measurements.push(performance.now() - start);
  }
  measurements.sort((a, b) => a - b);
  rows.push({
    bodies: count,
    substeps: 1200,
    medianMs: measurements[600],
    p95Ms: measurements[1140],
    maxMs: measurements.at(-1),
  });
}
const bundle = await readFile("packages/core/dist/animatter.js");
const report = {
  date: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
  },
  method:
    "120 warmup steps, 1200 measured fixed 1/120s steps, collision sweep enabled, one impulse per measured step; headless CI CPU, not a device guarantee",
  physics: rows,
  browserBundle: {
    rawBytes: bundle.byteLength,
    gzipBytes: gzipSync(bundle).byteLength,
  },
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/performance-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
