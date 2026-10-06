package io.github.psd2live.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.nio.file.Path

/** Versioned bridge configuration; native defaults outside this contract remain native-owned. */
@Serializable
data class AuthoringBuildConfig(
    val schemaVersion: Int = 1,
    val atlasSize: Int = 2048,
    val meshSpacing: Int = 24,
    val generatePhysics: Boolean = false,
    val exportCmo3: Boolean = false,
    val exportMotions: Boolean = false,
)

/** UI-independent entry point for the Python authoring bridge. */
class AuthoringPipelineFacade {
    private val pipeline = PSD2LivePipeline()

    fun inspect(psd: Path, configurationJson: String): PipelineAnalysis =
        pipeline.inspect(psd, configuration(configurationJson, RigEditOverlay.Empty))

    fun buildPreview(psd: Path, config: PipelineConfig): RigPreviewModel = pipeline.buildPreview(psd, config)

    fun run(psd: Path, output: Path, config: PipelineConfig, progress: ProgressListener): PipelineResult =
        pipeline.run(psd, output, config, progress)

    companion object {
        private val json = Json { ignoreUnknownKeys = false }

        @JvmStatic
        fun configuration(configurationJson: String, overlay: RigEditOverlay): PipelineConfig {
            val settings = json.decodeFromString<AuthoringBuildConfig>(configurationJson)
            require(settings.schemaVersion == 1) { "Unsupported authoring configuration version" }
            require(settings.atlasSize > 0 && settings.meshSpacing > 0) { "Atlas size and mesh spacing must be positive" }
            val customPhysics = overlay.physicsEdits.isNotEmpty()
            // Explicit physics edits enable physics but suppress generated default hair/eye settings.
            return PipelineConfig(
                atlasSize = settings.atlasSize,
                meshSpacing = settings.meshSpacing,
                generatePhysics = settings.generatePhysics || customPhysics,
                exportCmo3 = settings.exportCmo3,
                exportMotions = settings.exportMotions,
                physicsFrontHair = !customPhysics,
                physicsBackHair = !customPhysics,
                physicsEyeJelly = !customPhysics,
                rigEdits = overlay,
            )
        }
    }
}
