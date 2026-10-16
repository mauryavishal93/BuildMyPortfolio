export function zoomFromPinch(startZoom, startDistance, currentDistance, minZoom = 0.45, maxZoom = 1.5) {
  if (![startZoom, startDistance, currentDistance, minZoom, maxZoom].every(Number.isFinite) || startDistance <= 0) {
    return Math.min(maxZoom, Math.max(minZoom, Number.isFinite(startZoom) ? startZoom : 1));
  }
  return Math.min(maxZoom, Math.max(minZoom, startZoom * currentDistance / startDistance));
}
