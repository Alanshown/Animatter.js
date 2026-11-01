import {
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type App,
  type DirectiveBinding,
  type InjectionKey,
  type Ref,
  type VNode,
  type Directive,
} from "vue";
import {
  createWorld,
  presets as builtinPresets,
  type AnimatterWorld,
  type EnhancementHandle,
  type PresetDefinition,
  type PresetInput,
  type SurfaceOptions,
  type WorldOptions,
} from "animatter";

export const animatterKey: InjectionKey<AnimatterWorld> = Symbol("animatter");

/** Provides a world to all components and directives in the app. Install once with app.use(). */
export function createAnimatterPlugin(world: AnimatterWorld) {
  return {
    install(app: App): void {
      app.provide(animatterKey, world);
      app.config.globalProperties.$animatter = world;
    },
  };
}

function worldFromVNode(vnode: VNode): AnimatterWorld | null {
  const global = vnode.appContext?.config.globalProperties as { $animatter?: AnimatterWorld } | undefined;
  return global?.$animatter ?? null;
}

/** Creates a world bound to a ref'd root element. Destroyed automatically on unmount. */
export function useAnimatter(
  root: Ref<HTMLElement | null>,
  options: Omit<WorldOptions, "root"> = {},
): Ref<AnimatterWorld | null> {
  const world = shallowRef<AnimatterWorld | null>(null);
  onMounted(() => {
    if (root.value) world.value = createWorld({ ...options, root: root.value });
  });
  onBeforeUnmount(() => {
    world.value?.destroy();
    world.value = null;
  });
  return world;
}

/** Injects the world supplied by createAnimatterPlugin. */
export function usePhysicsWorld(): AnimatterWorld | null {
  return inject(animatterKey, null);
}

/** Registers an element with a world. Options are applied with configure when they change; the surface is not recreated. */
export function useSurface(
  world: Ref<AnimatterWorld | null>,
  element: Ref<HTMLElement | null>,
  options: SurfaceOptions = {},
): void {
  let cleanup: (() => void) | undefined;
  const stop = watch(
    [world, element],
    ([w, el]) => {
      cleanup?.();
      cleanup = undefined;
      if (w && el) cleanup = w.register(el, options);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    stop();
    cleanup?.();
  });
}

/** Elements that carry an enhancement handle, keyed by element. Used by the directives. */
interface Binding {
  world: AnimatterWorld;
  handle: EnhancementHandle;
  key: string;
}
const bindings = new WeakMap<HTMLElement, Binding>();

function presetKey(list: readonly PresetDefinition[]): string {
  return list.map((p) => `${p.name}:${JSON.stringify(p.options)}`).join("|");
}

type DirectiveValue =
  | string
  | { preset?: string; strength?: number; disabled?: boolean }
  | PresetInput
  | undefined;

/** Resolves a directive value into preset definitions. Strings are space-separated built-in names. */
export function resolveDirectivePresets(value: DirectiveValue, fallback: keyof typeof builtinPresets | null): PresetDefinition[] {
  if (value === undefined || value === null || value === "") {
    return fallback ? [builtinPresets[fallback]()] : [];
  }
  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => {
        if (!Object.hasOwn(builtinPresets, name)) throw new TypeError(`Unknown preset "${name}"`);
        return builtinPresets[name as keyof typeof builtinPresets]();
      });
  }
  if (Array.isArray(value)) return [...(value as PresetDefinition[])];
  if (typeof value === "object" && "name" in (value as object) && "install" in (value as object))
    return [value as PresetDefinition];
  const options = value as { preset?: string; strength?: number };
  const names = (options.preset ?? fallback ?? "").split(/\s+/).filter(Boolean);
  return names.map((name) => {
    if (!Object.hasOwn(builtinPresets, name)) throw new TypeError(`Unknown preset "${name}"`);
    return builtinPresets[name as keyof typeof builtinPresets](
      options.strength === undefined ? {} : { strength: options.strength },
    );
  });
}

function apply(el: HTMLElement, value: DirectiveValue, fallback: keyof typeof builtinPresets | null, world: AnimatterWorld | null): void {
  const existing = bindings.get(el);
  if (!world) return;
  const list = resolveDirectivePresets(value, fallback);
  const disabled =
    typeof value === "object" && value !== null && !Array.isArray(value) && "disabled" in value
      ? Boolean((value as { disabled?: boolean }).disabled)
      : false;
  const key = presetKey(list);
  if (existing && existing.world === world) {
    if (existing.key !== key) {
      existing.handle.update({ presets: list });
      existing.key = key;
    }
    if (disabled) existing.handle.disable();
    else existing.handle.enable();
    return;
  }
  existing?.handle.destroy();
  const handle = world.enhance(el, list);
  if (disabled) handle.disable();
  bindings.set(el, { world, handle, key });
}

function release(el: HTMLElement): void {
  const binding = bindings.get(el);
  if (!binding) return;
  binding.handle.destroy();
  bindings.delete(el);
}

function makeDirective(fallback: keyof typeof builtinPresets | null): Directive<HTMLElement, DirectiveValue> {
  return {
    mounted(el: HTMLElement, binding: DirectiveBinding<DirectiveValue>, vnode: VNode) {
      apply(el, binding.value, fallback, worldFromVNode(vnode));
    },
    updated(el: HTMLElement, binding: DirectiveBinding<DirectiveValue>, vnode: VNode) {
      apply(el, binding.value, fallback, worldFromVNode(vnode));
    },
    unmounted(el: HTMLElement) {
      release(el);
    },
  };
}

/** v-animatter="'elastic magnetic'" or v-animatter="{ preset: 'snap', strength: 0.5 }" */
export const vAnimatter = makeDirective(null);
/** v-magnetic or v-magnetic="{ strength: 0.6 }" */
export const vMagnetic = makeDirective("magnetic");
/** v-spring or v-spring="{ strength: 0.8 }" */
export const vSpring = makeDirective("elastic");

/** Declarative wrapper component: renders a div whose element is enhanced with the given presets. */
export const AmSurface = defineComponent({
  name: "AmSurface",
  props: {
    presets: { type: [String, Array] as unknown as () => string | PresetDefinition[], default: "" },
    strength: { type: Number, default: undefined },
    tag: { type: String, default: "div" },
  },
  setup(props, { slots }) {
    const el = shallowRef<HTMLElement | null>(null);
    const world = usePhysicsWorld();
    let handle: EnhancementHandle | null = null;
    const attach = () => {
      if (!world || !el.value) return;
      const value = props.presets as string | PresetDefinition[];
      const list = resolveDirectivePresets(
        Array.isArray(value)
          ? value
          : props.strength === undefined
            ? value
            : { preset: value, strength: props.strength },
        null,
      );
      handle?.destroy();
      handle = world.enhance(el.value, list);
    };
    onMounted(attach);
    watch(() => [props.presets, props.strength], attach);
    onBeforeUnmount(() => {
      handle?.destroy();
      handle = null;
    });
    return () => h(props.tag, { ref: el }, slots.default?.());
  },
});
