import { scene, materials, dialog, tooltip } from "../shared/common.js";
const world = scene({
  mode: "field",
  material: { ...materials.elastic, magnetism: 16, maxDisplacement: 22 },
  regions: [
    {
      selector: ".work",
      mode: "field",
      material: { mass: 2, stiffness: 120, damping: 23 },
    },
  ],
});
tooltip(
  world,
  document.querySelector('[data-am="feel"]'),
  "A little bit of movement can make a digital space feel surprisingly alive.",
);
const projects = {
  forma: {
    title: "Forma — a feeling of home",
    category: "BRAND EXPERIENCE / ART DIRECTION",
    description:
      "A concept homeware brand built around sculptural objects and warm, considered details. The interaction follows the same principle: give things weight, and let them settle.",
  },
  "of-earth": {
    title: "Of Earth — less, but better",
    category: "E-COMMERCE / DIGITAL IDENTITY",
    description:
      "An imagined botanical studio. A thoughtful digital storefront with tactile packaging studies, quiet typography, and enough space to breathe.",
  },
  between: {
    title: "The space between.",
    category: "INDEPENDENT INTERACTION STUDY",
    description:
      "An ongoing exploration of the tiny moments between intention and action. Hover, focus, navigate: the small things are the experience.",
  },
};
for (const button of document.querySelectorAll("[data-project]"))
  button.addEventListener("click", () => {
    const p = projects[button.dataset.project];
    document.querySelector("#project-title").textContent = p.title;
    document.querySelector("#project-category").textContent = p.category;
    document.querySelector("#project-description").textContent = p.description;
    document.querySelector("#project-dialog").showModal();
    world.spatial.dirty = true;
    world.emit("modal", "project-dialog");
  });
document
  .querySelectorAll("#project-dialog [data-close]")
  .forEach((el) =>
    el.addEventListener("click", () =>
      document.querySelector("#project-dialog").close(),
    ),
  );
dialog(world, "contact-dialog", document.querySelector("#contact"));
dialog(world, "contact-dialog", document.querySelector("#contact-bottom"));
document
  .querySelector("#contact-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#contact-status");
    status.textContent = "Keeping this thought…";
    await world.track(new Promise((r) => setTimeout(r, 450)), "contact-dialog");
    status.textContent = `Thanks, ${new FormData(e.target).get("name")}. Your thought is saved in this page. Nothing was sent.`;
  });
world.on((e) => {
  if (e.type === "scroll")
    for (const id of ["forma", "of-earth", "third-project"]) {
      const surface = world.spatial.surfaces.get(id);
      if (surface.rect.y > 0 && surface.rect.y < innerHeight)
        world.physics.impulse(id, { y: -7 });
    }
});
