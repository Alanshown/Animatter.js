import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  createWorld,
  presets as builtinPresets,
  type AnimatterWorld,
  type EnhancementHandle,
  type Interaction,
  type Material,
  type Mode,
  type PresetInput,
  type SurfaceOptions,
  type WorldOptions,
} from "animatter";

export interface PhysicsProviderProps {
  children?: ReactNode;
  /** Root element the world scans and listens on. Defaults to document.body inside the browser. */
  root?: () => HTMLElement;
  options?: Omit<WorldOptions, "root">;
}

const WorldContext = createContext<AnimatterWorld | null>(null);

/**
 * Creates one world per provider instance. The world is created inside an effect, so importing this module
 * never touches the DOM, and StrictMode's double effect invocation destroys the first world cleanly.
 */
export function PhysicsProvider({ children, root, options }: PhysicsProviderProps) {
  const [world, setWorld] = useState<AnimatterWorld | null>(null);
  const initial = useRef({ root, options });
  useEffect(() => {
    const { root: resolveRoot, options: worldOptions } = initial.current;
    const instance = createWorld({ ...worldOptions, root: resolveRoot?.() ?? document.body });
    setWorld(instance);
    return () => {
      instance.destroy();
      setWorld(null);
    };
  }, []);
  return createElement(WorldContext.Provider, { value: world }, children);
}

/** Returns the shared world from the nearest PhysicsProvider, or null until it has mounted. */
export function usePhysicsWorld(): AnimatterWorld | null {
  return useContext(WorldContext);
}

/** Stable identity for preset lists. Presets are plain definitions, so name plus options identifies them. */
export function presetKey(presets: PresetInput | undefined): string {
  if (!presets) return "";
  const list = Array.isArray(presets) ? presets : [presets];
  return list.map((p) => `${p.name}:${JSON.stringify(p.options)}`).join("|");
}

/**
 * Applies presets to the element referenced by the returned ref. Changing the preset list updates the
 * existing handle when possible; the surface itself is never re-registered.
 */
export function useEnhance<T extends HTMLElement>(
  presets: PresetInput | undefined,
  disabled = false,
): RefObject<T | null> {
  const world = usePhysicsWorld();
  const ref = useRef<T>(null);
  const handleRef = useRef<EnhancementHandle | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const key = presetKey(presets);

  useEffect(() => {
    const list = presetsRef.current;
    if (!world || !ref.current || !list) return;
    const handle = world.enhance(ref.current, list);
    handleRef.current = handle;
    if (disabledRef.current) handle.disable();
    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
    // The preset key identifies the list; the element and world identify the surface.
  }, [world, key]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (disabled) handle.disable();
    else handle.enable();
  }, [disabled, world, key]);

  return ref;
}

export interface PhysicsSurfaceOptions extends SurfaceOptions {
  presets?: PresetInput;
  onInteraction?: (event: Interaction) => void;
}

/**
 * Registers an element as a surface and optionally enhances it. Registration depends only on world and id.
 * Material, mode and draggable changes go through world.configure. Preset changes go through the enhancement handle.
 */
export function usePhysicsSurface<T extends HTMLElement>(options: PhysicsSurfaceOptions = {}): RefObject<T | null> {
  const world = usePhysicsWorld();
  const generated = useId();
  const id = options.id ?? `react-${generated}`;
  const ref = useRef<T>(null);
  const latest = useRef(options);
  latest.current = options;

  const config = JSON.stringify({
    mode: options.mode,
    material: options.material,
    draggable: options.draggable ?? false,
    collision: options.collision ?? false,
    disabled: options.disabled ?? false,
  });

  useEffect(() => {
    if (!world || !ref.current) return;
    const { presets: _p, onInteraction: _o, ...surface } = latest.current;
    void _p;
    void _o;
    return world.register(ref.current, { ...surface, id });
  }, [world, id]);

  useEffect(() => {
    if (!world || !world.spatial.surfaces.has(id)) return;
    const parsed = JSON.parse(config) as {
      mode?: Mode;
      material?: Partial<Material>;
      draggable: boolean;
      collision: boolean;
      disabled: boolean;
    };
    const patch: SurfaceOptions = {
      draggable: parsed.draggable,
      collision: parsed.collision,
      disabled: parsed.disabled,
      ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}),
      ...(parsed.material !== undefined ? { material: parsed.material } : {}),
    };
    world.configure(id, patch);
  }, [world, id, config]);

  useEffect(() => {
    if (!world) return;
    return world.on((event) => {
      if (event.target !== id) return;
      latest.current.onInteraction?.(event);
    });
  }, [world, id]);

  useEnhance<T>(options.presets, options.disabled ?? false);
  return ref;
}

/** Shorthand for a magnetic pull toward the pointer. */
export function useMagnetic<T extends HTMLElement>(options: { strength?: number; radius?: number; disabled?: boolean } = {}) {
  const { strength, radius, disabled } = options;
  return usePhysicsSurface<T>({
    presets: builtinPresets.magnetic({
      ...(strength !== undefined ? { strength } : {}),
      ...(radius !== undefined ? { radius } : {}),
    }),
    disabled: disabled ?? false,
  });
}

/** Shorthand for an elastic spring response. */
export function useSpring<T extends HTMLElement>(options: { stiffness?: number; damping?: number; disabled?: boolean } = {}) {
  const { stiffness, damping, disabled } = options;
  return usePhysicsSurface<T>({
    presets: builtinPresets.elastic({
      ...(stiffness !== undefined ? { stiffness } : {}),
      ...(damping !== undefined ? { damping } : {}),
    }),
    disabled: disabled ?? false,
  });
}

/** Draggable surface with damping feedback while dragging. */
export function usePhysicsDrag<T extends HTMLElement>(options: { disabled?: boolean } = {}) {
  return usePhysicsSurface<T>({
    draggable: true,
    presets: builtinPresets.dragFeedback(),
    disabled: options.disabled ?? false,
  });
}

export interface PhysicsSurfaceProps extends Omit<PhysicsSurfaceOptions, "id"> {
  children?: ReactNode;
  className?: string;
  style?: Record<string, string | number>;
  tag?: "div" | "span" | "button";
}

/** Declarative wrapper: renders a tag whose element is registered and enhanced by the nearest provider. */
export function PhysicsSurface({ children, className, style, tag = "div", ...options }: PhysicsSurfaceProps) {
  const ref = usePhysicsSurface<HTMLElement>(options);
  return createElement(tag, { ref, className, style }, children);
}

export { createWorld };
export type { AnimatterWorld, PresetInput, SurfaceOptions, WorldOptions } from "animatter";

/** v0.1 compatibility: creates a world bound to a ref'd div. Options are captured on mount. */
export function useAnimatter(options: Omit<WorldOptions, "root"> = {}): {
  ref: RefObject<HTMLDivElement | null>;
  world: AnimatterWorld | null;
} {
  const ref = useRef<HTMLDivElement>(null),
    initial = useRef(options);
  const [world, setWorld] = useState<AnimatterWorld | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const instance = createWorld({ ...initial.current, root: ref.current });
    setWorld(instance);
    return () => {
      instance.destroy();
    };
  }, []);
  return { ref, world };
}

/**
 * v0.1 compatibility: registers the ref'd element with the given world. Registration depends on the world
 * only; inline option objects no longer cause re-registration on every render.
 */
export function useSurface<T extends HTMLElement>(
  world: AnimatterWorld | null,
  options: SurfaceOptions = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (world && ref.current) return world.register(ref.current, latest.current);
  }, [world]);
  return ref;
}
