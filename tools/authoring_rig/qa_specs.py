"""Small, model-aware pose selection for Studio's existing Cubism QA runner."""


def build_pose_spec(model_url, canvas, parameters):
    """Use native build metadata; custom/user-authored specs remain unchanged.

    Sampling parameter endpoints does not establish that they produce good art.
    Named actions use conventional values only when the model supports them.
    """
    available = {parameter["id"]: parameter for parameter in parameters}
    shots = [{"name": "neutral", "params": {}}]
    seen = {()}
    unavailable = {}

    def add(name, values):
        outside = [key for key, value in values.items()
                   if not available[key]["min"] <= value <= available[key]["max"]]
        if outside:
            unavailable[name] = "Required value outside parameter range: " + ", ".join(outside)
            return
        # Reset before each shot restores defaults, so explicit defaults and an
        # omitted parameter describe the same pose. Keep the first useful name.
        state = tuple(sorted((key, value) for key, value in values.items()
                             if value != available[key]["default"]))
        if state not in seen:
            shots.append({"name": name, "params": values})
            seen.add(state)

    def endpoints(parameter):
        if parameter not in available:
            unavailable[parameter] = "Parameter not present"
            return
        for endpoint in ("min", "max"):
            add(parameter + "_" + endpoint, {parameter: available[parameter][endpoint]})

    for parameter in ("ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamBodyAngleX"):
        endpoints(parameter)

    mouth = "ParamMouthOpenY"
    if mouth in available:
        for name, value in (("mouth_closed", 0), ("mouth_half", 0.5), ("mouth_open", 1)):
            add(name, {mouth: value})
    endpoints(mouth)

    eyes = [key for key in ("ParamEyeLOpen", "ParamEyeROpen") if key in available]
    if eyes:
        for name, value in (("eyes_closed", 0), ("eyes_half", 0.5), ("eyes_open", 1)):
            add(name, {key: value for key in eyes})
        for eye in eyes:
            endpoints(eye)
    else:
        unavailable["eyes"] = "No eye-open parameters"

    hair = [key for key in ("ParamHairFront", "ParamHairBack", "ParamHairSide") if key in available]
    if hair:
        for endpoint in ("min", "max"):
            add("hair_" + endpoint, {key: available[key][endpoint] for key in hair})
    else:
        unavailable["hair"] = "No hair parameters"

    # A few useful interactions, not every parameter combination.
    if "ParamAngleX" in available and "ParamAngleY" in available:
        for x in ("min", "max"):
            for y in ("min", "max"):
                add(f"head_x_{x}_y_{y}", {"ParamAngleX": available["ParamAngleX"][x],
                                          "ParamAngleY": available["ParamAngleY"][y]})
    else:
        unavailable["head_xy"] = "Requires ParamAngleX and ParamAngleY"
    if eyes and "ParamAngleX" in available:
        for endpoint in ("min", "max"):
            add("head_x_" + endpoint + "_eyes_closed",
                {"ParamAngleX": available["ParamAngleX"][endpoint], **{key: 0 for key in eyes}})
    else:
        unavailable["head_x_eyes_closed"] = "Requires ParamAngleX and an eye-open parameter"
    if eyes and mouth in available:
        add("eyes_closed_mouth_open", {**{key: 0 for key in eyes}, mouth: 1})
    else:
        unavailable["eyes_closed_mouth_open"] = "Requires eye-open and mouth-open parameters"

    sampled = {key for state in seen for key, _ in state}
    return {"model": model_url, "vendor": "/public/vendor/cubism/", "canvas": [640, 640],
            "canvaspx": [canvas["width"], canvas["height"]], "shots": shots,
            "coverage": {"scope": "parameter-poses" if len(shots) > 1 else "neutral-only",
                         "sampledParameters": sorted(sampled),
                         "notSampledParameters": sorted(available.keys() - sampled),
                         "unavailable": unavailable}}
