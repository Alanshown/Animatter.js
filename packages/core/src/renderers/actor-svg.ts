import type { ActorPose, ActorRenderer } from "../types.js";
export class SVGActorRenderer implements ActorRenderer {
  private element: HTMLDivElement | null = null;
  constructor(private color = "#d8ff62") {}
  mount(host: HTMLElement): void {
    const el = document.createElement("div");
    el.className = "am-actor";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;left:0;top:0;width:64px;height:64px;pointer-events:none;z-index:2147483000;transform-origin:50% 85%;";
    el.innerHTML = `<svg viewBox="0 0 80 80" width="64" height="64" fill="none"><ellipse data-shadow cx="40" cy="73" rx="23" ry="4" fill="#000" opacity=".18"/><g data-body><path d="M17 29 20 9 33 21Q44 17 52 22L65 12 64 35Q78 62 57 68Q27 76 14 60Q6 47 17 29Z" fill="${this.color.replace(/[^a-zA-Z0-9#(),.% -]/g, "")}" stroke="currentColor" stroke-width="2"/><g data-eyes><ellipse cx="30" cy="43" rx="4" ry="6" fill="#1d2627"/><ellipse cx="52" cy="43" rx="4" ry="6" fill="#1d2627"/></g><path d="M36 55Q41 60 47 54" stroke="#1d2627" stroke-width="2.5" stroke-linecap="round"/><path d="m19 63-5 6m47-7 5 5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></g></svg>`;
    host.append(el);
    this.element = el;
  }
  render(pose: Readonly<ActorPose>): void {
    if (!this.element) return;
    const eyes = this.element.querySelector("[data-eyes]");
    eyes?.setAttribute(
      "transform",
      `translate(${pose.gaze.x * 2},${pose.gaze.y * 2})`,
    );
    const speed = Math.hypot(pose.velocity.x, pose.velocity.y),
      stretch = Math.min(0.18, speed * 0.0002),
      land = pose.weights.land * 0.15 * (1 - pose.blend);
    this.element.style.transform = `translate3d(${pose.position.x - 32}px,${pose.position.y - 61}px,${pose.position.z}px) scale(${pose.facing * (1 - stretch + land)},${1 + stretch - land}) rotate(${Math.max(-18, Math.min(18, pose.velocity.x * 0.02))}deg)`;
    this.element.dataset.state = pose.state;
  }
  hitTarget(): HTMLElement | null {
    return this.element;
  }
  destroy(): void {
    this.element?.remove();
    this.element = null;
  }
}
