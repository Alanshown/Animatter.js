import type { AnimatterWorld, WorldSystem } from "../world.js";
import { claimStyle } from "../style-ownership.js";
import { createMetaballCanvas, type MetaballCanvas, type MetaBlob } from "../renderers/metaball.js";
import {
  keyboardTarget,
  nearestSlot,
  proximityScale,
  reorderIds,
  springStep,
  type DockOrientation,
  type Spring1D,
} from "./model.js";

export interface LiquidDockOptions {
  orientation?: DockOrientation;
  /** Peak magnification at the pointer. Default 1.8. */
  maxScale?: number;
  /** Proximity falloff radius in CSS px. Default 70. */
  sigma?: number;
  stiffness?: number;
  damping?: number;
  /** Enable pointer drag and Alt+Arrow keyboard reordering. Default true. */
  reorder?: boolean;
  /** Called after a reorder with the new id order. Business data is not touched. */
  onReorder?: (order: readonly string[]) => void;
  /**
   * Liquid connector: draws a metaball layer behind the items, so neighbouring items that are
   * magnified close together look joined. Visual only; hit-testing and order are unchanged.
   */
  connector?: boolean | { color?: [number, number, number] };
}

export interface LiquidDockHandle {
  order(): string[];
  /** Reorders known ids to the front in the given order; unknown ids are ignored. */
  setOrder(ids: readonly string[]): void;
  /** Re-scan children after external DOM changes. */
  refresh(): void;
  destroy(): void;
}

interface ItemState {
  el: HTMLElement;
  /** Extra claims made only when the connector is on (position, z-index). */
  extra: Array<() => void>;
  spring: Spring1D;
  target: number;
  dragOffset: number;
  release: () => void;
}

interface DragState {
  id: string;
  pointerId: number;
  startAxis: number;
  startIndex: number;
  slot: number;
  active: boolean;
}

let dockSerial = 0;

/**
 * Liquid dock: continuous proximity magnification, spring settle, pointer drag reorder and
 * keyboard reorder. Items are the container's direct children carrying `data-dock-id`.
 * The dock is the single writer of `transform` on its items (claimed via claimStyle) and of
 * `touch-action` on its container. Motion runs on the world clock. Reduced motion disables
 * magnification but keeps pointer and keyboard reordering working.
 */
