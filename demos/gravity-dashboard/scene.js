import { scene, materials, dialog } from "../shared/common.js";
const world = scene({ mode: "field", material: materials.heavy });
const list = document.querySelector("#widgets"),
  status = document.querySelector("#dashboard-status");
for (const id of ["revenue", "users", "focus"])
  world.configure(id, { collision: true, material: { maxDisplacement: 200 } });
function reorder(card, index) {
  const items = [...list.children],
    from = items.indexOf(card);
  index = Math.max(0, Math.min(items.length - 1, index));
  if (from === index) return;
  world.layout(() => {
    items.splice(from, 1);
    items.splice(index, 0, card);
    list.replaceChildren(...items);
  });
  status.textContent = `${card.querySelector(".widget-top").textContent.trim()} moved to position ${index + 1}.`;
  world.emit("list", card.dataset.am, { index });
}
list.addEventListener("click", (e) => {
  const button = e.target.closest("[data-up],[data-down]");
  if (!button) return;
  const card = button.closest(".widget");
  reorder(
    card,
    [...list.children].indexOf(card) +
      (button.hasAttribute("data-up") ? -1 : 1),
  );
});
world.on((e) => {
  if (e.type !== "dragend" || e.data.cancelled) return;
  const card = list.querySelector(`[data-am="${e.target}"]`);
  if (!card) return;
  const items = [...list.children],
    nearest = items
      .map((el, index) => {
        const r = world.spatial.surfaces.get(el.dataset.am).rect;
        return {
          index,
          d: Math.hypot(
            e.point.x - r.x - r.width / 2,
            e.point.y - r.y - r.height / 2,
          ),
        };
      })
      .sort((a, b) => a.d - b.d)[0];
  reorder(card, nearest.index);
});
document.querySelector("#refresh").addEventListener("click", async () => {
  status.textContent = "Updating your instruments…";
  await world.track(
    new Promise((r) => setTimeout(() => r({ revenue: 24892 }), 650)),
    "revenue",
  );
  document.querySelector('[data-am="revenue"] .metric').firstChild.textContent =
    "$24,892";
  status.textContent = "Instruments updated. All systems nominal.";
});
document.querySelectorAll("[data-period]").forEach((b) =>
  b.addEventListener("click", () => {
    document
      .querySelectorAll("[data-period]")
      .forEach((el) => el.classList.toggle("active", el === b));
    document
      .querySelector("#activity-line")
      .setAttribute(
        "d",
        b.dataset.period === "month"
          ? "M0 140Q100 133 170 108T350 85 530 60 710 35 900 9"
          : "M0 126Q65 133 130 85T260 93 390 46 520 66 650 27 780 39 900 9",
      );
    document
      .querySelector("#activity-area")
      .setAttribute(
        "d",
        document.querySelector("#activity-line").getAttribute("d") + "V150H0",
      );
    document
      .querySelectorAll(".chart-days span")
      .forEach(
        (el, i) =>
          (el.textContent =
            b.dataset.period === "month"
              ? `WK ${i + 1}`
              : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i]),
      );
    world.emit("tabs", "users", { period: b.dataset.period });
  }),
);
dialog(world, "settings-dialog", document.querySelector("#settings"));
document.querySelector("#gravity").addEventListener("input", (e) => {
  for (const el of list.children)
    world.configure(el.dataset.am, {
      material: { gravity: Number(e.target.value) },
    });
});
document.querySelector("#add-widget").addEventListener("click", () => {
  const existing = document.querySelector('[data-am="latency"]');
  if (existing) {
    status.textContent = "Latency is already in your orbit.";
    return;
  }
  const card = document.createElement("article");
  card.className = "widget am-surface";
  card.dataset.am = "latency";
  card.dataset.amDrag = "";
  card.role = "listitem";
  card.innerHTML =
    '<div class="widget-top"><span>Latency</span><span aria-hidden="true">⠿</span></div><div class="metric">42<span class="muted small">ms</span></div><p class="small muted">A healthy connection.</p><div class="widget-foot"><span class="mono">LIVE IN YOUR ORBIT</span><div class="reorder"><button data-up aria-label="Move latency up">↑</button><button data-down aria-label="Move latency down">↓</button></div></div>';
  world.layout(() => list.append(card));
  world.register(card, {
    id: "latency",
    draggable: true,
    collision: true,
    material: { maxDisplacement: 200 },
  });
  world.emit("success", "latency");
  status.textContent = "Latency widget added.";
});
