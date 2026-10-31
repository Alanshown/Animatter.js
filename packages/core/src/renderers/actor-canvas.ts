import type { ActorPose, ActorRenderer } from "../types.js";
/** Small retina-aware canvas renderer, interchangeable with the SVG renderer. */
export class CanvasActorRenderer implements ActorRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  constructor(private color = "#b9adff") {}
  mount(host: HTMLElement): void {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 160;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText =
      "position:fixed;left:0;top:0;width:80px;height:80px;pointer-events:none;z-index:2147483000";
    host.append(c);
    this.canvas = c;
    this.ctx = c.getContext("2d");
  }
  render(pose: Readonly<ActorPose>): void {
    if (!this.canvas || !this.ctx) return;
    this.canvas.style.transform = `translate3d(${pose.position.x - 40}px,${pose.position.y - 70}px,${pose.position.z}px)`;
    const c = this.ctx;
    c.clearRect(0, 0, 160, 160);
    c.fillStyle = this.color;
    c.beginPath();
    c.ellipse(
      80,
      80,
      48 + pose.weights.land * 5,
      45 + Math.min(10, Math.abs(pose.velocity.y) * 0.02),
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.fillStyle = "#20252c";
    for (const x of [62, 99]) {
      c.beginPath();
      c.ellipse(
        x + pose.facing * 2 + pose.gaze.x * 4,
        76 + pose.gaze.y * 4,
        5,
        8,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.lineWidth = 3;
    c.strokeStyle = "#20252c";
    c.beginPath();
    c.arc(82, 87, 13, 0.25, Math.PI - 0.25);
    c.stroke();
  }
  hitTarget(): HTMLElement | null {
    return this.canvas;
  }
  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
