package io.github.psd2live.core

import io.github.psd2live.core.RigBuildMath.ninePoseAxes
import io.github.psd2live.core.RigBuildIds.headWarpId
import io.github.psd2live.core.RigBuildMath.axis
import io.github.psd2live.core.RigBuildMath.grid
import io.github.psd2live.core.RigBuildMath.mapBounds
import io.github.psd2live.core.RigBuildMath.warpGrid
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import org.umamo.runtime.model.Deformer
import org.umamo.runtime.model.DeformerId
import org.umamo.runtime.model.ParameterId
import org.umamo.runtime.model.PartId

/** Generates separate head-follow and physics-output hair lattices. */
internal object HairRigGenerator {
	internal fun hairFollowPoint(
		inHead: Bounds,
		u: Float,
		v: Float,
		angleX: Float,
		angleY: Float,
		yawParallax: Float,
		pitchParallax: Float,
		yawPerspective: Float = 0f,
	): Pair<Float, Float> {
		val yaw = angleX / 45f
		val pitch = angleY / 30f
		val yawDepthWeight = 0.62f + v * 0.38f
		// Both endpoints receive the same vertical offset. The middle retains a depth bulge without
		// turning signed pitch into a global height scale.
		val pitchDepthWeight = 0.78f + sin(PI * v).toFloat().coerceAtLeast(0f) * 0.22f
		val uPerspective = u + yaw * yawPerspective * 4f * u * (1f - u)
		return (inHead.left + uPerspective * inHead.width + yaw * yawParallax * yawDepthWeight) to
			(inHead.top + v * inHead.height + pitch * pitchParallax * pitchDepthWeight)
	}

	internal fun hairPhysicsPoint(
		u: Float,
		v: Float,
		swing: Float,
		normalizedSway: Float,
		normalizedCurl: Float,
	): Pair<Float, Float> {
		val tipWeight = v * v * v
		val lateral = swing * normalizedSway * tipWeight
		// A left/right pendulum has the same shortening in either direction. Squaring also keeps the
		// neutral derivative continuous, unlike abs(swing).
		val lift = swing * swing * normalizedCurl * tipWeight
		return (u + lateral) to (v - lift)
	}

	/** Head-angle following for one hair depth plane; deliberately independent of the face warp. */
	internal fun hairFollowWarp(
		id: DeformerId,
		name: String,
		frame: Bounds,
		head: Bounds,
		part: PartId,
		yawParallax: Float,
		pitchParallax: Float,
		yawPerspective: Float = 0f,
	): Deformer.Warp {
		val inHead = mapBounds(frame, head)
		val grid = warpGrid(
			ninePoseAxes(),
			3,
			4,
		) { u, v, values ->
			hairFollowPoint(inHead, u, v, values[0], values[1], yawParallax, pitchParallax, yawPerspective)
		}
		return Deformer.Warp(id, name, headWarpId, part, 4, 3, true, grid)
	}

	/**
	 * StretchyStudio/Hiyori-style hair-tip warp.  The root row is pinned exactly; cubic falloff
	 * keeps the upper mass stable and concentrates the physics response at the tips.  Magnitude is
	 * based on min(width,height), preventing a short, wide fringe from floating as one skull chunk.
	 */
	internal fun hairPhysicsWarp(
		id: DeformerId,
		name: String,
		parameter: ParameterId,
		parent: DeformerId,
		frame: Bounds,
		part: PartId,
		rows: Int,
		swayRatio: Float,
		curlRatio: Float,
	): Deformer.Warp {
		val scale = minOf(frame.width, frame.height).coerceAtLeast(1f)
		val normalizedSway = scale / frame.width.coerceAtLeast(1f) * swayRatio
		val normalizedCurl = scale / frame.height.coerceAtLeast(1f) * curlRatio
		val grid = warpGrid(listOf(axis(parameter, -1f, 0f, 1f)), columns = 3, rows = rows) { u, v, values ->
			hairPhysicsPoint(u, v, values[0], normalizedSway, normalizedCurl)
		}
		return Deformer.Warp(id, name, parent, part, rows, 3, true, grid)
	}

}
