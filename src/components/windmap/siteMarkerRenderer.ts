import type { SiteMarker } from '../windMapTypes';
import type { GeoProjection } from 'd3-geo';
import type { ZoomTransform } from 'd3-zoom';

export function drawSiteMarkers(
  ctx: CanvasRenderingContext2D,
  markers: SiteMarker[],
  currentTransform: ZoomTransform,
  projection: GeoProjection,
) {
  const labelFont = '600 10px system-ui, sans-serif';
  ctx.font = labelFont;
  const placedLabels: { x: number; y: number; w: number; h: number }[] = [];
  const labelPad = 2;
  const labelHeight = 10;

  const markerScreenPositions: { site: SiteMarker; sp: [number, number] }[] = [];
  for (const site of markers) {
    const proj = projection([site.lon, site.lat]);
    if (!proj) continue;
    markerScreenPositions.push({ site, sp: currentTransform.apply(proj) });
  }

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  for (const { site, sp } of markerScreenPositions) {
    const r = 6;
    ctx.beginPath();
    ctx.arc(sp[0], sp[1], r, 0, 2 * Math.PI);
    const isClosedToday = site.status === 'closed' || (site.upcomingClosureDates?.includes(todayStr) ?? false);
    ctx.fillStyle = isClosedToday ? '#ef4444'
      : site.status === 'restricted' ? '#f59e0b'
      : site.isSkyHighSite === 'true' ? '#22c55e'
      : '#0ea5e9';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const { site, sp } of markerScreenPositions) {
    const r = 6;
    const label = site.name.toUpperCase();
    const textWidth = ctx.measureText(label).width;
    const lx = sp[0] + r + 3;
    const ly = sp[1] - labelHeight / 2;
    const lw = textWidth + labelPad;
    const lh = labelHeight + labelPad;

    let overlaps = false;
    for (const placed of placedLabels) {
      if (lx < placed.x + placed.w && lx + lw > placed.x &&
          ly < placed.y + placed.h && ly + lh > placed.y) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      ctx.font = labelFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'white';
      ctx.fillText(label, lx, sp[1]);
      placedLabels.push({ x: lx, y: ly, w: lw, h: lh });
    }
  }
}

export function drawSingleSiteMarker(
  ctx: CanvasRenderingContext2D,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  siteLon: number,
  siteLat: number,
  siteName?: string,
) {
  const proj = projection([siteLon, siteLat]);
  if (!proj) return;
  const siteScreen = currentTransform.apply(proj);
  const r = 5;
  ctx.beginPath();
  ctx.arc(siteScreen[0], siteScreen[1], r, 0, 2 * Math.PI);
  ctx.fillStyle = '#0ea5e9';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (siteName) {
    const label = siteName.toUpperCase();
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(label, siteScreen[0] + r + 3, siteScreen[1]);
  }
}
