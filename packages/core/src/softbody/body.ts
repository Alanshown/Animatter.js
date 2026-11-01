import type { AnimatterWorld, WorldSystem } from "../world.js";

/**
 * Two-dimensional soft body: a ring of particles with edge springs, radial "spoke" springs to a
 * centre particle (shape recovery), and an area-pressure term that pushes the ring toward its
 * rest area. This is a point-mass and constraint model. It is not a fluid, finite-element or
 * continuum solver, and it does not claim physical accuracy beyond these terms.
 */
export interface Point {
  x: number;
  y: number;
}

export interface SoftBodyOptions {
  /** Ring particles, 3 to 64. The centre particle is extra. */
  points: number;
  radius: number;
  center: Point;
  /** Edge spring correction fraction per iteration, 0 to 1. */
  stiffness: number;
  /** Shape recovery via spokes to the centre, 0 to 1. */
  shapeStiffness: number;
  /** Area restoring acceleration scale, 0 to 2. 0 disables pressure. */
  pressure: number;
  /** Velocity retained per step, 0 to 1. */
  damping: number;
  /** Maximum particle displacement per step in px. */
  maxDisplacement: number;
  iterations: number;
  gravity: Point;
  /** Container bounds. Particles are kept inside. null disables bounds. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  /**
   * Optional initial ring, as offsets from center. Must have exactly `points` entries. Use it for
   * non-circular rest shapes such as a rounded card. Default: a circle of `radius`.
   */
  outline?: readonly Point[];
}

export interface SoftBodyLimits {
  points: readonly [number, number];
  stiffness: readonly [number, number];
  shapeStiffness: readonly [number, number];
  pressure: readonly [number, number];
  damping: readonly [number, number];
  iterations: readonly [number, number];
}

export const SOFT_BODY_LIMITS: SoftBodyLimits = {
  points: [3, 64],
  stiffness: [0, 1],
  shapeStiffness: [0, 1],
  pressure: [0, 2],
  damping: [0, 1],
  iterations: [1, 16],
};

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export interface SoftBody {
  readonly name: string;
  readonly count: number;
  /** Interleaved x,y: ring particles first, centre last. Read-only by convention. */
  positions(): Float32Array;
  center(): Point;
  area(): number;
  /** Kinetic energy proxy, sum of squared step velocities. Used to check for runaway energy. */
  energy(): number;
  grab(point: Point, radius?: number): boolean;
  drag(point: Point): void;
  release(): void;
  /** Radial push from a point, used for taps and click ripples. */
  impulse(point: Point, strength: number, radius: number): void;
  setObstacles(obstacles: readonly Obstacle[]): void;
  destroy(): void;
}

let bodySerial = 0;
/** Dimensionless gain converting the pressure term into a per-step acceleration. */
const PRESSURE_GAIN = 900;

export function normaliseSoftBodyOptions(options: Partial<SoftBodyOptions>): SoftBodyOptions {
  const o: SoftBodyOptions = {
    points: options.points ?? 16,
    radius: options.radius ?? 80,
    center: options.center ?? { x: 0, y: 0 },
    stiffness: options.stiffness ?? 0.8,
    shapeStiffness: options.shapeStiffness ?? 0.3,
    pressure: options.pressure ?? 0.6,
    damping: options.damping ?? 0.97,
    maxDisplacement: options.maxDisplacement ?? 24,
    iterations: options.iterations ?? 6,
    gravity: options.gravity ?? { x: 0, y: 0 },
    bounds: options.bounds ?? null,
    ...(options.outline ? { outline: options.outline } : {}),
  };
  if (o.outline && o.outline.length !== o.points)
    throw new RangeError("outline must have exactly points entries");
  if (o.outline && o.outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new RangeError("outline offsets must be finite");
  const within = (name: string, v: number, [min, max]: readonly [number, number]) => {
    if (!Number.isFinite(v) || v < min || v > max) throw new RangeError(`${name} must be in [${min}, ${max}]`);
  };
  if (!Number.isInteger(o.points)) throw new RangeError("points must be an integer");
  within("points", o.points, SOFT_BODY_LIMITS.points);
  within("stiffness", o.stiffness, SOFT_BODY_LIMITS.stiffness);
  within("shapeStiffness", o.shapeStiffness, SOFT_BODY_LIMITS.shapeStiffness);
  within("pressure", o.pressure, SOFT_BODY_LIMITS.pressure);
  within("damping", o.damping, SOFT_BODY_LIMITS.damping);
  within("iterations", o.iterations, SOFT_BODY_LIMITS.iterations);
  if (!Number.isFinite(o.radius) || o.radius < 2 || o.radius > 2000) throw new RangeError("radius must be in [2, 2000]");
  if (!Number.isFinite(o.maxDisplacement) || o.maxDisplacement <= 0) throw new RangeError("maxDisplacement must be positive");
  if (!Number.isFinite(o.center.x) || !Number.isFinite(o.center.y)) throw new RangeError("center must be finite");
  return o;
}

export function polygonArea(pos: Float32Array, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    sum += pos[i * 2]! * pos[j * 2 + 1]! - pos[j * 2]! * pos[i * 2 + 1]!;
  }
  return Math.abs(sum) / 2;
}

