"""Command-line interface for authoring-rig toolkit.

Subcommands:
    export      PSD -> authoring-rig.json + assets/
    build-psd   authoring-rig.json + assets/ -> PSD
    validate    authoring-rig.json integrity check

Contract (docs/PLAN.md Section 2):
    - Output valid JSON to stdout
    - Exit non-zero on failure
    - Diagnostics and progress go to stderr
"""
import argparse
import json
import sys
from pathlib import Path

# Add project root to sys.path so authoring_rig can be imported
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(HERE.parent) not in sys.path:
    sys.path.insert(0, str(HERE.parent))

from authoring_rig.builder import build_psd
from authoring_rig.exporter import export_psd
from authoring_rig.manifest import export_manifest
from authoring_rig.stale import check_overlay_compatibility, evaluate_dag_stale
from authoring_rig.validator import ValidationError, validate_authoring_rig


def cmd_export(args):
    print(f"[authoring-rig] Exporting {args.psd or args.manifest} to {args.outdir}...", file=sys.stderr)
    ir_data = export_psd(args.psd, args.outdir) if args.psd else export_manifest(args.manifest, args.outdir)
    # Validate right after export
    out_dir = Path(args.outdir)
    validate_authoring_rig(ir_data, base_dir=out_dir)
    print(f"[authoring-rig] Exported {len(ir_data['parts'])} part(s) successfully.", file=sys.stderr)
    print(json.dumps({
        "status": "ok",
        "action": "export",
        "canvas": ir_data["canvas"],
        "parts_count": len(ir_data["parts"]),
        "ir_file": str(out_dir / "authoring-rig.json"),
    }, indent=2, ensure_ascii=False))
    return 0


def cmd_build_psd(args):
    print(f"[authoring-rig] Building PSD from {args.ir} to {args.outpsd}...", file=sys.stderr)
    result = build_psd(args.ir, args.outpsd)
    print(f"[authoring-rig] Built {result['layers_built']} layer(s) into {args.outpsd}.", file=sys.stderr)
    print(json.dumps({
        "status": "ok",
        "action": "build-psd",
        "layers_built": result["layers_built"],
        "output_psd": result["output_psd"],
    }, indent=2, ensure_ascii=False))
    return 0


def cmd_validate(args):
    ir_path = Path(args.ir).resolve()
    print(f"[authoring-rig] Validating {ir_path}...", file=sys.stderr)
    if not ir_path.exists():
        raise FileNotFoundError(f"IR file does not exist: {ir_path}")
    data = json.loads(ir_path.read_text(encoding="utf-8"))
    msgs = validate_authoring_rig(data, base_dir=ir_path.parent)
    for m in msgs:
        print(f"  [info] {m}", file=sys.stderr)
    print(json.dumps({
        "status": "ok",
        "action": "validate",
        "ir_file": str(ir_path),
        "parts_count": len(data.get("parts", [])),
    }, indent=2, ensure_ascii=False))
    return 0


