package io.github.psd2live.core

import io.github.psd2live.core.RigBuildMath.scalarGrid
import io.github.psd2live.core.HairRigGenerator.hairFollowWarp
import io.github.psd2live.core.HairRigGenerator.hairPhysicsWarp
import io.github.psd2live.core.RigBuildIds.backHairFollowWarpId
import io.github.psd2live.core.RigBuildIds.backHairPhysicsWarpId
import io.github.psd2live.core.RigBuildIds.bodyWarpId
import io.github.psd2live.core.RigBuildIds.breathWarpId
import io.github.psd2live.core.RigBuildIds.browsWarpId
import io.github.psd2live.core.RigBuildIds.earsWarpId
import io.github.psd2live.core.RigBuildIds.eyesWarpId
import io.github.psd2live.core.RigBuildIds.faceContourId
import io.github.psd2live.core.RigBuildIds.faceTags
import io.github.psd2live.core.RigBuildIds.faceWarpId
import io.github.psd2live.core.RigBuildIds.featureDisplacementId
import io.github.psd2live.core.RigBuildIds.frontHairFollowWarpId
import io.github.psd2live.core.RigBuildIds.frontHairPhysicsWarpId
import io.github.psd2live.core.RigBuildIds.headRotationId
import io.github.psd2live.core.RigBuildIds.headWarpId
import io.github.psd2live.core.RigBuildMath.ninePoseAxes
import io.github.psd2live.core.RigBuildMath.axis
import io.github.psd2live.core.RigBuildMath.inferredGroup
import io.github.psd2live.core.RigBuildMath.mapBounds
import io.github.psd2live.core.RigBuildMath.normalizeX
import io.github.psd2live.core.RigBuildMath.normalizeY
import io.github.psd2live.core.RigBuildMath.oneDimGrid
import io.github.psd2live.core.RigBuildMath.warpGrid
import io.github.psd2live.i18n.tr
import java.text.Normalizer
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import org.umamo.runtime.model.ChannelGrids
import org.umamo.runtime.model.Deformer
import org.umamo.runtime.model.DeformerId
import org.umamo.runtime.model.Drawable
import org.umamo.runtime.model.FormChannel
import org.umamo.runtime.model.KeyformAxis
import org.umamo.runtime.model.OrgChild
import org.umamo.runtime.model.Parameter
import org.umamo.runtime.model.ParameterGroupId
import org.umamo.runtime.model.ParameterId
import org.umamo.runtime.model.ParameterNode
import org.umamo.runtime.model.Part
import org.umamo.runtime.model.PartGroupMode
import org.umamo.runtime.model.PartId
import org.umamo.runtime.model.RotationPivotForm

/** Builds deformer and part hierarchies in the captured coordinate spaces. */
internal object HierarchyBuilder {
    fun parts(context: RigBuildContext, result: DrawableBuildResult): List<Part> = with(context) {
        val maskedDrawables = result.drawables
        val classifiedByDrawable = result.classifiedByDrawable
        val anchors = analysis.anchors
		fun childrenFor(group: LayerGroup): List<OrgChild> =
			maskedDrawables
				.filter { inferredGroup(classifiedByDrawable.getValue(it.id), anchors) == group }
				.sortedBy { classifiedByDrawable.getValue(it.id).source.order }
				.map { OrgChild.Drawable(it.id) }
		fun headChildrenFor(predicate: (SemanticTag) -> Boolean): List<OrgChild> =
			maskedDrawables
				.filter { drawable ->
					val layer = classifiedByDrawable.getValue(drawable.id)
					inferredGroup(layer, anchors) == LayerGroup.HEAD && predicate(layer.semantic.tag)
				}
				.sortedBy { classifiedByDrawable.getValue(it.id).source.order }
				.map { OrgChild.Drawable(it.id) }
		return listOf(
			Part(
				headPartId,
				tr("model.part.head"),
				listOf(
					OrgChild.Part(backHairPartId),
					OrgChild.Part(facePartId),
					OrgChild.Part(frontHairPartId),
					OrgChild.Part(headAccessoryPartId),
				),
				groupMode = PartGroupMode.PassThrough,
			),
			Part(backHairPartId, tr("model.part.backHair"), headChildrenFor { it == SemanticTag.BACK_HAIR }, groupMode = PartGroupMode.PassThrough),
			Part(facePartId, tr("model.part.face"), headChildrenFor { it in faceTags }, groupMode = PartGroupMode.PassThrough),
			Part(frontHairPartId, tr("model.part.frontHair"), headChildrenFor { it == SemanticTag.FRONT_HAIR }, groupMode = PartGroupMode.PassThrough),
			Part(
				headAccessoryPartId,
				tr("model.part.headAccessories"),
				headChildrenFor { it !in faceTags && it != SemanticTag.FRONT_HAIR && it != SemanticTag.BACK_HAIR },
				groupMode = PartGroupMode.PassThrough,
			),
			Part(extraPartId, tr("model.part.extra"), childrenFor(LayerGroup.EXTRA), groupMode = PartGroupMode.PassThrough),
			Part(bodyPartId, tr("model.part.body"), childrenFor(LayerGroup.BODY) + childrenFor(LayerGroup.UNKNOWN), groupMode = PartGroupMode.PassThrough),
		)
    }

