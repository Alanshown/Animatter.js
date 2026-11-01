# Presets and Enhance API

`world.enhance(target, presets)` applies one or more presets to surfaces. It is available since the advanced-interaction iteration (v0.2 stage).

```ts
import { createWorld, presets } from "animatter";

const world = createWorld();
const card = world.enhance(".card", presets.elastic({ stiffness: 120 }));
const button = world.enhance(".button", presets.magnetic({ radius: 140 }));
const panel = world.enhance(".panel", [presets.float(), presets.tilt()]);

card.update({ presets: presets.elastic({ stiffness: 90 }) }); // updates in place, no re-registration
card.disable(); // restores the baseline material, keeps the handle
card.enable();
card.destroy(); // releases the layers and any registration this handle created
```

## Targets

- A selector string, resolved inside `world.root`.
- A single `HTMLElement`.
- Any iterable of `HTMLElement`.

Elements that are already registered (for example by `register` or `scan`) are reused and are never unregistered by Enhance. Elements Enhance registers itself are released when the last handle referencing them is destroyed.

## Writing ownership

Presets never write `translate`, `rotate`, or `scale`. Those properties belong to `FieldRenderer`. A preset changes the physics material of its surface, or subscribes to a semantic event. Presets also must not write any DOM style property. The enhance tests enforce this with a style double that throws on write.

## Options and strength

Every preset accepts material keys (`mass`, `stiffness`, `damping`, `restitution`, `magnetism`, `radius`, `maxDisplacement`, `depth`, `softness`, `gravity`) and `strength` in `[0, 2]`, default `1`.

The effective value for a key is `base + (target - base) * strength`, where `base` is the surface material at first enhancement and `target` is the preset value. Values are validated against the ranges below. Unknown keys throw.

| Key | Range |
| --- | --- |
| mass | 0.05 to 20 |
| stiffness | 0 to 2000 |
| damping | 0 to 500 |
| restitution | 0 to 1 |
| magnetism | 0 to 500 |
| radius | 0.1 to 2000 |
| maxDisplacement | 0 to 1000 |
| depth | 0 to 500 |
| softness | 0 to 1 |
| gravity | -5 to 5 |

## Built-in presets

| Preset | Group | Conflict | Defaults | Trigger | Disabled behaviour |
| --- | --- | --- | --- | --- | --- |
| `elastic` | motion | replace | stiffness 240, damping 10, restitution 0.72 | always | baseline restored |
| `snap` | motion | replace | stiffness 320, damping 34, restitution 0.1 | always | baseline restored |
| `inertia` | motion | replace | mass 2.5, damping 6, restitution 0.3 | always | baseline restored |
| `springFollow` | motion | replace | stiffness 55, damping 12, magnetism 48, radius 260 | always | baseline restored |
| `magnetic` | field | replace | magnetism 60, radius 200 | always (field and both modes) | baseline restored |
| `gravity` | gravity | replace | gravity 0.6 | always | baseline restored |
| `float` | depth | stack | depth 24, softness 0.6 | always | baseline restored. No periodic oscillator. |
| `tilt` | depth | stack | softness 0.8, depth 14 | always | baseline restored. Tilt angle is fixed by FieldRenderer. |
| `hoverLift` | depth | stack | depth 36 | `enter` / `leave` on the surface | contribution removed on leave or disable |
| `dragFeedback` | feedback | stack | damping 26, softness 0.5 | `dragstart` / `dragend` on the surface | contribution removed on dragend or disable |
| `collisionFeedback` | feedback | stack | restitution 0.75, collision enabled | always | previous collision flag restored |
| `ripple` | feedback | stack | damping 22 | always | baseline restored. The click ripple is drawn by FieldRenderer. |

`jelly` and `metaball` are intentionally not provided. They depend on the soft-body and metaball modules, which are not part of this release.

## Conflict policies

- `replace` (motion, gravity, field, material groups): the most recent preset in the group supersedes earlier ones. Removing it restores the earlier one.
- `stack` (depth, feedback groups): presets combine. For the same key, the later contribution wins.
- `reject`: a second preset in the same group throws at install time. Available for custom presets through `definePreset`.

## Custom presets

```ts
import { definePreset, registerPreset } from "animatter";

const pulse = definePreset({
  name: "pulse",
  group: "feedback",
  defaults: { damping: 18 },
  activeOn: { start: "dragstart", end: "dragend" },
});
world.enhance(".pulse-card", pulse({ strength: 0.8 }));

registerPreset("pulse", pulse); // makes it available to data-am-preset
```

## Declarative DOM

```html
<div class="card" data-am-preset="elastic magnetic" data-am-strength="0.7"></div>
<div class="tile" data-am-material="liquid"></div>
```

- `data-am-preset`: space-separated preset names from the registry. Unknown names are rejected.
- `data-am-strength`: a non-negative decimal in `[0, 2]`. Applies to each preset listed on the element.
- `data-am-material`: a named material from `materials` (`elastic`, `liquid`, `heavy`, `magnetic`). It is applied as a `material` layer before the presets.

Parsing never evaluates attribute values. Scanning is explicit:

```ts
const stop = world.scanPresets(); // default selector "[data-am-preset],[data-am-material]"
stop(); // destroys only the handles this scan created
```

`scanPresets` does not observe DOM mutations. Errors on individual elements are reported through `onError` and do not stop the scan.

## Known limits

- Presets change physics material and event-driven state only. Visual effects that depend on FieldRenderer formulas (tilt angle, click ripple shape) cannot be changed by presets.
- The material baseline is captured at first enhancement. If an application calls `world.configure` with a material patch while a preset is active, the next preset change recomputes from the captured baseline and overwrites that patch.
- `world.destroy()` releases all Enhance state without calling into the world.

## Kinetic text: controller API, not a preset (decision)

`createKineticText(world, element, options)` is the final form. It is a controller, not a preset, and there is no `presets.kineticType`. Reason: presets install through `world.enhance` and must not write DOM transforms, while kinetic text owns the `transform` of its letters (claimed through `claimStyle`). Keeping it a controller avoids two writers on the same property.

```ts
const text = createKineticText(world, heroTitle, { mode: "elastic", strength: 0.8 });
text.setText("New title"); text.setMode("wave"); text.scatter(); text.reform(); text.remeasure(); text.destroy();
```

The DOM letter renderer is the default. use `createCanvasKinetic(world, host, text, options)` for the canvas renderer (fillText, same modes, 400-glyph limit). The DOM controller stays the default.
