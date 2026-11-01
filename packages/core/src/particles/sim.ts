/**
 * Particle simulation core. Typed arrays only, fixed capacity, no per-particle objects.
 * Pure numeric code so it can be tested in Node. Renderers read the arrays; they never write them.
 */
export type FieldKind = "attract" | "repel" | "vortex" | "none";

export interface FieldSpec {
  kind: FieldKind;
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export interface FlowSpec {
  /** Strength of the built-in curl-like flow field, 0 disables it. */
  strength: number;
  /** Spatial frequency of the flow, in radians per px. */
  scale: number;
  /** Time scale of flow evolution. */
  speed: number;
}

export const PARTICLE_LIMITS = {
  count: [1, 200000],
  fields: 4,
} as const;

/** Axis-aligned collision box in the same coordinates as the particles (for example a DOM rect). */
export interface ObstacleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ParticleSim {
  /** Rectangles particles collide with. Replaced as a whole by setObstacles. */
  obstacles: ObstacleRect[] = [];
  /** Target points (interleaved x,y). Particle i is attracted to target i % count. */
  targets: Float32Array | null = null;
  targetStrength = 0;
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Palette index 0 to 2 per particle, stored as float for shader friendliness. */
  readonly hue: Float32Array;
  readonly alive: Uint8Array;
  readonly fields: FieldSpec[] = [];
  flow: FlowSpec = { strength: 60, scale: 0.012, speed: 0.4 };
  /** Velocity damping per second. */
  drag = 0.8;
  restitution = 0.55;
  width: number;
  height: number;
  time = 0;
  private cursor = 0;
  private seed: number;

  constructor(count: number, width: number, height: number, seed = 1) {
    if (!Number.isInteger(count) || count < PARTICLE_LIMITS.count[0] || count > PARTICLE_LIMITS.count[1])
      throw new RangeError(`count must be an integer in [${PARTICLE_LIMITS.count[0]}, ${PARTICLE_LIMITS.count[1]}]`);
    if (!(width > 0) || !(height > 0)) throw new RangeError("width and height must be positive");
    this.capacity = count;
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0 || 1;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.hue = new Float32Array(count);
    this.alive = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      this.x[i] = this.random() * width;
      this.y[i] = this.random() * height;
      this.hue[i] = Math.floor(this.random() * 3);
      this.alive[i] = 1;
    }
  }

  /** Deterministic xorshift PRNG so runs with the same seed are reproducible. */
  random(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  setField(field: FieldSpec | null, slot = 0): void {
    if (slot < 0 || slot >= PARTICLE_LIMITS.fields || !Number.isInteger(slot))
      throw new RangeError("field slot must be 0 to 3");
    if (field === null) {
      this.fields[slot] = { kind: "none", x: 0, y: 0, strength: 0, radius: 1 };
      return;
    }
    if (!Object.values(field).every((v) => typeof v === "string" || Number.isFinite(v)))
      throw new TypeError("field values must be finite");
    if (field.radius <= 0) throw new RangeError("field radius must be positive");
    this.fields[slot] = { ...field };
  }

  /** Emits n particles around (x, y) with a random outward velocity. Recycles the oldest slots. */
  emit(x: number, y: number, n: number, speed = 180): number {
    const count = Math.min(Math.max(0, Math.floor(n)), this.capacity);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const a = this.random() * Math.PI * 2;
      const s = speed * (0.3 + this.random() * 0.7);
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s;
      this.alive[i] = 1;
    }
    return count;
  }

