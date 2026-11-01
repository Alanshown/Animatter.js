/**
 * Position-based rope solver (Verlet integration with distance constraints).
 * Pure numeric code: no DOM, no timers. Positions live in Float32Array buffers that are
 * allocated once, so stepping does not create objects. Callers use a fixed time step.
 */
export interface RopeSolverOptions {
  /** Number of segments (nodes = segments + 1). 1 to 200. */
  segments: number;
  /** Total rest length in px. */
  length: number;
  /** Fraction of each constraint correction applied per iteration, 0 to 1. */
  stiffness: number;
  /** Velocity retained per step, 0 to 1. Lower values damp harder. */
  damping: number;
  gravity: { x: number; y: number };
  /** Constraint iterations per step. 1 to 32. */
  iterations: number;
  /** Maximum node displacement per step in px. Guards against explosions after drags. */
  maxStep: number;
  /** Optional floor: nodes never go below this y. */
  floorY: number | null;
}

export const ROPE_LIMITS = {
  segments: [1, 200],
  iterations: [1, 32],
} as const;

export function normaliseRopeOptions(options: Partial<RopeSolverOptions>): RopeSolverOptions {
  const segments = options.segments ?? 16;
  const length = options.length ?? 240;
  const stiffness = options.stiffness ?? 0.9;
  const damping = options.damping ?? 0.98;
  const iterations = options.iterations ?? 8;
  if (!Number.isInteger(segments) || segments < ROPE_LIMITS.segments[0] || segments > ROPE_LIMITS.segments[1])
    throw new RangeError("segments must be an integer between 1 and 200");
  if (!Number.isFinite(length) || length <= 0) throw new RangeError("length must be a positive number");
  if (!Number.isFinite(stiffness) || stiffness < 0 || stiffness > 1) throw new RangeError("stiffness must be in [0, 1]");
  if (!Number.isFinite(damping) || damping < 0 || damping > 1) throw new RangeError("damping must be in [0, 1]");
  if (!Number.isInteger(iterations) || iterations < ROPE_LIMITS.iterations[0] || iterations > ROPE_LIMITS.iterations[1])
    throw new RangeError("iterations must be an integer between 1 and 32");
  const gravity = options.gravity ?? { x: 0, y: 0 };
  if (!Number.isFinite(gravity.x) || !Number.isFinite(gravity.y)) throw new RangeError("gravity must be finite");
  return {
    segments,
    length,
    stiffness,
    damping,
    gravity: { x: gravity.x, y: gravity.y },
    iterations,
    maxStep: options.maxStep ?? 40,
    floorY: options.floorY ?? null,
  };
}

export class RopeSolver {
  readonly options: RopeSolverOptions;
  readonly nodeCount: number;
  /** Interleaved x,y per node. Read-only for consumers by convention. */
  readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly anchor: Float32Array;
  private readonly pinned: Uint8Array;
  segmentLength: number;

