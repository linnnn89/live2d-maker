package io.github.psd2live

import io.github.psd2live.agent.AgentMcpConfig
import io.github.psd2live.agent.AgentMcpService
import io.github.psd2live.agent.ViewModelAgentWorkspace
import io.github.psd2live.ui.state.PSD2LiveViewModel
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith
import kotlin.test.assertSame
import io.github.psd2live.core.PSD2LivePipeline
import io.github.psd2live.core.PipelineConfig
import io.github.psd2live.ui.state.PSD2LiveState
import org.umamo.format.psd.PsdReader
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.runBlocking

class LifecycleShutdownTest {

    @Test
    fun closedWorkspaceCannotMutateReopenedNativeModel() = runBlocking {
        val store = Files.createTempDirectory("native-closed-workspace-")
        val viewModel = PSD2LiveViewModel()
        val source = PsdReader.read(Files.readAllBytes(Path.of("examples/ds/psd-input/ds.psd")))
        val preview = PSD2LivePipeline().buildPreview(source, PipelineConfig(atlasSize = 1024))
        viewModel.setStateForTest(PSD2LiveState(projectId = "w1", analysis = preview.analysis,
            previewModel = preview, atlasSize = 1024))
        val old = ViewModelAgentWorkspace(viewModel, store)
        viewModel.attachAgentWorkspace(old)
        val captured = old.snapshot()
        old.close()
        val reopened = ViewModelAgentWorkspace(viewModel, store)
        viewModel.attachAgentWorkspace(reopened)
        try {
            val current = viewModel.state.value
            assertFailsWith<IllegalStateException> { old.snapshot() }
            assertFailsWith<IllegalStateException> { old.checkpoint("Closed Agent checkpoint") }
            assertFailsWith<IllegalStateException> {
                old.softDeleteLayer(captured.layers.first().id, requireNotNull(captured.historyHeadNodeId), null)
            }
            assertSame(current, viewModel.state.value)
            assertTrue(viewModel.state.value.deletedLayerIds.isEmpty())
        } finally {
            reopened.close()
            viewModel.close()
            store.toFile().deleteRecursively()
        }
    }

	@Test
	fun testViewModelCloseIsIdempotentAndClean() {
		val viewModel = PSD2LiveViewModel()
		// First close should succeed
		viewModel.close()
		// Repeated close must be safe and idempotent
		viewModel.close()
	}

	@Test
	fun testWorkspaceAndServiceShutdownCleanly() {
		val viewModel = PSD2LiveViewModel()
		val workspace = ViewModelAgentWorkspace(viewModel)
		viewModel.attachAgentWorkspace(workspace)

		val service = AgentMcpService(workspace, AgentMcpConfig(port = 24991))
		val info = service.start()
		assertTrue(info.endpoint.contains("24991"))

		// Both close calls should be clean and idempotent
		service.close()
		service.close()
		workspace.close()
		workspace.close()
		viewModel.close()
	}
}
