import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h, ref, onMounted } from "vue";
import {
  useAnimatter as useReact,
  useSurface as useReactSurface,
} from "../../packages/react/src/index.js";
import {
  useAnimatter as useVue,
  useSurface as useVueSurface,
} from "../../packages/vue/src/index.js";
const store = window as unknown as {
  adapterWorlds: unknown[];
  unmountAdapters: () => void;
};
store.adapterWorlds = [];
function ReactScene() {
  const { ref, world } = useReact();
  const surface = useReactSurface<HTMLButtonElement>(world, {
    id: "react-button",
  });
  useEffect(() => {
    if (world) store.adapterWorlds.push(world);
  }, [world]);
  return React.createElement(
    "div",
    { ref },
    React.createElement("button", { ref: surface }, "React surface"),
  );
}
const root = createRoot(document.querySelector("#adapters")!);
root.render(
  React.createElement(StrictMode, null, React.createElement(ReactScene)),
);
const vueHost = document.createElement("div");
document.body.append(vueHost);
const app = createApp({
  setup() {
    const el = ref<HTMLElement | null>(null),
      button = ref<HTMLElement | null>(null),
      world = useVue(el);
    useVueSurface(world, button, { id: "vue-button" });
    onMounted(() => {
      setTimeout(() => {
        store.adapterWorlds.push(world.value);
      }, 0);
    });
    return () =>
      h("div", { ref: el }, [h("button", { ref: button }, "Vue surface")]);
  },
});
app.mount(vueHost);
store.unmountAdapters = () => {
  root.unmount();
  app.unmount();
  vueHost.remove();
};
