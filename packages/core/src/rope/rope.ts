import type { AnimatterWorld, WorldSystem } from "../world.js";
import { RopeSolver, type RopeSolverOptions } from "./solver.js";

export type Point = { x: number; y: number };
/** A fixed point, or a function that returns the current point (null means detached). */
export type AnchorTarget = Point | (() => Point | null);
export type RopeEnd = "a" | "b";

export interface RopeOptions extends Partial<RopeSolverOptions> {
  /**
   * Break threshold as a stretch ratio: when the two attached ends are further apart than
   * breakStretch * length, end B detaches. This is positional, so it has no force units.
   * Default Infinity (never breaks).
   */
  breakStretch?: number;
  start?: Point;
  end?: Point;
}

export interface RopeHandle {
  readonly name: string;
  readonly segments: number;
  /** Interleaved x,y node positions in container coordinates. Read-only by convention. */
  points(): Float32Array;
  attachA(target: AnchorTarget): void;
  attachB(target: AnchorTarget): void;
  detach(end: RopeEnd): void;
  /** Reattaches a broken or detached end to its last target. Returns false when there is none. */
  reconnect(end: RopeEnd): boolean;
  state(end: RopeEnd): "free" | "attached" | "broken";
  setLength(length: number): void;
  /** Changes the break threshold. Takes effect on the next rendered frame. */
  setBreakStretch(value: number): void;
  stretch(): number;
  onBreak(listener: (end: RopeEnd) => void): () => void;
  destroy(): void;
}

let ropeSerial = 0;

function resolveTarget(target: AnchorTarget | null): Point | null {
  if (target === null) return null;
  const point = typeof target === "function" ? target() : target;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

/**
 * Rope / tether on the world clock. Ends can be pinned to fixed points or to DOM elements
 * (through elementAnchor). Anchor functions are evaluated once per rendered frame, so layout
 * changes move the rope without reading layout inside the fixed step.
 */
export function createRope(world: AnimatterWorld, options: RopeOptions = {}): RopeHandle {
  const start = options.start ?? { x: 0, y: 0 };
  const end = options.end ?? { x: (options.length ?? 240), y: 0 };
  const solver = new RopeSolver(start, end, options);
  let breakStretch = options.breakStretch ?? Infinity;
  const checkBreak = (value: number) => {
    if (!(value > 0)) throw new RangeError("breakStretch must be greater than 0");
  };
  checkBreak(breakStretch);
  const name = `rope#${++ropeSerial}`;
  const targets: Record<RopeEnd, AnchorTarget | null> = { a: null, b: null };
  const current: Record<RopeEnd, Point | null> = { a: null, b: null };
  const states: Record<RopeEnd, "free" | "attached" | "broken"> = { a: "free", b: "free" };
  const listeners = new Set<(end: RopeEnd) => void>();
  let destroyed = false;

  const indexOf = (side: RopeEnd) => (side === "a" ? 0 : solver.nodeCount - 1);

  const applyEnd = (side: RopeEnd, point: Point | null) => {
    const index = indexOf(side);
    if (point) {
      current[side] = point;
      if (solver.isPinned(index)) solver.moveAnchor(index, point.x, point.y);
      else solver.pin(index, point.x, point.y);
      states[side] = "attached";
    } else {
      current[side] = null;
      solver.unpin(index);
      if (states[side] === "attached") states[side] = "free";
    }
  };

  const emitBreak = (side: RopeEnd) => {
    for (const listener of [...listeners]) {
      try {
        listener(side);
      } catch (error) {
        console.error("[Animatter rope]", error);
      }
    }
  };

  const system: WorldSystem = {
    name,
    fixedStep(dt: number) {
      if (destroyed) return;
      solver.step(dt);
    },
    frame() {
      if (destroyed) return;
      for (const side of ["a", "b"] as const) {
        // A broken end stays free until reconnect() or attachX() is called explicitly.
        if (states[side] === "broken") continue;
        const target = targets[side];
        if (target === null) continue;
        const point = resolveTarget(target);
        if (point) applyEnd(side, point);
        else if (typeof target === "function") {
          // A function target that returns null means the anchor disappeared (element removed).
          applyEnd(side, null);
          states[side] = "free";
        }
      }
      if (
        states.a === "attached" &&
        states.b === "attached" &&
        current.a &&
        current.b &&
        Math.hypot(current.b.x - current.a.x, current.b.y - current.a.y) > breakStretch * solver.options.length
      ) {
        applyEnd("b", null);
        states.b = "broken";
        emitBreak("b");
      }
    },
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
  const detachSystem = world.attach(system);

  const handle: RopeHandle = {
    name,
    segments: solver.options.segments,
    points: () => solver.pos,
    attachA(target) {
      if (destroyed) throw new Error("Rope has been destroyed");
      targets.a = target;
      const point = resolveTarget(target);
      if (point) applyEnd("a", point);
      else states.a = "free";
    },
    attachB(target) {
      if (destroyed) throw new Error("Rope has been destroyed");
      targets.b = target;
      const point = resolveTarget(target);
      if (point) applyEnd("b", point);
      else states.b = "free";
    },
    detach(side) {
      targets[side] = null;
      applyEnd(side, null);
      states[side] = "free";
    },
    reconnect(side) {
      if (targets[side] === null) return false;
      const point = resolveTarget(targets[side]);
      if (!point) return false;
      applyEnd(side, point);
      return true;
    },
    state: (side) => states[side],
    setLength(length) {
      if (!Number.isFinite(length) || length <= 0) throw new RangeError("length must be positive");
      solver.setLength(length);
    },
    setBreakStretch(value) {
      checkBreak(value);
      breakStretch = value;
    },
    stretch: () => solver.stretch(),
    onBreak(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      detachSystem();
      destroyed = true;
      listeners.clear();
    },
  };
  return handle;
}

/**
 * Anchor getter for an element, expressed in the rope container's coordinates. Reads layout
 * when called, so call it from the rope's frame step (the default when passed to attachA/B).
 */
export function elementAnchor(
  element: HTMLElement,
  container: HTMLElement,
  where: "center" | "bottom" | "top" = "center",
): () => Point | null {
  return () => {
    if (!element.isConnected) return null;
    const r = element.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const x = r.left + r.width / 2 - c.left;
    const y = where === "top" ? r.top - c.top : where === "bottom" ? r.bottom - c.top : r.top + r.height / 2 - c.top;
    return { x, y };
  };
}

/** Draws a rope as an SVG path. The caller owns the svg element; the renderer removes only its path. */
export function mountRopeSvg(
  world: AnimatterWorld,
  rope: RopeHandle,
  svg: SVGSVGElement,
  style: { stroke?: string; width?: number } = {},
): () => void {
  const ns = "http://www.w3.org/2000/svg";
  const path = document.createElementNS(ns, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", style.stroke ?? "currentColor");
  path.setAttribute("stroke-width", String(style.width ?? 3));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  let last = "";
  let disposed = false;
  const detach = world.attach({
    name: `rope-svg#${rope.name}`,
    frame() {
      if (disposed) return;
      const points = rope.points();
      let d = "";
      for (let i = 0; i < points.length; i += 2) d += `${i === 0 ? "M" : "L"}${points[i]!.toFixed(1)} ${points[i + 1]!.toFixed(1)}`;
      if (d !== last) {
        last = d;
        path.setAttribute("d", d);
      }
    },
    destroy() {
      disposed = true;
      path.remove();
    },
  });
  return () => detach();
}
