# Q1 / V1 单眼样例与 Windows 交接

本样例只用程序绘制的椭圆和线条，不使用第三方角色。用于验证现有闭眼素材通路，不代表已经得到合格的 Live2D 眼睛绑定。原生重建、眨眼外观和转头效果须在 Windows 检查。

## 1. 生成素材

在仓库根执行，输出目录必须是新目录：

```sh
python -m tools.authoring_rig.fixtures.single_eye --out out/q1-single-eye
```

Windows 可把 `python` 替换为项目的 `python/Scripts/python.exe`。脚本只用现有 Pillow/psd-tools，不安装模型或运行 native。

| 输出 | 内容 |
|---|---|
| `single-eye.psd` | 256×256，face / eyewhite Left / iris Left / eyelash Left 共4层，无头发 |
| `closed-eye.png` | 60×28 透明闭眼线条，尚未放进 PSD |
| `eye-mask.png` | 256×256 二值保护 mask，仅 `[140,86,200,114]` 区域可编辑 |

这是正面角色的**左眼**，位于图片右半边。素材放置坐标使用原图左上原点、X 向右、Y 向下；范围右边界/下边界不包含在内。

## 2. PC 实际操作

使用当前源码构建的 JAR 和已配置的 Studio，操作隔离工程；不要覆盖工作中的角色或 Overlay 基线。启动方式见 [Studio 使用说明](../studio/README.md)。

1. 在项目入口导入 `single-eye.psd`，确认4个部件的类型和左右侧，保存并 Rebuild。记录构建版本、参数范围及原生警告；先看未加闭眼素材的 EyeOpen 1 / 0.5 / 0。若最小样例不能构建，记录具体失败，再决定是否补充必须的素材，不先更改原生算法绕过它。
2. 运行 Pose QA，查看联系表和原始 `review.json`。缺少头发参数不应阻止检查。截图数量取决于模型实际参数及去重结果，不固定为16；素材没有头发也不保证原生一定不导出头发参数。
3. 导入 `closed-eye.png`：新增图层，名称 `closed_eye Left`；来源选择人工制作，说明填写“原创几何单眼样例”；精确放置 `[140,86,200,114]`，不启用缩放/裁切，载入 `eye-mask.png`。
4. 检查导入。确认保护区可见像素和变化像素均为0后采纳。在部件语义设置中明确选择 `EYE_CLOSE`、`left`，保存后完整 Rebuild；不把闭眼层替换成原睫毛层。
5. 对比 EyeOpen 1 / 0.5 / 0，再看 ParamAngleX 实际 min/max 与闭眼组合。检查双线、眼白/虹膜漏出、闭眼线错位和非目标眼参数影响。如果确实存在缺陷，保存参数值与眼部裁图，下一步仅处理这项原因。
6. 保存并重新打开工程，确认结果可重复。再在已有 ds 角色的副本上按其实际眼部位置/mask 重复；不能把最小样例坐标直接用于 ds。附带 Overlay 的项目仍按现有完整基线规则处理。

小样例只导出 `ParamEyeLOpen` 且范围0–1、默认1时，Q1 生成 neutral / eyes_closed / eyes_half 三张不同状态。实际原生模型若另有其他参数，会生成相应姿态；这不是预先承诺 native 的参数集合。

## 3. Q1 报告含义

现有报告中的 `spec.coverage` 增加以下说明，不改变 Studio HTTP 协议：

- `scope`：`parameter-poses` 表示至少检查一个非默认参数状态；`neutral-only` 仅为加载/渲染检查。
- `sampledParameters`：在至少一张截图中被设置为非默认值的参数，不代表逐参数所有组合已覆盖。
- `notSampledParameters`：没有被这套少量姿态改变的参数，包括自定义参数和固定范围参数。
- `unavailable`：未生成的动作及原因，例如没有头发参数，或闭眼所需的0不在范围内。这些动作没有通过检查。

转角、单眼和嘴部端点使用构建报告的实际范围；半闭/闭眼等名称只对有效的约定取值生成。完整常规参数样例生成24个不同状态；不枚举全部参数组合。相同默认状态合并为 neutral。显式指定给独立 `qa.py` 的未知或越界参数仍然报错，不经过 Studio 的自动选择逻辑。

构建报告缺少参数范围时要求重新 Rebuild；不会从 CDI 的参数名猜测范围。截图成功沿用 `rendered; visual acceptance requires inspection` 的含义，仍需人工判断外观。失败不会继续把上一份成功 QA 当作本次结果。

## 4. 本轮验证边界

云端验证纯 Python 姿态选择、真实临时 PSD/IR 导入与保护 mask、左右侧配置映射及工作区报告保存。工作区 QA 测试仅替换渲染调用，验证真实的文件、签名和状态逻辑；它不证明 Cubism 截图、原生参数或视觉效果正确。

Windows 待验收：最小样例与 ds 的实际构建/QA、绘制闭眼层和现有睫毛的组合效果、转头组合、保存重开。到此之前不修改 `EyeRigGenerator` / `DrawableBuilder`，也不继续实施 landmark 或网格专项。