    fun buildDeformers(context: RigBuildContext): DeformerBuildResult = with(context) {
        val character = characterFrame
        val head = headFrame
        val frontHair = frontHairFrame
        val backHair = backHairFrame
		val bodyGrid = warpGrid(
			listOf(axis(StandardParameters.BODY_X, -10f, 0f, 10f), axis(StandardParameters.BODY_Y, -10f, 0f, 10f)),
			columns = 4,
			rows = 6,
		) { u, v, values ->
			bodyWarpPoint(character, u, v, values[0], values[1], config.bodyStrength)
		}
		val body = Deformer.Warp(bodyWarpId, tr("model.deformer.body"), null, bodyPartId, 6, 4, true, bodyGrid)

		val breathGrid = warpGrid(
			listOf(axis(StandardParameters.BODY_Z, -10f, 0f, 10f), axis(StandardParameters.BREATH, 0f, 0.5f, 1f)),
			columns = 4,
			rows = 6,
		) { u, v, values ->
			bodySecondaryWarpPoint(u, v, values[0], values[1], config.bodyStrength)
		}
		val breath = Deformer.Warp(breathWarpId, tr("model.deformer.breath"), bodyWarpId, bodyPartId, 6, 4, true, breathGrid)

		val headPivotX = faceRig.centerX
		val headPivotY = faceRig.mouthLineY
		val headPivotCanvas = faceRig.coordinateSpace.toCanvas(headPivotX, headPivotY)
		val headPivotLocalX = normalizeX(headPivotCanvas.first, character)
		val headPivotLocalY = normalizeY(headPivotCanvas.second, character)
		val rotationGrid = oneDimGrid(StandardParameters.ANGLE_Z, floatArrayOf(-30f, 0f, 30f)) { value ->
			RotationPivotForm(headPivotLocalX, headPivotLocalY, value, 1f)
		}
		val rotation = Deformer.Rotation(
			headRotationId,
			tr("model.deformer.headRotation"),
			breathWarpId,
			headPartId,
			faceRig.initialAngleZ,
			rotationGrid,
		)

		// A real head container separates skull-following content from the facial surface.  It is the
		// sole pixel-space child of the rotation deformer; all descendants use ordinary normalized
		// warp coordinates.  Face, front hair and back hair are siblings below this node.
		val headGrid = warpGrid(ninePoseAxes(), columns = 4, rows = 5) { u, v, values ->
			headContainerPoint(head, headPivotX, headPivotY, u, v, values[0], values[1], config.headTurnStrength)
		}
		val headContainer = Deformer.Warp(headWarpId, tr("model.deformer.headContainer"), headRotationId, headPartId, 5, 4, true, headGrid)

		val faceGrid = warpGrid(
			ninePoseAxes(),
			columns = 8,
			rows = 8,
		) { u, v, values ->
			val canvasX = faceFrame.left + u * faceFrame.width
			val canvasY = faceFrame.top + v * faceFrame.height
			val projected = faceRig.surfacePoint(canvasX, canvasY, values[0], values[1], config.headTurnStrength)
			normalizeX(projected.first, head) to normalizeY(projected.second, head)
		}
		val face = Deformer.Warp(faceWarpId, tr("model.deformer.face"), headWarpId, facePartId, 8, 8, true, faceGrid)

		// Identity at neutral, in the face's normalized space: the parent surface is inherited
		// exactly once. Both directional bows affect every row/column, not just the center knot.
		val displacementGrid = warpGrid(ninePoseAxes(), columns = 8, rows = 8) { u, v, values ->
			featureDisplacementPoint(u, v, values[0], values[1], config.headTurnStrength,
				faceFrame.width / faceFrame.height.coerceAtLeast(1e-4f))
		}
		val displacement = Deformer.Warp(featureDisplacementId, tr("model.deformer.featureDisplacement"),
			faceWarpId, facePartId, 8, 8, true, displacementGrid)
		val socketY = normalizeY(faceRig.eyeLineY, faceFrame).coerceIn(0.05f, 0.95f)
		val contourGrid = warpGrid(
			listOf(axis(StandardParameters.ANGLE_X, *NinePoseFaceRig.angleXKeys)), columns = 8, rows = 16,
		) { u, v, values -> faceContourPoint(u, v, values[0], config.headTurnStrength, socketY) }
		val contour = Deformer.Warp(faceContourId, tr("model.deformer.faceContour"),
			faceWarpId, facePartId, 16, 8, true, contourGrid)
		val deformers = mutableListOf<Deformer>(body, breath, rotation, headContainer, face, contour)
		if (config.featureDisplacementEnabled) deformers += displacement
		val pairFrames = mutableMapOf<String, Bounds>()
		val pairedParentByLayerId = mutableMapOf<String, Pair<DeformerId, Bounds>>()

		val leftEye = faceRig.regions.firstOrNull { it.feature == FaceFeature.EYE && it.side == Side.LEFT }
		val rightEye = faceRig.regions.firstOrNull { it.feature == FaceFeature.EYE && it.side == Side.RIGHT }
		val eyesBounds = if (leftEye != null && rightEye != null) {
			leftEye.bounds.union(rightEye.bounds).expanded(0.04f)
		} else null
		if (eyesBounds != null) {
			val eyesParent = if (config.featureDisplacementEnabled) featureDisplacementId else faceWarpId
			deformers += identityWarp(eyesWarpId, tr("model.deformer.eyes"), eyesParent, eyesBounds, faceFrame, facePartId, rows = 3, columns = 4)
			pairFrames[eyesWarpId.raw] = eyesBounds
		}

		val leftBrow = faceRig.regions.firstOrNull { it.feature == FaceFeature.BROW && it.side == Side.LEFT }
		val rightBrow = faceRig.regions.firstOrNull { it.feature == FaceFeature.BROW && it.side == Side.RIGHT }
		val browsBounds = if (leftBrow != null && rightBrow != null) {
			leftBrow.bounds.union(rightBrow.bounds).expanded(0.04f)
		} else null
		if (browsBounds != null) {
			val browsParent = if (config.featureDisplacementEnabled) featureDisplacementId else faceWarpId
			deformers += identityWarp(browsWarpId, tr("model.deformer.brows"), browsParent, browsBounds, faceFrame, facePartId, rows = 3, columns = 4)
			pairFrames[browsWarpId.raw] = browsBounds
		}

		val leftEar = faceRig.regions.firstOrNull { it.feature == FaceFeature.EAR && it.side == Side.LEFT }
		val rightEar = faceRig.regions.firstOrNull { it.feature == FaceFeature.EAR && it.side == Side.RIGHT }
		val earsBounds = if (leftEar != null && rightEar != null) {
			leftEar.bounds.union(rightEar.bounds).expanded(0.04f)
		} else null
		if (earsBounds != null) {
			deformers += identityWarp(earsWarpId, tr("model.deformer.ears"), faceWarpId, earsBounds, faceFrame, facePartId, rows = 3, columns = 4)
			pairFrames[earsWarpId.raw] = earsBounds
		}

		val primaryRegions = faceRig.regions.filter { it.feature != FaceFeature.IRIS }
		for (region in primaryRegions) {
			val (parent, parentFrame) = when (region.feature) {
				FaceFeature.EYE -> if (eyesBounds != null) eyesWarpId to eyesBounds else {
					(if (config.featureDisplacementEnabled) featureDisplacementId else faceWarpId) to faceFrame
				}
				FaceFeature.BROW -> if (browsBounds != null) browsWarpId to browsBounds else {
					(if (config.featureDisplacementEnabled) featureDisplacementId else faceWarpId) to faceFrame
				}
				FaceFeature.EAR -> if (earsBounds != null) earsWarpId to earsBounds else {
					faceWarpId to faceFrame
				}
				else -> {
					val p = if (config.featureDisplacementEnabled && region.feature in setOf(FaceFeature.EYE, FaceFeature.BROW, FaceFeature.MOUTH))
						featureDisplacementId else faceWarpId
					p to faceFrame
				}
			}
			deformers += featureWarp(faceRig, region, parent, parentFrame, facePartId, config)
		}
		for (irisRegion in faceRig.regions.filter { it.feature == FaceFeature.IRIS }) {
			val eyeRegion = faceRig.regionFor(FaceFeature.EYE, irisRegion.side) ?: continue
			val irisShape = featureWarp(
				faceRig,
				irisRegion,
				featureWarpId(eyeRegion),
				eyeRegion.bounds,
				facePartId,
				config,
			)
			deformers += irisShape
			deformers += gazeWarp(irisRegion, irisShape.id, facePartId)
		}
		frontHair?.let { frame ->
			deformers += hairFollowWarp(
				frontHairFollowWarpId,
				tr("model.deformer.frontHairFollow"),
				frame,
				head,
				frontHairPartId,
				-0.020f,
				-0.006f,
				yawPerspective = 0.10f,
			)
			deformers += hairPhysicsWarp(
				frontHairPhysicsWarpId,
				tr("model.deformer.frontHairPhysics"),
				StandardParameters.HAIR_FRONT,
				frontHairFollowWarpId,
				frame,
				frontHairPartId,
				rows = 4,
				swayRatio = 0.12f,
				curlRatio = 0.030f,
			)
		}
		backHair?.let { frame ->
			deformers += hairFollowWarp(backHairFollowWarpId, tr("model.deformer.backHairFollow"), frame, head, backHairPartId, -0.018f, 0.004f)
			deformers += hairPhysicsWarp(
				backHairPhysicsWarpId,
				tr("model.deformer.backHairPhysics"),
				StandardParameters.HAIR_BACK,
				backHairFollowWarpId,
				frame,
				backHairPartId,
				rows = 6,
				swayRatio = 0.10f,
				curlRatio = 0.025f,
			)
		}

		val usedDeformerIds = deformers.map { it.id.raw }.toMutableSet()
		val candidateLayers = analysis.layers.filter { layer ->
			layer.opaquePixels > 0 &&
				(layer.semantic.side == Side.LEFT || layer.semantic.side == Side.RIGHT) &&
				!isHandledByFaceRegion(layer, faceRig)
		}
		val grouped = candidateLayers.groupBy { layer ->
			val (defaultParentId, _) = parentAndFrame(layer, faceRig, analysis.anchors, character, head, faceFrame, frontHair, backHair)
			val baseName = pairBaseName(layer.source.name)
			defaultParentId to baseName.lowercase(Locale.ROOT).trim()
		}
		for ((key, pairLayers) in grouped) {
			val hasLeft = pairLayers.any { it.semantic.side == Side.LEFT }
			val hasRight = pairLayers.any { it.semantic.side == Side.RIGHT }
			if (!hasLeft || !hasRight) continue

			val (defaultParentId, defaultParentFrame) = parentAndFrame(pairLayers.first(), faceRig, analysis.anchors, character, head, faceFrame, frontHair, backHair)
			val cleanBaseName = pairBaseName(pairLayers.first().source.name)
			val pairId = uniquePairDeformerId(cleanBaseName, pairLayers.first().semantic.tag, usedDeformerIds)
			val pairName = tr("model.deformer.pair", cleanBaseName)

			val unionBounds = pairLayers.map { rigLayerById.getValue(it.source.id.raw).bounds }.reduce(Bounds::union)
			val padX = maxOf(unionBounds.width * 0.04f, 4f)
			val padY = maxOf(unionBounds.height * 0.04f, 4f)
			val pairBounds = Bounds(unionBounds.left - padX, unionBounds.top - padY, unionBounds.right + padX, unionBounds.bottom + padY)

			val firstLayer = pairLayers.first()
			val partId = when {
				firstLayer.semantic.tag == SemanticTag.FRONT_HAIR -> frontHairPartId
				firstLayer.semantic.tag == SemanticTag.BACK_HAIR -> backHairPartId
				firstLayer.semantic.tag in faceTags -> facePartId
				inferredGroup(firstLayer, analysis.anchors) == LayerGroup.HEAD -> headAccessoryPartId
				inferredGroup(firstLayer, analysis.anchors) == LayerGroup.EXTRA -> extraPartId
				else -> bodyPartId
			}

			val pairWarp = identityWarp(
				id = pairId,
				name = pairName,
				parent = defaultParentId,
				frame = pairBounds,
				parentFrame = defaultParentFrame,
				partId = partId,
				rows = 3,
				columns = 3,
			)
			deformers += pairWarp
			pairFrames[pairId.raw] = pairBounds
			for (layer in pairLayers) {
				pairedParentByLayerId[layer.source.id.raw] = pairId to pairBounds
			}
		}

		DeformerBuildResult(deformers, pairFrames, pairedParentByLayerId)
	}

