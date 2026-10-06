package io.github.psd2live.core

import io.github.psd2live.core.DrawableBuilder.blendMode
import io.github.psd2live.core.RigBuildMath.axis
import io.github.psd2live.core.RigBuildMath.grid
import io.github.psd2live.core.RigBuildMath.layerVisibility
import io.github.psd2live.core.RigBuildMath.nearestLayer
import io.github.psd2live.core.RigBuildMath.normalizeX
import io.github.psd2live.core.RigBuildMath.normalizeY
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.pow
import org.umamo.runtime.model.BlendMode
import org.umamo.runtime.model.Drawable
import org.umamo.runtime.model.DrawableId
import org.umamo.runtime.model.DrawableMesh
import org.umamo.runtime.model.KeyformAxis
import org.umamo.runtime.model.KeyformGrid
import org.umamo.runtime.model.MeshDeltaForm

/** Generates mouth fill and lip forms from shared source boundary samples. */
internal object MouthRigGenerator {
	/**
	 * The mouth bitmap is authored fully open. ParamMouthOpenY=1 preserves it exactly; zero compresses
	 * the complete drawable to a seam (zero height when independent lips are enabled). Optional teeth and tongue are intentionally
	 * not morphed: the animated mouth drawable clips them and their opacity fades near the closed key.
	 */
	internal fun mouthWholeGrid(data: RigMeshData, parentFrame: Bounds, aperture: Bounds, config: PipelineConfig): KeyformGrid<MeshDeltaForm> =
		grid(
			mouthAxes(),
		) { values ->
			val delta = FloatArray(data.mesh.positions.size)
			for (index in data.rigPositions.indices step 2) {
				val sourceX = data.rigPositions[index]
				val sourceY = data.rigPositions[index + 1]
				val target = mouthWholePoint(sourceX, sourceY, aperture, values[0], values[1], config.mouthShape, config.mouthOutlineEnabled, config.mouthCurve)
				delta[index] = (target.first - sourceX) / parentFrame.width.coerceAtLeast(1e-4f)
				delta[index + 1] = (target.second - sourceY) / parentFrame.height.coerceAtLeast(1e-4f)
			}
			MeshDeltaForm(delta)
		}

    internal fun mouthBoundarySamples(data: RigMeshData): List<Triple<Float, Float, Float>> {
        val edges = mutableMapOf<Pair<Int, Int>, Int>()
        for (i in data.mesh.indices.indices step 3) {
            val t = data.mesh.indices
            for ((a, b) in listOf(t[i] to t[i+1], t[i+1] to t[i+2], t[i+2] to t[i])) {
                val edge = minOf(a,b) to maxOf(a,b)
                edges[edge] = (edges[edge] ?: 0) + 1
            }
        }
        val boundary = edges.filterValues { it == 1 }.keys
        val xs = data.rigPositions.indices.step(2).map { data.rigPositions[it] }.distinct().sorted()
        if (xs.size < 2) return emptyList()
        return xs.mapNotNull { x ->
            val ys = boundary.mapNotNull { (a,b) ->
                val ax = data.rigPositions[a*2]; val bx = data.rigPositions[b*2]
                if (x < minOf(ax,bx) || x > maxOf(ax,bx) || abs(ax-bx) < 0.00001f) null
                else data.rigPositions[a*2+1] + (data.rigPositions[b*2+1]-data.rigPositions[a*2+1]) * ((x-ax)/(bx-ax))
            }
            if (ys.isEmpty()) null else Triple(x, ys.min(), ys.max())
        }
    }

    // Shared columns guarantee that the fill and both lip ribbons interpolate identical curves.
    internal fun mouthContourMesh(data: RigMeshData, layer: ClassifiedLayer, frame: Bounds,
                                 space: HeadCoordinateSpace?, placement: AtlasPlacement, atlasSize: Int): RigMeshData {
        val samples = MouthContour.denseColumns(mouthBoundarySamples(data))
        if (samples.size < 2) return data
        val positions = FloatArray(samples.size * 6)
        val rig = FloatArray(positions.size)
        val uvs = FloatArray(positions.size)
        for ((i,p) in samples.withIndex()) for (row in 0..2) {
            val j = i*6+row*2
            val y = p.second+(p.third-p.second)*row/2f
            rig[j]=p.first; rig[j+1]=y
            positions[j]=normalizeX(p.first,frame); positions[j+1]=normalizeY(y,frame)
            val canvas = space?.toCanvas(p.first,y) ?: (p.first to y)
            uvs[j]=(placement.x+(canvas.first-layer.source.bounds.left)*placement.scale)/atlasSize
            uvs[j+1]=(placement.y+(canvas.second-layer.source.bounds.top)*placement.scale)/atlasSize
        }
        val indices = (0 until samples.lastIndex).flatMap { i -> (0..1).flatMap { row ->
            val a=i*3+row; listOf(a,a+1,a+3,a+1,a+4,a+3)
        }}.toIntArray()
        return RigMeshData(DrawableMesh(positions,uvs,indices),rig)
    }

    // Dense shared axes bound the error from interpolating normals between editable Cubism keyforms.
    internal fun mouthAxes(): List<KeyformAxis> = listOf(
        axis(StandardParameters.MOUTH_FORM, *FloatArray(9) { -1f + it / 4f }),
        axis(StandardParameters.MOUTH_OPEN, *FloatArray(33) { it / 32f }),
    )

