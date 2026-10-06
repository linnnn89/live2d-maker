package io.github.psd2live.application

import io.github.psd2live.agent.*
import io.github.psd2live.core.*
import io.github.psd2live.core.Bounds
import io.github.psd2live.core.RigEditOverlay
import io.github.psd2live.history.WorkspaceHistoryTree
import io.github.psd2live.project.ProjectArchive
import kotlinx.serialization.json.*
import org.umamo.format.art.*
import org.umamo.format.psd.PsdReader
import org.umamo.format.psd.PsdWriter
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import java.util.zip.ZipFile
import kotlin.test.*
import javax.imageio.ImageIO

class WorkspaceServiceTest {
    private fun fixture(root: Path): WorkspaceProjectCapture {
        val layer = WorkspaceSourceLayer(LayerId("lyid:7"), "Face", "", SourceLayerKind.Raster,
            true, 0, LayerBounds(1, 1, 1, 1), 1f, false, LayerBlend.Normal, ChannelMask.ALL,
            LayerRaster(1, 1, byteArrayOf(10, 20, 30, -1)), null, null, false)
        val source = WorkspaceSourceArt(4, 4, listOf(layer), emptyList())
        val settings = buildJsonObject { put("atlasSize", 1024) }
        val document = AgentWorkspaceDocument(source, mapOf("lyid:7" to true), emptySet(),
            emptyMap(), emptyMap(), RigEditOverlay(), settings)
        val history = WorkspaceHistoryTree(document, "revision-1", "hash-1")
        history.commit(history.head().node.id, document.copy(layerVisibility = mapOf("lyid:7" to false)),
            "revision-2", "hash-2", "Hide face", "user")
        val original = root.resolve("original.psd")
        Files.write(original, PsdWriter.write(source))
        val png = ByteArrayOutputStream().also {
            val image = BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB)
            image.setRGB(0, 0, 0xff102030.toInt())
            ImageIO.write(image, "png", it)
        }.toByteArray()
        val presentation = buildJsonObject {
            put("atlasSize", 1024)
            putJsonArray("logEntries") { add(buildJsonObject {
                put("message", "Preview"); put("image", Base64.getEncoder().encodeToString(png))
            }) }
        }
        val store = AgentWorkspaceStore(root.resolve("recovery"))
        val auxiliary = store.projectRoot("project").resolve("workflow/reference.png")
        Files.createDirectories(auxiliary.parent)
        Files.write(auxiliary, png)
        val rect = Bounds(0f, 0f, 4f, 4f)
        val spatial = AgentViewSpatialMetadata(pixelWidth = 1, pixelHeight = 1, canvasWidth = 4f,
            canvasHeight = 4f, requestedViewRect = rect, viewRect = rect,
            canvasUnitsPerPixelX = 4f, canvasUnitsPerPixelY = 4f)
        val task = AgentTaskSnapshot("task-1", "Check model", listOf("Inspect"), AgentTaskStatus.DONE,
            0, 1f, "revision-2", history.head().node.id, "2026-10-07T00:00:00Z",
            "2026-10-07T00:00:01Z", listOf("view-1"), emptyList())
        return WorkspaceProjectCapture("project", history.state(), presentation, original,
            listOf(task), store, mapOf("view-1" to spatial))
    }

    @Test fun portableRoundTripPreservesCapturedRevisionAndResources() {
        val root = Files.createTempDirectory("workspace-service-test-")
        try {
            val capture = fixture(root)
            val target = root.resolve("saved.psd2live")
            val service = WorkspaceService()
            assertEquals(capture.history.headNodeId, service.save(capture, target))
            val sourceBytes = Files.readAllBytes(capture.source)
            // Opening must use archived resources, with no dependency on the original recovery store.
            Files.delete(capture.source)
            capture.store.projectRoot("project").toFile().deleteRecursively()
            val opened = service.open(target)
            val extraction = opened.root
            opened.use {
                assertEquals("project", it.projectId)
                assertContentEquals(sourceBytes, Files.readAllBytes(it.source))
                assertEquals("Face", PsdReader.read(Files.readAllBytes(it.source)).layers.single().name)
                assertEquals(capture.history.headNodeId, it.history.head().node.id)
                assertEquals(capture.history.selections.map { selection -> selection.node }, it.history.nodes())
                assertEquals(mapOf("lyid:7" to false), it.history.head().snapshot.layerVisibility)
                assertEquals(capture.history.selections.last().snapshot.settings, it.history.head().snapshot.settings)
                assertContentEquals(byteArrayOf(10, 20, 30, -1), it.history.head().snapshot.source.layers.single().raster.rgba)
                assertEquals(capture.tasks, it.store.loadTasks("project"))
                assertEquals(capture.spatial.getValue("view-1"), it.store.loadSpatial("project", "view-1"))
                assertEquals(capture.presentation, it.presentation)
                assertTrue(Files.isRegularFile(it.store.projectRoot("project").resolve("workflow/reference.png")))
                ZipFile(target.toFile()).use { zip ->
                    val json = Json.parseToJsonElement(zip.getInputStream(zip.getEntry("workspace.json")).reader().readText()).jsonObject
                    val log = json.getValue("logEntries").jsonArray.single().jsonObject
                    assertFalse("image" in log)
                    assertNotNull(zip.getEntry(log.getValue("imagePath").jsonPrimitive.content))
                }
            }
            assertFalse(Files.exists(extraction))
            opened.close() // Cleanup is safe when repeated.
        } finally { root.toFile().deleteRecursively() }
    }

    @Test fun failedSavePreservesPreviousArchiveAndCleansStaging() {
        val root = Files.createTempDirectory("workspace-service-test-")
        try {
            val capture = fixture(root)
            val target = root.resolve("saved.psd2live")
            WorkspaceService().save(capture, target)
            val before = Files.readAllBytes(target)
            var staging: Path? = null
            val failure = WorkspaceService { directory, _, _ ->
                staging = directory
                error("disk unavailable")
            }
            assertFailsWith<IllegalStateException> { failure.save(capture, target) }
            assertFalse(Files.exists(assertNotNull(staging)))
            assertContentEquals(before, Files.readAllBytes(target))
            WorkspaceService().open(target).use { assertEquals(capture.history.headNodeId, it.history.head().node.id) }
        } finally { root.toFile().deleteRecursively() }
    }

    @Test fun invalidImageReferenceFailsWithoutLeakingExtractedProject() {
        val root = Files.createTempDirectory("workspace-service-test-")
        try {
            val capture = fixture(root)
            val target = root.resolve("invalid.psd2live")
            val service = WorkspaceService { directory, file, id ->
                val invalid = capture.presentation.toMutableMap()
                invalid["logEntries"] = buildJsonArray { add(buildJsonObject { put("imagePath", "../outside.png") }) }
                ProjectArchive.writeJson(directory.resolve("workspace.json"), JsonObject(invalid))
                ProjectArchive.write(directory, file, id)
            }
            service.save(capture, target)
            fun extractions() = Files.list(Path.of(System.getProperty("java.io.tmpdir"))).use { paths ->
                paths.filter { it.fileName.toString().startsWith("psd2live-project-") }.toList().toSet()
            }
            val before = extractions()
            val error = assertFailsWith<IllegalArgumentException> { service.open(target) }
            assertEquals("Invalid log image reference", error.message)
            assertEquals(before, extractions())
        } finally { root.toFile().deleteRecursively() }
    }
    private fun editFixture(): Pair<AgentWorkspaceDocument, PipelineConfig> {
        val source = PsdReader.read(Files.readAllBytes(Path.of("examples/ds/psd-input/ds.psd")))
        val document = AgentWorkspaceDocument(source, emptyMap(), emptySet(), emptyMap(), emptyMap(), RigEditOverlay.Empty)
        val config = PipelineConfig(atlasSize = 1024, generatePhysics = false, exportMotions = false, exportCmo3 = false)
        return document to config
    }

    @Test fun preparedEditPublishesOneNativeModelAndDurableHistoryForEitherActor() {
        val (before, config) = editFixture()
        val sourcePixels = before.source.layers.map { it.raster.rgba.copyOf() }
        val overlay = RigEditOverlay(keyformSetEdits = listOf(RigKeyformSetEdit(
            RigTargetRef(RigTargetKind.ART_MESH, "ArtMeshFace"), mapOf("ParamAngleX" to 30f),
            channels = RigKeyformChannelsEdit(opacity = .4f))))
        val after = before.copy(rigEdits = overlay)
        val service = WorkspaceService()
        val prepared = service.prepareEdit(before, after, config.copy(rigEdits = overlay))
        val reference = PSD2LivePipeline().buildPreview(after.source, config.copy(rigEdits = overlay))
        assertContentEquals(reference.runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes, prepared.preview.runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes)
        val basePreview = service.preview(before.source, config)
        val desktopPreview = service.preview(basePreview, config.copy(rigEdits = overlay), ProgressListener { _, _ -> })
        assertContentEquals(reference.runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes,
            desktopPreview.runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes)
        assertSame(before.source, prepared.after.source)
        val root = Files.createTempDirectory("workspace-edit-test-")
        try {
            for (actor in listOf("user", "agent")) {
                var live = before
                var publications = 0
                val tree = WorkspaceHistoryTree(before, "before", "before")
                val committed = service.commitEdit(prepared, tree, tree.head().node.id, "edited", "Opacity keyform", actor, null) {
                    if (live != it.before) false else { live = it.after; publications++; true }
                }
                assertEquals(1, publications)
                assertEquals(after, live)
                assertEquals(actor, committed.node.actor)
                val store = AgentWorkspaceStore(root.resolve(actor))
                store.persistHistory("project", tree.state())
                assertEquals(overlay, store.loadHistory("project")!!.head().snapshot.rigEdits)
                assertEquals(committed.node.id, store.loadHistory("project")!!.head().node.id)
            }
            before.source.layers.forEachIndexed { index, layer -> assertContentEquals(sourcePixels[index], layer.raster.rgba) }
        } finally { root.toFile().deleteRecursively() }
    }

    @Test fun staleHeadOrLiveCasRefusalCannotPublishOrAppendPreparedEdit() {
        val (before, config) = editFixture()
        val after = before.copy(layerVisibility = mapOf(before.source.layers.first().id.raw to false))
        val service = WorkspaceService()
        val prepared = service.prepareEdit(before, after, config.copy(layerVisibility = after.layerVisibility))
        val tree = WorkspaceHistoryTree(before, "before", "before")
        val initial = tree.head().node.id
        var publications = 0
        assertFailsWith<IllegalStateException> {
            service.commitEdit(prepared, tree, initial, "edited", "Hide layer", "user", null) { false }
        }
        assertEquals(1, tree.nodes().size)
        assertFailsWith<IllegalArgumentException> {
            service.commitEdit(prepared, tree, initial, "edited", "", "user", null) { publications++; true }
        }
        assertEquals(0, publications)
        val other = tree.commit(initial, before, "other", "other", "Concurrent edit", "agent")
        assertFailsWith<io.github.psd2live.history.StaleWorkspaceHeadException> {
            service.commitEdit(prepared, tree, initial, "edited", "Hide layer", "user", null) { publications++; true }
        }
        assertEquals(0, publications)
        assertEquals(other.node.id, tree.head().node.id)
        assertEquals(2, tree.nodes().size)
    }

    @Test fun mismatchedCandidateOrFailedNativeEditLeavesOriginalHistoryAndModel() {
        val (before, config) = editFixture()
        val service = WorkspaceService()
        val original = service.preview(before.source, config)
        val tree = WorkspaceHistoryTree(before, "before", "before")
        val head = tree.head().node.id
        val overlay = RigEditOverlay(keyformSetEdits = listOf(RigKeyformSetEdit(
            RigTargetRef(RigTargetKind.ART_MESH, "ArtMeshFace"), mapOf("ParamAbsent" to 30f),
            channels = RigKeyformChannelsEdit(opacity = .4f))))
        val after = before.copy(rigEdits = overlay)
        assertFailsWith<IllegalArgumentException> { service.prepareEdit(before, after, config) }
        // A new axis is accepted by the core Overlay algebra; missing parent frames are a real build failure.
        val broken = before.copy(parentOverrides = mapOf("lyid:12" to "MissingParentWarp"))
        val failure = assertFailsWith<IllegalStateException> {
            service.prepareEdit(before, broken, config.copy(parentOverrides = broken.parentOverrides))
        }
        assertTrue(failure.message!!.contains("Unknown parent coordinate frame"))
        assertEquals(head, tree.head().node.id)
        assertEquals(before, tree.head().snapshot)
        assertEquals(1, tree.nodes().size)
        assertContentEquals(original.runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes, service.preview(before.source, config).runtimeBundle.assets.single { it.path.endsWith(".moc3") }.bytes)
    }

}
