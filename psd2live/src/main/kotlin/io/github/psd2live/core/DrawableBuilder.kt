package io.github.psd2live.core

import io.github.psd2live.core.RigBuildMath.scalarGrid
import io.github.psd2live.core.EyeRigGenerator.eyeClosureGrid
import io.github.psd2live.core.EyeRigGenerator.eyebrowGrid
import io.github.psd2live.core.EyeRigGenerator.irisJellyGrid
import io.github.psd2live.core.EyeRigGenerator.matchingEyeWhiteBounds
import io.github.psd2live.core.HierarchyBuilder.parentAndFrame
import io.github.psd2live.core.MouthRigGenerator.mouthApertureFor
import io.github.psd2live.core.MouthRigGenerator.mouthContourMesh
import io.github.psd2live.core.MouthRigGenerator.mouthOutline
import io.github.psd2live.core.MouthRigGenerator.mouthWholeGrid
import io.github.psd2live.core.MouthRigGenerator.mouthWholePoint
import io.github.psd2live.core.MouthRigGenerator.orderMouthLayers
import io.github.psd2live.core.RigBuildMath.inferredGroup
import io.github.psd2live.core.RigBuildMath.layerVisibility
import io.github.psd2live.core.RigBuildMath.normalizeX
import io.github.psd2live.core.RigBuildMath.normalizeY
import io.github.psd2live.core.RigBuildMath.oneDimGrid
import io.github.psd2live.core.RigBuildMath.zeroMeshGrid
import io.github.psd2live.i18n.tr
import kotlin.math.ceil
import kotlin.math.max
import org.umamo.format.art.LayerBlend
import org.umamo.runtime.model.BlendMode
import org.umamo.runtime.model.ChannelGrids
import org.umamo.runtime.model.ChannelValue
import org.umamo.runtime.model.DeformerId
import org.umamo.runtime.model.Drawable
import org.umamo.runtime.model.DrawableId
import org.umamo.runtime.model.DrawableMesh
import org.umamo.runtime.model.FormChannel
import org.umamo.runtime.model.KeyformGrid
import org.umamo.runtime.model.MeshDeltaForm
import org.umamo.runtime.model.Parameter
import org.umamo.runtime.model.ParameterId

