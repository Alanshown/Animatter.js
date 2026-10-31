import type { SurfaceRenderer } from "./protocol.js";
import type { Body } from "../physics/engine.js";
import type { Surface } from "../spatial/registry.js";
import type { Interaction } from "../types.js";
const properties = [
  "translate",
  "rotate",
  "scale",
  "will-change",
  "touch-action",
  "--am-energy",
  "--am-depth",
  "--am-ripple-x",
  "--am-ripple-y",
  "--am-ripple",
] as const;
interface Saved {
  value: string;
  priority: string;
}
export class FieldRenderer implements SurfaceRenderer {
  readonly presence = new Map<string, number>();
  private saved = new Map<string, Map<string, Saved>>();
  private ripples = new Map<string, number>();
  setPresence(id: string, value: number | null): void {
    if (value === null) this.presence.delete(id);
    else this.presence.set(id, value);
  }
  mount(surface: Surface): void {
    const style = surface.element.style;
    this.saved.set(
      surface.id,
      new Map(
        properties.map((p) => [
          p,
          {
            value: style.getPropertyValue(p),
            priority: style.getPropertyPriority(p),
          },
        ]),
      ),
    );
    style.willChange = "translate, rotate, scale";
    if (surface.options.draggable) style.touchAction = "none";
  }
  restore(surface: Surface): void {
    const saved = this.saved.get(surface.id);
    if (!saved) return;
    for (const [property, { value, priority }] of saved)
      if (value) surface.element.style.setProperty(property, value, priority);
      else surface.element.style.removeProperty(property);
    this.ripples.delete(surface.id);
    this.presence.delete(surface.id);
  }
  unmount(surface: Surface): void {
    this.restore(surface);
    this.saved.delete(surface.id);
  }
  activate(surface: Surface): void {
    surface.element.style.willChange = "translate, rotate, scale";
    if (surface.options.draggable) surface.element.style.touchAction = "none";
  }
  event(event: Interaction, surface: Surface): void {
    if (event.type === "click") {
      surface.element.style.setProperty(
        "--am-ripple-x",
        `${event.point.x - surface.rect.x}px`,
      );
      surface.element.style.setProperty(
        "--am-ripple-y",
        `${event.point.y - surface.rect.y}px`,
      );
      this.ripples.set(surface.id, 0);
    }
  }
  render(surface: Surface, body: Body, dt: number, reduced: boolean): void {
    const style = surface.element.style,
      p = body.position,
      v = body.velocity;
    if (reduced) {
      style.translate = "none";
      style.rotate = "none";
      style.scale = "none";
      style.setProperty("--am-energy", "0");
      return;
    }
    style.translate = `${p.x.toFixed(3)}px ${p.y.toFixed(3)}px ${(p.z + body.origin.z).toFixed(3)}px`;
    style.rotate = `${Math.max(-7, Math.min(7, v.x * 0.015)).toFixed(3)}deg`;
    const presence = this.presence.get(surface.id) ?? 1;
    const squash = Math.min(
      0.15,
      Math.hypot(v.x, v.y) * body.material.softness * 0.0006,
    );
    style.scale = `${((1 + squash) * presence).toFixed(4)} ${((1 - squash) * presence).toFixed(4)}`;
    style.setProperty(
      "--am-energy",
      Math.min(1, Math.hypot(v.x, v.y) / 160).toFixed(3),
    );
    style.setProperty("--am-depth", String(p.z));
    const ripple = this.ripples.get(surface.id);
    if (ripple !== undefined) {
      const next = ripple + dt;
      style.setProperty("--am-ripple", Math.max(0, 1 - next / 0.6).toFixed(3));
      if (next > 0.6) this.ripples.delete(surface.id);
      else this.ripples.set(surface.id, next);
    }
  }
  destroy(): void {
    this.saved.clear();
    this.ripples.clear();
    this.presence.clear();
  }
}
