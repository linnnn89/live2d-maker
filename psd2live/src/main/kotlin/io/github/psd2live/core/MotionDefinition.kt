package io.github.psd2live.core

/** Interpolation used between consecutive keyframes in one parameter curve. */
enum class MotionInterpolation {
    LINEAR,
    EASE_IN_OUT,
    STEPPED,
    INVERSE_STEPPED,
}

/** Semantic role of a motion. Validation policy can become stricter per kind later. */
enum class MotionKind {
    ACTION,
    IDLE,
    EXPRESSION,
    TRANSITION,
    PREVIEW,
}

data class MotionKeyframe(
    val time: Float,
    val value: Float,
)

data class MotionCurveDefinition(
    val parameterId: String,
    val keyframes: List<MotionKeyframe>,
    val interpolation: MotionInterpolation = MotionInterpolation.EASE_IN_OUT,
)

/**
 * Source-of-truth representation for time-domain animation.
 *
 * This is intentionally separate from parameter/form keyforms: form keyforms define how the
 * model looks in parameter space, while a MotionDefinition defines how parameter values evolve
 * over time.
 */
data class MotionDefinition(
    val id: String,
    val duration: Float,
    val fps: Float = 30f,
    val loop: Boolean = false,
    val kind: MotionKind = MotionKind.ACTION,
    val curves: List<MotionCurveDefinition>,
)
