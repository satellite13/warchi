import { describe, it, expect } from 'vitest'
import { ref } from 'vue'

import { useCanShare } from './useCanShare'
import type { AccessPermission } from '../types/entities'

describe('useCanShare', () => {
  describe('canShare computed', () => {
    it('returns true for OWNER permission', () => {
      const entity = ref({ accessPermission: 'OWNER' as AccessPermission })
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(true)
    })

    it('returns true for ADMIN permission', () => {
      const entity = ref({ accessPermission: 'ADMIN' as AccessPermission })
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(true)
    })

    it('returns false for EDIT permission', () => {
      const entity = ref({ accessPermission: 'EDIT' as AccessPermission })
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('returns false for VIEW permission', () => {
      const entity = ref({ accessPermission: 'VIEW' as AccessPermission })
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('returns false when accessPermission is null', () => {
      const entity = ref({ accessPermission: null })
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('returns false when accessPermission is undefined', () => {
      const entity = ref({})
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('returns false when entity ref is null', () => {
      const entity = ref(null)
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('returns false when entity ref is undefined', () => {
      const entity = ref(undefined)
      const { canShare } = useCanShare(entity)
      expect(canShare.value).toBe(false)
    })

    it('reacts to permission changes', () => {
      const entity = ref({ accessPermission: 'VIEW' as AccessPermission })
      const { canShare } = useCanShare(entity)

      expect(canShare.value).toBe(false)

      entity.value!.accessPermission = 'OWNER'
      expect(canShare.value).toBe(true)

      entity.value!.accessPermission = 'EDIT'
      expect(canShare.value).toBe(false)
    })

    it('reacts to entity becoming null', () => {
      const entity = ref({ accessPermission: 'OWNER' as AccessPermission })
      const { canShare } = useCanShare(entity)

      expect(canShare.value).toBe(true)

      entity.value = null as unknown as { accessPermission: AccessPermission }
      expect(canShare.value).toBe(false)
    })

    it('reacts to entity becoming defined from null', () => {
      const entity = ref<{ accessPermission?: AccessPermission | null } | null | undefined>(null)
      const { canShare } = useCanShare(entity)

      expect(canShare.value).toBe(false)

      entity.value = { accessPermission: 'ADMIN' }
      expect(canShare.value).toBe(true)
    })
  })

  describe('requiredGrant option', () => {
    it('returns false with OWNER permission when grant is missing', () => {
      const entity = ref({ accessPermission: 'OWNER' as AccessPermission })
      const { canShare } = useCanShare(entity, { requiredGrant: () => false })

      expect(canShare.value).toBe(false)
    })

    it('returns true with OWNER permission when grant is present', () => {
      const entity = ref({ accessPermission: 'OWNER' as AccessPermission })
      const { canShare } = useCanShare(entity, { requiredGrant: () => true })

      expect(canShare.value).toBe(true)
    })

    it('returns false with ADMIN permission when grant is missing', () => {
      const entity = ref({ accessPermission: 'ADMIN' as AccessPermission })
      const { canShare } = useCanShare(entity, { requiredGrant: () => false })

      expect(canShare.value).toBe(false)
    })

    it('returns false with EDIT permission even when grant is present', () => {
      const entity = ref({ accessPermission: 'EDIT' as AccessPermission })
      const { canShare } = useCanShare(entity, { requiredGrant: () => true })

      expect(canShare.value).toBe(false)
    })

    it('keeps permission-only behavior when option is omitted', () => {
      const entity = ref({ accessPermission: 'OWNER' as AccessPermission })
      const { canShare } = useCanShare(entity)

      expect(canShare.value).toBe(true)
    })
  })
})
