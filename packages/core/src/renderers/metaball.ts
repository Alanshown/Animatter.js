import type { AnimatterWorld, WorldSystem } from "../world.js";

/**
 * Metaball renderer (Canvas2D). Visual fusion only: blobs add a scalar field and the renderer
 * draws its iso-surface. It does not simulate merging or splitting bodies, and it is not a
 * physical fluid. Work is done per field cell on a low-resolution grid, then scaled up by CSS.
 */
export interface MetaBlob {
  x: number;
  y: number;
  r: number;
}

export interface MetaballOptions {
  /** Field cell size in CSS px. Larger is faster and blockier. 2 to 8. Default 3. */
  cell?: number;
  /** Iso threshold. Larger shrinks the visible surface. 0.3 to 3. Default 1. */
  threshold?: number;
  /** Fill colour as [r, g, b]. Default teal. */
  color?: [number, number, number];
}

export interface MetaballCanvas {
  readonly canvas: HTMLCanvasElement;
  setBlobs(blobs: readonly MetaBlob[]): void;
  /** Last field evaluation time in ms, averaged over the last 60 frames. */
  averageFrameMs(): number;
  /** Number of field cells evaluated per frame. */
  cellCount(): number;
  destroy(): void;
}

let metaSerial = 0;

export function evaluateField(
  blobs: readonly MetaBlob[],
  width: number,
  height: number,
  cell: number,
  out: Float32Array,
): void {
  out.fill(0);
  const gw = width;
  for (const b of blobs) {
    if (!(b.r > 0) || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.r)) continue;
    const r2 = b.r * b.r;
    // Only cells inside a 4r box contribute meaningfully. Outside, the term is below 1/16.
    const reach = b.r * 4;
    const x0 = Math.max(0, Math.floor((b.x - reach) / cell));
    const x1 = Math.min(width - 1, Math.ceil((b.x + reach) / cell));
    const y0 = Math.max(0, Math.floor((b.y - reach) / cell));
    const y1 = Math.min(height - 1, Math.ceil((b.y + reach) / cell));
    for (let gy = y0; gy <= y1; gy++) {
      const py = gy * cell + cell / 2 - b.y;
      const row = gy * gw;
      for (let gx = x0; gx <= x1; gx++) {
        const px = gx * cell + cell / 2 - b.x;
        out[row + gx] = out[row + gx]! + r2 / (px * px + py * py + 1e-3);
      }
    }
  }
}

/** Creates a metaball canvas inside host. host should be positioned (relative/absolute). */
export function createMetaballCanvas(
  world: AnimatterWorld,
  host: HTMLElement,
  options: MetaballOptions = {},
): MetaballCanvas {
  const cell = options.cell ?? 3;
  const threshold = options.threshold ?? 1;
  const [cr, cg, cb] = options.color ?? [46, 108, 140];
  if (!Number.isFinite(cell) || cell < 2 || cell > 8) throw new RangeError("cell must be in [2, 8]");
  if (!Number.isFinite(threshold) || threshold < 0.3 || threshold > 3) throw new RangeError("threshold must be in [0.3, 3]");
  const name = `metaball#${++metaSerial}`;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  let blobs: MetaBlob[] = [];
  let gw = 0;
  let gh = 0;
  let field = new Float32Array(0);
  let image: ImageData | null = null;
  let destroyed = false;
  const times: number[] = [];

  const resize = () => {
    const w = Math.max(1, Math.ceil(host.clientWidth / cell));
    const h = Math.max(1, Math.ceil(host.clientHeight / cell));
    if (w === gw && h === gh) return;
    gw = w;
    gh = h;
    canvas.width = w;
    canvas.height = h;
    field = new Float32Array(w * h);
    image = ctx.createImageData(w, h);
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);

  const system: WorldSystem = {
    name,
    frame() {
      if (destroyed || !image) return;
      const t0 = performance.now();
      // Field coordinates are host CSS px; blobs are given in those units.
      evaluateField(blobs, gw, gh, cell, field);
      const data = image.data;
      const lo = threshold - 0.15;
      const span = 0.3;
      for (let i = 0; i < field.length; i++) {
        const t = Math.min(1, Math.max(0, (field[i]! - lo) / span));
        const alpha = t * t * (3 - 2 * t);
        const k = i * 4;
        data[k] = cr;
        data[k + 1] = cg;
        data[k + 2] = cb;
        data[k + 3] = alpha * 255;
      }
      ctx.putImageData(image, 0, 0);
      times.push(performance.now() - t0);
      if (times.length > 60) times.shift();
    },
    destroy() {
      destroyed = true;
    },
  };
  const detach = world.attach(system);

  return {
    canvas,
    setBlobs(next) {
      if (destroyed) throw new Error("Metaball canvas has been destroyed");
      for (const b of next) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.r))
          throw new RangeError("blob values must be finite");
      }
      blobs = next.slice();
    },
    averageFrameMs() {
      if (!times.length) return 0;
      return times.reduce((a, b) => a + b, 0) / times.length;
    },
    cellCount: () => gw * gh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      detach();
      canvas.remove();
    },
  };
}