def cmd_stale(args):
    old_p = Path(args.old).resolve()
    new_p = Path(args.new).resolve()
    if not old_p.exists():
        raise FileNotFoundError(f"Old IR file does not exist: {old_p}")
    if not new_p.exists():
        raise FileNotFoundError(f"New IR file does not exist: {new_p}")
    old_data = json.loads(old_p.read_text(encoding="utf-8"))
    new_data = json.loads(new_p.read_text(encoding="utf-8"))
    validate_authoring_rig(old_data)
    validate_authoring_rig(new_data)

    eval_result = evaluate_dag_stale(old_data, new_data)
    out = {
        "status": "ok",
        "action": "stale",
        "stale": eval_result["stale"],
        "reasons": {k: v for k, v in eval_result["reasons"].items() if v},
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


def cmd_check_overlay(args):
    ir_p = Path(args.ir).resolve()
    ov_p = Path(args.overlay).resolve()
    if not ir_p.exists():
        raise FileNotFoundError(f"IR file does not exist: {ir_p}")
    if not ov_p.exists():
        raise FileNotFoundError(f"Overlay file does not exist: {ov_p}")
    ir_data = json.loads(ir_p.read_text(encoding="utf-8"))
    ov_data = json.loads(ov_p.read_text(encoding="utf-8"))

    validate_authoring_rig(ir_data)
    base_objects = json.loads(Path(args.base_objects).read_text(encoding="utf-8")) if args.base_objects else None
    res = check_overlay_compatibility(ov_data, ir_data, base_objects)
    out = {
        "action": "check-overlay",
        "status": res["status"],
        "native_apply_required": res["native_apply_required"],
        "broken_targets": res["broken_targets"],
        "review_targets": res["review_targets"],
        "reasons": res["reasons"],
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0 if res["status"] == "ok" else 1


def cmd_native(args):
    from authoring_rig.native import native_base, native_replay
    if args.command == "native-base":
        result = native_base(args.psd, args.outdir, args.native_jar)
    else:
        result = native_replay(args.psd, args.overlay, args.baseline, args.outdir, args.native_jar)
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    return 0 if result["status"] == "ok" else 1


def cmd_import_generated(args):
    from authoring_rig.generated import import_generated
    result = import_generated(args.ir, args.generated, args.mask, args.bounds, args.name,
                              args.prompt_file, args.outdir, args.replace_part, args.fit, args.sprite_bounds)
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    return 0


def cmd_studio(args):
    from authoring_rig.studio import (open_workspace, snapshot, save_workspace, rebuild_workspace,
                                     qa_workspace, preview_generated, commit_generated, save_build_settings)
    if args.command == "studio-open":
        result = open_workspace(args.workspace, args.ir, args.psd, args.overlay, args.overlay_baseline)
    elif args.command == "studio-snapshot":
        result = snapshot(args.workspace)
    elif args.command == "studio-save":
        result = save_workspace(args.workspace, json.load(sys.stdin))
    elif args.command == "studio-build-settings":
        result = save_build_settings(args.workspace, json.load(sys.stdin))
    elif args.command == "studio-rebuild":
        result = rebuild_workspace(args.workspace)
    elif args.command == "studio-import-preview":
        result = preview_generated(args.workspace, json.load(sys.stdin))
    elif args.command == "studio-import-commit":
        result = commit_generated(args.workspace, json.load(sys.stdin))
    else:
        result = qa_workspace(args.workspace, args.port)
    from authoring_rig.studio_protocol import validate_protocol
    result["schemaVersion"] = 1
    # Validate the JSON wire value: Pillow returns tuple bounds, serialized as arrays.
    result = json.loads(json.dumps(result, ensure_ascii=False, allow_nan=False))
    validate_protocol("ImportPreview" if args.command == "studio-import-preview" else "Snapshot", result)
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    return 0


def main():
    ap = argparse.ArgumentParser(description="Authoring Rig IR Toolkit")
    sub = ap.add_subparsers(dest="command", required=True)

    # export
    p_exp = sub.add_parser("export", help="Export PSD or source-manifest to IR + assets/")
    inputs = p_exp.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--psd", help="Path to input PSD file")
    inputs.add_argument("--manifest", help="Path to source-manifest JSON and its cropped PNG layers")
    p_exp.add_argument("--outdir", required=True, help="Directory to output IR and assets")
    p_exp.set_defaults(func=cmd_export)

    # build-psd
    p_bld = sub.add_parser("build-psd", help="Build PSD from authoring-rig.json + assets/")
    p_bld.add_argument("--ir", required=True, help="Path to authoring-rig.json")
    p_bld.add_argument("--outpsd", required=True, help="Path for generated PSD file")
    p_bld.set_defaults(func=cmd_build_psd)

    # validate
    p_val = sub.add_parser("validate", help="Validate authoring-rig.json integrity")
    p_val.add_argument("--ir", required=True, help="Path to authoring-rig.json")
    p_val.set_defaults(func=cmd_validate)

    p_gen = sub.add_parser("import-generated", help="Register a transparent ImageGen sprite inside a strict binary mask")
    p_gen.add_argument("--ir", required=True)
    p_gen.add_argument("--generated", required=True, help="Transparent RGBA PNG sprite")
    p_gen.add_argument("--mask", required=True, help="Canvas-sized binary grayscale PNG; white editable, black protected")
    p_gen.add_argument("--bounds", nargs=4, type=int, required=True, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    p_gen.add_argument("--name", required=True, help="PSD2Live-recognized layer name")
    p_gen.add_argument("--prompt-file", required=True)
    p_gen.add_argument("--replace-part", help="Existing part ID to replace; otherwise add a new top layer")
    p_gen.add_argument("--fit", action="store_true", help="Explicitly alpha-crop and aspect-fit the sprite into bounds")
    p_gen.add_argument("--sprite-bounds", nargs=4, type=int, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"),
                       help="Explicit source crop; excluded alpha is recorded and original PNG retained")
    p_gen.add_argument("--outdir", required=True, help="New directory outside the source IR directory")
    p_gen.set_defaults(func=cmd_import_generated)

    # stale
    p_stl = sub.add_parser("stale", help="Evaluate DAG stale stages between two IR states")
    p_stl.add_argument("--old", required=True, help="Path to old authoring-rig.json")
    p_stl.add_argument("--new", required=True, help="Path to new authoring-rig.json")
    p_stl.set_defaults(func=cmd_stale)

    # check-overlay
    p_ov = sub.add_parser("check-overlay", help="Check overlay compatibility with base rig derived from IR")
    p_ov.add_argument("--ir", required=True, help="Path to authoring-rig.json")
    p_ov.add_argument("--overlay", required=True, help="Path to overlay JSON")
    p_ov.add_argument("--base-objects", help="Complete JSON array of native rig_get_object snapshots after rebuild")
    p_ov.set_defaults(func=cmd_check_overlay)

    p_native = sub.add_parser("native-base", help="Export pinned native base rig and full topology/rest evidence")
    p_native.add_argument("--psd", required=True)
    p_native.add_argument("--outdir", required=True, help="Empty output directory")
    p_native.add_argument("--native-jar", help="Built application JAR; use the bundled pinned JVM/dependencies")
    p_native.set_defaults(func=cmd_native)
    p_replay = sub.add_parser("native-replay", help="Replay supported native keyform and parameter edits against a pinned baseline")
    p_replay.add_argument("--psd", required=True)
    p_replay.add_argument("--overlay", required=True)
    p_replay.add_argument("--baseline", required=True)
    p_replay.add_argument("--outdir", required=True, help="Empty output directory")
    p_replay.add_argument("--native-jar", help="Same built application JAR used for the baseline")
    p_replay.set_defaults(func=cmd_native)

    for command in ("studio-open", "studio-snapshot", "studio-save", "studio-rebuild", "studio-qa",
                    "studio-import-preview", "studio-import-commit", "studio-build-settings"):
        studio = sub.add_parser(command, help="Local Studio workspace operation")
        studio.add_argument("--workspace", required=True)
        if command == "studio-open":
            source = studio.add_mutually_exclusive_group()
            source.add_argument("--ir")
            source.add_argument("--psd")
            studio.add_argument("--overlay")
            studio.add_argument("--overlay-baseline")
        if command == "studio-qa":
            studio.add_argument("--port", type=int, required=True, help="Running Studio Vite server port")
        studio.set_defaults(func=cmd_studio)

    args = ap.parse_args()

    try:
        return args.func(args)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        result = {"status": "error", "error": str(e)}
        if args.command.startswith("studio-"):
            from authoring_rig.studio_protocol import error_detail
            result.update({"schemaVersion": 1, "detail": error_detail(e, args.command)})
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
