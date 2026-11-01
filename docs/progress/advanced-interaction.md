# Advanced Interaction 迭代进度

规格来源：`documents/animatter-advanced-interaction-spec.md`（本地工作区文档，未入库）。
基线：`aabb3f5`（v0.1.0），分支 `worktree-agent-a06071328e0d3b8c5`。

## 阶段映射

| 版本 | 规格阶段 | 范围 | 状态 |
| --- | --- | --- | --- |
| v0.2 | Phase 0 + Phase 1（子集） | 基线闸门；Enhance API；Preset Registry 与组合；声明式 DOM（data-am-preset/strength/material）；React/Vue 适配修正 | 见下方进度表 |
| v0.3 | Phase 2（子集） | Liquid Dock、Kinetic Typography、Rope 演示与组件 | 未开始 |
| v0.4 | Phase 3 | Scene Renderer、Soft Body、Metaball、GPU Particle | 未开始 |
| v0.5 | Phase 4 | Actor 行为配置、扩展状态机、动态导航 | 未开始 |
| v0.6 | Phase 5 | Animatter Lab | 未开始 |

## Phase 0 基线（已验证）

- `npm ci` 成功。
- `npm run typecheck`：通过（无输出，退出码 0）。
- `npm run lint`：通过。
- `npm test`：23/23 通过。

## 进度表

| 阶段 | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| P0 | 基线验证与进度文件 | 完成 | 本文件 |
| v0.2 | presets 类型与目录 | 进行中 | `packages/core/src/presets/` |

## 设计决策（规格未明写）

1. **样式所有权**：Preset 不直接写 `translate/rotate/scale`。这些属性仍只由 `FieldRenderer` 写入。Preset 只通过修改 Physics material 与订阅交互事件生效，避免多个模块争夺同一 DOM 属性。
2. **材质贡献模型**：每个 Preset 通过 `contribute(target, strength)` 向 surface 的材质提交贡献。最终材质 = 基线材质 + 各贡献按 `base + (target - base) * strength` 插值，按插入顺序覆盖同一键。卸载贡献即恢复。
3. **冲突策略**：`replace`（同组后者替换前者，前者在后者卸载后恢复）、`stack`（叠加，同键后者覆盖）、`reject`（同组已占用则抛错）。
4. **注册复用**：surface 已由开发者 `register/scan` 注册时复用其 id，不重复注册，卸载时也不注销；由 Enhance 创建的注册按引用计数，最后一个句柄释放时注销。
5. **基线快照**：材质基线在首次 enhance 时快照。若开发者在 enhance 期间再次调用 `configure` 修改材质，下一次贡献变化会以快照为基线覆盖。文档中记录此限制。
6. **Tilt / Hover Lift / Float 的视觉效果**：`FieldRenderer` 的旋转公式固定（速度驱动，最大 ±7°），因此 Tilt 只能通过 softness/depth 影响既有响应，不是独立的倾斜求解器。这属于规格"不虚构物理能力"的约束，文档中明确说明。
7. **jelly / metaball**：规格要求不作为基础 Preset 提前发布，本版本不提供。

## 未测项

- 真机、Safari、Firefox：本机环境只有 Chromium（Playwright），未验证其它引擎；记为 Not Tested。
