import { vec, type Rect, type Vec3 } from "../types.js";
export interface Trajectory {
  from: Vec3;
  to: Vec3;
  duration: number;
  height: number;
  kind: "walk" | "jump" | "slide" | "grab" | "climb";
  waypoints: Vec3[];
  depthArc: number;
}
/** Deterministic procedural motion derived from current DOM geometry, never prerecorded frames. */
export class BehaviorPlanner {
  plan(
    from: Vec3,
    to: Vec3,
    obstacles: Rect[] = [],
    kind: Trajectory["kind"] = "jump",
    surface?: Rect,
    bounds?: Rect,
  ): Trajectory {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    let height = kind === "jump" ? Math.min(210, 45 + distance * 0.22) : 0;
    let waypoints: Vec3[] = [];
    if (kind === "jump")
      for (const r of obstacles) {
        const minX = Math.min(from.x, to.x),
          maxX = Math.max(from.x, to.x);
        if (r.x + r.width <= minX || r.x >= maxX) continue;
        if (
          [from, to].some(
            (p) =>
              p.x >= r.x - 20 &&
              p.x <= r.x + r.width + 20 &&
              p.y >= r.y - 40 &&
              p.y <= r.y + r.height + 20,
          )
        )
          continue;
        for (let i = 1; i < 20; i++) {
          const t = i / 20,
            x = from.x + (to.x - from.x) * t;
          if (x < r.x - 16 || x > r.x + r.width + 16) continue;
          const line = from.y + (to.y - from.y) * t;
          height = Math.max(height, (line - r.y + 34) / (4 * t * (1 - t)));
        }
      }
    let depthArc = 0;
    if (bounds && kind === "jump" && from.y >= bounds.y && to.y >= bounds.y) {
      const available = Math.max(0, Math.min(from.y, to.y) - bounds.y);
      if (height > available) {
        height = available;
        depthArc = 42;
      }
    }
    let length = distance;
    if (kind === "climb" && surface) {
      const side =
        from.x < surface.x + surface.width / 2
          ? surface.x - 27
          : surface.x + surface.width + 27;
      const baseY = Math.min(
        surface.y + surface.height - 8,
        Math.max(from.y, surface.y + 32),
      );
      waypoints = [
        { ...from },
        vec(side, baseY, to.z),
        vec(side, to.y, to.z),
        { ...to },
      ];
      length = waypoints
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum + Math.hypot(p.x - waypoints[i]!.x, p.y - waypoints[i]!.y),
          0,
        );
    }
    return {
      from: { ...from },
      to: { ...to },
      duration: Math.max(
        0.28,
        Math.min(
          kind === "climb" ? 4.5 : 1.8,
          length / (kind === "climb" ? 180 : 620),
        ),
      ),
      height,
      kind,
      waypoints,
      depthArc,
    };
  }
  sample(path: Trajectory, t: number): Vec3 {
    t = Math.max(0, Math.min(1, t));
    if (path.waypoints.length) {
      const segments = path.waypoints
        .slice(1)
        .map((p, i) =>
          Math.hypot(p.x - path.waypoints[i]!.x, p.y - path.waypoints[i]!.y),
        );
      const total = segments.reduce((a, b) => a + b, 0);
      let distance = t * total;
      for (let i = 0; i < segments.length; i++) {
        const length = segments[i]!;
        if (distance <= length || i === segments.length - 1) {
          const u = length ? Math.max(0, Math.min(1, distance / length)) : 1,
            e = u * u * (3 - 2 * u),
            a = path.waypoints[i]!,
            b = path.waypoints[i + 1]!;
          return vec(
            a.x + (b.x - a.x) * e,
            a.y + (b.y - a.y) * e,
            a.z + (b.z - a.z) * e,
          );
        }
        distance -= length;
      }
    }
    const u =
      path.kind === "slide"
        ? 1 - Math.pow(1 - t, 3)
        : path.kind === "grab"
          ? 1 - Math.pow(1 - t, 4)
          : t * t * (3 - 2 * t);
    return vec(
      path.from.x + (path.to.x - path.from.x) * u,
      path.from.y +
        (path.to.y - path.from.y) * u -
        4 * path.height * t * (1 - t),
      path.from.z +
        (path.to.z - path.from.z) * u +
        4 * path.depthArc * t * (1 - t),
    );
  }
}
