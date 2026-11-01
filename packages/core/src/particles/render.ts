import type { ParticleSim } from "./sim.js";

export type ParticleRendererKind = "webgl2" | "canvas2d";

export interface ParticleRenderer {
  readonly kind: ParticleRendererKind;
  /** True while a WebGL context is lost. The simulation keeps running; drawing is skipped. */
  isLost(): boolean;
  resize(width: number, height: number, dpr: number): void;
  draw(sim: ParticleSim, size: number): void;
  destroy(): void;
}

export const PALETTE_CSS = ["#2b7a8c", "#d1603d", "#6c5ce7"] as const;

/** Canvas2D renderer: works everywhere, slower at high counts. Supports trails. */
export class Canvas2DParticleRenderer implements ParticleRenderer {
  readonly kind = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private destroyed = false;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly trail: number,
    private readonly background: string,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }
  isLost(): boolean {
    return false;
  }
  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, width, height);
  }
  draw(sim: ParticleSim, size: number): void {
    if (this.destroyed) return;
    const ctx = this.ctx;
    // Trails: fade the previous frame instead of clearing. trail 0 clears fully.
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.background;
    ctx.globalAlpha = this.trail > 0 ? 1 - this.trail : 1;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
    for (let p = 0; p < 3; p++) {
      ctx.fillStyle = PALETTE_CSS[p]!;
      for (let i = 0; i < sim.capacity; i++) {
        if (sim.alive[i] === 0 || sim.hue[i] !== p) continue;
        ctx.fillRect(sim.x[i]! - size / 2, sim.y[i]! - size / 2, size, size);
      }
    }
  }
  destroy(): void {
    this.destroyed = true;
    this.canvas.remove();
  }
}

/**
 * WebGL2 renderer: one POINTS draw per frame from an interleaved Float32Array (x, y, hue).
 * Handles webglcontextlost / webglcontextrestored by rebuilding GPU objects on restore.
 * Trails are not supported here; use the Canvas2D renderer when trails are needed.
 */
export class WebGL2ParticleRenderer implements ParticleRenderer {
  readonly kind = "webgl2" as const;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uSize: WebGLUniformLocation | null = null;
  private data = new Float32Array(0);
  private lost = false;
  private width = 1;
  private height = 1;
  private destroyed = false;
  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.releaseGpu();
  };
  private readonly onRestored = () => {
    this.lost = false;
    this.initGpu();
  };

  constructor(readonly canvas: HTMLCanvasElement, private readonly background: string) {
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.initGpu();
  }

  static supported(): boolean {
    try {
      const probe = document.createElement("canvas");
      return !!probe.getContext("webgl2");
    } catch {
      return false;
    }
  }

  isLost(): boolean {
    return this.lost;
  }

  private initGpu(): void {
    const gl = this.gl;
    if (!gl || this.destroyed) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.bindAttribLocation(program, 1, "a_hue");
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL link failed: ${log}`);
    }
    this.program = program;
    this.uResolution = gl.getUniformLocation(program, "u_resolution");
    this.uSize = gl.getUniformLocation(program, "u_size");
    this.buffer = gl.createBuffer();
  }

  private releaseGpu(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.buffer = null;
    this.program = null;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(sim: ParticleSim, size: number): void {
    const gl = this.gl;
    if (!gl || this.lost || this.destroyed || !this.program || !this.buffer) return;
    const n = sim.capacity;
    if (this.data.length !== n * 3) this.data = new Float32Array(n * 3);
    const data = this.data;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      data[k] = sim.alive[i] ? sim.x[i]! : -1e6;
      data[k + 1] = sim.alive[i] ? sim.y[i]! : -1e6;
      data[k + 2] = sim.hue[i]!;
    }
    gl.clearColor(...hexToRgb01(this.background), 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.uniform2f(this.uResolution, this.width, this.height);
    gl.uniform1f(this.uSize, size * (this.canvas.width / this.width));
    gl.drawArrays(gl.POINTS, 0, n);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.releaseGpu();
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.canvas.remove();
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1]!, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

const VERTEX_SOURCE = `#version 300 es
in vec2 a_pos;
in float a_hue;
uniform vec2 u_resolution;
uniform float u_size;
out float v_hue;
void main() {
  vec2 clip = a_pos / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_size;
  v_hue = a_hue;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
in float v_hue;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (dot(p, p) > 1.0) discard;
  vec3 c = v_hue < 0.5 ? vec3(0.169, 0.478, 0.549) : v_hue < 1.5 ? vec3(0.82, 0.376, 0.239) : vec3(0.424, 0.361, 0.906);
  outColor = vec4(c, 1.0);
}
`;
