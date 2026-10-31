import { scene, materials, tooltip } from "../shared/common.js";
import { orbitalField } from "/packages/core/dist/animatter.js";
const world = scene({ mode: "field", material: materials.magnetic });
let mode = "attract",
  removeOrbit = null;
const nodes = ["node-a", "node-b", "node-c", "node-d"];
function update() {
  const strength = Number(document.querySelector("#strength").value),
    radius = Number(document.querySelector("#radius").value);
  for (const id of nodes)
    world.configure(id, {
      material: {
        magnetism:
          mode === "orbit" ? 0 : strength * (mode === "repel" ? -1 : 1),
        radius,
        maxDisplacement: 85,
      },
    });
  removeOrbit?.();
  removeOrbit = null;
  if (mode === "orbit")
    removeOrbit = world.addField(orbitalField("orbit", strength * 22, radius));
  document.querySelector("#strength-value").textContent = `${strength} mT`;
  document.querySelector("#radius-value").textContent = `${radius} px`;
  document.querySelector("#field-value").textContent =
    `${mode === "repel" ? "−" : mode === "orbit" ? "⟳" : "+"} ${strength} mT`;
}
document.querySelectorAll("[data-field]").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.field;
    document.querySelectorAll("[data-field]").forEach((el) => {
      el.classList.toggle("active", el === b);
      el.setAttribute("aria-pressed", String(el === b));
    });
    document.querySelector("#readout").textContent = {
      attract: "Attraction",
      repel: "Repulsion",
      orbit: "Orbital flow",
    }[mode];
    update();
    world.emit("selection", b.dataset.am, { mode });
  }),
);
document
  .querySelectorAll("input")
  .forEach((el) => el.addEventListener("input", update));
let selected = null;
const links = [];
for (const id of nodes) {
  const el = document.querySelector(`[data-am="${id}"]`);
  tooltip(
    world,
    el,
    "Choose me, then another node, to make a physical connection.",
  );
  el.addEventListener("click", () => {
    if (!selected) {
      selected = id;
      el.classList.add("selected");
      return;
    }
    if (selected !== id) {
      const a = world.spatial.surfaces.get(selected).anchors.center,
        b = world.spatial.surfaces.get(id).anchors.center;
      const constraint = {
        a: selected,
        b: id,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        stiffness: 0.02,
      };
      world.physics.constraints.add(constraint);
      links.push(constraint);
      constraint.disconnect = world.graph.connect({
        from: selected,
        to: id,
        on: "click",
        effect: (_, target) =>
          world.physics.impulse(target, { y: -170, z: 80 }),
      });
      document.querySelector("#connection-status").textContent =
        `${selected} connected to ${id}`;
    }
    document
      .querySelector(`[data-am="${selected}"]`)
      .classList.remove("selected");
    selected = null;
  });
}
document.querySelector("#clear-connections").addEventListener("click", () => {
  for (const c of links) {
    world.physics.constraints.delete(c);
    c.disconnect();
  }
  if (selected)
    document
      .querySelector(`[data-am="${selected}"]`)
      .classList.remove("selected");
  selected = null;
  links.length = 0;
  document.querySelector("#connection-status").textContent =
    "All connections cleared.";
});
world.use({
  name: "connection-lines",
  setup(world) {
    const canvas = document.querySelector("#connections"),
      ctx = canvas.getContext("2d");
    let frame = 0;
    const draw = () => {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      ctx.strokeStyle = "#9b704b80";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      for (const link of links) {
        const a = world.spatial.surfaces.get(link.a),
          b = world.spatial.surfaces.get(link.b),
          pa = world.physics.bodies.get(link.a).position,
          pb = world.physics.bodies.get(link.b).position;
        if (!world.stats().enabled || world.currentMode === "off") continue;
        ctx.beginPath();
        ctx.moveTo(a.anchors.center.x + pa.x, a.anchors.center.y + pa.y);
        ctx.lineTo(b.anchors.center.x + pb.x, b.anchors.center.y + pb.y);
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  },
});
update();
