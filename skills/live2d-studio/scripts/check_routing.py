#!/usr/bin/env python3
"""check_routing.py — live2d-studio 技能包结构校验（标准库、跨平台）。

用法：
    python scripts/check_routing.py            # 核心 fail-closed + 警告级
    python scripts/check_routing.py --release  # 另加 release gate 机器子集
    python scripts/check_routing.py --self-test

校验分级（v4 §4-D5）：
  核心 fail-closed —— frontmatter/预算硬失败行/相对链接与锚点/绝对路径禁令/
    stub 字段与行数/外部指针必有 stub/边分类与循环规则/touches⇒requires 备份/
    可达性（白名单豁免，理由每次打印）/routing_cases 结构校验/枚举白名单声明存在。
  警告级启发式 —— 跨层段落相似度/L0 零配方/L2 与 L3 预算阈值/可达性提示。
  行为级（本脚本之外）—— 自然语言症状路由 = 真实 agent harness 评测或人工验收，
    本脚本不冒充行为证明。

作用域（v4 §4-D5 / B-v2-8）：技能包 + 被包引用的仓内目标 + 根 README + docs/HANDOFF.md
（只查链接/锚点、不设预算）。既有组件历史遗留不在范围内。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
PKG = SKILL_ROOT
REPO = SKILL_ROOT.parent.parent
REFERENCES = PKG / "references"

# --- 枚举白名单声明（Hermes v0.21.3 机制事实，tools/skills_tool.py _LINKED_FILE_SPECS）---
# linked_files 仅枚举：references/（*.md，非递归）、templates/（递归，md/py/yaml/yml/json/tex/sh）、
# assets/（递归，全部）、scripts/（非递归，py/sh/bash/js/ts/rb）。自定义目录"可读不可枚举"。
# 因此本包全部下层内容扁平放 references/，前缀表达层级（route-*/pb-*/ref-*/stubs-*）。
ENUMERATION_NOTE_REQUIRED = True

# 可达性白名单（带理由，每次运行打印；N4）
REACHABILITY_WHITELIST = {
    "references/vendor-manifest.md": "维护状态文件：发布 gate 台账，不要求被上层引用",
    "tests/routing_cases.json": "测试语料：由 check_routing.py 消费",
    "tests/behavior-evaluation.json": "行为评测记录：由发布 gate 消费",
    "tests/test_check_routing.py": "校验器回归测试",
    "scripts/check_routing.py": "工具自身",
}

# 预算（行数/字符数双口径：含 frontmatter、空行计入、代码块计入）
BUDGETS = {
    "SKILL.md": {"lines": 120, "chars": 6000, "level": "hard"},
    "route": {"lines": 200, "chars": None, "level": "hard-lines-soft-chars"},
    "pb": {"lines": 220, "chars": None, "level": "soft-220-hard-300"},
    "ref": {"lines": 300, "chars": None, "level": "soft-300-hard-600"},
    "stubs": {"lines": 15, "chars": None, "level": "hard-15-soft-5"},
}

ABS_PATH_RE = re.compile(r"(?<![A-Za-z])(?:[A-Za-z]:[\\/]|/home/|/Users/)")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def rel(p: Path) -> str:
    try:
        return str(p.relative_to(REPO)).replace("\\", "/")
    except ValueError:
        return str(p).replace("\\", "/")


def slugify(heading: str) -> str:
    h = heading.strip().lower()
    h = re.sub(r"[`*_]", "", h)
    h = re.sub(r"[^\w\u4e00-\u9fff \-]", "", h)
    return h.replace(" ", "-")


def file_anchors(path: Path) -> set[str]:
    anchors = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            anchors.add(slugify(m.group(2)))
    return anchors


def parse_frontmatter(text: str) -> dict:
    """宽容解析本包使用的扁平 YAML 子集：key: value / key: [a, b] / 嵌套 flow 的 token 提取。"""
    m = FM_RE.match(text)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        km = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if km:
            fm[km.group(1)] = km.group(2).strip()
    return fm


def fm_tokens(value: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9_./#-]+", value or "")


def collect_files() -> dict[str, Path]:
    files = {}
    if not PKG.exists():
        return files
    for p in sorted(PKG.rglob("*")):
        if p.is_file():
            files[rel(p)] = p
    return files


def check_missing(files: dict[str, Path]) -> bool:
    """N5：包/文件缺失报可读清单，不崩栈。"""
    required = [
        "skills/live2d-studio/SKILL.md",
        "skills/live2d-studio/references/index.md",
        "skills/live2d-studio/references/host-adapter.md",
        "skills/live2d-studio/references/ref-toolchain.md",
        "skills/live2d-studio/references/ref-skill-map.md",
        "skills/live2d-studio/references/vendor-manifest.md",
        "skills/live2d-studio/scripts/check_routing.py",
        "skills/live2d-studio/tests/routing_cases.json",
        "skills/live2d-studio/tests/behavior-evaluation.json",
        "skills/live2d-studio/tests/test_check_routing.py",
    ]
    domains = ["input-layering", "model-generation", "model-repair", "art-repair",
               "runtime-integration", "automation-mcp"]
    ops = ["backup-rebuild-psd", "export-and-audit-tags", "render-compare",
           "mouth-geometry-repair", "mouth-layer-crossfade", "publish-and-handoff"]
    required += [f"skills/live2d-studio/references/route-{d}.md" for d in domains]
    required += [f"skills/live2d-studio/references/pb-{o}.md" for o in ops]
    missing = [r for r in required if r not in files]
    if missing:
        print("== 缺失清单（可读报告，非崩溃） ==")
        for mname in missing:
            print(f"  MISSING  {mname}")
        print(f"共缺失 {len(missing)} 个必需文件。")
    return not missing


def check_budgets(files: dict[str, Path]) -> None:
    for name, p in files.items():
        if not name.startswith("skills/live2d-studio/") or not name.endswith(".md"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        n_lines, n_chars = text.count("\n") + 1, len(text)
        base = name.rsplit("/", 1)[-1]
        if base == "SKILL.md":
            b = BUDGETS["SKILL.md"]
            if n_lines > b["lines"] or n_chars > b["chars"]:
                err(f"[预算/L0 硬失败] {name}: {n_lines} 行 {n_chars} 字符 "
                    f"(限 {b['lines']} 行 {b['chars']} 字符)")
            continue
        for prefix, key in (("route-", "route"), ("pb-", "pb"), ("ref-", "ref"),
                            ("deep-", "ref"), ("stubs-", "stubs")):
            if not base.startswith(prefix):
                continue
            b = BUDGETS[key]
            if key == "pb":
                if n_lines > 300:
                    err(f"[预算/L2 硬失败] {name}: {n_lines} 行 > 300")
                elif n_lines > b["lines"]:
                    warn(f"[预算/L2 警告] {name}: {n_lines} 行 > {b['lines']}")
            elif key == "ref":
                if n_lines > 600:
                    err(f"[预算/L3 硬失败] {name}: {n_lines} 行 > 600")
                elif n_lines > b["lines"]:
                    warn(f"[预算/L3 警告] {name}: {n_lines} 行 > {b['lines']}")
            elif key == "stubs":
                if n_lines > b["lines"]:
                    err(f"[预算/stub 硬失败] {name}: {n_lines} 行 > {b['lines']}")
                elif n_lines < 5:
                    warn(f"[预算/stub 警告] {name}: {n_lines} 行 < 5（疑似缺字段内容）")
            else:  # route：行数硬、字符软
                if n_lines > b["lines"]:
                    err(f"[预算/L1 硬失败] {name}: {n_lines} 行 > {b['lines']}")


def check_frontmatter(files: dict[str, Path]) -> None:
    skill = files.get("skills/live2d-studio/SKILL.md")
    if skill:
        text = skill.read_text(encoding="utf-8", errors="replace")
        fm = parse_frontmatter(text)
        for field in ("name", "description", "platforms", "license", "metadata"):
            if field not in fm:
                err(f"[frontmatter] SKILL.md 缺字段: {field}")
        for field in ("name", "description", "platforms", "license"):
            if field in fm and not fm[field].strip().strip('"'):
                err(f"[frontmatter] {field} 必须非空")
        raw_fm = FM_RE.match(text)
        raw_fm_text = raw_fm.group(1) if raw_fm else ""
        tags = re.search(r"^\s+tags:\s*\[([^]]*)\]\s*$", raw_fm_text, re.M)
        if not tags or not tags.group(1).strip():
            err("[frontmatter] metadata.hermes.tags 必须非空")
        desc = fm.get("description", "").strip().strip('"')
        if desc and len(desc) > 60:
            err(f"[frontmatter] description {len(desc)} 字符 > 60")
        if desc and not desc.endswith((".", "。", "!", "！", "?", "？")):
            err("[frontmatter] description 须以句号结尾")
        if desc and not re.search(r"(路由|入口|分流)", desc):
            warn("[frontmatter/R2] description 未含角色词（路由/入口/分流），"
                 "可能与 live2d-psd-model-repair 争抢触发词")


def check_content_contracts(files: dict[str, Path]) -> None:
    """验证路线手册和操作手册承诺的最小语义结构。"""
    for name, path in files.items():
        if "/references/" not in name or not name.endswith(".md"):
            continue
        base = path.name
        text = path.read_text(encoding="utf-8", errors="replace")
        if base.startswith("route-"):
            required = {
                "归我": r"\*\*归我\*\*",
                "不归我": r"\*\*不归我\*\*",
                "完成判据": r"^## 完成判据\s*$",
                "诊断（回退锚）": r"^## 诊断（回退锚）\s*$",
            }
            for label, pattern in required.items():
                if not re.search(pattern, text, re.M):
                    err(f"[L1 内容契约] {name} 缺少「{label}」")
        elif base.startswith("pb-"):
            for heading in ("前置", "步骤", "完成判据", "回滚"):
                if not re.search(rf"^## {heading}(?:\s|（|$)", text, re.M):
                    err(f"[L2 内容契约] {name} 缺少「{heading}」章节")

    owner_name = "skills/live2d-studio/references/route-input-layering.md"
    owner = files.get(owner_name)
    if owner:
        fm = parse_frontmatter(owner.read_text(encoding="utf-8", errors="replace"))
        if "route: model-generation" not in fm.get("next_routes", ""):
            err("[生命周期编排] route-input-layering 的 next_routes 必须包含 model-generation")


def check_stubs(files: dict[str, Path]) -> None:
    for name, p in files.items():
        base = name.rsplit("/", 1)[-1]
        if base.startswith("stubs-") and name.endswith(".md"):
            text = p.read_text(encoding="utf-8", errors="replace")
            for field in ("是什么", "触发条件", "获取方式", "缺失降级"):
                if field not in text:
                    err(f"[stub 字段] {name} 缺必填段: {field}")


def check_links(files: dict[str, Path]) -> None:
    scope = {n: p for n, p in files.items() if n.startswith("skills/live2d-studio/")}
    for extra in ("README.md", "docs/HANDOFF.md"):
        p = REPO / extra
        if p.exists():
            scope[f"../{extra}" if False else extra] = p
    # 根 README / docs（权威正文）也纳入：被包引用的仓内目标
    for extra in ("docs/toolchain.md", "docs/skill-map.md"):
        p = REPO / extra
        if p.exists():
            scope[extra] = p

    for name, p in scope.items():
        if not name.endswith(".md"):
            continue  # 路径/链接检查只针对 md（校验脚本自身的正则字面量不自误报）
        text = p.read_text(encoding="utf-8", errors="replace")
        for line_no, line in enumerate(text.splitlines(), 1):
            if ABS_PATH_RE.search(line):
                err(f"[绝对路径禁令] {name}:{line_no}: 含机器本地路径")
        for target in LINK_RE.findall(text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            frag = None
            if "#" in target:
                target, frag = target.split("#", 1)
            if not target:
                continue
            resolved = (p.parent / target).resolve()
            if not resolved.exists():
                err(f"[链接] {name}:{line_no} → {target} 不存在")
                continue
            if frag and resolved.suffix == ".md":
                if frag not in file_anchors(resolved):
                    err(f"[锚点] {name}:{line_no} → {target}#{frag} 锚点不存在")


def check_graph(files: dict[str, Path]) -> None:
    """边分类（v4 §2.5）：requires=静态依赖边（禁循环）；order/next_routes=正向流程边（DAG）；
    fallback=诊断回退边（允许受控循环，max_retries 默认 1 上限 2）。"""
    refs = {n: p for n, p in files.items() if "/references/" in n and n.endswith(".md")}
    stem_of = {Path(n).stem: n for n in refs}

    def edges(p: Path, key: str) -> list[str]:
        fm = parse_frontmatter(p.read_text(encoding="utf-8", errors="replace"))
        return fm_tokens(fm.get(key, ""))

    require_edges: list[tuple[str, str]] = []
    flow_edges: list[tuple[str, str]] = []
    for name, p in refs.items():
        stem = Path(name).stem
        fm = parse_frontmatter(p.read_text(encoding="utf-8", errors="replace"))
        for dep in edges(p, "requires"):
            dep_stem = dep
            if dep_stem not in stem_of:
                err(f"[引用解析] {name}: requires 指向不存在的 {dep_stem}")
                continue
            require_edges.append((stem, dep_stem))
        for key in ("order", "verify_with"):
            for dep in edges(p, key):
                if dep not in stem_of:
                    err(f"[引用解析] {name}: {key} 指向不存在的 {dep}")
                else:
                    flow_edges.append((stem, dep))
        nxt = fm.get("next_routes", "")
        for route in re.findall(r"route:\s*([a-z0-9-]+)", nxt):
            target = f"route-{route}"
            if target not in stem_of:
                err(f"[引用解析] {name}: next_routes 指向不存在的 {target}")
            else:
                flow_edges.append((stem, target))
        fb = fm.get("fallback", "")
        for m in re.findall(r"max_retries:\s*(\d+)", fb):
            if int(m) > 2:
                err(f"[回退边] {name}: max_retries={m} > 上限 2")
        for to in re.findall(r"to:\s*([\w./#-]+)", fb):
            tgt = to.split("#")[0]
            if tgt and not (REFERENCES / tgt).exists() and not (PKG / tgt).exists():
                err(f"[回退边] {name}: fallback.to={to} 目标不存在")
        touches = fm_tokens(fm.get("touches", ""))
        req = fm_tokens(fm.get("requires", ""))
        if any(t in ("source", "export") for t in touches) and "backup" not in stem:
            # 备份 playbook 自身是"备份"唯一定义处，豁免自引要求
            if not any("backup" in r for r in req):
                err(f"[touches⇒requires] {name}: touches 含 source/export 但 requires 无 backup 项")

    def has_cycle(edges_: list[tuple[str, str]]) -> list[str]:
        graph: dict[str, list[str]] = {}
        for a, b in edges_:
            graph.setdefault(a, []).append(b)
        state: dict[str, int] = {}
        stack: list[str] = []

        def dfs(n: str) -> list[str] | None:
            state[n] = 1
            stack.append(n)
            for m in graph.get(n, []):
                if state.get(m) == 1:
                    return stack[stack.index(m):] + [m]
                if state.get(m, 0) == 0:
                    r = dfs(m)
                    if r:
                        return r
            state[n] = 2
            stack.pop()
            return None

        for n in list(graph):
            if state.get(n, 0) == 0:
                r = dfs(n)
                if r:
                    return r
        return []

    for label, edges_ in (("requires 静态依赖边", require_edges),
                          ("order/next_routes 正向流程边", flow_edges)):
        cyc = has_cycle(edges_)
        if cyc:
            err(f"[循环] {label} 存在循环: {' -> '.join(cyc)}")


def check_reachability(files: dict[str, Path]) -> None:
    print("== 可达性白名单（理由如下，每次运行打印） ==")
    for name, reason in REACHABILITY_WHITELIST.items():
        print(f"  EXEMPT  {name} —— {reason}")
    skill = files.get("skills/live2d-studio/SKILL.md")
    if not skill:
        return
    text = skill.read_text(encoding="utf-8", errors="replace")
    reachable = set()
    queue = ["skills/live2d-studio/SKILL.md"]
    seen = set()
    graph: dict[str, set[str]] = {}
    for name, p in files.items():
        if not name.endswith(".md"):
            continue
        targets = set()
        for target in LINK_RE.findall(p.read_text(encoding="utf-8", errors="replace")):
            if target.startswith(("http://", "mailto:")):
                continue
            target = target.split("#", 1)[0]
            if not target:
                continue
            resolved = (p.parent / target).resolve()
            for n2, p2 in files.items():
                if p2.resolve() == resolved:
                    targets.add(n2)
        graph[name] = targets
    while queue:
        cur = queue.pop()
        if cur in seen:
            continue
        seen.add(cur)
        reachable.add(cur)
        queue.extend(graph.get(cur, set()))
    for name in files:
        if not name.startswith("skills/live2d-studio/references/"):
            continue
        if name in REACHABILITY_WHITELIST:
            continue
        if name not in reachable:
            err(f"[可达性] {name} 从 SKILL.md 不可达且不在白名单")


def markdown_reachable(start: Path, target: Path, files: dict[str, Path]) -> bool:
    """仅沿技能包内 Markdown 链接检查目标是否从指定 L1 可达。"""
    by_resolved = {p.resolve(): p for p in files.values() if p.suffix == ".md"}
    queue = [start.resolve()]
    seen: set[Path] = set()
    wanted = target.resolve()
    while queue:
        current = queue.pop()
        if current == wanted:
            return True
        if current in seen or current not in by_resolved:
            continue
        seen.add(current)
        text = by_resolved[current].read_text(encoding="utf-8", errors="replace")
        for link in LINK_RE.findall(text):
            if link.startswith(("http://", "https://", "mailto:")):
                continue
            relative = link.split("#", 1)[0]
            if not relative:
                continue
            resolved = (by_resolved[current].parent / relative).resolve()
            if resolved in by_resolved and resolved not in seen:
                queue.append(resolved)
    return False


def check_routing_cases(files: dict[str, Path]) -> None:
    case_file = files.get("skills/live2d-studio/tests/routing_cases.json")
    if not case_file:
        return
    try:
        data = json.loads(case_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        err(f"[routing_cases] JSON 解析失败: {exc}")
        return
    skill_text = files["skills/live2d-studio/SKILL.md"].read_text(encoding="utf-8") \
        if "skills/live2d-studio/SKILL.md" in files else ""
    seen_ids: set[str] = set()
    for case in data.get("cases", []):
        case_id = case.get("id", "?")
        for field in ("id", "symptom", "expect_l1", "stage"):
            if field not in case:
                err(f"[routing_cases] 用例缺字段 {field}: {case_id}")
        if case_id in seen_ids:
            err(f"[routing_cases] 用例 id 重复: {case_id}")
        seen_ids.add(case_id)
        if case.get("external_skill") == "missing" and "S4" not in case.get("stage", []):
            err(f"[routing_cases] {case_id}: external_skill=missing 必须包含 S4")
        if case.get("external_skill") == "available" and "S4" in case.get("stage", []):
            err(f"[routing_cases] {case_id}: 已安装场景不得同时声明 S4 缺失降级")

        l1_paths: list[Path] = []
        for tgt in case.get("expect_l1", []):
            path = f"skills/live2d-studio/references/{tgt}"
            if path not in files:
                err(f"[routing_cases] {case_id}: 期望目标不存在 {tgt}")
            else:
                l1_paths.append(files[path])
        for key in ("expect_pb", "expect_ref"):
            for tgt in case.get(key, []) if isinstance(case.get(key), list) else \
                    ([case[key]] if case.get(key) else []):
                path = f"skills/live2d-studio/references/{tgt}"
                if path not in files:
                    err(f"[routing_cases] {case_id}: 期望目标不存在 {tgt}")
                    continue
                if l1_paths and not any(markdown_reachable(start, files[path], files)
                                        for start in l1_paths):
                    err(f"[routing_cases] {case_id}: {tgt} 无法从期望 L1 沿链接到达")
        for kw in case.get("l0_keywords", []):
            if kw not in skill_text:
                err(f"[routing_cases] {case_id}: L0 路由表未含关键词「{kw}」")


def check_heuristics(files: dict[str, Path]) -> None:
    skill = files.get("skills/live2d-studio/SKILL.md")
    if skill:
        text = skill.read_text(encoding="utf-8", errors="replace")
        numbered = len(re.findall(r"^\s*\d+\.\s+\S", text, re.M))
        codeblocks = text.count("```") // 2
        if numbered >= 3 or codeblocks >= 2:
            warn(f"[L0 零配方启发式] SKILL.md 疑似含配方（编号步骤 {numbered}、代码块 {codeblocks}）")
    # 跨层去重：仅警告（防安全术语误报）
    texts = {n: p.read_text(encoding="utf-8", errors="replace")
             for n, p in files.items() if "/references/" in n and n.endswith(".md")}
    names = list(texts)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            la = set(l for l in texts[a].splitlines() if len(l.strip()) > 30)
            lb = set(l for l in texts[b].splitlines() if len(l.strip()) > 30)
            if la and lb:
                overlap = len(la & lb) / min(len(la), len(lb))
                if overlap > 0.5:
                    warn(f"[去重启发式] {a} 与 {b} 长行重合率 {overlap:.0%}（疑似内联复制）")


def check_release_gate(files: dict[str, Path]) -> None:
    vm = files.get("skills/live2d-studio/references/vendor-manifest.md")
    if not vm:
        err("[release] vendor-manifest.md 缺失")
        return
    text = vm.read_text(encoding="utf-8", errors="replace")
    if "TODO" in text:
        err("[release] vendor-manifest.md 仍含 TODO（G4 未就绪）")
    if "未声明" in text or "禁止公开分发" in text:
        err("[release] 迁入内容许可未获公开分发授权（G4 未就绪）")
    if not (REPO / "LICENSE").exists():
        err("[release] 仓库根 LICENSE 缺失（G3 未就绪）")
    evaluation = files.get("skills/live2d-studio/tests/behavior-evaluation.json")
    if not evaluation:
        err("[release] behavior-evaluation.json 缺失（G5 未就绪）")
        return
    try:
        record = json.loads(evaluation.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        err(f"[release] behavior-evaluation.json 解析失败: {exc}")
        return
    if record.get("status") != "completed" or record.get("passed") is not True:
        err("[release] 行为评测尚未完成并通过（G5 未就绪）")
    if not record.get("method") or not record.get("run_at"):
        err("[release] 行为评测记录缺 method/run_at（G5 未就绪）")
    if not record.get("cases"):
        err("[release] 行为评测记录缺逐用例结果（G5 未就绪）")


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    files = collect_files()
    print(f"== live2d-studio 结构校验 ==\n包: {rel(PKG)}\n")
    complete = check_missing(files)
    if not complete:
        return 1
    check_budgets(files)
    check_frontmatter(files)
    check_content_contracts(files)
    check_stubs(files)
    check_links(files)
    check_graph(files)
    check_reachability(files)
    check_routing_cases(files)
    check_heuristics(files)
    if "--release" in sys.argv:
        check_release_gate(files)
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"FAIL  {e}")
    print(f"\n结果: {len(errors)} 失败 / {len(warnings)} 警告")
    return 1 if errors else 0


def self_test() -> int:
    """关键规则的少量内置测试（标准库）。"""
    assert slugify("归我 / 不归我") == "归我--不归我" or "归我" in slugify("归我 / 不归我")
    assert fm_tokens("[pb-a, pb-b]") == ["pb-a", "pb-b"]
    assert not FM_RE.match("no frontmatter")
    assert FM_RE.match("---\nname: x\n---\nbody")
    assert not ABS_PATH_RE.search("避免 file:// fetch 限制")
    assert ABS_PATH_RE.search("C:/Users/example/tool")
    print("self-test: 4 组断言通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
