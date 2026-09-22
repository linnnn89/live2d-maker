# 交接记录（HANDOFF）

> 本仓约定（pb-publish-and-handoff 引用）：结论**追加**编号小节到本文件末尾，不新建 md。
> 校验范围：只查链接/锚点，不设预算（状态文件会增长）。

## 格式

每节：`## N. <主题>（YYYY-MM-DD）`，含三段：**改动摘要** / **验证数字**（可核对的像素量、哈希、命令输出）/ **未做项**（如实列写，如"Cubism Editor 人工复核未做"）。

## 1. 技能包初建（2026-09-22）

- **改动摘要**：skills/live2d-studio/ 四层路由包落地（L0 + 6 route + 6 pb + L3 索引 + stub + vendor 台账），check_routing.py 结构校验，README/docs 对齐（M1–M3）。
- **验证数字**：`python scripts/check_routing.py` 结果见会话记录；--release 因 vendor TODO 保持失败（设计如此）。
- **未做项**：嘴部 fixture 阈值 `TODO(实测)`；vendor 许可审计；行为评测（G5）。

## 2. 原版技能对照与校验加固（2026-09-22）

- **改动摘要**：对照 Hermes `live2d-psd-model-repair` 与本机 `.agents/skills` 原版技能；修正为 8 refs + 3 scripts，补回 `hairline_probe.py`，把 `source-part-segmentation` 接入拆层失败分支并为 Blender 技能补 Cubism 禁用边界；拆分外部技能竞争/缺失语料，新增语义标签、发际线试改、拆层粘连用例；校验器新增 L1/L2 内容契约、非空 license/tags、生命周期转移、语料真实可达和 G5 行为记录检查。
- **验证数字**：3 个回归测试通过；结构校验 `0 失败 / 0 警告`；三类 scratch 负向变异均被正确拦截；`--release` 明确报告 5 项未就绪。
- **未做项**：未定稿仓库根 LICENSE；vendor manifest 许可/哈希/复核日期仍有 TODO；真实 Agent 行为评测状态为 `not_run`；嘴部 fixture 阈值仍待实测。

## 3. 技能合并安装与旧技能移除（2026-09-22）

- **改动摘要**：将原 Hermes `live2d-psd-model-repair`（主文档+8 refs+3 scripts）和 `reference-art-alignment`（主文档+2 refs+1 script）完整迁入 `live2d-studio` 的 `deep-*` 参考与 `scripts/`；移除私有 Agent 状态目录读取指令；安装到 `~/.agents/skills/live2d-studio` 与当前 `$HERMES_HOME/skills/live2d-studio`；删除两个旧 Hermes 技能。保留通用 `hermes-skill-pack-design`，仅移除其旧关联；`.agents` 的跨界增强技能未被完整吞并，保留。
- **验证数字**：旧来源树哈希分别为 `1b264f0a1a00246fdacd102a63e1351b57c5ce4c29517c130b004ba1767839fd`（12 文件）与 `c55525c95a61b55421d5526cc2d35a1a33ea2a7bb35d2121f82a0c07d971b4ae`（4 文件）；迁移包 4 个脚本编译/接口冒烟通过；安装后三份技能树哈希一致。
- **未做项**：迁入旧技能未声明再分发许可，故仅允许本机整合，`--release` 必须失败；新技能需新会话才会进入 Hermes 技能索引。
