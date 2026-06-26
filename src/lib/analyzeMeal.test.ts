import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the supabase singleton so analyzeMeal's auth/session path is controllable.
const getSession = vi.fn()
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: () => getSession() } },
}))

import {
  analyzeMeal,
  analyzedItemToPrefill,
  parseAnalyzeResponse,
  targetDimensions,
  type AnalyzedItem,
} from './analyzeMeal'

describe('targetDimensions (pure downscale math)', () => {
  it('landscape over the cap scales the long edge to maxEdge', () => {
    expect(targetDimensions(4000, 3000)).toEqual({ w: 1568, h: 1176 })
  })

  it('portrait over the cap scales the long edge to maxEdge', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ w: 1176, h: 1568 })
  })

  it('square over the cap scales to maxEdge × maxEdge', () => {
    expect(targetDimensions(2000, 2000)).toEqual({ w: 1568, h: 1568 })
  })

  it('already-small image is returned unchanged (never upscales)', () => {
    expect(targetDimensions(800, 600)).toEqual({ w: 800, h: 600 })
  })

  it('exact-edge image is returned unchanged', () => {
    expect(targetDimensions(1568, 1000)).toEqual({ w: 1568, h: 1000 })
  })

  it('respects a custom maxEdge', () => {
    expect(targetDimensions(2000, 1000, 1000)).toEqual({ w: 1000, h: 500 })
  })

  it('guards non-finite / non-positive input with a safe 1×1', () => {
    expect(targetDimensions(0, 100)).toEqual({ w: 1, h: 1 })
    expect(targetDimensions(NaN, 100)).toEqual({ w: 1, h: 1 })
    expect(targetDimensions(-10, 10)).toEqual({ w: 1, h: 1 })
    expect(targetDimensions(100, Infinity)).toEqual({ w: 1, h: 1 })
  })
})

describe('parseAnalyzeResponse', () => {
  const valid: AnalyzedItem = {
    name: 'Apple',
    quantity_desc: '1 medium',
    estimated_grams: 180,
    estimated_calories: 95,
    confidence: 'high',
  }

  it('parses a valid items array', () => {
    expect(parseAnalyzeResponse({ items: [valid] })).toEqual([valid])
  })

  it('allows null grams/calories', () => {
    const item = { ...valid, estimated_grams: null, estimated_calories: null }
    expect(parseAnalyzeResponse({ items: [item] })).toEqual([item])
  })

  it('returns [] for an empty items array', () => {
    expect(parseAnalyzeResponse({ items: [] })).toEqual([])
  })

  it('drops malformed items (bad confidence, missing name, bad number)', () => {
    const body = {
      items: [
        valid,
        { ...valid, confidence: 'maybe' }, // bad enum
        { ...valid, name: '' }, // empty name
        { ...valid, estimated_grams: 'lots' }, // non-number
        { quantity_desc: '1 cup' }, // missing fields
      ],
    }
    expect(parseAnalyzeResponse(body)).toEqual([valid])
  })

  it('returns [] for non-object / missing items', () => {
    expect(parseAnalyzeResponse(null)).toEqual([])
    expect(parseAnalyzeResponse({})).toEqual([])
    expect(parseAnalyzeResponse({ items: 'nope' })).toEqual([])
  })
})

describe('analyzedItemToPrefill', () => {
  it('maps an item to an unknown-FODMAP custom prefill', () => {
    const prefill = analyzedItemToPrefill({
      name: 'Toast',
      quantity_desc: '2 slices',
      estimated_grams: 60,
      estimated_calories: 150,
      confidence: 'medium',
    })
    expect(prefill.name).toBe('Toast')
    expect(prefill.serving_desc).toBe('2 slices')
    expect(prefill.serving_grams).toBe(60)
    expect(prefill.calories).toBe(150)
    // HEALTH-SAFETY: never anything but unknown.
    expect(prefill.fructose_level).toBe('unknown')
    expect(prefill.fructans_level).toBe('unknown')
  })

  it('falls back to "1 serving" when quantity_desc is empty', () => {
    const prefill = analyzedItemToPrefill({
      name: 'Mystery',
      quantity_desc: '',
      estimated_grams: null,
      estimated_calories: null,
      confidence: 'low',
    })
    expect(prefill.serving_desc).toBe('1 serving')
  })
})

describe('analyzeMeal (network)', () => {
  const fetchMock = vi.fn()
  const item: AnalyzedItem = {
    name: 'Salad',
    quantity_desc: '1 bowl',
    estimated_grams: 200,
    estimated_calories: 120,
    confidence: 'medium',
  }
  const file = new Blob(['x'], { type: 'image/jpeg' })
  const realCreateElement = document.createElement

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    getSession.mockReset()
    getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-123' } },
    })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co')

    // jsdom has no canvas/Image decode — stub the DOM pieces the downscale uses
    // so these tests stay focused on the network contract.
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: () => {},
    })
    class StubImage {
      naturalWidth = 800
      naturalHeight = 600
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        // Resolve async like a real decode.
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('Image', StubImage)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toDataURL: () => 'data:image/jpeg;base64,AAAA',
        } as unknown as HTMLCanvasElement
      }
      return realCreateElement.call(document, tag)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns typed items on a 200 with items', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [item] }),
    })
    await expect(analyzeMeal(file)).resolves.toEqual([item])
  })

  it('returns [] on {items: []}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    })
    await expect(analyzeMeal(file)).resolves.toEqual([])
  })

  it('throws a mapped error on 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await expect(analyzeMeal(file)).rejects.toThrow(/session expired/i)
  })

  it('throws a mapped error on 502', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
    await expect(analyzeMeal(file)).rejects.toThrow(/analyze/i)
  })

  it('throws on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    await expect(analyzeMeal(file)).rejects.toThrow(/connection/i)
  })

  it('throws when signed out (no session)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(analyzeMeal(file)).rejects.toThrow(/sign in/i)
  })
})
