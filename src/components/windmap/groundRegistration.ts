import type { ZoomTransform } from 'd3-zoom';

/**
 * Ground registration for pre-baked canvases.
 *
 * Every overlay on this map is rasterised against one zoom transform and then
 * composited under a possibly newer one, because the rebuilds are throttled.
 * Drawing the stale raster at 1:1 would let it slide out of register with the
 * basemap during a pan or pinch.
 *
 * The correction is a pure affine map. Both transforms share the same projected
 * coordinate space, so a projected point p lands at `k_b * p + t_b` in the baked
 * canvas and at `k_c * p + t_c` on screen now. Eliminating p gives
 *
 *     screen_now = (k_c / k_b) * baked + (t_c - (k_c / k_b) * t_b)
 *
 * i.e. scale by `k_c / k_b`, then translate by the residual. Applying it pins
 * the stale raster to the ground it was computed for: it goes soft during the
 * gesture, then sharpens when the throttled rebuild lands.
 *
 * This lived in three independent copies (particleRenderer, thermalRenderer,
 * cumulusField). The maths was identical in all three and only the cosmetics
 * differed, so the copies are now options on this one function — three places
 * to get the algebra wrong became one.
 */
export interface RegisteredDrawOptions {
  /** Constant alpha for the composite. Omit to leave ctx.globalAlpha alone. */
  alpha?: number;
  /** Gaussian blur radius in px, e.g. 5 for the thermal heat ramp. Omit for none. */
  blurPx?: number;
  /**
   * Whether to force high-quality image smoothing. Omit to inherit the context's
   * current setting — the cumulus glyphs deliberately do not opt in, since the
   * stipple must stay crisp.
   */
  smoothing?: boolean;
  /** Destination size. Omit to draw the source at its natural pixel size. */
  width?: number;
  height?: number;
}

/**
 * Composites `source` onto `ctx`, re-registered from the transform it was baked
 * against to the one in force now.
 *
 * Returns false without drawing when `built` is null — nothing has been
 * rasterised yet, and drawing unregistered garbage is worse than drawing
 * nothing.
 */
export function drawRegistered(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  built: ZoomTransform | null,
  current: ZoomTransform,
  opts: RegisteredDrawOptions = {},
): boolean {
  if (!built) return false;

  const s = current.k / built.k;
  const dx = current.x - s * built.x;
  const dy = current.y - s * built.y;

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.smoothing) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  if (opts.blurPx !== undefined) ctx.filter = `blur(${opts.blurPx}px)`;
  ctx.translate(dx, dy);
  ctx.scale(s, s);
  if (opts.width !== undefined && opts.height !== undefined) {
    ctx.drawImage(source, 0, 0, opts.width, opts.height);
  } else {
    ctx.drawImage(source, 0, 0);
  }
  ctx.restore();
  return true;
}
