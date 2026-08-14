import { describe, expect, it } from 'vitest'
import { shouldOpenModelPackageImport } from './modelPackageImportQuery'

describe('shouldOpenModelPackageImport', () => {
  it('is true for import=package', () => {
    expect(shouldOpenModelPackageImport({ import: 'package' })).toBe(true)
  })

  it('is false without import query', () => {
    expect(shouldOpenModelPackageImport({})).toBe(false)
  })

  it('is false for other import values', () => {
    expect(shouldOpenModelPackageImport({ import: 'notation' })).toBe(false)
  })
})
