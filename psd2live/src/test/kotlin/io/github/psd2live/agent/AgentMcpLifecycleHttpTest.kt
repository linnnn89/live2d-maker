package io.github.psd2live.agent

import io.github.psd2live.core.PSD2LivePipeline
import io.github.psd2live.core.PipelineConfig
import io.github.psd2live.ui.state.PSD2LiveState
import io.github.psd2live.ui.state.PSD2LiveViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.*
import org.umamo.format.psd.PsdReader
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.TimeUnit
import kotlin.test.*

class AgentMcpLifecycleHttpTest {
    @Test
    fun lateHttpMutationCannotReachReopenedWorkspace() = runBlocking {
        val store = Files.createTempDirectory("mcp-lifecycle-")
        val viewModel = PSD2LiveViewModel()
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val old = ViewModelAgentWorkspace(viewModel, store)
        val delayed = object : AgentWorkspace by old, AutoCloseable {
            override suspend fun softDeleteLayer(layerId: String, expectedHistoryHeadNodeId: String,
                                                 taskId: String?): AgentWorkspaceMutationResult {
                entered.complete(Unit)
                release.await()
                return old.softDeleteLayer(layerId, expectedHistoryHeadNodeId, taskId)
            }
            override fun close() = old.close()
        }
        val token = "mcp-lifecycle-test-credential-00000001"
        val first = AgentMcpService(delayed, AgentMcpConfig(port = 0, token = token))
        var second: AgentMcpService? = null
        val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
        try {
            val source = PsdReader.read(Files.readAllBytes(Path.of("examples/ds/psd-input/ds.psd")))
            val preview = PSD2LivePipeline().buildPreview(source, PipelineConfig(atlasSize = 1024))
            viewModel.setStateForTest(PSD2LiveState(projectId = "http-lifecycle", analysis = preview.analysis,
                previewModel = preview, atlasSize = 1024))
            viewModel.attachAgentWorkspace(old)
            val captured = old.snapshot()
            val endpoint = first.start().endpoint
            val session = initialize(client, endpoint, token)
            val mutation = client.sendAsync(request(endpoint, token, session, rpc(3, "tools/call",
                buildJsonObject {
                    put("name", "asset")
                    putJsonObject("arguments") {
                        putJsonObject("request") {
                            put("mode", "remove"); put("layer_id", captured.layers.first().id)
                            put("state", requireNotNull(captured.historyHeadNodeId))
                        }
                    }
                })), HttpResponse.BodyHandlers.ofString())
            withTimeout(5_000) { entered.await() }

            // The old HTTP handler stays in flight while the same VM opens a fresh workspace.
            old.close()
            val reopened = ViewModelAgentWorkspace(viewModel, store)
            viewModel.attachAgentWorkspace(reopened)
            val reopenedService = AgentMcpService(reopened, AgentMcpConfig(port = 0, token = token))
            second = reopenedService
            val reopenedEndpoint = reopenedService.start().endpoint
            val reopenedSession = initialize(client, reopenedEndpoint, token)
            val before = viewModel.state.value
            val historyBefore = reopened.history()
            release.complete(Unit)
            val rejected = mutation.get(10, TimeUnit.SECONDS)
            assertEquals(200, rejected.statusCode())
            val result = Json.parseToJsonElement(rejected.body()).jsonObject.getValue("result").jsonObject
            assertEquals(true, result.getValue("isError").jsonPrimitive.boolean)
            assertTrue(result.toString().contains("closed", ignoreCase = true))
            assertSame(before, viewModel.state.value)
            assertEquals(historyBefore, reopened.history())
            assertTrue(viewModel.state.value.deletedLayerIds.isEmpty())
            val inspection = client.send(request(reopenedEndpoint, token, reopenedSession, rpc(4, "tools/call",
                buildJsonObject { put("name", "inspect"); putJsonObject("arguments") { put("scope", "project") } }
            )), HttpResponse.BodyHandlers.ofString())
            assertEquals(200, inspection.statusCode())
            assertFalse(Json.parseToJsonElement(inspection.body()).jsonObject.getValue("result")
                .jsonObject["isError"]?.jsonPrimitive?.boolean == true)

            if (System.getProperty("os.name").startsWith("Windows")) {
                // Exercise the real PowerShell -> Python -> stdio proxy -> source HTTP service path.
                val root = Path.of("..").toAbsolutePath().normalize()
                val process = ProcessBuilder("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
                    "-File", root.resolve("check-mcp.ps1").toString(), "-TimeoutSeconds", "5")
                    .directory(store.toFile()).redirectErrorStream(true).apply {
                        environment()["PSD2LIVE_MCP_ENDPOINT"] = reopenedEndpoint
                        environment()["PSD2LIVE_MCP_TOKEN"] = token
                    }.start()
                try {
                    assertTrue(process.waitFor(10, TimeUnit.SECONDS), "Windows diagnostic must finish")
                    val output = process.inputStream.bufferedReader(Charsets.UTF_8).readText()
                    assertEquals(0, process.exitValue(), output)
                    assertTrue(output.contains("[4/4] [OK]"), output)
                    assertFalse(output.contains(token), "Diagnostic must not disclose credentials")
                } finally {
                    if (process.isAlive) process.destroyForcibly().waitFor(5, TimeUnit.SECONDS)
                }
            }
        } finally {
            release.complete(Unit)
            first.close()
            second?.close()
            viewModel.close()
            client.close()
            store.toFile().deleteRecursively()
        }
    }

    private fun initialize(client: HttpClient, endpoint: String, token: String): String {
        val response = client.send(request(endpoint, token, null, rpc(1, "initialize", buildJsonObject {
            put("protocolVersion", "2025-03-26"); putJsonObject("capabilities") {}
            putJsonObject("clientInfo") { put("name", "lifecycle-regression"); put("version", "1") }
        })), HttpResponse.BodyHandlers.ofString())
        assertEquals(200, response.statusCode(), response.body())
        val session = response.headers().firstValue("mcp-session-id").orElseThrow()
        val initialized = buildJsonObject { put("jsonrpc", "2.0"); put("method", "notifications/initialized") }
        assertEquals(202, client.send(request(endpoint, token, session, initialized),
            HttpResponse.BodyHandlers.ofString()).statusCode())
        return session
    }

    private fun rpc(id: Int, method: String, params: JsonObject) = buildJsonObject {
        put("jsonrpc", "2.0"); put("id", id); put("method", method); put("params", params)
    }

    private fun request(endpoint: String, token: String, session: String?, body: JsonObject): HttpRequest =
        HttpRequest.newBuilder(URI(endpoint)).timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json, text/event-stream")
            .header("Content-Type", "application/json")
            .header("MCP-Protocol-Version", "2025-03-26")
            .apply { if (session != null) header("Mcp-Session-Id", session) }
            .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build()
}
