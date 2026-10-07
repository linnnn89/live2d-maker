"""Model issues retain original evidence and identify only proven layer mappings."""
import re


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
    return issues
