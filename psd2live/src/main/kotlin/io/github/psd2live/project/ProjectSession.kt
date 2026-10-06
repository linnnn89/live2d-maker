package io.github.psd2live.project

import io.github.psd2live.agent.ViewModelAgentWorkspace
import io.github.psd2live.application.OpenedWorkspaceProject
import io.github.psd2live.application.WorkspaceProjectCapture
import io.github.psd2live.application.WorkspaceService
import io.github.psd2live.ui.state.PSD2LiveViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.nio.file.Path

/** Desktop adapter: capture/install UI state and serialize saves while edits may continue. */
internal class ProjectSession(
    private val viewModel: PSD2LiveViewModel,
    private val service: WorkspaceService = WorkspaceService(),
) {
    private val saves = Mutex()

    suspend fun save(workspace: ViewModelAgentWorkspace, path: Path, actor: String = "user"): String {
        viewModel.projectSaveStarted()
        try {
            val capture = workspace.captureProject("Save project", actor)
            return saves.withLock {
                workspace.flushProjectPersistence()
                val state = capture.uiState
                val project = WorkspaceProjectCapture(
                    capture.projectId, capture.history, WorkspaceStateCodec.encode(state),
                    Path.of(state.loadedInputPath ?: state.inputPath), capture.tasks, capture.store, capture.spatial,
                )
                val head = withContext(Dispatchers.IO) { service.save(project, path) }
                viewModel.projectSaveFinished(path, head, state)
                head
            }
        } catch (failure: Exception) {
            viewModel.projectSaveFailed(failure)
            throw failure
        }
    }

    suspend fun open(workspace: ViewModelAgentWorkspace, path: Path) = saves.withLock {
        val expected = viewModel.state.value
        var opened: OpenedWorkspaceProject? = null
        try {
            // Assign ownership inside IO, so cancellation on dispatcher return still reaches cleanup.
            val project = withContext(Dispatchers.IO) { service.open(path).also { opened = it } }
            val state = WorkspaceStateCodec.decode(project.presentation)
            workspace.installProject(project.projectId, path.toAbsolutePath().normalize(), project.source,
                state, project.history, project.store, expected)
            workspace.rememberProjectDirectory(project.root)
            project.transferToSession()
        } finally {
            withContext(NonCancellable + Dispatchers.IO) { opened?.close() }
        }
    }
}
