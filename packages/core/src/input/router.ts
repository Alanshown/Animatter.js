import { vec, type Interaction, type Intent, type Vec3 } from "../types.js";
import type { SpatialRegistry } from "../spatial/registry.js";
type Emit = (
  type: Intent,
  target: string | null,
  data: Record<string, unknown>,
  event: Event | null,
  source: Interaction["source"],
  point: Vec3,
  velocity: Vec3,
) => void;
interface PointerState {
  id: number;
  target: string | null;
  start: Vec3;
  point: Vec3;
  time: number;
  dragging: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  capture: HTMLElement | null;
  source: "pointer" | "touch";
}
export class InputRouter {
  readonly pointer = {
    point: vec(-10000, -10000),
    velocity: vec(),
    active: false,
  };
  private controller = new AbortController();
  private pointers = new Map<number, PointerState>();
  private lastTime = 0;
  private modality: Interaction["source"] = "pointer";
  private hover: string | null = null;
  private gestureDistance = 0;
  private scrollPositions = new WeakMap<
    EventTarget,
    { x: number; y: number; time: number }
  >();
  constructor(
    root: HTMLElement,
    private spatial: SpatialRegistry,
    private emit: Emit,
  ) {
    const listen = (
      target: EventTarget,
      name: string,
      fn: (e: Event) => void,
      passive = true,
    ) =>
      target.addEventListener(name, fn, {
        signal: this.controller.signal,
        passive,
      });
    listen(root, "pointermove", (e) => this.move(e as PointerEvent));
    listen(root, "pointerdown", (e) => this.down(e as PointerEvent));
    listen(window, "pointerup", (e) => this.up(e as PointerEvent, false));
    listen(window, "pointercancel", (e) => this.up(e as PointerEvent, true));
    listen(window, "blur", () => this.reset());
    listen(root, "pointerleave", (e) => {
      this.pointer.active = false;
      if (this.hover) this.send("leave", this.hover, e);
      this.hover = null;
    });
    listen(root, "click", (e) => {
      const id = this.id(e);
      this.send("click", id, e);
      const target =
        e.target instanceof Element
          ? e.target.closest('a[href],button,[role="tab"],[data-am-kind]')
          : null;
      if (!target || !root.contains(target)) return;
      if (target.matches("a[href]"))
        this.send("navigation", id, e, { href: target.getAttribute("href") });
      if (target.matches("button")) this.send("button", id, e);
      if (target.getAttribute("role") === "tab") this.send("tabs", id, e);
      const kind = target.getAttribute("data-am-kind");
      if (kind && ["card", "menu", "list", "accordion"].includes(kind))
        this.send(kind as Intent, id, e);
    });
    listen(root, "dblclick", (e) => this.send("doubleclick", this.id(e), e));
    listen(root, "focusin", (e) => this.send("focus", this.id(e), e));
    listen(root, "focusout", (e) => this.send("blur", this.id(e), e));
    listen(root, "input", (e) => this.send("input", this.id(e), e));
    listen(root, "change", (e) => this.send("selection", this.id(e), e));
    listen(document, "selectionchange", (e) => {
      const selection = document.getSelection();
      if (selection?.anchorNode && root.contains(selection.anchorNode))
        this.send(
          "selection",
          this.spatial.closest(selection.anchorNode.parentElement)?.id ?? null,
          e,
          { text: selection.toString() },
          "keyboard",
        );
    });
    listen(root, "copy", (e) => this.send("copy", this.id(e), e));
    listen(root, "submit", (e) => this.send("form", this.id(e), e));
    // toggle does not bubble; capture is necessary for native details/popovers.
    root.addEventListener("toggle", (e) => this.send("expand", this.id(e), e), {
      capture: true,
      signal: this.controller.signal,
    });
    listen(window, "keydown", () => {
      this.modality = "keyboard";
    });
    listen(root, "keydown", (e) => {
      this.modality = "keyboard";
      const key = (e as KeyboardEvent).key;
      if (key === "Delete" || key === "Backspace")
        this.send("delete", this.id(e), e);
    });
    const scroll = (e: Event) => {
      this.spatial.dirty = true;
      const el =
        e.target === document || e.target === window
          ? document.scrollingElement
          : e.target instanceof Element
            ? e.target
            : null;
      if (!el) return;
      const time = performance.now(),
        old = this.scrollPositions.get(el) ?? { x: 0, y: 0, time: time - 16 },
        dx = el.scrollLeft - old.x,
        dy = el.scrollTop - old.y,
        dt = Math.max(0.008, (time - old.time) / 1000);
      this.scrollPositions.set(el, { x: el.scrollLeft, y: el.scrollTop, time });
      this.send(
        "scroll",
        this.id(e),
        e,
        { dx, dy },
        "system",
        this.pointer.point,
        vec(dx / dt, dy / dt),
      );
    };
    root.addEventListener("scroll", scroll, {
      capture: true,
      passive: true,
      signal: this.controller.signal,
    });
    listen(window, "scroll", scroll);
    listen(window, "resize", (e) => {
      this.spatial.dirty = true;
      this.send("viewport", null, e);
    });
    listen(window, "popstate", (e) => this.send("routing", null, e));
    listen(window, "hashchange", (e) => this.send("navigation", null, e));
  }
  private id(e: Event): string | null {
    return this.spatial.closest(e.target)?.id ?? null;
  }
  private send(
    type: Intent,
    target: string | null,
    e: Event | null,
    data: Record<string, unknown> = {},
    source?: Interaction["source"],
    point = this.pointer.point,
    velocity = this.pointer.velocity,
  ): void {
    this.emit(
      type,
      target,
      data,
      e,
      source ?? this.modality,
      { ...point },
      { ...velocity },
    );
  }
  private move(e: PointerEvent): void {
    this.modality = e.pointerType === "touch" ? "touch" : "pointer";
    const point = vec(e.clientX, e.clientY),
      dt = Math.max(0.008, (e.timeStamp - this.lastTime) / 1000);
    const velocity = vec(
      (point.x - this.pointer.point.x) / dt,
      (point.y - this.pointer.point.y) / dt,
    );
    const wasActive = this.pointer.active;
    this.pointer.point = point;
    this.pointer.velocity = wasActive ? velocity : vec();
    this.pointer.active = true;
    this.lastTime = e.timeStamp;
    const id = this.id(e);
    if (id !== this.hover) {
      if (this.hover) this.send("leave", this.hover, e);
      if (id) this.send("enter", id, e);
      this.hover = id;
    }
    this.send("pointer", id, e);
    if (id) this.send("hover", id, e);
    for (const surface of this.spatial.near(point, 220))
      this.send("proximity", surface.id, e, {
        distance: Math.hypot(
          point.x - surface.anchors.center.x,
          point.y - surface.anchors.center.y,
        ),
      });
    const state = this.pointers.get(e.pointerId);
    if (state) {
      state.point = point;
      const distance = Math.hypot(
        point.x - state.start.x,
        point.y - state.start.y,
      );
      if (distance > 7 && state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      const surface = state.target
        ? this.spatial.surfaces.get(state.target)
        : null;
      if (distance > 7 && surface?.options.draggable && !state.dragging) {
        state.dragging = true;
        state.capture = surface.element;
        try {
          surface.element.setPointerCapture(e.pointerId);
        } catch {
          /* pointer may have ended */
        }
        this.send("dragstart", state.target, e, {}, state.source, point);
      }
      if (state.dragging)
        this.send(
          "drag",
          state.target,
          e,
          { dx: point.x - state.start.x, dy: point.y - state.start.y },
          state.source,
          point,
        );
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(
        a!.point.x - b!.point.x,
        a!.point.y - b!.point.y,
      );
      if (this.gestureDistance)
        this.send(
          "gesture",
          id,
          e,
          { scale: distance / this.gestureDistance },
          e.pointerType === "touch" ? "touch" : "pointer",
        );
      this.gestureDistance = distance;
    }
  }
  private down(e: PointerEvent): void {
    this.modality = e.pointerType === "touch" ? "touch" : "pointer";
    if (e.button !== 0) return;
    const target = this.id(e),
      point = vec(e.clientX, e.clientY);
    this.pointer.point = point;
    this.pointer.active = true;
    const state: PointerState = {
      id: e.pointerId,
      target,
      start: point,
      point,
      time: e.timeStamp,
      dragging: false,
      timer: null,
      capture: null,
      source: e.pointerType === "touch" ? "touch" : "pointer",
    };
    state.timer = setTimeout(() => {
      state.timer = null;
      this.send("longpress", target, e, {}, state.source, point);
    }, 520);
    this.pointers.set(e.pointerId, state);
  }
  private up(e: PointerEvent, cancelled: boolean): void {
    const state = this.pointers.get(e.pointerId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    if (state.dragging)
      this.send(
        "dragend",
        state.target,
        e,
        {
          cancelled,
          dx: state.point.x - state.start.x,
          dy: state.point.y - state.start.y,
        },
        state.source,
        state.point,
      );
    if (state.capture?.hasPointerCapture(e.pointerId))
      state.capture.releasePointerCapture(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.gestureDistance = 0;
    if (e.pointerType === "touch") this.pointer.active = false;
  }
  reset(): void {
    for (const state of this.pointers.values()) {
      if (state.timer) clearTimeout(state.timer);
      if (state.dragging)
        this.send(
          "dragend",
          state.target,
          null,
          { cancelled: true },
          state.source,
          state.point,
          vec(),
        );
      if (state.capture?.hasPointerCapture(state.id))
        state.capture.releasePointerCapture(state.id);
    }
    this.pointers.clear();
    this.gestureDistance = 0;
    this.pointer.active = false;
    this.pointer.velocity = vec();
  }
  destroy(): void {
    this.reset();
    this.controller.abort();
  }
}
