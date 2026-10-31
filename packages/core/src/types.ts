/** Semantic levels shared by native input, applications, actors and fields. */
export const taxonomy = {
  pointer: 0,
  hover: 0,
  enter: 0,
  leave: 0,
  proximity: 0,
  tooltip: 1,
  annotation: 1,
  cursor: 1,
  focus: 1,
  blur: 1,
  click: 2,
  doubleclick: 2,
  longpress: 2,
  dragstart: 2,
  drag: 2,
  dragend: 2,
  gesture: 2,
  input: 3,
  selection: 3,
  copy: 3,
  delete: 3,
  expand: 3,
  button: 4,
  card: 4,
  form: 4,
  menu: 4,
  list: 4,
  accordion: 4,
  scroll: 5,
  layout: 5,
  modal: 5,
  overlay: 5,
  viewport: 5,
  navigation: 6,
  tabs: 6,
  routing: 6,
  transition: 6,
  loading: 7,
  success: 7,
  error: 7,
  notification: 7,
  async: 7,
} as const;
export type Intent = keyof typeof taxonomy;
export type Mode = "field" | "embodied" | "both" | "off";
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export interface Interaction {
  readonly type: Intent;
  readonly level: number;
  readonly target: string | null;
  readonly time: number;
  readonly source: "pointer" | "keyboard" | "touch" | "application" | "system";
  readonly point: Vec3;
  readonly velocity: Vec3;
  readonly data: Readonly<Record<string, unknown>>;
  readonly originalEvent: Event | null;
}
export interface Material {
  mass: number;
  stiffness: number;
  damping: number;
  restitution: number;
  magnetism: number;
  radius: number;
  maxDisplacement: number;
  depth: number;
  softness: number;
  gravity: number;
}
export interface SurfaceOptions {
  id?: string;
  mode?: Mode;
  material?: Partial<Material>;
  draggable?: boolean;
  collision?: boolean;
  plane?: number;
  capabilities?: Intent[];
  disabled?: boolean;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ActorPose {
  position: Vec3;
  velocity: Vec3;
  state: "idle" | "walk" | "jump" | "slide" | "grab" | "climb" | "land";
  weights: Readonly<Record<ActorPose["state"], number>>;
  gaze: Vec3;
  blend: number;
  facing: number;
  time: number;
}
export interface ActorRenderer {
  mount(host: HTMLElement): void;
  render(pose: Readonly<ActorPose>): void;
  destroy(): void;
  hitTarget?(): HTMLElement | null;
}
export interface WorldPlugin<W = unknown> {
  name: string;
  setup(world: W): void | (() => void);
}
