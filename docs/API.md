# Public API · 0.1.0

The source of truth is `packages/core/src/index.ts` and generated declaration files. All distances are CSS pixels; time passed to simulation/tasks is seconds. `Interaction.time` is monotonic milliseconds. This version is ESM-only. Version 0.1.0 is available from npm; see [release verification](NPM-RELEASE-0.1.0.md).

## Create, register and destroy

```ts
import { createWorld, materials } from 'animatter';
import 'animatter/materials.css'; // optional visual layer
const world = createWorld({
  root: document.querySelector<HTMLElement>('#app')!,
  mode: 'both', material: materials.elastic,
  reducedMotion: 'system',
  regions: [{selector: '.quiet', mode: 'off'}],
  onError: console.error,
});
const unregister = world.register(document.querySelector<HTMLElement>('#card')!, {
  id: 'card', draggable: true, collision: true, plane: 0,
  material: {mass: 2, stiffness: 130, damping: 20},
});
const unscan = world.scan('[data-am]');
world.configure('card', {material: {magnetism: -30}});
// On component unmount: unregister(). On application teardown:
world.destroy();
```

| WorldOptions | Default | Meaning |
| --- | --- | --- |
| root | document.body | Native event and registration boundary |
| mode | field | field / embodied / both / off |
| material | elastic | World physical defaults |
| autoStart | true | Own the rAF clock; false for deterministic manual stepping |
| reducedMotion | system | system / always / never; use never only for explicit user-controlled experiences |
| regions | [] | Last closest-selector match wins; surface options override |
| fieldRenderer | FieldRenderer | Optional SurfaceRenderer implementation |
| onError | console.error | Subscriber, feedback-cycle and frame errors |

`SurfaceOptions`: optional id, mode, material, draggable, collision, plane, capabilities, disabled. IDs are immutable. `register` returns an idempotent unregister function. Duplicate IDs/elements and elements outside root throw. `scan` registers descendant data-am elements and recognizes data-am-drag; call it again for newly created nodes. It is not a mutation-driven component framework. Capabilities are queryable with graph.supports and do not cancel native input.

| Method | Return / behavior |
| --- | --- |
| configure(id, patch) | Update physical and presentation options |
| invalidate() | Invalidate cached geometry after external layout changes |
| layout(() => mutateDOM()) | Synchronous layout transaction with spring continuity |
| setMode(mode), currentMode | Change/read global presentation gate; region rules remain explicit |
| setEnabled(boolean) | Restore/reapply effects without removing business DOM |
| start(), stop(), step(dt) | Clock control; stop before manual stepping |
| stats() | Surface/body/actor/task/subscriber counts and measured frame work |
| destroy() | Idempotent complete teardown; new operations subsequently throw |
| reducedMotion | Current resolved reduced-motion preference |

## Semantic interactions

```ts
const off = world.on(event => console.log(event.type, event.level, event.target));
world.emit('tabs', 'tab-a', {selected: 'details'});
await world.track(fetch('/api/data').then(r => r.json()), 'card', abort.signal);
await world.transition('tooltip', true);
off();
```

`Interaction` has type, level, target (id or null), time, source, point, velocity, data and originalEvent (Event or null). Sources are pointer / keyboard / touch / application / system. Native drag carries dx/dy; dragend carries cancelled. Gesture carries relative scale between consecutive two-pointer samples. Scroll carries dx/dy and scroll velocity. Synthetic application events default to a zero point; supply application context in data rather than treating them as physical cursor input.

| Level | Intents |
| --- | --- |
| L0 | pointer, hover, enter, leave, proximity |
| L1 | tooltip, annotation, cursor, focus, blur |
| L2 | click, doubleclick, longpress, dragstart, drag, dragend, gesture |
| L3 | input, selection, copy, delete, expand |
| L4 | button, card, form, menu, list, accordion |
| L5 | scroll, layout, modal, overlay, viewport |
| L6 | navigation, tabs, routing, transition |
| L7 | loading, success, error, notification, async |

L7 and router-specific state must be emitted/bridged by the application. `track` emits loading then latest valid success/error and returns/rethrows the original result. Abort suppresses stale events; it does not itself cancel fetch. `transition(id, visible)` spring-animates presence with material parameters and intentionally changes element.hidden; it returns completed/cancelled. Use native dialogs, keyboard menus and aria attributes in the application.

## Graph, priorities and composition

```ts
import { sequence } from 'animatter';
const disconnect = world.graph.connect({
  from: 'save', on: ['click', 'success'], to: 'card',
  effect: (_, target) => world.physics.impulse(target, {y: -100}),
});
const unbind = world.bind({
  id: 'save-feedback', on: ['click', 'success'], target: 'save',
  combine: {events: ['click', 'success'], within: 3000},
  channel: 'save-feedback', priority: 70, policy: 'replace',
  create: () => sequence([
    {duration: .15, update: progress => { /* your own renderer */ }},
    {wait: () => Promise.resolve()},
  ]),
});
```

`bind` filters on/target/when, optionally waits for all combine events on the same target, then creates a task. queue is default; replace cancels that channel before inserting. Use a unique binding id; unbind disposes subscriptions and owned tasks.

`InteractionArbiter.enqueue({id,channel,priority,update,pause?,resume?,cancel?,signal?})` returns Promise<'completed'|'cancelled'>. update(dt) returns true at completion. Equal priorities are FIFO; higher numbers preempt; independent channels tick concurrently. `tick`, `cancel`, `cancelChannel`, `clear`, `size`, `snapshot` support deterministic orchestration. A resumed actor trajectory replans from its current location. Do not reuse IDs or throw from lifecycle hooks. Failures still release scheduler entries and propagate.

