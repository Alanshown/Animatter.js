<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/branding/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/branding/logo-light.svg">
  <img alt="Animatter.js" src="docs/assets/branding/logo.svg" width="390" height="88">
</picture>

**面向 Web 的物理驱动交互框架**

统一语义协议，统一物理空间，两种交互体验。

<img alt="Project version 0.1.0" src="https://img.shields.io/badge/project-0.1.0-087f83?style=flat-square">
<img alt="TypeScript 5.9.3" src="https://img.shields.io/badge/TypeScript-5.9.3-3178c6?style=flat-square">
<img alt="Development Node.js 24.22.1" src="https://img.shields.io/badge/dev_Node.js-24.22.1-43853d?style=flat-square">
<img alt="Development npm 11.9.0" src="https://img.shields.io/badge/dev_npm-11.9.0-cb3837?style=flat-square">
<img alt="ESM" src="https://img.shields.io/badge/modules-ESM-087f83?style=flat-square">
<img alt="MIT license" src="https://img.shields.io/badge/license-MIT-142c32?style=flat-square">

[English](README.md) · [简体中文](README.zh-CN.md)

[快速开始](#快速开始) · [API 文档](docs/API.md) · [六个案例](#六个交互案例) · [发布准备](docs/NPM-PUBLISHING.md)
</div>

## 项目简介

让现有界面拥有重量、好奇心和一点生命力。Animatter 是**独立、可选接入、框架无关的交互运行时**。保留你的 HTML、React 或 Vue 应用，只增强一个按钮、一个区域或整个页面；切换模式或卸载运行时，都不需要更换 UI 框架。

## 六个交互案例

每个场景都有独立 HTML 入口，并使用同一套核心。这些动图来自**真实 Chromium 页面录屏**，转换为循环 GIF；完整分辨率 PNG 和来源记录位于 [docs/assets/demos](docs/assets/demos)。下方链接是需要本地运行的源码入口，不是已经部署的在线演示。

| Skeleton Pet · 骨架宠物 · Moss & Morning | Liquid World · 液体世界 · Tidal |
| --- | --- |
| [![骨架宠物浏览器录屏](docs/assets/demos/skeleton-pet.gif)](demos/skeleton-pet/index.html) | [![液体世界浏览器录屏](docs/assets/demos/liquid-world.gif)](demos/liquid-world/index.html) |
| **具身 + 力场。** Pip 唤醒沉睡的手记，沿组件锚点移动，也能被直接抓起。验证动态轨迹规划、接触反馈与行为中断。[本地打开](http://localhost:4173/demos/skeleton-pet/index.html)。 | **力场。** 柔性物件、拖拽释放、涟漪、材质切换、提示和弹窗过渡。验证弹簧软体近似和统一物理材质。[本地打开](http://localhost:4173/demos/liquid-world/index.html)。 |
| **Gravity Dashboard · 重力仪表盘 · Orbital** | **Magnetic Interface · 磁性交互 · Polarity** |
| [![重力仪表盘浏览器录屏](docs/assets/demos/gravity-dashboard.gif)](demos/gravity-dashboard/index.html) | [![磁性交互浏览器录屏](docs/assets/demos/magnetic-interface.gif)](demos/magnetic-interface/index.html) |
| **力场。** 拖拽或通过键盘可操作的按钮重排卡片，刷新数据、调节重力。验证质量、碰撞、约束与连续 DOM 布局。[本地打开](http://localhost:4173/demos/gravity-dashboard/index.html)。 | **力场。** 吸引、排斥、轨道力与可连接节点。验证鼠标距离和速度感知、自定义力场、距离约束及跨组件反馈。[本地打开](http://localhost:4173/demos/magnetic-interface/index.html)。 |
| **Physics Portfolio · 物理作品集 · KAI** | **Living Workspace · 生命工作区 · Little Office** |
| [![物理作品集浏览器录屏](docs/assets/demos/physics-portfolio.gif)](demos/physics-portfolio/index.html) | [![生命工作区浏览器录屏](docs/assets/demos/living-workspace.gif)](demos/living-workspace/index.html) |
| **力场。** 完整概念作品集，包含有触感的作品卡片、注释、导航、弹窗和仅在页面内保存的联系表单。验证真实网页中的 L0–L7 编排。[本地打开](http://localhost:4173/demos/physics-portfolio/index.html)。 | **具身 + 力场。** 可操作的任务看板、便签、成功与失败状态，以及自主探索的伙伴。用户操作可抢占探索，暂停的行为随后恢复。验证规划、调度与异步结果同步。[本地打开](http://localhost:4173/demos/living-workspace/index.html)。 |

## 为什么选择 Animatter？

- **按需接入。** 注册单个表面或扫描指定选择器，使用区域规则混合模式、设置安静区域。
- **共享语义与空间。** 实体和力场消费相同的事件、锚点、交互图、调度器及物理状态。
- **保留原生行为。** 表单、链接、键盘激活和触控滚动由浏览器负责；只有明确启用拖拽的表面会捕获指针。
- **负责到底的生命周期。** 卸载恢复自有样式、移除渲染层、取消任务，并清理监听器与观察器。
- **可扩展运行时。** 接入自定义行为、力场、材质、表面/实体渲染器和框架生命周期适配器。

| 层次 | 职责 | 与 Animatter 的关系 |
| --- | --- | --- |
| CSS / 动画库 | 驱动属性动画与过渡 | Animatter 补充统一几何、语义事件、物理约束及行为仲裁。 |
| 组件库 | 提供控件及无障碍模式 | 增强已有 DOM，保留组件的键盘与业务行为。 |
| React / Vue / Web 框架 | 管理渲染、状态与路由 | 通过可选生命周期适配器接入，不替换组件树或路由。 |

## 两种交互模式

**具身交互（Embodied）**通过可见的程序化实体表现交互。实体读取实时 DOM 锚点，规划跳跃和沿侧边攀爬的路线，响应指针、焦点与应用状态，混合动作并让位于用户。内置 SVG 和 Canvas 渲染器，角色并非固定 GIF 播放。

**力场交互（Field）**让页面本身响应操作：弹簧、阻尼、惯性、吸引/排斥、有限深度、拖拽牵引与释放、点击冲量、涟漪、柔性形变、显隐过渡及布局反馈。液体效果属于弹簧软体近似，不是真实流体模拟。

使用 `mode: 'field' | 'embodied' | 'both' | 'off'`，组合全局、区域和表面规则；`setEnabled(false)` 可恢复特效影响，同时保留原生业务控件。

## 功能与交互层级

| 层级 | 覆盖范围 |
| --- | --- |
| L0 | 指针、悬停、进入/离开、接近感知 |
| L1 | Tooltip、注释、光标、焦点与微交互 |
| L2 | 单击、双击、长按、拖拽与双指手势 |
| L3 | 输入、选择、复制、删除与展开 |
| L4 | 按钮、卡片、表单、菜单、列表与折叠面板 |
| L5 | 滚动、布局、模态框、浮层与视口 |
| L6 | 导航、标签页、路由与页面过渡 |
| L7 | 加载、成功、错误、通知与异步状态 |

运行时自动收集根区域内的原生输入。应用特有状态通过 `emit`、`track`、`transition` 和 `bind` 显式桥接；事件名称不代表能凭空推断任意业务逻辑。已实现事件组合、优先级、FIFO 队列、抢占、取消、恢复和最新结果优先的同步机制，详见[完整协议与 API](docs/API.md)。

## 开发环境

| 类别 | 实际配置与验证范围 |
| --- | --- |
| 运行时 | 本次本地 Node.js **24.22.1**（Linux x64）；包和工作区没有声明 `engines` 下限，不承诺其他 Node 版本 |
| 包管理 | npm **11.9.0**；`packageManager: npm@11.9.0`，使用 `npm ci` 和锁文件 |
| 语言 | TypeScript **5.9.3**，严格模式，目标 ES2022 |
| 模块 | 源码 TypeScript；分发 JavaScript ESM + `.d.ts` 类型声明；无 CommonJS 专用入口 |
| 样式 | 可选 CSS、自定义属性、独立 translate/rotate/scale 属性 |
| 渲染 | DOM 表面，SVG / Canvas 实体 |
| 构建 | TypeScript 项目引用（`tsc -b`）+ esbuild **0.25.12** 浏览器 ESM bundle |
| 测试 | Node.js 内置 `node:test` + tsx **4.20.6**；ESLint **9.39.1** |
| 浏览器测试 | Playwright **1.56.1**；已记录 Linux Chromium **141.0.7390.37** |
| 框架接入 | 原生 JS；声明 React `>=18`、Vue `>=3.3`；实测 React **19.2.0**、Vue **3.5.44** |
| 许可证 | MIT |

浏览器原生 API 包括 Pointer Events、ResizeObserver、MutationObserver、matchMedia、requestAnimationFrame 和 AbortController。只导入核心及适配器不会访问 DOM，可用于 SSR 模块加载；`createWorld()` 必须在客户端挂载后调用。声明的 peer 范围不等于逐版本测试。Firefox / WebKit、Windows / macOS、iOS / Android 实机未通过本次验收；触控场景采用浏览器模拟。详见[兼容性矩阵](docs/PACKAGE-COMPATIBILITY.md)。

## 安装与运行

**本项目不声称已发布 npm。** 当前 tarball 由本地构建生成于 `artifacts/packages/`。[releases/0.1.0](releases/0.1.0/) 内为历史归档，不含此次改造。2026-10-31 官方公共 Registry 对四个候选名返回 404，但命名空间所有权仍未验证；这不代表已预留名称或已发布。

```sh
git clone https://github.com/Alanshown/Animatter.js.git
cd Animatter.js
npm ci
npm run build
npm run dev
```

打开[本地案例集](http://localhost:4173)。HTML 入口需要通过此 HTTP 服务访问，不支持 file:// 模块加载。不需要 Docker 或外部素材服务。

在其他项目中使用生成的包：

```sh
npm run build
npm run verify:package
# In your consuming project, use the actual absolute path to this checkout:
npm install /path/to/Animatter.js/artifacts/packages/animatter-0.1.0.tgz
# Optional adapters, with the corresponding React/Vue peer installed:
npm install /path/to/Animatter.js/artifacts/packages/animatter-react-0.1.0.tgz
npm install /path/to/Animatter.js/artifacts/packages/animatter-vue-0.1.0.tgz
```

## 快速开始

以下页面位于仓库根目录，通过本地服务访问：

```html
<link rel="stylesheet" href="/packages/core/dist/materials.css">
<button id="save" data-am="save" class="am-surface">Save</button>
<p id="status" role="status"></p>
<script type="module">
  import { createWorld } from '/packages/core/dist/animatter.js';
  const world = createWorld({ mode: 'field' });
  world.scan();
  document.querySelector('#save').addEventListener('click', () => {
    document.querySelector('#status').textContent = 'Saved';
    world.emit('success', 'save');
  });
  // On teardown: world.destroy();
</script>
```

使用构建工具时，从 `animatter` 导入，并按需导入 `animatter/materials.css`。请在客户端挂载后创建世界；单独导入包不依赖 DOM。

## 框架集成

```tsx
import { useAnimatter, useSurface } from '@animatter/react';
import type { AnimatterWorld } from 'animatter';
const options = { id: 'save' };
function Save({ world }: { world: AnimatterWorld | null }) {
  const ref = useSurface<HTMLButtonElement>(world, options);
  return <button ref={ref}>Save</button>;
}
export function App() {
  const { ref, world } = useAnimatter({ mode: 'field' });
  return <div ref={ref}><Save world={world} /></div>;
}
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useAnimatter, useSurface } from '@animatter/vue';
const root = ref<HTMLElement | null>(null);
const button = ref<HTMLElement | null>(null);
const world = useAnimatter(root, { mode: 'field' });
useSurface(world, button, { id: 'save' });
</script>
<template><main ref="root"><button ref="button">Save</button></main></template>
```

适配器负责挂载/卸载，已测试 React StrictMode 清理。世界配置在挂载时读取，动态更新使用 `configure` / `setMode`；React 表面配置应保持稳定引用。

## 配置与材质

```ts
import { createWorld, materials, SVGActorRenderer, orbitalField } from 'animatter';
const world = createWorld({
  mode: 'both', material: materials.elastic,
  regions: [{ selector: '.quiet-zone', mode: 'off' }],
});
world.register(document.querySelector<HTMLElement>('#card')!, {
  id: 'card', draggable: true, collision: true,
  material: { mass: 1.4, stiffness: 85, damping: 11, softness: .8 },
});
const pip = world.addActor('pip', {
  renderer: new SVGActorRenderer('#bdca90'), idle: true, draggable: true,
});
await pip.moveTo('card', { kind: 'climb', priority: 80 });
const removeField = world.addField(orbitalField('orbit', 180, 340));
// Later: removeField(); world.destroy();
```

```css
.my-material {
  --am-mass: 1.4;
  --am-stiffness: 85;
  --am-damping: 11;
  --am-softness: .8;
  --am-max-displacement: 38;
}
```

内置 **elastic、liquid、heavy、magnetic** 四组预设。注册时读取 CSS 值，显式 JS 配置优先。重排使用 `world.layout(() => reorderDOM())` 保持连续；外部位置变化后调用 `world.invalidate()`。如果业务代码也使用独立 CSS translate/rotate/scale 属性，请用外层包装节点隔离所有权。

## API 与文档

[API 与扩展协议](docs/API.md) · [架构](docs/ARCHITECTURE.md) · [核心验收门禁](docs/CORE-ACCEPTANCE.md) · [验收报告](docs/VERIFICATION.md) · [实测证据](docs/testing/) · [路线图](ROADMAP.md)

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:package
npx playwright install chromium
npm run test:core-browser
npm run test:browser
npm run benchmark
npm run capture             # Requires ffmpeg + ffprobe
npm run check               # Full required local verification
```

`test:compat` 额外尝试 Firefox / WebKit，需要安装对应 Playwright 系统依赖。`capture` 录制真实页面，生成六个 GIF、桌面 PNG 和来源清单。场景数据、项目身份和任务结果均为本地演示内容，表单不会发送信息。

发布工程：[npm 发布流程](docs/NPM-PUBLISHING.md) · [包兼容性](docs/PACKAGE-COMPATIBILITY.md) · [验收清单](docs/RELEASE-CHECKLIST.md) · [本次审计](docs/NPM-PREPARATION-AUDIT.md) · [品牌规范](docs/assets/branding/BRANDING.md) · [变更记录](CHANGELOG.md)

## 架构

统一 TypeScript 内核共享事件、空间映射、物理求解与行为编排。跨组件关系由交互图和优先级调度器协调；实体与力场使用相同的世界状态。适配器只负责生命周期，不复制引擎。参见[架构文档](docs/ARCHITECTURE.md)。

## 测试与兼容性

仓库包含纯单元测试、核心集成页面、React/Vue 生命周期检查、六个场景的 Playwright 测试、390 px 触控 / 1280 px 减弱动态效果 / 1440 px 桌面检查，以及冲突取消、连续布局、模式关闭、样式恢复和资源清理测试。[docs/testing](docs/testing/) 保存原始结果及包体积、物理求解和浏览器耗时实测值。测量仅代表记录中的 Linux 无头测试环境，不代表通用 FPS 或设备承诺。

**已验证：**本环境的 Chromium 141。**尚未验证：**Firefox 在本环境无法创建可用页面；WebKit 缺少系统库。未测试 Safari / iOS / Android 实机，不将这些情况冒充为跨浏览器通过。

这是轻量 UI 求解器：矩形接触、有限深度平面、程序化运动实体和采样式障碍净空规划。它不是通用 3D 刚体引擎、真实流体求解器或关节角色系统。密集碰撞堆积可能增加开销；Shadow DOM、任意变换祖先和自动观察所有外部样式变更不在当前保证范围。默认遵循系统减弱动态效果设置；请保留原生无障碍语义，并为纯拖拽操作提供替代方式。

## 路线图

0.1.0 提供共享运行时、两种模式、适配器、扩展协议和六个案例。后续重点是更完整的浏览器/设备验证、渲染器示例、Worker / 碰撞广相位实验和稳定的 1.0 API，详见 [ROADMAP.md](ROADMAP.md)。

**发布门禁：先完成核心架构与 L0–L7 全层级交互验收，再讨论发布。打包和品牌完成不代表框架全部验收通过。此次不执行 npm publish、不创建 Release、不提高版本号。0.x API 仍可能调整。**

## 参与贡献

贡献应提供可复现证据，保持可选接入、原生行为与清理所有权。参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

采用 [MIT 许可证](LICENSE)。品牌矢量和原创字标也使用同一许可证。
