package io.github.psd2live.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AuthoringPipelineFacadeTest {
    @Test
    fun projectSettingsConfigureMeshSamplingAndHeadStrengthWithBounds() {
        val config = AuthoringPipelineFacade.configuration("""{"atlasSize":1024,"meshInteriorDensity":12,"headTurnStrength":0}""", RigEditOverlay.Empty)
        assertEquals(1024, config.atlasSize)
        assertEquals(12f, config.meshInteriorDensity)
        assertEquals(0f, config.headTurnStrength)
        assertEquals(24, config.meshSpacing) // Component splitting remains an independent native default.
        for (input in listOf("""{"meshInteriorDensity":11}""", """{"meshInteriorDensity":81}""",
            """{"headTurnStrength":-0.1}""", """{"headTurnStrength":2.1}""")) {
            assertFailsWith<IllegalArgumentException> { AuthoringPipelineFacade.configuration(input, RigEditOverlay.Empty) }
        }
    }
    @Test
    fun explicitClassificationContractUsesNativeEnumsAndStableSourceIds() {
        val config = AuthoringPipelineFacade.configuration("""{"layerOverrides":{"lyid:2":{"tag":"TAIL","side":"LEFT"}}}""", RigEditOverlay.Empty)
        assertEquals(mapOf("lyid:2" to LayerClassificationOverride(SemanticTag.TAIL, Side.LEFT)), config.layerOverrides)
        for (input in listOf("""{"layerOverrides":{"lyid:2":{"tag":"TYPO","side":"LEFT"}}}""",
            """{"layerOverrides":{"lyid:2":{"tag":"TAIL","side":"left"}}}""",
            """{"layerOverrides":{"":{"tag":"TAIL","side":"LEFT"}}}""")) {
            assertFailsWith<IllegalArgumentException> { AuthoringPipelineFacade.configuration(input, RigEditOverlay.Empty) }
        }
        val schema = kotlinx.serialization.json.Json.parseToJsonElement(java.nio.file.Files.readString(
            java.nio.file.Path.of("../schemas/studio/protocol.schema.json"))) as kotlinx.serialization.json.JsonObject
        val definitions = schema.getValue("definitions") as kotlinx.serialization.json.JsonObject
        val properties = (definitions.getValue("SemanticOverride") as kotlinx.serialization.json.JsonObject).getValue("properties") as kotlinx.serialization.json.JsonObject
        val tags = ((properties.getValue("tag") as kotlinx.serialization.json.JsonObject).getValue("enum") as kotlinx.serialization.json.JsonArray)
            .map { (it as kotlinx.serialization.json.JsonPrimitive).content }.toSet()
        assertEquals(SemanticTag.entries.map { it.name }.toSet(), tags)
    }
    @Test
    fun configurationPreservesAuthoringDefaultsAndExplicitFields() {
        val expected = PipelineConfig(atlasSize = 2048, meshSpacing = 24, generatePhysics = false,
            exportCmo3 = false, exportMotions = false)
        assertEquals(expected, AuthoringPipelineFacade.configuration("{}", RigEditOverlay.Empty))
        assertEquals(expected.copy(atlasSize = 1024, meshSpacing = 32, exportCmo3 = true),
            AuthoringPipelineFacade.configuration("""{"atlasSize":1024,"meshSpacing":32,"exportCmo3":true}""", RigEditOverlay.Empty))
    }

    @Test
    fun invalidContractIsRejectedBeforeBuilding() {
        for (input in listOf("""{"schemaVersion":2}""", """{"meshSpacing":0}""", """{"atlasSize":-1}""", """{"unknown":true}""")) {
            assertFailsWith<IllegalArgumentException> { AuthoringPipelineFacade.configuration(input, RigEditOverlay.Empty) }
        }
    }

    @Test
    fun explicitPhysicsEnablesOnlyOverlayRulesAndRetainsOverlay() {
        val overlay = RigEditOverlay(physicsEdits = listOf(RigPhysicsEdit("custom", "Custom", "ParamAngleX", "ParamHairFront")))
        val config = AuthoringPipelineFacade.configuration("{}", overlay)
        assertTrue(config.generatePhysics)
        assertFalse(config.physicsFrontHair)
        assertFalse(config.physicsBackHair)
        assertFalse(config.physicsEyeJelly)
        assertSame(overlay, config.rigEdits)
    }
}
