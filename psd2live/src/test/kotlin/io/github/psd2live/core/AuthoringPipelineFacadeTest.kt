package io.github.psd2live.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AuthoringPipelineFacadeTest {
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
