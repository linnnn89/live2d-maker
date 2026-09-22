# host-adapter — 宿主适配与取用机制

## 机制事实（Hermes v0.21.3，已核实源码）

- `skill_view(file_path=…)` 有**包含性校验**：只能取技能目录之内的文件（`..` 穿越、越界直接拒）。
  ⇒ **包内文件**用 `skill_view(name="live2d-studio", file_path="references/…")`；**仓库内权威文档**
  （包外，如 `docs/toolchain.md`、`psd2live/docs/…`）用 `read_file` + 仓内相对路径。
- `linked_files` 只枚举 `references/`（*.md 非递归）等四个约定目录；本包因此全部内容扁平放
  `references/`，前缀表达层级（route-*/pb-*/ref-*/stubs-*）。
- 新装技能**新会话**才可见（loader 会话缓存），非 bug。
- 其他宿主（纯文件/非 Hermes agent）：按相对路径直接读 `references/*.md`，等价于 read_file。

## 取用方式速查

| 目标 | 方式 |
| :--- | :--- |
| 本包 references/*.md | `skill_view("live2d-studio", file_path="references/x.md")` |
| 本包深参考/脚本 | `skill_view("live2d-studio", file_path="references/deep-….md")` 或 `file_path="scripts/….py"` |
| 仓库权威文档 | `read_file`（仓内相对路径） |
| 其他宿主 | 相对路径直读 |

## 交接策略

`pb-publish-and-handoff` 的交接载体按宿主降级：
1. 当前仓库存在 `docs/HANDOFF.md` 约定 → 追加编号小节（改动摘要/验证数字/未做项）。
2. 否则 → 输出同格式交接摘要返回用户、PR 或 Release notes，**不自动创建**仓库级交接文件。
包外文件不是技能安装后的必需依赖。