	internal fun identityWarp(
		id: DeformerId,
		name: String,
		parent: DeformerId,
		frame: Bounds,
		parentFrame: Bounds,
		partId: PartId,
		rows: Int = 3,
		columns: Int = 3,
	): Deformer.Warp {
		val inParent = mapBounds(frame, parentFrame)
		val geometry = warpGrid(emptyList(), columns = columns, rows = rows) { u, v, _ ->
			(inParent.left + u * inParent.width) to (inParent.top + v * inParent.height)
		}
		return Deformer.Warp(id, name, parent, partId, rows, columns, true, geometry)
	}

	private val sideSuffixRegex = Regex("(?:[-_.\\s]+)(l|r|left|right|左|右)$", RegexOption.IGNORE_CASE)
	private val sidePrefixRegex = Regex("^(左|右)(?:[-_.\\s]+)?", RegexOption.IGNORE_CASE)

	internal fun pairBaseName(name: String): String {
		var s = Normalizer.normalize(name, Normalizer.Form.NFKC).trim()
		sideSuffixRegex.find(s)?.let {
			s = s.removeRange(it.range).trim()
		} ?: sidePrefixRegex.find(s)?.let {
			s = s.removeRange(it.range).trim()
		}
		return if (s.isNotBlank()) s else name.trim()
	}

