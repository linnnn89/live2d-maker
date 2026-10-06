package io.github.psd2live.core

import io.github.psd2live.core.RigBuildMath.axis
import io.github.psd2live.core.RigBuildMath.grid
import io.github.psd2live.core.RigBuildMath.nearestLayer
import io.github.psd2live.core.RigBuildMath.oneDimGrid
import kotlin.math.abs
import kotlin.math.max
import org.umamo.runtime.model.KeyformGrid
import org.umamo.runtime.model.MeshDeltaForm

/** Generates eye closure, brow and iris forms without changing source rasters. */
internal object EyeRigGenerator {
	internal fun eyeClosureGrid(
		layer: ClassifiedLayer,
		data: RigMeshData,
		frame: Bounds,
		faceRig: NinePoseFaceRig,
		eyeWhiteBounds: List<Bounds>,
	): KeyformGrid<MeshDeltaForm> {
		val parameter = if (layer.semantic.side == Side.LEFT) StandardParameters.EYE_L_OPEN else StandardParameters.EYE_R_OPEN
		// Column sampling is defined in the source raster's canvas X axis.  Once the head has been
		// aligned, the alpha-weighted centroid remains correct while that column function no longer is.
		val eyelashCenterline = if (layer.semantic.tag == SemanticTag.EYELASH && faceRig.initialAngleZ == 0f) {
			eyelashCenterline(layer)
		} else null
		val axes = if (layer.semantic.side == Side.NONE) {
			listOf(axis(StandardParameters.EYE_L_OPEN, 0f, 1f), axis(StandardParameters.EYE_R_OPEN, 0f, 1f))
		} else listOf(axis(parameter, 0f, 1f))
		return grid(axes) { values ->
			val delta = FloatArray(data.mesh.positions.size)
			for (vertex in data.mesh.positions.indices step 2) {
				val canvasX = data.rigPositions[vertex]
				val canvasY = data.rigPositions[vertex + 1]
				val openness = when (layer.semantic.side) {
					Side.LEFT -> values[0]
					Side.RIGHT -> values[0]
					Side.NONE -> if (canvasX >= faceRig.centerX) values[0] else values[1]
				}
				val whiteBounds = eyeWhiteBounds.minByOrNull { abs(it.centerX - canvasX) } ?: layer.bounds
				val closed = eyeClosurePoint(
					canvasX,
					canvasY,
					layer.bounds,
					whiteBounds,
					layer.semantic.tag,
					eyelashCenterline?.let { sampleCenterline(it, layer, canvasX) } ?: layer.centroidY,
				)
				delta[vertex] = (closed.first - canvasX) / frame.width.coerceAtLeast(1e-4f) * (1f - openness)
				delta[vertex + 1] = (closed.second - canvasY) / frame.height.coerceAtLeast(1e-4f) * (1f - openness)
			}
			MeshDeltaForm(delta)
		}
	}

	/**
	 * Closed eyes share one curve derived from the eye-white bounds.  The common centre line is what
	 * keeps the shrunken white behind the lash. Every eyelash vertex in the same vertical slice is
	 * measured from the alpha-weighted source centreline, so the texture follows the target curve
	 * instead of adding its authored curvature on top of it.
	 */
	internal fun eyeClosurePoint(
		sourceX: Float,
		sourceY: Float,
		layerBounds: Bounds,
		eyeWhiteBounds: Bounds,
		tag: SemanticTag,
		sourceAnchorY: Float = layerBounds.centerY,
	): Pair<Float, Float> {
		val halfWidth = (eyeWhiteBounds.width * 0.5f).coerceAtLeast(1e-4f)
		val normalizedX = ((sourceX - eyeWhiteBounds.centerX) / halfWidth).coerceIn(-1f, 1f)
		val arch = max(0f, 1f - normalizedX * normalizedX)
		// Keep the trough at 72% of the eye-white height, but raise the endpoints from 48% to 34%.
		// This deepens the U without increasing its centre travel and reduces movement at both corners.
		val edgeY = eyeWhiteBounds.top + eyeWhiteBounds.height * 0.34f
		val curveY = edgeY + max(1.5f, eyeWhiteBounds.height * 0.38f) * arch
		val layerHeight = layerBounds.height.coerceAtLeast(1f)
		val verticalScale = when (tag) {
			SemanticTag.EYELASH -> 0.88f
			SemanticTag.EYEWHITE -> (1.2f / layerHeight).coerceIn(0.015f, 0.55f)
			else -> (1.2f / layerHeight).coerceIn(0.015f, 0.55f)
		}
		return sourceX to curveY + (sourceY - sourceAnchorY) * verticalScale
	}

