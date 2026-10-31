import { vec, type Rect, type SurfaceOptions, type Vec3 } from "../types.js";
export interface Surface {
  id: string;
  element: HTMLElement;
  options: SurfaceOptions;
  rect: Rect;
  anchors: Record<"top" | "center" | "bottom" | "left" | "right", Vec3>;
}
/** Viewport coordinate system; grid is rebuilt only when geometry becomes dirty. */
export class SpatialRegistry {
  readonly surfaces = new Map<string, Surface>();
  private elements = new WeakMap<Element, string>();
  private grid = new Map<string, Set<string>>();
  private resize: ResizeObserver;
  private mutation: MutationObserver;
  dirty = true;
  readonly cellSize = 240;
  constructor(
    private root: HTMLElement,
    private changed: () => void,
  ) {
    this.resize = new ResizeObserver(() => {
      this.dirty = true;
    });
    this.mutation = new MutationObserver(() => {
      this.dirty = true;
    });
    this.mutation.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "class"],
    });
  }
  register(element: HTMLElement, id: string, options: SurfaceOptions): Surface {
    if (!this.root.contains(element) && this.root !== element)
      throw new Error("Surface must belong to world root");
    if (this.surfaces.has(id) || this.elements.has(element))
      throw new Error(`Duplicate surface: ${id}`);
    const surface: Surface = {
      id,
      element,
      options,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      anchors: {
        top: vec(),
        center: vec(),
        bottom: vec(),
        left: vec(),
        right: vec(),
      },
    };
    this.surfaces.set(id, surface);
    this.elements.set(element, id);
    this.resize.observe(element);
    this.dirty = true;
    return surface;
  }
  unregister(id: string): void {
    const s = this.surfaces.get(id);
    if (!s) return;
    this.resize.unobserve(s.element);
    this.elements.delete(s.element);
    this.surfaces.delete(id);
    this.dirty = true;
  }
  closest(target: EventTarget | null): Surface | undefined {
    let el = target instanceof Element ? target : null;
    while (el && this.root.contains(el)) {
      const id = this.elements.get(el);
      if (id) return this.surfaces.get(id);
      el = el.parentElement;
    }
    return undefined;
  }
  measure(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.grid.clear();
    const saved = [...this.surfaces.values()].map((s) => ({
      s,
      translate: s.element.style.translate,
      rotate: s.element.style.rotate,
      scale: s.element.style.scale,
      priority: ["translate", "rotate", "scale"].map((p) =>
        s.element.style.getPropertyPriority(p),
      ),
    }));
    for (const { s } of saved) {
      s.element.style.translate = "none";
      s.element.style.rotate = "none";
      s.element.style.scale = "none";
    }
    for (const { s } of saved) {
      const r = s.element.getBoundingClientRect();
      s.rect = { x: r.x, y: r.y, width: r.width, height: r.height };
      const cx = r.x + r.width / 2,
        cy = r.y + r.height / 2,
        z = s.options.plane ?? 0;
      s.anchors = {
        top: vec(cx, r.y, z),
        bottom: vec(cx, r.bottom, z),
        left: vec(r.x, cy, z),
        right: vec(r.right, cy, z),
        center: vec(cx, cy, z),
      };
      if (r.width && r.height && s.element.isConnected) {
        for (
          let x = Math.floor(r.x / this.cellSize);
          x <= Math.floor(r.right / this.cellSize);
          x++
        )
          for (
            let y = Math.floor(r.y / this.cellSize);
            y <= Math.floor(r.bottom / this.cellSize);
            y++
          ) {
            const key = `${x}:${y}`,
              cell = this.grid.get(key) ?? new Set();
            cell.add(s.id);
            this.grid.set(key, cell);
          }
      }
    }
    for (const { s, translate, rotate, scale, priority } of saved) {
      for (const [i, p] of ["translate", "rotate", "scale"].entries()) {
        const value = [translate, rotate, scale][i]!;
        if (value) s.element.style.setProperty(p, value, priority[i]);
        else s.element.style.removeProperty(p);
      }
    }
    this.changed();
  }
  near(point: Vec3, radius: number): Surface[] {
    const found = new Set<string>();
    for (
      let x = Math.floor((point.x - radius) / this.cellSize);
      x <= Math.floor((point.x + radius) / this.cellSize);
      x++
    )
      for (
        let y = Math.floor((point.y - radius) / this.cellSize);
        y <= Math.floor((point.y + radius) / this.cellSize);
        y++
      )
        for (const id of this.grid.get(`${x}:${y}`) ?? []) found.add(id);
    return [...found]
      .map((id) => this.surfaces.get(id)!)
      .filter(
        (s) =>
          Math.hypot(
            s.anchors.center.x - point.x,
            s.anchors.center.y - point.y,
          ) <=
          radius + Math.hypot(s.rect.width, s.rect.height) / 2,
      );
  }
  destroy(): void {
    this.resize.disconnect();
    this.mutation.disconnect();
    this.surfaces.clear();
    this.grid.clear();
    this.elements = new WeakMap();
  }
}
