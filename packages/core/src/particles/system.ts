import type { AnimatterWorld } from "../world.js";
import { ParticleSim, type FieldSpec, type FlowSpec, type ObstacleRect } from "./sim.js";
import { Canvas2DParticleRenderer, WebGL2ParticleRenderer, type ParticleRenderer, type ParticleRendererKind } from "./render.js";

export type ParticleBehavior = "flow" | "calm" | "swirl";

export interface ParticleSystemOptions {
  /** Particle capacity. Fixed for the life of the system. 1 to 200000. Default 2000. */
  count?: number;
  /** Requested renderer. webgl2 falls back to canvas2d when unavailable; check rendererKind. */
  renderer?: ParticleRendererKind;
  behavior?: ParticleBehavior;
  /** Point size in CSS px. Default 2.5. */
  size?: number;
  /** Trail persistence 0 to 0.95 (Canvas2D only). 0 clears every frame. Default 0. */
  trail?: number;
  background?: string;
  seed?: number;
}

export interface ParticleSystemHandle {
  readonly count: number;
  /** The renderer actually in use, after any fallback. */
  readonly rendererKind: ParticleRendererKind;
  readonly canvas: HTMLCanvasElement;
  emit(x: number, y: number, n?: number, speed?: number): number;
  setField(field: FieldSpec | null, slot?: number): void;
  setFlow(flow: Partial<FlowSpec>): void;
  /** Collision boxes in the stage's coordinates, for example DOM rects. Replaces the previous list. */
  setObstacles(rects: readonly ObstacleRect[]): void;
  /** Interleaved x,y targets; each particle is pulled to target i % count. null clears them. */
  setTargets(points: ArrayLike<number> | null, strength?: number): void;
  pause(): void;
  resume(): void;
  resize(): void;
  stats(): { frameMs: number; contextLost: boolean; paused: boolean; alive: number };
  destroy(): void;
}

const BEHAVIORS: Record<ParticleBehavior, FlowSpec> = {
  flow: { strength: 70, scale: 0.012, speed: 0.4 },
  calm: { strength: 18, scale: 0.008, speed: 0.2 },
  swirl: { strength: 110, scale: 0.02, speed: 0.9 },
};

let systemSerial = 0;

/**
 * Particle system on the world clock. Simulation runs in the world's frame step with the shared
 * clock delta. Rendering uses one canvas per system inside host. Each system owns its own buffers,
 * so several systems in one world (or several worlds) do not share state.
 * Lives in the optional `particles` entry, so the core runtime bundle stays free of GPU code.
 */
export function addParticleSystem(
  world: AnimatterWorld,
  host: HTMLElement,
  options: ParticleSystemOptions = {},
): ParticleSystemHandle {
  const count = options.count ?? 2000;
  const size = options.size ?? 2.5;
  const trail = options.trail ?? 0;
  if (!Number.isFinite(size) || size <= 0 || size > 64) throw new RangeError("size must be in (0, 64]");
  if (!Number.isFinite(trail) || trail < 0 || trail > 0.95) throw new RangeError("trail must be in [0, 0.95]");
  const background = options.background ?? "#f6f4ee";
  const name = `particles#${++systemSerial}`;
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const sim = new ParticleSim(count, width, height, options.seed ?? 12345);
  sim.flow = { ...BEHAVIORS[options.behavior ?? "flow"] };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", pointerEvents: "none", display: "block" });
  host.append(canvas);

  let renderer: ParticleRenderer;
  const requested = options.renderer ?? "webgl2";
  if (requested === "webgl2" && trail === 0 && WebGL2ParticleRenderer.supported()) {
    renderer = new WebGL2ParticleRenderer(canvas, background);
  } else {
    renderer = new Canvas2DParticleRenderer(canvas, trail, background);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(width, height, dpr);

  let paused = false;
  let destroyed = false;
  const times: number[] = [];
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === sim.width && h === sim.height) return;
    sim.resize(w, h);
    renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  };
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);

  const detach = world.attach({
    name,
    frame(dt: number) {
      if (destroyed || paused) return;
      const t0 = performance.now();
      sim.step(dt);
      if (!renderer.isLost()) renderer.draw(sim, size);
      times.push(performance.now() - t0);
      if (times.length > 60) times.shift();
    },
    destroy() {
      destroyed = true;
    },
  });

  return {
    count,
    rendererKind: renderer.kind,
    canvas,
    emit(x, y, n = 200, speed = 180) {
      if (destroyed) throw new Error("Particle system has been destroyed");
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("emit position must be finite");
      return sim.emit(x, y, n, speed);
    },
    setField(field, slot = 0) {
      if (destroyed) throw new Error("Particle system has been destroyed");
      sim.setField(field, slot);
    },
    setFlow(flow) {
      sim.flow = { ...sim.flow, ...flow };
    },
    setObstacles(rects) {
      if (destroyed) throw new Error("Particle system has been destroyed");
      sim.setObstacles(rects);
    },
    setTargets(points, strength) {
      if (destroyed) throw new Error("Particle system has been destroyed");
      sim.setTargets(points, strength);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    resize,
    stats() {
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      let alive = 0;
      for (let i = 0; i < sim.capacity; i++) alive += sim.alive[i]!;
      return { frameMs: avg, contextLost: renderer.isLost(), paused, alive };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      detach();
      renderer.destroy();
      canvas.remove();
    },
  };
}
