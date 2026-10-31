import type { Intent, Interaction } from "../types.js";
import type { BehaviorTask } from "./arbiter.js";
export interface BehaviorBinding<W> {
  id: string;
  on: Intent | Intent[];
  target?: string;
  channel?: string;
  priority?: number;
  policy?: "queue" | "replace";
  /** All specified intents must occur on the same target inside this window. */
  combine?: { events: Intent[]; within: number };
  when?: (event: Interaction) => boolean;
  create(
    event: Interaction,
    world: W,
  ): Pick<BehaviorTask, "update" | "pause" | "resume" | "cancel" | "signal">;
}
export type SequenceStep =
  | { duration: number; update?: (progress: number, dt: number) => void }
  | { wait: () => Promise<unknown> };
/** Cooperative sequence. Async waits keep their result during preemption; cancellation never starts later steps. */
export function sequence(
  steps: SequenceStep[],
): Pick<BehaviorTask, "update" | "cancel"> {
  let index = 0,
    elapsed = 0,
    pending = false,
    resolved = false,
    failed: unknown = null,
    hasFailed = false,
    cancelled = false;
  return {
    cancel() {
      cancelled = true;
    },
    update(dt) {
      if (cancelled) return true;
      const step = steps[index];
      if (!step) return true;
      if ("wait" in step) {
        if (!pending) {
          pending = true;
          void step.wait().then(
            () => {
              resolved = true;
            },
            (error) => {
              failed = error;
              hasFailed = true;
              resolved = true;
            },
          );
        }
        if (hasFailed) throw failed;
        if (!resolved) return false;
        pending = false;
        resolved = false;
        index++;
        return index >= steps.length;
      }
      if (!Number.isFinite(step.duration) || step.duration < 0)
        throw new RangeError("Invalid sequence duration");
      elapsed += Math.max(0, dt);
      const progress = step.duration ? Math.min(1, elapsed / step.duration) : 1;
      step.update?.(progress, dt);
      if (progress === 1) {
        index++;
        elapsed = 0;
      }
      return index >= steps.length;
    },
  };
}
