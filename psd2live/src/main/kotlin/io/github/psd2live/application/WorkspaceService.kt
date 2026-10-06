package io.github.psd2live.application

import io.github.psd2live.agent.AgentTaskSnapshot
import io.github.psd2live.agent.AgentViewSpatialMetadata
import io.github.psd2live.agent.AgentWorkspaceDocument
import io.github.psd2live.agent.AgentWorkspaceStore
import io.github.psd2live.history.WorkspaceHistoryState
import io.github.psd2live.history.WorkspaceHistoryTree
import io.github.psd2live.project.ProjectArchive
import kotlinx.serialization.json.*
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.Base64

/** A captured revision; desktop presentation state is opaque to the persistence use case. */
internal data class WorkspaceProjectCapture(
    val projectId: String,
    val history: WorkspaceHistoryState<AgentWorkspaceDocument>,
    val presentation: JsonObject,
    val source: Path,
    val tasks: List<AgentTaskSnapshot>,
    val store: AgentWorkspaceStore,
    val spatial: Map<String, AgentViewSpatialMetadata>,
)

/** Owns the private extraction until the caller transfers it to the active session. */
internal class OpenedWorkspaceProject(
    val root: Path,
    val projectId: String,
    val presentation: JsonObject,
    val source: Path,
    val history: WorkspaceHistoryTree<AgentWorkspaceDocument>,
    val store: AgentWorkspaceStore,
) : AutoCloseable {
    private var owned = true
    fun transferToSession() { owned = false }
    override fun close() {
        if (owned) {
            ProjectArchive.deleteTemporaryDirectory(root)
            owned = false
        }
    }
}

/** UI-independent portable project read/write. Callers serialize saves and schedule disk IO. */
internal class WorkspaceService(
    private val writeArchive: (Path, Path, String) -> Unit = ProjectArchive::write,
) {
    fun save(capture: WorkspaceProjectCapture, target: Path): String {
        val root = Files.createTempDirectory("psd2live-project-")
        try {
            val store = AgentWorkspaceStore(root.resolve("workspace"))
            store.persistHistory(capture.projectId, capture.history)
            capture.store.copyAuxiliary(capture.projectId, root.resolve("workspace").resolve(capture.projectId))
            capture.spatial.forEach { (id, spatial) -> store.persistSpatial(capture.projectId, id, spatial) }
            store.persistTasks(capture.projectId, capture.tasks)
            require(Files.isRegularFile(capture.source)) { "Original PSD is unavailable: ${capture.source}" }
            Files.createDirectories(root.resolve("source"))
            Files.copy(capture.source, root.resolve("source/original.psd"))
            val presentation = capture.presentation.toMutableMap()
            presentation["logEntries"] = JsonArray(presentation["logEntries"]?.jsonArray.orEmpty().map { entry ->
                val log = entry.jsonObject.toMutableMap()
                log.remove("image")?.jsonPrimitive?.content?.let { encoded ->
                    val bytes = Base64.getDecoder().decode(encoded)
                    val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
                    val imagePath = "images/$hash.png"
                    Files.createDirectories(root.resolve("images"))
                    Files.write(root.resolve(imagePath), bytes)
                    log["imagePath"] = JsonPrimitive(imagePath)
                }
                JsonObject(log)
            })
            ProjectArchive.writeJson(root.resolve("workspace.json"), JsonObject(presentation))
            Files.writeString(root.resolve("README.txt"), "PSD2Live project v1. Unencrypted ZIP. manifest.json inventories SHA-256 checksums. source/original.psd is the original source; workspace/ contains immutable history snapshots, PNG resources, tasks and spatial references; workspace.json restores the UI. See docs/en/spec/PROJECT_FORMAT.md.\n")
            writeArchive(root, target, capture.projectId)
            return capture.history.headNodeId
        } finally {
            ProjectArchive.deleteTemporaryDirectory(root)
        }
    }

    fun open(path: Path): OpenedWorkspaceProject {
        val root = ProjectArchive.extract(path)
        try {
            val id = ProjectArchive.readJson(root.resolve("manifest.json")).getValue("projectId").jsonPrimitive.content
            val store = AgentWorkspaceStore(root.resolve("workspace"))
            val history = store.loadHistory(id) ?: error("Project has no history")
            val presentation = ProjectArchive.readJson(root.resolve("workspace.json")).toMutableMap()
            presentation["logEntries"] = JsonArray(presentation["logEntries"]?.jsonArray.orEmpty().map { entry ->
                val log = entry.jsonObject.toMutableMap()
                log.remove("imagePath")?.jsonPrimitive?.content?.let { name ->
                    val image = root.resolve(name).normalize()
                    require(!Path.of(name).isAbsolute && image.startsWith(root) && Files.isRegularFile(image)) { "Invalid log image reference" }
                    log["image"] = JsonPrimitive(Base64.getEncoder().encodeToString(Files.readAllBytes(image)))
                }
                JsonObject(log)
            })
            val source = root.resolve("source/original.psd")
            require(Files.isRegularFile(source)) { "Project has no original PSD" }
            return OpenedWorkspaceProject(root, id, JsonObject(presentation), source, history, store)
        } catch (failure: Throwable) {
            ProjectArchive.deleteTemporaryDirectory(root)
            throw failure
        }
    }
}
