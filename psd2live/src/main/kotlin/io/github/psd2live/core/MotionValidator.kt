package io.github.psd2live.core

import kotlinx.serialization.json.*

enum class MotionValidationSeverity { ERROR, WARNING }

data class MotionValidationIssue(
    val severity: MotionValidationSeverity,
    val code: String,
    val message: String,
    val parameterId: String? = null,
)

data class MotionValidationReport(val issues: List<MotionValidationIssue>) {
    val errors: List<MotionValidationIssue> get() = issues.filter { it.severity == MotionValidationSeverity.ERROR }
    val warnings: List<MotionValidationIssue> get() = issues.filter { it.severity == MotionValidationSeverity.WARNING }
    val isValid: Boolean get() = errors.isEmpty()

    fun requireValid() {
        require(isValid) { errors.joinToString("; ") { "${it.code}: ${it.message}" } }
    }
}

data class MotionParameterRange(val min: Float, val max: Float) {
    init {
        require(min.isFinite() && max.isFinite() && min <= max)
    }

    operator fun contains(value: Float): Boolean = value in min..max
}

data class MotionValidationContext(
    val availableParameterIds: Set<String>? = null,
    val hardRanges: Map<String, MotionParameterRange> = emptyMap(),
    val observedRanges: Map<String, MotionParameterRange> = emptyMap(),
    val physicsOutputParameterIds: Set<String> = emptySet(),
)

/**
 * Independent checks for authored definitions and compiled motion3 JSON.
 *
 * Hard runtime ranges are errors. Ranges merely observed in existing motions are soft priors and
 * produce warnings only, so a quiet idle cannot accidentally become the model's permanent limit.
 */
object MotionValidator {
    private const val EPS = 1e-4f

    fun validateDefinition(
        definition: MotionDefinition,
        context: MotionValidationContext = MotionValidationContext(),
    ): MotionValidationReport {
        val issues = mutableListOf<MotionValidationIssue>()
        fun error(code: String, message: String, parameterId: String? = null) {
            issues += MotionValidationIssue(MotionValidationSeverity.ERROR, code, message, parameterId)
        }
        fun warning(code: String, message: String, parameterId: String? = null) {
            issues += MotionValidationIssue(MotionValidationSeverity.WARNING, code, message, parameterId)
        }

        if (definition.id.isBlank()) error("motion.id", "Motion id must not be blank")
        if (!definition.duration.isFinite() || definition.duration <= 0f) error("motion.duration", "Duration must be finite and > 0")
        if (!definition.fps.isFinite() || definition.fps <= 0f) error("motion.fps", "FPS must be finite and > 0")
        if (definition.curves.isEmpty()) error("motion.curves", "Motion must contain at least one curve")

        val duplicateIds = definition.curves.groupingBy { it.parameterId }.eachCount().filterValues { it > 1 }.keys
        for (id in duplicateIds) error("curve.duplicate", "Parameter appears in more than one curve", id)

        for (curve in definition.curves) {
            val id = curve.parameterId
            if (id.isBlank()) {
                error("curve.parameter", "Parameter id must not be blank")
                continue
            }
            if (context.availableParameterIds != null && id !in context.availableParameterIds) {
                error("curve.unknown_parameter", "Parameter does not exist in the target model", id)
            }
            if (id in context.physicsOutputParameterIds) {
                error("curve.physics_output", "Physics output parameters must not be animated directly", id)
            }
            if (curve.keyframes.size < 2) {
                error("curve.keyframes", "At least two keyframes are required", id)
                continue
            }

            val times = curve.keyframes.map { it.time }
            if (times.any { !it.isFinite() }) error("curve.time_finite", "Keyframe times must be finite", id)
            if (curve.keyframes.any { !it.value.isFinite() }) error("curve.value_finite", "Keyframe values must be finite", id)
            if (times.first().isFinite() && kotlin.math.abs(times.first()) > EPS) {
                error("curve.start_time", "First keyframe must start at t=0", id)
            }
            if (times.zipWithNext().any { (a, b) -> !a.isFinite() || !b.isFinite() || b <= a }) {
                error("curve.time_order", "Keyframe times must increase strictly", id)
            }
            if (times.last().isFinite() && definition.duration.isFinite() &&
                kotlin.math.abs(times.last() - definition.duration) > EPS) {
                error("curve.end_time", "Last keyframe must equal motion duration ${definition.duration}", id)
            }

            context.hardRanges[id]?.let { range ->
                curve.keyframes.filterNot { it.value in range }.forEach { key ->
                    error("curve.hard_range", "Value ${key.value} at t=${key.time} is outside [${range.min}, ${range.max}]", id)
                }
            }
            context.observedRanges[id]?.let { range ->
                curve.keyframes.filterNot { it.value in range }.forEach { key ->
                    warning("curve.observed_range", "Value ${key.value} at t=${key.time} is outside observed range [${range.min}, ${range.max}]", id)
                }
            }
        }
        return MotionValidationReport(issues)
    }

