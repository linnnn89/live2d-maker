package io.github.psd2live.core

import org.umamo.runtime.model.ChannelValue
import org.umamo.runtime.model.KeyformAxis
import org.umamo.runtime.model.KeyformCell
import org.umamo.runtime.model.KeyformGrid
import org.umamo.runtime.model.MeshDeltaForm
import org.umamo.runtime.model.ParameterId
import org.umamo.runtime.model.WarpLatticeForm

/** Coordinate transforms and ordered keyform grids shared by independent generators. */
internal object RigBuildMath {
	internal fun ninePoseAxes(): List<KeyformAxis> = listOf(
		axis(StandardParameters.ANGLE_X, *NinePoseFaceRig.angleXKeys),
		axis(StandardParameters.ANGLE_Y, *NinePoseFaceRig.angleYKeys),
	)


	internal fun scalarGrid(parameter: ParameterId, keys: FloatArray, value: (Float) -> Float): KeyformGrid<ChannelValue> =
		oneDimGrid(parameter, keys) { key -> ChannelValue.Scalar(value(key)) }

	internal fun inferredGroup(layer: ClassifiedLayer, anchors: RigAnchors): LayerGroup =
		if (layer.semantic.tag.group != LayerGroup.UNKNOWN) layer.semantic.tag.group
		else if (layer.bounds.centerY <= anchors.face.bottom) LayerGroup.HEAD else LayerGroup.BODY

	internal fun ClassifiedLayer.inHeadSpace(space: HeadCoordinateSpace): ClassifiedLayer {
		val alignedCenter = space.toAligned(centroidX, centroidY)
		return copy(
			bounds = space.boundsToAligned(bounds),
			centroidX = alignedCenter.first,
			centroidY = alignedCenter.second,
		)
	}

	internal fun layerVisibility(config: PipelineConfig, layerId: String, fallback: Boolean): Boolean {
		config.layerVisibility[layerId]?.let { return it }
		val parentId = when {
			layerId.endsWith(":l") || layerId.endsWith(":r") -> layerId.dropLast(2)
			else -> null
		}
		return parentId?.let(config.layerVisibility::get) ?: fallback
	}

	internal fun nearestLayer(source: ClassifiedLayer, candidates: List<ClassifiedLayer>): ClassifiedLayer? =
		candidates.minByOrNull { candidate ->
			val dx = candidate.bounds.centerX - source.bounds.centerX
			val dy = candidate.bounds.centerY - source.bounds.centerY
			dx * dx + dy * dy
		}

	internal fun mapBounds(child: Bounds, parent: Bounds): Bounds = Bounds(
		normalizeX(child.left, parent), normalizeY(child.top, parent),
		normalizeX(child.right, parent), normalizeY(child.bottom, parent),
	)

	internal fun normalizeX(x: Float, frame: Bounds): Float = (x - frame.left) / frame.width.coerceAtLeast(1e-4f)
	internal fun normalizeY(y: Float, frame: Bounds): Float = (y - frame.top) / frame.height.coerceAtLeast(1e-4f)

	internal fun axis(parameter: ParameterId, vararg keys: Float) = KeyformAxis(parameter, keys)

	internal fun <T> oneDimGrid(parameter: ParameterId, keys: FloatArray, form: (Float) -> T): KeyformGrid<T> =
		KeyformGrid(listOf(KeyformAxis(parameter, keys)), keys.indices.map { index -> KeyformCell(intArrayOf(index), form(keys[index])) })

	internal fun <T> grid(axes: List<KeyformAxis>, form: (FloatArray) -> T): KeyformGrid<T> {
		val cells = mutableListOf<KeyformCell<T>>()
		fun visit(axisIndex: Int, coordinate: IntArray, values: FloatArray) {
			if (axisIndex == axes.size) {
				cells += KeyformCell(coordinate.copyOf(), form(values.copyOf()))
				return
			}
			for (keyIndex in axes[axisIndex].keys.indices) {
				coordinate[axisIndex] = keyIndex
				values[axisIndex] = axes[axisIndex].keys[keyIndex]
				visit(axisIndex + 1, coordinate, values)
			}
		}
		visit(0, IntArray(axes.size), FloatArray(axes.size))
		return KeyformGrid(axes, cells)
	}

	internal fun warpGrid(
		axes: List<KeyformAxis>,
		columns: Int,
		rows: Int,
		point: (u: Float, v: Float, values: FloatArray) -> Pair<Float, Float>,
	): KeyformGrid<WarpLatticeForm> = grid(axes) { values ->
		val controlPoints = FloatArray((columns + 1) * (rows + 1) * 2)
		var index = 0
		for (row in 0..rows) for (column in 0..columns) {
			val result = point(column.toFloat() / columns, row.toFloat() / rows, values)
			controlPoints[index++] = result.first
			controlPoints[index++] = result.second
		}
		WarpLatticeForm(controlPoints)
	}

	internal fun zeroMeshGrid(size: Int): KeyformGrid<MeshDeltaForm> =
		KeyformGrid(emptyList(), listOf(KeyformCell(IntArray(0), MeshDeltaForm(FloatArray(size)))))

}
