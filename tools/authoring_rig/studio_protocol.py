"""Studio v1 envelope validation; full IR/asset validation stays in the persistence layer."""
import json
from functools import lru_cache
from pathlib import Path
from jsonschema import Draft7Validator

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas/studio/protocol.schema.json"


class StudioError(ValueError):
    def __init__(self, code, message, stage="workspace", retryable=False, part_id=None, field=None):
        super().__init__(message)
        self.detail = {"code": code, "message": message, "stage": stage, "retryable": retryable}
        if part_id is not None:
            self.detail["partId"] = part_id
        if field is not None:
            self.detail["field"] = field


@lru_cache(maxsize=None)
def validator(name):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft7Validator.check_schema(schema)
    return Draft7Validator({**schema, "$ref": f"#/definitions/{name}"})


def validate_protocol(name, value):
    error = next(validator(name).iter_errors(value), None)
    if error:
        field = str(next(reversed(error.absolute_path), ""))
        message = "Invalid import preview ID" if name == "ImportCommitRequest" and field == "id" else f"{name}: {error.message}"
        raise StudioError("INVALID_REQUEST", message, "protocol", field=field)


def error_detail(error, command):
    if isinstance(error, StudioError):
        return error.detail
    if isinstance(error, (json.JSONDecodeError, TypeError, KeyError)):
        code = "INVALID_REQUEST"
    elif isinstance(error, FileNotFoundError):
        code = "WORKSPACE_NOT_FOUND"
    elif command == "studio-rebuild":
        code = "BUILD_FAILED"
    elif command == "studio-qa":
        code = "QA_FAILED"
    elif command.startswith("studio-import"):
        code = "IMPORT_FAILED"
    elif command == "studio-save":
        code = "SAVE_FAILED"
    else:
        code = "WORKSPACE_FAILED"
    return {"code": code, "stage": command.removeprefix("studio-"), "message": str(error), "retryable": False}
