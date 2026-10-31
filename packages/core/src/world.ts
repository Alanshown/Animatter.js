import {
  taxonomy,
  vec,
  type Intent,
  type Interaction,
  type Material,
  type Mode,
  type SurfaceOptions,
  type Vec3,
  type WorldPlugin,
} from "./types.js";
import { PhysicsEngine } from "./physics/engine.js";
import { SpatialRegistry } from "./spatial/registry.js";
import { InputRouter } from "./input/router.js";
import type { SurfaceRenderer } from "./renderers/protocol.js";
import { FieldRenderer } from "./renderers/field.js";
import { InteractionArbiter, type TaskResult } from "./interaction/arbiter.js";
import { InteractionGraph } from "./interaction/graph.js";
import { ActorRuntime, type ActorOptions } from "./actor/runtime.js";
import type { BehaviorBinding } from "./interaction/composition.js";
import type { ForceField } from "./physics/fields.js";
import { resolveMaterial } from "./materials.js";
export interface WorldOptions {
  root?: HTMLElement;
  mode?: Mode;
  fieldRenderer?: SurfaceRenderer;
  material?: Partial<Material>;
  autoStart?: boolean;
  reducedMotion?: "system" | "always" | "never";
  regions?: { selector: string; mode: Mode; material?: Partial<Material> }[];
  onError?: (error: unknown) => void;
}
export interface WorldStats {
  surfaces: number;
  bodies: number;
  actors: number;
  tasks: number;
  listeners: number;
  frames: number;
  simulationSteps: number;
  lastFrameMs: number;
  enabled: boolean;
  running: boolean;
  reducedMotion: boolean;
}
export class AnimatterWorld {
  readonly physics = new PhysicsEngine();
  readonly arbiter = new InteractionArbiter();
  readonly graph = new InteractionGraph();
  readonly spatial: SpatialRegistry;
  readonly input: InputRouter;
  readonly root: HTMLElement;
  private field: SurfaceRenderer;
  private actors = new Map<string, ActorRuntime>();
  private subscribers = new Set<(event: Interaction) => void>();
  private plugins = new Map<string, () => void>();
  private mode: Mode;
  private enabled = true;
  private dead = false;
  private frame = 0;
  private previous = 0;
  private accumulator = 0;
  private serial = 0;
  private media: MediaQueryList;
  private controller = new AbortController();
  private actorHost: HTMLElement;
  private bindingDisposers = new Map<string, () => void>();
  private forceFields = new Map<string, ForceField>();
  private asyncTokens = new Map<string, symbol>();
  private dragOrigins = new Map<string, Vec3>();
  private metric = { frames: 0, simulationSteps: 0, lastFrameMs: 0 };
  private lastPointer = -Infinity;
  private eventQueue: Interaction[] = [];
  private dispatching = false;
  constructor(private options: WorldOptions = {}) {
    this.field = options.fieldRenderer ?? new FieldRenderer();
    this.root = options.root ?? document.body;
    this.mode = options.mode ?? "field";
    if (!["field", "embodied", "both", "off"].includes(this.mode))
      throw new TypeError("Invalid mode");
    resolveMaterial(options.material);
    this.actorHost = document.createElement("div");
    this.actorHost.className = "am-actor-layer";
    this.actorHost.setAttribute("aria-hidden", "true");
    this.actorHost.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483000";
    document.body.append(this.actorHost);
    this.spatial = new SpatialRegistry(this.root, () => this.geometryChanged());
    this.input = new InputRouter(
      this.root,
      this.spatial,
      (type, target, data, event, source, point, velocity) => {
        if (!this.enabled || this.mode === "off" || this.dead) return;
        this.dispatch({
          type,
          level: taxonomy[type],
          target,
          data,
          originalEvent: event,
          source,
          point,
          velocity,
          time: performance.now(),
        });
      },
    );
    this.media = matchMedia("(prefers-reduced-motion: reduce)");
    this.media.addEventListener(
      "change",
      () => {
        this.physics.reset();
        if (this.reducedMotion) this.arbiter.clear();
        this.updateMode();
      },
      { signal: this.controller.signal },
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        this.previous = 0;
        this.accumulator = 0;
        if (document.hidden) this.input.reset();
      },
      { signal: this.controller.signal },
    );
    this.updateMode();
    if (options.autoStart !== false) this.start();
  }
  register(element: HTMLElement, options: SurfaceOptions = {}): () => void {
    this.assertAlive();
    if (
      options.mode &&
      !(["field", "embodied", "both", "off"] as string[]).includes(options.mode)
    )
      throw new TypeError("Invalid surface mode");
    if (options.plane !== undefined && !Number.isFinite(options.plane))
      throw new TypeError("Invalid surface plane");
    const id = options.id ?? `surface-${++this.serial}`;
    let region: NonNullable<WorldOptions["regions"]>[number] | undefined;
    // Last matching region wins, allowing nested opt-in and opt-out zones.
    for (const candidate of this.options.regions ?? [])
      if (element.closest(candidate.selector)) region = candidate;
    const css = getComputedStyle(element),
      cssMaterial: Partial<Material> = {};
    for (const key of Object.keys(resolveMaterial()) as (keyof Material)[]) {
      const name = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
        raw = css.getPropertyValue(`--am-${name}`).trim();
      if (raw) cssMaterial[key] = Number(raw);
    }
    const resolved: SurfaceOptions = {
      ...options,
      mode: options.mode ?? region?.mode ?? "both",
      material: resolveMaterial({
        ...this.options.material,
        ...cssMaterial,
        ...region?.material,
        ...options.material,
      }),
    };
    const s = this.spatial.register(element, id, resolved);
    const body = this.physics.create(id, resolved.material);
    body.collision = options.collision ?? false;
    this.graph.register(id, options.capabilities);
    this.field.mount(s);
    if (!this.isField(s.options)) this.field.restore(s);
    return () => this.unregister(id);
  }
  scan(selector = "[data-am]"): () => void {
    this.assertAlive();
    const cleanups: (() => void)[] = [];
    for (const el of this.root.querySelectorAll<HTMLElement>(selector)) {
      if ([...this.spatial.surfaces.values()].some((s) => s.element === el))
        continue;
      cleanups.push(
        this.register(el, {
          id: el.dataset.am || `surface-${++this.serial}`,
          draggable: el.hasAttribute("data-am-drag"),
        }),
      );
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }
  unregister(id: string): void {
    const s = this.spatial.surfaces.get(id);
    if (!s) return;
    this.safely(() => this.arbiter.cancelChannel(`presence:${id}`));
    this.safely(() => this.field.unmount(s));
    this.physics.remove(id);
    this.graph.remove(id);
    this.spatial.unregister(id);
    this.dragOrigins.delete(id);
    this.asyncTokens.delete(id);
  }
  invalidate(): void {
    this.assertAlive();
    this.spatial.dirty = true;
  }
  configure(id: string, patch: SurfaceOptions): void {
    this.assertAlive();
    if (patch.id !== undefined && patch.id !== id)
      throw new Error("Surface IDs are immutable");
    if (patch.plane !== undefined && !Number.isFinite(patch.plane))
      throw new TypeError("Invalid surface plane");
    const s = this.spatial.surfaces.get(id);
    if (!s) throw new Error(`Unknown surface: ${id}`);
    const material = resolveMaterial({
      ...s.options.material,
      ...patch.material,
    });
    s.options = { ...s.options, ...patch, material };
    const b = this.physics.bodies.get(id)!;
    b.material = material;
    if (patch.collision !== undefined) b.collision = patch.collision;
    this.field.restore(s);
    if (this.isField(s.options)) this.field.activate(s);
    else {
      b.position = vec();
      b.velocity = vec();
    }
    this.spatial.dirty = true;
  }
  /** Measure-mutate-measure transaction; preserve visual continuity after DOM reordering. */
  layout(update: () => void): void {
    this.assertAlive();
    this.spatial.measure();
    const before = new Map(
      [...this.spatial.surfaces.values()].map((s) => {
        const b = this.physics.bodies.get(s.id)!;
        return [s.id, vec(s.rect.x + b.position.x, s.rect.y + b.position.y)];
      }),
    );
    try {
      update();
    } finally {
      this.spatial.dirty = true;
      this.spatial.measure();
      if (!this.reducedMotion)
        for (const s of this.spatial.surfaces.values()) {
          const old = before.get(s.id),
            b = this.physics.bodies.get(s.id)!;
          if (!old || !this.isField(s.options)) continue;
          b.position.x = old.x - s.rect.x;
          b.position.y = old.y - s.rect.y;
          b.motionLimit = Math.max(
            b.material.maxDisplacement,
            Math.hypot(b.position.x, b.position.y) + 1,
          );
          b.sleeping = false;
        }
      this.emit("layout");
    }
  }
  on(listener: (event: Interaction) => void): () => void {
    this.assertAlive();
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }
  emit(
    type: Intent,
    target: string | null = null,
    data: Record<string, unknown> = {},
  ): void {
    if (this.dead || !this.enabled || this.mode === "off") return;
    if (!Object.hasOwn(taxonomy, type))
      throw new TypeError(`Unknown interaction: ${type}`);
    this.dispatch({
      type,
      level: taxonomy[type],
      target,
      data,
      time: performance.now(),
      source: "application",
      point: vec(),
      velocity: vec(),
      originalEvent: null,
    });
  }
  addActor(id: string, options: ActorOptions): ActorRuntime {
    this.assertAlive();
    if (this.actors.has(id)) throw new Error(`Duplicate actor: ${id}`);
    const actor = new ActorRuntime(
      id,
      this.spatial,
      this.arbiter,
      {
        ...options,
        onLand: (target) => {
          if (!this.reducedMotion)
            this.physics.impulse(target, { y: 80, z: -45 });
          options.onLand?.(target);
        },
      },
      this.actorHost,
      (id) => this.physics.bodies.get(id)?.position ?? vec(),
      () =>
        this.enabled &&
        !this.dead &&
        (this.mode === "both" || this.mode === "embodied"),
    );
    this.actors.set(id, actor);
    return actor;
  }
  removeActor(id: string): void {
    this.actors.get(id)?.destroy();
    this.actors.delete(id);
  }
  use(plugin: WorldPlugin<AnimatterWorld>): () => void {
    this.assertAlive();
    if (this.plugins.has(plugin.name))
      throw new Error(`Duplicate plugin: ${plugin.name}`);
    const cleanup = plugin.setup(this) ?? (() => {});
    this.plugins.set(plugin.name, cleanup);
    return () => {
      if (this.plugins.get(plugin.name) !== cleanup) return;
      this.plugins.delete(plugin.name);
      cleanup();
    };
  }
  bind(binding: BehaviorBinding<AnimatterWorld>): () => void {
    this.assertAlive();
    if (this.bindingDisposers.has(binding.id))
      throw new Error(`Duplicate binding: ${binding.id}`);
    if (
      binding.combine &&
      (!Number.isFinite(binding.combine.within) ||
        binding.combine.within < 0 ||
        !binding.combine.events.length)
    )
      throw new RangeError("Invalid combination window");
    const history = new Map<string, Map<Intent, number>>();
    const owned = new Set<string>();
    let serial = 0;
    const off = this.on((event) => {
      if (binding.target !== undefined && binding.target !== event.target)
        return;
      if (
        !(Array.isArray(binding.on)
          ? binding.on.includes(event.type)
          : binding.on === event.type)
      )
        return;
      if (binding.when && !binding.when(event)) return;
      if (binding.combine) {
        for (const [key, seen] of history)
          if (
            [...seen.values()].every(
              (t) => event.time - t > binding.combine!.within,
            )
          )
            history.delete(key);
        if (history.size >= 1024) history.delete(history.keys().next().value!);
        const key = event.target ?? "*",
          seen = history.get(key) ?? new Map<Intent, number>();
        seen.set(event.type, event.time);
        history.set(key, seen);
        if (
          !binding.combine.events.every(
            (type) =>
              event.time - (seen.get(type) ?? -Infinity) <=
              binding.combine!.within,
          )
        )
          return;
        history.delete(key);
      }
      const channel = binding.channel ?? `binding:${binding.id}`;
      if (binding.policy === "replace") this.arbiter.cancelChannel(channel);
      const id = `binding:${binding.id}:${serial++}`,
        task = binding.create(event, this);
      owned.add(id);
      try {
        void this.arbiter
          .enqueue({ ...task, id, channel, priority: binding.priority ?? 50 })
          .finally(() => owned.delete(id));
      } catch (error) {
        owned.delete(id);
        throw error;
      }
    });
    const dispose = () => {
      off();
      history.clear();
      for (const id of owned) this.arbiter.cancel(id);
      owned.clear();
      this.bindingDisposers.delete(binding.id);
    };
    this.bindingDisposers.set(binding.id, dispose);
    return dispose;
  }
  addField(field: ForceField): () => void {
    this.assertAlive();
    if (this.forceFields.has(field.id))
      throw new Error(`Duplicate field: ${field.id}`);
    this.forceFields.set(field.id, field);
    return () => {
      if (this.forceFields.get(field.id) === field)
        this.forceFields.delete(field.id);
    };
  }
  setMode(mode: Mode): void {
    this.assertAlive();
    if (!["field", "embodied", "both", "off"].includes(mode))
      throw new TypeError("Invalid mode");
    this.input.reset();
    for (const actor of this.actors.values()) actor.suspend();
    this.mode = mode;
    this.arbiter.clear();
    this.physics.reset();
    for (const s of this.spatial.surfaces.values()) {
      this.field.restore(s);
      if (this.isField(s.options)) this.field.activate(s);
    }
    this.updateMode();
  }
  setEnabled(enabled: boolean): void {
    this.assertAlive();
    this.input.reset();
    for (const actor of this.actors.values()) actor.suspend();
    this.enabled = enabled;
    this.arbiter.clear();
    this.physics.reset();
    for (const s of this.spatial.surfaces.values()) {
      this.field.restore(s);
      if (this.isField(s.options)) this.field.activate(s);
    }
    this.updateMode();
  }
  get reducedMotion(): boolean {
    return (
      this.options.reducedMotion === "always" ||
      (this.options.reducedMotion !== "never" && this.media.matches)
    );
  }
  get currentMode(): Mode {
    return this.mode;
  }
  /** Latest result per target wins; aborted, superseded or destroyed work cannot emit stale results. */
  async track<T>(
    promise: Promise<T>,
    target: string,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertAlive();
    const token = Symbol();
    this.asyncTokens.set(target, token);
    this.emit("loading", target);
    const current = () =>
      !this.dead && !signal?.aborted && this.asyncTokens.get(target) === token;
    try {
      const result = await promise;
      if (current()) this.emit("success", target, { result });
      return result;
    } catch (error) {
      if (current()) this.emit("error", target, { message: String(error) });
      throw error;
    } finally {
      if (this.asyncTokens.get(target) === token)
        this.asyncTokens.delete(target);
    }
  }
  /** Spring-driven presence. Native hidden state changes are intentional application state. */
  transition(id: string, visible: boolean): Promise<TaskResult> {
    this.assertAlive();
    const s = this.spatial.surfaces.get(id);
    if (!s) return Promise.resolve("cancelled");
    this.arbiter.cancelChannel(`presence:${id}`);
    if (visible) {
      s.element.hidden = false;
      this.spatial.dirty = true;
    }
    if (this.reducedMotion || !this.enabled || this.mode === "off") {
      s.element.hidden = !visible;
      return Promise.resolve("completed");
    }
    let x = visible ? 0 : 1,
      v = 0;
    const goal = visible ? 1 : 0;
    return this.arbiter.enqueue({
      id: `presence:${id}:${this.serial++}`,
      channel: `presence:${id}`,
      priority: 80,
      cancel: () => {
        this.field.setPresence(id, null);
      },
      update: (dt) => {
        const m = this.physics.bodies.get(id)!.material;
        v += ((-m.stiffness * (x - goal) - m.damping * v) / m.mass) * dt;
        x += v * dt;
        this.field.setPresence(id, Math.max(0.01, x));
        if (Math.abs(x - goal) < 0.005 && Math.abs(v) < 0.01) {
          s.element.hidden = !visible;
          this.field.setPresence(id, null);
          this.spatial.dirty = true;
          return true;
        }
        return false;
      },
    });
  }
  start(): void {
    this.assertAlive();
    if (this.frame) return;
    this.previous = 0;
    this.frame = requestAnimationFrame(this.animate);
  }
  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previous = 0;
    this.accumulator = 0;
  }
  step(dt: number): void {
    if (this.dead) return;
    this.spatial.measure();
    if (!this.enabled || this.mode === "off") return;
    dt = Math.max(0, Math.min(0.05, dt));
    this.accumulator += dt;
    while (this.accumulator >= 1 / 120) {
      if (!this.reducedMotion) this.applyFields();
      this.arbiter.tick(1 / 120);
      if (!this.reducedMotion) this.physics.step(1 / 120);
      this.accumulator -= 1 / 120;
      this.metric.simulationSteps++;
    }
    for (const s of this.spatial.surfaces.values())
      if (this.isField(s.options))
        this.field.render(
          s,
          this.physics.bodies.get(s.id)!,
          dt,
          this.reducedMotion,
        );
    if (this.mode === "embodied" || this.mode === "both")
      for (const actor of this.actors.values())
        actor.tick(dt, this.reducedMotion);
    this.metric.frames++;
  }
  stats(): WorldStats {
    return {
      ...this.metric,
      surfaces: this.spatial.surfaces.size,
      bodies: this.physics.bodies.size,
      actors: this.actors.size,
      tasks: this.arbiter.size,
      listeners: this.subscribers.size,
      enabled: this.enabled,
      running: !!this.frame,
      reducedMotion: this.reducedMotion,
    };
  }
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.enabled = false;
    this.physics.enabled = false;
    this.stop();
    this.safely(() => this.input.destroy());
    this.controller.abort();
    for (const cleanup of [...this.plugins.values()]) {
      try {
        cleanup();
      } catch (e) {
        this.report(e);
      }
    }
    this.plugins.clear();
    for (const dispose of [...this.bindingDisposers.values()])
      this.safely(dispose);
    this.bindingDisposers.clear();
    for (const actor of this.actors.values())
      this.safely(() => actor.destroy());
    this.actors.clear();
    this.safely(() => this.arbiter.clear());
    for (const id of [...this.spatial.surfaces.keys()]) this.unregister(id);
    this.spatial.destroy();
    this.safely(() => this.field.destroy());
    this.graph.clear();
    this.subscribers.clear();
    this.asyncTokens.clear();
    this.forceFields.clear();
    this.dragOrigins.clear();
    this.eventQueue.length = 0;
    this.actorHost.remove();
  }
  private animate = (time: number): void => {
    if (!this.frame) return;
    const start = performance.now();
    try {
      if (!document.hidden)
        this.step(this.previous ? (time - this.previous) / 1000 : 1 / 60);
    } catch (e) {
      this.report(e);
    }
    this.previous = time;
    this.metric.lastFrameMs = performance.now() - start;
    if (this.frame) this.frame = requestAnimationFrame(this.animate);
  };
  private assertAlive(): void {
    if (this.dead) throw new Error("World has been destroyed");
  }
  private safely(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.report(error);
    }
  }
  private report(error: unknown): void {
    try {
      if (this.options.onError) this.options.onError(error);
      else console.error("[Animatter]", error);
    } catch (reportError) {
      console.error("[Animatter error handler]", reportError);
    }
  }
  private updateMode(): void {
    this.physics.enabled =
      this.enabled && this.mode !== "off" && !this.reducedMotion;
    this.actorHost.hidden =
      !this.enabled || !(this.mode === "embodied" || this.mode === "both");
  }
  private isField(options: SurfaceOptions): boolean {
    return (
      this.enabled &&
      this.mode !== "off" &&
      !options.disabled &&
      (options.mode === "field" || options.mode === "both") &&
      (this.mode === "field" || this.mode === "both")
    );
  }
  private geometryChanged(): void {
    for (const s of [...this.spatial.surfaces.values()]) {
      if (!s.element.isConnected) {
        this.unregister(s.id);
        continue;
      }
      const b = this.physics.bodies.get(s.id);
      if (b) {
        b.origin = vec(s.rect.x, s.rect.y, s.options.plane ?? 0);
        b.size = { width: s.rect.width, height: s.rect.height };
      }
    }
    this.emit("layout");
  }
  private dispatch(event: Interaction): void {
    this.eventQueue.push(event);
    if (this.dispatching) return;
    this.dispatching = true;
    let count = 0;
    try {
      while (this.eventQueue.length) {
        if (++count > 100) {
          this.eventQueue.length = 0;
          this.report(new Error("Interaction cycle exceeded 100 events"));
          break;
        }
        this.deliver(this.eventQueue.shift()!);
      }
    } finally {
      this.dispatching = false;
    }
  }
  private deliver(event: Interaction): void {
    const s = event.target ? this.spatial.surfaces.get(event.target) : null;
    if (s?.options.disabled || s?.options.mode === "off") return;
    if (event.type === "pointer") {
      this.lastPointer = performance.now();
      for (const actor of this.actors.values()) actor.lookAt(event.point);
    }
    if (event.type === "scroll" && !this.reducedMotion)
      for (const surface of this.spatial.surfaces.values())
        if (
          this.isField(surface.options) &&
          surface.rect.y < innerHeight &&
          surface.rect.y + surface.rect.height > 0
        )
          this.physics.impulse(surface.id, {
            y: Math.max(-35, Math.min(35, event.velocity.y * 0.025)),
          });
    if (event.source !== "system")
      for (const actor of this.actors.values()) actor.interrupt();
    if (this.mode === "embodied" || this.mode === "both")
      if (s && s.options.mode !== "field")
        for (const actor of this.actors.values())
          actor.react(event, this.reducedMotion);
    if (s && this.isField(s.options)) {
      const b = this.physics.bodies.get(s.id)!;
      if (!this.reducedMotion) {
        if (event.type === "click")
          this.physics.impulse(s.id, { y: -140, z: 85 });
        if (event.type === "focus") this.physics.impulse(s.id, { z: 45 });
        if (
          ["expand", "layout", "success", "modal", "tabs"].includes(event.type)
        )
          this.physics.impulse(s.id, { y: -65, z: 45 });
        if (event.type === "error") this.physics.impulse(s.id, { x: 170 });
        if (event.type === "scroll")
          this.physics.impulse(s.id, {
            y: Math.max(-50, Math.min(50, event.velocity.y * 0.03)),
          });
        if (event.type === "dragstart") {
          this.dragOrigins.set(s.id, { ...b.position });
          b.pinned = true;
        }
        if (event.type === "drag") {
          const start = this.dragOrigins.get(s.id) ?? vec();
          b.position.x = start.x + Number(event.data.dx ?? 0);
          b.position.y = start.y + Number(event.data.dy ?? 0);
          b.velocity = vec();
        }
        if (event.type === "dragend") {
          b.pinned = false;
          b.motionLimit = Math.max(
            b.material.maxDisplacement,
            Math.hypot(b.position.x, b.position.y) + 12,
          );
          this.dragOrigins.delete(s.id);
          if (!event.data.cancelled)
            this.physics.impulse(s.id, {
              x: Math.max(-500, Math.min(500, event.velocity.x * 0.25)),
              y: Math.max(-500, Math.min(500, event.velocity.y * 0.25)),
            });
        }
        this.field.event(event, s);
      }
    }
    try {
      this.graph.dispatch(event);
    } catch (e) {
      this.report(e);
    }
    for (const listener of [...this.subscribers])
      try {
        listener(event);
      } catch (e) {
        this.report(e);
      }
  }
  private applyFields(): void {
    const { point, velocity, active } = this.input.pointer;
    // Decay sampled pointer speed when stationary; a single fast move is not a permanent force.
    const speedScale = Math.exp(
      -Math.max(0, performance.now() - this.lastPointer) / 180,
    );
    const candidates = active
      ? new Set(
          this.spatial
            .near(
              point,
              Math.max(
                1,
                ...[...this.physics.bodies.values()].map(
                  (b) => b.material.radius,
                ),
              ),
            )
            .map((s) => s.id),
        )
      : new Set<string>();
    for (const s of this.spatial.surfaces.values()) {
      const b = this.physics.bodies.get(s.id)!;
      if (!this.isField(s.options) || b.pinned) continue;
      b.target = vec();
      for (const field of this.forceFields.values()) {
        const force = field.sample({
          body: b,
          surface: s,
          point,
          velocity: vec(velocity.x * speedScale, velocity.y * speedScale),
          active,
          time: performance.now() / 1000,
        });
        for (const axis of ["x", "y", "z"] as const) {
          const value = force[axis] ?? 0;
          if (!Number.isFinite(value))
            throw new TypeError(`Non-finite field force: ${field.id}`);
          b.force[axis] += value;
        }
      }
      if (!candidates.has(s.id)) continue;
      const center = s.anchors.center,
        dx = point.x - center.x,
        dy = point.y - center.y,
        distance = Math.hypot(dx, dy),
        m = b.material;
      const strength = Math.max(0, 1 - distance / m.radius);
      const response =
        m.magnetism *
        strength *
        (1 +
          Math.min(
            0.5,
            (Math.hypot(velocity.x, velocity.y) * speedScale) / 5000,
          ));
      b.target.x = (dx / Math.max(1, distance)) * response;
      b.target.y = (dy / Math.max(1, distance)) * response;
      b.target.z = strength * m.depth;
    }
  }
}
export function createWorld(options: WorldOptions = {}): AnimatterWorld {
  return new AnimatterWorld(options);
}
