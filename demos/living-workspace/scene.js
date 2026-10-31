import {
  scene,
  materials,
  CanvasActorRenderer,
  dialog,
} from "../shared/common.js";
const world = scene({
  mode: "both",
  material: { ...materials.elastic, magnetism: 6, maxDisplacement: 14 },
});
const status = document.querySelector("#work-status");
const pip = world.addActor("office-pip", {
  renderer: new CanvasActorRenderer("#c4b4df"),
  position: { x: innerWidth * 0.77, y: 260, z: 0 },
  idle: true,
  idleDelay: 4,
  draggable: true,
  reactTo: [
    "enter",
    "focus",
    "click",
    "loading",
    "success",
    "error",
    "notification",
  ],
});
window.pip = pip;
let activity = 0,
  quiet = false,
  serial = 0;
function counts() {
  for (const [key, id] of [
    ["todo", "todo-tasks"],
    ["doing", "doing-tasks"],
    ["done", "done-tasks"],
  ])
    document.querySelector(`#${key}-count`).textContent = String(
      document.querySelector(`#${id}`).querySelectorAll(".task").length,
    ).padStart(2, "0");
  document.querySelector("#task-count").textContent =
    `${document.querySelectorAll("[data-task]").length} TASKS`;
}
async function notify(title, text) {
  document.querySelector("#notification-title").textContent = title;
  document.querySelector("#notification-text").textContent = text;
  await world.transition("notification", true);
  world.emit("notification", "notification");
  const li = document.createElement("li");
  li.textContent = title;
  document.querySelector("#activity-list").prepend(li);
  document.querySelector("#activity-count").textContent = String(++activity);
}
function advance(task) {
  const list = task.parentElement,
    next =
      list.id === "todo-tasks"
        ? document.querySelector("#doing-tasks")
        : document.querySelector("#done-tasks");
  world.layout(() => next.prepend(task));
  if (next.id === "done-tasks") {
    task.classList.add("completed");
    task.querySelector("[data-run]")?.remove();
    task.querySelector("[data-next]")?.remove();
  }
  counts();
  world.emit("list", task.dataset.am);
}
async function runTask(task, fail = false) {
  const button = task.querySelector("[data-run]");
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.textContent = "Working…";
  }
  status.textContent = `Pip is keeping an eye on “${task.querySelector("h3").textContent}”.`;
  try {
    await world.track(
      new Promise((resolve, reject) =>
        setTimeout(
          () =>
            fail ? reject(Error("A small detour. Try again.")) : resolve(true),
          900,
        ),
      ),
      task.dataset.am,
    );
    if (task.parentElement.id === "todo-tasks") advance(task);
    advance(task);
    status.textContent = "One small step, done. You made a little progress.";
    await notify(
      "One small step, done.",
      "Pip thinks that is worth celebrating.",
    );
  } catch {
    if (button) {
      button.disabled = false;
      button.textContent = "Try again ↗";
    }
    status.textContent =
      "That did not work out. Your task is safe — try again when you are ready.";
    await notify(
      "A small detour.",
      "Your work is safe. There is always another try.",
    );
  }
}
document.querySelector(".board").addEventListener("click", (e) => {
  const task = e.target.closest("[data-task]");
  if (!task) return;
  if (e.target.closest("[data-run]")) void runTask(task);
  if (e.target.closest("[data-next]")) advance(task);
});
dialog(world, "task-dialog", document.querySelector("#add-task"));
dialog(world, "task-dialog", document.querySelector("#add-doing"));
dialog(world, "activity-dialog", document.querySelector("#inbox"));
document.querySelector("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.querySelector("#task-name").value.trim();
  if (!name) return;
  const id = `task-custom-${++serial}`,
    task = document.createElement("article");
  task.className = "task am-surface";
  task.dataset.am = id;
  task.dataset.task = id;
  task.innerHTML =
    '<div class="row spread"><span class="task-tag design">A NEW IDEA</span><button class="task-menu" data-next aria-label="Move task forward">→</button></div><h3></h3><p>One small step at a time.</p><div class="task-foot"><span>↳ Your own idea</span><button class="task-action" data-run>Start task ↗</button></div>';
  task.querySelector("h3").textContent = name;
  world.layout(() => document.querySelector("#todo-tasks").append(task));
  world.register(task, { id });
  counts();
  world.emit("success", id);
  document.querySelector("#task-dialog").close();
  e.target.reset();
});
document.querySelector("#quiet").addEventListener("click", (e) => {
  quiet = !quiet;
  world.setMode(quiet ? "field" : "both");
  e.currentTarget.setAttribute("aria-pressed", String(quiet));
  e.currentTarget.textContent = quiet ? "☀ Welcome back, Pip" : "☾ Quiet mode";
  status.textContent = quiet
    ? "A little quiet. Your work stays exactly where it is."
    : "Pip is back. Curiosity resumed.";
});
document.querySelector("#call-pip").addEventListener("click", () => {
  void pip.moveTo("companion", { kind: "climb", priority: 120 });
  status.textContent = "Pip is on his way. You can interrupt him at any time.";
});
document.querySelector("#simulate-error").addEventListener("click", () => {
  const task = document.querySelector('[data-am="task-notes"]');
  if (task.querySelector("[data-run]")) void runTask(task, true);
  else
    void notify(
      "Nothing left to retry.",
      "You have already finished this small step.",
    );
});
document
  .querySelector("#dismiss-notification")
  .addEventListener(
    "click",
    () => void world.transition("notification", false),
  );
document.querySelector("#personal-note").addEventListener("input", () => {
  document.querySelector("#note-status").textContent = "SAVED IN THIS PAGE";
  world.emit("success", "note-card");
});
document.querySelector("#new-note").addEventListener("click", () => {
  document.querySelector("#personal-note").focus();
  document.querySelector("#personal-note").select();
});
world.bind({
  id: "task-celebration",
  on: ["success"],
  priority: 80,
  policy: "replace",
  create: (event) => {
    let elapsed = 0;
    return {
      update: (dt) => {
        elapsed += dt;
        if (elapsed < 0.1) world.physics.impulse(event.target, { z: 15 });
        return elapsed > 0.2;
      },
    };
  },
});
world.use({
  name: "pip-status",
  setup() {
    let frame = 0;
    const draw = () => {
      document.querySelector("#pip-state").textContent =
        `PIP IS ${pip.pose.state === "idle" ? "TAKING IT IN" : pip.pose.state === "climb" ? "CLIMBING UP" : ({ walk: "WALKING", jump: "JUMPING", slide: "SLIDING", grab: "HOLDING ON", land: "LANDING" }[pip.pose.state] ?? "EXPLORING")}`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  },
});
