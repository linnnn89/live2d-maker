package io.github.psd2live.core

import io.github.psd2live.core.HierarchyBuilder.buildDeformers
import io.github.psd2live.core.HierarchyBuilder.featureWarpId
import io.github.psd2live.core.HierarchyBuilder.gazeWarpId
import io.github.psd2live.core.HierarchyBuilder.parameterTree
import io.github.psd2live.core.HierarchyBuilder.withParent
import io.github.psd2live.core.HierarchyBuilder.wouldCreateCycle
import io.github.psd2live.core.RigBuildIds.backHairFollowWarpId
import io.github.psd2live.core.RigBuildIds.backHairPhysicsWarpId
import io.github.psd2live.core.RigBuildIds.bodyWarpId
import io.github.psd2live.core.RigBuildIds.breathWarpId
import io.github.psd2live.core.RigBuildIds.faceContourId
import io.github.psd2live.core.RigBuildIds.faceWarpId
import io.github.psd2live.core.RigBuildIds.featureDisplacementId
import io.github.psd2live.core.RigBuildIds.frontHairFollowWarpId
import io.github.psd2live.core.RigBuildIds.frontHairPhysicsWarpId
import io.github.psd2live.core.RigBuildIds.headRotationId
import io.github.psd2live.core.RigBuildIds.headWarpId
import io.github.psd2live.i18n.tr
import org.umamo.runtime.model.Deformer
import org.umamo.runtime.model.KeyformGrid
import org.umamo.runtime.model.MeshDeltaForm
import org.umamo.runtime.model.DeformerId
import org.umamo.runtime.model.OrgChild
import org.umamo.runtime.model.Parameter
import org.umamo.runtime.model.ParameterId
import org.umamo.runtime.model.ParameterLink
import org.umamo.runtime.model.Part
import org.umamo.runtime.model.PuppetModel
import org.umamo.runtime.model.RuntimeTarget
import org.umamo.runtime.model.withDerivedRenderRoot

object StandardParameters {
	val ANGLE_X = ParameterId("ParamAngleX")
	val ANGLE_Y = ParameterId("ParamAngleY")
	val ANGLE_Z = ParameterId("ParamAngleZ")
	val BODY_X = ParameterId("ParamBodyAngleX")
	val BODY_Y = ParameterId("ParamBodyAngleY")
	val BODY_Z = ParameterId("ParamBodyAngleZ")
	val EYE_L_OPEN = ParameterId("ParamEyeLOpen")
	val EYE_R_OPEN = ParameterId("ParamEyeROpen")
	val EYE_BALL_X = ParameterId("ParamEyeBallX")
	val EYE_BALL_Y = ParameterId("ParamEyeBallY")
	val EYE_BALL_FORM = ParameterId("ParamEyeBallForm")
	val BROW_L_Y = ParameterId("ParamBrowLY")
	val BROW_R_Y = ParameterId("ParamBrowRY")
	val MOUTH_FORM = ParameterId("ParamMouthForm")
	val MOUTH_OPEN = ParameterId("ParamMouthOpenY")
	val BREATH = ParameterId("ParamBreath")
	val HAIR_FRONT = ParameterId("ParamHairFront")
	val HAIR_BACK = ParameterId("ParamHairBack")

	val all: List<Parameter>
		get() = listOf(
			Parameter(ANGLE_X, tr("model.parameter.angleX"), -45f, 45f, 0f),
			Parameter(ANGLE_Y, tr("model.parameter.angleY"), -30f, 30f, 0f),
			Parameter(ANGLE_Z, tr("model.parameter.angleZ"), -30f, 30f, 0f),
			Parameter(BODY_X, tr("model.parameter.bodyX"), -10f, 10f, 0f),
			Parameter(BODY_Y, tr("model.parameter.bodyY"), -10f, 10f, 0f),
			Parameter(BODY_Z, tr("model.parameter.bodyZ"), -10f, 10f, 0f),
			Parameter(EYE_L_OPEN, tr("model.parameter.eyeLOpen"), 0f, 1f, 1f),
			Parameter(EYE_R_OPEN, tr("model.parameter.eyeROpen"), 0f, 1f, 1f),
			Parameter(EYE_BALL_X, tr("model.parameter.eyeBallX"), -1f, 1f, 0f),
			Parameter(EYE_BALL_Y, tr("model.parameter.eyeBallY"), -1f, 1f, 0f),
			Parameter(EYE_BALL_FORM, tr("model.parameter.eyeBallForm"), -1f, 1f, 0f),
			Parameter(BROW_L_Y, tr("model.parameter.browLY"), -1f, 1f, 0f),
			Parameter(BROW_R_Y, tr("model.parameter.browRY"), -1f, 1f, 0f),
			Parameter(MOUTH_FORM, tr("model.parameter.mouthForm"), -1f, 1f, 0f),
			Parameter(MOUTH_OPEN, tr("model.parameter.mouthOpen"), 0f, 1f, 0f),
			Parameter(BREATH, tr("model.parameter.breath"), 0f, 1f, 0f),
			Parameter(HAIR_FRONT, tr("model.parameter.hairFront"), -1f, 1f, 0f),
			Parameter(HAIR_BACK, tr("model.parameter.hairBack"), -1f, 1f, 0f),
		)
}

