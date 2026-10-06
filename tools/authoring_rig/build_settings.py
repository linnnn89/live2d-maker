"""Versioned project build preferences, separate from the artwork-only IR."""
import copy
import json
from pathlib import Path
from .stale import _canonical_hash
from .studio_protocol import validate_protocol

DEFAULT_SETTINGS = {"schemaVersion": 1, "atlasSize": 2048, "meshInteriorDensity": 40, "headTurnStrength": 1}


def load_settings(root):
    path = Path(root) / "build-settings.json"
    value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else copy.deepcopy(DEFAULT_SETTINGS)
    validate_protocol("BuildSettings", value)
    return value


def settings_signature(settings):
    return _canonical_hash(settings)


def settings_record_matches(record, settings, built_settings):
    if "buildSettingsSignature" in record:
        return record["buildSettingsSignature"] == settings_signature(settings) == settings_signature(built_settings)
    # Older reports can prove only the formerly fixed preview defaults.
    return settings == DEFAULT_SETTINGS and built_settings == DEFAULT_SETTINGS