	/** Alpha-weighted centre of every source column, with transparent gaps linearly bridged. */
	internal fun eyelashCenterline(layer: ClassifiedLayer): FloatArray? {
		val width = layer.source.raster.width
		val height = layer.source.raster.height
		if (width <= 0 || height <= 0) return null
		val rgba = layer.source.raster.rgba
		val result = FloatArray(width) { Float.NaN }
		for (x in 0 until width) {
			var weightSum = 0f
			var weightedY = 0f
			for (y in 0 until height) {
				val alpha = (rgba[(y * width + x) * 4 + 3].toInt() and 0xff).toFloat()
				if (alpha == 0f) continue
				weightSum += alpha
				weightedY += (y + 0.5f) * alpha
			}
			if (weightSum > 0f) result[x] = layer.source.bounds.top + weightedY / weightSum
		}
		val first = result.indexOfFirst { !it.isNaN() }
		if (first < 0) return null
		for (x in 0 until first) result[x] = result[first]
		var previous = first
		for (x in first + 1 until width) {
			if (result[x].isNaN()) continue
			val gap = x - previous
			if (gap > 1) {
				val start = result[previous]
				val end = result[x]
				for (step in 1 until gap) result[previous + step] = start + (end - start) * step / gap
			}
			previous = x
		}
		for (x in previous + 1 until width) result[x] = result[previous]
		return result
	}

	internal fun sampleCenterline(centerline: FloatArray, layer: ClassifiedLayer, canvasX: Float): Float {
		val sourceX = (canvasX - layer.source.bounds.left).coerceIn(0f, (centerline.size - 1).toFloat())
		val left = sourceX.toInt()
		val right = (left + 1).coerceAtMost(centerline.lastIndex)
		return centerline[left] + (centerline[right] - centerline[left]) * (sourceX - left)
	}

	internal fun matchingEyeWhiteBounds(
		layer: ClassifiedLayer,
		eyeWhites: List<ClassifiedLayer>,
	): List<Bounds> {
		if (eyeWhites.isEmpty()) return listOf(layer.bounds)
		val sameVariantAndSide = eyeWhites.filter {
			it.semantic.side == layer.semantic.side && it.semantic.variant == layer.semantic.variant
		}
		val sameSide = eyeWhites.filter { it.semantic.side == layer.semantic.side }
		val unspecified = eyeWhites.filter { it.semantic.side == Side.NONE }
		val candidates = when {
			sameVariantAndSide.isNotEmpty() -> sameVariantAndSide
			sameSide.isNotEmpty() -> sameSide
			layer.semantic.side == Side.NONE -> eyeWhites
			unspecified.isNotEmpty() -> unspecified
			else -> eyeWhites
		}
		if (layer.semantic.side == Side.NONE && candidates.size > 1) return candidates.map { it.bounds }
		return listOfNotNull(nearestLayer(layer, candidates)?.bounds)
	}

	internal fun eyebrowGrid(layer: ClassifiedLayer, data: RigMeshData, frame: Bounds): KeyformGrid<MeshDeltaForm> {
		val parameter = if (layer.semantic.side == Side.LEFT) StandardParameters.BROW_L_Y else StandardParameters.BROW_R_Y
		return oneDimGrid(parameter, floatArrayOf(-1f, 0f, 1f)) { value ->
			val delta = FloatArray(data.mesh.positions.size)
			val dy = -value * layer.bounds.height * 0.12f / frame.height
			for (index in 1 until delta.size step 2) delta[index] = dy
			MeshDeltaForm(delta)
		}
	}

	internal fun irisJellyGrid(layer: ClassifiedLayer, data: RigMeshData, frame: Bounds): KeyformGrid<MeshDeltaForm> =
		oneDimGrid(StandardParameters.EYE_BALL_FORM, floatArrayOf(-1f, 0f, 1f)) { value ->
			val delta = FloatArray(data.mesh.positions.size)
			for (index in data.rigPositions.indices step 2) {
				val sourceX = data.rigPositions[index]
				val sourceY = data.rigPositions[index + 1]
				val target = irisJellyPoint(sourceX, sourceY, layer.centroidX, layer.centroidY, value)
				delta[index] = (target.first - sourceX) / frame.width.coerceAtLeast(1e-4f)
				delta[index + 1] = (target.second - sourceY) / frame.height.coerceAtLeast(1e-4f)
			}
			MeshDeltaForm(delta)
		}

	/** A restrained squash/stretch: vertical rebound is stronger than horizontal compensation. */
	internal fun irisJellyPoint(
		sourceX: Float,
		sourceY: Float,
		pivotX: Float,
		pivotY: Float,
		jelly: Float,
	): Pair<Float, Float> {
		val amount = jelly.coerceIn(-1f, 1f)
		val scaleX = 1f - amount * 0.045f
		val scaleY = 1f + amount * 0.11f
		return pivotX + (sourceX - pivotX) * scaleX to pivotY + (sourceY - pivotY) * scaleY
	}

}
