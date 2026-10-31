import type { Surface } from "../spatial/registry.js";
import type { Body } from "../physics/engine.js";
import type { Interaction } from "../types.js";
/** Field presentation extension. Implementations own and restore their own styles/nodes. */
export interface SurfaceRenderer {
  mount(surface: Surface): void;
  activate(surface: Surface): void;
  restore(surface: Surface): void;
  unmount(surface: Surface): void;
  event(event: Interaction, surface: Surface): void;
  setPresence(id: string, value: number | null): void;
  render(surface: Surface, body: Body, dt: number, reduced: boolean): void;
  destroy(): void;
}