  constructor(start: { x: number; y: number }, end: { x: number; y: number }, options: Partial<RopeSolverOptions> = {}) {
    this.options = normaliseRopeOptions(options);
    this.nodeCount = this.options.segments + 1;
    this.segmentLength = this.options.length / this.options.segments;
    this.pos = new Float32Array(this.nodeCount * 2);
    this.prev = new Float32Array(this.nodeCount * 2);
    this.anchor = new Float32Array(this.nodeCount * 2);
    this.pinned = new Uint8Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) {
      const t = i / (this.nodeCount - 1);
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      this.pos[i * 2] = x;
      this.pos[i * 2 + 1] = y;
      this.prev[i * 2] = x;
      this.prev[i * 2 + 1] = y;
    }
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) throw new TypeError("Rope endpoints must be finite");
  }

  isPinned(index: number): boolean {
    return this.pinned[index] === 1;
  }

  /** Pins a node to a world position. Its velocity is reset so the anchor does not fling the rope. */
  pin(index: number, x: number, y: number): void {
    this.assertIndex(index);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("Pin target must be finite");
    this.pinned[index] = 1;
    this.anchor[index * 2] = x;
    this.anchor[index * 2 + 1] = y;
    this.pos[index * 2] = x;
    this.pos[index * 2 + 1] = y;
    this.prev[index * 2] = x;
    this.prev[index * 2 + 1] = y;
  }

  unpin(index: number): void {
    this.assertIndex(index);
    this.pinned[index] = 0;
  }

  /** Moves a pinned node's target. Free nodes are ignored. */
  moveAnchor(index: number, x: number, y: number): void {
    if (this.pinned[index] !== 1) return;
    this.anchor[index * 2] = x;
    this.anchor[index * 2 + 1] = y;
  }

  /** Changes the total rest length. Takes effect on the next step. */
  setLength(length: number): void {
    if (!Number.isFinite(length) || length <= 0) throw new RangeError("length must be a positive number");
    this.options.length = length;
    this.segmentLength = length / this.options.segments;
  }

  /** End-to-end distance divided by total rest length. Above 1 means stretched. */
  stretch(): number {
    const last = this.nodeCount - 1;
    const dx = this.pos[last * 2]! - this.pos[0]!;
    const dy = this.pos[last * 2 + 1]! - this.pos[1]!;
    return Math.hypot(dx, dy) / this.options.length;
  }

  /** Advances the rope by dt seconds using a fixed internal substep of at most 1/120 s. */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const total = Math.min(dt, 1 / 30);
    const substeps = Math.max(1, Math.ceil(total / (1 / 120)));
    const h = total / substeps;
    for (let s = 0; s < substeps; s++) this.substep(h);
  }

  private substep(h: number): void {
    const { damping, gravity, iterations, stiffness, maxStep, floorY } = this.options;
    const gx = gravity.x * h * h;
    const gy = gravity.y * h * h;
    const pos = this.pos;
    const prev = this.prev;
    for (let i = 0; i < this.nodeCount; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      if (this.pinned[i] === 1) {
        pos[ix] = this.anchor[ix]!;
        pos[iy] = this.anchor[iy]!;
        prev[ix] = pos[ix]!;
        prev[iy] = pos[iy]!;
        continue;
      }
      let vx = (pos[ix]! - prev[ix]!) * damping;
      let vy = (pos[iy]! - prev[iy]!) * damping;
      const speed = Math.hypot(vx, vy);
      if (speed > maxStep) {
        vx = (vx / speed) * maxStep;
        vy = (vy / speed) * maxStep;
      }
      prev[ix] = pos[ix]!;
      prev[iy] = pos[iy]!;
      pos[ix] = pos[ix]! + vx + gx;
      pos[iy] = pos[iy]! + vy + gy;
    }
    const rest = this.segmentLength;
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < this.nodeCount - 1; i++) {
        const a = i * 2;
        const b = a + 2;
        const dx = pos[b]! - pos[a]!;
        const dy = pos[b + 1]! - pos[a + 1]!;
        const d = Math.hypot(dx, dy);
        if (d < 1e-9) continue;
        const diff = ((d - rest) / d) * stiffness;
        const pa = this.pinned[i] === 1;
        const pb = this.pinned[i + 1] === 1;
        if (pa && pb) continue;
        const wa = pa ? 0 : pb ? 1 : 0.5;
        const wb = pb ? 0 : pa ? 1 : 0.5;
        pos[a] = pos[a]! + dx * diff * wa;
        pos[a + 1] = pos[a + 1]! + dy * diff * wa;
        pos[b] = pos[b]! - dx * diff * wb;
        pos[b + 1] = pos[b + 1]! - dy * diff * wb;
      }
      if (floorY !== null) {
        for (let i = 0; i < this.nodeCount; i++) {
          if (this.pinned[i] === 1) continue;
          const iy = i * 2 + 1;
          if (pos[iy]! > floorY) {
            pos[iy] = floorY;
            prev[iy] = floorY;
          }
        }
      }
    }
    for (let i = 0; i < pos.length; i++) {
      if (!Number.isFinite(pos[i]!)) {
        // Fail safe: a non-finite node snaps back to its anchor or stays at the previous value.
        const node = i >> 1;
        if (this.pinned[node] === 1) {
          pos[i] = this.anchor[i]!;
        } else {
          pos[i] = prev[i]!;
        }
        if (!Number.isFinite(pos[i]!)) pos[i] = 0;
        prev[i] = pos[i]!;
      }
    }
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.nodeCount)
      throw new RangeError(`Node index out of range: ${index}`);
  }
}