	internal fun uniquePairDeformerId(
		baseName: String,
		tag: SemanticTag,
		usedIds: MutableSet<String>,
	): DeformerId {
		val words = baseName.split(Regex("[^a-zA-Z0-9]+")).filter { it.isNotBlank() }
		val pascal = words.joinToString("") { it.replaceFirstChar(Char::uppercaseChar) }
		val baseId = when {
			pascal.isNotBlank() -> "DeformPair_$pascal"
			tag != SemanticTag.UNKNOWN -> {
				val tagWords = tag.name.lowercase(Locale.ROOT).split('_').joinToString("") { it.replaceFirstChar(Char::uppercaseChar) }
				"DeformPair_$tagWords"
			}
			else -> "DeformPair_Part"
		}
		var id = baseId
		var counter = 2
		while (!usedIds.add(id)) {
			id = "${baseId}_$counter"
			counter++
		}
		return DeformerId(id)
	}

	internal fun isHandledByFaceRegion(layer: ClassifiedLayer, faceRig: NinePoseFaceRig): Boolean = when (layer.semantic.tag) {
		SemanticTag.IRIDES -> faceRig.regionFor(FaceFeature.IRIS, layer.semantic.side) != null
		SemanticTag.EYEWHITE, SemanticTag.EYELASH, SemanticTag.EYE_CLOSE ->
			faceRig.regionFor(FaceFeature.EYE, layer.semantic.side) != null
		SemanticTag.EYEBROW -> faceRig.regionFor(FaceFeature.BROW, layer.semantic.side) != null
		SemanticTag.EARS, SemanticTag.EARWEAR -> faceRig.regionFor(FaceFeature.EAR, layer.semantic.side) != null
		SemanticTag.NOSE -> faceRig.regionFor(FaceFeature.NOSE, layer.semantic.side) != null
		SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN, SemanticTag.MOUTH_CLOSE,
		SemanticTag.TOOTH_T, SemanticTag.TOOTH_B, SemanticTag.TONGUE ->
			faceRig.regionFor(FaceFeature.MOUTH, layer.semantic.side) != null
		else -> false
	}