export function createLiquidDock(
  world: AnimatterWorld,
  container: HTMLElement,
  options: LiquidDockOptions = {},
): LiquidDockHandle {
  const orientation: DockOrientation = options.orientation ?? "horizontal";
  const maxScale = options.maxScale ?? 1.8;
  const sigma = options.sigma ?? 70;
  const stiffness = options.stiffness ?? 260;
  const damping = options.damping ?? 20;
  const reorderEnabled = options.reorder !== false;
  if (!Number.isFinite(maxScale) || maxScale < 1 || maxScale > 4)
    throw new RangeError("maxScale must be between 1 and 4");
  if (!Number.isFinite(sigma) || sigma <= 0) throw new RangeError("sigma must be positive");

  const owner = `liquid-dock#${++dockSerial}`;
  const horizontal = orientation === "horizontal";
  const items = new Map<string, ItemState>();
  const restoreTouchAction = container.style.touchAction;
  const restorePosition = container.style.position;
  const releaseTouch = claimStyle(container, "touch-action", owner);
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  });
  let destroyed = false;
  let pointerAxis: number | null = null;
  let lastAxis = 0;
  let lastTime = 0;
  let pointerSpeed = 0;
  let drag: DragState | null = null;

  container.style.touchAction = horizontal ? "pan-y" : "pan-x";
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  container.setAttribute("role", "toolbar");
  container.setAttribute("aria-orientation", orientation);
  container.append(status);

  const connectorOptions = options.connector ? (options.connector === true ? {} : options.connector) : null;
  const connector: MetaballCanvas | null = connectorOptions
    ? createMetaballCanvas(world, container, { cell: 2, threshold: 0.9, color: connectorOptions.color ?? [196, 214, 208] })
    : null;

  const axisOf = (clientX: number, clientY: number): number => {
    const r = container.getBoundingClientRect();
    return horizontal ? clientX - r.left : clientY - r.top;
  };
  // offsetLeft/Top ignore transforms, so magnified items keep their resting centre.
  const baseCenter = (el: HTMLElement): number =>
    horizontal ? el.offsetLeft + el.offsetWidth / 2 : el.offsetTop + el.offsetHeight / 2;
  const itemElements = (): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(":scope > [data-dock-id]")];
  const order = (): string[] => itemElements().map((el) => el.dataset.dockId!);

  const scan = () => {
    const seen = new Set<string>();
    for (const el of itemElements()) {
      const id = el.dataset.dockId!;
      if (seen.has(id)) throw new Error(`Duplicate dock id: ${id}`);
      seen.add(id);
      const existing = items.get(id);
      if (existing && existing.el === el) continue;
      if (existing) {
        existing.release();
        existing.el.style.transform = "";
        items.delete(id);
      }
      if (el.tabIndex < 0) el.tabIndex = 0;
      el.style.transformOrigin = horizontal ? "50% 100%" : "100% 50%";
      const extra: Array<() => void> = [];
      if (connector) {
        extra.push(claimStyle(el, "position", owner), claimStyle(el, "z-index", owner));
        el.style.position = "relative";
        el.style.zIndex = "1";
      }
      const transformRelease = claimStyle(el, "transform", owner);
      items.set(id, {
        el,
        extra,
        spring: { value: 1, velocity: 0 },
        target: 1,
        dragOffset: 0,
        release: () => {
          transformRelease();
          for (const release of extra) release();
          if (connector) {
            el.style.position = "";
            el.style.zIndex = "";
          }
        },
      });
    }
    for (const [id, state] of [...items]) {
      if (!seen.has(id)) {
        state.release();
        state.el.style.transform = "";
        items.delete(id);
      }
    }
  };

  const applyOrder = (ids: readonly string[]) => {
    for (const id of ids) {
      const state = items.get(id);
      if (state) container.insertBefore(state.el, status);
    }
  };

  const commitReorder = (from: number, to: number) => {
    const next = reorderIds(order(), from, to);
    const focused = document.activeElement;
    applyOrder(next);
    if (focused instanceof HTMLElement && container.contains(focused))
      focused.focus({ preventScroll: true });
    status.textContent = `${next[to]} moved to position ${to + 1} of ${next.length}`;
    options.onReorder?.(next);
  };

  const onPointerMove = (event: PointerEvent) => {
    const now = performance.now();
    const axis = axisOf(event.clientX, event.clientY);
    if (pointerAxis !== null && now > lastTime) pointerSpeed = (axis - lastAxis) / (now - lastTime);
    pointerAxis = axis;
    lastAxis = axis;
    lastTime = now;
    if (drag && drag.pointerId === event.pointerId) {
      const delta = axis - drag.startAxis;
      if (!drag.active && Math.abs(delta) < 4) return;
      drag.active = true;
      const dragged = items.get(drag.id);
      if (dragged) dragged.dragOffset = delta;
      const centers = order()
        .filter((id) => id !== drag!.id)
        .map((id) => baseCenter(items.get(id)!.el));
      drag.slot = nearestSlot(axis, centers);
      return;
    }
    const overshoot = Math.min(0.12, Math.abs(pointerSpeed) * 0.0004);
    for (const state of items.values()) {
      const distance = axis - baseCenter(state.el);
      state.target =
        proximityScale(distance, { maxScale, sigma }) +
        overshoot * (1 - Math.min(1, Math.abs(distance) / sigma));
    }
  };

  const onPointerLeave = () => {
    pointerAxis = null;
    pointerSpeed = 0;
    for (const state of items.values()) state.target = 1;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!reorderEnabled || event.button !== 0) return;
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-id]");
    if (!el || el.parentElement !== container) return;
    const id = el.dataset.dockId!;
    drag = {
      id,
      pointerId: event.pointerId,
      startAxis: axisOf(event.clientX, event.clientY),
      startIndex: order().indexOf(id),
      slot: order().indexOf(id),
      active: false,
    };
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      /* capture unavailable: drag still follows while the pointer stays over the container */
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;
    const state = items.get(finished.id);
    if (state) state.dragOffset = 0;
    if (finished.active && finished.slot !== finished.startIndex)
      commitReorder(finished.startIndex, finished.slot);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-dock-id]");
    if (!el || el.parentElement !== container) return;
    const list = order();
    const index = list.indexOf(el.dataset.dockId!);
    const forwardKey = horizontal ? "ArrowRight" : "ArrowDown";
    const backwardKey = horizontal ? "ArrowLeft" : "ArrowUp";
    if (reorderEnabled && event.altKey && (event.key === forwardKey || event.key === backwardKey)) {
      event.preventDefault();
      const to = event.key === forwardKey ? index + 1 : index - 1;
      if (to >= 0 && to < list.length) commitReorder(index, to);
      return;
    }
    const next = keyboardTarget(index, list.length, event.key, orientation);
    if (next >= 0 && next !== index) {
      event.preventDefault();
      items.get(list[next]!)?.el.focus();
    }
  };

  scan();
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.addEventListener("keydown", onKeyDown);

  const system: WorldSystem = {
    name: owner,
    fixedStep(dt: number) {
      if (destroyed) return;
      for (const state of items.values())
        springStep(state.spring, state.target, dt, stiffness, damping);
    },
    frame() {
      if (destroyed) return;
      const reduced = world.stats().reducedMotion;
      if (connector) connector.setBlobs(connectorBlobs());
      for (const state of items.values()) {
        const s = reduced ? 1 : state.spring.value;
        const shift = state.dragOffset.toFixed(2);
        const transform = horizontal
          ? `translate(${shift}px, 0px) scale(${s.toFixed(4)})`
          : `translate(0px, ${shift}px) scale(${s.toFixed(4)})`;
        if (state.el.style.transform !== transform) state.el.style.transform = transform;
      }
    },
    destroy() {
      for (const state of items.values()) {
        state.release();
        state.el.style.transform = "";
      }
    },
  };
  const detach = world.attach(system);

  // Blobs for the connector, in container coordinates. Each item is a blob at its visual centre
  // (transform-origin is the bottom or right edge, so the centre moves with scale). A bridge blob
  // sits between each pair of neighbours and only shows a neck when they are close.
  function connectorBlobs(): MetaBlob[] {
    const blobs: MetaBlob[] = [];
    let previous: MetaBlob | null = null;
    for (const id of order()) {
      const state = items.get(id);
      if (!state) continue;
      const el = state.el;
      const s = state.spring.value;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = horizontal ? el.offsetLeft + w / 2 : el.offsetLeft + w * (1 - s / 2);
      const y = horizontal ? el.offsetTop + h * (1 - s / 2) : el.offsetTop + h / 2;
      const r = 0.5 * Math.min(w, h) * s * 0.6;
      const blob = { x, y, r };
      blobs.push(blob);
      if (previous) {
        blobs.push({
          x: (previous.x + x) / 2,
          y: (previous.y + y) / 2,
          r: 0.7 * Math.min(previous.r, r),
        });
      }
      previous = blob;
    }
    return blobs;
  }

  return {
    order,
    setOrder(ids) {
      const known = ids.filter((id, i) => items.has(id) && ids.indexOf(id) === i);
      const rest = order().filter((id) => !known.includes(id));
      applyOrder([...known, ...rest]);
      options.onReorder?.(order());
    },
    refresh() {
      scan();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("keydown", onKeyDown);
      detach();
      connector?.destroy();
      for (const state of items.values()) {
        state.release();
        state.el.style.transform = "";
      }
      items.clear();
      releaseTouch();
      container.style.touchAction = restoreTouchAction;
      container.style.position = restorePosition;
      container.removeAttribute("role");
      container.removeAttribute("aria-orientation");
      status.remove();
    },
  };
}
