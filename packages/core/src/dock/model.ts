/**
 * Pure liquid-dock math. No DOM access, so it can be unit tested in Node.
 */
export type DockOrientation = "horizontal" | "vertical";

export interface ProximityOptions {
  /** Peak scale at the pointer (1 = no effect). */
  maxScale: number;
  /** Gaussian falloff radius in CSS pixels. */
  sigma: number;
}

/** Continuous proximity magnification: 1 far away, maxScale at distance 0. */
export function proximityScale(distance: number, options: ProximityOptions): number {
  if (!Number.isFinite(distance)) return 1;
  const sigma = Math.max(1, options.sigma);
  const peak = Math.max(1, options.maxScale);
  return 1 + (peak - 1) * Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export interface Spring1D {
  value: number;
  velocity: number;
}

/** Semi-implicit Euler spring step. Clamps dt so a long frame cannot explode the state. */
export function springStep(
  state: Spring1D,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
): void {
  const h = Math.min(Math.max(dt, 0), 1 / 30);
  const accel = stiffness * (target - state.value) - damping * state.velocity;
  state.velocity += accel * h;
  state.value += state.velocity * h;
  if (!Number.isFinite(state.value) || !Number.isFinite(state.velocity)) {
    state.value = target;
    state.velocity = 0;
  }
}

/** Returns a new order with the item at `from` moved to `to`. Throws on invalid indices. */
export function reorderIds<T>(order: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to))
    throw new TypeError("Indices must be integers");
  if (from < 0 || from >= order.length || to < 0 || to >= order.length)
    throw new RangeError(`Index out of range for length ${order.length}`);
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Slot index whose centre is nearest the pointer coordinate along the axis. */
export function nearestSlot(pointer: number, centers: readonly number[]): number {
  if (!centers.length) return 0;
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((c, i) => {
    const d = Math.abs(pointer - c);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/** Keyboard focus movement. Returns the index to focus next (wraps). */
export function keyboardTarget(
  index: number,
  length: number,
  key: string,
  orientation: DockOrientation,
): number {
  if (length <= 0) return -1;
  const forward = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const backward = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  if (key === forward) return (index + 1) % length;
  if (key === backward) return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return index;
}
