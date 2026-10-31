import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createWorld,
  type AnimatterWorld,
  type SurfaceOptions,
  type WorldOptions,
} from "animatter";
/** Options are captured on mount. Use world.configure/setMode for live changes. */
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
/** Cleans up on world/options identity change, unmount, and React StrictMode remount. */
export function useSurface<T extends HTMLElement>(
  world: AnimatterWorld | null,
  options: SurfaceOptions = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (world && ref.current) return world.register(ref.current, options);
  }, [world, options]);
  return ref;
}
