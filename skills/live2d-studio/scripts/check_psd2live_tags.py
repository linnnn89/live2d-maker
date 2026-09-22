#!/usr/bin/env python3
"""Summarise a PSD2Live export's layer semantics and flag likely binding bugs.

Usage:
    python check_psd2live_tags.py <export-dir-or-psd2live.json> [--json]

Why: a layer whose name misses the classifier alias table silently becomes tag
`unknown` and is folded into the head/body container by bounding box, so it
loses its own deformer and any parameter bonding. That looks like "the part does
not move" / "it just follows the head", and it is invisible in the PSD itself.
Run this right after every export, before rendering or publishing.
"""

import json
import sys
from pathlib import Path

# Tags whose layers are expected to be driven by physics/parameters.
PHYSICS_EXPECTING = {"back hair", "front hair"}
INTERESTING = {
    "back hair",
    "front hair",
    "face",
    "face detail",
    "body",
    "topwear",
    "bottomwear",
}


def find_json(path: Path) -> Path:
    if path.is_dir():
        hits = sorted(path.glob("*.psd2live.json"))
        if not hits:
            sys.exit(f"no *.psd2live.json under {path}")
        return hits[0]
    return path


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    as_json = "--json" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--json"]
    js = find_json(Path(args[0]).resolve())
    doc = json.loads(js.read_text(encoding="utf-8"))

    layers = doc.get("layers") or []
    unknown = []
    rows = []
    for i, layer in enumerate(layers):
        tag = (layer.get("tag") or "unknown").strip()
        name = layer.get("source") or layer.get("name") or f"#{i}"
        side = layer.get("side") or ""
        param = layer.get("parameter") or layer.get("switchId") or ""
        rows.append((i, name, tag, side, param, layer.get("type") or ""))
        if tag.lower() == "unknown":
            unknown.append(name)

    if as_json:
        print(json.dumps({"file": str(js), "layers": rows, "unknown": unknown}, ensure_ascii=False, indent=2))
        return 0

    print(f"# {js}")
    summary = doc.get("summary")
    if summary:
        print(f"# summary: {summary}")
    print(f"{'idx':>3}  {'tag':<12} {'side':<6} {'param':<22} name")
    for i, name, tag, side, param, _type in rows:
        flag = " <== UNKNOWN" if tag.lower() == "unknown" else ""
        print(f"{i:>3}  {tag[:12]:<12} {side[:6]:<6} {param[:22]:<22} {name}{flag}")

    print()
    for tag in sorted(PHYSICS_EXPECTING):
        if not any(r[2].lower() == tag for r in rows):
            print(f"WARN  no layer tagged '{tag}' -- that part cannot be driven by its physics parameter")
    if unknown:
        print(f"WARN  {len(unknown)} unknown-tagged layer(s) fall back to bounding-box placement: {', '.join(unknown)}")
    seen = {r[2].lower() for r in rows}
    print(f"tags present: {', '.join(sorted(t for t in seen if t in INTERESTING)) or '(none of the usual part tags)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