/** Owns per-build drawable IDs, meshes, masks, channels and their source mappings. */
internal object DrawableBuilder {
    fun build(context: RigBuildContext, deformerResult: DeformerBuildResult,
              frameByDeformer: Map<String, Bounds>): DrawableBuildResult = with(context) {
        val warnings = mutableListOf<String>()
		val idCounts = mutableMapOf<String, Int>()
		val drawables = mutableListOf<Drawable>()
		val pageByDrawable = linkedMapOf<String, Int>()
		val sourceBoundsByDrawable = linkedMapOf<String, Bounds>()
		val layerIdByDrawable = linkedMapOf<String, String>()
        val lipOwnerById = mutableMapOf<DrawableId, DrawableId>()
		val classifiedByDrawable = mutableMapOf<DrawableId, ClassifiedLayer>()
		// Discover custom toggle and switch parameters from overrides and layers
		val customParams = mutableListOf<Parameter>()
		val switchParamKeys = mutableMapOf<String, FloatArray>()

		// 1. Toggles
		val toggleParamNames = analysis.layers.mapNotNull { layer ->
			val override = config.layerOverrides[layer.source.id.raw]
			val type = override?.type ?: layer.semantic.type
			val param = (override?.parameter ?: layer.semantic.parameter).trim()
			if (type == LayerType.TOGGLE && param.isNotBlank()) param else null
		}.distinct().sorted()

		for (paramName in toggleParamNames) {
			customParams += Parameter(
				id = ParameterId(paramName),
				name = paramName,
				min = 0f,
				max = 1f,
				default = 0f,
			)
		}

		// 2. Switches
		val switchLayers = analysis.layers.filter { layer ->
			val override = config.layerOverrides[layer.source.id.raw]
			val type = override?.type ?: layer.semantic.type
			val param = (override?.parameter ?: layer.semantic.parameter).trim()
			type == LayerType.SWITCH && param.isNotBlank()
		}
		val switchLayersByParam = switchLayers.groupBy { layer ->
			val override = config.layerOverrides[layer.source.id.raw]
			(override?.parameter ?: layer.semantic.parameter).trim()
		}

		for ((paramName, layers) in switchLayersByParam) {
			val ids = layers.map { layer ->
				val override = config.layerOverrides[layer.source.id.raw]
				override?.switchId ?: layer.semantic.switchId
			}.distinct().sorted()

			val minId = ids.minOrNull() ?: 0
			val maxId = ids.maxOrNull() ?: 0
			val keys = if (minId == maxId) {
				floatArrayOf(minId.toFloat(), (minId + 1).toFloat())
			} else {
				(minId..maxId).map { it.toFloat() }.toFloatArray()
			}
			switchParamKeys[paramName] = keys
			customParams += Parameter(
				id = ParameterId(paramName),
				name = paramName,
				min = keys.first(),
				max = keys.last(),
				default = keys.first(),
			)
		}

		val orderedLayers = orderMouthLayers(analysis.layers.sortedBy { it.source.order })
		for ((drawIndex, layer) in orderedLayers.withIndex()) {
			val placement = atlas.placementByLayerId[layer.source.id.raw]
			if (placement == null || layer.opaquePixels == 0) {
				warnings += tr("warning.emptyLayerSkipped", layer.source.name)
				continue
			}
			val isHeadLayer = inferredGroup(layer, analysis.anchors) == LayerGroup.HEAD
			val rigLayer = rigLayerById.getValue(layer.source.id.raw)
			val defaultParentAndFrame = deformerResult.pairedParentByLayerId[layer.source.id.raw]
				?: parentAndFrame(layer, faceRig, analysis.anchors, characterFrame, headFrame, faceFrame, frontHairFrame, backHairFrame)
			val hasParentOverride = config.parentOverrides.containsKey(layer.source.id.raw)
			val overrideParentRaw = config.parentOverrides[layer.source.id.raw]
			val effectiveParentId: DeformerId? = if (hasParentOverride) {
				overrideParentRaw?.takeIf { it.isNotBlank() && !it.equals("root", true) }?.let(::DeformerId)
			} else {
				defaultParentAndFrame.first
			}
			val effectiveParentFrame: Bounds = if (hasParentOverride && effectiveParentId != null) {
				run {
                        var id = effectiveParentId.raw
                        val seen = mutableSetOf<String>()
                        while (id !in frameByDeformer && seen.add(id)) {
                            id = config.rigEdits.warpEdits.firstOrNull { it.id == id }?.parentId
                                ?: error("Unknown parent coordinate frame: ${effectiveParentId.raw}")
                        }
                        frameByDeformer[id] ?: error("Parent frame cycle")
                    }
			} else if (hasParentOverride) {
				characterFrame
			} else {
				defaultParentAndFrame.second
			}

			val id = uniqueDrawableId(layer, idCounts)
			val effectiveHeadSpace = if (isHeadLayer && shouldBuildDeformers) headSpace else null
			val originalRigMeshData = buildGridMesh(
				layer,
				effectiveParentFrame,
				effectiveHeadSpace,
				placement,
				atlas.pages[placement.page].image.width,
				config,
			)
            val meshData = if (config.mouthOutlineEnabled && !config.meshOnly &&
                layer.semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN)) {
                mouthContourMesh(originalRigMeshData, layer, effectiveParentFrame, effectiveHeadSpace,
                    placement, atlas.pages[placement.page].image.width)
            } else originalRigMeshData
			val effectiveMesh = if (shouldBuildDeformers) {
				meshData.mesh
			} else {
				DrawableMesh(meshData.rigPositions, meshData.mesh.uvs, meshData.mesh.indices)
			}
			val mouthAperture = mouthApertureFor(rigLayer)
			val geometryGrid = if (config.meshOnly) {
				zeroMeshGrid(effectiveMesh.positions.size)
			} else {
				buildDrawableGeometry(
					rigLayer,
					meshData,
					effectiveParentFrame,
					faceRig,
					matchingEyeWhiteBounds(rigLayer, eyeWhiteLayers),
					mouthAperture,
                    config,
				)
			}
			val override = config.layerOverrides[layer.source.id.raw]
			val channelGrids = if (config.meshOnly) ChannelGrids.Empty else buildChannels(layer, override, switchParamKeys)
			val drawable = Drawable(
				id = id,
				name = layer.source.name,
				parentDeformerId = if (shouldBuildDeformers) effectiveParentId else null,
				blendMode = blendMode(layer.source.blend),
				maskedBy = emptyList(),
				mesh = effectiveMesh,
				geometryGrid = geometryGrid,
				channelGrids = channelGrids,
				// Cubism Editor stores draw order as an integer. Keeping this integral also makes
				// fresh CMO3 conversion lossless instead of reporting one advisory per drawable.
				drawOrder = (config.drawOrderOverrides[layer.source.id.raw]
					?: config.drawOrderOverrides[id.raw]
					?: (orderedLayers.size - drawIndex).coerceAtMost(1000).toFloat()),
				opacity = layer.source.opacity,
				isVisible = layerVisibility(config, layer.source.id.raw, layer.source.visible),
				texturePage = placement.page,
			)
			drawables += drawable
			classifiedByDrawable[id] = layer
			pageByDrawable[id.raw] = placement.page
			sourceBoundsByDrawable[id.raw] = neutralValidationBounds(
				layer,
				meshData,
				mouthAperture,
				effectiveHeadSpace,
				config.meshOnly,
                config,
			)
            if (config.mouthOutlineEnabled && !config.meshOnly && mouthAperture != null) {
                for (side in 0..1) {
                    val lipLayer = generatedLips[MouthLipLayer.idFor(layer.source.id.raw, side)] ?: continue
                    val lipPlacement = atlas.placementByLayerId[lipLayer.source.id.raw] ?: continue
                    val lip = mouthOutline(drawable, meshData, effectiveParentFrame, mouthAperture,
                        config, side, lipLayer, lipPlacement, atlas.pages[lipPlacement.page].image.width)
                    drawables += lip
                    classifiedByDrawable[lip.id] = lipLayer
                    lipOwnerById[lip.id] = drawable.id
                    pageByDrawable[lip.id.raw] = lip.texturePage
                    layerIdByDrawable[lip.id.raw] = lipLayer.source.id.raw
                }
            }
			layerIdByDrawable[id.raw] = layer.source.id.raw
		}

