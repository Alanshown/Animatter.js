export { createWorld, AnimatterWorld } from "./world.js";
export type { WorldOptions, WorldStats } from "./world.js";
export * from "./types.js";
export { materials, resolveMaterial } from "./materials.js";
export { PhysicsEngine } from "./physics/engine.js";
export type { Body, DistanceConstraint } from "./physics/engine.js";
export { SpatialRegistry } from "./spatial/registry.js";
export type { Surface } from "./spatial/registry.js";
export { InteractionArbiter } from "./interaction/arbiter.js";
export type { BehaviorTask, TaskResult } from "./interaction/arbiter.js";
export { InteractionGraph } from "./interaction/graph.js";
export type { GraphRule } from "./interaction/graph.js";
export { BehaviorPlanner } from "./actor/planner.js";
export type { Trajectory } from "./actor/planner.js";
export { ActorRuntime } from "./actor/runtime.js";
export type { ActorOptions } from "./actor/runtime.js";
export { SVGActorRenderer } from "./renderers/actor-svg.js";
export { CanvasActorRenderer } from "./renderers/actor-canvas.js";
export { devtools } from "./devtools/index.js";

export { radialField, orbitalField } from "./physics/fields.js";
export type { ForceField, FieldContext } from "./physics/fields.js";

export { MotionMixer } from "./actor/motion.js";
export type { ActorState } from "./actor/motion.js";
export { sequence } from "./interaction/composition.js";
export type {
  BehaviorBinding,
  SequenceStep,
} from "./interaction/composition.js";

export { FieldRenderer } from "./renderers/field.js";
export type { SurfaceRenderer } from "./renderers/protocol.js";
export { presets, definePreset, registerPreset, presetNames, validatePresetOptions, materialRanges } from "./presets/catalog.js";
export type { PresetName } from "./presets/catalog.js";
export { parseDeclarative } from "./presets/declarative.js";
export type { DeclarativeSpec, DeclarativeErrorHandler } from "./presets/declarative.js";
export type {
  Disposer,
  ConflictPolicy,
  EnhancementHandle,
  EnhancementPatch,
  MaterialTarget,
  PresetContext,
  PresetDefinition,
  PresetGroup,
  PresetInput,
  PresetOptions,
  Target,
} from "./presets/types.js";