	internal fun featureWarp(
		faceRig: NinePoseFaceRig,
		region: FaceRegion,
		parent: DeformerId,
		parentFrame: Bounds,
		part: PartId,
		config: PipelineConfig,
	): Deformer.Warp {
		val inParent = mapBounds(region.bounds, parentFrame)
		val (columns, rows) = when (region.feature) {
			FaceFeature.EYE, FaceFeature.MOUTH -> 4 to 3
			FaceFeature.NOSE -> 3 to 4
			else -> 3 to 3
		}
		val geometry = warpGrid(ninePoseAxes(), columns, rows) { u, v, values ->
			val offset = faceRig.featureOffset(region.feature, region.bounds, u, v, values[0], values[1], config.headTurnStrength)
			(inParent.left + u * inParent.width + offset.first / parentFrame.width.coerceAtLeast(1e-4f)) to
				(inParent.top + v * inParent.height + offset.second / parentFrame.height.coerceAtLeast(1e-4f))
		}
		val channels = if (region.feature == FaceFeature.EAR) {
			ChannelGrids(
				mapOf(
					FormChannel.OPACITY to scalarGrid(StandardParameters.ANGLE_X, NinePoseFaceRig.angleXKeys) { angle ->
						faceRig.earOpacity(region.bounds, angle, config.headTurnStrength)
					},
				),
			)
		} else ChannelGrids.Empty
		return Deformer.Warp(
			featureWarpId(region),
			featureDisplayName(region),
			parent,
			part,
			rows,
			columns,
			true,
			geometry,
			channels,
		)
	}

