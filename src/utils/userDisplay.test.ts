import { describe, it, expect } from 'vitest'
import { getUserDisplayName, getDisplayInitials } from '@/utils/userDisplay'

describe('getUserDisplayName', () => {
  it('returns fallback for null user', () => {
    expect(getUserDisplayName(null)).toBe('?')
  })

  it('returns fallback for undefined user', () => {
    expect(getUserDisplayName(undefined)).toBe('?')
  })

  it('returns custom fallback when provided', () => {
    expect(getUserDisplayName(null, 'N/A')).toBe('N/A')
  })

  it('returns full name when both first and last name present', () => {
    expect(getUserDisplayName({ firstName: 'John', lastName: 'Doe' })).toBe('John Doe')
  })

  it('returns first name only when last name is missing', () => {
    expect(getUserDisplayName({ firstName: 'John' })).toBe('John')
  })

  it('returns last name only when first name is missing', () => {
    expect(getUserDisplayName({ lastName: 'Doe' })).toBe('Doe')
  })

  it('trims whitespace from names', () => {
    expect(getUserDisplayName({ firstName: '  John  ', lastName: '  Doe  ' })).toBe('John Doe')
  })

  it('falls back to email when names are empty strings', () => {
    expect(getUserDisplayName({ firstName: '', lastName: '', email: 'john@example.com' })).toBe(
      'john@example.com',
    )
  })

  it('falls back to email when names are whitespace only', () => {
    expect(getUserDisplayName({ firstName: '   ', lastName: '   ', email: 'john@example.com' })).toBe(
      'john@example.com',
    )
  })

  it('falls back to email when names are null', () => {
    expect(
      getUserDisplayName({ firstName: null, lastName: null, email: 'john@example.com' }),
    ).toBe('john@example.com')
  })

  it('returns fallback when all fields are null', () => {
    expect(getUserDisplayName({ firstName: null, lastName: null, email: null })).toBe('?')
  })

  it('returns fallback when all fields are empty', () => {
    expect(getUserDisplayName({ firstName: '', lastName: '', email: '' })).toBe('?')
  })

  it('returns fallback when email is whitespace only and names missing', () => {
    expect(getUserDisplayName({ email: '   ' })).toBe('?')
  })

  it('prefers full name over email', () => {
    expect(
      getUserDisplayName({ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }),
    ).toBe('John Doe')
  })
})

describe('getDisplayInitials', () => {
  it('returns "?" for null input', () => {
    expect(getDisplayInitials(null)).toBe('?')
  })

  it('returns "?" for undefined input', () => {
    expect(getDisplayInitials(undefined)).toBe('?')
  })

  it('returns "?" for empty string', () => {
    expect(getDisplayInitials('')).toBe('?')
  })

  it('returns "?" for whitespace only', () => {
    expect(getDisplayInitials('   ')).toBe('?')
  })

  // Multi-word names
  it('returns initials from two-word name', () => {
    expect(getDisplayInitials('John Doe')).toBe('JD')
  })

  it('returns first two word initials from multi-word name', () => {
    expect(getDisplayInitials('John Michael Doe')).toBe('JM')
  })

  it('uppercases initials', () => {
    expect(getDisplayInitials('john doe')).toBe('JD')
  })

  // Single word
  it('returns first two chars for single word', () => {
    expect(getDisplayInitials('John')).toBe('JO')
  })

  it('returns single char uppercased when word is one char', () => {
    expect(getDisplayInitials('J')).toBe('J')
  })

  // Email addresses
  it('returns initials from email with dot separator', () => {
    expect(getDisplayInitials('john.doe@example.com')).toBe('JD')
  })

  it('returns initials from email with underscore separator', () => {
    expect(getDisplayInitials('john_doe@example.com')).toBe('JD')
  })

  it('returns initials from email with hyphen separator', () => {
    expect(getDisplayInitials('john-doe@example.com')).toBe('JD')
  })

  it('returns first two chars of local part for simple email', () => {
    expect(getDisplayInitials('johndoe@example.com')).toBe('JO')
  })

  it('returns first two chars for single-char-local email', () => {
    expect(getDisplayInitials('j@example.com')).toBe('J')
  })

  // Trimming
  it('trims input before processing', () => {
    expect(getDisplayInitials('  John Doe  ')).toBe('JD')
  })
})