    fun validateMotion3(
        motion: JsonObject,
        context: MotionValidationContext = MotionValidationContext(),
    ): MotionValidationReport {
        val issues = mutableListOf<MotionValidationIssue>()
        fun error(code: String, message: String, parameterId: String? = null) {
            issues += MotionValidationIssue(MotionValidationSeverity.ERROR, code, message, parameterId)
        }
        fun warning(code: String, message: String, parameterId: String? = null) {
            issues += MotionValidationIssue(MotionValidationSeverity.WARNING, code, message, parameterId)
        }
        fun number(element: JsonElement?): Float? = (element as? JsonPrimitive)?.content?.toFloatOrNull()
        fun integer(element: JsonElement?): Int? = (element as? JsonPrimitive)?.content?.toIntOrNull()

        val meta = motion["Meta"] as? JsonObject
        val curves = motion["Curves"] as? JsonArray
        if (meta == null) {
            error("json.meta", "Meta object is missing")
            return MotionValidationReport(issues)
        }
        if (curves == null) {
            error("json.curves", "Curves array is missing")
            return MotionValidationReport(issues)
        }

        val duration = number(meta["Duration"])
        if (duration == null || !duration.isFinite() || duration <= 0f) {
            error("json.duration", "Meta.Duration must be finite and > 0")
        }
        val declaredCurveCount = integer(meta["CurveCount"])
        if (declaredCurveCount != curves.size) {
            error("json.curve_count", "Meta.CurveCount=$declaredCurveCount but actual=${curves.size}")
        }

        var actualSegments = 0
        var actualPoints = 0
        for ((curveIndex, element) in curves.withIndex()) {
            val curve = element as? JsonObject
            if (curve == null) {
                error("json.curve", "Curve[${curveIndex}] is not an object")
                continue
            }
            val target = (curve["Target"] as? JsonPrimitive)?.content
            val id = (curve["Id"] as? JsonPrimitive)?.content
            if (target != "Parameter") {
                warning("json.target", "Curve[${curveIndex}] target '${target}' is not validated as a parameter curve", id)
                continue
            }
            if (id.isNullOrBlank()) {
                error("json.parameter", "Curve[${curveIndex}] has no parameter id")
                continue
            }
            if (context.availableParameterIds != null && id !in context.availableParameterIds) {
                error("json.unknown_parameter", "Parameter does not exist in the target model", id)
            }
            if (id in context.physicsOutputParameterIds) {
                error("json.physics_output", "Physics output parameters must not be animated directly", id)
            }

            val segments = curve["Segments"] as? JsonArray
            if (segments == null || segments.size < 2) {
                error("json.segments", "Curve has no valid Segments array", id)
                continue
            }
            val firstTime = number(segments[0])
            val firstValue = number(segments[1])
            if (firstTime == null || firstValue == null) {
                error("json.first_point", "First motion point is invalid", id)
                continue
            }
            actualPoints += 1
            if (kotlin.math.abs(firstTime) > EPS) error("json.start_time", "First point must start at t=0", id)

            val sampledValues = mutableListOf(firstValue)
            var previousTime = firstTime
            var index = 2
            while (index < segments.size) {
                val type = integer(segments[index])
                if (type == null) {
                    error("json.segment_type", "Segment type at index $index is invalid", id)
                    break
                }

                var endTime: Float? = null
                var endValue: Float? = null
                when (type) {
                    1 -> {
                        if (index + 6 >= segments.size) {
                            error("json.segment_shape", "Bezier segment is truncated", id)
                            break
                        }
                        val c1t = number(segments[index + 1])
                        val c1v = number(segments[index + 2])
                        val c2t = number(segments[index + 3])
                        val c2v = number(segments[index + 4])
                        endTime = number(segments[index + 5])
                        endValue = number(segments[index + 6])
                        if (c1t == null || c1v == null || c2t == null || c2v == null || endTime == null || endValue == null) {
                            error("json.segment_number", "Bezier segment contains a non-number", id)
                        } else {
                            if (c1t < previousTime - EPS || c1t > c2t + EPS || c2t > endTime + EPS) {
                                error("json.bezier_time", "Bezier control-point times fall outside the segment", id)
                            }
                            sampledValues += listOf(c1v, c2v, endValue)
                        }
                        actualPoints += 3
                        index += 7
                    }
                    0, 2, 3 -> {
                        if (index + 2 >= segments.size) {
                            error("json.segment_shape", "Segment is truncated", id)
                            break
                        }
                        endTime = number(segments[index + 1])
                        endValue = number(segments[index + 2])
                        if (endTime == null || endValue == null) {
                            error("json.segment_number", "Segment contains a non-number", id)
                        } else {
                            sampledValues += endValue
                        }
                        actualPoints += 1
                        index += 3
                    }
                    else -> {
                        error("json.segment_type", "Unsupported segment type $type", id)
                        break
                    }
                }

                if (endTime != null) {
                    if (!endTime.isFinite() || endTime <= previousTime + EPS) {
                        error("json.time_order", "Segment end times must increase strictly", id)
                    }
                    previousTime = endTime
                }
                actualSegments += 1
            }

            if (duration != null && previousTime.isFinite() && kotlin.math.abs(previousTime - duration) > EPS) {
                error("json.end_time", "Last point $previousTime does not equal duration $duration", id)
            }

            context.hardRanges[id]?.let { range ->
                sampledValues.filterNot { it in range }.forEach { value ->
                    error("json.hard_range", "Curve/control value $value is outside [${range.min}, ${range.max}]", id)
                }
            }
            context.observedRanges[id]?.let { range ->
                sampledValues.filterNot { it in range }.forEach { value ->
                    warning("json.observed_range", "Curve/control value $value is outside observed range [${range.min}, ${range.max}]", id)
                }
            }
        }

        val declaredSegments = integer(meta["TotalSegmentCount"])
        val declaredPoints = integer(meta["TotalPointCount"])
        if (declaredSegments != actualSegments) {
            error("json.segment_count", "Meta.TotalSegmentCount=$declaredSegments but actual=$actualSegments")
        }
        if (declaredPoints != actualPoints) {
            error("json.point_count", "Meta.TotalPointCount=$declaredPoints but actual=$actualPoints")
        }
        return MotionValidationReport(issues)
    }
}
