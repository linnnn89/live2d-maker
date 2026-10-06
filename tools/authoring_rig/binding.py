"""Bind IR identities to native source layers using the freshly written PSD ID map."""


def build_configuration(data, built_layers):
    parts = {part["id"]: part for part in data["parts"]}
    if len(built_layers) != len(parts) or {layer["partId"] for layer in built_layers} != set(parts):
        raise ValueError("Rebuilt PSD identity mapping does not match IR")
    source_ids = [layer["sourceLayerId"] for layer in built_layers]
    if len(set(source_ids)) != len(source_ids):
        raise ValueError("Rebuilt PSD source IDs are not unique")
    overrides = {}
    for layer in built_layers:
        override = parts[layer["partId"]]["semantic"].get("override")
        if override is not None:
            overrides[layer["sourceLayerId"]] = {"tag": override["tag"], "side": override["side"].upper()}
    return {"layerOverrides": overrides}


def classification_audit(data, built_layers, native_layers):
    by_source = {layer["sourceLayerId"]: layer["partId"] for layer in built_layers}
    parts = {part["id"]: part for part in data["parts"]}
    result = []
    components = set()
    for layer in native_layers:
        source = layer.get("sourceLayerId")
        component = layer.get("componentId")
        if source not in by_source or not component or component in components:
            raise ValueError("Native classification has missing, unknown or duplicate source/component identity; rebuild current native JAR")
        components.add(component)
        part_id = by_source[source]
        result.append({**layer, "partId": part_id, "requestedOverride": parts[part_id]["semantic"].get("override")})
    return result
