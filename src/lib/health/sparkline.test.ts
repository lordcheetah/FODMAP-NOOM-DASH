import { describe, it, expect } from 'vitest'
import { sparklinePoints, sparklinePolyline } from './sparkline'

describe('sparklinePoints', () => {
  it('returns [] for empty input', () => {
    expect(sparklinePoints([], 100, 40)).toEqual([])
  })

  it('centers a single point', () => {
    expect(sparklinePoints([5], 100, 40, 2)).toEqual([{ x: 50, y: 20 }])
  })

  it('spans the width and inverts y (higher value = smaller y)', () => {
    const pts = sparklinePoints([0, 10], 100, 40, 2)
    expect(pts[0].x).toBeCloseTo(2, 5) // first at left inset
    expect(pts[1].x).toBeCloseTo(98, 5) // last at right inset
    expect(pts[0].y).toBeGreaterThan(pts[1].y) // 0 (low) sits lower than 10 (high)
  })

  it('centers a flat series vertically', () => {
    const pts = sparklinePoints([7, 7, 7], 100, 40, 2)
    for (const p of pts) expect(p.y).toBeCloseTo(20, 5)
  })

  it('spaces points evenly by index', () => {
    const pts = sparklinePoints([1, 2, 3, 4, 5], 100, 40, 0)
    const dxs = pts.slice(1).map((p, i) => p.x - pts[i].x)
    for (const dx of dxs) expect(dx).toBeCloseTo(25, 5)
  })
})

describe('sparklinePolyline', () => {
  it('formats points as an SVG points string', () => {
    expect(sparklinePolyline([0, 10], 100, 40, 2)).toBe('2.0,38.0 98.0,2.0')
  })
})
