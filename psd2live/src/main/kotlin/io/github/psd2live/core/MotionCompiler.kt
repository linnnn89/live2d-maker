package io.github.psd2live.core

import kotlinx.serialization.json.*

data class MotionCompileResult(
    val json: JsonObject,
    val retainedParameterIds: Set<String>,
    val omittedParameterIds: Set<String>,
) {
    fun encode(): String = json.toString()
}

/**
 * Deterministic compiler from MotionDefinition to Cubism motion3 JSON.
 *
 * The compiler owns JSON/meta bookkeeping. Callers should author semantic keyframes instead of
 * hand-maintaining CurveCount / TotalSegmentCount / TotalPointCount.
 */
object MotionCompiler {
    fun compile(
        definition: MotionDefinition,
        availableParameterIds: Set<String>? = null,
        dropUnavailableParameters: Boolean = false,
    ): MotionCompileResult {
        val omitted = if (availableParameterIds == null) {
            emptySet()
        } else {
            definition.curves.map { it.parameterId }.filterNotTo(linkedSetOf()) { it in availableParameterIds }
        }
        if (omitted.isNotEmpty() && !dropUnavailableParameters) {
            throw IllegalArgumentException("Unknown motion parameter(s): ${omitted.sorted().joinToString()}")
        }

        val retainedCurves = if (availableParameterIds == null || !dropUnavailableParameters) {
            definition.curves
        } else {
            definition.curves.filter { it.parameterId in availableParameterIds }
        }
        require(retainedCurves.isNotEmpty()) { "Motion must retain at least one parameter curve" }

        val prepared = definition.copy(curves = retainedCurves)
        MotionValidator.validateDefinition(
            prepared,
            MotionValidationContext(availableParameterIds = availableParameterIds),
        ).requireValid()

        var totalSegments = 0
        var totalPoints = 0
        val curves = buildJsonArray {
            for (curve in retainedCurves) {
                val compiled = compileCurve(curve)
                totalSegments += compiled.segmentCount
                totalPoints += compiled.pointCount
                add(compiled.json)
            }
        }

        val motion = buildJsonObject {
            put("Version", 3)
            putJsonObject("Meta") {
                put("Duration", definition.duration)
                put("Fps", definition.fps)
                put("Loop", definition.loop)
                put("AreBeziersRestricted", true)
                put("CurveCount", retainedCurves.size)
                put("TotalSegmentCount", totalSegments)
                put("TotalPointCount", totalPoints)
                put("UserDataCount", 0)
                put("TotalUserDataSize", 0)
            }
            put("Curves", curves)
        }

        return MotionCompileResult(
            json = motion,
            retainedParameterIds = retainedCurves.mapTo(linkedSetOf()) { it.parameterId },
            omittedParameterIds = omitted,
        )
    }

    private data class CompiledCurve(
        val json: JsonObject,
        val segmentCount: Int,
        val pointCount: Int,
    )

    private fun compileCurve(curve: MotionCurveDefinition): CompiledCurve {
        val keys = curve.keyframes
        val segments = buildJsonArray {
            add(JsonPrimitive(keys.first().time))
            add(JsonPrimitive(keys.first().value))

            for ((from, to) in keys.zipWithNext()) {
                when (curve.interpolation) {
                    MotionInterpolation.LINEAR -> {
                        add(JsonPrimitive(0))
                        add(JsonPrimitive(to.time))
                        add(JsonPrimitive(to.value))
                    }
                    MotionInterpolation.EASE_IN_OUT -> {
                        val dt = (to.time - from.time) / 3f
                        add(JsonPrimitive(1))
                        add(JsonPrimitive(from.time + dt))
                        add(JsonPrimitive(from.value))
                        add(JsonPrimitive(to.time - dt))
                        add(JsonPrimitive(to.value))
                        add(JsonPrimitive(to.time))
                        add(JsonPrimitive(to.value))
                    }
                    MotionInterpolation.STEPPED -> {
                        add(JsonPrimitive(2))
                        add(JsonPrimitive(to.time))
                        add(JsonPrimitive(to.value))
                    }
                    MotionInterpolation.INVERSE_STEPPED -> {
                        add(JsonPrimitive(3))
                        add(JsonPrimitive(to.time))
                        add(JsonPrimitive(to.value))
                    }
                }
            }
        }

        val segmentCount = keys.size - 1
        val pointCount = 1 + segmentCount * if (curve.interpolation == MotionInterpolation.EASE_IN_OUT) 3 else 1
        return CompiledCurve(
            json = buildJsonObject {
                put("Target", "Parameter")
                put("Id", curve.parameterId)
                put("Segments", segments)
            },
            segmentCount = segmentCount,
            pointCount = pointCount,
        )
    }
}
