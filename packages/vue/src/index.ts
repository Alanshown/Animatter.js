import { shallowRef, onMounted, onBeforeUnmount, watch, type Ref } from "vue";
import {
  createWorld,
  type AnimatterWorld,
  type SurfaceOptions,
  type WorldOptions,
} from "animatter";
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
    { immediate: true, flush: "post" },
  );
  onBeforeUnmount(() => {
    stop();
    cleanup?.();
  });
}
