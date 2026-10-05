# ref-toolchain — 工具链指针摘要（正文在仓库 `docs/toolchain.md`）

本文件说明如何找到工具，清单与安装步骤保留在仓库文档中。

- 工具入口、应用选择和常见限制：仓库 `docs/toolchain.md`。
- 安装、版本与自检命令：仓库 `docs/environment.md`。
- 重定位：先确认当前 Git 根，再检查安装脚本、`tools/authoring_rig/native.py`
  和 `studio/vite.config.ts` 如何解析路径；核对目标文件实际存在。
- 多份 checkout 同时存在时，不照抄其他工程写死的绝对路径。
- PSD 操作显式使用当前仓库的 `python/Scripts/python.exe`，不假定宿主解释器有相同依赖。
- 临时资源使用系统临时目录或仓库被忽略的 `out/` 子目录。
