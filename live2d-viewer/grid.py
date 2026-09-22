"""Compose a labelled contact sheet from a directory of snapshot PNGs (wraps sheet.sheet)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet import sheet

directory = Path(sys.argv[1])
out = Path(sys.argv[2])
items = [(path.stem, str(path)) for path in sorted(directory.glob("*.png")) if path.name != out.name]
sheet(items, str(out), cols=int(sys.argv[3]) if len(sys.argv) > 3 else 3)
print(f"wrote {out} from {len(items)} snapshots")
