import type { AnimatterWorld, WorldSystem } from "../world.js";
import { segmentText } from "./segment.js";
import type { KineticMode } from "./kinetic.js";

/**
 * Canvas kinetic text. Same semantics as the DOM controller (elastic, magnetic, wave, gravity,
 * velocity; scatter and reform), but glyphs are drawn with fillText on a canvas. Layout is greedy
 * word wrap with measureText, so the canvas can wrap as the DOM does. The original text stays in a
 * visually hidden node for assistive technology. The canvas itself is aria-hidden.
 */
export interface CanvasKineticOptions {
  mode?: KineticMode;
  strength?: number;
  /** Maximum glyph count before the controller refuses to build. Default 400. */
  maxGlyphs?: number;
  color?: string;
}

export interface CanvasKineticHandle {
  readonly canvas: HTMLCanvasElement;
  /** Every grapheme laid out, including spaces (spaces occupy a slot but draw nothing). */
  glyphCount(): number;
  lineCount(): number;
  setText(text: string): void;
  setMode(mode: KineticMode): void;
  scatter(): void;
  reform(): void;
  remeasure(): void;
  destroy(): void;
}

interface Glyph {
  ch: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  skew: number;
}

const MODES: readonly KineticMode[] = ["elastic", "magnetic", "wave", "gravity", "velocity"];
const GRAVITY = 900;
let canvasKineticSerial = 0;

/** Greedy word wrap over graphemes. Returns glyph homes relative to the host content box. */
export function layoutGlyphs(
  parts: readonly string[],
  measure: (s: string) => number,
  maxWidth: number,
  lineHeight: number,
): { glyphs: Array<{ ch: string; x: number; y: number }>; lines: number; height: number } {
  const glyphs: Array<{ ch: string; x: number; y: number }> = [];
  let line = 0;
  let x = 0;
  // Group non-space graphemes into words so a word never breaks mid-word; Han/emoji break freely.
  const words: string[][] = [];
  let current: string[] | null = null;
  for (const part of parts) {
    if (part === "\n") {
      words.push(["\n"]);
      current = null;
      continue;
    }
    if (/^\s$/u.test(part)) {
      words.push([part]);
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      words.push(current);
    }
    current.push(part);
    if (/^\p{Script=Han}|^\p{Extended_Pictographic}/u.test(part)) current = null;
  }
  for (const word of words) {
    if (word.length === 1 && word[0] === "\n") {
      line++;
      x = 0;
      continue;
    }
    const width = word.reduce((sum, g) => sum + measure(g), 0);
    if (x > 0 && x + width > maxWidth && word[0] !== " ") {
      line++;
      x = 0;
    }
    if (word.length === 1 && word[0] === " ") {
      if (x === 0) continue; // no leading space on a line
      x += measure(" ");
      glyphs.push({ ch: " ", x: x - measure(" "), y: line * lineHeight });
      continue;
    }
    for (const g of word) {
      const w = measure(g);
      glyphs.push({ ch: g, x, y: line * lineHeight });
      x += w;
    }
  }
  return { glyphs, lines: line + 1, height: (line + 1) * lineHeight };
}