/** Creates a soft body on the world clock. Destroy it or the world to release it. */
export function createSoftBody(world: AnimatterWorld, options: Partial<SoftBodyOptions> = {}): SoftBody {
  const o = normaliseSoftBodyOptions(options);
  const ring = o.points;
  const n = ring + 1; // + centre
  const name = `soft-body#${++bodySerial}`;
  const pos = new Float32Array(n * 2);
  const prev = new Float32Array(n * 2);
  const force = new Float32Array(n * 2);
  const edgeRest = new Float32Array(ring);
  const spokeRest = new Float32Array(ring);
  const grabbed = { index: -1, x: 0, y: 0 };
  let obstacles: Obstacle[] = [];
  let destroyed = false;
  let lastEnergy = 0;
  let lastArea = 0;

  const cx = o.center.x;
  const cy = o.center.y;
  for (let i = 0; i < ring; i++) {
    if (o.outline) {
      pos[i * 2] = cx + o.outline[i]!.x;
      pos[i * 2 + 1] = cy + o.outline[i]!.y;
      continue;
    }
    const a = (i / ring) * Math.PI * 2;
    pos[i * 2] = cx + Math.cos(a) * o.radius;
    pos[i * 2 + 1] = cy + Math.sin(a) * o.radius;
  }
  pos[ring * 2] = cx;
  pos[ring * 2 + 1] = cy;
  prev.set(pos);
  for (let i = 0; i < ring; i++) {
    const j = (i + 1) % ring;
    edgeRest[i] = Math.hypot(pos[j * 2]! - pos[i * 2]!, pos[j * 2 + 1]! - pos[i * 2 + 1]!);
    spokeRest[i] = Math.hypot(pos[i * 2]! - cx, pos[i * 2 + 1]! - cy);
  }
  const restArea = polygonArea(pos, ring);
  lastArea = restArea;

  const clampToBounds = (i: number) => {
    if (!o.bounds) return;
    const b = o.bounds;
    const ix = i * 2;
    const iy = ix + 1;
    if (pos[ix]! < b.x) pos[ix] = b.x;
    if (pos[ix]! > b.x + b.width) pos[ix] = b.x + b.width;
    if (pos[iy]! < b.y) pos[iy] = b.y;
    if (pos[iy]! > b.y + b.height) pos[iy] = b.y + b.height;
  };

  const collideObstacles = (i: number) => {
    const ix = i * 2;
    for (const ob of obstacles) {
      const dx = pos[ix]! - ob.x;
      const dy = pos[ix + 1]! - ob.y;
      const d = Math.hypot(dx, dy);
      if (d < ob.r && d > 1e-6) {
        const push = ob.r - d;
        pos[ix] = pos[ix]! + (dx / d) * push;
        pos[ix + 1] = pos[ix + 1]! + (dy / d) * push;
      }
    }
  };

  const substep = (h: number) => {
    const damping = o.damping;
    const gx = o.gravity.x * h * h;
    const gy = o.gravity.y * h * h;
    force.fill(0);
    const area = polygonArea(pos, ring);
    lastArea = area;
    // Pressure: outward force on each edge proportional to (rest area - area).
    // Clamped so a strongly stretched body cannot receive an unbounded restoring force.
    const pressureScale = o.pressure * Math.max(-1, Math.min(1, (restArea - area) / restArea));
    if (pressureScale !== 0 && Number.isFinite(pressureScale)) {
      for (let i = 0; i < ring; i++) {
        const j = (i + 1) % ring;
        const ax = pos[i * 2]!;
        const ay = pos[i * 2 + 1]!;
        const bx = pos[j * 2]!;
        const by = pos[j * 2 + 1]!;
        const ex = bx - ax;
        const ey = by - ay;
        const len = Math.hypot(ex, ey);
        if (len < 1e-9) continue;
        let nx = ey / len;
        let ny = -ex / len;
        const mx = (ax + bx) / 2 - cx;
        const my = (ay + by) / 2 - cy;
        if (nx * mx + ny * my < 0) {
          nx = -nx;
          ny = -ny;
        }
        const f = pressureScale * len * 0.5 * h * h * PRESSURE_GAIN;
        force[i * 2] = force[i * 2]! + nx * f;
        force[i * 2 + 1] = force[i * 2 + 1]! + ny * f;
        force[j * 2] = force[j * 2]! + nx * f;
        force[j * 2 + 1] = force[j * 2 + 1]! + ny * f;
      }
    }
    for (let i = 0; i < n; i++) {
      if (grabbed.index === i) {
        pos[i * 2] = grabbed.x;
        pos[i * 2 + 1] = grabbed.y;
        prev[i * 2] = grabbed.x;
        prev[i * 2 + 1] = grabbed.y;
        continue;
      }
      let vx = (pos[i * 2]! - prev[i * 2]!) * damping;
      let vy = (pos[i * 2 + 1]! - prev[i * 2 + 1]!) * damping;
      const speed = Math.hypot(vx, vy);
      if (speed > o.maxDisplacement) {
        vx = (vx / speed) * o.maxDisplacement;
        vy = (vy / speed) * o.maxDisplacement;
      }
      prev[i * 2] = pos[i * 2]!;
      prev[i * 2 + 1] = pos[i * 2 + 1]!;
      pos[i * 2] = pos[i * 2]! + vx + gx + force[i * 2]!;
      pos[i * 2 + 1] = pos[i * 2 + 1]! + vy + gy + force[i * 2 + 1]!;
    }
    for (let it = 0; it < o.iterations; it++) {
      for (let i = 0; i < ring; i++) {
        const j = (i + 1) % ring;
        const dx = pos[j * 2]! - pos[i * 2]!;
        const dy = pos[j * 2 + 1]! - pos[i * 2 + 1]!;
        const d = Math.hypot(dx, dy);
        if (d < 1e-9) continue;
        const diff = ((d - edgeRest[i]!) / d) * o.stiffness * 0.5;
        pos[i * 2] = pos[i * 2]! + dx * diff;
        pos[i * 2 + 1] = pos[i * 2 + 1]! + dy * diff;
        pos[j * 2] = pos[j * 2]! - dx * diff;
        pos[j * 2 + 1] = pos[j * 2 + 1]! - dy * diff;
      }
      if (o.shapeStiffness > 0) {
        for (let i = 0; i < ring; i++) {
          const dx = pos[i * 2]! - pos[ring * 2]!;
          const dy = pos[i * 2 + 1]! - pos[ring * 2 + 1]!;
          const d = Math.hypot(dx, dy);
          if (d < 1e-9) continue;
          const diff = ((d - spokeRest[i]!) / d) * o.shapeStiffness * 0.5;
          pos[i * 2] = pos[i * 2]! - dx * diff;
          pos[i * 2 + 1] = pos[i * 2 + 1]! - dy * diff;
          pos[ring * 2] = pos[ring * 2]! + dx * diff;
          pos[ring * 2 + 1] = pos[ring * 2 + 1]! + dy * diff;
        }
      }
      for (let i = 0; i < n; i++) {
        if (grabbed.index === i) continue;
        collideObstacles(i);
        clampToBounds(i);
      }
    }
    if (grabbed.index >= 0) {
      // The held particle is pinned to the pointer after all constraints, so it lands exactly on it.
      pos[grabbed.index * 2] = grabbed.x;
      pos[grabbed.index * 2 + 1] = grabbed.y;
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const vx = pos[i * 2]! - prev[i * 2]!;
      const vy = pos[i * 2 + 1]! - prev[i * 2 + 1]!;
      energy += vx * vx + vy * vy;
      if (!Number.isFinite(pos[i * 2]!) || !Number.isFinite(pos[i * 2 + 1]!)) {
        pos[i * 2] = prev[i * 2]!;
        pos[i * 2 + 1] = prev[i * 2 + 1]!;
      }
    }
    lastEnergy = energy;
  };

  const system: WorldSystem = {
    name,
    fixedStep(dt: number) {
      if (destroyed) return;
      const total = Math.min(Math.max(dt, 0), 1 / 30);
      const substeps = Math.max(1, Math.ceil(total / (1 / 120)));
      for (let s = 0; s < substeps; s++) substep(total / substeps);
    },
    destroy() {
      destroyed = true;
      obstacles = [];
    },
  };
  const detach = world.attach(system);

  return {
    name,
    count: n,
    positions: () => pos,
    center() {
      return { x: pos[ring * 2]!, y: pos[ring * 2 + 1]! };
    },
    area: () => lastArea,
    energy: () => lastEnergy,
    grab(point, radius = o.radius * 0.6) {
      let best = -1;
      let bestD = radius;
      for (let i = 0; i < ring; i++) {
        const d = Math.hypot(pos[i * 2]! - point.x, pos[i * 2 + 1]! - point.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) return false;
      grabbed.index = best;
      grabbed.x = point.x;
      grabbed.y = point.y;
      return true;
    },
    drag(point) {
      if (grabbed.index < 0) return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      grabbed.x = point.x;
      grabbed.y = point.y;
    },
    release() {
      grabbed.index = -1;
    },
    impulse(point, strength, radius) {
      if (!Number.isFinite(strength) || !Number.isFinite(radius) || radius <= 0) return;
      for (let i = 0; i < n; i++) {
        const dx = pos[i * 2]! - point.x;
        const dy = pos[i * 2 + 1]! - point.y;
        const d = Math.hypot(dx, dy);
        if (d > radius || d < 1e-6) continue;
        const falloff = 1 - d / radius;
        const k = (strength * falloff) / d;
        pos[i * 2] = pos[i * 2]! + dx * k;
        pos[i * 2 + 1] = pos[i * 2 + 1]! + dy * k;
      }
    },
    setObstacles(list) {
      obstacles = list.map((ob) => {
        if (![ob.x, ob.y, ob.r].every(Number.isFinite) || ob.r < 0) throw new RangeError("Invalid obstacle");
        return { ...ob };
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      detach();
    },
  };
}

/**
 * Body-to-body contacts. Every frame, each body receives the ring particles of the other bodies
 * as small circular obstacles, so particles push each other out. The contact model is particle
 * vs particle and is approximate: it is not a convex-hull or area-based collision test.
 */
export function linkSoftBodyContacts(
  world: AnimatterWorld,
  bodies: readonly SoftBody[],
  options: { particleRadius?: number } = {},
): () => void {
  const r = options.particleRadius ?? 8;
  if (!Number.isFinite(r) || r <= 0 || r > 200) throw new RangeError("particleRadius must be in (0, 200]");
  const name = `soft-contacts#${++bodySerial}`;
  const detach = world.attach({
    name,
    frame() {
      for (const body of bodies) {
        const obstacles: Obstacle[] = [];
        for (const other of bodies) {
          if (other === body) continue;
          const p = other.positions();
          for (let i = 0; i < other.count - 1; i++) obstacles.push({ x: p[i * 2]!, y: p[i * 2 + 1]!, r });
        }
        body.setObstacles(obstacles);
      }
    },
  });
  return () => {
    detach();
    for (const body of bodies) body.setObstacles([]);
  };
}
