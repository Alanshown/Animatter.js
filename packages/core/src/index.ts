export { createWorld, AnimatterWorld } from "./world.js";
export type { WorldOptions, WorldStats, WorldSystem } from "./world.js";
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

// v0.3: liquid dock, kinetic typography, style ownership, Lab scene schema
export { createLiquidDock } from "./dock/liquid-dock.js";
export type { LiquidDockOptions, LiquidDockHandle } from "./dock/liquid-dock.js";
export {
  proximityScale,
  springStep,
  reorderIds,
  nearestSlot,
  keyboardTarget,
} from "./dock/model.js";
export type { DockOrientation, Spring1D } from "./dock/model.js";
export { createKineticText } from "./typography/kinetic.js";
export type { KineticMode, KineticTextOptions, KineticTextHandle } from "./typography/kinetic.js";
export { segmentText } from "./typography/segment.js";
export { claimStyle, styleOwner } from "./style-ownership.js";
export {
  parseScene,
  serializeScene,
  SCENE_SCHEMA_VERSION,
  SCENE_MAX_ENTITIES,
  SCENE_RENDERERS,
} from "./scene/schema.js";
export type { SceneDocument, SceneEntity, SceneParseResult, SceneRendererKind } from "./scene/schema.js";

// v0.4: rope / tether, soft body, metaball renderer
export { createRope, elementAnchor, mountRopeSvg } from "./rope/rope.js";
export type { RopeHandle, RopeOptions, RopeEnd, AnchorTarget, Point } from "./rope/rope.js";
export { RopeSolver, normaliseRopeOptions, ROPE_LIMITS } from "./rope/solver.js";
export type { RopeSolverOptions } from "./rope/solver.js";
export { createSoftBody, linkSoftBodyContacts, normaliseSoftBodyOptions, polygonArea, SOFT_BODY_LIMITS } from "./softbody/body.js";
export type { SoftBody, SoftBodyOptions, Obstacle } from "./softbody/body.js";
export { createMetaballCanvas, evaluateField } from "./renderers/metaball.js";
export type { MetaBlob, MetaballCanvas, MetaballOptions } from "./renderers/metaball.js";

// v0.6: actor behaviours
export { BehaviourMachine, attachActorBehaviour, BEHAVIOUR_PROFILES } from "./actor/behaviours.js";
export type {
  BehaviourSignal,
  BehaviourState,
  BehaviourCommand,
  BehaviourProfile,
  BehaviourMemory,
  BehaviourContext,
  ActorBehaviourHandle,
} from "./actor/behaviours.js";
export { createCanvasKinetic, layoutGlyphs } from "./typography/canvas.js";
export type { CanvasKineticHandle, CanvasKineticOptions } from "./typography/canvas.js";
