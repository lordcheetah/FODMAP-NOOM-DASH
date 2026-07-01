import { describe, it, expect } from 'vitest'
import {
  bmi,
  bmiCategory,
  lbToKg,
  kgToLb,
  ftInToCm,
  cmToFtIn,
} from './bmi'

describe('unit conversions', () => {
  it('lb <-> kg round-trip', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3)
    expect(kgToLb(100)).toBeCloseTo(220.462, 2)
    expect(kgToLb(lbToKg(150))).toBeCloseTo(150, 6)
  })

  it('ft/in -> cm and back', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 1)
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 2)
    const { ft, inch } = cmToFtIn(177.8)
    expect(ft).toBe(5)
    expect(inch).toBeCloseTo(10, 1)
  })
})

describe('bmi', () => {
  it('computes kg/m^2', () => {
    // 70 kg, 175 cm -> 22.857
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3)
    // 100 kg, 200 cm -> 25
    expect(bmi(100, 200)).toBe(25)
  })

  it('returns null for missing / non-positive / non-finite inputs', () => {
    expect(bmi(null, 175)).toBeNull()
    expect(bmi(70, null)).toBeNull()
    expect(bmi(0, 175)).toBeNull()
    expect(bmi(70, 0)).toBeNull()
    expect(bmi(-70, 175)).toBeNull()
    expect(bmi(NaN, 175)).toBeNull()
    expect(bmi(70, Infinity)).toBeNull()
  })
})

describe('bmiCategory', () => {
  it.each([
    [17, 'underweight'],
    [18.4, 'underweight'],
    [18.5, 'normal'],
    [24.9, 'normal'],
    [25, 'overweight'],
    [29.9, 'overweight'],
    [30, 'obese'],
    [40, 'obese'],
  ] as const)('BMI %s -> %s', (b, cat) => {
    expect(bmiCategory(b)).toBe(cat)
  })

  it('null for invalid BMI', () => {
    expect(bmiCategory(null)).toBeNull()
    expect(bmiCategory(0)).toBeNull()
    expect(bmiCategory(NaN)).toBeNull()
  })
})
