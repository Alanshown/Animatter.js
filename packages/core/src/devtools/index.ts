import type { AnimatterWorld } from "../world.js";
import type { WorldPlugin } from "../types.js";
/** Opt-in DOM inspector. Read-only geometry overlay and bounded event log. */
export function devtools(): WorldPlugin<AnimatterWorld> {
  return {
    name: "devtools",
    setup(world) {
      const host = document.createElement("div");
      host.className = "am-devtools";
      host.setAttribute("aria-hidden", "true");
      host.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483500";
      const canvas = document.createElement("canvas"),
        panel = document.createElement("pre");
      panel.style.cssText =
        "position:absolute;bottom:12px;left:12px;background:#151c27e8;color:#d8ff62;font:11px/1.5 monospace;padding:12px;border-radius:10px;max-width:380px;white-space:pre-wrap";
      host.append(canvas, panel);
      document.body.append(host);
      const events: string[] = [];
      const off = world.on((e) => {
        if (e.type === "pointer" || e.type === "hover") return;
        events.push(`L${e.level} ${e.type} → ${e.target ?? "world"}`);
        if (events.length > 6) events.shift();
      });
      let frame = 0;
      const draw = () => {
        canvas.width = innerWidth;
        canvas.height = innerHeight;
        const c = canvas.getContext("2d");
        if (c) {
          c.strokeStyle = "#b9ff48";
          c.lineWidth = 1;
          for (const s of world.spatial.surfaces.values()) {
            c.strokeRect(s.rect.x, s.rect.y, s.rect.width, s.rect.height);
            c.fillStyle = "#b9ff48";
            c.font = "10px monospace";
            c.fillText(s.id, s.rect.x + 4, s.rect.y + 12);
          }
        }
        panel.textContent =
          JSON.stringify(world.stats(), null, 1) + "\n" + events.join("\n");
        frame = requestAnimationFrame(draw);
      };
      draw();
      return () => {
        off();
        cancelAnimationFrame(frame);
        host.remove();
      };
    },
  };
}