	internal fun gazeWarp(region: FaceRegion, parent: DeformerId, part: PartId): Deformer.Warp {
		val geometry = warpGrid(
			listOf(axis(StandardParameters.EYE_BALL_X, -1f, 0f, 1f), axis(StandardParameters.EYE_BALL_Y, -1f, 0f, 1f)),
			2,
			2,
		) { u, v, values ->
			gazePoint(u, v, values[0], values[1])
		}
		return Deformer.Warp(gazeWarpId(region), tr("model.deformer.gaze", sideDisplay(region.side)), parent, part, 2, 2, true, geometry)
	}

	internal fun parentAndFrame(
		layer: ClassifiedLayer,
		faceRig: NinePoseFaceRig,
		anchors: RigAnchors,
		character: Bounds,
		head: Bounds,
		faceFrame: Bounds,
		frontHair: Bounds?,
		backHair: Bounds?,
	): Pair<DeformerId, Bounds> = when (layer.semantic.tag) {
		SemanticTag.FACE -> faceContourId to faceFrame
		SemanticTag.IRIDES -> faceRig.regionFor(FaceFeature.IRIS, layer.semantic.side)?.let { gazeWarpId(it) to it.bounds }
			?: (faceWarpId to faceFrame)
		SemanticTag.EYEWHITE, SemanticTag.EYELASH, SemanticTag.EYE_CLOSE ->
			faceRig.regionFor(FaceFeature.EYE, layer.semantic.side)?.let { featureWarpId(it) to it.bounds } ?: (faceWarpId to faceFrame)
		SemanticTag.EYEBROW -> faceRig.regionFor(FaceFeature.BROW, layer.semantic.side)?.let { featureWarpId(it) to it.bounds }
			?: (faceWarpId to faceFrame)
		SemanticTag.NOSE -> faceRig.regionFor(FaceFeature.NOSE, layer.semantic.side)?.let { featureWarpId(it) to it.bounds }
			?: (faceWarpId to faceFrame)
		SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN, SemanticTag.MOUTH_CLOSE,
		SemanticTag.TOOTH_T, SemanticTag.TOOTH_B, SemanticTag.TONGUE ->
			faceRig.regionFor(FaceFeature.MOUTH, layer.semantic.side)?.let { featureWarpId(it) to it.bounds } ?: (faceWarpId to faceFrame)
		SemanticTag.EARS, SemanticTag.EARWEAR -> faceRig.regionFor(FaceFeature.EAR, layer.semantic.side)?.let { featureWarpId(it) to it.bounds }
			?: (faceWarpId to faceFrame)
		SemanticTag.FRONT_HAIR -> frontHair?.let { frontHairPhysicsWarpId to it } ?: (headWarpId to head)
		SemanticTag.BACK_HAIR -> backHair?.let { backHairPhysicsWarpId to it } ?: (headWarpId to head)
		else -> when {
			layer.semantic.tag in faceTags -> faceWarpId to faceFrame
			inferredGroup(layer, anchors) == LayerGroup.HEAD -> headWarpId to head
			else -> breathWarpId to character
		}
	}

	internal fun featureWarpId(region: FaceRegion): DeformerId {
		val feature = when (region.feature) {
			FaceFeature.EYE -> "EyeShape"
			FaceFeature.IRIS -> "IrisPreserve"
			FaceFeature.BROW -> "BrowShape"
			FaceFeature.NOSE -> "NoseShape"
			FaceFeature.MOUTH -> "MouthShape"
			FaceFeature.EAR -> "EarOcclusion"
		}
		return DeformerId("Deform$feature${sideToken(region.side)}")
	}

	internal fun gazeWarpId(region: FaceRegion): DeformerId = DeformerId("DeformEyeGaze${sideToken(region.side)}")

	internal fun featureDisplayName(region: FaceRegion): String {
		val feature = when (region.feature) {
			FaceFeature.EYE -> tr("model.feature.eye")
			FaceFeature.IRIS -> tr("model.feature.iris")
			FaceFeature.BROW -> tr("model.feature.brow")
			FaceFeature.NOSE -> tr("model.feature.nose")
			FaceFeature.MOUTH -> tr("model.feature.mouth")
			FaceFeature.EAR -> tr("model.feature.ear")
		}
		return if (region.side == Side.NONE) feature else tr("model.feature.name", sideDisplay(region.side), feature)
	}

