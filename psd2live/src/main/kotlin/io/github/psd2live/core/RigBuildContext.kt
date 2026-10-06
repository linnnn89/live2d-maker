package io.github.psd2live.core

import io.github.psd2live.core.RigBuildIds.faceTags
import io.github.psd2live.core.RigBuildMath.inHeadSpace
import io.github.psd2live.core.RigBuildMath.inferredGroup
import org.umamo.runtime.model.Deformer
import org.umamo.runtime.model.DeformerId
import org.umamo.runtime.model.Drawable
import org.umamo.runtime.model.DrawableId
import org.umamo.runtime.model.DrawableMesh
import org.umamo.runtime.model.Parameter
import org.umamo.runtime.model.PartId

	internal data class RigMeshData(
		val mesh: DrawableMesh,
		/** Source points expressed in the coordinate system of their parent frame. */
		val rigPositions: FloatArray,
	)

	internal data class DeformerBuildResult(
		val deformers: List<Deformer>,
		val pairFrames: Map<String, Bounds>,
		val pairedParentByLayerId: Map<String, Pair<DeformerId, Bounds>>,
	)

internal data class DrawableBuildResult(
    val drawables: List<Drawable>,
    val classifiedByDrawable: Map<DrawableId, ClassifiedLayer>,
    val pageByDrawable: Map<String, Int>,
    val sourceBoundsByDrawable: Map<String, Bounds>,
    val layerIdByDrawable: Map<String, String>,
    val customParameters: List<Parameter>,
    val warnings: List<String>,
)

/** Fixed persisted object identities; allocation of repeated drawable/pair IDs stays local to a build. */
internal object RigBuildIds {
	val bodyWarpId = DeformerId("DeformBodyXY")
	val breathWarpId = DeformerId("DeformBodyZBreath")
	val headRotationId = DeformerId("DeformHeadRotation")
	val headWarpId = DeformerId("DeformHeadContainer")
	val faceWarpId = DeformerId("DeformFaceNinePose")
	val faceContourId = DeformerId("DeformFaceContour")
	val featureDisplacementId = DeformerId("DeformFeatureDisplacement")
	val frontHairFollowWarpId = DeformerId("DeformHairFrontFollow")
	val frontHairPhysicsWarpId = DeformerId("DeformHairFrontPhysics")
	val backHairFollowWarpId = DeformerId("DeformHairBackFollow")
	val backHairPhysicsWarpId = DeformerId("DeformHairBackPhysics")
	val eyesWarpId = DeformerId("DeformEyes")
	val browsWarpId = DeformerId("DeformBrows")
	val earsWarpId = DeformerId("DeformEars")

	val faceTags = setOf(
		SemanticTag.FACE,
		SemanticTag.FACE_DETAIL,
		SemanticTag.IRIDES,
		SemanticTag.EYEBROW,
		SemanticTag.EYEWHITE,
		SemanticTag.EYELASH,
		SemanticTag.EYE_CLOSE,
		SemanticTag.EYEWEAR,
		SemanticTag.EARS,
		SemanticTag.EARWEAR,
		SemanticTag.NOSE,
		SemanticTag.MOUTH,
		SemanticTag.MOUTH_OPEN,
		SemanticTag.MOUTH_CLOSE,
		SemanticTag.TOOTH_T,
		SemanticTag.TOOTH_B,
		SemanticTag.TONGUE,
	)

}

/** Per-build coordinate spaces, layer identities and settings; generators never mutate this capture. */
internal class RigBuildContext(inputAnalysis: PipelineAnalysis, val atlas: PackedAtlas, val config: PipelineConfig) {
    val generatedLips = inputAnalysis.layers.filter { it.source is MouthLipLayer }
        .associateBy { it.source.id.raw }
    val analysis = inputAnalysis.copy(layers = inputAnalysis.layers.filter { it.source !is MouthLipLayer })
	val characterFrame = analysis.anchors.character
	val layout = analysis.calibration ?: analysis
    val faceRig = NinePoseFaceRig.from(layout)
	val headSpace = faceRig.coordinateSpace
	val rigLayerById = analysis.layers.associate { layer ->
		val rigLayer = if (inferredGroup(layer, analysis.anchors) == LayerGroup.HEAD) layer.inHeadSpace(headSpace) else layer
		layer.source.id.raw to rigLayer
	}
	val layoutRigLayers = layout.layers.map { if (inferredGroup(it, layout.anchors) == LayerGroup.HEAD) it.inHeadSpace(headSpace) else it }
    val headCandidates = layout.layers
		.filter { inferredGroup(it, analysis.anchors) == LayerGroup.HEAD && it.opaquePixels > 0 }
		.map { it.inHeadSpace(headSpace) }
	val headFrame = if (headCandidates.isEmpty()) faceRig.face else headCandidates.map { it.bounds }.reduce(Bounds::union).expanded(0.025f)
	val eyeWhiteLayers = layoutRigLayers.filter {
		it.semantic.tag == SemanticTag.EYEWHITE && it.opaquePixels > 0
	}
	val faceCandidates = layoutRigLayers.filter { it.semantic.tag in faceTags && it.opaquePixels > 0 }
	val faceFrame = (faceCandidates.map { it.bounds } + faceRig.face)
		.reduce(Bounds::union)
		.expanded(0.025f)
	val frontHairCandidates = layoutRigLayers.filter { it.semantic.tag == SemanticTag.FRONT_HAIR && it.opaquePixels > 0 }
	val backHairCandidates = layoutRigLayers.filter { it.semantic.tag == SemanticTag.BACK_HAIR && it.opaquePixels > 0 }
	val frontHairFrame = frontHairCandidates.map { it.bounds }.takeIf { it.isNotEmpty() }?.reduce(Bounds::union)?.expanded(0.04f)
	val backHairFrame = backHairCandidates.map { it.bounds }.takeIf { it.isNotEmpty() }?.reduce(Bounds::union)?.expanded(0.04f)

	val headPartId = PartId("PartHead")
	val facePartId = PartId("PartFace")
	val frontHairPartId = PartId("PartHairFront")
	val backHairPartId = PartId("PartHairBack")
	val headAccessoryPartId = PartId("PartHeadAccessories")
	val bodyPartId = PartId("PartBody")
	val extraPartId = PartId("PartExtra")
	val shouldBuildDeformers = !config.meshOnly && config.generateDeformers
}