  resize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) throw new RangeError("width and height must be positive");
    const sx = width / this.width;
    const sy = height / this.height;
    for (let i = 0; i < this.capacity; i++) {
      this.x[i] = this.x[i]! * sx;
      this.y[i] = this.y[i]! * sy;
    }
    this.width = width;
    this.height = height;
  }

  /** Advances the simulation. dt is clamped to 1/30 s so a stalled frame cannot explode. */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const h = Math.min(dt, 1 / 30);
    this.time += h;
    const { flow, fields, width, height } = this;
    const damp = Math.exp(-this.drag * h);
    const e = this.restitution;
    const t = this.time * flow.speed;
    const f0 = flow.strength;
    const sc = flow.scale;
    for (let i = 0; i < this.capacity; i++) {
      if (this.alive[i] === 0) continue;
      const px = this.x[i]!;
      const py = this.y[i]!;
      let ax = 0;
      let ay = 0;
      if (f0 > 0) {
        // Cheap curl-like field: sum of two travelling sines, rotated into a swirl.
        const angle = Math.sin(px * sc + t) * Math.cos(py * sc - t * 0.7) * Math.PI;
        ax += Math.cos(angle) * f0;
        ay += Math.sin(angle) * f0;
      }
      for (let k = 0; k < fields.length; k++) {
        const fld = fields[k]!;
        if (fld.kind === "none") continue;
        const dx = fld.x - px;
        const dy = fld.y - py;
        const d2 = dx * dx + dy * dy;
        const r2 = fld.radius * fld.radius;
        if (d2 >= r2 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const falloff = 1 - d / fld.radius;
        if (fld.kind === "attract") {
          ax += (dx / d) * fld.strength * falloff;
          ay += (dy / d) * fld.strength * falloff;
        } else if (fld.kind === "repel") {
          ax -= (dx / d) * fld.strength * falloff;
          ay -= (dy / d) * fld.strength * falloff;
        } else {
          ax += (-dy / d) * fld.strength * falloff;
          ay += (dx / d) * fld.strength * falloff;
        }
      }
      if (this.targets && this.targetStrength > 0) {
        const tcount = this.targets.length / 2;
        const t = i % tcount;
        ax += (this.targets[t * 2]! - px) * this.targetStrength;
        ay += (this.targets[t * 2 + 1]! - py) * this.targetStrength;
      }
      let vx = (this.vx[i]! + ax * h) * damp;
      let vy = (this.vy[i]! + ay * h) * damp;
      let nx = px + vx * h;
      let ny = py + vy * h;
      // Surface collision approximation: reflect at the viewport bounds with restitution.
      if (nx < 0) {
        nx = -nx;
        vx = -vx * e;
      } else if (nx > width) {
        nx = 2 * width - nx;
        vx = -vx * e;
      }
      if (ny < 0) {
        ny = -ny;
        vy = -vy * e;
      } else if (ny > height) {
        ny = 2 * height - ny;
        vy = -vy * e;
      }
      nx = Math.min(Math.max(nx, 0), width);
      ny = Math.min(Math.max(ny, 0), height);
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
        nx = this.random() * width;
        ny = this.random() * height;
        vx = 0;
        vy = 0;
      }
      for (const r of this.obstacles) {
        // Push out of the rectangle along the axis of least penetration and reflect that velocity.
        if (nx <= r.x || nx >= r.x + r.width || ny <= r.y || ny >= r.y + r.height) continue;
        const left = nx - r.x;
        const right = r.x + r.width - nx;
        const top = ny - r.y;
        const bottom = r.y + r.height - ny;
        const m = Math.min(left, right, top, bottom);
        if (m === left) {
          nx = r.x;
          vx = -Math.abs(vx) * e;
        } else if (m === right) {
          nx = r.x + r.width;
          vx = Math.abs(vx) * e;
        } else if (m === top) {
          ny = r.y;
          vy = -Math.abs(vy) * e;
        } else {
          ny = r.y + r.height;
          vy = Math.abs(vy) * e;
        }
      }
      this.x[i] = nx;
      this.y[i] = ny;
      this.vx[i] = vx;
      this.vy[i] = vy;
    }
  }

  /** Replaces the obstacle list. Non-finite or empty boxes are rejected. */
  setObstacles(rects: readonly ObstacleRect[]): void {
    for (const r of rects) {
      if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0)
        throw new RangeError("obstacle rectangles need finite x, y and positive width and height");
    }
    this.obstacles = rects.map((r) => ({ ...r }));
  }

  /** Sets attraction targets (interleaved x,y), or clears them with null. */
  setTargets(points: ArrayLike<number> | null, strength = 4): void {
    if (strength < 0 || !Number.isFinite(strength)) throw new RangeError("target strength must be >= 0");
    if (points === null || points.length === 0) {
      this.targets = null;
      this.targetStrength = 0;
      return;
    }
    if (points.length % 2 !== 0 || !Array.from(points).every(Number.isFinite))
      throw new TypeError("targets must be finite interleaved x,y pairs");
    this.targets = Float32Array.from(points);
    this.targetStrength = strength;
  }

  /** Mean speed in px/s, for diagnostics and tests. */
  meanSpeed(): number {
    let sum = 0;
    for (let i = 0; i < this.capacity; i++) sum += Math.hypot(this.vx[i]!, this.vy[i]!);
    return sum / this.capacity;
  }
}

/**
 * Samples opaque pixels from RGBA data (for example getImageData of rendered text) into a list of
 * target points. Every `step`-th pixel with alpha above 127 is kept, so the result stays small.
 */
export function pointsFromAlpha(data: Uint8ClampedArray | Uint8Array, width: number, height: number, step = 4): Float32Array {
  if (!(step >= 1) || !Number.isInteger(step)) throw new RangeError("step must be an integer >= 1");
  if (data.length < width * height * 4) throw new RangeError("data is smaller than width * height * 4");
  const out: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3]! > 127) out.push(x, y);
    }
  }
  return Float32Array.from(out);
}