		val drawableByTagSide = drawables.groupBy { drawable ->
			val semantic = classifiedByDrawable.getValue(drawable.id).semantic
			semantic.tag to semantic.side
		}
		val mouthMasks = drawables.filter { drawable ->
            drawable.id !in lipOwnerById &&
			classifiedByDrawable.getValue(drawable.id).semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN)
		}
		val maskedDrawables = drawables.map { drawable ->
			val semantic = classifiedByDrawable.getValue(drawable.id).semantic
			when {
				semantic.tag == SemanticTag.IRIDES -> {
					val exact = drawableByTagSide[SemanticTag.EYEWHITE to semantic.side].orEmpty()
					val fallback = drawableByTagSide[SemanticTag.EYEWHITE to Side.NONE].orEmpty()
					drawable.copy(maskedBy = (exact.ifEmpty { fallback }).map { it.id })
				}
				semantic.tag in CharacterAnalyzer.MOUTH_COMPONENT_TAGS -> {
					val layer = classifiedByDrawable.getValue(drawable.id)
					val exact = mouthMasks.filter { mask ->
						val maskSemantic = classifiedByDrawable.getValue(mask.id).semantic
						maskSemantic.side == semantic.side && maskSemantic.variant == semantic.variant
					}
					val sameSide = mouthMasks.filter { classifiedByDrawable.getValue(it.id).semantic.side == semantic.side }
					val fallback = mouthMasks.filter { classifiedByDrawable.getValue(it.id).semantic.side == Side.NONE }
					val masks = exact.ifEmpty { sameSide.ifEmpty { fallback.ifEmpty { mouthMasks } } }
					val nearest = masks.minByOrNull { mask ->
						val bounds = classifiedByDrawable.getValue(mask.id).bounds
						val dx = bounds.centerX - layer.bounds.centerX
						val dy = bounds.centerY - layer.bounds.centerY
						dx * dx + dy * dy
					}
					drawable.copy(maskedBy = listOfNotNull(nearest?.id))
				}
				else -> drawable
			}
        }.let { masked ->
            masked.map { drawable ->
                val owner = lipOwnerById[drawable.id]
                if (owner == null) drawable else {
                    val frontOrder = masked.filter { it.id == owner || owner in it.maskedBy }
                        .maxOfOrNull { it.drawOrder } ?: drawable.drawOrder
                    drawable.copy(drawOrder = config.drawOrderOverrides[classifiedByDrawable.getValue(drawable.id).source.id.raw]
                        ?: config.drawOrderOverrides[drawable.id.raw] ?: (frontOrder + 1f).coerceAtMost(1000f))
                }
            }

		}

        DrawableBuildResult(maskedDrawables, classifiedByDrawable, pageByDrawable,
            sourceBoundsByDrawable, layerIdByDrawable, customParams, warnings)
    }

	internal fun buildGridMesh(
		layer: ClassifiedLayer,
		parentFrame: Bounds,
		headSpace: HeadCoordinateSpace?,
		placement: AtlasPlacement,
		atlasSize: Int,
		config: PipelineConfig,
	): RigMeshData {
		val width = max(1, layer.source.raster.width)
		val height = max(1, layer.source.raster.height)
		val semanticDensity = when (layer.semantic.tag) {
			SemanticTag.FACE, SemanticTag.FRONT_HAIR, SemanticTag.BACK_HAIR, SemanticTag.TOPWEAR -> 0.65f
			SemanticTag.IRIDES, SemanticTag.EYELASH, SemanticTag.EYEWHITE, SemanticTag.EYEBROW,
			SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN, SemanticTag.MOUTH_CLOSE,
			SemanticTag.TOOTH_T, SemanticTag.TOOTH_B, SemanticTag.TONGUE -> 0.45f
			else -> 1f
		}
		val override = config.meshOverrides[layer.source.id.raw]
		val outerMargin = if (config.mouthOutlineEnabled && !config.meshOnly &&
            layer.semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN)) 0f
            else override?.outerMargin ?: config.meshOuterMargin
		val innerMargin = override?.innerMargin ?: config.meshInnerMargin
		// Currently only face meshes use dual-line envelope by default; all other parts use single-line:
		val innerMarginEnabled = override?.innerMarginEnabled ?: (layer.semantic.tag == SemanticTag.FACE)
		val effectiveSpacing = if (config.mouthOutlineEnabled && !config.meshOnly &&
            layer.semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN)) 2f
            else override?.maxEdgeDistance ?: max(12f, config.meshMaxEdgeDistance * semanticDensity)
		val effectiveInteriorDensity = override?.interiorDensity ?: max(12f, config.meshInteriorDensity * semanticDensity)

		// Authored tooth layers may contain several disconnected teeth. Keep their complete texture;
		// the mouth clipping id supplies the visible boundary.
		if (layer.semantic.tag in setOf(SemanticTag.TOOTH_T, SemanticTag.TOOTH_B)) {
			return buildRectangularFallbackMesh(layer, parentFrame, headSpace, placement, atlasSize, effectiveSpacing)
		}
		val adaptive = AdaptiveMeshGenerator.generate(
			width = width,
			height = height,
			rgba = layer.source.raster.rgba,
			alphaThreshold = config.alphaThreshold,
			spacing = effectiveSpacing,
			interiorSpacing = effectiveInteriorDensity,
			outerMargin = outerMargin,
			innerMargin = innerMargin,
			innerMarginEnabled = innerMarginEnabled,
		)
		if (adaptive != null) {
			val positions = FloatArray(adaptive.positions.size)
			val canvas = FloatArray(adaptive.positions.size)
			val uvs = FloatArray(adaptive.positions.size)
			for (index in adaptive.positions.indices step 2) {
				val localX = adaptive.positions[index].coerceIn(0f, width.toFloat())
				val localY = adaptive.positions[index + 1].coerceIn(0f, height.toFloat())
				val canvasX = layer.source.bounds.left + localX
				val canvasY = layer.source.bounds.top + localY
				val rigPoint = headSpace?.toAligned(canvasX, canvasY) ?: (canvasX to canvasY)
				positions[index] = normalizeX(rigPoint.first, parentFrame)
				positions[index + 1] = normalizeY(rigPoint.second, parentFrame)
				canvas[index] = rigPoint.first
				canvas[index + 1] = rigPoint.second
				uvs[index] = (placement.x + localX * placement.scale) / atlasSize
				uvs[index + 1] = (placement.y + localY * placement.scale) / atlasSize
			}
			return RigMeshData(DrawableMesh(positions, uvs, adaptive.indices), canvas)
		}
		return buildRectangularFallbackMesh(layer, parentFrame, headSpace, placement, atlasSize, effectiveSpacing)
	}

	/** Conservative fallback for pathological alpha masks or degenerate one-pixel slivers. */
	internal fun buildRectangularFallbackMesh(
		layer: ClassifiedLayer,
		parentFrame: Bounds,
		headSpace: HeadCoordinateSpace?,
		placement: AtlasPlacement,
		atlasSize: Int,
		effectiveSpacing: Float,
	): RigMeshData {
		val width = max(1, layer.source.raster.width)
		val height = max(1, layer.source.raster.height)
		val columns = ceil(width / effectiveSpacing).toInt().coerceIn(1, 18)
		val rows = ceil(height / effectiveSpacing).toInt().coerceIn(1, 24)
		val count = (columns + 1) * (rows + 1)
		val positions = FloatArray(count * 2)
		val canvas = FloatArray(count * 2)
		val uvs = FloatArray(count * 2)
		var vertex = 0
		for (row in 0..rows) {
			val v = row.toFloat() / rows
			for (column in 0..columns) {
				val u = column.toFloat() / columns
				val canvasX = layer.source.bounds.left + u * width
				val canvasY = layer.source.bounds.top + v * height
				val rigPoint = headSpace?.toAligned(canvasX, canvasY) ?: (canvasX to canvasY)
				positions[vertex * 2] = normalizeX(rigPoint.first, parentFrame)
				positions[vertex * 2 + 1] = normalizeY(rigPoint.second, parentFrame)
				canvas[vertex * 2] = rigPoint.first
				canvas[vertex * 2 + 1] = rigPoint.second
				uvs[vertex * 2] = (placement.x + u * width * placement.scale) / atlasSize
				uvs[vertex * 2 + 1] = (placement.y + v * height * placement.scale) / atlasSize
				vertex++
			}
		}
		val indices = IntArray(columns * rows * 6)
		var index = 0
		for (row in 0 until rows) for (column in 0 until columns) {
			val a = row * (columns + 1) + column
			val b = a + 1
			val c = a + columns + 1
			val d = c + 1
			indices[index++] = a
			indices[index++] = c
			indices[index++] = b
			indices[index++] = b
			indices[index++] = c
			indices[index++] = d
		}
		return RigMeshData(DrawableMesh(positions, uvs, indices), canvas)
	}

	internal fun buildDrawableGeometry(
		layer: ClassifiedLayer,
		data: RigMeshData,
		parentFrame: Bounds,
		faceRig: NinePoseFaceRig,
		eyeWhiteBounds: List<Bounds>,
		mouthAperture: Bounds?,
        config: PipelineConfig,
	): KeyformGrid<MeshDeltaForm> {
		val tag = layer.semantic.tag
		return when (tag) {
			SemanticTag.EYEWHITE, SemanticTag.EYELASH ->
				eyeClosureGrid(layer, data, parentFrame, faceRig, eyeWhiteBounds)
			// Blink does not key the iris directly. The independent physics output supplies a small,
			// delayed squash/stretch while eye-white clipping removes it as the lid closes.
			SemanticTag.IRIDES -> irisJellyGrid(layer, data, parentFrame)
			SemanticTag.EYEBROW -> eyebrowGrid(layer, data, parentFrame)
			SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN -> mouthWholeGrid(data, parentFrame, mouthAperture ?: layer.bounds, config)
			SemanticTag.MOUTH_CLOSE, SemanticTag.TOOTH_T, SemanticTag.TOOTH_B, SemanticTag.TONGUE ->
				zeroMeshGrid(data.mesh.positions.size)
			else -> zeroMeshGrid(data.mesh.positions.size)
		}
	}

	internal fun buildChannels(
		layer: ClassifiedLayer,
		override: LayerClassificationOverride?,
		switchParamKeys: Map<String, FloatArray>,
	): ChannelGrids {
		val type = override?.type ?: layer.semantic.type
		val opacityGrid = when (type) {
			LayerType.TOGGLE -> {
				val paramName = (override?.parameter ?: layer.semantic.parameter).trim()
				if (paramName.isNotBlank()) {
					val parameter = ParameterId(paramName)
					scalarGrid(parameter, floatArrayOf(0f, 1f)) { value -> value }
				} else null
			}
			LayerType.SWITCH -> {
				val paramName = (override?.parameter ?: layer.semantic.parameter).trim()
				val switchId = override?.switchId ?: layer.semantic.switchId
				val keys = switchParamKeys[paramName]
				if (paramName.isNotBlank() && keys != null && keys.isNotEmpty()) {
					val parameter = ParameterId(paramName)
					scalarGrid(parameter, keys) { key ->
						if (key.toInt() == switchId) 1f else 0f
					}
				} else null
			}
			LayerType.PRESET -> {
				when (layer.semantic.tag) {
					SemanticTag.EYE_CLOSE -> {
						val parameter = if (layer.semantic.side == Side.LEFT) StandardParameters.EYE_L_OPEN else StandardParameters.EYE_R_OPEN
						scalarGrid(parameter, floatArrayOf(0f, 1f)) { open -> 1f - open }
					}
					SemanticTag.MOUTH_CLOSE -> scalarGrid(StandardParameters.MOUTH_OPEN, floatArrayOf(0f, 1f)) { 1f - it }
					SemanticTag.TONGUE, SemanticTag.TOOTH_T, SemanticTag.TOOTH_B ->
						scalarGrid(StandardParameters.MOUTH_OPEN, floatArrayOf(0f, 0.15f, 1f)) { open ->
							(open / 0.15f).coerceIn(0f, 1f)
						}
					else -> null
				}
			}
		}
		return opacityGrid?.let { ChannelGrids(mapOf(FormChannel.OPACITY to it)) } ?: ChannelGrids.Empty
	}

	internal fun uniqueDrawableId(layer: ClassifiedLayer, counts: MutableMap<String, Int>): DrawableId {
		val side = when (layer.semantic.side) { Side.LEFT -> "L"; Side.RIGHT -> "R"; Side.NONE -> "" }
		val rawBase = if (layer.semantic.tag == SemanticTag.UNKNOWN) "Layer" else layer.semantic.tag.name.lowercase().replace('_', ' ')
		val base = rawBase.split(' ').joinToString("") { word -> word.replaceFirstChar(Char::uppercaseChar) }
		val key = "ArtMesh$base$side"
		val ordinal = counts.merge(key, 1, Int::plus) ?: 1
		return DrawableId(if (ordinal == 1) key else "$key$ordinal")
	}

	internal fun blendMode(blend: LayerBlend): BlendMode = when (blend) {
		LayerBlend.Add, LayerBlend.AddGlow, LayerBlend.LinearLight -> BlendMode.AdditivePremultiplied
		LayerBlend.Multiply, LayerBlend.LinearBurn, LayerBlend.ColorBurn -> BlendMode.MultiplyPremultiplied
		else -> BlendMode.Normal
	}

	internal fun neutralValidationBounds(
		layer: ClassifiedLayer,
		data: RigMeshData,
		mouthAperture: Bounds?,
		headSpace: HeadCoordinateSpace?,
		meshOnly: Boolean = false,
        config: PipelineConfig = PipelineConfig(),
	): Bounds {
		if (meshOnly || layer.semantic.tag !in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN) || mouthAperture == null) return layer.bounds
		var left = Float.POSITIVE_INFINITY
		var top = Float.POSITIVE_INFINITY
		var right = Float.NEGATIVE_INFINITY
		var bottom = Float.NEGATIVE_INFINITY
		for (index in data.rigPositions.indices step 2) {
			val rigPoint = mouthWholePoint(
				data.rigPositions[index],
				data.rigPositions[index + 1],
				mouthAperture,
				mouthForm = 0f,
				mouthOpen = 0f,
                shape = config.mouthShape,
                exactClose = config.mouthOutlineEnabled,
                curve = config.mouthCurve,
			)
			val point = headSpace?.toCanvas(rigPoint.first, rigPoint.second) ?: rigPoint
			left = minOf(left, point.first)
			top = minOf(top, point.second)
			right = maxOf(right, point.first)
			bottom = maxOf(bottom, point.second)
		}
		return Bounds(left, top, right, bottom)
	}

}
