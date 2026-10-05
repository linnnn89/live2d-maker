package io.github.psd2live.core

import org.umamo.format.art.*
import org.umamo.runtime.model.ParameterId
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.*

class CubismNativeRuntimeTest {
    @Test
    fun bundledRuntimeLoadsGeneratedModelAndRendersInspectorPose() {
        if (!System.getProperty("os.name").contains("windows", ignoreCase = true) ||
            System.getProperty("psd2live.cubism.smoke") != "true") return
        val source = object : SourceArt {
            override val widthPx = 64
            override val heightPx = 64
            override val layers = listOf(object : SourceLayer {
                override val id = LayerId("native-smoke-face")
                override val name = "face"
                override val groupPath = ""
                override val order = 0
                override val bounds = LayerBounds(0, 0, 64, 64)
                override val opacity = 1f
                override val clipped = false
                override val blend = LayerBlend.Normal
                override val raster = LayerRaster(64, 64, ByteArray(64 * 64 * 4) {
                    when (it % 4) { 0 -> 200.toByte(); 1 -> 80; 2 -> 120; else -> 255.toByte() }
                })
            })
        }
        val preview = PSD2LivePipeline().buildPreview(source,
            PipelineConfig(atlasSize = 256, generatePhysics = false, exportMotions = false))
        val ready = CountDownLatch(1)
        val failure = AtomicReference<String?>()
        val frames = LinkedBlockingQueue<CubismSdkFrame>()
        val session = CubismSdkPreviewSession(
            onFrame = { frames.offer(it) },
            onStatus = {
                if (it == "ready") ready.countDown()
                else if (it != null) { failure.set(it); ready.countDown() }
            },
        )
        try {
            session.load(preview.runtimeBundle, preview.rig.puppet.parameters.map { it.id })
            assertTrue(ready.await(15, TimeUnit.SECONDS), "Native runtime load timed out")
            assertNull(failure.get(), failure.get())
            for (angle in listOf(20f, -20f)) {
                session.render(CubismSdkPreviewSession.RenderRequest(
                    width = 320, height = 320, scale = 0.95f, offsetX = 0f, offsetY = 0f,
                    deltaTime = 1f / 30f, pointerX = 0f, pointerY = 0f, animationEnabled = false,
                    parameterOverrides = mapOf(ParameterId("ParamAngleX") to angle),
                ))
                val frame = assertNotNull(frames.poll(15, TimeUnit.SECONDS), "No native frame: ${failure.get()}")
                assertEquals(320, frame.image.width)
                assertEquals(320, frame.image.height)
                assertEquals(angle, assertNotNull(frame.parameters[ParameterId("ParamAngleX")]), 0.001f)
                assertTrue((0 until 320).any { y -> (0 until 320).any { x -> frame.image.getRGB(x, y) ushr 24 != 0 } })
            }
        } finally { session.close() }
    }
}
