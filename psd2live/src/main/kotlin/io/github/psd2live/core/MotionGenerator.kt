package io.github.psd2live.core

/**
 * Built-in demonstration templates that exercise the generated rig without audio assets.
 *
 * JSON generation is delegated to MotionCompiler so these templates and agent-authored previews
 * share the same motion3 implementation and metadata bookkeeping.
 */
object MotionGenerator {
    fun idle(): String = idle(ALL_PARAMETERS)!!

    fun idle(availableParameterIds: Set<String>): String? = compileTemplate(
        MotionDefinition(
            id = "idle",
            duration = 6.0f,
            loop = true,
            kind = MotionKind.IDLE,
            curves = listOf(
                curve("ParamBreath", listOf(0f to 0f, 1.5f to 1f, 3f to 0f, 4.5f to 1f, 6f to 0f)),
                curve("ParamAngleZ", listOf(0f to -2f, 1.5f to 2f, 3f to -2f, 4.5f to 2f, 6f to -2f)),
                curve("ParamBodyAngleX", listOf(0f to -1.2f, 3f to 1.2f, 6f to -1.2f)),
                curve("ParamEyeLOpen", listOf(0f to 1f, 2.7f to 1f, 2.78f to 0f, 2.88f to 1f, 6f to 1f)),
                curve("ParamEyeROpen", listOf(0f to 1f, 2.7f to 1f, 2.78f to 0f, 2.88f to 1f, 6f to 1f)),
            ),
        ),
        availableParameterIds,
    )

    fun blink(): String = blink(ALL_PARAMETERS)!!

    fun blink(availableParameterIds: Set<String>): String? = compileTemplate(
        MotionDefinition(
            id = "blink",
            duration = 1.2f,
            curves = listOf(
                curve("ParamEyeLOpen", listOf(0f to 1f, 0.35f to 1f, 0.45f to 0f, 0.58f to 1f, 1.2f to 1f)),
                curve("ParamEyeROpen", listOf(0f to 1f, 0.35f to 1f, 0.45f to 0f, 0.58f to 1f, 1.2f to 1f)),
            ),
        ),
        availableParameterIds,
    )

    fun nod(): String = nod(ALL_PARAMETERS)!!

    fun nod(availableParameterIds: Set<String>): String? = compileTemplate(
        MotionDefinition(
            id = "nod",
            duration = 2.0f,
            curves = listOf(
                curve("ParamAngleY", listOf(0f to 0f, 0.55f to -18f, 1.25f to 6f, 2.0f to 0f)),
                curve("ParamBodyAngleY", listOf(0f to 0f, 0.55f to -4f, 1.25f to 1.5f, 2.0f to 0f)),
                curve("ParamEyeLOpen", listOf(0f to 1f, 0.55f to 0.75f, 1.25f to 1f, 2.0f to 1f)),
                curve("ParamEyeROpen", listOf(0f to 1f, 0.55f to 0.75f, 1.25f to 1f, 2.0f to 1f)),
            ),
        ),
        availableParameterIds,
    )

    fun shake(): String = shake(ALL_PARAMETERS)!!

    fun shake(availableParameterIds: Set<String>): String? = compileTemplate(
        MotionDefinition(
            id = "shake",
            duration = 2.0f,
            curves = listOf(
                curve("ParamAngleX", listOf(0f to 0f, 0.4f to -20f, 0.9f to 20f, 1.4f to -8f, 2.0f to 0f)),
                curve("ParamBodyAngleX", listOf(0f to 0f, 0.4f to -3f, 0.9f to 3f, 1.4f to -1.2f, 2.0f to 0f)),
                curve("ParamAngleZ", listOf(0f to 0f, 0.4f to 2f, 0.9f to -2f, 1.4f to 1f, 2.0f to 0f)),
            ),
        ),
        availableParameterIds,
    )

    private fun compileTemplate(
        definition: MotionDefinition,
        availableParameterIds: Set<String>,
    ): String? {
        val retained = definition.curves.filter { it.parameterId in availableParameterIds }
        if (retained.isEmpty()) return null

        val prepared = definition.copy(curves = retained)
        val compiled = MotionCompiler.compile(prepared, availableParameterIds)
        MotionValidator.validateMotion3(
            compiled.json,
            MotionValidationContext(availableParameterIds = availableParameterIds),
        ).requireValid()
        return compiled.encode()
    }

    private fun curve(
        parameterId: String,
        points: List<Pair<Float, Float>>,
        interpolation: MotionInterpolation = MotionInterpolation.EASE_IN_OUT,
    ) = MotionCurveDefinition(
        parameterId = parameterId,
        keyframes = points.map { (time, value) -> MotionKeyframe(time, value) },
        interpolation = interpolation,
    )

    private val ALL_PARAMETERS = setOf(
        "ParamBreath",
        "ParamAngleX",
        "ParamAngleY",
        "ParamAngleZ",
        "ParamBodyAngleX",
        "ParamBodyAngleY",
        "ParamEyeLOpen",
        "ParamEyeROpen",
    )
}
