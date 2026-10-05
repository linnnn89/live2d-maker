"""Check the pinned local Cubism runtime, without downloading or modifying it."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORE_SHA256_LF = "8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47"
SHADERS = (
    "fragshadersrccopy.frag", "fragshadersrccolorblend.frag", "fragshadersrcalphablend.frag",
    "fragshadersrcmaskinvertedpremultipliedalpha.frag", "fragshadersrcmaskpremultipliedalpha.frag",
    "vertshadersrcsetupmask.vert", "vertshadersrcmasked.vert", "vertshadersrccopy.vert",
    "vertshadersrcblend.vert", "vertshadersrc.vert", "fragshadersrcsetupmask.frag",
    "fragshadersrcpremultipliedalphablend.frag", "fragshadersrcpremultipliedalpha.frag",
)


def check_runtime(root=HERE / "public" / "vendor" / "cubism"):
    root = Path(root)
    required = ["live2dcubismcore.min.js", "framework.js", "FRAMEWORK-LICENSE.md"]
    required += [f"shaders/{name}" for name in SHADERS]
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise ValueError(f"Missing runtime files: {missing}. Copy the complete cubism directory "
                         "from I:/LIVE2DCHAT/public/vendor/cubism/; see the vendor README for the pinned build.")
    core = (root / required[0]).read_bytes()
    raw_hash = hashlib.sha256(core).hexdigest()
    lf_hash = hashlib.sha256(core.replace(b"\r\n", b"\n")).hexdigest()
    if lf_hash != CORE_SHA256_LF:
        raise ValueError(f"Core SHA-256 mismatch: {raw_hash} (LF: {lf_hash})")
    if "Live2DChatCubismFramework" not in (root / "framework.js").read_text(encoding="utf-8"):
        raise ValueError("Framework bundle is missing the expected global export")
    return {"status": "ok", "core_sha256": raw_hash, "core_sha256_lf": lf_hash,
            "required_files": len(required)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--vendor", type=Path, default=HERE / "public" / "vendor" / "cubism")
    args = ap.parse_args()
    try:
        result = check_runtime(args.vendor)
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
