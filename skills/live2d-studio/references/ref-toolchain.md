# ref-toolchain — 工具链指针摘要（权威正文在仓库 `docs/toolchain.md`）

> 本文件只放**指针 + 重定位规则摘要**，不复制权威正文（禁止平行文档）。

- 权威正文：仓库 `docs/toolchain.md`（`read_file` + 仓内相对路径）——工具清单、环境要点、常见坑。
- **重定位程序（R-f，红线唯一入口）**：不按记忆拼路径。先反查既有脚本里写死的绝对路径定位工具链：
  `search_files(pattern="tools/portable|tools/python|PSD2Live", target="content", file_glob="*.py")`，
  照抄脚本实际使用的解释器与导出器路径。同一台机常有多份 checkout，工具可能只在其中一份。
- 关键提醒（详见权威正文）：项目 python 与宿主 python3/python **不是同一个**；PSD 读写/连通域
  脚本一律用项目 python 经 `terminal` 跑；临时文件写 `$TMPDIR`。
