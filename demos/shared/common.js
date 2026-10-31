import {
  createWorld,
  materials,
  SVGActorRenderer,
  CanvasActorRenderer,
  devtools,
} from "/packages/core/dist/animatter.js";
export { materials, SVGActorRenderer, CanvasActorRenderer };
export function scene(options = {}) {
  const world = createWorld(options);
  world.scan();
  const toolbar = document.createElement("footer");
  toolbar.className = "am-toolbar";
  toolbar.innerHTML = `<span><a href="/demos/index.html">↖ All experiments</a> &nbsp; / &nbsp; ANIMATTER · INTERACTION STUDIES</span><div class="am-toolbar-controls"><label>Mode <select aria-label="Interaction mode"><option value="field">Field</option><option value="embodied">Embodied</option><option value="both">Both</option><option value="off">Off</option></select></label><button type="button" data-toggle-effects>Pause effects</button><button type="button" data-inspect>Inspect</button></div>`;
  (
    document.querySelector("[data-footer]") ??
    document.querySelector(".shell") ??
    document.body
  ).append(toolbar);
  const select = toolbar.querySelector("select");
  select.value = world.currentMode;
  select.addEventListener("change", () => world.setMode(select.value));
  let enabled = true;
  toolbar
    .querySelector("[data-toggle-effects]")
    .addEventListener("click", (e) => {
      enabled = !enabled;
      world.setEnabled(enabled);
      e.currentTarget.textContent = enabled
        ? "Pause effects"
        : "Resume effects";
      e.currentTarget.setAttribute("aria-pressed", String(!enabled));
    });
  let removeTools;
  toolbar.querySelector("[data-inspect]").addEventListener("click", () => {
    if (removeTools) {
      removeTools();
      removeTools = null;
    } else removeTools = world.use(devtools());
  });
  window.world = world;
  window.demoReady = true;
  window.demoEvents = [];
  world.on((e) => {
    if (e.type === "pointer" || e.type === "hover") return;
    window.demoEvents.push({ type: e.type, target: e.target, level: e.level });
    if (window.demoEvents.length > 200) window.demoEvents.shift();
  });
  window.addEventListener("pagehide", () => world.destroy(), { once: true });
  return world;
}
export function dialog(world, id, opener) {
  const el = document.getElementById(id);
  opener.addEventListener("click", () => {
    el.showModal();
    world.spatial.dirty = true;
    world.emit("modal", id, { open: true });
    world.physics.impulse(id, { z: 140, y: -100 });
  });
  el.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => {
      el.close();
      world.emit("modal", id, { open: false });
    }),
  );
  el.addEventListener("click", (e) => {
    if (e.target === el && e.offsetX < 0) el.close();
  });
}
export function tooltip(world, trigger, text) {
  const tip = document.createElement("div");
  const id = `tip-${trigger.dataset.am ?? Math.random().toString(36).slice(2)}`;
  tip.id = id;
  tip.className = "tooltip am-surface";
  tip.hidden = true;
  tip.role = "tooltip";
  tip.textContent = text;
  document.body.append(tip);
  trigger.setAttribute("aria-describedby", id);
  world.register(tip, {
    id,
    material: {
      maxDisplacement: 12,
      magnetism: 0,
      stiffness: 200,
      damping: 28,
      mass: 1,
    },
  });
  let visible = false;
  const show = () => {
    if (visible) return;
    visible = true;
    const r = trigger.getBoundingClientRect();
    tip.style.left = `${Math.max(10, Math.min(innerWidth - 240, r.left))}px`;
    tip.style.top = `${r.bottom + 12}px`;
    void world.transition(id, true);
    world.emit("tooltip", trigger.dataset.am ?? null);
  };
  const hide = () => {
    if (!visible) return;
    visible = false;
    void world.transition(id, false);
  };
  trigger.addEventListener("pointerenter", show);
  trigger.addEventListener("pointerleave", hide);
  trigger.addEventListener("focus", show);
  trigger.addEventListener("blur", hide);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}
export function countLabel(world, target) {
  const el = document.querySelector("[data-event-label]");
  world.on((e) => {
    if (el && e.target === target && !["pointer", "hover"].includes(e.type))
      el.textContent = e.type;
  });
}
