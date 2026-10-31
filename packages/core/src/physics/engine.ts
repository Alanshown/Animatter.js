import { vec, type Material, type Rect, type Vec3 } from "../types.js";
import { resolveMaterial } from "../materials.js";
export interface Body {
  id: string;
  position: Vec3;
  velocity: Vec3;
  target: Vec3;
  force: Vec3;
  origin: Vec3;
  size: { width: number; height: number };
  material: Material;
  motionLimit: number | null;
  pinned: boolean;
  collision: boolean;
  sleeping: boolean;
}
export interface DistanceConstraint {
  a: string;
  b: string;
  distance: number;
  stiffness: number;
}
export class PhysicsEngine {
  enabled = true;
  readonly bodies = new Map<string, Body>();
  readonly constraints = new Set<DistanceConstraint>();
  bounds: Rect | null = null;
  create(id: string, material: Partial<Material> = {}): Body {
    if (this.bodies.has(id)) throw new Error(`Duplicate body: ${id}`);
    const b: Body = {
      id,
      position: vec(),
      velocity: vec(),
      target: vec(),
      force: vec(),
      origin: vec(),
      size: { width: 0, height: 0 },
      material: resolveMaterial(material),
      motionLimit: null,
      pinned: false,
      collision: false,
      sleeping: false,
    };
    this.bodies.set(id, b);
    return b;
  }
  remove(id: string): void {
    this.bodies.delete(id);
    for (const c of this.constraints)
      if (c.a === id || c.b === id) this.constraints.delete(c);
  }
  impulse(id: string, impulse: Partial<Vec3>): void {
    const b = this.bodies.get(id);
    if (!this.enabled || !b || b.pinned) return;
    for (const value of Object.values(impulse))
      if (!Number.isFinite(value))
        throw new TypeError("Impulse must be finite");
    for (const axis of ["x", "y", "z"] as const)
      b.velocity[axis] += (impulse[axis] ?? 0) / b.material.mass;
    b.sleeping = false;
  }
  /** Semi-implicit Euler; callers use fixed 1/120s substeps. */
  step(dt: number): void {
    if (!this.enabled || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1 / 60);
    for (const b of this.bodies.values()) {
      if (b.pinned) continue;
      const m = b.material;
      let energy = 0;
      for (const axis of ["x", "y", "z"] as const) {
        const gravity = axis === "y" ? m.gravity * m.mass : 0;
        const force =
          -m.stiffness * (b.position[axis] - b.target[axis]) -
          m.damping * b.velocity[axis] +
          b.force[axis] +
          gravity;
        b.velocity[axis] += (force / m.mass) * dt;
        b.position[axis] += b.velocity[axis] * dt;
        b.force[axis] = 0;
        const limit =
          axis === "z" ? m.depth : (b.motionLimit ?? m.maxDisplacement);
        if (Math.abs(b.position[axis]) > limit) {
          b.position[axis] = Math.sign(b.position[axis]) * limit;
          if (b.velocity[axis] * b.position[axis] > 0)
            b.velocity[axis] *= -m.restitution;
        }
        energy +=
          Math.abs(b.velocity[axis]) +
          Math.abs(
            b.position[axis] -
              b.target[axis] -
              (axis === "y" && m.stiffness ? gravity / m.stiffness : 0),
          );
      }
      if (
        b.motionLimit !== null &&
        Math.hypot(b.position.x, b.position.y) < m.maxDisplacement &&
        Math.hypot(b.velocity.x, b.velocity.y) < 5
      )
        b.motionLimit = null;
      b.sleeping = energy < 0.04;
      if (b.sleeping) b.velocity = vec();
      this.constrainBounds(b);
    }
    for (let i = 0; i < 3; i++) {
      this.solveDistances();
      this.collide();
    }
  }
  reset(): void {
    for (const b of this.bodies.values()) {
      b.position = vec();
      b.velocity = vec();
      b.force = vec();
      b.target = vec();
      b.pinned = false;
      b.motionLimit = null;
      b.sleeping = true;
    }
  }
  private constrainBounds(b: Body): void {
    if (!this.bounds) return;
    for (const axis of ["x", "y"] as const) {
      const size = axis === "x" ? b.size.width : b.size.height;
      const extent = axis === "x" ? this.bounds.width : this.bounds.height;
      const min = this.bounds[axis] - b.origin[axis],
        max = Math.max(min, min + extent - size);
      if (b.position[axis] < min || b.position[axis] > max) {
        b.position[axis] = Math.max(min, Math.min(max, b.position[axis]));
        b.velocity[axis] *= -b.material.restitution;
      }
    }
  }
  private solveDistances(): void {
    for (const c of this.constraints) {
      const a = this.bodies.get(c.a),
        b = this.bodies.get(c.b);
      if (!a || !b) continue;
      const dx = b.origin.x + b.position.x - a.origin.x - a.position.x,
        dy = b.origin.y + b.position.y - a.origin.y - a.position.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const wa = a.pinned ? 0 : 1 / a.material.mass,
        wb = b.pinned ? 0 : 1 / b.material.mass,
        total = wa + wb;
      if (!total) continue;
      const correction =
        (d - c.distance) * Math.max(0, Math.min(1, c.stiffness));
      a.position.x += ((dx / d) * correction * wa) / total;
      a.position.y += ((dy / d) * correction * wa) / total;
      b.position.x -= ((dx / d) * correction * wb) / total;
      b.position.y -= ((dy / d) * correction * wb) / total;
    }
  }
  private collide(): void {
    const bodies = [...this.bodies.values()].filter((b) => b.collision);
    // Sweep and prune on x; avoids all-pairs for separated DOM rectangles.
    bodies.sort(
      (a, b) => a.origin.x + a.position.x - b.origin.x - b.position.x,
    );
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!,
          b = bodies[j]!;
        const ax = a.origin.x + a.position.x,
          bx = b.origin.x + b.position.x;
        if (bx >= ax + a.size.width) break;
        if (
          Math.abs(a.origin.z + a.position.z - b.origin.z - b.position.z) > 16
        )
          continue;
        const ay = a.origin.y + a.position.y,
          by = b.origin.y + b.position.y;
        const ox =
          Math.min(ax + a.size.width, bx + b.size.width) - Math.max(ax, bx);
        const oy =
          Math.min(ay + a.size.height, by + b.size.height) - Math.max(ay, by);
        if (ox <= 0 || oy <= 0) continue;
        const axis = ox < oy ? "x" : "y";
        const sign =
          axis === "x"
            ? ax + a.size.width / 2 < bx + b.size.width / 2
              ? 1
              : -1
            : ay + a.size.height / 2 < by + b.size.height / 2
              ? 1
              : -1;
        const wa = a.pinned ? 0 : 1 / a.material.mass,
          wb = b.pinned ? 0 : 1 / b.material.mass,
          total = wa + wb;
        if (!total) continue;
        const overlap = (axis === "x" ? ox : oy) + 0.01;
        a.position[axis] -= (sign * overlap * wa) / total;
        b.position[axis] += (sign * overlap * wb) / total;
        const relative = (b.velocity[axis] - a.velocity[axis]) * sign;
        if (relative < 0) {
          const impulse =
            (-(1 + Math.min(a.material.restitution, b.material.restitution)) *
              relative) /
            total;
          a.velocity[axis] -= impulse * wa * sign;
          b.velocity[axis] += impulse * wb * sign;
        }
      }
  }
}