	internal fun sideToken(side: Side): String = when (side) {
		Side.LEFT -> "L"
		Side.RIGHT -> "R"
		Side.NONE -> "Both"
	}

	internal fun sideDisplay(side: Side): String = tr("side.${side.name.lowercase()}")

	internal fun parameterTree(customParameters: List<Parameter> = emptyList()): List<ParameterNode> {
		fun group(id: String, name: String, parameters: List<ParameterId>) = ParameterNode.Group(
			ParameterGroupId(id), name, true, parameters.map { ParameterNode.Param(it) },
		)
		val base = listOf(
			group("ParamGroupFace", tr("model.group.face"), listOf(StandardParameters.ANGLE_X, StandardParameters.ANGLE_Y, StandardParameters.ANGLE_Z)),
			group("ParamGroupEyes", tr("model.group.eyes"), listOf(StandardParameters.EYE_L_OPEN, StandardParameters.EYE_R_OPEN, StandardParameters.EYE_BALL_X, StandardParameters.EYE_BALL_Y, StandardParameters.EYE_BALL_FORM)),
			group("ParamGroupBrows", tr("model.group.brows"), listOf(StandardParameters.BROW_L_Y, StandardParameters.BROW_R_Y)),
			group("ParamGroupMouth", tr("model.group.mouth"), listOf(StandardParameters.MOUTH_FORM, StandardParameters.MOUTH_OPEN)),
			group("ParamGroupBody", tr("model.group.body"), listOf(StandardParameters.BODY_X, StandardParameters.BODY_Y, StandardParameters.BODY_Z, StandardParameters.BREATH)),
			group("ParamGroupPhysics", tr("model.group.physics"), listOf(StandardParameters.HAIR_FRONT, StandardParameters.HAIR_BACK)),
		)
		return if (customParameters.isNotEmpty()) {
			base + group("ParamGroupCustom", tr("model.group.custom"), customParameters.map { it.id })
		} else {
			base
		}
	}

	internal fun wouldCreateCycle(
		sourceId: String,
		targetId: String,
		deformerById: Map<String, Deformer>,
		parentOverrides: Map<String, String?>,
	): Boolean {
		if (sourceId == targetId) return true
		var current: String? = targetId
		val visited = mutableSetOf(sourceId)
		while (current != null) {
			if (!visited.add(current)) return true
			val override = if (parentOverrides.containsKey(current)) {
				parentOverrides[current]?.takeIf { it.isNotBlank() && !it.equals("root", true) }
			} else {
				deformerById[current]?.parent?.raw
			}
			current = override
		}
		return false
	}	/**
	 * Body yaw keeps the two silhouette endpoints on every lattice row the same distance apart.
	 * Perspective is expressed by an interior roll with zero endpoint weight, so +X and -X are
	 * exact mirrors instead of the former signed global scale (`1 + kx * 0.025`).
	 */
	internal fun bodyWarpPoint(
		character: Bounds,
		u: Float,
		v: Float,
		bodyAngleX: Float,
		bodyAngleY: Float,
		strength: Float,
	): Pair<Float, Float> {
		val boundedStrength = strength.coerceIn(0f, 4f)
		val yaw = bodyAngleX / 10f * boundedStrength
		val pitch = bodyAngleY / 10f * boundedStrength
		val torsoEnvelope = sin(PI * v).toFloat().coerceAtLeast(0f)
		val endpointSafeRoll = 4f * u * (1f - u)
		val endpointSafePitch = sin(2.0 * PI * v).toFloat()
		val rowShift = yaw * character.width * 0.035f * torsoEnvelope
		val perspectiveRoll = yaw * character.width * 0.015f * torsoEnvelope * endpointSafeRoll
		val x = character.left + u * character.width + rowShift + perspectiveRoll
		val y = character.top + v * character.height + pitch * character.height * 0.007f * endpointSafePitch
		return x to y
	}

	/** Body Z is an odd row shift; Breath is deliberately non-negative and may expand the chest. */
	internal fun bodySecondaryWarpPoint(
		u: Float,
		v: Float,
		bodyAngleZ: Float,
		breathValue: Float,
		strength: Float,
	): Pair<Float, Float> {
		val boundedStrength = strength.coerceIn(0f, 2f)
		val z = bodyAngleZ / 10f * boundedStrength
		val breath = breathValue.coerceIn(0f, 1f) * boundedStrength
		val chest = kotlin.math.exp(-((v - 0.42f) * (v - 0.42f)) / 0.035f)
		val x = u + z * 0.018f * sin(PI * v).toFloat() + (u - 0.5f) * breath * chest * 0.025f
		val y = v - breath * chest * 0.012f
		return x to y
	}

