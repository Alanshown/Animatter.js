import type { AnimatterWorld, WorldSystem } from "../world.js";
import { claimStyle } from "../style-ownership.js";
import { segmentText } from "./segment.js";

export type KineticMode = "elastic" | "magnetic" | "wave" | "gravity" | "velocity";

export interface KineticTextOptions {
  mode?: KineticMode;
  /** 0 to 2. Scales spring stiffness, wave amplitude and pointer influence. Default 1. */
  strength?: number;
  /** Text longer than this (in graphemes) renders as plain text with no per-letter motion. Default 160. */
  maxLetters?: number;
  /** Pointer influence radius for magnetic and elastic modes, CSS px. Default 140. */
  radius?: number;
}

export interface KineticTextHandle {
  readonly fallback: boolean;
  letterCount(): number;
  setText(text: string): void;
  setMode(mode: KineticMode): void;
  /** Gives every letter a random outward velocity. */
  scatter(): void;
  /** Springs every letter back to its resting position. */
  reform(): void;
  remeasure(): void;
  destroy(): void;
}

const MODES: readonly KineticMode[] = ["elastic", "magnetic", "wave", "gravity", "velocity"];
const GRAVITY = 900; // px/s^2
const BREAKABLE = /^(?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Extended_Pictographic})/u;
const FLOOR_BOUNCE = 0.35;
const BASE_STIFFNESS = 180;
const BASE_DAMPING = 14;

interface Letter {
  el: HTMLElement;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  skew: number;
  release: () => void;
  transform: string;
}

let kineticSerial = 0;

/**
 * Kinetic typography. Letters are grapheme clusters (Intl.Segmenter), rendered as inline-block
 * spans with aria-hidden. The original text stays in a visually hidden node so assistive
 * technology reads it once, as written. The controller is the single writer of `transform` on
 * its letter spans. Physics runs on the world clock; reduced motion keeps letters at rest.
 */