`sequence(steps)` returns update/cancel hooks. Steps are `{duration, update?(progress,dt)}` or `{wait:()=>Promise}`. Cancellation prevents subsequent steps. A wait already in progress needs application-owned cancellation if applicable.

## Actors and renderers

```ts
import { SVGActorRenderer, CanvasActorRenderer } from 'animatter';
const actor = world.addActor('pip', {
  renderer: new SVGActorRenderer('#bdca90'),
  position: {x: 100, y: 150, z: 0}, draggable: true,
  idle: true, idleDelay: 5, blendDuration: .14,
  actions: {jump: {speed: 1.2}, climb: {speed: .8}},
  reactTo: ['enter', 'click', 'focus', 'success'],
  onLand: id => console.log('landed', id),
});
await actor.moveTo('card', {kind: 'jump', priority: 80, signal: abort.signal});
actor.snap('card');
world.removeActor('pip');
```

Actor states: idle, walk, jump, slide, grab, climb, land. `moveTo` supports top (default), center, bottom, left or right anchor. Disabled/off/field-only surfaces do not accept embodied motion. Higher-priority user reactions preempt idle work, which can resume afterwards. Idle is opt-in. `reactTo: []` disables automatic semantic reactions. Read pose for position, velocity, state, blend progress, normalized action weights, facing, gaze and elapsed time. Call lookAt/interrupt/suspend for explicit control. snap moves without a landing callback. During reduced motion semantic reactions and moveTo snap and retain onLand result handling.

Implement `ActorRenderer`: mount(host), render(pose), destroy(); optionally hitTarget() for draggable actors. Included CanvasActorRenderer takes an optional color, like SVGActorRenderer. Renderers own only their mounted nodes. The pose is an observation; do not mutate it in renderer code.

`BehaviorPlanner.plan(from,to,obstacles?,kind?,surface?,bounds?)` returns from/to/duration/height/kind. `sample(path,t)` is pure. MotionMixer exposes transition/tick/weights/state/progress; custom renderers can use normalized weights.

## Materials, fields and solver

```ts
world.configure('card', {material: {
  mass: 1.4, stiffness: 85, damping: 11, restitution: .4,
  magnetism: 48, radius: 280, maxDisplacement: 38,
  depth: 18, softness: .85, gravity: 0,
}});
const remove = world.addField({id:'wind', sample: ({body,active}) => ({x:active ? 60*body.material.mass : 0})});
world.physics.constraints.add({a:'card',b:'button',distance:120,stiffness:.02});
```

Presets: elastic, liquid, heavy, magnetic. All material values must be finite; mass/radius positive, damping/stiffness nonnegative, restitution/softness within [0,1], depth/maxDisplacement nonnegative. Magnetism can be negative for repulsion. CSS tokens use kebab case, e.g. `--am-max-displacement:40`, `--am-softness:.8`; values are read during register. JS configuration overrides CSS. Optional `data-am-material` CSS selectors provide visual/physical defaults. Visual classes am-surface and am-liquid are optional.

ForceField.sample receives body, surface, point, decaying pointer velocity, active and time. Return force x/y/z components, all finite. radialField(id,strength,radius) and orbitalField(id,strength,radius) are included. Removing a field is idempotent. Negative strength reverses direction.

PhysicsEngine supports create/remove/impulse/step/reset, bodies, constraints, and optional bounds rectangle. Body includes material, position/velocity/target/force, origin, size, pinned/collision/sleeping and internal temporary motionLimit. Solver step clamps to 1/60; worlds supply fixed 1/120 substeps. Bounds are viewport-space rectangles. Geometry and physics are public for debugging/advanced behavior; corrupting those objects can invalidate guarantees.

## Plugins, debugging and framework adapters

`world.use({name, setup(world) { return cleanup; }})` installs once per name and returns a disposer. world.use(devtools()) adds a read-only spatial overlay, bounded event log and live stats; its disposer removes everything. Register custom behavior bindings and field/actor renderers through the public protocols above.

React: useAnimatter(options) returns {ref,world}; put ref on a div. useSurface<T>(world,stableOptions) returns a ref. Vue: useAnimatter(rootRef,options) returns a shallow world ref; useSurface(worldRef,elementRef,options) handles registration and cleanup. Both create only on client mount and tolerate normal unmount. React StrictMode is exercised in browser tests. Options are captured at initial world mount; use setMode/configure for live updates. Keep React surface options stable to avoid unnecessary re-registration. Explicitly register dynamic content; do not assume scan observes virtual DOM changes.

A custom field renderer can be passed as `WorldOptions.fieldRenderer`. Implement the exported `SurfaceRenderer` protocol (mount, activate, restore, unmount, event, setPresence, render, destroy), or subclass `FieldRenderer`. Restoring authored state is part of this protocol. During world destruction, one faulty plugin/renderer cleanup is reported without preventing disposal of the remaining resources.

Climb trajectories include waypoints derived from the target rectangle: approach the nearest side, ascend along it, then move onto the top anchor. Grab defaults to the nearer left/right anchor; slide uses inertial ease-out timing. These are procedural UI actions, not articulated limb simulation.

The world manages `physics.enabled` so direct impulses and manual solver steps cannot bypass disabled/off/system-reduced-motion states. A standalone PhysicsEngine starts enabled. Actor moveTo resolves cancelled when its world is disabled or does not enable embodied presentation. Viewport-constrained jump plans cap screen-space height and use a depth arc to pass in front of obstacles when needed. Climbing and offscreen destinations remain heuristic rather than globally collision-free pathfinding.

A moving target is replanned against the remaining active travel budget, so persistent small oscillations cannot starve arrival. Pausing/resuming an actor starts a fresh route from its current position; time spent preempted does not consume movement time.