data class BuiltRig(
	val puppet: PuppetModel,
	val pageByDrawableId: Map<String, Int>,
	val sourceBoundsByDrawableId: Map<String, Bounds>,
	val layerIdByDrawableId: Map<String, String>,
	val faceCenterX: Float,
	val faceCenterY: Float,
	val faceRadiusX: Float,
	val faceRadiusY: Float,
	val warnings: List<String>,
	val initialHeadAngleZ: Float = 0f,
)

object RigBuilder {
    fun build(inputAnalysis: PipelineAnalysis, atlas: PackedAtlas, config: PipelineConfig): BuiltRig =
        with(RigBuildContext(inputAnalysis, atlas, config)) {
        val deformerResult = if (shouldBuildDeformers) HierarchyBuilder.buildDeformers(this)
            else DeformerBuildResult(emptyList(), emptyMap(), emptyMap())
		val rawDeformers = deformerResult.deformers

		val deformers = if (config.parentOverrides.isEmpty()) rawDeformers else {
			val deformerById = rawDeformers.associateBy { it.id.raw }
			rawDeformers.map { deformer ->
				if (config.parentOverrides.containsKey(deformer.id.raw)) {
					val targetParentRaw = config.parentOverrides[deformer.id.raw]
					val targetParentId = targetParentRaw?.takeIf { it.isNotBlank() && !it.equals("root", true) }?.let(::DeformerId)
					if (targetParentId != null && wouldCreateCycle(deformer.id.raw, targetParentId.raw, deformerById, config.parentOverrides)) {
						deformer
					} else {
						deformer.withParent(targetParentId)
					}
				} else deformer
			}
		}

		val frameByDeformer = mutableMapOf<String, Bounds>()
		frameByDeformer[bodyWarpId.raw] = characterFrame
		frameByDeformer[breathWarpId.raw] = characterFrame
		frameByDeformer[headRotationId.raw] = characterFrame
		frameByDeformer[headWarpId.raw] = headFrame
		frameByDeformer[faceWarpId.raw] = faceFrame
		frameByDeformer[faceContourId.raw] = faceFrame
		frameByDeformer[featureDisplacementId.raw] = faceFrame
		for (region in faceRig.regions) {
			frameByDeformer[featureWarpId(region).raw] = region.bounds
			if (region.feature == FaceFeature.IRIS) {
				frameByDeformer[gazeWarpId(region).raw] = region.bounds
			}
		}
		frontHairFrame?.let {
			frameByDeformer[frontHairFollowWarpId.raw] = it
			frameByDeformer[frontHairPhysicsWarpId.raw] = it
		}
		backHairFrame?.let {
			frameByDeformer[backHairFollowWarpId.raw] = it
			frameByDeformer[backHairPhysicsWarpId.raw] = it
		}
		frameByDeformer.putAll(deformerResult.pairFrames)

        val drawableResult = DrawableBuilder.build(this, deformerResult, frameByDeformer)
        val parts = HierarchyBuilder.parts(this, drawableResult)
		val standardIds = StandardParameters.all.map { it.id }.toSet()
		val uniqueCustomParams = drawableResult.customParameters.filter { it.id !in standardIds }
		val parameterTree = parameterTree(uniqueCustomParams)
		val puppet = PuppetModel(
			parameters = StandardParameters.all + uniqueCustomParams,
			parts = parts,
			deformers = deformers,
			drawables = drawableResult.drawables,
			rootChildren = listOf(OrgChild.Part(headPartId), OrgChild.Part(extraPartId), OrgChild.Part(bodyPartId)),
			rootPartId = null,
			parameterLinks = listOf(
				ParameterLink(StandardParameters.ANGLE_X, StandardParameters.ANGLE_Y),
				ParameterLink(StandardParameters.BODY_X, StandardParameters.BODY_Y),
				ParameterLink(StandardParameters.EYE_BALL_X, StandardParameters.EYE_BALL_Y),
			),
			parameterTree = parameterTree,
			canvasWidth = analysis.source.widthPx.toFloat(),
			canvasHeight = analysis.source.heightPx.toFloat(),
			worldOriginX = analysis.source.widthPx * 0.5f,
			worldOriginY = -analysis.source.heightPx * 0.5f,
			// Cubism 5.0/MOC v5 is the compatibility baseline.  The generated rig does not use any
			// 5.3-only feature, and targeting v5 keeps it readable by both current Viewer releases and
			// older Cubism 5 runtimes without relying on v6-only container fields.
			runtimeTarget = RuntimeTarget.Cubism50,
		).withDerivedRenderRoot()
		val faceCenterCanvas = faceRig.coordinateSpace.toCanvas(faceRig.centerX, faceRig.centerY)
		return BuiltRig(
			puppet,
			drawableResult.pageByDrawable,
			drawableResult.sourceBoundsByDrawable,
			drawableResult.layerIdByDrawable,
			faceCenterCanvas.first,
			faceCenterCanvas.second,
			faceRig.radiusX,
			faceRig.radiusY,
			drawableResult.warnings,
			faceRig.initialAngleZ,
		)
	}



