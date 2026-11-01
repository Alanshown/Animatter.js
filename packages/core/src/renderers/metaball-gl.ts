import type { AnimatterWorld, WorldSystem } from "../world.js";
import type { MetaBlob, MetaballCanvas, MetaballOptions } from "./metaball.js";

/**
 * Metaball renderer on WebGL2. The fragment shader evaluates the same scalar field per device pixel
 * (sum of r^2 / (d^2 + eps)) for up to MAX_BLOBS blobs, and draws the iso-surface with a smoothstep
 * band. It has the same API as createMetaballCanvas so the two can be compared directly.
 * Context loss is handled: drawing pauses while lost and resumes after restore.
 */
export const MAX_BLOBS = 128;

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 u_blobs[${MAX_BLOBS}];
uniform int u_count;
uniform vec2 u_res;      // device px
uniform float u_dpr;
uniform float u_threshold;
uniform vec3 u_color;
out vec4 outColor;
void main() {
  // Work in CSS px with the origin at the top-left, matching the Canvas2D renderer.
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  float f = 0.0;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= u_count) break;
    vec3 b = u_blobs[i];
    vec2 d = p - b.xy;
    f += (b.z * b.z) / (dot(d, d) + 0.001);
  }
  float t = clamp((f - (u_threshold - 0.15)) / 0.3, 0.0, 1.0);
  float a = t * t * (3.0 - 2.0 * t);
  outColor = vec4(u_color * a, a);
}
`;

export function createMetaballGL(
  world: AnimatterWorld,
  host: HTMLElement,
  options: MetaballOptions = {},
): MetaballCanvas {
  const threshold = options.threshold ?? 1;
  if (!Number.isFinite(threshold) || threshold < 0.3 || threshold > 3) throw new RangeError("threshold must be in [0.3, 3]");
  const [cr, cg, cb] = options.color ?? [46, 108, 140];
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
  host.append(canvas);
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) {
    canvas.remove();
    throw new Error("WebGL2 is not available");
  }
  let program: WebGLProgram | null = null;
  let vbo: WebGLBuffer | null = null;
  let uBlobs: WebGLUniformLocation | null = null;
  let uCount: WebGLUniformLocation | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uDpr: WebGLUniformLocation | null = null;
  let uThreshold: WebGLUniformLocation | null = null;
  let uColor: WebGLUniformLocation | null = null;
  let lost = false;
  let destroyed = false;
  let blobs: MetaBlob[] = [];
  const packed = new Float32Array(MAX_BLOBS * 3);
  const times: number[] = [];
  const SAMPLE_EVERY = 30;
  const probe = new Uint8Array(4);
  let frameCount = 0;
  let dpr = 1;

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Metaball shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const init = () => {
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const p = gl.createProgram()!;
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Metaball link: ${gl.getProgramInfoLog(p)}`);
    program = p;
    uBlobs = gl.getUniformLocation(p, "u_blobs");
    uCount = gl.getUniformLocation(p, "u_count");
    uRes = gl.getUniformLocation(p, "u_res");
    uDpr = gl.getUniformLocation(p, "u_dpr");
    uThreshold = gl.getUniformLocation(p, "u_threshold");
    uColor = gl.getUniformLocation(p, "u_color");
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  };
  const release = () => {
    if (vbo) gl.deleteBuffer(vbo);
    if (program) gl.deleteProgram(program);
    vbo = null;
    program = null;
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    release();
  };
  const onRestored = () => {
    lost = false;
    init();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  init();
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);

  const detach = world.attach({
    name: `metaball-gl#${Math.random().toString(36).slice(2, 7)}`,
    frame(): void {
      if (destroyed || lost || !program) return;
      const sample = frameCount++ % SAMPLE_EVERY === 0;
      const t0 = performance.now();
      const n = Math.min(blobs.length, MAX_BLOBS);
      packed.fill(0);
      for (let i = 0; i < n; i++) {
        packed[i * 3] = blobs[i]!.x;
        packed[i * 3 + 1] = blobs[i]!.y;
        packed[i * 3 + 2] = blobs[i]!.r;
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(uBlobs, packed);
      gl.uniform1i(uCount, n);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uThreshold, threshold);
      gl.uniform3f(uColor, cr / 255, cg / 255, cb / 255);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (sample) {
        // gl.finish() does not guarantee GPU completion in every browser. A 1x1 readPixels does,
        // so on sampled frames the time includes the GPU work. Unsampled frames are not synced.
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
        times.push(performance.now() - t0);
        if (times.length > 20) times.shift();
      }
    },
    destroy() {
      destroyed = true;
    },
  } satisfies WorldSystem);

  return {
    canvas,
    setBlobs(next) {
      if (destroyed) throw new Error("Metaball canvas has been destroyed");
      for (const b of next) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.r))
          throw new RangeError("blob values must be finite");
      }
      if (next.length > MAX_BLOBS) console.warn(`[Animatter] metaball GL draws at most ${MAX_BLOBS} blobs; extra blobs are ignored`);
      blobs = next.slice();
    },
    averageFrameMs() {
    // Average over sampled frames (every 30th frame), each synchronised with a 1x1 readPixels.
      return times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    },
    cellCount: () => canvas.width * canvas.height,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      detach();
      release();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
