"""Model issues retain original evidence and identify only proven layer mappings."""
import re


def _material_issues(parts, classifications):
    """Advise on the generated base rig, using DrawableBuilder's mask matching rules."""
    layers = [layer for layer in classifications if layer.get("drawable")]
    eye_sides = {layer["side"] for layer in layers if layer["semanticTag"] == "EYEWHITE"}
    # Mouth masking ultimately falls back to any mouth, regardless of side/variant.
    has_mouth = any(layer["semanticTag"] in ("MOUTH", "MOUTH_OPEN") for layer in layers)
    names = {part["id"]: part["name"] for part in parts}
    issues = {}
    for layer in layers:
        tag = layer["semanticTag"]
        if tag == "IRIDES" and layer["side"] not in eye_sides and "NONE" not in eye_sides:
            code = "MISSING_EYEWHITE"
            advice = "虹膜部件缺少同侧或通用眼白作为裁剪来源；请检查眼白分类、左右侧或补充素材。"
        elif tag in ("TOOTH_T", "TOOTH_B", "TONGUE") and not has_mouth:
            code = "MISSING_MOUTH_APERTURE"
            advice = "口腔内部件缺少嘴部主体作为裁剪来源；请检查 MOUTH / MOUTH_OPEN 分类或补充素材，闭嘴线不能作为口腔裁剪来源。"
        else:
            continue
        part_id = layer["partId"]
        # One source part may be split into several native components.
        issues[(part_id, code)] = {"code": code, "severity": "warning", "stage": "classification",
            "partId": part_id, "message": f"当前基础模型中，图层 {names[part_id]} 的{advice} 此提示不阻止继续编辑或导出。",
            "action": "select-part"}
    return list(issues.values())


def model_issues(view, root, state):
    from .workspace_store import read
    from .workspace_query import model_record_matches, overlay_inputs
    from .build_settings import load_settings, settings_record_matches
    issues = []
    classifications = view.get("build", {}).get("classifications", []) if view.get("build") else []
    current = not view["stale"]["base_rig"]
    for part in view["ir"]["parts"]:
        adopted = [c["semanticTag"] for c in classifications if c["partId"] == part["id"]] if current else []
        tag = part["semantic"].get("override", {}).get("tag", part["semantic"]["tag"])
        if (adopted and "UNKNOWN" in adopted) or (not adopted and tag == "UNKNOWN"):
            issues.append({"code": "UNKNOWN_CLASSIFICATION", "severity": "error", "stage": "classification",
                           "partId": part["id"], "message": f"图层 {part['name']} 未识别；在部件设置中指定类别，再更新模型。", "action": "select-part"})
    for reason in view["overlay"]["reasons"]:
        parameter = re.search(r"parameter: ?([^=\s]+)", reason)
        issue = {"code": "INVALID_PARAMETER" if parameter else "OVERLAY_CONFLICT", "severity": "error", "stage": "overlay", "message": reason, "action": "show-overlay"}
        if parameter: issue["field"] = parameter.group(1)
        issues.append(issue)
    attempt = state.get("lastBuildAttempt")
    if attempt and attempt["status"] != "ok":
        directory = root / attempt["directory"]; failed = read(directory / "failed-report.json")
        built_ir = directory / "build-ir.json"
        settings = view["buildSettings"]["settings"]; built_settings = load_settings(directory)
        same = (attempt.get("overlayInputs") == overlay_inputs(root, state) and settings_record_matches(attempt, settings, built_settings)
                and (attempt.get("revision") == view["revision"] or (built_ir.exists() and model_record_matches(failed, view["ir"], read(built_ir), settings, built_settings))))
        if same:
            for reason in failed.get("reasons", []):
                if any(issue["message"] == reason for issue in issues): continue
                parameter = re.search(r"(?:parameter: |parameter:)([^=\s]+)", reason)
                issue = {"code": "INVALID_PARAMETER" if parameter else "BUILD_FAILED", "severity": "error", "stage": "build", "message": reason,
                         "action": "show-overlay" if state["overlay"] else "rebuild"}
                if parameter: issue["field"] = parameter.group(1)
                issues.append(issue)
    if current:
        issues.extend(_material_issues(view["ir"]["parts"], classifications))
    return issues