	internal fun bodyWarpPoint(
		character: Bounds,
		u: Float,
		v: Float,
		bodyAngleX: Float,
		bodyAngleY: Float,
		strength: Float,
	) : Pair<Float, Float> = HierarchyBuilder.bodyWarpPoint(character, u, v, bodyAngleX, bodyAngleY, strength)
	internal fun bodySecondaryWarpPoint(
		u: Float,
		v: Float,
		bodyAngleZ: Float,
		breathValue: Float,
		strength: Float,
	) : Pair<Float, Float> = HierarchyBuilder.bodySecondaryWarpPoint(u, v, bodyAngleZ, breathValue, strength)
	internal fun headContainerPoint(
		head: Bounds,
		originX: Float,
		originY: Float,
		u: Float,
		v: Float,
		angleX: Float,
		angleY: Float,
		strength: Float,
	) : Pair<Float, Float> = HierarchyBuilder.headContainerPoint(head, originX, originY, u, v, angleX, angleY, strength)
	internal fun gazePoint(u: Float, v: Float, eyeX: Float, eyeY: Float) : Pair<Float, Float> = HierarchyBuilder.gazePoint(u, v, eyeX, eyeY)
	internal fun hairFollowPoint(
		inHead: Bounds,
		u: Float,
		v: Float,
		angleX: Float,
		angleY: Float,
		yawParallax: Float,
		pitchParallax: Float,
		yawPerspective: Float = 0f,
	) : Pair<Float, Float> = HairRigGenerator.hairFollowPoint(inHead, u, v, angleX, angleY, yawParallax, pitchParallax, yawPerspective)
	internal fun hairPhysicsPoint(
		u: Float,
		v: Float,
		swing: Float,
		normalizedSway: Float,
		normalizedCurl: Float,
	) : Pair<Float, Float> = HairRigGenerator.hairPhysicsPoint(u, v, swing, normalizedSway, normalizedCurl)
	internal fun pairBaseName(name: String) : String = HierarchyBuilder.pairBaseName(name)
	internal fun faceContourPoint(u: Float, v: Float, angleX: Float, strength: Float, socketY: Float) : Pair<Float, Float> = HierarchyBuilder.faceContourPoint(u, v, angleX, strength, socketY)
	internal fun featureDisplacementPoint(
		u: Float, v: Float, angleX: Float, angleY: Float, strength: Float,
		aspectRatio: Float = 1f,
	) : Pair<Float, Float> = HierarchyBuilder.featureDisplacementPoint(u, v, angleX, angleY, strength, aspectRatio)
	internal fun eyeClosurePoint(
		sourceX: Float,
		sourceY: Float,
		layerBounds: Bounds,
		eyeWhiteBounds: Bounds,
		tag: SemanticTag,
		sourceAnchorY: Float = layerBounds.centerY,
	) : Pair<Float, Float> = EyeRigGenerator.eyeClosurePoint(sourceX, sourceY, layerBounds, eyeWhiteBounds, tag, sourceAnchorY)
	internal fun irisJellyPoint(
		sourceX: Float,
		sourceY: Float,
		pivotX: Float,
		pivotY: Float,
		jelly: Float,
	) : Pair<Float, Float> = EyeRigGenerator.irisJellyPoint(sourceX, sourceY, pivotX, pivotY, jelly)
	internal fun mouthWholePoint(
		sourceX: Float,
		sourceY: Float,
		aperture: Bounds,
		mouthForm: Float,
		mouthOpen: Float,
        shape: String = "smile",
        exactClose: Boolean = false,
        curve: MouthCurve = MouthCurve.preset("smile"),
	) : Pair<Float, Float> = MouthRigGenerator.mouthWholePoint(sourceX, sourceY, aperture, mouthForm, mouthOpen, shape, exactClose, curve)
	internal fun zeroMeshGrid(size: Int) : KeyformGrid<MeshDeltaForm> = RigBuildMath.zeroMeshGrid(size)
	internal fun wouldCreateCycle(
		sourceId: String,
		targetId: String,
		deformerById: Map<String, Deformer>,
		parentOverrides: Map<String, String?>,
	) : Boolean = HierarchyBuilder.wouldCreateCycle(sourceId, targetId, deformerById, parentOverrides)
}
