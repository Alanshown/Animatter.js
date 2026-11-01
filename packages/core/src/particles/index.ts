// Optional GPU/Canvas particle entry. Not re-exported from the core index, so the core bundle
// stays free of particle code. Consumers import dist/particles.js (or this module in source form).
export { addParticleSystem } from "./system.js";
export type { ParticleSystemHandle, ParticleSystemOptions, ParticleBehavior } from "./system.js";
export { ParticleSim, PARTICLE_LIMITS } from "./sim.js";
export type { FieldSpec, FieldKind, FlowSpec } from "./sim.js";
export { Canvas2DParticleRenderer, WebGL2ParticleRenderer } from "./render.js";
export type { ParticleRenderer, ParticleRendererKind } from "./render.js";