    internal fun mouthOutline(
        owner: Drawable,
        data: RigMeshData,
        frame: Bounds,
        aperture: Bounds,
        config: PipelineConfig,
        side: Int,
        layer: ClassifiedLayer,
        placement: AtlasPlacement,
        atlasSize: Int,
    ): Drawable {
        val samples = mouthBoundarySamples(data)
        val path = MouthContour.crossedPath(samples, side)
        val overlap = MouthContour.overlapCount(samples.size)
        val joins = listOf(overlap, overlap + samples.lastIndex)
        val radius = config.mouthThickness.coerceIn(0.5f, 8f) * 0.5f
        fun normalized(points: FloatArray): FloatArray = FloatArray(points.size) { i ->
            if (i % 2 == 0) normalizeX(points[i], frame) else normalizeY(points[i], frame)
        }
        val positions = normalized(MouthStrokeMesh.positions(path, radius, joins))
        val texture = MouthStrokeMesh.texturePositions(path.size, joins)
        val uvs = FloatArray(texture.size) { i ->
            (texture[i] * placement.scale + if (i % 2 == 0) placement.x else placement.y) / atlasSize
        }
        val geometry = grid(mouthAxes()) { values ->
            val transformed = path.map { p ->
                mouthWholePoint(p.first, p.second, aperture, values[0], values[1], config.mouthShape, true, config.mouthCurve)
            }
            val target = normalized(MouthStrokeMesh.positions(transformed, radius, joins))
            MeshDeltaForm(FloatArray(positions.size) { target[it] - positions[it] })
        }
        return owner.copy(
            id = DrawableId(owner.id.raw + "_lip_" + side),
            name = layer.source.name,
            mesh = DrawableMesh(positions, uvs, MouthStrokeMesh.indices(path.size, joins)),
            geometryGrid = geometry,
            texturePage = placement.page,
            blendMode = BlendMode.Normal,
            isVisible = layerVisibility(config, layer.source.id.raw, layer.source.visible),
            drawOrder = config.drawOrderOverrides[layer.source.id.raw] ?: (owner.drawOrder + 1f).coerceAtMost(1000f),
        )
    }

	internal fun mouthWholePoint(
		sourceX: Float,
		sourceY: Float,
		aperture: Bounds,
		mouthForm: Float,
		mouthOpen: Float,
        shape: String = "smile",
        exactClose: Boolean = false,
        curve: MouthCurve = MouthCurve.preset("smile"),
	): Pair<Float, Float> {
		val open = mouthOpen.coerceIn(0f, 1f)
		val easedOpen = open * open * (3f - 2f * open)
		val form = mouthForm.coerceIn(-1f, 1f)
		val halfWidth = (aperture.width * 0.5f).coerceAtLeast(1e-4f)
		val normalizedX = ((sourceX - aperture.centerX) / halfWidth).coerceIn(-1.25f, 1.25f)
		val horizontalScale = 0.92f + easedOpen * 0.08f + form * 0.07f
		val targetX = aperture.centerX + (sourceX - aperture.centerX) * horizontalScale
		val seamY = aperture.top + aperture.height * 0.48f
		val closedScale = if (exactClose) 0f else (1.25f / aperture.height.coerceAtLeast(1f)).coerceIn(0.018f, 0.12f)
		val verticalScale = closedScale + easedOpen * (1f - closedScale)
		val cornerWeight = abs(normalizedX).toDouble().pow(1.55).toFloat().coerceAtMost(1.35f)
		val expressionY = -form * aperture.height * (0.018f + cornerWeight * 0.105f) * (0.72f + easedOpen * 0.28f)
        val effectiveCurve = if (shape == "custom") curve else MouthCurve.preset(shape)
        val presetY = effectiveCurve.yAt((normalizedX + 1f) * 0.5f) * aperture.height * (1f - easedOpen)
        val targetY = seamY + (sourceY - seamY) * verticalScale + expressionY + presetY
		return targetX to targetY
	}

	internal fun mouthApertureFor(layer: ClassifiedLayer): Bounds? {
		if (layer.semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN)) return layer.bounds
		return null
	}

	/** Places explicitly named mouth internals directly above their nearest mouth, independent of PSD order. */
	internal fun orderMouthLayers(layers: List<ClassifiedLayer>): List<ClassifiedLayer> {
		val mouths = layers.filter { it.semantic.tag in setOf(SemanticTag.MOUTH, SemanticTag.MOUTH_OPEN) }
		if (mouths.isEmpty()) return layers
		val assigned = linkedMapOf<String, MutableList<ClassifiedLayer>>()
		val assignedInternalIds = mutableSetOf<String>()
		for (internal in layers.filter { it.semantic.tag in CharacterAnalyzer.MOUTH_COMPONENT_TAGS }) {
			val exact = mouths.filter { mouth ->
				mouth.semantic.side == internal.semantic.side && mouth.semantic.variant == internal.semantic.variant
			}
			val sameSide = mouths.filter { it.semantic.side == internal.semantic.side }
			val fallback = mouths.filter { it.semantic.side == Side.NONE }
			val mouth = nearestLayer(internal, exact.ifEmpty { sameSide.ifEmpty { fallback.ifEmpty { mouths } } }) ?: continue
			assigned.getOrPut(mouth.source.id.raw) { mutableListOf() } += internal
			assignedInternalIds += internal.source.id.raw
		}
		return buildList {
			for (layer in layers) {
				if (layer.source.id.raw in assignedInternalIds) continue
				assigned[layer.source.id.raw]
					.orEmpty()
					.sortedWith(compareBy<ClassifiedLayer> { mouthInternalPriority(it.semantic.tag) }.thenBy { it.source.order })
					.forEach(::add)
				add(layer)
			}
		}
	}

	internal fun mouthInternalPriority(tag: SemanticTag): Int = when (tag) {
		SemanticTag.TOOTH_T, SemanticTag.TOOTH_B -> 0
		SemanticTag.TONGUE -> 1
		else -> 2
	}

}
