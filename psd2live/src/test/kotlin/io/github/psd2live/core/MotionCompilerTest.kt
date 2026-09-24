package io.github.psd2live.core

import kotlinx.serialization.json.*
import kotlin.test.*

class MotionCompilerTest {
    private fun definition(value: Float = 12f) = MotionDefinition(
        id = "test-motion",
        duration = 1f,
        curves = listOf(
            MotionCurveDefinition(
                parameterId = "ParamAngleY",
                keyframes = listOf(
                    MotionKeyframe(0f, 0f),
                    MotionKeyframe(0.5f, value),
                    MotionKeyframe(1f, 0f),
                ),
            ),
        ),
    )

    @Test
    fun compilesEaseCurvesAndOwnsMetaBookkeeping() {
        val compiled = MotionCompiler.compile(definition(), setOf("ParamAngleY"))
        val meta = compiled.json.getValue("Meta").jsonObject
        assertEquals(1, meta.getValue("CurveCount").jsonPrimitive.int)
        assertEquals(2, meta.getValue("TotalSegmentCount").jsonPrimitive.int)
        assertEquals(7, meta.getValue("TotalPointCount").jsonPrimitive.int)

        val curve = compiled.json.getValue("Curves").jsonArray.single().jsonObject
        val segments = curve.getValue("Segments").jsonArray
        assertEquals(16, segments.size)
        assertEquals(1, segments[2].jsonPrimitive.int)
        assertTrue(MotionValidator.validateMotion3(compiled.json).isValid)
    }

    @Test
    fun treatsRuntimeRangeAsHardAndObservedRangeAsSoft() {
        val context = MotionValidationContext(
            availableParameterIds = setOf("ParamAngleY"),
            hardRanges = mapOf("ParamAngleY" to MotionParameterRange(-30f, 30f)),
            observedRanges = mapOf("ParamAngleY" to MotionParameterRange(-5f, 5f)),
        )

        val withinHardRange = MotionValidator.validateDefinition(definition(20f), context)
        assertTrue(withinHardRange.isValid)
        assertTrue(withinHardRange.warnings.any { it.code == "curve.observed_range" })

        val outsideHardRange = MotionValidator.validateDefinition(definition(40f), context)
        assertFalse(outsideHardRange.isValid)
        assertTrue(outsideHardRange.errors.any { it.code == "curve.hard_range" })
    }

    @Test
    fun rejectsDirectAnimationOfPhysicsOutputs() {
        val report = MotionValidator.validateDefinition(
            definition(),
            MotionValidationContext(
                availableParameterIds = setOf("ParamAngleY"),
                physicsOutputParameterIds = setOf("ParamAngleY"),
            ),
        )
        assertFalse(report.isValid)
        assertTrue(report.errors.any { it.code == "curve.physics_output" })
    }

    @Test
    fun compiledValidatorCatchesCorruptMetaCounts() {
        val compiled = MotionCompiler.compile(definition()).json
        val meta = JsonObject(compiled.getValue("Meta").jsonObject + ("TotalPointCount" to JsonPrimitive(999)))
        val corrupted = JsonObject(compiled + ("Meta" to meta))

        val report = MotionValidator.validateMotion3(corrupted)
        assertFalse(report.isValid)
        assertTrue(report.errors.any { it.code == "json.point_count" })
    }

    @Test
    fun builtInTemplatesStillDropUnavailableParameters() {
        assertNull(MotionGenerator.nod(emptySet()))

        val json = assertNotNull(MotionGenerator.nod(setOf("ParamAngleY")))
        val motion = Json.parseToJsonElement(json).jsonObject
        val curves = motion.getValue("Curves").jsonArray
        assertEquals(1, curves.size)
        assertEquals("ParamAngleY", curves.single().jsonObject.getValue("Id").jsonPrimitive.content)
        assertTrue(MotionValidator.validateMotion3(
            motion,
            MotionValidationContext(availableParameterIds = setOf("ParamAngleY")),
        ).isValid)
    }
}