	internal fun headContainerPoint(
		head: Bounds,
		originX: Float,
		originY: Float,
		u: Float,
		v: Float,
		angleX: Float,
		angleY: Float,
		strength: Float,
	): Pair<Float, Float> {
		val boundedStrength = strength.coerceIn(0f, 2f)
		val canvasX = head.left + u * head.width
		val canvasY = head.top + v * head.height
		val yaw = angleX / 45f * boundedStrength
		val pitch = angleY / 30f * boundedStrength
		val crownArch = sin(PI * u).toFloat().coerceAtLeast(0f)
		val shellX = yaw * head.width * (0.009f + crownArch * 0.004f)
		val shellY = -pitch * head.height * 0.008f
		return (canvasX - originX + shellX) to (canvasY - originY + shellY)
	}

	internal fun gazePoint(u: Float, v: Float, eyeX: Float, eyeY: Float): Pair<Float, Float> =
		(u + eyeX * 0.10f) to (v - eyeY * 0.085f)

	/** A local inward socket on the left silhouette, inherited by skin only. */
	internal fun faceContourPoint(u: Float, v: Float, angleX: Float, strength: Float, socketY: Float): Pair<Float, Float> {
		val turn = (-angleX / 45f * strength).coerceIn(0f, 1f)
		val distance = (abs(v - socketY) / 0.18f).coerceIn(0f, 1f)
		val horizontal = (u / 0.35f).coerceIn(0f, 1f)
		// Two joined cubic Bezier segments have zero tangent at the socket and support edges.
		val socket = BezierWarp.cubic(1f, 1f, 0f, 0f, distance)
		val edge = BezierWarp.cubic(1f, 1f, 0f, 0f, horizontal)
		return (u + turn * 0.018f * socket * edge) to v
	}

	internal fun featureDisplacementPoint(
		u: Float, v: Float, angleX: Float, angleY: Float, strength: Float,
		aspectRatio: Float = 1f,
	): Pair<Float, Float> {
		val yaw = (angleX / 45f * strength).coerceIn(-1f, 1f)
		val pitch = (angleY / 30f * strength).coerceIn(-1f, 1f)
		// Cubic Bezier with endpoints 0 and handles 4/3 peaks at 1 at t=1/2.
		fun bow(t: Float): Float = BezierWarp.cubic(0f, 4f / 3f, 4f / 3f, 0f, t)
		val x = 0.5f + (u - 0.5f) * (1f - 0.15f * abs(yaw)) + yaw * (0.025f + 0.055f * bow(v))
		// Up: compress the whole height down toward the bottom, with extra compression
		// in the upper half. Down: compress only the lower half up toward the middle.
		// The squared half profiles are cubic Beziers with zero slope at their join.
		fun compressedV(value: Float): Float {
			fun halfCompression(t: Float) = BezierWarp.cubic(0f, 0f, 1f / 3f, 1f, t)
			return if (pitch > 0f) {
				value + pitch * (0.08f * (1f - value) +
					0.10f * halfCompression((1f - 2f * value).coerceAtLeast(0f)))
			} else {
				value + pitch * 0.10f * halfCompression((2f * value - 1f).coerceAtLeast(0f))
			}
		}
		// Canvas Y grows downwards; negative AngleY is a downward look (U-shaped rows).
		val y = compressedV(v) - pitch * (0.020f + 0.050f * bow(u))
		// In canvas coordinates positive rotation is clockwise. Upper-left/lower-right
		// have yaw*pitch < 0. Rotate the entire curved surface about its displaced center;
		// pure horizontal/vertical poses stay unchanged. Correct for non-square face frames.
		val radians = -yaw * pitch * (3f * PI.toFloat() / 180f)
		val centerX = 0.5f + yaw * 0.080f
		val centerY = compressedV(0.5f) - pitch * 0.070f
		val dx = (x - centerX) * aspectRatio
		val dy = y - centerY
		val cosine = cos(radians)
		val sine = sin(radians)
		return (centerX + (dx * cosine - dy * sine) / aspectRatio) to
			(centerY + dx * sine + dy * cosine)
	}

	internal fun Deformer.withParent(newParent: DeformerId?): Deformer = when (this) {
		is Deformer.Warp -> copy(parent = newParent)
		is Deformer.Rotation -> copy(parent = newParent)
	}

}
