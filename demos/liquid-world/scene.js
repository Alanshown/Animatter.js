import { scene, materials, dialog, tooltip } from "../shared/common.js";
const world = scene({ mode: "field", material: materials.liquid });
dialog(world, "about-dialog", document.querySelector("#about"));
tooltip(
  world,
  document.querySelector("#flow-info"),
  "A liquid material: softer springs, a slower return, and a little surface tension.",
);
document.querySelector("#breathe").addEventListener("click", () => {
  for (const id of ["orb", "soft-form", "still-water", "slow-orbit"])
    world.physics.impulse(id, {
      x: (Math.random() - 0.5) * 300,
      y: -260,
      z: 120,
    });
});
const filter = document.querySelector("#filter");
filter.addEventListener("click", () => {
  const open = filter.getAttribute("aria-expanded") !== "true";
  filter.setAttribute("aria-expanded", String(open));
  void world.transition("filter-menu", open);
  world.emit("menu", "filter");
});
document.querySelectorAll("[data-material]").forEach((button) =>
  button.addEventListener("click", () => {
    const material = button.dataset.material;
    for (const id of ["orb", "soft-form", "still-water", "slow-orbit"])
      world.configure(id, { material: materials[material] });
    document.querySelector("#material-name").textContent =
      material[0].toUpperCase() + material.slice(1);
    filter.setAttribute("aria-expanded", "false");
    void world.transition("filter-menu", false);
    filter.focus();
  }),
);
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  tabs.forEach((t) => {
    const selected = t === tab;
    t.classList.toggle("active", selected);
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    void world.transition(t.getAttribute("aria-controls"), selected);
  });
  world.emit("tabs", tab.dataset.am);
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(tab));
  tab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next =
        tabs[
          (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length
        ];
      next.focus();
      select(next);
    }
  });
});

for (const id of ["objects", "notes"])
  world.configure(id, {
    material: {
      mass: 1,
      stiffness: 120,
      damping: 25,
      softness: 0.1,
      magnetism: 0,
      maxDisplacement: 0,
    },
  });
