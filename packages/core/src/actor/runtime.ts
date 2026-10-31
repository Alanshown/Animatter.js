import {
  vec,
  type ActorPose,
  type ActorRenderer,
  type Interaction,
  type Intent,
  type Vec3,
} from "../types.js";
import type { SpatialRegistry } from "../spatial/registry.js";
import { MotionMixer } from "./motion.js";
import { BehaviorPlanner, type Trajectory } from "./planner.js";
import type { InteractionArbiter, TaskResult } from "../interaction/arbiter.js";
export interface ActorOptions {
  renderer: ActorRenderer;
  position?: Vec3;
  idle?: boolean;
  draggable?: boolean;
  idleDelay?: number;
  reactTo?: Intent[];
  actions?: Partial<Record<ActorPose["state"], { speed?: number }>>;
  blendDuration?: number;
  onLand?: (target: string) => void;
}
export class ActorRuntime {
  readonly pose: ActorPose = {
    position: vec(80, 150),
    velocity: vec(),
    state: "idle",
    weights: {
      idle: 1,
      walk: 0,
      jump: 0,
      slide: 0,
      grab: 0,
      climb: 0,
      land: 0,
    },
    gaze: vec(),
    blend: 0,
    facing: 1,
    time: 0,
  };
  readonly planner = new BehaviorPlanner();
  private mixer: MotionMixer;
  private serial = 0;
  private quiet = 0;
  private destroyed = false;
  private lastTarget: string | null = null;
  private lastAnchor: "top" | "center" | "bottom" | "left" | "right" = "top";
  private restState: ActorPose["state"] = "idle";
  private dragController = new AbortController();
  private grabbed = false;
  private grabPointer: number | null = null;
  private userMotion: AbortController | null = null;
  private reduced = false;
  private pending = 0;
  private idleIndex = 0;
  constructor(
    readonly id: string,
    private spatial: SpatialRegistry,
    private arbiter: InteractionArbiter,
    private options: ActorOptions,
    host: HTMLElement,
    private offset: (id: string) => Vec3 = () => vec(),
    private enabled: () => boolean = () => true,
  ) {
    this.mixer = new MotionMixer(options.blendDuration);
    for (const action of Object.values(options.actions ?? {}))
      if (
        action.speed !== undefined &&
        (!Number.isFinite(action.speed) || action.speed <= 0)
      )
        throw new RangeError("Action speed must be positive");
    if (options.position) this.pose.position = { ...options.position };
    options.renderer.mount(host);
    const target = options.renderer.hitTarget?.();
    if (options.draggable && target) {
      target.style.pointerEvents = "auto";
      target.style.touchAction = "none";
      target.style.cursor = "grab";
      let previous = vec(),
        previousTime = 0;
      target.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button !== 0) return;
          this.grabbed = true;
          this.grabPointer = e.pointerId;
          this.quiet = 0;
          this.userMotion?.abort();
          this.arbiter.cancelChannel(`actor:${this.id}`);
          this.lastTarget = null;
          this.pose.state = "grab";
          target.setPointerCapture(e.pointerId);
          previous = vec(e.clientX, e.clientY);
          previousTime = e.timeStamp;
        },
        { signal: this.dragController.signal },
      );
      target.addEventListener(
        "pointermove",
        (e) => {
          if (!this.grabbed) return;
          const dt = Math.max(0.008, (e.timeStamp - previousTime) / 1000);
          this.pose.position = vec(e.clientX, e.clientY + 20);
          this.pose.velocity = vec(
            (e.clientX - previous.x) / dt,
            (e.clientY - previous.y) / dt,
          );
          previous = vec(e.clientX, e.clientY);
          previousTime = e.timeStamp;
        },
        { signal: this.dragController.signal },
      );
      const release = (e: PointerEvent) => {
        if (!this.grabbed) return;
        this.grabbed = false;
        this.grabPointer = null;
        this.quiet = 0;
        if (target.hasPointerCapture(e.pointerId))
          target.releasePointerCapture(e.pointerId);
        const near = this.spatial
          .near(this.pose.position, 900)
          .filter((s) => s.rect.width && s.rect.y >= 0)
          .sort(
            (a, b) =>
              Math.hypot(
                a.anchors.top.x - this.pose.position.x,
                a.anchors.top.y - this.pose.position.y,
              ) -
              Math.hypot(
                b.anchors.top.x - this.pose.position.x,
                b.anchors.top.y - this.pose.position.y,
              ),
          );
        if (near[0])
          void this.moveTo(near[0].id, { priority: 100, kind: "slide" });
        else this.pose.state = "idle";
      };
      window.addEventListener("blur", () => this.suspend(), {
        signal: this.dragController.signal,
      });
      target.addEventListener("pointerup", release, {
        signal: this.dragController.signal,
      });
      target.addEventListener("pointercancel", release, {
        signal: this.dragController.signal,
      });
    }
  }
  moveTo(
    target: string,
    options: {
      priority?: number;
      kind?: Trajectory["kind"];
      signal?: AbortSignal;
      anchor?: "top" | "center" | "bottom" | "left" | "right";
    } = {},
  ): Promise<TaskResult> {
    if (this.destroyed || !this.enabled()) return Promise.resolve("cancelled");
    if (options.priority !== undefined && !Number.isFinite(options.priority))
      throw new TypeError("Invalid action priority");
    const surface = this.spatial.surfaces.get(target);
    if (
      !surface ||
      surface.options.disabled ||
      surface.options.mode === "off" ||
      surface.options.mode === "field" ||
      options.signal?.aborted
    )
      return Promise.resolve("cancelled");
    if (this.reduced) {
      this.snap(target);
      this.options.onLand?.(target);
      return Promise.resolve("completed");
    }
    const anchorName =
      options.anchor ??
      (options.kind === "grab"
        ? this.pose.position.x < surface.anchors.center.x
          ? "left"
          : "right"
        : "top");
    const id = `${this.id}:${this.serial++}`;
    let path: Trajectory | null = null,
      elapsed = 0,
      remaining = 0;
    this.pending++;
    const build = (resumed = true) => {
      const s = this.spatial.surfaces.get(target);
      if (!s?.element.isConnected) {
        path = null;
        return;
      }
      const point = { ...s.anchors[anchorName] },
        offset = this.offset(target);
      point.x += offset.x;
      point.y += offset.y - 4;
      point.z += offset.z;
      path = this.planner.plan(
        this.pose.position,
        point,
        [...this.spatial.surfaces.values()]
          .filter((s) => s.id !== target)
          .map((s) => s.rect),
        options.kind ?? "jump",
        { ...s.rect, x: s.rect.x + offset.x, y: s.rect.y + offset.y },
        { x: 40, y: 66, width: innerWidth - 80, height: innerHeight - 66 },
      );
      const speed = this.options.actions?.[path.kind]?.speed ?? 1;
      if (!Number.isFinite(speed) || speed <= 0)
        throw new RangeError("Action speed must be positive");
      path.duration /= speed;
      if (resumed) remaining = path.duration;
      else path.duration = Math.max(1 / 120, remaining);
      elapsed = 0;
    };
    const task = {
      id,
      channel: `actor:${this.id}`,
      priority: options.priority ?? 50,
      ...(options.signal ? { signal: options.signal } : {}),
      resume: () => build(true),
      pause: () => {
        this.pose.velocity = vec();
      },
      cancel: () => {
        this.pose.state = "idle";
        this.pose.velocity = vec();
      },
      update: (dt: number) => {
        if (!path) return true;
        const surface = this.spatial.surfaces.get(target);
        if (!surface?.element.isConnected) return true;
        const base = surface.anchors[anchorName],
          offset = this.offset(target),
          anchor = vec(base.x + offset.x, base.y + offset.y, base.z + offset.z);
        if (Math.hypot(anchor.x - path.to.x, anchor.y - 4 - path.to.y) > 3)
          build(false);
        if (!path) return true;
        elapsed += dt;
        remaining = Math.max(0, remaining - dt);
        const t = Math.min(1, elapsed / path.duration),
          previous = this.pose.position;
        this.pose.position = this.planner.sample(path, t);
        this.pose.velocity = vec(
          (this.pose.position.x - previous.x) / Math.max(dt, 0.001),
          (this.pose.position.y - previous.y) / Math.max(dt, 0.001),
          (this.pose.position.z - previous.z) / Math.max(dt, 0.001),
        );
        this.pose.facing = this.pose.velocity.x < 0 ? -1 : 1;
        this.pose.state = path.kind;
        this.pose.blend = t;
        if (t >= 1) {
          this.pose.state = "land";
          this.pose.velocity = vec();
          this.pose.blend = 0;
          this.lastTarget = target;
          this.lastAnchor = anchorName;
          this.restState = path.kind === "grab" ? "grab" : "idle";
          this.options.onLand?.(target);
          return true;
        }
        return false;
      },
    };
    return this.arbiter.enqueue(task).finally(() => {
      this.pending--;
    });
  }
  react(event: Interaction, reduced: boolean): void {
    if (
      this.grabbed ||
      !event.target ||
      !(
        this.options.reactTo ?? [
          "enter",
          "click",
          "focus",
          "dragstart",
          "dragend",
          "success",
          "error",
          "notification",
        ]
      ).includes(event.type)
    )
      return;
    this.userMotion?.abort();
    this.userMotion = new AbortController();
    if (reduced) {
      this.snap(event.target);
      this.options.onLand?.(event.target);
      return;
    }
    const kind =
      event.type === "dragstart"
        ? "grab"
        : event.type === "dragend"
          ? "slide"
          : event.type === "focus"
            ? "walk"
            : "jump";
    void this.moveTo(event.target, {
      priority: 100,
      kind,
      signal: this.userMotion.signal,
    });
  }
  suspend(): void {
    this.grabbed = false;
    const target = this.options.renderer.hitTarget?.();
    if (
      this.grabPointer !== null &&
      target?.hasPointerCapture(this.grabPointer)
    )
      target.releasePointerCapture(this.grabPointer);
    this.grabPointer = null;
    this.pose.state = "idle";
    this.pose.velocity = vec();
  }
  interrupt(): void {
    this.quiet = 0;
  }
  tick(dt: number, reduced: boolean): void {
    this.reduced = reduced;
    this.pose.time += dt;
    if (!this.grabbed) this.quiet += dt;
    this.mixer.transition(this.pose.state);
    this.mixer.tick(dt, reduced);
    this.pose.weights = { ...this.mixer.weights };
    if (this.pose.state === "land") {
      this.pose.blend = Math.min(1, this.pose.blend + dt * 5);
      if (this.pose.blend === 1) this.pose.state = this.restState;
    }
    if (
      this.lastTarget &&
      !this.pending &&
      (this.pose.state === "idle" || this.pose.state === "grab")
    ) {
      const s = this.spatial.surfaces.get(this.lastTarget);
      if (s) {
        const offset = this.offset(s.id);
        this.pose.position = vec(
          s.anchors[this.lastAnchor].x + offset.x,
          s.anchors[this.lastAnchor].y + offset.y - 4,
          s.anchors[this.lastAnchor].z + offset.z,
        );
      } else this.lastTarget = null;
    }
    if (
      !reduced &&
      this.options.idle &&
      this.quiet > (this.options.idleDelay ?? 5) &&
      !this.pending
    ) {
      const visible = [...this.spatial.surfaces.values()].filter(
        (s) =>
          s.rect.width > 0 &&
          s.rect.y >= 20 &&
          s.rect.y < innerHeight - 30 &&
          !s.options.disabled &&
          s.options.mode !== "off",
      );
      if (visible.length) {
        const s = visible[this.idleIndex++ % visible.length]!;
        void this.moveTo(s.id, {
          priority: 10,
          kind: this.idleIndex % 3 === 0 ? "climb" : "jump",
        });
      }
      this.quiet = 0;
    }
    this.options.renderer.render(this.pose);
  }
  lookAt(point: Vec3): void {
    this.pose.gaze = vec(
      Math.max(-1, Math.min(1, (point.x - this.pose.position.x) / 180)),
      Math.max(-1, Math.min(1, (point.y - this.pose.position.y) / 180)),
    );
  }
  snap(target: string): void {
    const s = this.spatial.surfaces.get(target);
    if (s) {
      this.arbiter.cancelChannel(`actor:${this.id}`);
      const offset = this.offset(target);
      this.pose.position = vec(
        s.anchors.top.x + offset.x,
        s.anchors.top.y + offset.y - 4,
        s.anchors.top.z + offset.z,
      );
      this.pose.state = "idle";
      this.lastAnchor = "top";
      this.restState = "idle";
      this.lastTarget = target;
    }
  }
  destroy(): void {
    this.destroyed = true;
    this.suspend();
    this.dragController.abort();
    this.userMotion?.abort();
    try {
      this.arbiter.cancelChannel(`actor:${this.id}`);
    } finally {
      this.options.renderer.destroy();
    }
  }
}
