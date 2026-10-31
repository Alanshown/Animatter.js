import { scene, SVGActorRenderer, materials } from "../shared/common.js";
const world = scene({
  mode: "both",
  material: { ...materials.elastic, magnetism: 8, maxDisplacement: 24 },
});
const discovered = new Set();
function awaken(id) {
  const el = document.querySelector(`[data-awaken="${id}"]`);
  if (!el || discovered.has(id)) return;
  discovered.add(id);
  el.classList.remove("sleeping");
  document.querySelector("#progress").textContent = `${discovered.size} / 4`;
  document.querySelector("#progress-bar").style.width =
    `${(discovered.size / 4) * 100}%`;
  document.querySelector("#announce").textContent =
    `Pip discovered ${el.querySelector("h3").textContent}`;
  world.emit("success", id);
}
const pip = world.addActor("pip", {
  renderer: new SVGActorRenderer("#bdca90"),
  position: { x: innerWidth * 0.64, y: 180, z: 0 },
  idle: true,
  idleDelay: 4.5,
  draggable: true,
  reactTo: ["enter", "click", "focus", "dragstart", "dragend"],
  onLand: awaken,
});
window.pip = pip;
document.querySelector("#wake").addEventListener("click", async () => {
  for (const id of ["fern", "quote", "landscape", "ritual"]) {
    const result = await pip.moveTo(id, { priority: 60 });
    if (result === "cancelled") awaken(id);
  }
});
document.querySelector("#reset").addEventListener("click", () => {
  world.arbiter.clear();
  discovered.clear();
  document
    .querySelectorAll("[data-awaken]")
    .forEach((el) => el.classList.add("sleeping"));
  document.querySelector("#progress").textContent = "0 / 4";
  document.querySelector("#progress-bar").style.width = "0%";
});
world.on((e) => {
  if (e.type === "scroll") {
    const visible = [...world.spatial.surfaces.values()].find(
      (s) =>
        s.options.id !== "wake" && s.rect.y > 40 && s.rect.y < innerHeight - 50,
    );
    if (visible) void pip.moveTo(visible.id, { priority: 20, kind: "climb" });
  }
});

for (const el of document.querySelectorAll("[data-awaken]"))
  el.addEventListener("click", () => {
    if (
      !world.stats().enabled ||
      !["both", "embodied"].includes(world.currentMode)
    )
      awaken(el.dataset.awaken);
  });
