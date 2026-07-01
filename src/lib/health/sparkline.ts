/** Pure SVG sparkline geometry — maps a value series to points in a viewbox. */

export interface SparkPoint {
  x: number
  y: number
}

/**
 * Map `values` (in series order, left→right) to points inside a `width`×`height`
 * box with `pad` inset. Higher values sit higher (smaller y). A flat series is
 * centered vertically; a single point is centered; empty → [].
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): SparkPoint[] {
  const n = values.length
  if (n === 0) return []
  const innerW = Math.max(0, width - pad * 2)
  const innerH = Math.max(0, height - pad * 2)
  if (n === 1) return [{ x: pad + innerW / 2, y: pad + innerH / 2 }]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  return values.map((v, i) => ({
    x: pad + (i / (n - 1)) * innerW,
    y:
      range === 0
        ? pad + innerH / 2
        : pad + (1 - (v - min) / range) * innerH,
  }))
}

/** `sparklinePoints` as an SVG `points` string ("x,y x,y …"). */
export function sparklinePolyline(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): string {
  return sparklinePoints(values, width, height, pad)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}