export function createKineticText(
  world: AnimatterWorld,
  element: HTMLElement,
  options: KineticTextOptions = {},
): KineticTextHandle {
  const maxLetters = options.maxLetters ?? 160;
  const radius = options.radius ?? 140;
  let mode: KineticMode = options.mode ?? "elastic";
  const strength = options.strength ?? 1;
  if (!MODES.includes(mode)) throw new RangeError(`Unknown kinetic mode: ${mode}`);
  if (!Number.isFinite(strength) || strength < 0 || strength > 2)
    throw new RangeError("strength must be between 0 and 2");

  const owner = `kinetic-text#${++kineticSerial}`;
  const originalHtml = element.innerHTML;
  let letters: Letter[] = [];
  let fallback = false;
  let destroyed = false;
  let text = element.textContent ?? "";
  let wrapper: HTMLElement | null = null;
  let scatterPending = false;
  let reforming = false;
  let pointer: { x: number; y: number; vx: number; vy: number } | null = null;
  let observer: ResizeObserver | null = null;
  let floorY = 0;
  let reformRemaining = 0;

  const clearLetters = () => {
    for (const letter of letters) {
      letter.release();
      letter.el.style.transform = "";
    }
    letters = [];
  };

  // Resting positions come from word boxes (which never carry transforms) plus each letter's
  // offset inside its word, so displaced letters never feed back into their own home.
  const measure = () => {
    if (!wrapper) return;
    const origin = element.getBoundingClientRect();
    const left = origin.left + element.clientLeft;
    const top = origin.top + element.clientTop;
    floorY = Math.max(0, element.clientHeight);
    for (const letter of letters) {
      const box = letter.el.parentElement!.getBoundingClientRect();
      letter.homeX = box.left - left + letter.el.offsetLeft;
      letter.homeY = box.top - top + letter.el.offsetTop;
    }
  };


  const build = (value: string) => {
    clearLetters();
    text = value;
    element.innerHTML = "";
    const sr = document.createElement("span");
    sr.textContent = value;
    Object.assign(sr.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap",
    });
    element.append(sr);
    const parts = segmentText(value);
    fallback = parts.length > maxLetters;
    element.dataset.amKinetic = fallback ? "fallback" : mode;
    if (fallback) {
      wrapper = null;
      element.append(document.createTextNode(value));
      return;
    }
    wrapper = document.createElement("span");
    wrapper.setAttribute("aria-hidden", "true");
    element.append(wrapper);
    // Words stay together in nowrap word boxes so a line never breaks inside a word.
    // Han, kana and emoji get their own boxes, so CJK text still wraps between characters.
    let word: HTMLElement | null = null;
    for (const part of parts) {
      if (part === "\n") {
        wrapper.append(document.createElement("br"));
        word = null;
        continue;
      }
      if (/^\s$/u.test(part)) {
        wrapper.append(document.createTextNode(part));
        word = null;
        continue;
      }
      const breakable = BREAKABLE.test(part);
      if (!word || breakable) {
        word = document.createElement("span");
        Object.assign(word.style, { display: "inline-block", whiteSpace: "nowrap", position: "relative" });
        wrapper.append(word);
      }
      const el = document.createElement("span");
      el.textContent = part;
      el.dataset.amLetter = "";
      Object.assign(el.style, { display: "inline-block", whiteSpace: "pre" });
      word.append(el);
      if (breakable) word = null;
      letters.push({
        el,
        homeX: 0,
        homeY: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        skew: 0,
        release: claimStyle(el, "transform", owner),
        transform: "",
      });
    }
    measure();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!wrapper) return;
    const r = wrapper.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    if (pointer) {
      pointer.vx = x - pointer.x;
      pointer.vy = y - pointer.y;
    } else {
      pointer = { x, y, vx: 0, vy: 0 };
    }
    pointer.x = x;
    pointer.y = y;
  };
  const onPointerLeave = () => {
    pointer = null;
  };

  const onStep = (letter: Letter, dt: number, px: number, py: number) => {
    let stiffness = BASE_STIFFNESS * strength;
    let damping = BASE_DAMPING;
    if (reforming) {
      stiffness *= 2;
      damping *= 1.5;
    }
    const ax = -stiffness * letter.x - damping * letter.vx;
    let ay = -stiffness * letter.y - damping * letter.vy;
    let accX = ax;
    if (mode === "gravity" && !reforming) ay += GRAVITY * strength;
    if (pointer && (mode === "magnetic" || mode === "elastic")) {
      const dx = px - letter.homeX - letter.x;
      const dy = py - letter.homeY - letter.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        const falloff = 1 - Math.sqrt(d2) / radius;
        if (mode === "magnetic") {
          accX += dx * 6 * falloff * strength;
          ay += dy * 6 * falloff * strength;
        } else {
          letter.vx += pointer.vx * 0.6 * falloff * strength;
          letter.vy += pointer.vy * 0.6 * falloff * strength;
        }
      }
    }
    letter.vx += accX * dt;
    letter.vy += ay * dt;
    letter.x += letter.vx * dt;
    letter.y += letter.vy * dt;
    if (mode === "gravity" && floorY > 0) {
      const limit = floorY - letter.homeY;
      if (letter.y > limit) {
        letter.y = limit;
        letter.vy = -Math.abs(letter.vy) * FLOOR_BOUNCE;
      }
    }
    if (!Number.isFinite(letter.x) || !Number.isFinite(letter.y)) {
      letter.x = 0;
      letter.y = 0;
      letter.vx = 0;
      letter.vy = 0;
    }
    letter.skew = mode === "velocity" ? Math.max(-0.4, Math.min(0.4, letter.vx * 0.002 * strength)) : 0;
  };

  const system: WorldSystem = {
    name: owner,
    fixedStep(dt: number) {
      if (destroyed || fallback || !letters.length) return;
      if (world.stats().reducedMotion) return;
      const h = Math.min(dt, 1 / 30);
      const px = pointer ? pointer.x : 0;
      const py = pointer ? pointer.y : 0;
      if (scatterPending) {
        scatterPending = false;
        for (const letter of letters) {
          letter.vx += (Math.random() - 0.5) * 900 * strength;
          letter.vy += -Math.random() * 600 * strength;
        }
      }
      if (reformRemaining > 0) reformRemaining = Math.max(0, reformRemaining - h);
      if (reformRemaining === 0) reforming = false;
      for (const letter of letters) onStep(letter, h, px, py);
      if (pointer) {
        pointer.vx *= 0.8;
        pointer.vy *= 0.8;
      }
    },
    frame() {
      if (destroyed || fallback || !letters.length) return;
      const reduced = world.stats().reducedMotion;
      const now = performance.now() / 1000;
      for (let i = 0; i < letters.length; i++) {
        const letter = letters[i]!;
        const wave = mode === "wave" && !reduced ? Math.sin(now * 3 + i * 0.45) * 10 * strength : 0;
        const x = reduced ? 0 : letter.x;
        const y = reduced ? 0 : letter.y + wave;
        const skew = reduced ? 0 : letter.skew;
        const transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) skewX(${(skew * 57.2958).toFixed(2)}deg)`;
        if (transform !== letter.transform) {
          letter.transform = transform;
          letter.el.style.transform = transform;
        }
      }
    },
    destroy() {
      clearLetters();
    },
  };
  const detach = world.attach(system);

  build(text);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerleave", onPointerLeave);
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => measure());
    observer.observe(element);
  }

  return {
    get fallback() {
      return fallback;
    },
    letterCount: () => letters.length,
    setText(value: string) {
      if (destroyed) throw new Error("Kinetic text has been destroyed");
      build(value);
    },
    setMode(next: KineticMode) {
      if (!MODES.includes(next)) throw new RangeError(`Unknown kinetic mode: ${next}`);
      mode = next;
      element.dataset.amKinetic = fallback ? "fallback" : mode;
    },
    scatter() {
      if (!fallback) {
        scatterPending = true;
        reforming = false;
        reformRemaining = 0;
      }
    },
    reform() {
      if (fallback) return;
      reforming = true;
      reformRemaining = 0.9;
    },
    remeasure() {
      measure();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onPointerLeave);
      observer?.disconnect();
      detach();
      clearLetters();
      element.innerHTML = originalHtml;
          delete element.dataset.amKinetic;
    },
  };
}

