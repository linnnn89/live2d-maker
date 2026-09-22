---
name: route-automation-mcp
layer: L1
domain: automation-mcp
order: []
verify_with: []
next_routes: [{when: 工程已生成待导出, route: model-generation}]
fallback: [{on: 契约与实际不符, to: route-automation-mcp.md#诊断, max_retries: 1}]
---

# route-automation-mcp — MCP / CLI / Agent 接入边界

**归我**：Agent/MCP 接入、10 个合并工具的契约、素材导入与姿态拼图调用、CLI 参数。
**不归我**：模型/美术/运行时缺陷（按症状转对应 route）。

## 判定树

1. **接 MCP** → 代理：`psd2live/mcp_proxy.py`、根目录 `model-mcp.ps1` / `check-mcp.ps1`（路径先按 [ref-toolchain.md](ref-toolchain.md) 重定位）。契约权威正文 `psd2live/docs/zh/agent/MCP_AUTHORING.md`（`read_file`）：工具分支、素材导入、失败条件。
2. **设计 agent 工作流/成本控制** → `psd2live/docs/zh/agent/AGENT_DESIGN.md`（产品边界、工具收敛、分阶段验收）。
3. **CLI 批处理** → `psd2live/docs/zh/guide/USER_GUIDE.md` CLI 参数节。
4. **调用成功但产物不对** → 按症状转 [route-model-repair.md](route-model-repair.md) / [route-model-generation.md](route-model-generation.md)。

## 编排

- 无自有 L2；调用导出走 next_routes → [route-model-generation.md](route-model-generation.md)（同步调用，具名完成状态返回）。

## 完成判据

- 每个使用的工具有契约出处（文档行号/小节）；失败条件已按契约核对，非臆测重试。

## 诊断（回退锚）

契约与实际不符 → 先核对版本（`check-mcp.ps1`）再报差异；仍不成立 → 回 [SKILL.md](../SKILL.md)。
