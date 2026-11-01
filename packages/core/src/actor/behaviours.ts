import type { AnimatterWorld } from "../world.js";
import type { ActorRuntime } from "./runtime.js";

/**
 * Actor behaviour layer. The state machine is pure: it takes signals and time, and returns
 * commands. The driver executes commands through the existing ActorRuntime API. Memory is limited
 * runtime state (recent targets, idle time, one interrupted task). It is not a learning model and
 * makes no network requests.
 */
export type BehaviourSignal =
  | "dragstart"
  | "dragend"
  | "loading"
  | "loaded"
  | "success"
  | "error"
  | "arrived"
  | "focus";

export type BehaviourState =
  | "idle"
  | "exploring"
  | "resting"
  | "dragged"
  | "loading"
  | "celebrating"
  | "erroring"
  | "following";

export type BehaviourCommand =
  | { type: "moveTo"; target: string; kind: "walk" | "jump" }
  | { type: "look"; x: number; y: number }
  | { type: "rest" }
  | { type: "celebrate"; target: string | null }
  | { type: "shake"; target: string | null }
  | { type: "wait" };

export interface BehaviourProfile {
  name: string;
  /** Seconds between idle decisions, [min, max]. */
  idleInterval: readonly [number, number];
  /** Chance (0 to 1) to prefer a target never visited before. */
  curiosity: number;
  /** Seconds of idleness before resting is considered. */
  restAfter: number;
  /** Chance (0 to 1) to rest when the rest threshold has passed. */
  restChance: number;
  /** Resume the interrupted target after a drag ends. */
  resumeAfterDrag: boolean;
  /** Seconds to celebrate or shake before returning to idle. */
  reactionDuration: number;
}

export const BEHAVIOUR_PROFILES: Record<"calm" | "curious" | "busy", BehaviourProfile> = {
  calm: {
    name: "calm",
    idleInterval: [4, 8],
    curiosity: 0.2,
    restAfter: 6,
    restChance: 0.6,
    resumeAfterDrag: true,
    reactionDuration: 1.2,
  },
  curious: {
    name: "curious",
    idleInterval: [2, 4],
    curiosity: 0.85,
    restAfter: 12,
    restChance: 0.2,
    resumeAfterDrag: true,
    reactionDuration: 1,
  },
  busy: {
    name: "busy",
    idleInterval: [1, 2],
    curiosity: 0.4,
    restAfter: 30,
    restChance: 0.05,
    resumeAfterDrag: false,
    reactionDuration: 0.6,
  },
};

export interface BehaviourMemory {
  /** Most recent targets, newest first, at most 5. */
  recentTargets: string[];
  lastAction: string | null;
  /** Seconds since the last user-facing signal (drag, success, error, loading, focus). Wandering does not reset it. */
  idleTime: number;
  /** A task cut short by a drag, resumed when the drag ends. */
  interrupted: { target: string } | null;
}

export interface BehaviourContext {
  /** Surface ids the actor may visit. */
  targets: () => readonly string[];
  /** Deterministic random source in [0, 1). Injected so tests can control it. */
  random?: () => number;
}

const MEMORY_LIMIT = 5;
let behaviourSerial = 0;

export class BehaviourMachine {
  state: BehaviourState = "idle";
  readonly memory: BehaviourMemory = { recentTargets: [], lastAction: null, idleTime: 0, interrupted: null };
  private timer = 0;
  private reactionLeft = 0;
  private current: string | null = null;
  private followTarget: string | null = null;
  private readonly random: () => number;

  constructor(
    readonly profile: BehaviourProfile,
    private readonly context: BehaviourContext,
  ) {
    validateProfile(profile);
    this.random = context.random ?? Math.random;
    this.timer = this.nextInterval();
  }

  /** Feeds one signal. Returns commands the driver must execute now. */
  signal(kind: BehaviourSignal): BehaviourCommand[] {
    if (kind !== "arrived" && kind !== "loaded") this.memory.idleTime = 0;
    switch (kind) {
      case "dragstart":
        if (this.state !== "dragged") {
          if (this.state === "exploring" && this.current) this.memory.interrupted = { target: this.current };
          this.state = "dragged";
          this.current = null;
        }
        return [];
      case "dragend": {
        if (this.state !== "dragged") return [];
        this.state = "idle";
        this.timer = this.nextInterval();
        const resume = this.memory.interrupted;
        this.memory.interrupted = null;
        if (resume && this.profile.resumeAfterDrag) return [this.go(resume.target, "walk")];
        return [];
      }
      case "loading":
        if (this.state === "dragged") return [];
        this.state = "loading";
        this.memory.lastAction = "loading";
        return [{ type: "wait" }];
      case "loaded":
        if (this.state === "loading") this.state = "idle";
        this.timer = this.nextInterval();
        return [];
      case "success":
        if (this.state === "dragged") return [];
        this.state = "celebrating";
        this.reactionLeft = this.profile.reactionDuration;
        this.memory.lastAction = "success";
        return [{ type: "celebrate", target: this.current }];
      case "error":
        if (this.state === "dragged") return [];
        this.state = "erroring";
        this.reactionLeft = this.profile.reactionDuration;
        this.memory.lastAction = "error";
        return [{ type: "shake", target: this.current }];
      case "arrived":
        if (this.state === "exploring") this.state = "idle";
        this.timer = this.nextInterval() * 0.5; // short dwell after arriving
        return [];
      case "focus":
        return [];
    }
  }

  /** Sets or clears a surface to follow. Following replaces idle wandering. */
  follow(target: string | null): BehaviourCommand[] {
    this.followTarget = target;
    if (target) {
      this.state = "following";
      return [this.go(target, "walk")];
    }
    if (this.state === "following") this.state = "idle";
    return [];
  }

