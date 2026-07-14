import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import { validateCompositeDiagramStyle } from './validationIssues'

describe('validationIssues composite diagram style validation', () => {
  it('validates missing name role and broken A5 target', () => {
    const issues = validateCompositeDiagramStyle(
      {
        nodeShape: 'composite',
        compositeContent: {
          type: 'container',
          children: [{ type: 'shape', id: 'box' }],
        },
        stylePropertyBindings: [
          {
            valueSource: 'component',
            propertyName: 'status',
            branches: [
              {
                when: { op: 'equals', value: 'new' },
                patches: [{ targetId: 'missing-id', patch: { backgroundColor: '#f00' } }],
              },
            ],
          },
        ],
      },
      ((key: string) => key) as ComposerTranslation,
    )

    expect(issues.some((i) => i.code === 'COMPOSITE_NAME_ROLE_MISSING')).toBe(true)
    expect(issues.some((i) => i.code === 'A5_TARGET_NOT_FOUND')).toBe(true)
  })
})
