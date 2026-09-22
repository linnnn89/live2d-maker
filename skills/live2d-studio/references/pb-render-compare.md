---
name: pb-render-compare
layer: L2
requires: []
verify_with: []
touches: []
---

# pb-render-compare — 参数化渲染对比（只读验证，横切）

> 各 route 的完成判据统一引用本篇（verification 横切）。**只读**：不动任何模型/素材文件。

## 前置

- spec 指向目标 `model3.json`（harness 服务根目录可访问即可）；镜位/参数组明确。用法细节取 [deep-live2d-render-check-harness.md](deep-live2d-render-check-harness.md)（[index.md](index.md)）。
- **仓库里别的整机截图脚本只能截 UI，不能按参数出图，不得当验证手段。**

## 步骤

1. 定 spec：参数值、镜位（全/头/局部）、渲染规格（画布宽、取景框）——**渲染规格必须钉死并随 fixture 存档**。
2. 渲改前（备份产物）与改后各一组，出并排对比图（`live2d-viewer/`：`shot.py`/`sheet.py`/`grid.py`）。
3. 脚本量化指标 + 放大叠加图目视复核（R-e：只报真做过的）。

## 完成判据（指标规范，P4/P5）

- **归一化分母只用 fixture 固定常量**（画布宽 1024 或该 fixture 的固定取景框）或绝对像素+钉死渲染规格；**禁止**用脸宽等遮挡相关量当分母——头发/遮挡变化会造假差量；非用不可时按"两版同一掩膜+叠加图目视"执行。
- 期望值来自**真实 before/after 渲染对导出**（脚本量+渲染规格存档）；未实测前用占位值 + `TODO(实测)` 标注，不写死全局像素常数。
- 结论给出可核对数字（像素变化量、对比图路径）。

## 回滚

不适用（只读）。渲染不出图 → 查 harness 服务根/spec `model` 路径；不得改用 UI 截图顶替。