  /** Advances time. Returns commands to execute now. */
  tick(dt: number): BehaviourCommand[] {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const h = Math.min(dt, 0.25);
    if (this.state === "celebrating" || this.state === "erroring") {
      this.reactionLeft -= h;
      if (this.reactionLeft <= 0) {
        this.state = this.followTarget ? "following" : "idle";
        this.timer = this.nextInterval();
      }
      return [];
    }
    if (this.state === "dragged" || this.state === "loading") return [];
    if (this.state === "following") return [];
    this.memory.idleTime += h;
    this.timer -= h;
    if (this.timer > 0) return [];
    this.timer = this.nextInterval();
    if (this.state === "resting") {
      // Resting ends after the next decision window, with a chance to resume exploring.
      this.state = "idle";
      return [];
    }
    if (this.memory.idleTime >= this.profile.restAfter && this.random() < this.profile.restChance) {
      this.state = "resting";
      this.memory.idleTime = 0;
      this.memory.lastAction = "rest";
      return [{ type: "rest" }];
    }
    const target = this.pickTarget();
    if (!target) return [];
    return [this.go(target, "walk")];
  }

  /** Chooses the next target, avoiding recent ones and favouring unvisited ones by curiosity. */
  pickTarget(): string | null {
    const all = [...this.context.targets()];
    if (!all.length) return null;
    const recent = new Set(this.memory.recentTargets);
    const fresh = all.filter((t) => !recent.has(t));
    const unvisited = all.filter((t) => !this.memory.recentTargets.includes(t) && !this.visited.has(t));
    if (unvisited.length && this.random() < this.profile.curiosity) return pick(unvisited, this.random);
    if (fresh.length) return pick(fresh, this.random);
    return pick(all, this.random);
  }

  private readonly visited = new Set<string>();

  private go(target: string, kind: "walk" | "jump"): BehaviourCommand {
    this.state = this.state === "following" ? "following" : "exploring";
    this.current = target;
    this.visited.add(target);
    this.memory.recentTargets = [target, ...this.memory.recentTargets.filter((t) => t !== target)].slice(0, MEMORY_LIMIT);
    this.memory.lastAction = `moveTo:${target}`;
    return { type: "moveTo", target, kind };
  }

  private nextInterval(): number {
    const [min, max] = this.profile.idleInterval;
    return min + this.random() * (max - min);
  }

  get currentTarget(): string | null {
    return this.current;
  }
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
}

function validateProfile(p: BehaviourProfile): void {
  const [min, max] = p.idleInterval;
  if (!(min > 0) || !(max >= min)) throw new RangeError("idleInterval must be a positive [min, max] range");
  if (!(p.curiosity >= 0 && p.curiosity <= 1)) throw new RangeError("curiosity must be in [0, 1]");
  if (!(p.restChance >= 0 && p.restChance <= 1)) throw new RangeError("restChance must be in [0, 1]");
  if (!(p.restAfter >= 0)) throw new RangeError("restAfter must be non-negative");
  if (!(p.reactionDuration > 0)) throw new RangeError("reactionDuration must be positive");
}

export interface ActorBehaviourHandle {
  readonly machine: BehaviourMachine;
  signal(kind: BehaviourSignal): void;
  follow(target: string | null): void;
  destroy(): void;
}

/**
 * Connects a machine to an actor. Commands go through the actor's public methods. Moves that
 * finish or get cancelled report back as "arrived" or "replan", so cancelled walks are re-planned
 * on the next decision instead of stalling.
 */
export function attachActorBehaviour(
  world: AnimatterWorld,
  actor: ActorRuntime,
  options: { profile: BehaviourProfile; targets: () => readonly string[]; random?: () => number; name?: string },
): ActorBehaviourHandle {
  const machine = new BehaviourMachine(options.profile, {
    targets: options.targets,
    ...(options.random ? { random: options.random } : {}),
  });
  let destroyed = false;
  let pending: BehaviourCommand[] = [];
  const execute = (commands: BehaviourCommand[]) => {
    for (const cmd of commands) {
      if (destroyed) return;
      switch (cmd.type) {
        case "moveTo":
          void actor.moveTo(cmd.target, { kind: cmd.kind }).then((result) => {
            // Completed and cancelled moves both release the machine; a cancelled walk is re-planned on the next decision.
            if (destroyed || result === "cancelled") return;
            machine.signal("arrived");
          });
          break;
        case "look":
          actor.lookAt({ x: cmd.x, y: cmd.y, z: 0 });
          break;
        case "rest":
          actor.suspend();
          break;
        case "celebrate":
          // A jump onto the current target is the visible celebration.
          if (cmd.target) void actor.moveTo(cmd.target, { kind: "jump", priority: 100 });
          break;
        case "shake":
          // An error stops the actor in place; the pose returns to idle when the reaction ends.
          actor.suspend();
          break;
        case "wait":
          break;
      }
    }
  };
  const detach = world.attach({
    name: options.name ?? `actor-behaviour#${++behaviourSerial}`,
    frame(dt: number) {
      if (destroyed) return;
      if (pending.length) {
        const next = pending;
        pending = [];
        execute(next);
      }
      execute(machine.tick(dt));
    },
    destroy() {
      destroyed = true;
    },
  });
  return {
    machine,
    signal(kind) {
      if (destroyed) return;
      pending.push(...machine.signal(kind));
    },
    follow(target) {
      if (destroyed) return;
      pending.push(...machine.follow(target));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      detach();
    },
  };
}
