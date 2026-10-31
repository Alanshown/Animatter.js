import type { ActorPose } from "../types.js";
export type ActorState = ActorPose["state"];
const states: ActorState[] = [
  "idle",
  "walk",
  "jump",
  "slide",
  "grab",
  "climb",
  "land",
];
/** Explicit motion state machine with normalized, interruptible crossfades. */
export class MotionMixer {
  state: ActorState = "idle";
  readonly weights: Record<ActorState, number> = {
    idle: 1,
    walk: 0,
    jump: 0,
    slide: 0,
    grab: 0,
    climb: 0,
    land: 0,
  };
  private elapsed = 0;
  constructor(readonly blendDuration = 0.14) {
    if (!Number.isFinite(blendDuration) || blendDuration < 0)
      throw new RangeError("Invalid blend duration");
  }
  transition(next: ActorState): void {
    if (!states.includes(next))
      throw new TypeError(`Unknown motion state: ${next}`);
    if (next !== this.state) {
      this.state = next;
      this.elapsed = 0;
    }
  }
  tick(dt: number, reduced = false): void {
    this.elapsed += Math.max(0, dt);
    const alpha =
      reduced || !this.blendDuration
        ? 1
        : 1 - Math.exp((-Math.max(0, dt) * 5) / this.blendDuration);
    for (const state of states)
      this.weights[state] +=
        ((state === this.state ? 1 : 0) - this.weights[state]) * alpha;
    if (this.state === "land" && this.elapsed > 0.22) this.transition("idle");
  }
  get progress(): number {
    return this.blendDuration
      ? Math.min(1, this.elapsed / this.blendDuration)
      : 1;
  }
}