export function createCanvasKinetic(
  world: AnimatterWorld,
  host: HTMLElement,
  text: string,
  options: CanvasKineticOptions = {},
): CanvasKineticHandle {
  const mode0 = options.mode ?? "elastic";
  if (!MODES.includes(mode0)) throw new RangeError(`Unknown kinetic mode: ${mode0}`);
  const strength = options.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0 || strength > 2) throw new RangeError("strength must be in [0, 2]");
  const maxGlyphs = options.maxGlyphs ?? 400;
  const name = `canvas-kinetic#${++canvasKineticSerial}`;
  let mode = mode0;
  let destroyed = false;
  let glyphs: Glyph[] = [];
  let content = text;
  let fontSpec = "";
  let fontSize = 16;
  let lineHeight = 20;
  let width = 1;
  let height = 1;
  let scatterPending = false;
  let reformRemaining = 0;
  let reforming = false;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { display: "block", maxWidth: "100%" });
  const sr = document.createElement("span");
  Object.assign(sr.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  });
  const originalHtml = host.innerHTML;
  host.innerHTML = "";
  host.append(sr, canvas);
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  const color = options.color ?? getComputedStyle(host).color;

  const readFont = () => {
    const cs = getComputedStyle(host);
    fontSize = parseFloat(cs.fontSize) || 16;
    lineHeight = fontSize * 1.2;
    fontSpec = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    ctx.font = fontSpec;
  };

  const layout = () => {
    readFont();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxWidth = Math.max(10, host.clientWidth || 300);
    const parts = segmentText(content);
    if (parts.length > maxGlyphs) {
      glyphs = [];
      width = maxWidth;
      height = 0;
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.height = "0";
      return;
    }
    ctx.font = fontSpec;
    const result = layoutGlyphs(parts, (s) => ctx.measureText(s).width, maxWidth, lineHeight);
    width = maxWidth;
    height = Math.max(lineHeight, result.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const previous = glyphs;
    glyphs = result.glyphs.map((g, i) => ({
      ch: g.ch,
      homeX: g.x,
      homeY: g.y,
      // Keep displacement across a relayout, so a resize does not jump letters.
      x: previous[i]?.x ?? 0,
      y: previous[i]?.y ?? 0,
      vx: previous[i]?.vx ?? 0,
      vy: previous[i]?.vy ?? 0,
      skew: 0,
    }));
    sr.textContent = content;
  };

  const system: WorldSystem = {
    name,
    fixedStep(dt: number) {
      if (destroyed || !glyphs.length || world.stats().reducedMotion) return;
      const h = Math.min(dt, 1 / 30);
      if (scatterPending) {
        scatterPending = false;
        for (const g of glyphs) {
          g.vx += (Math.random() - 0.5) * 900 * strength;
          g.vy += -Math.random() * 600 * strength;
        }
      }
      if (reformRemaining > 0) reformRemaining = Math.max(0, reformRemaining - h);
      if (reformRemaining === 0) reforming = false;
      let k = 180 * strength;
      let c = 14;
      if (reforming) {
        k *= 2;
        c *= 1.5;
      }
      for (const g of glyphs) {
        let ay = -k * g.y - c * g.vy;
        const ax = -k * g.x - c * g.vx;
        if (mode === "gravity" && !reforming) ay += GRAVITY * strength;
        g.vx += ax * h;
        g.vy += ay * h;
        g.x += g.vx * h;
        g.y += g.vy * h;
        if (mode === "gravity") {
          const limit = height - lineHeight * 0.5 - g.homeY;
          if (g.y > limit) {
            g.y = limit;
            g.vy = -Math.abs(g.vy) * 0.35;
          }
        }
        if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) {
          g.x = 0;
          g.y = 0;
          g.vx = 0;
          g.vy = 0;
        }
        g.skew = mode === "velocity" ? Math.max(-0.4, Math.min(0.4, g.vx * 0.002 * strength)) : 0;
      }
    },
    frame() {
      if (destroyed || !glyphs.length || !ctx) return;
      const reduced = world.stats().reducedMotion;
      const now = performance.now() / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.font = fontSpec;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i]!;
        const wave = mode === "wave" && !reduced ? Math.sin(now * 3 + i * 0.45) * 10 * strength : 0;
        const x = reduced ? 0 : g.x;
        const y = reduced ? 0 : g.y + wave;
        ctx.save();
        ctx.translate(g.homeX + x, g.homeY + y);
        if (g.skew) ctx.transform(1, 0, Math.tan(g.skew), 1, 0, 0);
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
    },
    destroy() {
      glyphs = [];
    },
  };
  const detach = world.attach(system);
  layout();

  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => layout()) : null;
  observer?.observe(host);

  return {
    canvas,
    glyphCount: () => glyphs.length,
    lineCount: () => (glyphs.length ? Math.round(height / lineHeight) : 0),
    setText(next) {
      if (destroyed) throw new Error("Canvas kinetic text has been destroyed");
      content = next;
      layout();
    },
    setMode(next) {
      if (!MODES.includes(next)) throw new RangeError(`Unknown kinetic mode: ${next}`);
      mode = next;
    },
    scatter() {
      scatterPending = true;
      reforming = false;
      reformRemaining = 0;
    },
    reform() {
      reforming = true;
      reformRemaining = 0.9;
    },
    remeasure() {
      layout();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      detach();
      canvas.remove();
      sr.remove();
      host.innerHTML = originalHtml;
    },
  };
}
