package io.github.psd2live.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AuthoringPipelineFacadeTest {
    @Test
    fun preparedReplayKeepsArtifactsWarningsAndAtlasIdentityAndRejectsChangedInputs() {
        val pipeline = PSD2LivePipeline()
        val source = java.nio.file.Path.of("examples/ds/psd-input/ds.psd")
        val config = AuthoringPipelineFacade.configuration("""{"atlasSize":1024,"exportMotions":true}""", RigEditOverlay.Empty)
        val base = pipeline.buildPreview(source, config)
        val overlay = RigEditOverlay(keyformSetEdits = listOf(RigKeyformSetEdit(
            RigTargetRef(RigTargetKind.ART_MESH, "ArtMeshFace"), mapOf("ParamAngleX" to 30f),
            channels = RigKeyformChannelsEdit(opacity = .4f))))
        val edited = config.copy(rigEdits = overlay)
        assertTrue(pipeline.canReusePreview(base, edited))
        val temporary = java.nio.file.Files.createTempDirectory("psd2live-project-prepared-replay-")
        try {
            val cached = pipeline.exportReplayPreview(base, "ds.psd", temporary.resolve("cached"), edited)
            val rebuilt = pipeline.run(source, temporary.resolve("rebuilt"), edited)
            assertSame(base.analysis, cached.analysis)
            assertSame(base.atlas, cached.previewModel.atlas)
            assertEquals(rebuilt.warnings, cached.warnings)
            fun files(result: PipelineResult) = result.exportedFiles.associateBy { it.path.fileName.toString() }
            val first = files(cached); val second = files(rebuilt)
            assertEquals(second.keys, first.keys)
            for ((name, file) in first) kotlin.test.assertContentEquals(java.nio.file.Files.readAllBytes(second.getValue(name).path), java.nio.file.Files.readAllBytes(file.path), name)
            assertFalse(pipeline.canReusePreview(cached.previewModel, edited))
            for (changed in listOf(edited.copy(atlasSize = 2048), edited.copy(headTurnStrength = 0f), edited.copy(generatePhysics = true))) {
                assertFalse(pipeline.canReusePreview(base, changed))
                assertFailsWith<IllegalArgumentException> { pipeline.exportReplayPreview(base, "ds.psd", temporary.resolve("rejected"), changed) }
            }
            assertFalse(java.nio.file.Files.exists(temporary.resolve("rejected")))
        } finally { io.github.psd2live.project.ProjectArchive.deleteTemporaryDirectory(temporary) }
    }
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
